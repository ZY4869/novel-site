import { esc } from '../shared/dom.js';
import { parseEpubArrayBuffer } from '../shared/epub.js';
import { decodeText, splitTextBySize, splitTextChapters } from '../shared/text.js';
import { state, dom } from './state.js';
import { restoreScrollPosition, saveScrollPosition } from './progress.js';
import { updateBookmarkIcon } from './bookmarks.js';
import { trackReadingStats } from './stats.js';
import { applyReadingMode } from './pager.js';
import { createEpubRawViewer } from './epubRawViewer.js';

const JSZIP_SRC = '/jszip.min.js';
const SOURCE_VIEW_PARAM = 'source_view';

let jsZipPromise = null;
let sourceBook = null;
let sourceBookId = null;
let sourceArrayBuffer = null;
let sourceChapters = [];

let sourceKind = null; // 'epub' | 'text'
let sourceView = null; // 'raw' | 'text'

let textChaptersCache = null;
let epubTextChaptersCache = null;
let epubViewer = null;

let currentRawIframe = null;
let themeObserver = null;
let resizeListenerBound = false;
let showForcedScrollHint = false;
let renderSeq = 0;

export async function initSourceRead() {
  const bookId = new URLSearchParams(location.search).get('book');
  if (!bookId || !/^\d+$/.test(bookId)) {
    if (dom.content) dom.content.innerHTML = '<div class="msg msg-error">无效的书籍ID</div>';
    return;
  }
  sourceBookId = bookId;

  if (dom.content) dom.content.textContent = '加载源文件中...';

  try {
    const bookData = await fetchBook(bookId);
    sourceBook = bookData.book;
    if (!sourceBook?.source_name && !sourceBook?.source_size) throw new Error('该书没有源文件');

    const res = await fetch(`/api/books/${bookId}/source`);
    if (!res.ok) throw new Error(res.status === 404 ? '源文件不存在' : '源文件加载失败');
    sourceArrayBuffer = await res.arrayBuffer();

    sourceKind = getSourceKind(sourceBook);
    if (!sourceKind) throw new Error('暂不支持在线阅读该源文件格式，请下载后查看');

    sourceView = decideInitialSourceView(sourceKind);
    saveSourceView(sourceKind, sourceView);

    await ensureSourcePreparedForView();
    applySourceViewSideEffects();

    renderTOC();
    bindHashNavigation();

    const initialPos = getInitialPos();
    await renderChapter(initialPos, true);
  } catch (e) {
    if (dom.content) dom.content.innerHTML = `<div class="msg msg-error">${esc(e.message || '加载失败')}</div>`;
  }
}

async function fetchBook(bookId) {
  const res = await fetch(`/api/books/${bookId}`);
  if (!res.ok) throw new Error(res.status === 404 ? '书籍不存在' : '加载失败');
  return await res.json();
}

function getSourceKind(book) {
  const type = String(book?.source_type || '').toLowerCase();
  const name = String(book?.source_name || book?.title || '').toLowerCase();
  if (type.includes('epub') || name.endsWith('.epub')) return 'epub';
  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.text')) return 'text';
  return null;
}

function normalizeSourceView(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'raw') return 'raw';
  if (s === 'text') return 'text';
  return null;
}

function getSourceViewStorageKey(kind) {
  return `source_view:${kind}`;
}

function loadSavedSourceView(kind) {
  try {
    return normalizeSourceView(localStorage.getItem(getSourceViewStorageKey(kind)));
  } catch {
    return null;
  }
}

function saveSourceView(kind, view) {
  try {
    localStorage.setItem(getSourceViewStorageKey(kind), String(view));
  } catch {}
}

function decideInitialSourceView(kind) {
  const sp = new URLSearchParams(location.search);
  const fromQuery = normalizeSourceView(sp.get(SOURCE_VIEW_PARAM));
  if (fromQuery) return fromQuery;
  const saved = loadSavedSourceView(kind);
  if (saved) return saved;
  return kind === 'epub' ? 'raw' : 'text';
}

function updateUrlSourceView(view) {
  const url = new URL(location.href);
  url.searchParams.set(SOURCE_VIEW_PARAM, view);
  history.replaceState(null, '', url.toString());
}

