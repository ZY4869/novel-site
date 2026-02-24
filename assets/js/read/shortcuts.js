import { getNextTheme } from '../shared/theme.js';
import { state, dom } from './state.js';
import { pagerNext, pagerPrev } from './pager.js';
import { applyAllSettings, updateSettingsUI } from './settings.js';
import { exitImmersive, toggleImmersive } from './immersive.js';

export function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === 'ArrowLeft') {
      if (state.settings.readingMode === 'pager') pagerPrev();
      else if (state.nav.prevUrl) location.href = state.nav.prevUrl;
      return;
    }

    if (e.key === 'ArrowRight') {
      if (state.settings.readingMode === 'pager') pagerNext();
      else if (state.nav.nextUrl) location.href = state.nav.nextUrl;
      return;
    }

    if (e.key === 'Escape') {
      if (state.immersiveActive) {
        exitImmersive();
        return;
      }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        return;
      }
      if (dom.settingsOverlay?.classList.contains('active')) dom.settingsOverlay.classList.remove('active');
      else if (dom.tocOverlay?.classList.contains('active')) dom.tocOverlay.classList.remove('active');
      else if (state.nav.backUrl) location.href = state.nav.backUrl;
      return;
    }

    if (e.key === 'i' || e.key === 'I') {
      toggleImmersive();
      return;
    }

    if (e.key === 't' || e.key === 'T') {
      state.settings.theme = getNextTheme(state.settings.theme);
      applyAllSettings();
      updateSettingsUI();
      return;
    }

    if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else document.documentElement.requestFullscreen().catch(() => {});
      return;
    }

    if (e.key === 's' || e.key === 'S') {
      dom.settingsOverlay?.classList.toggle('active');
    }
  });
}

