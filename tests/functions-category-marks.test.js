import { describe, expect, it } from 'vitest';

import { normalizeMarks } from '../functions/api/utils/categoryMarks.js';

describe('functions/api/utils/categoryMarks.js', () => {
  it('empty/invalid input', () => {
    expect(normalizeMarks(undefined)).toEqual([]);
    expect(normalizeMarks(null)).toEqual([]);
    expect(normalizeMarks(123)).toEqual([]);
    expect(normalizeMarks({ a: 1 })).toEqual([]);
  });

  it('split + trim + dedupe', () => {
    expect(normalizeMarks('NSFW, 历史  长篇，NSFW')).toEqual(['NSFW', '历史', '长篇']);
    expect(normalizeMarks(['NSFW', 'nsfw', '  历史  ', '历史'])).toEqual(['NSFW', '历史']);
    expect(normalizeMarks('A、B,C，D')).toEqual(['A', 'B', 'C', 'D']);
  });

  it('max count + max len', () => {
    const long = 'a'.repeat(100);
    expect(normalizeMarks([long], { maxLen: 30 })).toEqual(['a'.repeat(30)]);

    const many = Array.from({ length: 25 }, (_, i) => `m${i}`);
    expect(normalizeMarks(many).length).toBe(20);
  });

  it('stable output', () => {
    expect(Array.isArray(normalizeMarks('x'))).toBe(true);
    expect(Array.isArray(normalizeMarks([]))).toBe(true);
  });
});

