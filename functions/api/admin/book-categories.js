// PUT /api/admin/book-categories — 覆盖式设置书籍分类（多对多）
import { checkAdmin, checkBookOwnership, parseJsonBody, validateId } from '../_utils.js';

const MAX_CATEGORIES_PER_BOOK = 20;

export async function onRequestPut(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await parseJsonBody(request);
  if (!body || !body.book_id) return Response.json({ error: 'book_id required' }, { status: 400 });
  if (!validateId(String(body.book_id))) return Response.json({ error: 'Invalid book_id' }, { status: 400 });
  if (!Array.isArray(body.category_ids)) return Response.json({ error: 'category_ids array required' }, { status: 400 });
  if (body.category_ids.length > MAX_CATEGORIES_PER_BOOK) {
    return Response.json({ error: `最多 ${MAX_CATEGORIES_PER_BOOK} 个分类` }, { status: 400 });
  }

  const bookId = Number(body.book_id);

  // demo 仅能操作自己的书
  if (!await checkBookOwnership(auth, env, bookId)) {
    return Response.json({ error: '只能管理自己书籍的分类' }, { status: 403 });
  }

  // 验证每个 category_id
  for (const id of body.category_ids) {
    if (!validateId(String(id))) return Response.json({ error: 'Invalid category_id: ' + id }, { status: 400 });
  }

  let validIds = body.category_ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
  validIds = Array.from(new Set(validIds));

  // 过滤不存在的分类
  if (validIds.length > 0) {
    const placeholders = validIds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT id FROM book_categories WHERE id IN (${placeholders})`
    ).bind(...validIds).all();
    const set = new Set((results || []).map((r) => r.id));
    validIds = validIds.filter((id) => set.has(id));
  }

  const stmts = [
    env.DB.prepare('DELETE FROM book_category_books WHERE book_id = ?').bind(bookId),
    ...validIds.map((cid) =>
      env.DB.prepare('INSERT OR IGNORE INTO book_category_books (category_id, book_id) VALUES (?, ?)').bind(cid, bookId)
    ),
  ];
  await env.DB.batch(stmts);

  return Response.json({ success: true, category_ids: validIds });
}

