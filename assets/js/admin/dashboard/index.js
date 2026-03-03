import { esc } from '../ui.js';
import { fetchAdminStats, fetchBooks, fetchComics, fetchContent, fetchNowProgress } from './data.js';
import { highlightHotSelection, renderDetail, renderDetailEmpty, renderHotLists, renderNow } from './render.js';
import { hideSearchResults, initDashboardSearch } from './search.js';
import { fmtCount, fmtWan, prefersReducedMotion, toInt } from './utils.js';

let inited = false;
let reqSeq = 0;

const state = {
  kind: 'novel',
  activeIdByKind: { novel: null, comic: null },
  books: [],
  comics: [],
  hotBooks: [],
  hotChapters: [],
  hotComics: [],
  now: null,
  contentCache: new Map(),
};

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(v);
}

function setKind(kind) {
  state.kind = kind === 'comic' ? 'comic' : 'novel';
  document.querySelectorAll('#dashboard-kind-tabs .dash-pill[data-kind]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.kind === state.kind);
  });
  const search = document.getElementById('dashboard-search');
  if (search) search.placeholder = state.kind === 'comic' ? '搜索漫画...' : '搜索书籍...';
  hideSearchResults();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function swapDetail(seq, renderFn) {
  const body = document.getElementById('dashboard-detail-body');
  if (!body) return;
  if (prefersReducedMotion()) {
    if (seq === reqSeq) renderFn();
    return;
  }

  body.classList.add('dash-fade');
  body.classList.add('is-switching');
  await sleep(90);
  if (seq !== reqSeq) return;
  renderFn();
  requestAnimationFrame(() => {
    if (seq !== reqSeq) return;
    body.classList.remove('is-switching');
  });
}

function getDefaultIdForKind(kind) {
  if (kind === 'novel') {
    const hot = state.hotBooks?.[0]?.book_id;
    if (hot) return Number(hot) || null;
    const first = state.books?.[0]?.id;
    return first ? Number(first) || null : null;
  }
  const hot = state.hotComics?.[0]?.comic_id;
  if (hot) return Number(hot) || null;
  const first = state.comics?.[0]?.id;
  return first ? Number(first) || null : null;
}

async function selectContent(kind, id, { preferCache = true } = {}) {
  const numericId = Number(id || 0) || 0;
  if (!numericId) return renderDetailEmpty();

  const mySeq = ++reqSeq;

  setKind(kind);
  state.activeIdByKind[state.kind] = numericId;
  hideSearchResults();
  const search = document.getElementById('dashboard-search');
  if (search) search.value = '';

  highlightHotSelection(state.kind, numericId);

  const key = `${state.kind}:${numericId}`;
  if (preferCache && state.contentCache.has(key)) {
    await swapDetail(mySeq, () => renderDetail(state.contentCache.get(key)));
    return;
  }

  try {
    await swapDetail(mySeq, () => {
      const body = document.getElementById('dashboard-detail-body');
      if (body) body.innerHTML = '<span style="color:var(--text-light)">加载中...</span>';
    });

    const data = await fetchContent(state.kind, numericId);
    if (mySeq !== reqSeq) return;
    state.contentCache.set(key, data);
    await swapDetail(mySeq, () => renderDetail(data));
  } catch (e) {
    if (mySeq !== reqSeq) return;
    await swapDetail(mySeq, () => {
      const body = document.getElementById('dashboard-detail-body');
      if (body) body.innerHTML = `<span class="msg msg-error">${esc(e.message || '加载失败')}</span>`;
    });
  }
}

