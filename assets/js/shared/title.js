const BRACKET_PAIRS = [
  ['【', '】'],
  ['[', ']'],
  ['(', ')'],
  ['（', '）'],
  ['{', '}'],
  ['「', '」'],
  ['『', '』'],
];

const FORMAT_TAGS = new Set(['EPUB', 'TXT', 'TEXT', 'CBZ', 'ZIP', 'PDF', 'MOBI', 'AZW3']);

function basename(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const parts = s.split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

function stripExtension(input) {
  return String(input || '').replace(/\.[a-zA-Z0-9]{1,10}$/, '');
}

function stripSeparatorsStart(input) {
  return String(input || '')
    .replace(/^[-_—\s:：]+/, '')
    .trimStart();
}

function stripSeparatorsEnd(input) {
  return String(input || '')
    .replace(/[-_—\s:：]+$/, '')
    .trimEnd();
}

function normalizeTag(s) {
  return String(s || '').trim().replace(/\s+/g, '');
}

function isNoiseTag(content) {
  const raw = normalizeTag(content);
  if (!raw) return false;

  const upper = raw.toUpperCase();
  if (FORMAT_TAGS.has(upper)) return true;
  if (/^[a-f0-9]{6,12}$/i.test(raw)) return true;

  return /^(?:精|精校|校对|完结|完本|全集|合集|全本|修订版?|修正版?|未删减版?|无删减版?|汉化版?|简体版?|繁体版?|中文版|完整版)$/i.test(
    raw
  );
}

function stripLeadingNoiseBracketTag(input) {
  const s = String(input || '');
  if (!s) return s;

  for (const [open, close] of BRACKET_PAIRS) {
    if (!s.startsWith(open)) continue;
    const end = s.indexOf(close, open.length);
    if (end <= 0) continue;
    const content = s.slice(open.length, end);
    if (content.length > 60) continue;
    if (!isNoiseTag(content)) continue;
    return stripSeparatorsStart(s.slice(end + close.length));
  }
  return s;
}

function stripTrailingNoiseBracketTag(input) {
  const s = String(input || '');
  if (!s) return s;

  for (const [open, close] of BRACKET_PAIRS) {
    if (!s.endsWith(close)) continue;
    const start = s.lastIndexOf(open, s.length - close.length - 1);
    if (start < 0) continue;
    const content = s.slice(start + open.length, s.length - close.length);
    if (content.length > 60) continue;
    if (!isNoiseTag(content)) continue;
    return stripSeparatorsEnd(s.slice(0, start));
  }
  return s;
}

function stripNoiseBracketTags(input) {
  let s = String(input || '').trim();
  for (let i = 0; i < 10; i++) {
    const before = s;
    s = stripLeadingNoiseBracketTag(s);
    s = stripTrailingNoiseBracketTag(s);
    if (s === before) break;
  }
  return s;
}

function stripPrefixCodes(input) {
  return String(input || '')
    .replace(/^[A-Za-z]{1,4}\d{2,6}[_\-\s:：]+/, '')
    .replace(/^0\d{1,3}[_\-\s:：]+/, '')
    .trim();
}

function stripTrailingHash(input) {
  return String(input || '').replace(/[ _\-]+[a-f0-9]{6,12}$/i, '').trim();
}

function stripTrailingRange(input) {
  let s = String(input || '').trim();
  if (!s) return s;

  const num = String.raw`(?:\d{1,4}|[一二三四五六七八九十百千零两]{1,6})`;
  const sep = String.raw`(?:-|~|～|—|到|至)`;
  const unit = String.raw`(?:卷|冊|册|集|话|話|章|节|節|部|篇)?`;

  const bracketed = new RegExp(
    String.raw`[\s_\-—:：]*[（(\\[]\s*(?:第\s*)?${num}\s*${sep}\s*${num}\s*${unit}\s*[）)\\]]\s*$`
  );
  const plain = new RegExp(String.raw`[\s_\-—:：]*(?:第\s*)?${num}\s*${sep}\s*${num}\s*${unit}\s*$`);

  if (bracketed.test(s)) {
    s = s.replace(bracketed, '');
    return stripSeparatorsEnd(s);
  }
  if (plain.test(s)) {
    s = s.replace(plain, '');
    return stripSeparatorsEnd(s);
  }
  return s;
}

function extractTitleInBookQuotes(input) {
  const s = String(input || '');
  const m = s.match(/《([^《》]{1,200})》/);
  const title = m?.[1] ? String(m[1]).trim() : '';
  return title ? title : '';
}

export function filenameToTitle(name, { maxLen = 200 } = {}) {
  const base = stripExtension(basename(name));
  if (!base) return '未命名';

  const quoted = extractTitleInBookQuotes(base);
  if (quoted) return quoted.slice(0, maxLen) || '未命名';

  let s = base.trim();
  s = stripNoiseBracketTags(s);
  s = stripPrefixCodes(s);
  s = stripTrailingHash(s);
  s = stripTrailingRange(s);
  s = stripSeparatorsStart(stripSeparatorsEnd(s));
  s = s.trim();
  return s.slice(0, maxLen) || '未命名';
}

