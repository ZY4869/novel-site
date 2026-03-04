// GET /api/books/:id — 获取书籍详情 + 章节目录 + 标签 + 分类
import { checkAdmin, ensureSchemaReady, validateId } from '../_utils.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const id = params.id;

  if (!validateId(id)) {
    return Response.json({ error: 'Invalid book ID' }, { status: 400 });
  }
  await ensureSchemaReady(env);

  const book = await env.DB.prepare(
    `
	      SELECT b.id, b.title, b.author, b.description, b.cover_key,
	        b.pinned_at,
	        b.source_name, b.source_type, b.source_size, b.source_uploaded_at,
	        b.source_chapter_count, b.source_word_count,
	        CASE WHEN b.source_key IS NOT NULL THEN 1 ELSE 0 END as has_source,
	        b.status, b.delete_at,
        b.annotation_enabled, b.annotation_locked,
        b.created_by,
        b.created_at, b.updated_at,
        u.username as uploader, u.avatar_url as uploader_avatar
      FROM books b LEFT JOIN admin_users u ON b.created_by = u.id
      WHERE b.id = ?
    `
  ).bind(id).first();

  if (!book) {
    return Response.json({ error: 'Book not found' }, { status: 404 });
  }

  // 下架/软删除：默认对外隐藏，但允许“已登录且有权限”的用户访问（供后台管理复用）
  if (book.status && book.status !== 'normal') {
    const auth = await checkAdmin(request, env);
    if (!auth.ok) return Response.json({ error: 'Book not found' }, { status: 404 });
    const isPrivileged = auth.role === 'super_admin' || auth.role === 'admin';
    const isOwner = auth.role === 'demo' && Number(book.created_by) === Number(auth.userId);
    if (!isPrivileged && !isOwner) {
      return Response.json({ error: 'Book not found' }, { status: 404 });
    }
  }

  // 对外不暴露内部字段
  delete book.created_by;
  delete book.delete_at;
  delete book.status;

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

	  // 获取分类（多对多）
	  let categories = [];
	  try {
	    const { results: catResults } = await env.DB.prepare(`
	      SELECT c.id, c.name, c.is_special, c.marks_json
	      FROM book_category_books bcb JOIN book_categories c ON bcb.category_id = c.id
	      WHERE bcb.book_id = ?
	      ORDER BY c.is_special DESC, c.name ASC
	    `).bind(id).all();

	    categories = (catResults || []).map((c) => {
	      let marks = [];
	      try {
	        const parsed = JSON.parse(String(c.marks_json || '[]'));
	        marks = Array.isArray(parsed) ? parsed.map((x) => String(x)).filter(Boolean) : [];
	      } catch {
	        marks = [];
	      }
	      return { id: c.id, name: c.name, is_special: c.is_special ? 1 : 0, marks };
	    });
	  } catch {}
	  book.categories = categories;

	  return Response.json({ book, chapters });
}
