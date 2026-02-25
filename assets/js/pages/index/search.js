import { esc, qs } from '../../shared/dom.js';
import { highlightMatch } from '../../shared/highlight.js';
import { formatBytes, formatWords } from '../../shared/format.js';
import { state } from './state.js';

export function bindSearch() {
  const input = qs('#search-input');
  const button = qs('.search-bar button');
  if (button) button.addEventListener('click', doSearch);

  if (!input) return;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
  input.addEventListener('input', (e) => {
    if (!e.target.value.trim()) {
      qs('#search-results').style.display = 'none';
      qs('#content').style.display = '';
    }
  });
}

export function doSearch() {
  const q = qs('#search-input').value.trim().toLowerCase();
  const resultsEl = qs('#search-results');
  const contentEl = qs('#content');
  if (!q) {
    resultsEl.style.display = 'none';
    contentEl.style.display = '';
    return;
  }

  const matched = state.allBooks.filter(
    (b) => (b.title || '').toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q)
  );
  if (matched.length === 0) {
    resultsEl.innerHTML = '<div style="padding:16px;color:var(--text-light);text-align:center">没有找到匹配的书籍</div>';
  } else {
    resultsEl.innerHTML = matched
      .map(
        (b) => {
          const hasSource = !!(b.has_source || b.source_name || b.source_size);
          const isSourceOnly = (b.chapter_count || 0) === 0 && hasSource;
          const mode = isSourceOnly ? getSourceReadMode(b) : null;
          const meta = isSourceOnly
            ? buildSourceMeta(b, mode)
            : `${b.chapter_count}章 · ${formatWords(b.total_words)}`;
          return `
        <a class="result-item" href="/book?id=${b.id}">
          <div class="result-title">${highlightMatch(esc(b.title), q)}</div>
          <div class="result-book">${b.author ? highlightMatch(esc(b.author), q) + ' · ' : ''}${meta}</div>
        </a>
      `;
        }
      )
      .join('');
  }
  resultsEl.style.display = '';
  contentEl.style.display = 'none';
}

function buildSourceMeta(book, mode) {
  const size = book.source_size ? ` · ${formatBytes(book.source_size)}` : '';
  const hint = mode ? ' · 可在线读' : ' · 仅下载';
  return `源文件${size}${hint}`;
}

function getSourceReadMode(book) {
  const type = String(book?.source_type || '').toLowerCase();
  const name = String(book?.source_name || book?.title || '').toLowerCase();
  if (type.includes('epub') || name.endsWith('.epub')) return 'epub';
  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.text')) return 'text';
  return null;
}
