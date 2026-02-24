import { sha256Hash } from './crypto.js';

function timingSafeEqualStr(a, b) {
  const as = String(a);
  const bs = String(b);
  let diff = as.length ^ bs.length;
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) diff |= (as.charCodeAt(i) || 0) ^ (bs.charCodeAt(i) || 0);
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  const hashHex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const saltHex = [...salt].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:100000:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password, stored) {
  // 兼容旧格式（纯 64位 hex = 无盐 SHA-256），验证后自动迁移
  if (!stored.startsWith('pbkdf2:')) {
    const oldHash = await sha256Hash(password);
    return { match: timingSafeEqualStr(oldHash, stored), needsMigration: true };
  }

  const [, iterations, saltHex, hashHex] = stored.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((b) => parseInt(b, 16)));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: Number(iterations), hash: 'SHA-256' },
    key,
    256
  );
  const computed = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { match: timingSafeEqualStr(computed, hashHex), needsMigration: false };
}

