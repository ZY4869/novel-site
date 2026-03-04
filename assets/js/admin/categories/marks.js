export function parseMarksInput(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  return raw
    .split(/[,，\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function marksToText(marks) {
  const arr = Array.isArray(marks) ? marks : [];
  return arr
    .map((x) => String(x))
    .filter(Boolean)
    .join(', ');
}

