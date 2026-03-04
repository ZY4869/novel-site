import { state } from './state.js';

const LONG_PRESS_MS = 520;
const CLICK_SUPPRESS_MS = 650;
const MAX_CATEGORIES = 200;

let enabled = false;
let overlayEl = null;
let menuEl = null;
let categoriesCache = null;

let longPressTimer = null;
let suppressClicksUntil = 0;

export async function initShelfCategoryQuickMove() {
  const me = await fetchMe();
  if (!me) return;
  enabled = true;

  ensureMenu();

  document.addEventListener('contextmenu', onContextMenu, true);
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerUp, true);
  document.addEventListener('click', onClickCapture, true);
}

async function fetchMe() {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function findBookCard(target) {
  const el = target?.closest?.('a.book-card-cover[data-book-id]');
  if (!el) return null;
  const id = Number(el.dataset.bookId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { el, bookId: id };
}

function onContextMenu(e) {
  if (!enabled) return;
  const info = findBookCard(e.target);
  if (!info) return;

  e.preventDefault();
  e.stopPropagation();
  openMenu(info.bookId, { x: e.clientX, y: e.clientY });
}

function onPointerDown(e) {
  if (!enabled) return;
  if (e.pointerType !== 'touch') return;
  const info = findBookCard(e.target);
  if (!info) return;

  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    suppressClicksUntil = Date.now() + CLICK_SUPPRESS_MS;
    const rect = info.el.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + Math.min(rect.height, 90));
    openMenu(info.bookId, { x, y });
  }, LONG_PRESS_MS);
}

function onPointerUp() {
  clearTimeout(longPressTimer);
  longPressTimer = null;
}

function onClickCapture(e) {
  if (!enabled) return;
  if (Date.now() >= suppressClicksUntil) return;
  const info = findBookCard(e.target);
  if (!info) return;
  e.preventDefault();
  e.stopPropagation();
}

function ensureMenu() {
  if (overlayEl) return;

  overlayEl = document.createElement('div');
  overlayEl.id = 'shelf-category-ctx-overlay';
  overlayEl.className = 'shelf-ctx-overlay';
  overlayEl.innerHTML = `
    <div class="shelf-ctx-menu" id="shelf-category-ctx-menu" role="dialog" aria-modal="true">
      <div class="shelf-ctx-title" id="shelf-category-ctx-title"></div>
      <div class="shelf-ctx-list" id="shelf-category-ctx-list"></div>
      <div class="shelf-ctx-actions">
        <button class="btn btn-sm" id="shelf-category-ctx-cancel" type="button">取消</button>
        <button class="btn btn-sm" id="shelf-category-ctx-save" type="button">保存</button>
      </div>
      <div class="shelf-ctx-hint" id="shelf-category-ctx-hint"></div>
    </div>
  `;
  document.body.appendChild(overlayEl);

  menuEl = overlayEl.querySelector('#shelf-category-ctx-menu');

  overlayEl.addEventListener('pointerdown', (e) => {
    if (e.target === overlayEl) closeMenu();
  });
  overlayEl.querySelector('#shelf-category-ctx-cancel')?.addEventListener('click', () => closeMenu());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

function closeMenu() {
  overlayEl?.classList.remove('active');
}

function setHint(text, type = '') {
  const el = overlayEl?.querySelector?.('#shelf-category-ctx-hint');
  if (!el) return;
  el.textContent = text || '';
  el.dataset.type = type || '';
}

async function openMenu(bookId, { x, y }) {
  ensureMenu();
  const book = (state.allBooks || []).find((b) => Number(b?.id) === Number(bookId));
  if (!book) return;

  const titleEl = overlayEl.querySelector('#shelf-category-ctx-title');
  if (titleEl) titleEl.textContent = `移动分类：${String(book.title || '').trim() || `#${bookId}`}`;

  setHint('加载分类中...');
  const categories = await loadAllCategories().catch(() => []);

  const selected = new Set((book.categories || []).map((c) => Number(c?.id)).filter((n) => Number.isFinite(n) && n > 0));
  renderCategoryCheckboxes(categories, selected);
  setHint(categories.length ? '右键/长按书籍卡片可快速调整分类' : '暂无分类，请先去后台创建分类', categories.length ? '' : 'warn');

  overlayEl.classList.add('active');
  positionMenu(x, y);

  const saveBtn = overlayEl.querySelector('#shelf-category-ctx-save');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      try {
        saveBtn.disabled = true;
        setHint('保存中...');
        const ids = getSelectedCategoryIds();
        await saveBookCategories(bookId, ids, categories);
        await refreshPublicCategories();
        window.dispatchEvent(new CustomEvent('index:books-changed'));
        closeMenu();
      } catch (e) {
        setHint(e.message || '保存失败', 'error');
      } finally {
        saveBtn.disabled = false;
      }
    };
  }
}

