function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualStr(a, b) {
  const as = String(a);
  const bs = String(b);
  let diff = as.length ^ bs.length;
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) diff |= (as.charCodeAt(i) || 0) ^ (bs.charCodeAt(i) || 0);
  return diff === 0;
}

// SHA-256 哈希（用于 token / IP 的存储哈希）
export async function sha256Hash(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hash));
}

export function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return bytesToHex(new Uint8Array(sig));
}

export async function hmacVerify(data, signature, secret) {
  const expected = await hmacSign(data, secret);
  return timingSafeEqualStr(expected, signature);
}

