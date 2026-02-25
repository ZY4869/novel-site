const CHAPTER_REGEX =
  /^\s*(?:第\s*([0-9一二三四五六七八九十百千]+)\s*[章节回卷集部幕]|chapter\s+\d+|CHAPTER\s+\d+)\s*(.{0,60})$/i;

export function decodeText(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer);

  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (!utf8.includes('\uFFFD')) return utf8;
  try {
    return new TextDecoder('gbk').decode(buffer);
  } catch {
    return utf8;
  }
}

export function splitTextChapters(text) {
  if (!text) return null;
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');

  const chapters = [];
  let curTitle = null;
  let curContent = [];
  const preContent = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && CHAPTER_REGEX.test(trimmed) && trimmed.length <= 120) {
      if (curTitle !== null) {
        const content = curContent.join('\n').trim();
        chapters.push({ title: curTitle, content, checked: true });
      } else if (preContent.length > 0) {
        const pre = preContent.join('\n').trim();
        if (pre) chapters.push({ title: '前言', content: pre, checked: true });
      }
      curTitle = trimmed.slice(0, 120);
      curContent = [];
    } else if (curTitle !== null) {
      curContent.push(line);
    } else {
      preContent.push(line);
    }
  }

  if (curTitle !== null) chapters.push({ title: curTitle, content: curContent.join('\n').trim(), checked: true });
  else if (preContent.length > 0) {
    const pre = preContent.join('\n').trim();
    if (pre) chapters.push({ title: '前言', content: pre, checked: true });
  }

  return chapters.length > 0 ? chapters : null;
}

export function splitTextBySize(text, size = 6000) {
  const chapters = [];
  const paras = String(text || '').split(/\n\s*\n/);
  let cur = '';
  let idx = 1;
  for (const p of paras) {
    if (cur.length + p.length > size && cur.length > 0) {
      chapters.push({ title: `第${idx}章`, content: cur.trim(), checked: true });
      idx++;
      cur = p;
    } else {
      cur += (cur ? '\n\n' : '') + p;
    }
  }
  if (cur.trim()) chapters.push({ title: `第${idx}章`, content: cur.trim(), checked: true });
  return chapters;
}

