// GET /api/books/:id — 获取书籍详情 + 章节目录 + 标签
import { validateId, ensureSchemaReady } from '../_utils.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;

  if (!validateId(id)) {
    return Response.json({ error: 'Invalid book ID' }, { status: 400 });
  }
  await ensureSchemaReady(env);

  const book = await env.DB.prepare(
    'SELECT id, title, author, description, cover_key, source_name, source_type, source_size, source_uploaded_at, created_at, updated_at FROM books WHERE id = ?'
  ).bind(id).first();

  if (!book) {
    return Response.json({ error: 'Book not found' }, { status: 404 });
  }

  const { results: chapters } = await env.DB.prepare(`
    SELECT id, title, sort_order, word_count, created_at, updated_at
    FROM chapters WHERE book_id = ? ORDER BY sort_order ASC
  `).bind(id).all();

  // 获取标签
  let tags = [];
  try {
    const { results: tagResults } = await env.DB.prepare(`
      SELECT t.id, t.name, t.color FROM book_tags bt JOIN tags t ON bt.tag_id = t.id WHERE bt.book_id = ?
    `).bind(id).all();
    tags = tagResults || [];
  } catch {}
  book.tags = tags;

  return Response.json({ book, chapters });
}
