import { esc } from '../shared/dom.js';
import { parseEpubArrayBuffer } from '../shared/epub.js';
import { decodeText, splitTextBySize, splitTextChapters } from '../shared/text.js';
import { state, dom } from './state.js';
import { restoreScrollPosition, saveScrollPosition } from './progress.js';
import { updateBookmarkIcon } from './bookmarks.js';
import { trackReadingStats } from './stats.js';

const JSZIP_SRC = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const JSZIP_INTEGRITY = 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG';

let jsZipPromise = null;
let sourceBook = null;
let sourceBookId = null;
let sourceChapters = [];

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
    const ab = await res.arrayBuffer();

    sourceChapters = await parseSourceToChapters(sourceBook, ab);
    if (sourceChapters.length === 0) throw new Error('未解析到内容');

    renderTOC();
    bindHashNavigation();

    const initialPos = getInitialPos();
    renderChapter(initialPos, true);
  } catch (e) {
    if (dom.content) dom.content.innerHTML = `<div class="msg msg-error">${esc(e.message || '加载失败')}</div>`;
  }
}

async function fetchBook(bookId) {
  const res = await fetch(`/api/books/${bookId}`);
  if (!res.ok) throw new Error(res.status === 404 ? '书籍不存在' : '加载失败');
  return await res.json();
}

async function parseSourceToChapters(book, arrayBuffer) {
  const type = String(book?.source_type || '').toLowerCase();
  const name = String(book?.source_name || book?.title || '').toLowerCase();

  const isEpub = type.includes('epub') || name.endsWith('.epub');
  if (isEpub) {
    const JSZip = await ensureJsZip();
    const { chapters } = await parseEpubArrayBuffer(arrayBuffer, book?.source_name || book?.title || 'book.epub', JSZip);
    return (chapters || []).map((c, idx) => ({
      title: String(c.title || `章节 ${idx + 1}`),
      content: String(c.content || ''),
    }));
  }

  const isText = type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.text');
  if (isText) {
    const text = decodeText(arrayBuffer);
    const chapters = splitTextChapters(text) || splitTextBySize(text, 8000);
    return (chapters || []).map((c, idx) => ({
      title: String(c.title || `第${idx + 1}章`),
      content: String(c.content || ''),
    }));
  }

  throw new Error('暂不支持在线阅读该源文件格式，请下载后查看');
}

function bindHashNavigation() {
  window.addEventListener('hashchange', () => {
    const pos = getPosFromHash();
    if (!pos) return;
    renderChapter(pos, false);
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

function renderChapter(pos, replaceHash) {
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
  state.chapterMeta = {
    chapterId: chapterKey,
    chapterTitle: ch.title || `章节 ${idx + 1}`,
    bookTitle: sourceBook?.title || '源文件',
    bookId: bookIdNum,
  };
  state.chapterData = { content: ch.content || '', title: state.chapterMeta.chapterTitle };

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

  const contentDiv = document.createElement('div');
  contentDiv.className = 'reader-content';
  contentDiv.textContent = ch.content || '';

  const nav = document.createElement('div');
  nav.className = 'reader-nav';
  nav.innerHTML = `
    ${state.nav.prevUrl ? `<a href="${state.nav.prevUrl}">←${esc(sourceChapters[idx - 1]?.title || '上一章')}</a>` : '<span class="disabled">已经是第一章</span>'}
    <a href="/book?id=${sourceBookId}">目录</a>
    <a href="#" id="export-btn" style="font-size:13px">导出TXT</a>
    <a href="/api/books/${sourceBookId}/source" target="_blank" rel="noopener" style="font-size:13px">下载源文件</a>
    ${state.nav.nextUrl ? `<a href="${state.nav.nextUrl}">${esc(sourceChapters[idx + 1]?.title || '下一章')} →</a>` : '<span class="disabled">已经是最后一章</span>'}
  `;

  el.innerHTML = `<h2>${esc(state.chapterMeta.chapterTitle)} <span style="font-size:12px;color:var(--text-light)">（源文件）</span></h2>`;
  el.appendChild(contentDiv);
  el.appendChild(nav);

  document.getElementById('export-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    exportCurrent();
  });

  updateBottomNavButtons();
  trackReadingStats(chapterKey, (ch.content || '').length);
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
    s.integrity = JSZIP_INTEGRITY;
    s.crossOrigin = 'anonymous';
    s.onload = () => (globalThis.JSZip?.loadAsync ? resolve(globalThis.JSZip) : reject(new Error('JSZip 加载失败')));
    s.onerror = () => reject(new Error('JSZip 加载失败'));
    document.head.appendChild(s);
  });
  return jsZipPromise;
}
