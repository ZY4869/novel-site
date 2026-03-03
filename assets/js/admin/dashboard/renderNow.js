import { esc } from '../ui.js';
import { animateNumber, animateProgress, toInt } from './utils.js';

export function renderNow(now) {
  const root = document.getElementById('dashboard-now');
  const titleEl = root?.querySelector('.dash-card-title');
  const body = document.getElementById('dashboard-now-body');
  if (!body) return;

  body.classList.add('dash-fade');

  if (!now) {
    if (titleEl) titleEl.textContent = '正在观看';
    body.innerHTML = '<div style="color:var(--text-light);font-size:13px">暂无记录（阅读页滚动/翻页后会自动记录）</div>';
    return;
  }

  const title = esc(now.title || '未命名');
  const subtitle = esc(now.subtitle || '');
  const pct = toInt(now.progressPct, 0);
  const updatedAt = now.updatedAt ? new Date(now.updatedAt).toLocaleString('zh-CN') : '';
  const href = String(now.href || '').trim();

  if (titleEl) {
    titleEl.innerHTML = `正在观看${href ? ` <a class="dash-link" href="${esc(href)}" target="_blank" rel="noopener">继续</a>` : ''}`;
  }

  body.innerHTML = `
    <div class="dash-progress-row">
      <div style="min-width:0">
        <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
        <div style="color:var(--text-light);font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subtitle}</div>
      </div>
      <div style="font-weight:800;color:var(--accent)"><span data-dash-pct="1">0</span>%</div>
    </div>
    <div class="dash-progress-bar"><div class="dash-progress-fill" data-dash-progress="1"></div></div>
    ${updatedAt ? `<div style="margin-top:8px;color:var(--text-light);font-size:12px">更新：${esc(updatedAt)}</div>` : ''}
  `;

  animateNumber(body.querySelector('[data-dash-pct="1"]'), pct, { formatter: (n) => String(toInt(n, 0)), durationMs: 420 });
  animateProgress(body.querySelector('[data-dash-progress="1"]'), pct);
}

