import { esc, qs } from '../../shared/dom.js';
import { highlightMatch } from '../../shared/highlight.js';
import { state } from './state.js';

export function filterChapters() {
  const input = qs('#chapter-search');
  const listEl = qs('.chapter-list');
  if (!input || !listEl) return;

  const q = input.value.trim().toLowerCase();
  const filtered = q
    ? state.allChapters.filter((c) => String(c.title || '').toLowerCase().includes(q))
    : state.allChapters;

  if (filtered.length === 0) {
    listEl.innerHTML = '<li style="padding:16px;text-align:center;color:var(--text-light)">没有匹配的章节</li>';
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (c) => `
      <li><a href="/read.html?id=${c.id}">
        <span class="chapter-title">${highlightMatch(esc(c.title), q)}</span>
        <span class="chapter-meta">${c.word_count} 字</span>
      </a></li>
    `
    )
    .join('');
}