function getSavedReadingMode() {
  try {
    const v = localStorage.getItem('reading-mode');
    return v === 'pager' ? 'pager' : 'scroll';
  } catch {
    return 'scroll';
  }
}

function applySourceViewSideEffects() {
  const isEpubRaw = sourceKind === 'epub' && sourceView === 'raw';
  document.body.classList.toggle('source-view-raw', isEpubRaw);

  showForcedScrollHint = false;
  if (isEpubRaw) {
    showForcedScrollHint = getSavedReadingMode() === 'pager';
    state.settings.readingMode = 'scroll';
    applyReadingMode();
  } else {
    state.settings.readingMode = getSavedReadingMode();
  }
}

function getThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    bg: (cs.getPropertyValue('--bg') || '').trim(),
    text: (cs.getPropertyValue('--text') || '').trim(),
  };
}

function ensureThemeObserver() {
  if (themeObserver) return;
  themeObserver = new MutationObserver(() => {
    if (sourceKind !== 'epub' || sourceView !== 'raw') return;
    if (!epubViewer || !currentRawIframe) return;
    epubViewer.applyThemeToIframe(currentRawIframe, getThemeColors());
    epubViewer.resizeIframeToContent(currentRawIframe);
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

function ensureResizeHandler() {
  if (resizeListenerBound) return;
  resizeListenerBound = true;
  window.addEventListener(
    'resize',
    () => {
      if (sourceKind !== 'epub' || sourceView !== 'raw') return;
      if (!epubViewer || !currentRawIframe) return;
      epubViewer.resizeIframeToContent(currentRawIframe);
    },
    { passive: true }
  );
}

function parseTextToChapters(arrayBuffer) {
  const text = decodeText(arrayBuffer);
  const chapters = splitTextChapters(text) || splitTextBySize(text, 8000);
  return (chapters || []).map((c, idx) => ({
    title: String(c.title || `第${idx + 1}章`),
    content: String(c.content || ''),
  }));
}

async function ensureSourcePreparedForView() {
  if (!sourceBook || !sourceArrayBuffer || !sourceKind || !sourceView) return;

  if (sourceKind === 'text') {
    if (!textChaptersCache) textChaptersCache = parseTextToChapters(sourceArrayBuffer);
    sourceChapters = textChaptersCache;
    return;
  }

  // epub
  if (sourceView === 'raw') {
    if (!epubViewer) {
      const JSZip = await ensureJsZip();
      epubViewer = await createEpubRawViewer(
        sourceArrayBuffer,
        sourceBook?.source_name || sourceBook?.title || 'book.epub',
        JSZip
      );
      window.addEventListener('beforeunload', () => epubViewer?.dispose?.());
    }
    ensureThemeObserver();
    ensureResizeHandler();
    sourceChapters = epubViewer.spineItems.map((it) => ({ title: it.title, content: '' }));
    return;
  }

  if (!epubTextChaptersCache) {
    const JSZip = await ensureJsZip();
    const { chapters } = await parseEpubArrayBuffer(
      sourceArrayBuffer,
      sourceBook?.source_name || sourceBook?.title || 'book.epub',
      JSZip,
      { keepEmpty: true }
    );
    epubTextChaptersCache = (chapters || []).map((c, idx) => ({
      title: String(c.title || `章节 ${idx + 1}`),
      content: String(c.content || ''),
    }));
  }
  sourceChapters = epubTextChaptersCache;
}

function bindHashNavigation() {
  window.addEventListener('hashchange', () => {
    const pos = getPosFromHash();
    if (!pos) return;
    renderChapter(pos, false).catch(() => {});
  });

  if (dom.tocList) {
    dom.tocList.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      dom.tocOverlay?.classList.remove('active');
    });
  }
}

function getInitialPos() {
  const fromHash = getPosFromHash();
  if (fromHash) return fromHash;

  const posParam = new URLSearchParams(location.search).get('pos');
  if (posParam && /^\d+$/.test(posParam)) return clampPos(Number(posParam));

  try {
    const saved = JSON.parse(localStorage.getItem(`reading_${sourceBookId}`));
    const id = String(saved?.chapterId || '');
    const m = id.match(new RegExp(`^src-${sourceBookId}-(\\d+)$`));
    if (m) return clampPos(Number(m[1]));
  } catch {}

  return 1;
}

function getCurrentPos() {
  const fromHash = getPosFromHash();
  if (fromHash) return fromHash;

  const id = String(state.chapterMeta?.chapterId || '');
  const m = id.match(new RegExp(`^src-${sourceBookId}-(\\d+)$`));
  if (m) return clampPos(Number(m[1]));

  return 1;
}

function getPosFromHash() {
  const h = String(location.hash || '').replace(/^#/, '');
  if (!h) return null;
  const m = h.match(/^pos=(\d+)$/);
  if (!m) return null;
  return clampPos(Number(m[1]));
}

function clampPos(pos) {
  const max = Math.max(1, sourceChapters.length);
  if (!Number.isFinite(pos)) return 1;
  return Math.max(1, Math.min(pos, max));
}

function renderTOC() {
  if (dom.tocTitle) dom.tocTitle.textContent = sourceBook?.title || '目录';
  if (!dom.tocList) return;
  dom.tocList.innerHTML = sourceChapters
    .map((ch, idx) => `<li><a href="#pos=${idx + 1}">${esc(ch.title || `章节 ${idx + 1}`)}</a></li>`)
    .join('');
}

function buildSourceViewToggle() {
  const wrap = document.createElement('div');
  wrap.className = 'source-view-toggle';
  wrap.innerHTML = `
    <button type="button" class="source-view-btn ${sourceView === 'raw' ? 'active' : ''}" data-view="raw">源格式</button>
    <button type="button" class="source-view-btn ${sourceView === 'text' ? 'active' : ''}" data-view="text">纯文本</button>
  `;
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest?.('button[data-view]');
    if (!btn) return;
    setSourceView(btn.dataset.view).catch(() => {});
  });
  return wrap;
}

