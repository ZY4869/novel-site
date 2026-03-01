import { esc } from '../shared/dom.js';
import { state, dom } from './state.js';
import { restoreScrollPosition, saveScrollPosition } from './progress.js';
import { updateBookmarkIcon } from './bookmarks.js';
import { trackReadingStats } from './stats.js';
import { prefetchChapterAfterDelay, takePrefetchedChapter } from './preload.js';

export function initChapter() {
  if (!state.chapterId || !/^\d+$/.test(state.chapterId)) {
    if (dom.content) dom.content.innerHTML = '<div class="msg msg-error">无效的章节ID</div>';
    return;
  }
  loadChapter();
}

async function loadChapter() {
  const el = dom.content;
  if (!el) return;

  try {
    const prefetched = takePrefetchedChapter(state.chapterId);
    const data = prefetched || (await fetchChapter(state.chapterId));
    const c = data.chapter;

    state.chapterMeta = {
      chapterId: c.id,
      chapterTitle: c.title,
      bookTitle: c.book_title,
      bookId: c.book_id,
    };
    state.chapterData = { content: data.content, title: c.title };

    document.title = `${esc(c.title)} - ${esc(c.book_title)}`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = `${c.book_title} - ${c.title}`;

    state.nav.backUrl = `/book?id=${c.book_id}`;
    if (dom.backLink) dom.backLink.href = state.nav.backUrl;
    if (dom.breadcrumb) {
      dom.breadcrumb.innerHTML = `<a href="/">书架</a><span>›</span><a href="/book?id=${c.book_id}">${esc(c.book_title)}</a><span>›</span>${esc(c.title)}`;
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'reader-content';
    renderParagraphs(contentDiv, data.content);

    state.nav.prevUrl = data.prevChapter ? `/read?id=${data.prevChapter.id}` : null;
    state.nav.nextUrl = data.nextChapter ? `/read?id=${data.nextChapter.id}` : null;

    const nav = document.createElement('div');
    nav.className = 'reader-nav';
    nav.innerHTML = `
      ${
        state.nav.prevUrl
          ? `<a href="${state.nav.prevUrl}">←${esc(data.prevChapter.title)}</a>`
          : '<span class="disabled">已经是第一章</span>'
      }
      <a href="/book?id=${c.book_id}">目录</a>
      <a href="#" id="export-btn" style="font-size:13px">导出TXT</a>
      <a href="#" id="download-book-btn" style="font-size:13px">📜 缓存全书</a>
      ${
        state.nav.nextUrl
          ? `<a href="${state.nav.nextUrl}">${esc(data.nextChapter.title)} →</a>`
          : '<span class="disabled">已经是最新章</span>'
      }
    `;

    el.innerHTML = `<h2>${esc(c.title)}</h2>`;
    el.appendChild(contentDiv);
    el.appendChild(nav);

    dispatchChapterRendered({ bookId: c.book_id, chapterId: c.id });

    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) exportBtn.addEventListener('click', (e) => { e.preventDefault(); exportThis(); });

    const downloadBtn = document.getElementById('download-book-btn');
    if (downloadBtn) downloadBtn.addEventListener('click', (e) => cacheWholeBook(e, c.book_id));

    updateBottomNavButtons();

    saveScrollPosition();
    trackReadingStats(c.id, data.content.length);
    updateBookmarkIcon();

    restoreScrollPosition(c.book_id, c.id);

    loadTOC(c.book_id, c.id);

    if (data.nextChapter) prefetchChapterAfterDelay(data.nextChapter.id);
  } catch (e) {
    el.innerHTML = `<div class="msg msg-error">${esc(e.message)}</div>`;
  }
}

function renderParagraphs(container, content) {
  const lines = String(content || '').split('\n');
  const frag = document.createDocumentFragment();
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').replace(/\r$/, '');
    if (!line.trim()) continue;
    const p = document.createElement('p');
    p.dataset.paraIdx = String(i);
    p.textContent = line;
    frag.appendChild(p);
    count++;
  }
  container.innerHTML = '';
  if (count > 0) container.appendChild(frag);
  else container.textContent = String(content || '');
}

function dispatchChapterRendered(detail) {
  try {
    document.dispatchEvent(new CustomEvent('read:chapter-rendered', { detail }));
  } catch {}
}

async function fetchChapter(chapterId) {
  const res = await fetch(`/api/chapters/${chapterId}`);
  if (!res.ok) throw new Error(res.status === 404 ? '章节不存在' : '加载失败');
  return await res.json();
}

function exportThis() {
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

async function cacheWholeBook(e, bookId) {
  e.preventDefault();
  const btn = e.currentTarget;
  try {
    btn.textContent = '📜 获取目录...';
    const bRes = await fetch(`/api/books/${bookId}`);
    const bData = await bRes.json();
    const chapters = bData.chapters || [];
    if (chapters.length === 0) {
      btn.textContent = '📜 无章节';
      return;
    }
    let done = 0;
    for (const ch of chapters) {
      await fetch(`/api/chapters/${ch.id}`);
      done++;
      btn.textContent = `📜 ${done}/${chapters.length}`;
    }
    btn.textContent = '✓ 缓存完成';
  } catch {
    btn.textContent = '✗ 缓存失败';
  }
}

function updateBottomNavButtons() {
  if (dom.barPrev) dom.barPrev.style.opacity = state.nav.prevUrl ? '1' : '0.3';
  if (dom.barNext) dom.barNext.style.opacity = state.nav.nextUrl ? '1' : '0.3';
}

async function loadTOC(bookId, currentChapterId) {
  try {
    const res = await fetch(`/api/books/${bookId}`);
    const data = await res.json();
    if (dom.tocTitle) dom.tocTitle.textContent = data.book.title;
    if (dom.tocList) {
      dom.tocList.innerHTML = (data.chapters || [])
        .map((ch) => `<li><a href="/read?id=${ch.id}" class="${ch.id === currentChapterId ? 'current' : ''}">${esc(ch.title)}</a></li>`)
        .join('');
    }
  } catch {}
}
