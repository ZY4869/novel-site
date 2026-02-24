// GET /api/books — 获取所有书籍列表（含标签）
import { ensureSchemaReady } from './_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  await ensureSchemaReady(env);

  // 管理员请求（带token）返回 created_by 用于前端 ownership 判断
  const isAdmin = request.headers.get('Authorization')?.startsWith('Bearer ');

  const { results } = await env.DB.prepare(`
    SELECT b.id, b.title, b.author, b.description, b.cover_key,
      b.source_name, b.source_type, b.source_size, b.source_uploaded_at,
      CASE WHEN b.source_key IS NOT NULL THEN 1 ELSE 0 END as has_source,
      b.created_at, b.updated_at,
      ${isAdmin ? 'b.created_by,' : ''}
      (SELECT COUNT(*) FROM chapters WHERE book_id = b.id) as chapter_count,
      (SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE book_id = b.id) as total_words
    FROM books b
    ORDER BY b.updated_at DESC
  `).all();

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

  return Response.json({ books: results });
}