async function setSourceView(nextView) {
  const v = normalizeSourceView(nextView);
  if (!v || !sourceKind) return;
  if (v === sourceView) return;

  sourceView = v;
  saveSourceView(sourceKind, sourceView);
  updateUrlSourceView(sourceView);

  await ensureSourcePreparedForView();
  applySourceViewSideEffects();
  renderTOC();
  await renderChapter(getCurrentPos(), false);
}

async function renderChapter(pos, replaceHash) {
  const seq = ++renderSeq;
  const idx = clampPos(pos) - 1;
  const ch = sourceChapters[idx];
  if (!ch) return;

  if (replaceHash) {
    const url = new URL(location.href);
    url.hash = `pos=${idx + 1}`;
    history.replaceState(null, '', url.toString());
  }

  const bookIdNum = Number(sourceBookId);
  const chapterKey = `src-${sourceBookId}-${idx + 1}`;
  const chapterTitle = String(ch.title || `章节 ${idx + 1}`);
  state.chapterMeta = {
    chapterId: chapterKey,
    chapterTitle,
    bookTitle: sourceBook?.title || '源文件',
    bookId: bookIdNum,
  };
  state.chapterData = { content: '', title: state.chapterMeta.chapterTitle };

  document.title = `${esc(state.chapterMeta.chapterTitle)} - ${esc(state.chapterMeta.bookTitle)}`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.content = `${state.chapterMeta.bookTitle} - ${state.chapterMeta.chapterTitle}`;

  state.nav.backUrl = `/book?id=${sourceBookId}`;
  state.nav.prevUrl = idx > 0 ? `#pos=${idx}` : null;
  state.nav.nextUrl = idx < sourceChapters.length - 1 ? `#pos=${idx + 2}` : null;

  if (dom.backLink) dom.backLink.href = state.nav.backUrl;
  if (dom.breadcrumb) {
    dom.breadcrumb.innerHTML = `<a href="/">书架</a><span>›</span><a href="/book?id=${sourceBookId}">${esc(state.chapterMeta.bookTitle)}</a><span>›</span>${esc(state.chapterMeta.chapterTitle)}`;
  }

  document.querySelectorAll('.toc-list a').forEach((a) => a.classList.remove('current'));
  const curA = document.querySelector(`.toc-list a[href=\"#pos=${idx + 1}\"]`);
  if (curA) curA.classList.add('current');

  const el = dom.content;
  if (!el) return;

  el.innerHTML = `<h2>${esc(state.chapterMeta.chapterTitle)} <span style="font-size:12px;color:var(--text-light)">（源文件）</span></h2>`;
  el.appendChild(buildSourceViewToggle());

  if (sourceKind === 'epub' && sourceView === 'raw' && showForcedScrollHint) {
    const hint = document.createElement('div');
    hint.className = 'source-raw-hint';
    hint.textContent = '源格式暂不支持翻页，已切到滚动';
    el.appendChild(hint);
  }

  currentRawIframe = null;
  const contentDiv = document.createElement('div');
  contentDiv.className = 'reader-content';

  const nav = document.createElement('div');
  nav.className = 'reader-nav';
  nav.innerHTML = `
    ${state.nav.prevUrl ? `<a href="${state.nav.prevUrl}">←${esc(sourceChapters[idx - 1]?.title || '上一章')}</a>` : '<span class="disabled">已经是第一章</span>'}
    <a href="/book?id=${sourceBookId}">目录</a>
    <a href="#" id="export-btn" style="font-size:13px">导出TXT</a>
    <a href="/api/books/${sourceBookId}/source" target="_blank" rel="noopener" style="font-size:13px">下载源文件</a>
    ${state.nav.nextUrl ? `<a href="${state.nav.nextUrl}">${esc(sourceChapters[idx + 1]?.title || '下一章')} →</a>` : '<span class="disabled">已经是最后一章</span>'}
  `;

  const isEpubRaw = sourceKind === 'epub' && sourceView === 'raw';
  const isTextRaw = sourceKind === 'text' && sourceView === 'raw';

  if (isTextRaw) contentDiv.classList.add('source-raw');

  if (isEpubRaw) {
    contentDiv.textContent = '渲染中...';
    try {
      const colors = getThemeColors();
      const { iframe, plainText } = await epubViewer.renderSpine(idx, { colors });
      if (seq !== renderSeq) return;
      currentRawIframe = iframe;
      contentDiv.innerHTML = '';
      contentDiv.appendChild(iframe);
      state.chapterData.content = String(plainText || '');
    } catch (e) {
      if (seq !== renderSeq) return;
      contentDiv.innerHTML = `<div class="msg msg-error">${esc(e.message || '渲染失败')}</div>`;
      state.chapterData.content = '';
    }
  } else {
    const text = String(ch.content || '');
    state.chapterData.content = text;
    contentDiv.textContent = text;
  }

  el.appendChild(contentDiv);
  el.appendChild(nav);

  document.getElementById('export-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    exportCurrent();
  });

  applyReadingMode();
  updateBottomNavButtons();
  trackReadingStats(chapterKey, (state.chapterData.content || '').length);
  updateBookmarkIcon();

  const hasSavedScroll = hasSavedScrollProgress(bookIdNum, chapterKey);
  restoreScrollPosition(bookIdNum, chapterKey);
  if (state.settings.readingMode !== 'pager' && !hasSavedScroll) window.scrollTo(0, 0);
  requestAnimationFrame(() => requestAnimationFrame(() => saveScrollPosition()));
}

