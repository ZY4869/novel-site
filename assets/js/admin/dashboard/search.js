import { esc } from '../ui.js';
import { fmtCount, fmtWan } from './utils.js';

let inited = false;
let ctx = null;

export function hideSearchResults() {
  const root = document.getElementById('dashboard-search-results');
  if (!root) return;
  root.style.display = 'none';
  root.innerHTML = '';
}

function renderSearchResults(queryRaw) {
  const root = document.getElementById('dashboard-search-results');
  if (!root || !ctx) return;

  const kind = ctx.getKind() === 'comic' ? 'comic' : 'novel';
  const query = String(queryRaw || '').trim().toLowerCase();
  if (!query) return hideSearchResults();

  const list = ctx.getItems(kind) || [];
  const results = list
    .filter((x) => {
      const title = String(x.title || '').toLowerCase();
      const author = String(x.author || '').toLowerCase();
      return title.includes(query) || author.includes(query);
    })
    .slice(0, 10);

  if (results.length === 0) {
    root.innerHTML = `<div style="padding:10px 12px;color:var(--text-light);font-size:13px">无匹配结果</div>`;
    root.style.display = '';
    return;
  }

  root.innerHTML = results
    .map((x) => {
      const id = Number(x.id || 0) || 0;
      const title = esc(x.title || '未命名');
      const meta = kind === 'comic' ? `${fmtCount(x.page_count || 0)} 页` : `${fmtCount(x.chapter_count || 0)} 章 / ${fmtWan(x.total_words || 0)} 字`;
      return `<button type="button" data-kind="${kind}" data-id="${id}">
        <span>${title}</span>
        <span class="dash-result-meta">${esc(meta)}</span>
      </button>`;
    })
    .join('');
  root.style.display = '';
}

export function initDashboardSearch({ getKind, getItems, onPick }) {
  if (inited) return;
  inited = true;
  ctx = { getKind, getItems, onPick };

  const search = document.getElementById('dashboard-search');
  search?.addEventListener('input', () => renderSearchResults(search.value));
  search?.addEventListener('focus', () => renderSearchResults(search.value));
  search?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      search.value = '';
      hideSearchResults();
    }
  });

  document.getElementById('dashboard-search-results')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id][data-kind]');
    if (!btn) return;
    const kind = btn.dataset.kind;
    const id = Number(btn.dataset.id || 0) || 0;
    search.value = '';
    hideSearchResults();
    ctx.onPick(kind, id);
  });

  document.addEventListener('click', (e) => {
    const searchWrap = document.querySelector('#stats-panel .dash-search');
    if (!searchWrap) return;
    if (searchWrap.contains(e.target)) return;
    hideSearchResults();
  });
}

