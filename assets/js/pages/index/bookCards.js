import { coverColor } from '../../shared/cover.js';
import { esc } from '../../shared/dom.js';
import { formatBytes, formatWords } from '../../shared/format.js';

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

export function buildBookCardsHtml(books) {
  return (books || [])
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

