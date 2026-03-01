import { coverColor } from '../../shared/cover.js';
import { esc, qs } from '../../shared/dom.js';
import { formatBytes, formatWords } from '../../shared/format.js';
import { state } from './state.js';
import { renderContinueReading, renderReadingStats } from './reading.js';

export async function loadBooks() {
  const el = qs('#content');
  try {
    const [booksRes, tagsRes] = await Promise.all([
      fetch('/api/books'),
      fetch('/api/tags').catch(() => ({ json: () => ({ tags: [] }) })),
    ]);
    const booksData = await booksRes.json();
    if (!booksRes.ok) throw new Error('加载失败');
    state.allBooks = booksData.books || [];
    try {
      state.allTags = (await tagsRes.json()).tags || [];
    } catch {
      state.allTags = [];
    }
    renderTagFilter();
    renderContinueReading();
    renderReadingStats();
    renderBooks(state.allBooks);
  } catch (e) {
    el.innerHTML = `<div class="msg msg-error">加载失败：${esc(e.message)}</div>`;
  }
}

function renderTagFilter() {
  const container = qs('#tag-filter');
  if (state.allTags.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '<div class="tag-filter-bar" id="tag-bar"></div>';
  const bar = qs('#tag-bar');

  const allPill = document.createElement('span');
  allPill.className = 'tag-pill' + (state.activeTagId === null ? ' active' : '');
  allPill.textContent = '全部';
  allPill.style.background = 'var(--bg)';
  allPill.style.color = 'var(--text)';
  allPill.style.border = '1px solid var(--border)';
  bar.appendChild(allPill);

  for (const tag of state.allTags) {
    const pill = document.createElement('span');
    pill.className = 'tag-pill' + (state.activeTagId === tag.id ? ' active' : '');
    pill.textContent = tag.name;
    pill.style.background = tag.color + '22';
    pill.style.color = tag.color;
    pill.dataset.tagId = tag.id;
    bar.appendChild(pill);
  }

  bar.addEventListener('click', (e) => {
    const pill = e.target.closest('.tag-pill');
    if (!pill) return;
    state.activeTagId = pill.dataset.tagId ? Number(pill.dataset.tagId) : null;
    renderTagFilter();
    filterAndRenderBooks();
  });
}

function filterAndRenderBooks() {
  let filtered = state.allBooks;
  if (state.activeTagId !== null) {
    filtered = state.allBooks.filter((b) => (b.tags || []).some((t) => t.id === state.activeTagId));
  }
  renderBooks(filtered);
}

function renderBooks(books) {
  const el = qs('#content');
  if (books.length === 0) {
    el.className = '';
    el.innerHTML =
      state.allBooks.length === 0
        ? '<div class="empty"><p>📖 书架空空如也</p><p>去<a href="/admin">管理后台</a>添加第一本书吧</p></div>'
        : '<div class="empty"><p>没有匹配的书籍</p></div>';
    return;
  }

  el.className = 'book-grid-cover';
  el.innerHTML = books
    .map((b) => {
      const hasSource = !!(b.has_source || b.source_name || b.source_size);
      const isSourceOnly = (b.chapter_count || 0) === 0 && hasSource;
      const sourceMode = isSourceOnly ? getSourceReadMode(b) : null;
      const metaText = isSourceOnly ? buildSourceMeta(b, sourceMode) : `${b.chapter_count}章`;
      const tagsHtml = (b.tags || [])
        .map((t) => `<span class="tag-pill" style="background:${esc(t.color)}22;color:${esc(t.color)}">${esc(t.name)}</span>`)
        .join('');
      if (b.cover_key) {
        return `<a class="book-card-cover" href="/book?id=${b.id}">
          <img class="cover-img" src="/api/covers/${b.id}" alt="${esc(b.title)}" loading="lazy">
          <div class="card-body">
            <h3>${esc(b.title)}</h3>
            <div class="meta">${b.author ? esc(b.author) + ' · ' : ''}${metaText}</div>
            ${tagsHtml ? '<div class="card-tags">' + tagsHtml + '</div>' : ''}
          </div>
        </a>`;
      }
      const color = coverColor(b.title);
      const firstChar = (b.title || '?')[0];
      return `<a class="book-card-cover" href="/book?id=${b.id}">
        <div class="cover-placeholder" style="background:${color}">${esc(firstChar)}</div>
        <div class="card-body">
          <h3>${esc(b.title)}</h3>
          <div class="meta">${b.author ? esc(b.author) + ' · ' : ''}${metaText}</div>
          ${tagsHtml ? '<div class="card-tags">' + tagsHtml + '</div>' : ''}
        </div>
      </a>`;
    })
    .join('');
}

function buildSourceMeta(book, mode) {
  const parts = [];
  const ch = Number.isInteger(book?.source_chapter_count) && book.source_chapter_count >= 0 ? book.source_chapter_count : null;
  const w = Number.isInteger(book?.source_word_count) && book.source_word_count >= 0 ? book.source_word_count : null;
  if (ch !== null || w !== null) {
    parts.push(`${ch ?? '—'}章`);
    parts.push(w !== null ? formatWords(w) : '—字');
  }
  parts.push(book.source_size ? `源文件 ${formatBytes(book.source_size)}` : '源文件');
  parts.push(mode ? '可在线读' : '仅下载');
  return parts.join(' · ');
}

function getSourceReadMode(book) {
  const type = String(book?.source_type || '').toLowerCase();
  const name = String(book?.source_name || book?.title || '').toLowerCase();
  if (type.includes('epub') || name.endsWith('.epub')) return 'epub';
  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.text')) return 'text';
  return null;
}