function positionMenu(x, y) {
  if (!menuEl) return;
  const pad = 10;
  const vw = window.innerWidth || 1000;
  const vh = window.innerHeight || 800;

  menuEl.style.left = '0px';
  menuEl.style.top = '0px';
  menuEl.style.maxHeight = Math.max(220, Math.floor(vh * 0.7)) + 'px';

  const rect = menuEl.getBoundingClientRect();
  const left = Math.min(Math.max(pad, x), vw - rect.width - pad);
  const top = Math.min(Math.max(pad, y), vh - rect.height - pad);
  menuEl.style.left = `${Math.round(left)}px`;
  menuEl.style.top = `${Math.round(top)}px`;
}

async function loadAllCategories() {
  if (categoriesCache) return categoriesCache;
  const res = await fetch('/api/admin/categories', { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || '加载分类失败');

  const all = Array.isArray(data.categories) ? data.categories : [];
  categoriesCache = all
    .filter((c) => c && Number(c.id) > 0)
    .slice(0, MAX_CATEGORIES)
    .map((c) => ({
      id: Number(c.id),
      name: String(c.name || '').trim(),
      is_special: c.is_special ? 1 : 0,
      marks: Array.isArray(c.marks) ? c.marks : [],
    }));
  return categoriesCache;
}

function renderCategoryCheckboxes(categories, selected) {
  const listEl = overlayEl?.querySelector?.('#shelf-category-ctx-list');
  if (!listEl) return;

  if (!categories || categories.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-light);font-size:13px">暂无分类</div>';
    return;
  }

  listEl.innerHTML = categories
    .map((c) => {
      const checked = selected.has(Number(c.id)) ? 'checked' : '';
      const name = c.is_special ? `★ ${escapeHtml(c.name)}` : escapeHtml(c.name);
      return `
        <label class="shelf-ctx-item">
          <input type="checkbox" class="shelf-ctx-cb" value="${c.id}" ${checked}>
          <span>${name}</span>
        </label>
      `;
    })
    .join('');
}

function getSelectedCategoryIds() {
  const cbs = Array.from(overlayEl?.querySelectorAll?.('input.shelf-ctx-cb') || []);
  return cbs
    .filter((cb) => cb.checked)
    .map((cb) => Number(cb.value))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function saveBookCategories(bookId, categoryIds, allCategories) {
  const res = await fetch('/api/admin/book-categories', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ book_id: bookId, category_ids: categoryIds }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || '保存失败');

  const idSet = new Set((data.category_ids || categoryIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0));
  const nextCats = (allCategories || [])
    .filter((c) => idSet.has(Number(c.id)))
    .sort((a, b) => {
      if ((b.is_special ? 1 : 0) !== (a.is_special ? 1 : 0)) return (b.is_special ? 1 : 0) - (a.is_special ? 1 : 0);
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    });

  const book = (state.allBooks || []).find((b) => Number(b?.id) === Number(bookId));
  if (book) book.categories = nextCats;
}

async function refreshPublicCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    state.allCategories = Array.isArray(data.categories) ? data.categories : [];
  } catch {}
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

