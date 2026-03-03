import { computeSourceMetaFromArrayBuffer, saveSourceMeta } from '../sourceMeta.js';
import { fetchGitHubRawBlob } from './api.js';

const MAX_META_BYTES = 50 * 1024 * 1024;

export async function tryComputeAndSaveSourceMeta({ bookId, path, name, sizeBytes, onTip } = {}) {
  if (!bookId || !path) return null;

  try {
    const hintedSize = Number(sizeBytes);
    if (Number.isFinite(hintedSize) && hintedSize > MAX_META_BYTES) {
      if (typeof onTip === 'function') {
        onTip('文件超过 50MB，已跳过章数/字数统计（仍可直连阅读）');
      }
      return null;
    }

    const blob = await fetchGitHubRawBlob(path);
    if (!blob || !blob.size) return null;

    if (blob.size > MAX_META_BYTES) {
      if (typeof onTip === 'function') {
        onTip('文件超过 50MB，已跳过章数/字数统计（仍可直连阅读）');
      }
      return null;
    }

    const ab = await blob.arrayBuffer();
    const meta = await computeSourceMetaFromArrayBuffer(ab, { name: name || 'book', type: blob.type || '' }, globalThis.JSZip);
    if (!meta) return null;

    await saveSourceMeta(bookId, meta);
    return meta;
  } catch {
    return null;
  }
}
