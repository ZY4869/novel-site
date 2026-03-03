import { api, concurrentUpload } from '../api.js';

export async function getMaxSortOrder(bookId) {
  const res = await api('GET', `/api/books/${bookId}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '获取章节列表失败');

  let max = 0;
  for (const c of data.chapters || []) {
    const n = Number(c?.sort_order);
    if (Number.isFinite(n) && Number.isInteger(n) && n > max) max = n;
  }
  return max;
}

export async function importChaptersToBook({ bookId, chapters, baseSortOrder = 0, concurrency = 3, onProgress } = {}) {
  const list = (chapters || []).filter((c) => c && c.checked);
  let done = 0;
  const errors = [];

  const tasks = list.map((ch, idx) => () =>
    api('POST', '/api/admin/chapters', {
      book_id: Number(bookId),
      title: String(ch.title || '').slice(0, 200) || `章节 ${idx + 1}`,
      content: String(ch.content || ''),
      sort_order: baseSortOrder + idx + 1,
    })
      .then(async (res) => {
        if (res.ok) return;
        const d = await res.json().catch(() => ({}));
        errors.push(`${String(ch.title || `章节 ${idx + 1}`)}: ${d.error || '导入失败'}`);
      })
      .catch((e) => errors.push(`${String(ch.title || `章节 ${idx + 1}`)}: ${e.message || '导入失败'}`))
      .finally(() => {
        done++;
        if (typeof onProgress === 'function') onProgress({ done, total: list.length });
      })
  );

  await concurrentUpload(tasks, Math.max(1, Math.min(6, Number(concurrency) || 3)));
  return { done, total: list.length, errors };
}

