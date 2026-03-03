import { esc } from '../ui.js';
import { fmtCount } from './utils.js';

export function highlightHotSelection(activeKind, activeId) {
  const kind = activeKind === 'comic' ? 'comic' : 'novel';
  const id = Number(activeId || 0) || 0;
  document.querySelectorAll('.dash-hot-item[data-kind][data-id]').forEach((btn) => {
    const k = btn.dataset.kind;
    const bid = Number(btn.dataset.id || 0) || 0;
    btn.classList.toggle('active', k === kind && bid === id);
  });
}

export function renderHotLists({ hotBooks, hotChapters, hotComics }, { activeKind, activeId } = {}) {
  renderHotBooks(hotBooks || []);
  renderHotChapters(hotChapters || []);
  renderHotComics(hotComics || []);
  highlightHotSelection(activeKind, activeId);
}

function renderHotBooks(items) {
  const el = document.getElementById('hot-books');
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML =
      '<div class="dash-card-title">🔥 近30天热门书籍</div><div style="color:var(--text-light);font-size:13px">暂无数据</div>';
    return;
  }
  el.innerHTML =
    '<div class="dash-card-title">🔥 近30天热门书籍</div>' +
    '<ul class="dash-list">' +
    items
      .map((b, i) => {
        const title = esc(b?.title || '未命名');
        const views = fmtCount(b?.total_views || 0);
        const id = Number(b?.book_id || 0) || 0;
        return `<li><button type="button" class="dash-hot-item" data-kind="novel" data-id="${id}">
          <span>${i + 1}. ${title}</span>
          <span class="dash-hot-meta">${views} 次</span>
        </button></li>`;
      })
      .join('') +
    '</ul>';
}

function renderHotChapters(items) {
  const el = document.getElementById('hot-chapters');
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML =
      '<div class="dash-card-title">🔥 热门章节（累计）</div><div style="color:var(--text-light);font-size:13px">暂无数据</div>';
    return;
  }
  el.innerHTML =
    '<div class="dash-card-title">🔥 热门章节（累计）</div>' +
    '<ul class="dash-list">' +
    items
      .map((c, i) => {
        const bookTitle = esc(c?.book_title || '未知书籍');
        const chTitle = esc(c?.chapter_title || '未命名章节');
        const views = fmtCount(c?.views || 0);
        const id = Number(c?.book_id || 0) || 0;
        return `<li><button type="button" class="dash-hot-item" data-kind="novel" data-id="${id}">
          <span>${i + 1}. ${bookTitle} / ${chTitle}</span>
          <span class="dash-hot-meta">${views} 次</span>
        </button></li>`;
      })
      .join('') +
    '</ul>';
}

function renderHotComics(items) {
  const el = document.getElementById('hot-comics');
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML =
      '<div class="dash-card-title">🔥 近30天热门漫画</div><div style="color:var(--text-light);font-size:13px">暂无数据</div>';
    return;
  }
  el.innerHTML =
    '<div class="dash-card-title">🔥 近30天热门漫画</div>' +
    '<ul class="dash-list">' +
    items
      .map((c, i) => {
        const title = esc(c?.title || '未命名');
        const views = fmtCount(c?.total_views || 0);
        const id = Number(c?.comic_id || 0) || 0;
        return `<li><button type="button" class="dash-hot-item" data-kind="comic" data-id="${id}">
          <span>${i + 1}. ${title}</span>
          <span class="dash-hot-meta">${views} 次</span>
        </button></li>`;
      })
      .join('') +
    '</ul>';
}

