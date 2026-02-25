// GET /api/books — 获取所有书籍列表（含标签）
import { checkAdmin } from './_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  // 验证 token 有效性，而非仅检查 header 存在（防止伪造 header 获取 created_by）
  let isAdmin = false;
  if (request.headers.get('Authorization')?.startsWith('Bearer ')) {
    const auth = await checkAdmin(request, env);
    isAdmin = auth.ok;
  }

  // 管理员看到所有书（含下架/待删除），普通访客只看 normal
  const statusFilter = isAdmin ? '' : "WHERE (b.status IS NULL OR b.status = 'normal')";
  const { results } = await env.DB.prepare(`
    SELECT b.id, b.title, b.author, b.description, b.cover_key, b.created_at, b.updated_at,
      b.created_by, b.status, b.delete_at,
      (SELECT COUNT(*) FROM chapters WHERE book_id = b.id) as chapter_count,
      (SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE book_id = b.id) as total_words
    FROM books b
    ${statusFilter}
    ORDER BY b.updated_at DESC
  `).all();

  // 非管理员请求不返回敏感字段
  if (!isAdmin) {
    for (const book of results) {
      delete book.created_by;
      delete book.status;
      delete book.delete_at;
    }
  }

  // 批量获取所有书籍的标签
  let allBookTags = [];
  try {
    const { results: btResults } = await env.DB.prepare(`
      SELECT bt.book_id, t.id as tag_id, t.name, t.color
      FROM book_tags bt JOIN tags t ON bt.tag_id = t.id
    `).all();
    allBookTags = btResults || [];
  } catch {}

  const tagsByBook = {};
  for (const bt of allBookTags) {
    if (!tagsByBook[bt.book_id]) tagsByBook[bt.book_id] = [];
    tagsByBook[bt.book_id].push({ id: bt.tag_id, name: bt.name, color: bt.color });
  }

  for (const book of results) {
    book.tags = tagsByBook[book.id] || [];
  }

  const response = Response.json({ books: results });

  // 10% 概率异步清理过期的待删除书籍
  if (Math.random() < 0.1) {
    context.waitUntil(purgeExpiredBooks(env));
  }

  return response;
}

async function purgeExpiredBooks(env) {
  try {
    const { results: expired } = await env.DB.prepare(
      "SELECT id, cover_key FROM books WHERE status = 'deleted' AND delete_at IS NOT NULL AND delete_at < datetime('now')"
    ).all();
    for (const book of expired) {
      const { results: chapters } = await env.DB.prepare('SELECT content_key FROM chapters WHERE book_id = ?').bind(book.id).all();
      const r2Deletes = chapters.map(c => env.R2.delete(c.content_key).catch(() => {}));
      if (book.cover_key) r2Deletes.push(env.R2.delete(book.cover_key).catch(() => {}));
      await Promise.all(r2Deletes);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM chapter_stats WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)').bind(book.id),
        env.DB.prepare('DELETE FROM book_stats WHERE book_id = ?').bind(book.id),
        env.DB.prepare('DELETE FROM book_tags WHERE book_id = ?').bind(book.id),
        env.DB.prepare('DELETE FROM chapters WHERE book_id = ?').bind(book.id),
        env.DB.prepare('DELETE FROM books WHERE id = ?').bind(book.id),
      ]);
    }
  } catch (e) {
    console.error('purgeExpiredBooks error:', e);
  }
}