function updateBottomNavButtons() {
  if (dom.barPrev) dom.barPrev.style.opacity = state.nav.prevUrl ? '1' : '0.3';
  if (dom.barNext) dom.barNext.style.opacity = state.nav.nextUrl ? '1' : '0.3';
}

function hasSavedScrollProgress(bookId, chapterId) {
  if (!bookId || !chapterId) return false;
  try {
    const saved = JSON.parse(localStorage.getItem(`reading_${bookId}`));
    return !!(saved && saved.chapterId === chapterId && saved.scrollPct > 0);
  } catch {
    return false;
  }
}

function exportCurrent() {
  if (!state.chapterData) return;
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + state.chapterData.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.chapterData.title}.txt`.replace(/[<>:"/\\|?*]/g, '_');
  a.click();
  URL.revokeObjectURL(url);
}

async function ensureJsZip() {
  if (globalThis.JSZip?.loadAsync) return globalThis.JSZip;
  if (jsZipPromise) return jsZipPromise;
  jsZipPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSZIP_SRC;
    s.onload = () => (globalThis.JSZip?.loadAsync ? resolve(globalThis.JSZip) : reject(new Error('JSZip 加载失败')));
    s.onerror = () => reject(new Error('JSZip 加载失败'));
    document.head.appendChild(s);
  });
  return jsZipPromise;
}
