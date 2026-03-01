// GET /api/books — 获取所有书籍列表（含标签）
import { checkAdmin, ensureSchemaReady } from './_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  await ensureSchemaReady(env);

  // 验证 token 有效性（支持 Cookie / Bearer），避免伪造 header 获取敏感字段
  const auth = await checkAdmin(request, env);
  const isAdmin = auth.ok;

  const commonSelect = `
    b.id, b.title, b.author, b.description, b.cover_key,
    b.source_name, b.source_type, b.source_size, b.source_uploaded_at,
<<<<<<< HEAD
    b.source_chapter_count, b.source_word_count,
=======
>>>>>>> d6e0b72c4d6b81072e69b9dec3d363fa592c6b8a
    CASE WHEN b.source_key IS NOT NULL THEN 1 ELSE 0 END as has_source,
    b.created_at, b.updated_at,
    (SELECT COUNT(*) FROM chapters WHERE book_id = b.id) as chapter_count,
    (SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE book_id = b.id) as total_words
  `;

  // demo：可见“所有正常书籍 + 自己的非正常书籍”，避免泄露他人下架/待删除书
  const isDemo = isAdmin && auth.role === 'demo';

  const query = !isAdmin
    ? `
      SELECT ${commonSelect}
      FROM books b
      WHERE (b.status IS NULL OR b.status = 'normal')
      ORDER BY b.updated_at DESC
    `
    : isDemo
      ? `
        SELECT ${commonSelect},
          b.created_by, b.status, b.delete_at, b.annotation_enabled, b.annotation_locked
        FROM books b
        WHERE (b.status IS NULL OR b.status = 'normal') OR b.created_by = ?
        ORDER BY b.updated_at DESC
      `
      : `
        SELECT ${commonSelect},
          b.created_by, b.status, b.delete_at, b.annotation_enabled, b.annotation_locked
        FROM books b
        ORDER BY b.updated_at DESC
      `;

  const stmt = env.DB.prepare(query);
  const { results } = isDemo ? await stmt.bind(auth.userId).all() : await stmt.all();

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

  // 10% 概率后台清理过期软删除书籍（避免长期堆积）
  if (Math.random() < 0.1) {
    context.waitUntil(purgeExpiredBooks(env));
  }

  return response;
}

async function purgeExpiredBooks(env) {
  try {
    const { results: expired } = await env.DB.prepare(
      "SELECT id, cover_key, source_key FROM books WHERE status = 'deleted' AND delete_at IS NOT NULL AND delete_at < datetime('now')"
    ).all();

    for (const book of expired) {
      // CAS：抢占式标记，避免多worker重复清理
      const { meta } = await env.DB.prepare(
        "UPDATE books SET status = 'purging' WHERE id = ? AND status = 'deleted'"
      ).bind(book.id).run();
      if (!meta.changes) continue;

      const { results: chapters } = await env.DB.prepare('SELECT content_key FROM chapters WHERE book_id = ?')
        .bind(book.id).all();

      const r2Keys = [];
      for (const c of chapters || []) {
        if (c?.content_key && c.content_key !== 'pending') r2Keys.push(c.content_key);
      }
      if (book.cover_key) r2Keys.push(book.cover_key);
      if (book.source_key) r2Keys.push(book.source_key);

      // 先清DB再清R2（R2孤儿无害；DB孤儿会暴露内容引用）
      await env.DB.batch([
        env.DB.prepare('DELETE FROM chapter_stats WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)').bind(book.id),
        env.DB.prepare('DELETE FROM book_stats WHERE book_id = ?').bind(book.id),
        env.DB.prepare('DELETE FROM book_tags WHERE book_id = ?').bind(book.id),
        env.DB.prepare('DELETE FROM votes WHERE annotation_id IN (SELECT id FROM annotations WHERE book_id = ?)').bind(book.id),
        env.DB.prepare('DELETE FROM reports WHERE book_id = ?').bind(book.id),
        env.DB.prepare('DELETE FROM annotation_likes WHERE annotation_id IN (SELECT id FROM annotations WHERE book_id = ?)').bind(book.id),
        env.DB.prepare('DELETE FROM annotations WHERE book_id = ?').bind(book.id),
        env.DB.prepare('DELETE FROM chapters WHERE book_id = ?').bind(book.id),
        env.DB.prepare('DELETE FROM books WHERE id = ?').bind(book.id),
      ]);

      await Promise.all(r2Keys.map((k) => env.R2.delete(k).catch(() => {})));
    }
  } catch (e) {
    console.error('purgeExpiredBooks error:', e);
  }
}
