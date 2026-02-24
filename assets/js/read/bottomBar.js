import { state, dom } from './state.js';

export function initBottomBar() {
  if (dom.bottomBar) dom.bottomBar.classList.add('visible');
  let barVisible = true;

  if (dom.readerArea && dom.bottomBar) {
    dom.readerArea.addEventListener('click', (e) => {
      if (state.immersiveActive) return;
      if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.reader-nav')) return;

      if (state.settings.readingMode === 'pager') {
        const x = e.clientX;
        const w = window.innerWidth;
        if (x < w * 0.35 || x > w * 0.65) return;
      }

      barVisible = !barVisible;
      dom.bottomBar.classList.toggle('visible', barVisible);
    });
  }

  if (dom.barPrev) {
    dom.barPrev.addEventListener('click', () => {
      if (state.nav.prevUrl) location.href = state.nav.prevUrl;
    });
  }
  if (dom.barNext) {
    dom.barNext.addEventListener('click', () => {
      if (state.nav.nextUrl) location.href = state.nav.nextUrl;
    });
  }
}

