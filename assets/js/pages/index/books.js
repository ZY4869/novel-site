import { esc, qs } from '../../shared/dom.js';
import { state } from './state.js';
import { renderContinueReading, renderReadingStats } from './reading.js';
import { UNCATEGORIZED_ID, renderCategoryFilter, renderCategoryViewToggle, renderTagFilter } from './filtersUi.js';
import { renderBooksGrid, renderGroupedBooks, renderPinnedBooks } from './shelfRender.js';

export async function loadBooks() {
  const el = qs('#content');
  try {
    const [booksRes, tagsRes, categoriesRes] = await Promise.all([
      fetch('/api/books'),
      fetch('/api/tags').catch(() => ({ json: () => ({ tags: [] }) })),
      fetch('/api/categories').catch(() => ({ json: () => ({ categories: [] }) })),
    ]);

    const booksData = await booksRes.json();
    if (!booksRes.ok) throw new Error(booksData?.error || '加载失败');
    state.allBooks = booksData.books || [];

    try {
      state.allTags = (await tagsRes.json()).tags || [];
    } catch {
      state.allTags = [];
    }

    try {
      state.allCategories = (await categoriesRes.json()).categories || [];
    } catch {
      state.allCategories = [];
    }

    renderContinueReading();
    renderReadingStats();
    renderAll();
  } catch (e) {
    if (el) el.innerHTML = `<div class="msg msg-error">加载失败：${esc(e.message)}</div>`;
  }
}

function filterByTag(books) {
  const all = Array.isArray(books) ? books : [];
  if (state.activeTagId === null) return all;
  return all.filter((b) => (b.tags || []).some((t) => t.id === state.activeTagId));
}

function filterByCategory(books) {
  const all = Array.isArray(books) ? books : [];
  if (state.activeCategoryId === null) return all;
  if (state.activeCategoryId === UNCATEGORIZED_ID) {
    return all.filter((b) => !Array.isArray(b.categories) || b.categories.length === 0);
  }
  const id = Number(state.activeCategoryId);
  if (!Number.isFinite(id) || id <= 0) return all;
  return all.filter((b) => (b.categories || []).some((c) => Number(c.id) === id));
}

function renderAll() {
  renderCategoryViewToggle({ onChange: renderAll });
  renderCategoryFilter({ onChange: renderAll });
  renderTagFilter({ onChange: renderAll });

  const allBooksCount = Array.isArray(state.allBooks) ? state.allBooks.length : 0;
  renderPinnedBooks(qs('#pinned-books'), (state.allBooks || []).filter((b) => !!b?.pinned_at));

  const contentEl = qs('#content');
  const groupedEl = qs('#grouped-content');

  if (state.categoryViewMode === 'group') {
    if (contentEl) contentEl.style.display = 'none';
    if (groupedEl) groupedEl.style.display = '';
    renderGroupedBooks(groupedEl, filterByTag(state.allBooks), state.allCategories, { allBooksCount });
    return;
  }

  if (groupedEl) groupedEl.style.display = 'none';
  if (contentEl) contentEl.style.display = '';
  renderBooksGrid(contentEl, filterByCategory(filterByTag(state.allBooks)), { allBooksCount });
}

