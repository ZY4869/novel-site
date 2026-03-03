import { esc } from '../ui.js';
import {
  animateNumber,
  animateProgress,
  fmtCount,
  fmtWan,
  normalizeDaily,
  prefersReducedMotion,
  toInt,
} from './utils.js';

function renderDailyBars(daily) {
  const data = normalizeDaily(daily || [], 30);
  const max = Math.max(1, ...data.map((x) => toInt(x.views, 0)));
  const bars = data
    .map((x) => {
      const h = `${Math.max(2, Math.round((toInt(x.views, 0) / max) * 100))}%`;
      const title = `${x.date} / ${fmtCount(x.views)} 次`;
      return `<div class="dash-bar" style="--h:${h}" title="${esc(title)}"></div>`;
    })
    .join('');
  return `<div class="dash-bars" data-dash-bars="1">${bars}</div>`;
}

export function renderDetailEmpty() {
  const body = document.getElementById('dashboard-detail-body');
  if (!body) return;
  body.classList.add('dash-fade');
  body.innerHTML = '<div style="color:var(--text-light);font-size:13px">请选择一本书或一部漫画</div>';
}

export function renderDetail(data) {
  const body = document.getElementById('dashboard-detail-body');
  const root = document.getElementById('dashboard-detail');
  const titleEl = root?.querySelector('.dash-card-title');
  if (!body) return;

  body.classList.add('dash-fade');

  if (!data?.success) return renderDetailEmpty();

  if (data.kind === 'novel') {
    const book = data.book || {};
    const views = data.views || {};
    const progress = data.progress || null;
    const title = esc(book.title || '未命名');
    const author = book.author ? esc(book.author) : '';
    const ch = toInt(book.chapter_count || 0, 0);
    const words = toInt(book.total_words || 0, 0);
    const pct = toInt(progress?.progressPct || 0, 0);
    const subtitle = esc(progress?.subtitle || (author ? `作者：${author}` : ''));
    const href = String(progress?.href || '').trim();

    if (titleEl) {
      titleEl.innerHTML = `内容统计${href ? ` <a class="dash-link" href="${esc(href)}" target="_blank" rel="noopener">继续</a>` : ''}`;
    }

    body.innerHTML = `
      <div class="dash-progress-row">
        <div style="min-width:0">
          <div style="font-weight:800;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
          <div style="color:var(--text-light);font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subtitle}</div>
        </div>
        <div style="font-weight:900;color:var(--accent)"><span data-dash-pct="1">0</span>%</div>
      </div>
      <div class="dash-progress-bar"><div class="dash-progress-fill" data-dash-progress="1"></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;color:var(--text-light);font-size:12px">
        <span>📄 ${fmtCount(ch)} 章</span>
        <span>✍️ ${fmtWan(words)} 字</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px">
        <div class="dash-stat" style="padding:12px">
          <div class="dash-stat-value" style="font-size:18px" data-dash-num="today">${fmtWan(0)}</div>
          <div class="dash-stat-label">今日阅读</div>
        </div>
        <div class="dash-stat" style="padding:12px">
          <div class="dash-stat-value" style="font-size:18px" data-dash-num="last30">${fmtWan(0)}</div>
          <div class="dash-stat-label">近30天</div>
        </div>
        <div class="dash-stat" style="padding:12px">
          <div class="dash-stat-value" style="font-size:18px" data-dash-num="total">${fmtWan(0)}</div>
          <div class="dash-stat-label">累计</div>
        </div>
      </div>
      ${renderDailyBars(views.daily || [])}
    `;

    animateNumber(body.querySelector('[data-dash-pct="1"]'), pct, { formatter: (n) => String(toInt(n, 0)), durationMs: 420 });
    animateProgress(body.querySelector('[data-dash-progress="1"]'), pct);
    animateNumber(body.querySelector('[data-dash-num="today"]'), views.today_views || 0, { formatter: fmtWan });
    animateNumber(body.querySelector('[data-dash-num="last30"]'), views.last30_views || 0, { formatter: fmtWan });
    animateNumber(body.querySelector('[data-dash-num="total"]'), views.total_views || 0, { formatter: fmtWan });

    const bars = body.querySelector('[data-dash-bars="1"]');
    if (bars && !prefersReducedMotion()) requestAnimationFrame(() => bars.classList.add('ready'));
    return;
  }

  const comic = data.comic || {};
  const views = data.views || {};
  const progress = data.progress || null;
  const title = esc(comic.title || '未命名');
  const pages = toInt(comic.page_count || 0, 0);
  const pct = toInt(progress?.progressPct || 0, 0);
  const subtitle = esc(progress?.subtitle || '');
  const href = String(progress?.href || '').trim();

  if (titleEl) {
    titleEl.innerHTML = `内容统计${href ? ` <a class="dash-link" href="${esc(href)}" target="_blank" rel="noopener">继续</a>` : ''}`;
  }

  body.innerHTML = `
    <div class="dash-progress-row">
      <div style="min-width:0">
        <div style="font-weight:800;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
        <div style="color:var(--text-light);font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subtitle}</div>
      </div>
      <div style="font-weight:900;color:var(--accent)"><span data-dash-pct="1">0</span>%</div>
    </div>
    <div class="dash-progress-bar"><div class="dash-progress-fill" data-dash-progress="1"></div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;color:var(--text-light);font-size:12px">
      <span>📄 ${fmtCount(pages)} 页</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px">
      <div class="dash-stat" style="padding:12px">
        <div class="dash-stat-value" style="font-size:18px" data-dash-num="today">${fmtWan(0)}</div>
        <div class="dash-stat-label">今日阅读</div>
      </div>
      <div class="dash-stat" style="padding:12px">
        <div class="dash-stat-value" style="font-size:18px" data-dash-num="last30">${fmtWan(0)}</div>
        <div class="dash-stat-label">近30天</div>
      </div>
      <div class="dash-stat" style="padding:12px">
        <div class="dash-stat-value" style="font-size:18px" data-dash-num="total">${fmtWan(0)}</div>
        <div class="dash-stat-label">累计</div>
      </div>
    </div>
    ${renderDailyBars(views.daily || [])}
  `;

  animateNumber(body.querySelector('[data-dash-pct="1"]'), pct, { formatter: (n) => String(toInt(n, 0)), durationMs: 420 });
  animateProgress(body.querySelector('[data-dash-progress="1"]'), pct);
  animateNumber(body.querySelector('[data-dash-num="today"]'), views.today_views || 0, { formatter: fmtWan });
  animateNumber(body.querySelector('[data-dash-num="last30"]'), views.last30_views || 0, { formatter: fmtWan });
  animateNumber(body.querySelector('[data-dash-num="total"]'), views.total_views || 0, { formatter: fmtWan });

  const bars = body.querySelector('[data-dash-bars="1"]');
  if (bars && !prefersReducedMotion()) requestAnimationFrame(() => bars.classList.add('ready'));
}

