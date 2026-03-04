import { api, uploadBookSource } from '../api.js';
import { auth } from '../state.js';
import { computeSourceMetaFromFile, uploadCoverIfEmpty } from '../sourceMeta.js';

async function tryRollbackCreatedBook(bookId) {
  if (!bookId) return '';
  try {
    const delRes = await api('DELETE', `/api/admin/books/${bookId}`);
    if (!delRes.ok) throw new Error('delete failed');
    if (auth.role === 'super_admin') {
      try {
        const purgeRes = await api('POST', `/api/admin/books/${bookId}`, { action: 'purge' });
        if (purgeRes.ok) return '（已彻底清理创建的空书）';
      } catch {}
    }
    return '（已标记删除创建的空书，可在回收站恢复或等待自动清理）';
  } catch {
    return '（回滚失败，请在书籍列表手动删除刚创建的空书）';
  }
}

export async function createBookAndUploadSource({ file, title, author, description, category_ids, JSZip, onStatus } = {}) {
  if (!file) throw new Error('请选择文件');
  const safeTitle = String(title || '').trim().slice(0, 200);
  if (!safeTitle) throw new Error('请输入书名');

  let createdBookId = null;
  try {
    if (typeof onStatus === 'function') onStatus('创建中...');
    const categoryIds = (Array.isArray(category_ids) ? category_ids : [])
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 20);

    const payload = {
      title: safeTitle,
      author: String(author || '').trim().slice(0, 100),
      description: String(description || '').trim().slice(0, 2000),
    };
    if (categoryIds.length) payload.category_ids = categoryIds;

    const res = await api('POST', '/api/admin/books', payload);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '创建书籍失败');
    createdBookId = data.book?.id;
    if (!createdBookId) throw new Error('创建书籍失败');

    let meta = null;
    try {
      if (typeof onStatus === 'function') onStatus('解析源文件中...');
      meta = await computeSourceMetaFromFile(file, JSZip);
    } catch {
      meta = null;
    }

    if (typeof onStatus === 'function') onStatus('上传源文件中...');
    await uploadBookSource(createdBookId, file, meta ? { chapterCount: meta.chapterCount, wordCount: meta.wordCount } : undefined);

    let coverErr = null;
    if (meta?.coverBlob) {
      try {
        if (typeof onStatus === 'function') onStatus('上传封面中...');
        await uploadCoverIfEmpty(createdBookId, meta.coverBlob);
      } catch (e) {
        coverErr = e;
      }
    }

    return { bookId: createdBookId, meta, coverErr };
  } catch (e) {
    const rollbackNote = await tryRollbackCreatedBook(createdBookId);
    const err = new Error(`${e.message || '失败'}${rollbackNote}`);
    err.cause = e;
    throw err;
  }
}
