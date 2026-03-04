import { describe, expect, it } from 'vitest';

import { inferCategoryNamesFromNovelPath, inferRepoKey } from '../functions/api/utils/githubAutoCategories.js';

describe('functions/api/utils/githubAutoCategories.js', () => {
  it('inferRepoKey: owner/repo preferred, fallback otherwise', () => {
    expect(inferRepoKey({ owner: 'alice', repo: 'lib' })).toBe('alice/lib');
    expect(inferRepoKey({ owner: ' alice ', repo: ' lib ' })).toBe('alice/lib');
    expect(inferRepoKey({ owner: '', repo: 'x', fallback: 'legacy' })).toBe('legacy');
    expect(inferRepoKey({ fallback: ' repo#12 ' })).toBe('repo#12');
    expect(inferRepoKey({})).toBe('legacy');
  });

  it('inferCategoryNamesFromNovelPath: root file has no categories', () => {
    expect(
      inferCategoryNamesFromNovelPath({ repoKey: 'alice/lib', novelsPath: 'novels/', cleanPath: 'novels/a.txt' })
    ).toEqual([]);
  });

  it('inferCategoryNamesFromNovelPath: cumulative dirs with repo prefix', () => {
    expect(
      inferCategoryNamesFromNovelPath({
        repoKey: 'alice/lib',
        novelsPath: 'novels/',
        cleanPath: 'novels/盗墓小说/系列A/卷1.txt',
      })
    ).toEqual(['[alice/lib] 盗墓小说', '[alice/lib] 盗墓小说/系列A']);
  });

  it('inferCategoryNamesFromNovelPath: novelsPath=/ works', () => {
    expect(
      inferCategoryNamesFromNovelPath({
        repoKey: 'alice/lib',
        novelsPath: '/',
        cleanPath: '盗墓小说/系列A/卷1.txt',
      })
    ).toEqual(['[alice/lib] 盗墓小说', '[alice/lib] 盗墓小说/系列A']);
  });

  it('inferCategoryNamesFromNovelPath: respects max levels', () => {
    expect(
      inferCategoryNamesFromNovelPath({
        repoKey: 'alice/lib',
        novelsPath: 'novels/',
        cleanPath: 'novels/A/B/C/D/E/F.txt',
        max: 2,
      })
    ).toEqual(['[alice/lib] A', '[alice/lib] A/B']);
  });

  it('inferCategoryNamesFromNovelPath: outside base returns empty', () => {
    expect(
      inferCategoryNamesFromNovelPath({
        repoKey: 'alice/lib',
        novelsPath: 'novels/',
        cleanPath: 'comics/A/B.txt',
      })
    ).toEqual([]);
  });
});

