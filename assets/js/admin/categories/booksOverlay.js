import { api } from '../api.js';
import { esc } from '../ui.js';
import { setCategoryBooks } from './api.js';
import { loadCategories } from './state.js';

let categoryId = null;
let categoryName = '';
let booksCache = [];
let selectedBooks = new Set();
let searchQuery = '';

function openOverlay(id) {
  document.getElementById(id)?.classList.add('active');
}

function closeOverlay(id) {
  document.getElementById(id)?.classList.remove('active');
}

function normalizeBookStatus(status) {
  const s = String(status || 'normal').toLowerCase();
  return s || 'normal';
}

async function loadBooksForOverlay() {
  const el = document.getElementById('category-books-list');
  if (el) el.innerHTML = '<li style="color:var(--text-light)">加载中...</li>';

  const res = await api('GET', '/api/books');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '加载书籍失败');

  booksCache = Array.isArray(data.books) ? data.books : [];

  const selected = new Set();
  for (const b of booksCache) {
    const cats = Array.isArray(b.categories) ? b.categories : [];
    if (cats.some((c) => Number(c?.id) === Number(categoryId))) selected.add(Number(b.id));
  }
  selectedBooks = selected;
}

function renderBooksList() {
  const el = document.getElementById('category-books-list');
  if (!el) return;

  const q = String(searchQuery || '').trim().toLowerCase();
  const filtered = q
    ? booksCache.filter((b) => {
        const t = String(b?.title || '').toLowerCase();
        const a = String(b?.author || '').toLowerCase();
        return t.includes(q) || a.includes(q);
      })
    : booksCache;

  const hintEl = document.getElementById('category-books-hint');
  if (hintEl) {
    const sel = selectedBooks.size;
    hintEl.textContent = booksCache.length ? `已选 ${sel}/${booksCache.length}` : '';
  }

  if (!filtered.length) {
    el.innerHTML = '<li style="color:var(--text-light)">暂无书籍</li>';
    return;
  }

  el.innerHTML = filtered
    .map((b) => {
      const id = Number(b.id);
      const checked = selectedBooks.has(id) ? 'checked' : '';
      const status = normalizeBookStatus(b.status);
      const statusText = status === 'normal' ? '' : status === 'unlisted' ? ' · 下架' : status === 'deleted' ? ' · 回收站' : ` · ${esc(status)}`;
      return `
        <li data-book-id="${id}">
          <div class="item-info">
            <label class="gh-select-row">
              <input type="checkbox" class="category-book-select" data-book-id="${id}" ${checked}>
              <div>
                <div class="item-title">${esc(b.title)}</div>
                <div class="item-meta">${b.author ? esc(b.author) : '—'}${statusText}</div>
              </div>
            </label>
          </div>
        </li>
      `;
    })
    .join('');
}

async function saveBooks() {
  if (!categoryId) return;
  const ids = Array.from(selectedBooks);

  const msgEl = document.getElementById('category-books-msg');
  if (msgEl) msgEl.textContent = '保存中...';

  try {
    await setCategoryBooks({ category_id: categoryId, book_ids: ids });
    if (msgEl) msgEl.textContent = '已保存';
    closeOverlay('category-books-overlay');
    await loadCategories();
    document.dispatchEvent(new CustomEvent('books:refresh'));
  } catch (e) {
    if (msgEl) msgEl.textContent = `保存失败：${e.message || 'error'}`;
  }
}

export function initCategoryBooksOverlay() {
  const overlay = document.getElementById('category-books-overlay');
  document.getElementById('close-category-books')?.addEventListener('click', () => closeOverlay('category-books-overlay'));
  document.getElementById('cancel-category-books-btn')?.addEventListener('click', () => closeOverlay('category-books-overlay'));
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay('category-books-overlay');
  });

  document.getElementById('save-category-books-btn')?.addEventListener('click', () => saveBooks());

  document.getElementById('category-books-search')?.addEventListener('input', (e) => {
    searchQuery = String(e?.target?.value || '')
      .trim()
      .toLowerCase();
    renderBooksList();
  });

  document.getElementById('category-books-list')?.addEventListener('change', (e) => {
    const cb = e.target;
    if (!cb?.classList?.contains('category-book-select')) return;
    const bookId = Number(cb.dataset.bookId);
    if (!Number.isFinite(bookId) || bookId <= 0) return;
    if (cb.checked) selectedBooks.add(bookId);
    else selectedBooks.delete(bookId);
    renderBooksList();
  });
}

export async function openCategoryBooksOverlay(category) {
  categoryId = Number(category?.id) || null;
  categoryName = String(category?.name || '');
  searchQuery = '';

  const search = document.getElementById('category-books-search');
  if (search) search.value = '';

  const titleEl = document.getElementById('category-books-title');
  if (titleEl) titleEl.textContent = categoryName ? `分类：${categoryName}` : '';

  const msgEl = document.getElementById('category-books-msg');
  if (msgEl) msgEl.textContent = '';

  openOverlay('category-books-overlay');
  try {
    await loadBooksForOverlay();
    renderBooksList();
  } catch (e) {
    const el = document.getElementById('category-books-list');
    if (el) el.innerHTML = `<li style="color:var(--text-light)">加载失败：${esc(e.message || 'error')}</li>`;
  }
}

