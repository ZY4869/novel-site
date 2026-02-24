import { state, dom } from './state.js';

export function initPager() {
  if (dom.pagerTapLeft) dom.pagerTapLeft.addEventListener('click', (e) => { e.stopPropagation(); pagerPrev(); });
  if (dom.pagerTapRight) dom.pagerTapRight.addEventListener('click', (e) => { e.stopPropagation(); pagerNext(); });

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  document.addEventListener(
    'touchstart',
    (e) => {
      if (state.settings.readingMode !== 'pager') return;
      if (e.target.closest('.settings-panel') || e.target.closest('.toc-panel') || e.target.closest('.reader-bottom-bar')) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    },
    { passive: true }
  );

  document.addEventListener(
    'touchend',
    (e) => {
      if (state.settings.readingMode !== 'pager') return;
      if (e.target.closest('.settings-panel') || e.target.closest('.toc-panel') || e.target.closest('.reader-bottom-bar')) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      const dt = Date.now() - touchStartTime;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && dt < 500) {
        if (dx < 0) pagerNext();
        else pagerPrev();
      }
    },
    { passive: true }
  );

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (state.settings.readingMode !== 'pager') return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(pagerRecalc, 200);
  });
}

export function applyReadingMode() {
  const isPager = state.settings.readingMode === 'pager';
  document.body.classList.toggle('pager-mode', isPager);

  if (dom.pagerTapLeft) dom.pagerTapLeft.style.display = isPager ? 'block' : 'none';
  if (dom.pagerTapRight) dom.pagerTapRight.style.display = isPager ? 'block' : 'none';
  if (dom.pagerIndicator) dom.pagerIndicator.style.display = isPager ? '' : 'none';

  if (isPager) {
    pagerRecalc();
    return;
  }

  const content = document.querySelector('.reader-content');
  if (content) {
    const ratio =
      state.pagerState.totalPages > 1 ? state.pagerState.currentPage / (state.pagerState.totalPages - 1) : 0;
    content.style.transition = 'none';
    content.style.transform = '';
    content.style.height = '';
    content.style.columnWidth = '';
    content.style.columnGap = '';
    content.offsetHeight;
    content.style.transition = '';

    if (ratio > 0) {
      requestAnimationFrame(() => {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        if (h > 0) window.scrollTo(0, h * ratio);
      });
    }
  }
}

export function pagerRecalc() {
  if (state.settings.readingMode !== 'pager') return;
  const content = document.querySelector('.reader-content');
  if (!content) return;

  const oldRatio =
    state.pagerState.totalPages > 1 ? state.pagerState.currentPage / (state.pagerState.totalPages - 1) : 0;

  const reader = dom.readerArea || document.getElementById('reader-area');
  if (!reader) return;

  const readerRect = reader.getBoundingClientRect();
  const titleEl = reader.querySelector('h2');
  const titleH = titleEl ? titleEl.offsetHeight + 16 : 0;
  const availH = readerRect.height - titleH;
  if (availH <= 0) return;

  const colW = readerRect.width;
  state.pagerState.columnWidth = colW;

  content.style.transition = 'none';
  content.style.transform = 'translateX(0)';
  content.style.height = `${availH}px`;
  content.style.columnWidth = `${colW}px`;
  content.style.columnGap = `${colW}px`;

  const scrollW = content.scrollWidth;
  if (scrollW <= colW) state.pagerState.totalPages = 1;
  else state.pagerState.totalPages = Math.round((scrollW / colW + 1) / 2);
  state.pagerState.totalPages = Math.max(1, state.pagerState.totalPages);

  if (state.pagerState.totalPages > 1) {
    state.pagerState.currentPage = Math.min(
      Math.round(oldRatio * (state.pagerState.totalPages - 1)),
      state.pagerState.totalPages - 1
    );
  } else {
    state.pagerState.currentPage = 0;
  }
  state.pagerState.currentPage = Math.max(0, state.pagerState.currentPage);
  pagerGoTo(state.pagerState.currentPage, false);
}

export function pagerGoTo(page, animate) {
  const content = document.querySelector('.reader-content');
  if (!content) return;

  const clampedPage = Math.max(0, Math.min(page, state.pagerState.totalPages - 1));
  state.pagerState.currentPage = clampedPage;

  const offset = clampedPage * state.pagerState.columnWidth * 2;
  content.style.transition =
    animate === false ? 'none' : 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  content.style.transform = `translateX(-${offset}px)`;

  if (animate === false) {
    content.offsetHeight;
    content.style.transition = '';
  }

  pagerUpdateIndicator();
  savePagerProgress();
}

function pagerUpdateIndicator() {
  if (!dom.pagerIndicator) return;
  dom.pagerIndicator.textContent = `${state.pagerState.currentPage + 1} / ${state.pagerState.totalPages}`;
}

export function pagerNext() {
  if (state.pagerState.currentPage < state.pagerState.totalPages - 1) pagerGoTo(state.pagerState.currentPage + 1, true);
  else if (state.nav.nextUrl) location.href = state.nav.nextUrl;
}

export function pagerPrev() {
  if (state.pagerState.currentPage > 0) pagerGoTo(state.pagerState.currentPage - 1, true);
  else if (state.nav.prevUrl) location.href = state.nav.prevUrl;
}

function savePagerProgress() {
  if (!state.chapterMeta) return;
  const m = state.chapterMeta;
  const pct =
    state.pagerState.totalPages > 1 ? state.pagerState.currentPage / (state.pagerState.totalPages - 1) : 0;
  try {
    const progress = {
      chapterId: m.chapterId,
      chapterTitle: m.chapterTitle,
      bookTitle: m.bookTitle,
      bookId: m.bookId,
      scrollPct: pct,
      time: Date.now(),
    };
    localStorage.setItem(`reading_${m.bookId}`, JSON.stringify(progress));
  } catch {}
}

