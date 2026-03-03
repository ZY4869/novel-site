import { describe, expect, it } from 'vitest';

import { sanitizeRepoPath } from '../functions/api/utils/githubRepoContent.js';

describe('functions/api/utils/githubRepoContent.js', () => {
  it('sanitizeRepoPath: accept within prefix', () => {
    expect(sanitizeRepoPath('novels/a.txt', ['novels/'])).toBe('novels/a.txt');
    expect(sanitizeRepoPath('novels/', ['novels/'])).toBe('novels');
    expect(sanitizeRepoPath('novels', ['novels/'])).toBe('novels');
    expect(sanitizeRepoPath('/novels/a.txt', ['novels/'])).toBe('novels/a.txt');
  });

  it('sanitizeRepoPath: reject traversal / invalid', () => {
    expect(() => sanitizeRepoPath('', ['novels/'])).toThrow();
    expect(() => sanitizeRepoPath('   ', ['novels/'])).toThrow();
    expect(() => sanitizeRepoPath('../evil.txt', ['novels/'])).toThrow();
    expect(() => sanitizeRepoPath('novels/../evil.txt', ['novels/'])).toThrow();
    expect(() => sanitizeRepoPath('novels\\evil.txt', ['novels/'])).toThrow();
  });

  it('sanitizeRepoPath: reject outside base dir', () => {
    expect(() => sanitizeRepoPath('comics/a.txt', ['novels/'])).toThrow();
  });

  it('sanitizeRepoPath: reject empty allowedPrefixes', () => {
    expect(() => sanitizeRepoPath('novels/a.txt', [])).toThrow();
    expect(() => sanitizeRepoPath('novels/a.txt', [''])).toThrow();
  });
});

