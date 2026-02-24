import { applyTheme } from '../shared/theme.js';
import { state, dom } from './state.js';
import { applyReadingMode, pagerRecalc } from './pager.js';

export function applyAllSettings() {
  const root = document.documentElement;
  state.settings.theme = applyTheme(state.settings.theme);
  root.style.setProperty('--font-size', `${state.settings.fontSize}px`);
  root.style.setProperty('--line-height', state.settings.lineHeight);
  root.style.setProperty('--letter-spacing', '0.02em');
  root.style.setProperty('--font-family', state.settings.fontFamily);
  root.style.setProperty('--reading-width', `${state.settings.readingWidth}px`);
  applyReadingMode();
}

export function initSettingsPanel() {
  if (dom.themeOptions) {
    dom.themeOptions.addEventListener('click', (e) => {
      const dot = e.target.closest('.theme-dot');
      if (!dot) return;
      state.settings.theme = dot.dataset.theme;
      applyAllSettings();
      updateSettingsUI();
    });
  }

  if (dom.fontOptions) {
    dom.fontOptions.addEventListener('click', (e) => {
      const opt = e.target.closest('.font-option');
      if (!opt) return;
      state.settings.fontFamily = opt.dataset.font;
      saveSetting('font-family', state.settings.fontFamily);
      applyAllSettings();
      updateSettingsUI();
      if (state.settings.readingMode === 'pager') {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => pagerRecalc());
        });
      }
    });
  }

  if (dom.fontSizeSlider) {
    dom.fontSizeSlider.addEventListener('input', (e) => {
      state.settings.fontSize = Number.parseInt(e.target.value, 10);
      saveSetting('font-size', state.settings.fontSize);
      if (dom.fontSizeVal) dom.fontSizeVal.textContent = `${state.settings.fontSize}px`;
      applyAllSettings();
      if (state.settings.readingMode === 'pager') debouncedPagerRecalc();
    });
  }

  if (dom.lineHeightSlider) {
    dom.lineHeightSlider.addEventListener('input', (e) => {
      state.settings.lineHeight = Number.parseFloat(e.target.value);
      saveSetting('line-height', state.settings.lineHeight);
      if (dom.lineHeightVal) dom.lineHeightVal.textContent = state.settings.lineHeight.toFixed(1);
      applyAllSettings();
      if (state.settings.readingMode === 'pager') debouncedPagerRecalc();
    });
  }

  if (dom.widthSlider) {
    dom.widthSlider.addEventListener('input', (e) => {
      state.settings.readingWidth = Number.parseInt(e.target.value, 10);
      saveSetting('reading-width', state.settings.readingWidth);
      if (dom.widthVal) dom.widthVal.textContent = `${state.settings.readingWidth}px`;
      applyAllSettings();
      if (state.settings.readingMode === 'pager') debouncedPagerRecalc();
    });
  }

  if (dom.modeOptions) {
    dom.modeOptions.addEventListener('click', (e) => {
      const opt = e.target.closest('.mode-option');
      if (!opt) return;
      const newMode = opt.dataset.mode;
      if (newMode === state.settings.readingMode) return;
      state.settings.readingMode = newMode;
      saveSetting('reading-mode', newMode);
      applyAllSettings();
      updateSettingsUI();
    });
  }

  if (dom.barSettings) {
    dom.barSettings.addEventListener('click', () => {
      updateSettingsUI();
      if (dom.settingsOverlay) dom.settingsOverlay.classList.add('active');
    });
  }
  if (dom.closeSettings) dom.closeSettings.addEventListener('click', () => dom.settingsOverlay?.classList.remove('active'));
  if (dom.settingsOverlay) {
    dom.settingsOverlay.addEventListener('click', (e) => {
      if (e.target === dom.settingsOverlay) dom.settingsOverlay.classList.remove('active');
    });
  }

  if (dom.barToc) {
    dom.barToc.addEventListener('click', () => {
      dom.tocOverlay?.classList.add('active');
      const cur = document.querySelector('.toc-list a.current');
      if (cur) cur.scrollIntoView({ block: 'center' });
    });
  }
  if (dom.tocOverlay) {
    dom.tocOverlay.addEventListener('click', (e) => {
      if (e.target === dom.tocOverlay) dom.tocOverlay.classList.remove('active');
    });
  }
}

export function updateSettingsUI() {
  document.querySelectorAll('.theme-dot').forEach((d) => {
    d.classList.toggle('active', d.dataset.theme === state.settings.theme);
  });
  document.querySelectorAll('.font-option').forEach((o) => {
    o.classList.toggle('active', o.dataset.font === state.settings.fontFamily);
  });

  if (dom.fontSizeSlider) dom.fontSizeSlider.value = String(state.settings.fontSize);
  if (dom.fontSizeVal) dom.fontSizeVal.textContent = `${state.settings.fontSize}px`;

  if (dom.lineHeightSlider) dom.lineHeightSlider.value = String(state.settings.lineHeight);
  if (dom.lineHeightVal) dom.lineHeightVal.textContent = state.settings.lineHeight.toFixed(1);

  if (dom.widthSlider) dom.widthSlider.value = String(state.settings.readingWidth);
  if (dom.widthVal) dom.widthVal.textContent = `${state.settings.readingWidth}px`;

  document.querySelectorAll('.mode-option').forEach((o) => {
    o.classList.toggle('active', o.dataset.mode === state.settings.readingMode);
  });
}

function saveSetting(key, val) {
  try {
    localStorage.setItem(key, String(val));
  } catch {}
}

let pagerDebounceTimer = null;
function debouncedPagerRecalc() {
  if (pagerDebounceTimer) clearTimeout(pagerDebounceTimer);
  pagerDebounceTimer = setTimeout(pagerRecalc, 100);
}

