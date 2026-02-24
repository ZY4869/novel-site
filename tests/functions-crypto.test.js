import { describe, expect, it } from 'vitest';

import { hmacSign, hmacVerify, sha256Hash } from '../functions/api/utils/crypto.js';

describe('functions/api/utils/crypto.js', () => {
  it('sha256Hash: abc', async () => {
    await expect(sha256Hash('abc')).resolves.toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hmacSign + hmacVerify', async () => {
    const sig = await hmacSign('data', 'secret');
    expect(await hmacVerify('data', sig, 'secret')).toBe(true);
    expect(await hmacVerify('data', sig, 'wrong-secret')).toBe(false);
    expect(await hmacVerify('data', `${sig}00`, 'secret')).toBe(false);
  });
});

