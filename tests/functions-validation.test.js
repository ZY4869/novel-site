import { describe, expect, it } from 'vitest';

import { parseNullableInt, sanitizeFilename, validateId } from '../functions/api/utils/validation.js';

describe('functions/api/utils/validation.js', () => {
  it('validateId', () => {
    expect(validateId(1)).toBe(true);
    expect(validateId('001')).toBe(true);
    expect(validateId('0')).toBe(true);
    expect(validateId('')).toBe(false);
    expect(validateId('12a')).toBe(false);
    expect(validateId('-1')).toBe(false);
  });

  it('sanitizeFilename', () => {
    expect(sanitizeFilename('a b.txt')).toBe('a_b.txt');
    expect(sanitizeFilename('a   b')).toBe('a_b');
    expect(sanitizeFilename('../evil.txt')).toBe('.._evil.txt');
    expect(sanitizeFilename('   ')).toBe('file');
    expect(sanitizeFilename('a'.repeat(50), 10)).toBe('a'.repeat(10));
  });

  it('parseNullableInt', () => {
    expect(parseNullableInt(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseNullableInt(null)).toEqual({ ok: true, value: null });

    expect(parseNullableInt(0)).toEqual({ ok: true, value: 0 });
    expect(parseNullableInt('001')).toEqual({ ok: true, value: 1 });
    expect(parseNullableInt(' 12 ')).toEqual({ ok: true, value: 12 });

    expect(parseNullableInt(-1).ok).toBe(false);
    expect(parseNullableInt(1.2).ok).toBe(false);
    expect(parseNullableInt('12a').ok).toBe(false);
    expect(parseNullableInt('').ok).toBe(false);
    expect(parseNullableInt(5, { min: 0, max: 4 }).ok).toBe(false);
  });
});
