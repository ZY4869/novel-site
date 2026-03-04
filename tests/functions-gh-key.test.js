import { describe, expect, it } from 'vitest';

import { parseGhKey } from '../functions/api/utils/ghKey.js';

describe('functions/api/utils/ghKey.js', () => {
  it('parse new ghKey with repoId', () => {
    expect(parseGhKey('gh:123:novels/a.txt')).toEqual({ repoId: 123, path: 'novels/a.txt' });
    expect(parseGhKey(' gh:1:comics/a/b.png ')).toEqual({ repoId: 1, path: 'comics/a/b.png' });
  });

  it('parse legacy ghKey without repoId', () => {
    expect(parseGhKey('gh:novels/a.txt')).toEqual({ repoId: null, path: 'novels/a.txt' });
  });

  it('invalid formats', () => {
    expect(parseGhKey('')).toBe(null);
    expect(parseGhKey(null)).toBe(null);
    expect(parseGhKey('http://example.com')).toBe(null);
    expect(parseGhKey('gh:')).toBe(null);
    expect(parseGhKey('gh:123:')).toBe(null);
  });
});

