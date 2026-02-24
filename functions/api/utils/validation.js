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

export function sanitizeFilename(name, maxLen = 120) {
  const raw = String(name || '').trim();
  const safe = raw
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, maxLen);
  return safe || 'file';
}

