import { api, uploadBookSource } from '../api.js';
import { auth } from '../state.js';
import { uploadCoverIfEmpty } from '../sourceMeta.js';
import { getMaxSortOrder, importChaptersToBook } from './importChapters.js';

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

export async function runImportFlow({ file, kind, parsed, target, onStatus, onProgress } = {}) {
  if (!file) throw new Error('请选择文件');
  if (!parsed?.chapters?.length) throw new Error('未解析到章节内容');

  const selected = (parsed.chapters || []).filter((c) => c && c.checked);
  if (selected.length === 0) throw new Error('没有选中任何章节');

  let bookId = null;
  let createdBookId = null;

  try {
    if (!target || (target.type !== 'new' && target.type !== 'existing')) throw new Error('无效的导入目标');

    if (target.type === 'new') {
      const title = String(target.title || '').trim().slice(0, 200);
      if (!title) throw new Error('请输入书名');
      if (typeof onStatus === 'function') onStatus('创建书籍中...');
      const categoryIds = (Array.isArray(target.category_ids) ? target.category_ids : [])
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0)
        .slice(0, 20);

      const payload = {
        title,
        author: String(target.author || '').trim().slice(0, 100),
        description: String(target.description || '').trim().slice(0, 2000),
      };
      if (categoryIds.length) payload.category_ids = categoryIds;

      const res = await api('POST', '/api/admin/books', payload);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '创建书籍失败');
      bookId = data.book?.id;
      if (!bookId) throw new Error('创建书籍失败');
      createdBookId = bookId;
    } else {
      bookId = Number(target.bookId);
      if (!Number.isFinite(bookId) || bookId <= 0) throw new Error('请选择目标书籍');
    }

    const baseSortOrder =
      target.type === 'existing'
        ? await getMaxSortOrder(bookId)
        : 0;

    if (typeof onStatus === 'function') onStatus('上传源文件中...');
    await uploadBookSource(bookId, file, { chapterCount: parsed.chapters.length, wordCount: parsed.totalWords || 0 });

    let coverErr = null;
    if (kind === 'epub' && parsed.coverBlob) {
      try {
        await uploadCoverIfEmpty(bookId, parsed.coverBlob);
      } catch (e) {
        coverErr = e;
      }
    }

    if (typeof onStatus === 'function') onStatus('导入章节中...');
    const result = await importChaptersToBook({
      bookId,
      chapters: selected,
      baseSortOrder,
      concurrency: 3,
      onProgress: ({ done, total }) => {
        if (typeof onProgress === 'function') {
          const pct = total ? Math.round((done / total) * 100) : 0;
          onProgress({ done, total, pct });
        }
      },
    });

    return { bookId, coverErr, result };
  } catch (e) {
    if (createdBookId) {
      const note = await tryRollbackCreatedBook(createdBookId);
      throw new Error(`${e.message || '失败'}${note}`);
    }
    throw e;
  }
}
