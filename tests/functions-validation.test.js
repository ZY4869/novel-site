import { describe, expect, it } from 'vitest';

import { sanitizeFilename, validateId } from '../functions/api/utils/validation.js';

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
});

