import { api } from '../api.js';
import { esc } from '../ui.js';
import { setCategoryBooks } from './api.js';
import { loadCategories } from './state.js';
import { coverColor } from '../../shared/cover.js';

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

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}

function updateHint() {
  const hintEl = document.getElementById('category-books-hint');
  if (!hintEl) return;
  if (!booksCache.length) {
    hintEl.textContent = '';
    return;
  }
  hintEl.textContent = `已选 ${selectedBooks.size}/${booksCache.length}`;
}

async function loadBooksForOverlay() {
  const el = document.getElementById('category-books-list');
  if (el) el.innerHTML = '<li class="category-books-empty">加载中...</li>';

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

function buildStatusBadgeHtml(status) {
  const s = normalizeBookStatus(status);
  if (s === 'normal') return '';
  if (s === 'unlisted') return '<div class="category-book-badge category-book-badge-unlisted">下架</div>';
  if (s === 'deleted') return '<div class="category-book-badge category-book-badge-deleted">回收站</div>';
  if (s === 'purging') return '<div class="category-book-badge category-book-badge-purging">清理中</div>';
  return `<div class="category-book-badge">${esc(s)}</div>`;
}

function buildCoverHtml(book) {
  if (book?.cover_key) {
    return `<img class="category-book-cover-img" src="/api/covers/${Number(book.id)}" alt="${escAttr(book.title)}" loading="lazy">`;
  }
  const title = String(book?.title || '').trim();
  const firstChar = title ? title[0] : '？';
  const color = coverColor(title || String(book?.id || ''));
  return `<div class="category-book-cover-placeholder" style="background:${esc(color)}">${esc(firstChar)}</div>`;
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

  updateHint();

  if (!filtered.length) {
    el.innerHTML = '<li class="category-books-empty">暂无书籍</li>';
    return;
  }

  el.innerHTML = filtered
    .map((b) => {
      const id = Number(b.id);
      const checked = selectedBooks.has(id) ? 'checked' : '';
      const selected = selectedBooks.has(id) ? 'is-selected' : '';
      const author = b.author ? esc(b.author) : '—';
      const badge = buildStatusBadgeHtml(b.status);
      return `
        <li data-book-id="${id}">
          <label class="category-book-card ${selected}">
            <input type="checkbox" class="category-book-select" data-book-id="${id}" ${checked} aria-label="选择《${escAttr(b.title)}》">
            <div class="category-book-cover">
              ${buildCoverHtml(b)}
              <div class="category-book-check">✓</div>
              ${badge}
            </div>
            <div class="category-book-info">
              <div class="category-book-title">${esc(b.title)}</div>
              <div class="category-book-meta">${author}</div>
            </div>
          </label>
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
    cb.closest?.('.category-book-card')?.classList?.toggle('is-selected', !!cb.checked);
    updateHint();
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
    if (el) el.innerHTML = `<li class="category-books-empty">加载失败：${esc(e.message || 'error')}</li>`;
  }
}