function bindEventsOnce() {
  document.getElementById('dashboard-kind-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-kind]');
    if (!btn) return;
    const kind = btn.dataset.kind === 'comic' ? 'comic' : 'novel';
    const id = state.activeIdByKind[kind] || getDefaultIdForKind(kind);
    setKind(kind);
    if (id) selectContent(kind, id);
    else renderDetailEmpty();
  });

  initDashboardSearch({
    getKind: () => state.kind,
    getItems: (kind) => (kind === 'comic' ? state.comics : state.books),
    onPick: (kind, id) => selectContent(kind, id, { preferCache: false }),
  });

  document.querySelectorAll('#hot-books, #hot-chapters, #hot-comics').forEach((root) => {
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button.dash-hot-item[data-kind][data-id]');
      if (!btn) return;
      const kind = btn.dataset.kind;
      const id = Number(btn.dataset.id || 0) || 0;
      if (!id) return;
      selectContent(kind, id, { preferCache: false });
    });
  });

  document.getElementById('dashboard-now')?.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const now = state.now;
    if (!now) return;
    const kind = now.kind === 'comic' ? 'comic' : 'novel';
    const id = kind === 'comic' ? Number(now.comicId || 0) || 0 : Number(now.bookId || 0) || 0;
    if (id) selectContent(kind, id, { preferCache: false });
  });
}

export function initDashboardPanel() {
  if (inited) return;
  inited = true;
  bindEventsOnce();
  setKind(state.kind);
  renderDetailEmpty();
}

export async function loadDashboardPanel() {
  initDashboardPanel();

  await Promise.allSettled([
    (async () => {
      const books = await fetchBooks();
      state.books = books;
      const totalChapters = books.reduce((s, b) => s + toInt(b.chapter_count, 0), 0);
      const totalWords = books.reduce((s, b) => s + toInt(b.total_words, 0), 0);
      setText('stat-books', fmtCount(books.length));
      setText('stat-chapters', fmtCount(totalChapters));
      setText('stat-words', fmtWan(totalWords));
    })(),
    (async () => {
      const comics = await fetchComics();
      state.comics = comics;
      const totalPages = comics.reduce((s, c) => s + toInt(c.page_count, 0), 0);
      setText('stat-comics', fmtCount(comics.length));
      setText('stat-comic-pages', fmtCount(totalPages));
    })(),
    (async () => {
      const data = await fetchAdminStats();
      setText('stat-pv', fmtCount(data.today?.pv || 0));
      setText('stat-uv', fmtCount(data.today?.uv || 0));
      setText('stat-total-pv', fmtWan(data.totals?.total_pv || 0));
      setText('stat-total-uv', fmtWan(data.totals?.total_uv || 0));

      setText('stat-novel-views-today', fmtWan(data.reading?.novels?.today_views || 0));
      setText('stat-novel-views-30d', fmtWan(data.reading?.novels?.last30_views || 0));
      setText('stat-novel-views-total', fmtWan(data.reading?.novels?.total_views || 0));

      setText('stat-comic-views-today', fmtWan(data.reading?.comics?.today_views || 0));
      setText('stat-comic-views-30d', fmtWan(data.reading?.comics?.last30_views || 0));
      setText('stat-comic-views-total', fmtWan(data.reading?.comics?.total_views || 0));

      state.hotBooks = data.hotBooks || [];
      state.hotChapters = data.hotChapters || [];
      state.hotComics = data.hotComics || [];
      renderHotLists(
        { hotBooks: state.hotBooks, hotChapters: state.hotChapters, hotComics: state.hotComics },
        { activeKind: state.kind, activeId: state.activeIdByKind[state.kind] }
      );
    })(),
    (async () => {
      const now = await fetchNowProgress();
      state.now = now;
      renderNow(now);
    })(),
  ]);

  const now = state.now;
  if (now && (now.bookId || now.comicId)) {
    const kind = now.kind === 'comic' ? 'comic' : 'novel';
    const id = kind === 'comic' ? now.comicId : now.bookId;
    if (id) await selectContent(kind, id);
    return;
  }

  const id = state.activeIdByKind[state.kind] || getDefaultIdForKind(state.kind);
  if (id) await selectContent(state.kind, id);
}
