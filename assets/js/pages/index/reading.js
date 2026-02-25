import { esc, qs } from '../../shared/dom.js';
import { formatTimeAgo } from '../../shared/format.js';

export function renderContinueReading() {
  const container = qs('#continue-reading');
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith('reading_')) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (data && data.chapterId && data.time) entries.push(data);
    } catch {}
  }

  if (entries.length === 0) {
    container.innerHTML = '';
    return;
  }
  entries.sort((a, b) => b.time - a.time);
  const latest = entries[0];
  container.innerHTML = `
    <a class="continue-reading" href="${buildReadHref(latest)}">
      <div class="continue-info">
        <div class="continue-label">继续阅读</div>
        <div class="continue-title">${esc(latest.bookTitle || '未知书籍')}</div>
        <div class="continue-chapter">${esc(latest.chapterTitle || '')} · ${formatTimeAgo(latest.time)}</div>
      </div>
      <div class="continue-arrow">→</div>
    </a>
  `;
}

function buildReadHref(progress) {
  const chId = String(progress?.chapterId ?? '');
  if (/^\d+$/.test(chId)) return `/read?id=${chId}`;
  const m = chId.match(/^src-(\d+)-(\d+)$/);
  if (m) return `/read?book=${m[1]}#pos=${m[2]}`;
  const bookId = String(progress?.bookId ?? '');
  if (/^\d+$/.test(bookId)) return `/book?id=${bookId}`;
  return '/';
}

export function renderReadingStats() {
  const container = qs('#reading-stats');
  try {
    const stats = JSON.parse(localStorage.getItem('readingStats'));
    if (!stats || (stats.totalSeconds === 0 && stats.totalChars === 0)) {
      container.innerHTML = '';
      return;
    }
    const hours = (stats.totalSeconds / 3600).toFixed(1);
    const wanChars = (stats.totalChars / 10000).toFixed(1);
    const days = (stats.days || []).length;
    container.innerHTML = `<div style="text-align:center;padding:8px 0;font-size:13px;color:var(--text-light)">已读 ${hours} 小时 · ${wanChars} 万字 · 累计 ${days} 天</div>`;
  } catch {
    container.innerHTML = '';
  }
}
