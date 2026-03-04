export function parseGhKey(key) {
  if (typeof key !== 'string') return null;
  const s = key.trim();
  if (!s.startsWith('gh:')) return null;

  const rest = s.slice(3);
  if (!rest) return null;

  const m = rest.match(/^(\d+):(.*)$/);
  if (m) {
    const repoId = Number(m[1] || 0);
    const path = String(m[2] || '').trim();
    if (!Number.isFinite(repoId) || repoId <= 0) return null;
    if (!path) return null;
    return { repoId, path };
  }

  const path = rest.trim();
  if (!path) return null;
  return { repoId: null, path };
}

