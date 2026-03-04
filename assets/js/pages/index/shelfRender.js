import { esc } from '../../shared/dom.js';
import { buildBookCardsHtml } from './bookCards.js';

function emptyHtml({ hasAnyBooks }) {
  return hasAnyBooks
    ? '<div class="empty"><p>没有匹配的书籍</p></div>'
    : '<div class="empty"><p>📖 书架空空如也</p><p>去<a href="/admin">管理后台</a>添加第一本书吧</p></div>';
}

export function renderBooksGrid(el, books, { allBooksCount } = {}) {
  if (!el) return;
  const list = Array.isArray(books) ? books : [];
  if (list.length === 0) {
    el.className = '';
    el.innerHTML = emptyHtml({ hasAnyBooks: (allBooksCount || 0) > 0 });
    return;
  }
  el.className = 'book-grid-cover';
  el.innerHTML = buildBookCardsHtml(list);
}

export function renderPinnedBooks(el, books) {
  if (!el) return;
  const pinned = Array.isArray(books) ? books : [];
  if (pinned.length === 0) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  el.style.display = '';
  el.innerHTML = `
    <div class="shelf-section">
      <div class="shelf-section-header">
        <div class="shelf-section-title">置顶</div>
        <div class="shelf-section-meta">${pinned.length} 本</div>
      </div>
      <div class="book-grid-cover">${buildBookCardsHtml(pinned)}</div>
    </div>
  `;
}

export function renderGroupedBooks(el, books, categories, { allBooksCount } = {}) {
  if (!el) return;
  const list = Array.isArray(books) ? books : [];
  if (list.length === 0) {
    el.className = '';
    el.innerHTML = emptyHtml({ hasAnyBooks: (allBooksCount || 0) > 0 });
    return;
  }

  const byCategory = new Map();
  const uncategorized = [];
  for (const b of list) {
    const cats = Array.isArray(b.categories) ? b.categories : [];
    if (cats.length === 0) {
      uncategorized.push(b);
      continue;
    }
    for (const c of cats) {
      const id = Number(c?.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!byCategory.has(id)) byCategory.set(id, []);
      byCategory.get(id).push(b);
    }
  }

  const groups = [];
  for (const c of categories || []) {
    const items = byCategory.get(Number(c.id)) || [];
    if (items.length === 0) continue;

    const marks = Array.isArray(c.marks) ? c.marks : [];
    const marksHtml = marks
      .slice(0, 8)
      .map((m) => `<span class="tag-pill category-mark">${esc(m)}</span>`)
      .join('');
    const special = c.is_special ? `<span class="tag-pill category-special">特殊</span>` : '';
    const title = `${c.is_special ? '★ ' : ''}${esc(c.name)}`;

    groups.push(`
      <div class="category-group">
        <div class="category-group-header">
          <div class="category-group-title">
            <div class="category-group-name">${title}</div>
            <div class="category-group-meta">${items.length} 本</div>
            ${special}
          </div>
          ${marksHtml ? `<div class="category-group-marks">${marksHtml}</div>` : ''}
        </div>
        <div class="book-grid-cover">${buildBookCardsHtml(items)}</div>
      </div>
    `);
  }

  if (uncategorized.length) {
    groups.push(`
      <div class="category-group">
        <div class="category-group-header">
          <div class="category-group-title">
            <div class="category-group-name">未分类</div>
            <div class="category-group-meta">${uncategorized.length} 本</div>
          </div>
        </div>
        <div class="book-grid-cover">${buildBookCardsHtml(uncategorized)}</div>
      </div>
    `);
  }

  el.className = '';
  el.innerHTML = groups.length ? groups.join('') : '<div class="empty"><p>没有匹配的书籍</p></div>';
}

