export const THEMES = ['light', 'dark', 'green', 'sepia', 'blue'];
export const THEME_ICONS = { light: '🌙', dark: '☀️', green: '🍃', sepia: '📜', blue: '💧' };

export function getNextTheme(current) {
  const idx = THEMES.indexOf(current);
  return THEMES[(idx + 1) % THEMES.length] || 'light';
}

export function getSavedTheme() {
  try {
    return localStorage.getItem('theme') || 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme) {
  const t = theme || 'light';
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem('theme', t);
  } catch {}
  return t;
}

export function updateThemeButton(buttonEl, theme) {
  if (!buttonEl) return;
  buttonEl.textContent = THEME_ICONS[theme] || '🌙';
}

export function initThemeToggle(buttonEl) {
  const initial = applyTheme(getSavedTheme());
  updateThemeButton(buttonEl, initial);
  if (!buttonEl) return;
  buttonEl.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = getNextTheme(current);
    updateThemeButton(buttonEl, applyTheme(next));
  });
}

