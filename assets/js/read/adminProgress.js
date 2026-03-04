const ADMIN_PROGRESS_MIN_INTERVAL_MS = 15000;
const ADMIN_PROGRESS_MIN_DELTA = 0.03;

let lastAdminProgressAt = 0;
let lastAdminProgressKey = '';
let lastAdminProgressScroll = 0;

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function buildAdminProgressPayload(meta, scrollPct) {
  const bookId = Number(meta?.bookId || 0) || 0;
  if (!bookId) return null;

  const chapterIdRaw = meta?.chapterId;
  if (typeof chapterIdRaw === 'number' || /^\d+$/.test(String(chapterIdRaw || ''))) {
    return { kind: 'novel', bookId, chapterId: Number(chapterIdRaw), scrollPct };
  }

  const m = String(chapterIdRaw || '').match(/^src-(\d+)-(\d+)$/);
  if (!m) return null;
  const srcBookId = Number(m[1] || 0) || 0;
  const sourceChapterIndex = Number(m[2] || 0) || 0;
  if (!srcBookId || !sourceChapterIndex) return null;

  return { kind: 'novel', bookId: srcBookId, sourceChapterIndex, scrollPct };
}

function shouldReport(payload) {
  const now = Date.now();
  const key = `${payload.kind}:${payload.bookId}:${payload.chapterId || `src-${payload.sourceChapterIndex}`}`;
  const delta = Math.abs(clamp01(payload.scrollPct) - lastAdminProgressScroll);

  if (key === lastAdminProgressKey) {
    if (now - lastAdminProgressAt < ADMIN_PROGRESS_MIN_INTERVAL_MS && delta < ADMIN_PROGRESS_MIN_DELTA) return false;
  }

  lastAdminProgressAt = now;
  lastAdminProgressKey = key;
  lastAdminProgressScroll = clamp01(payload.scrollPct);
  return true;
}

function report(payload) {
  try {
    fetch('/api/admin/progress', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {}
}

export function maybeReportAdminProgress(meta, scrollPct) {
  const payload = buildAdminProgressPayload(meta, clamp01(scrollPct));
  if (!payload) return;
  if (!shouldReport(payload)) return;
  report(payload);
}

