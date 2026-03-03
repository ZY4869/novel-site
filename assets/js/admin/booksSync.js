import { parseEpubFile } from './novelUpload/parseEpub.js';
import { parseTxtFile } from './novelUpload/parseTxt.js';
import { runImportFlow } from './novelUpload/importFlow.js';

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

function detectKindByNameAndType(name, type) {
  const n = String(name || '').toLowerCase();
  const t = String(type || '').toLowerCase();
  if (t.includes('epub') || n.endsWith('.epub')) return 'epub';
  if (t.startsWith('text/') || n.endsWith('.txt') || n.endsWith('.text')) return 'txt';
  return null;
}

function toFile(blob, name, type) {
  const safeType = type || blob?.type || '';
  try {
    return new File([blob], name || 'file', { type: safeType });
  } catch {
    const b = blob;
    b.name = name || 'file';
    b.type = safeType;
    return b;
  }
}

export function canSyncImportFromSource(book) {
  const chapterCount = Number(book?.chapter_count || 0) || 0;
  if (chapterCount > 0) return false;
  if (!book?.has_source) return false;

  const size = Number(book?.source_size || 0);
  if (Number.isFinite(size) && size > MAX_IMPORT_BYTES) return false;

  const kind = detectKindByNameAndType(book?.source_name || book?.title || '', book?.source_type || '');
  return kind === 'txt' || kind === 'epub';
}

export async function syncImportFromBookSource(book, { onStatus, onProgress } = {}) {
  if (!book?.id) throw new Error('无效的书籍');
  if (!canSyncImportFromSource(book)) throw new Error('该书籍不满足同步导入条件（需 TXT/EPUB 且未生成章节，且 ≤50MB）');

  const kind = detectKindByNameAndType(book?.source_name || book?.title || '', book?.source_type || '');
  if (kind !== 'txt' && kind !== 'epub') throw new Error('仅支持 TXT/EPUB 同步导入');

  if (typeof onStatus === 'function') onStatus('下载源文件中...');
  const res = await fetch(`/api/books/${book.id}/source`);
  if (!res.ok) {
    throw new Error(res.status === 404 ? '源文件不存在' : '源文件下载失败');
  }

  const blob = await res.blob();
  const fileName = String(book.source_name || book.title || `book-${book.id}`).slice(0, 120);
  const file = toFile(blob, fileName, book.source_type || blob.type || '');

  if (typeof onStatus === 'function') onStatus('解析源文件中...');
  let parsed = null;
  if (kind === 'txt') {
    parsed = await parseTxtFile(file);
    parsed = { ...parsed, meta: null, coverBlob: null };
  } else {
    if (!globalThis.JSZip?.loadAsync) throw new Error('缺少 JSZip，无法解析 EPUB');
    parsed = await parseEpubFile(file, globalThis.JSZip);
  }

  if (typeof onStatus === 'function') onStatus('同步导入中...');
  return await runImportFlow({
    file,
    kind,
    parsed,
    target: { type: 'existing', bookId: String(book.id) },
    onStatus,
    onProgress,
  });
}

