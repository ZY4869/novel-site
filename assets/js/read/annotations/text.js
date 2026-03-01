export function splitSentences(text) {
  if (!text || !String(text).trim()) return [];
  const raw = String(text).match(/[^。！？…!?\n]+(?:\.{2,}|[。！？…!?\n])?/g) || [String(text)];
  const merged = [];
  let buf = '';
  let depth = 0;
  for (const seg of raw) {
    buf += seg;
    for (const ch of seg) {
      if (ch === '\u201c' || ch === '\u300c' || ch === '\u300e') depth++;
      if (ch === '\u201d' || ch === '\u300d' || ch === '\u300f') depth = Math.max(0, depth - 1);
    }
    if (depth === 0) {
      const trimmed = buf.trim();
      if (trimmed) merged.push(trimmed);
      buf = '';
    }
  }
  if (buf.trim()) merged.push(buf.trim());
  return merged;
}

export function snapToSentence(paragraphText, selStart, selEnd) {
  const sentences = splitSentences(paragraphText);
  let pos = 0;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const sStart = String(paragraphText).indexOf(s, pos);
    const sEnd = sStart + s.length;
    if (selStart < sEnd && selEnd > sStart) {
      return { text: s, sentIdx: i, start: sStart, end: sEnd };
    }
    pos = sEnd;
  }
  return null;
}

export async function sentenceHash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
  return [...new Uint8Array(buf)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function annotationOpacity(count) {
  if (count <= 0) return 0;
  const min = 0.3;
  const max = 0.9;
  return Math.min(max, min + (max - min) * (Math.log10(count) / Math.log10(20)));
}

