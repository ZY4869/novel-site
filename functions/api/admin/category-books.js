// PUT /api/admin/category-books — 覆盖式设置分类包含哪些书
import { checkAdmin, parseJsonBody, requireMinRole, validateId } from '../_utils.js';

const MAX_BOOKS_PER_CATEGORY = 5000;

export async function onRequestPut(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireMinRole(auth, 'admin')) return Response.json({ error: '权限不足' }, { status: 403 });

  const body = await parseJsonBody(request);
  if (!body || !body.category_id) return Response.json({ error: 'category_id required' }, { status: 400 });
  if (!validateId(String(body.category_id))) return Response.json({ error: 'Invalid category_id' }, { status: 400 });
  if (!Array.isArray(body.book_ids)) return Response.json({ error: 'book_ids array required' }, { status: 400 });
  if (body.book_ids.length > MAX_BOOKS_PER_CATEGORY) {
    return Response.json({ error: `book_ids too large (max ${MAX_BOOKS_PER_CATEGORY})` }, { status: 400 });
  }

  const categoryId = Number(body.category_id);

  const category = await env.DB.prepare('SELECT id FROM book_categories WHERE id = ?').bind(categoryId).first();
  if (!category) return Response.json({ error: 'Category not found' }, { status: 404 });

  for (const id of body.book_ids) {
    if (!validateId(String(id))) return Response.json({ error: 'Invalid book_id: ' + id }, { status: 400 });
  }

  let bookIds = body.book_ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
  bookIds = Array.from(new Set(bookIds));

  // 过滤不存在的书籍 id（避免脏数据）
  if (bookIds.length > 0) {
    const placeholders = bookIds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT id FROM books WHERE id IN (${placeholders})`
    ).bind(...bookIds).all();
    const set = new Set((results || []).map((r) => r.id));
    bookIds = bookIds.filter((id) => set.has(id));
  }

  const stmts = [
    env.DB.prepare('DELETE FROM book_category_books WHERE category_id = ?').bind(categoryId),
    ...bookIds.map((bid) =>
      env.DB.prepare('INSERT OR IGNORE INTO book_category_books (category_id, book_id) VALUES (?, ?)').bind(categoryId, bid)
    ),
  ];
  await env.DB.batch(stmts);

  return Response.json({ success: true, book_ids: bookIds });
}

