// POST /api/admin/books — 创建新书籍
import { checkAdmin, parseJsonBody, requireMinRole, validateId } from '../_utils.js';

const MAX_CATEGORY_IDS = 20;

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) {
    const status = auth.reason === 'locked' ? 429 : 401;
    const msg = auth.reason === 'locked' ? 'Too many failed attempts, try again later' : 'Unauthorized';
    return Response.json({ error: msg }, { status });
  }

  // demo 用户配额：最多 10 本书
  if (!requireMinRole(auth, 'admin')) {
    const { count } = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM books WHERE created_by = ?'
    ).bind(auth.userId).first();
    if (count >= 10) return Response.json({ error: '演示账号最多创建 10 本书' }, { status: 403 });
  }

  const body = await parseJsonBody(request);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const { title, description, author } = body;

  // optional: categories
  let categoryIds = [];
  if (Array.isArray(body.category_ids)) {
    if (body.category_ids.length > MAX_CATEGORY_IDS) {
      return Response.json({ error: `最多选择 ${MAX_CATEGORY_IDS} 个分类` }, { status: 400 });
    }
    for (const id of body.category_ids) {
      if (!validateId(String(id))) return Response.json({ error: 'Invalid category_id: ' + id }, { status: 400 });
    }
    categoryIds = Array.from(
      new Set(body.category_ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0))
    );
  }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return Response.json({ error: 'Title is required' }, { status: 400 });
  }
  if (title.length > 200) {
    return Response.json({ error: 'Title too long (max 200)' }, { status: 400 });
  }

  const result = await env.DB.prepare(`
    INSERT INTO books (title, description, author, created_by) VALUES (?, ?, ?, ?)
  `).bind(
    title.trim(),
    (typeof description === 'string' ? description : '').trim().slice(0, 2000),
    (typeof author === 'string' ? author : '').trim().slice(0, 100),
    auth.userId
  ).run();

  const bookId = result.meta.last_row_id;

  // demo配额二次检查（防TOCTOU竞态绕过）
  if (!requireMinRole(auth, 'admin')) {
    const { count } = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM books WHERE created_by = ?'
    ).bind(auth.userId).first();
    if (count > 10) {
      await env.DB.prepare('DELETE FROM books WHERE id = ?').bind(bookId).run().catch(() => {});
      return Response.json({ error: '演示账号最多创建 10 本书' }, { status: 403 });
    }
  }

  // attach categories (best-effort, but rollback book on failure to keep behavior consistent)
  if (categoryIds.length > 0) {
    try {
      const placeholders = categoryIds.map(() => '?').join(',');
      const { results: validCats } = await env.DB.prepare(
        `SELECT id FROM book_categories WHERE id IN (${placeholders})`
      ).bind(...categoryIds).all();
      const validSet = new Set((validCats || []).map((c) => c.id));
      const validIds = categoryIds.filter((id) => validSet.has(id));

      if (validIds.length > 0) {
        await env.DB.batch(
          validIds.map((cid) =>
            env.DB.prepare('INSERT OR IGNORE INTO book_category_books (category_id, book_id) VALUES (?, ?)').bind(cid, bookId)
          )
        );
      }
    } catch (e) {
      console.error('attach categories on create book error:', e);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM book_category_books WHERE book_id = ?').bind(bookId),
        env.DB.prepare('DELETE FROM books WHERE id = ?').bind(bookId),
      ]).catch(() => {});
      return Response.json({ error: 'Failed to set categories' }, { status: 500 });
    }
  }

  return Response.json({
    success: true,
    book: { id: bookId, title: title.trim() }
  }, { status: 201 });
}
