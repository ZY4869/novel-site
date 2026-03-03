import { state, dom } from './state.js';
import { pagerGoTo, pagerRecalc } from './pager.js';

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

function shouldReportAdminProgress(payload) {
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

function reportAdminProgress(payload) {
  try {
    fetch('/api/admin/progress', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {}
}

export function initProgress() {
  if (dom.backTop) {
    dom.backTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  let scrollSaveTimer = null;
  window.addEventListener('scroll', () => {
    if (state.settings.readingMode === 'pager') return;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const pct = h > 0 ? (window.scrollY / h) * 100 : 0;
    if (dom.progressBar) dom.progressBar.style.width = `${pct}%`;
    if (dom.backTop) dom.backTop.classList.toggle('visible', window.scrollY > 400);

    if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(saveScrollPosition, 1000);
  });
}

export function saveScrollPosition() {
  if (!state.chapterMeta) return;
  if (state.settings.readingMode === 'pager') return;
  const m = state.chapterMeta;
  const h = document.documentElement.scrollHeight - window.innerHeight;
  const pct = h > 0 ? window.scrollY / h : 0;
  const progress = {
    chapterId: m.chapterId,
    chapterTitle: m.chapterTitle,
    bookTitle: m.bookTitle,
    bookId: m.bookId,
    scrollPct: pct,
    time: Date.now(),
  };
  try {
    localStorage.setItem(`reading_${m.bookId}`, JSON.stringify(progress));
  } catch {}

  const payload = buildAdminProgressPayload(m, clamp01(pct));
  if (payload && shouldReportAdminProgress(payload)) reportAdminProgress(payload);
}

export function restoreScrollPosition(bookId, currentChapterId) {
  try {
    const saved = JSON.parse(localStorage.getItem(`reading_${bookId}`));
    if (saved && saved.chapterId === currentChapterId && saved.scrollPct > 0) {
      if (state.settings.readingMode === 'pager') {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            pagerRecalc();
            const page = Math.round(saved.scrollPct * (state.pagerState.totalPages - 1));
            pagerGoTo(page, false);
          });
        });
      } else {
        requestAnimationFrame(() => {
          const h = document.documentElement.scrollHeight - window.innerHeight;
          if (h > 0) window.scrollTo(0, h * saved.scrollPct);
        });
      }
    } else if (state.settings.readingMode === 'pager') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => pagerRecalc());
      });
    }
  } catch {
    if (state.settings.readingMode === 'pager') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => pagerRecalc());
      });
    }
  }
}
