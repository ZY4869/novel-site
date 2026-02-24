import { state, dom } from './state.js';
import { pagerRecalc } from './pager.js';

export function initImmersive() {
  if (dom.barImmersive) dom.barImmersive.addEventListener('click', toggleImmersive);

  if (dom.readerArea) {
    dom.readerArea.addEventListener('click', (e) => {
      if (!state.immersiveActive) return;
      if (e.target.closest('a') || e.target.closest('button')) return;
      const x = e.clientX;
      const w = window.innerWidth;
      if (state.settings.readingMode === 'pager') {
        if (x > w * 0.3 && x < w * 0.7) exitImmersive();
      } else {
        if (x > w * 0.25 && x < w * 0.75) exitImmersive();
      }
    });
  }

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state.immersiveActive) {
      state.immersiveActive = false;
      document.body.classList.remove('immersive');
      if (state.settings.readingMode === 'pager') requestAnimationFrame(() => requestAnimationFrame(() => pagerRecalc()));
    }
  });
}

export function toggleImmersive() {
  state.immersiveActive = !state.immersiveActive;
  document.body.classList.toggle('immersive', state.immersiveActive);

  if (state.immersiveActive) {
    document.documentElement.requestFullscreen().catch(() => {});
    if (dom.immersiveHint) {
      dom.immersiveHint.classList.add('show');
      setTimeout(() => dom.immersiveHint?.classList.remove('show'), 2000);
    }
  } else {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  if (state.settings.readingMode === 'pager') requestAnimationFrame(() => requestAnimationFrame(() => pagerRecalc()));
}

export function exitImmersive() {
  if (!state.immersiveActive) return;
  state.immersiveActive = false;
  document.body.classList.remove('immersive');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (state.settings.readingMode === 'pager') requestAnimationFrame(() => requestAnimationFrame(() => pagerRecalc()));
}

