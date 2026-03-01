import { api, authHeaders } from './api.js';
import { parseEpubArrayBuffer } from '../shared/epub.js';
import { decodeText, splitTextBySize, splitTextChapters } from '../shared/text.js';

const MAX_PARSE_BYTES = 50 * 1024 * 1024;

export async function computeSourceMetaFromFile(file, JSZip) {
  if (!file) return null;
  if (file.size > MAX_PARSE_BYTES) return null;
  const ab = await file.arrayBuffer();
  return await computeSourceMetaFromArrayBuffer(ab, { name: file.name, type: file.type }, JSZip);
}

export async function computeSourceMetaFromArrayBuffer(arrayBuffer, info, JSZip) {
  const type = String(info?.type || '').toLowerCase();
  const name = String(info?.name || '').toLowerCase();

  const isEpub = type.includes('epub') || name.endsWith('.epub');
  if (isEpub) {
    if (!JSZip?.loadAsync) throw new Error('缺少 JSZip，无法解析 EPUB');
    const parsed = await parseEpubArrayBuffer(arrayBuffer, info?.name || 'book.epub', JSZip);
    const chapters = parsed.chapters || [];
    const chapterCount = chapters.length;
    const wordCount = chapters.reduce((s, c) => s + String(c.content || '').length, 0);
    return {
      chapterCount,
      wordCount,
      coverBlob: parsed.cover?.blob || null,
    };
  }

  const isText = type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.text');
  if (isText) {
    const text = decodeText(arrayBuffer);
    const chapters = splitTextChapters(text) || splitTextBySize(text, 8000);
    const chapterCount = (chapters || []).length;
    const wordCount = (chapters || []).reduce((s, c) => s + String(c.content || '').length, 0);
    return { chapterCount, wordCount, coverBlob: null };
  }

  return null;
}

export async function saveSourceMeta(bookId, meta) {
  const payload = {
    source_chapter_count: meta?.chapterCount ?? null,
    source_word_count: meta?.wordCount ?? null,
  };
  const res = await api('PUT', `/api/admin/books/${bookId}/source-meta`, payload);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '保存源信息失败');
  return data;
}

export async function uploadCoverIfEmpty(bookId, blob) {
  if (!blob || !blob.size) return { skipped: true };

  // 避免覆盖用户自定义封面：先查当前书籍是否已有 cover_key
  const bookRes = await fetch(`/api/books/${bookId}`, { headers: authHeaders() });
  if (!bookRes.ok) return { skipped: true };
  const bookData = await bookRes.json().catch(() => ({}));
  if (bookData?.book?.cover_key) return { skipped: true };

  const prepared = await prepareCoverBlob(blob);
  const formData = new FormData();
  formData.append('file', prepared.blob, prepared.filename);

  const res = await fetch(`/api/admin/covers?book_id=${bookId}`, {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'same-origin',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '封面上传失败');
  return data;
}

async function prepareCoverBlob(blob) {
  const ct = String(blob.type || '').toLowerCase();
  const okType = ct === 'image/jpeg' || ct === 'image/png' || ct === 'image/webp';
  if (okType && blob.size <= 5 * 1024 * 1024) {
    return { blob, filename: ct.includes('png') ? 'cover.png' : ct.includes('webp') ? 'cover.webp' : 'cover.jpg' };
  }
  const compressed = await compressToJpeg(blob);
  return { blob: compressed, filename: 'cover.jpg' };
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('封面解析失败'));
    };
    img.src = url;
  });
}

async function compressToJpeg(blob) {
  const img = await loadImageFromBlob(blob);
  const canvas = document.createElement('canvas');
  const maxW = 400;
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('封面尺寸无效');
  if (w > maxW) {
    h = Math.round((h * maxW) / w);
    w = maxW;
  }
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  if (!out) throw new Error('封面压缩失败');
  if (out.size > 5 * 1024 * 1024) throw new Error('封面过大，无法上传');
  return out;
}
