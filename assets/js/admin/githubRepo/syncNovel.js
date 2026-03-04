import { filenameToTitle } from '../ui.js';
import { parseEpubFile } from '../novelUpload/parseEpub.js';
import { parseTxtFile } from '../novelUpload/parseTxt.js';
import { runImportFlow } from '../novelUpload/importFlow.js';
import { fetchGitHubRawBlob } from './api.js';

function detectKindByName(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.epub')) return 'epub';
  if (n.endsWith('.txt') || n.endsWith('.text')) return 'txt';
  return 'other';
}

function toFile(blob, name) {
  const type = blob.type || '';
  try {
    return new File([blob], name || 'file', { type });
  } catch {
    // Safari 12 fallback: File may not exist; keep Blob + name-ish
    blob.name = name || 'file';
    return blob;
  }
}

export async function syncImportGitHubNovel({ repoId = null, path, name, target }, { onStatus, onProgress } = {}) {
  const kind = detectKindByName(name);
  if (kind !== 'txt' && kind !== 'epub') throw new Error('仅支持 TXT/EPUB 同步导入');

  if (typeof onStatus === 'function') onStatus('下载 GitHub 文件中...');
  const blob = await fetchGitHubRawBlob(path, { repoId });
  const file = toFile(blob, name);

  if (typeof onStatus === 'function') onStatus('解析文件中...');
  let parsed = null;
  if (kind === 'txt') {
    parsed = await parseTxtFile(file);
    parsed = { ...parsed, meta: null, coverBlob: null };
  } else {
    if (!globalThis.JSZip?.loadAsync) throw new Error('缺少 JSZip，无法解析 EPUB');
    parsed = await parseEpubFile(file, globalThis.JSZip);
  }

  if (target?.type === 'new') {
    // 若未填标题，则默认取文件名
    if (!String(target.title || '').trim()) {
      target.title = filenameToTitle(name);
      if (!target.titleSource) target.titleSource = 'filename';
    }

    // EPUB 元数据优先：仅在标题为空或仍为“文件名自动填充”时覆盖
    if (kind === 'epub' && parsed?.meta) {
      const metaTitle = String(parsed.meta.title || '').trim();
      if (metaTitle && (!String(target.title || '').trim() || String(target.titleSource || '') === 'filename')) {
        target.title = metaTitle.slice(0, 200);
        target.titleSource = 'meta';
      }
      const metaAuthor = String(parsed.meta.author || '').trim();
      if (metaAuthor && !String(target.author || '').trim()) target.author = metaAuthor.slice(0, 100);
      const metaDesc = String(parsed.meta.description || '').trim();
      if (metaDesc && !String(target.description || '').trim()) target.description = metaDesc.slice(0, 2000);
    }
  }

  if (typeof onStatus === 'function') onStatus('同步导入中...');
  return await runImportFlow({
    file,
    kind,
    parsed,
    target,
    onStatus,
    onProgress,
  });
}
