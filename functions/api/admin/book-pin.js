// PUT /api/admin/book-pin — 书籍置顶/取消置顶
import { checkAdmin, checkBookOwnership, parseJsonBody, validateId } from '../_utils.js';

export async function onRequestPut(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await parseJsonBody(request);
  if (!body || !body.book_id) return Response.json({ error: 'book_id required' }, { status: 400 });
  if (!validateId(String(body.book_id))) return Response.json({ error: 'Invalid book_id' }, { status: 400 });

  const pinned = !!body.pinned;
  const bookId = Number(body.book_id);

  // demo 仅能操作自己的书
  if (!await checkBookOwnership(auth, env, bookId)) {
    return Response.json({ error: '只能管理自己的书籍' }, { status: 403 });
  }

  if (pinned) {
    await env.DB.prepare("UPDATE books SET pinned_at = datetime('now') WHERE id = ?").bind(bookId).run();
  } else {
    await env.DB.prepare('UPDATE books SET pinned_at = NULL WHERE id = ?').bind(bookId).run();
  }

  return Response.json({ success: true, pinned });
}

