// GET /api/books — 获取所有书籍列表
export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(`
    SELECT b.*, 
      (SELECT COUNT(*) FROM chapters WHERE book_id = b.id) as chapter_count,
      (SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE book_id = b.id) as total_words
    FROM books b
    ORDER BY b.updated_at DESC
  `).all();

  return Response.json({ books: results });
}
