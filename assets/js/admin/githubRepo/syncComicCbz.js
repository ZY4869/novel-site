import { api, concurrentUpload, uploadComicPage, uploadComicSource } from '../api.js';
import { filenameToTitle } from '../ui.js';
import { fetchGitHubRawBlob } from './api.js';

function isSupportedImage(name) {
  return /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(String(name || ''));
}

function guessImageMime(name) {
  const ext = String(name || '').split('.').pop()?.toLowerCase() || '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'avif') return 'image/avif';
  if (ext === 'bmp') return 'image/bmp';
  return 'application/octet-stream';
}

function toFile(blob, name) {
  const type = blob.type || 'application/zip';
  try {
    return new File([blob], name || 'comic.cbz', { type });
  } catch {
    blob.name = name || 'comic.cbz';
    return blob;
  }
}

export async function syncImportGitHubCbz({ path, name, title, description }, { onStatus, onProgress } = {}) {
  if (!globalThis.JSZip?.loadAsync) throw new Error('缺少 JSZip，无法解析 CBZ');

  const safeName = String(name || 'comic.cbz');
  const finalTitle = String(title || '').trim().slice(0, 200) || filenameToTitle(safeName);
  const finalDesc = String(description || '').trim().slice(0, 2000);

  if (typeof onStatus === 'function') onStatus('下载 GitHub 文件中...');
  const blob = await fetchGitHubRawBlob(path);
  const file = toFile(blob, safeName);

  if (!/\.(cbz|zip)$/i.test(safeName)) throw new Error('仅支持 .cbz/.zip 同步导入');
  if (typeof onStatus === 'function') onStatus('解析 CBZ 中...');

  const ab = await file.arrayBuffer();
  const zip = await globalThis.JSZip.loadAsync(ab);
  const imageNames = [];
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    if (relativePath.startsWith('__MACOSX/')) return;
    if (!isSupportedImage(relativePath)) return;
    imageNames.push(relativePath);
  });
  imageNames.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  if (imageNames.length === 0) throw new Error('未找到图片文件（仅支持 jpg/png/webp/gif/avif/bmp）');
  if (imageNames.length > 2000) throw new Error('页数过多（超过 2000 页），请拆分导入');

  let comicId = null;
  if (typeof onStatus === 'function') onStatus('创建漫画中...');
  try {
    const res = await api('POST', '/api/admin/comics', { title: finalTitle, description: finalDesc });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    comicId = data.comic?.id;
  } catch (e) {
    throw new Error(`创建失败：${e.message || '未知错误'}`);
  }
  if (!comicId) throw new Error('创建失败');

  if (typeof onStatus === 'function') onStatus('上传源文件中...');
  try {
    await uploadComicSource(comicId, file);
  } catch (e) {
    try { await api('DELETE', `/api/admin/comics/${comicId}`); } catch {}
    throw e;
  }

  let done = 0;
  const total = imageNames.length;
  const errors = [];
  let totalExtracted = 0;
  const MAX_EXTRACTED = 1024 * 1024 * 1024;

  const tasks = imageNames.map((imgName, idx) => async () => {
    try {
      const entry = zip.file(imgName);
      if (!entry) throw new Error('找不到文件');
      const buf = await entry.async('arraybuffer');
      totalExtracted += buf.byteLength;
      if (totalExtracted > MAX_EXTRACTED) throw new Error('解压内容过大（超过 1GB），可能是异常文件');
      if (buf.byteLength > 20 * 1024 * 1024) throw new Error('单页图片超过 20MB 限制');
      const pageBlob = new Blob([buf], { type: guessImageMime(imgName) });
      await uploadComicPage(comicId, idx + 1, pageBlob, imgName);
    } catch (err) {
      errors.push(`${idx + 1}: ${imgName} - ${err.message}`);
    } finally {
      done++;
      if (typeof onProgress === 'function') {
        const pct = total ? Math.round((done / total) * 100) : 0;
        onProgress({ done, total, pct });
      }
    }
  });

  if (typeof onStatus === 'function') onStatus('上传页面中...');
  await concurrentUpload(tasks, 2);

  try {
    await api('POST', `/api/admin/comics/${comicId}/finalize`, {});
  } catch {}

  if (errors.length > 0) {
    const note = errors.slice(0, 3).join('；');
    throw new Error(`导入完成，但 ${errors.length} 页失败：${note}`);
  }

  return { comicId, pageCount: total, title: finalTitle };
}

