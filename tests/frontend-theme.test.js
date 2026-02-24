import { describe, expect, it } from 'vitest';

import { getNextTheme, THEMES } from '../assets/js/shared/theme.js';

describe('assets/js/shared/theme.js', () => {
  it('getNextTheme cycles through THEMES', () => {
    for (let i = 0; i < THEMES.length; i++) {
      const cur = THEMES[i];
      const next = THEMES[(i + 1) % THEMES.length];
      expect(getNextTheme(cur)).toBe(next);
    }
  });

  it('getNextTheme falls back to light', () => {
    expect(getNextTheme('not-a-theme')).toBe('light');
  });
});

