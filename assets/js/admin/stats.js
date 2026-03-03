import { api } from './api.js';
import { esc } from './ui.js';

export async function loadStats() {
  await Promise.all([loadNovelCounts(), loadComicCounts(), loadAdminStats()]);
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(v);
}

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function fmtCount(n) {
  return toInt(n, 0).toLocaleString();
}

function fmtWan(n) {
  const v = toInt(n, 0);
  return v >= 10000 ? `${(v / 10000).toFixed(1)} 万` : v.toLocaleString();
}

async function loadNovelCounts() {
  try {
    const res = await fetch('/api/books');
    const data = await res.json();
    const books = data.books || [];
    const totalChapters = books.reduce((s, b) => s + toInt(b.chapter_count, 0), 0);
    const totalWords = books.reduce((s, b) => s + toInt(b.total_words, 0), 0);
    setText('stat-books', fmtCount(books.length));
    setText('stat-chapters', fmtCount(totalChapters));
    setText('stat-words', fmtWan(totalWords));
  } catch {}
}

async function loadComicCounts() {
  try {
    const res = await fetch('/api/comics');
    const data = await res.json();
    const comics = data.comics || [];
    const totalPages = comics.reduce((s, c) => s + toInt(c.page_count, 0), 0);
    setText('stat-comics', fmtCount(comics.length));
    setText('stat-comic-pages', fmtCount(totalPages));
  } catch {}
}

async function loadAdminStats() {
  try {
    const res = await api('GET', '/api/admin/stats');
    const data = await res.json();

    setText('stat-pv', fmtCount(data.today?.pv || 0));
    setText('stat-uv', fmtCount(data.today?.uv || 0));

    const totalPv = toInt(data.totals?.total_pv, 0);
    const totalUv = toInt(data.totals?.total_uv, 0);
    setText('stat-total-pv', fmtWan(totalPv));
    setText('stat-total-uv', fmtWan(totalUv));

    const novelReading = data.reading?.novels || {};
    setText('stat-novel-views-today', fmtWan(novelReading.today_views || 0));
    setText('stat-novel-views-30d', fmtWan(novelReading.last30_views || 0));
    setText('stat-novel-views-total', fmtWan(novelReading.total_views || 0));

    const comicReading = data.reading?.comics || {};
    setText('stat-comic-views-today', fmtWan(comicReading.today_views || 0));
    setText('stat-comic-views-30d', fmtWan(comicReading.last30_views || 0));
    setText('stat-comic-views-total', fmtWan(comicReading.total_views || 0));

    renderHotBooks(data.hotBooks || []);
    renderHotChapters(data.hotChapters || []);
    renderHotComics(data.hotComics || []);
  } catch {}
}

function renderHotBooks(items) {
  const el = document.getElementById('hot-books');
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML =
    '<h4 style="margin:0 0 8px;font-size:14px;color:var(--text-light)">🔥 近30天热门书籍</h4>' +
    '<ul style="list-style:none;padding:0;margin:0">' +
    items
      .map((b, i) => {
        const title = esc(b?.title || '未命名');
        const views = fmtCount(b?.total_views || 0);
        return `<li style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:14px"><span>${i + 1}. ${title}</span><span style="color:var(--text-light)">${views} 次</span></li>`;
      })
      .join('') +
    '</ul>';
}

function renderHotChapters(items) {
  const el = document.getElementById('hot-chapters');
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML =
    '<h4 style="margin:0 0 8px;font-size:14px;color:var(--text-light)">🔥 热门章节（累计）</h4>' +
    '<ul style="list-style:none;padding:0;margin:0">' +
    items
      .map((c, i) => {
        const bookTitle = esc(c?.book_title || '未知书籍');
        const chTitle = esc(c?.chapter_title || '未命名章节');
        const views = fmtCount(c?.views || 0);
        return `<li style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:14px"><span>${i + 1}. ${bookTitle} / ${chTitle}</span><span style="color:var(--text-light)">${views} 次</span></li>`;
      })
      .join('') +
    '</ul>';
}

function renderHotComics(items) {
  const el = document.getElementById('hot-comics');
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML =
    '<h4 style="margin:0 0 8px;font-size:14px;color:var(--text-light)">🔥 近30天热门漫画</h4>' +
    '<ul style="list-style:none;padding:0;margin:0">' +
    items
      .map((c, i) => {
        const title = esc(c?.title || '未命名');
        const views = fmtCount(c?.total_views || 0);
        return `<li style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:14px"><span>${i + 1}. ${title}</span><span style="color:var(--text-light)">${views} 次</span></li>`;
      })
      .join('') +
    '</ul>';
}
