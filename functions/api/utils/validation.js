export function validateId(id) {
  return /^\d+$/.test(String(id));
}

export async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function parseNullableInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };

  let n;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    const s = value.trim();
    if (!/^\d+$/.test(s)) return { ok: false, value: undefined };
    n = Number(s);
  } else {
    return { ok: false, value: undefined };
  }

  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, value: undefined };
  if (n < min || n > max) return { ok: false, value: undefined };
  return { ok: true, value: n };
}

export function sanitizeFilename(name, maxLen = 120) {
  const raw = String(name || '').trim();
  const safe = raw
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, maxLen);
  return safe || 'file';
}
