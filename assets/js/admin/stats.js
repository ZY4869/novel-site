import { api } from './api.js';
import { esc } from './ui.js';

export async function loadStats() {
  try {
    const res = await fetch('/api/books');
    const data = await res.json();
    const books = data.books || [];
    const totalChapters = books.reduce((s, b) => s + (b.chapter_count || 0), 0);
    const totalWords = books.reduce((s, b) => s + (b.total_words || 0), 0);
    setText('stat-books', books.length);
    setText('stat-chapters', totalChapters);
    setText('stat-words', totalWords >= 10000 ? `${(totalWords / 10000).toFixed(1)} 万` : totalWords.toLocaleString());
  } catch {}

  try {
    const res = await api('GET', '/api/admin/stats');
    const data = await res.json();
    setText('stat-pv', (data.today?.pv || 0).toLocaleString());
    setText('stat-uv', (data.today?.uv || 0).toLocaleString());

    const totalPv = data.totals?.total_pv || 0;
    setText('stat-total-pv', totalPv >= 10000 ? `${(totalPv / 10000).toFixed(1)} 万` : totalPv.toLocaleString());

    const hotEl = document.getElementById('hot-books');
    if (!hotEl) return;
    if (data.hotBooks && data.hotBooks.length > 0) {
      hotEl.innerHTML =
        '<h4 style="margin:0 0 8px;font-size:14px;color:var(--text-light)">🔥 近30天热门书籍</h4>' +
        '<ul style="list-style:none;padding:0;margin:0">' +
        data.hotBooks
          .map(
            (b, i) =>
              `<li style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:14px"><span>${i + 1}. ${esc(b.title)}</span><span style="color:var(--text-light)">${b.total_views} 次</span></li>`
          )
          .join('') +
        '</ul>';
    } else {
      hotEl.innerHTML = '';
    }
  } catch {}
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(v);
}

