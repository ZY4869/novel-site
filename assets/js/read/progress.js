import { state, dom } from './state.js';
import { pagerGoTo, pagerRecalc } from './pager.js';

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

