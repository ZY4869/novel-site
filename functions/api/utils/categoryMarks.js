const DEFAULT_MAX_MARKS = 20;
const DEFAULT_MAX_MARK_LEN = 30;

const SPLIT_RE = /[,\uFF0C\u3001\s]+/g;

export function normalizeMarks(input, { max = DEFAULT_MAX_MARKS, maxLen = DEFAULT_MAX_MARK_LEN } = {}) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) && typeof input !== 'string') return [];

  const maxCount = Number.isFinite(max) && max > 0 ? Math.floor(max) : DEFAULT_MAX_MARKS;
  const maxItemLen = Number.isFinite(maxLen) && maxLen > 0 ? Math.floor(maxLen) : DEFAULT_MAX_MARK_LEN;

  const out = [];
  const seen = new Set();

  const push = (raw) => {
    const s = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!s) return;
    const clipped = s.slice(0, maxItemLen);
    const key = clipped.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clipped);
  };

  const add = (value) => {
    const s = String(value || '').trim();
    if (!s) return;
    for (const part of s.split(SPLIT_RE)) push(part);
  };

  if (Array.isArray(input)) {
    for (const it of input) add(it);
  } else {
    add(input);
  }

  return out.slice(0, maxCount);
}

