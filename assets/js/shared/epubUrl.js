function stripAfter(s, ch) {
  const i = s.indexOf(ch);
  return i >= 0 ? s.slice(0, i) : s;
}

export function stripFragmentAndQuery(input) {
  const s = String(input || '').trim();
  return stripAfter(stripAfter(s, '#'), '?').trim();
}

export function normalizePath(input) {
  const raw = String(input || '').replace(/\\/g, '/');
  const parts = [];
  raw.split('/').forEach((seg) => {
    if (!seg || seg === '.') return;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  });
  return parts.join('/');
}

function decodeLoosely(s) {
  const raw = String(s || '');
  try {
    return decodeURI(raw);
  } catch {}
  try {
    return decodeURIComponent(raw);
  } catch {}
  return raw;
}

function hasScheme(u) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(String(u || ''));
}

export function resolveRelativePath(baseDir, href) {
  const cleaned = stripFragmentAndQuery(href);
  if (!cleaned) return '';

  const decoded = decodeLoosely(cleaned).replace(/\\/g, '/');
  if (hasScheme(decoded)) return decoded;

  if (decoded.startsWith('/')) return normalizePath(decoded.slice(1));
  const base = String(baseDir || '');
  return normalizePath(base + decoded);
}

export function extractCssUrlRefs(cssText) {
  const css = String(cssText || '');
  const out = [];
  const re = /url\(\s*(?:'([^']*)'|"([^"]*)"|([^)\s]+))\s*\)/gi;
  let m;
  while ((m = re.exec(css))) {
    const v = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (v) out.push(v);
  }
  return out;
}

