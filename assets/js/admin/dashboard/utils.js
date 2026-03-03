export function prefersReducedMotion() {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  } catch {
    return false;
  }
}

export function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

export function fmtCount(n) {
  return toInt(n, 0).toLocaleString();
}

export function fmtWan(n) {
  const v = toInt(n, 0);
  return v >= 10000 ? `${(v / 10000).toFixed(1)} 万` : v.toLocaleString();
}

export function animateNumber(el, toValue, { formatter = fmtCount, durationMs = 520 } = {}) {
  if (!el) return;
  const target = toInt(toValue, 0);
  if (prefersReducedMotion()) {
    el.textContent = formatter(target);
    el.dataset.lastNumber = String(target);
    return;
  }

  const from = toInt(el.dataset.lastNumber, 0);
  const start = performance.now();
  const delta = target - from;

  function tick(now) {
    const p = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = from + delta * eased;
    el.textContent = formatter(Math.floor(val));
    if (p < 1) requestAnimationFrame(tick);
    else el.dataset.lastNumber = String(target);
  }

  requestAnimationFrame(tick);
}

export function animateProgress(fillEl, pct) {
  if (!fillEl) return;
  const safe = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  if (prefersReducedMotion()) {
    fillEl.style.width = `${safe}%`;
    return;
  }
  fillEl.style.width = '0%';
  requestAnimationFrame(() => {
    fillEl.style.width = `${safe}%`;
  });
}

export function dateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export function normalizeDaily(daily, days = 30) {
  const map = new Map();
  for (const row of daily || []) map.set(String(row.date || ''), toInt(row.views, 0));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dateStr(Date.now() - i * 86400000);
    out.push({ date, views: map.get(date) || 0 });
  }
  return out;
}

