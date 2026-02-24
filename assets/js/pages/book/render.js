import { esc, qs } from '../../shared/dom.js';
import { formatBytes, formatTimeAgo } from '../../shared/format.js';
import { state } from './state.js';
import { filterChapters } from './chapters.js';
import { exportBook } from './export.js';

export async function loadBook(bookId) {
  const el = qs('#content');
  try {
    const res = await fetch(`/api/books/${bookId}`);
    if (!res.ok) throw new Error(res.status === 404 ? '书籍不存在' : '加载失败');

    const data = await res.json();
    const b = data.book;
    state.allChapters = data.chapters || [];

    applyBookMeta(b);
    el.innerHTML = buildBookHtml(bookId, b, state.allChapters);
    bindBookEvents(b);
  } catch (e) {
    el.innerHTML = `<div class="msg msg-error">${esc(e.message)}</div>`;
  }
}

function applyBookMeta(book) {
  document.title = (book.title || '作品详情') + ' - 我的书架';
  qs('meta[name="description"]').content = book.description || book.title || '';
  qs('#bc-title').textContent = book.title || '作品详情';
}

function buildBookHtml(bookId, book, chapters) {
  const tagsHtml = (book.tags || [])
    .map((t) => `<span class="tag-pill" style="background:${esc(t.color)}22;color:${esc(t.color)}">${esc(t.name)}</span>`)
    .join('');
  const tagsBlock = tagsHtml ? `<div class="book-tags">${tagsHtml}</div>` : '';

  const hasSource = !!(book.source_name || book.source_size);
  const sourceHtml = hasSource
    ? `
      <div style="margin-top:12px">
        <a class="btn btn-sm" href="/api/books/${book.id}/source" target="_blank" rel="noopener">
          下载源文件${book.source_name ? '：' + esc(book.source_name) : ''}${book.source_size ? '（' + formatBytes(book.source_size) + '）' : ''}
        </a>
      </div>
    `
    : '';

  let html = buildHeaderHtml(book, tagsBlock, sourceHtml);

  if (chapters.length > 0) html += buildChapterSearchHtml();
  html += buildChaptersHtml(chapters, hasSource);
  html += buildExportHtml(chapters.length);
  html += buildBookmarksHtml(bookId);

  return html;
}

function buildHeaderHtml(book, tagsBlock, sourceHtml) {
  if (book.cover_key) {
    return `
      <div class="book-header">
        <div class="book-header-with-cover">
          <img class="book-cover-img" src="/api/covers/${book.id}" alt="${esc(book.title)}">
          <div class="book-info">
            <h2>${esc(book.title)}</h2>
            ${book.author ? `<div class="author">作者：${esc(book.author)}</div>` : ''}
            ${book.description ? `<div class="desc">${esc(book.description)}</div>` : ''}
            ${tagsBlock}
            ${sourceHtml}
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div class="book-header">
      <h2>${esc(book.title)}</h2>
      ${book.author ? `<div class="author">作者：${esc(book.author)}</div>` : ''}
      ${book.description ? `<div class="desc">${esc(book.description)}</div>` : ''}
      ${tagsBlock}
      ${sourceHtml}
    </div>
  `;
}

function buildChapterSearchHtml() {
  return `
    <div class="search-bar" style="margin-top:16px;margin-bottom:0">
      <input type="text" id="chapter-search" placeholder="搜索章节标题..." autocomplete="off">
      <button id="chapter-search-btn">搜索</button>
    </div>
  `;
}

function buildChaptersHtml(chapters, hasSource) {
  if (chapters.length === 0) {
    return hasSource
      ? '<div class="empty"><p>暂无章节</p><p style="color:var(--text-light);font-size:13px">该书仅提供源文件下载</p></div>'
      : '<div class="empty"><p>暂无章节</p></div>';
  }
  return (
    '<ul class="chapter-list">' +
    chapters
      .map(
        (c) => `
        <li>
          <a href="/read.html?id=${c.id}">
            <span class="chapter-title">${esc(c.title)}</span>
            <span class="chapter-meta">${c.word_count} 字</span>
          </a>
        </li>
      `
      )
      .join('') +
    '</ul>'
  );
}

function buildExportHtml(chapterCount) {
  if (chapterCount === 0) return '';
  return `<div style="margin-top:20px;text-align:center"><a href="#" id="export-link" style="font-size:13px;color:var(--text-light);text-decoration:none;border-bottom:1px dashed var(--text-light);padding-bottom:1px">导出全书 TXT</a></div>`;
}

function buildBookmarksHtml(bookId) {
  const bookmarks = getBookmarks(bookId);
  if (bookmarks.length === 0) return '';

  let html = `<div style="margin-top:24px"><h3 style="font-size:16px;margin-bottom:12px;color:var(--text)">🔖 我的书签（${bookmarks.length}）</h3>`;
  html +=
    '<ul class="chapter-list">' +
    bookmarks
      .sort((a, b) => b.time - a.time)
      .map(
        (bm) => `
        <li>
          <a href="/read.html?id=${bm.chapterId}">
            <span class="chapter-title">${esc(bm.chapterTitle)}</span>
            <span class="chapter-meta">${formatTimeAgo(bm.time)}</span>
          </a>
        </li>
      `
      )
      .join('') +
    '</ul></div>';
  return html;
}

function bindBookEvents(book) {
  const exportLink = qs('#export-link');
  if (exportLink) {
    exportLink.addEventListener('click', (e) => {
      e.preventDefault();
      exportBook(book.id, book.title, book.author);
    });
  }

  const searchBtn = qs('#chapter-search-btn');
  if (searchBtn) searchBtn.addEventListener('click', filterChapters);

  const searchInput = qs('#chapter-search');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') filterChapters();
    });
    searchInput.addEventListener('input', (e) => {
      if (!e.target.value.trim()) filterChapters();
    });
  }
}

function getBookmarks(bookId) {
  try {
    return JSON.parse(localStorage.getItem(`bookmarks_${bookId}`)) || [];
  } catch {
    return [];
  }
}

