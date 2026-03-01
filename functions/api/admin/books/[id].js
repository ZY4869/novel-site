// PUT /api/admin/books/:id — 编辑书籍
// DELETE /api/admin/books/:id — 软删除书籍（30天后后台清理）
// POST /api/admin/books/:id — 书籍状态操作（unlist/restore/purge）
import { checkAdmin, validateId, parseJsonBody, checkBookOwnership, requireMinRole } from '../../_utils.js';

async function authCheck(request, env) {
  const auth = await checkAdmin(request, env);
  if (!auth.ok) {
    const status = auth.reason === 'locked' ? 429 : 401;
    const msg = auth.reason === 'locked' ? 'Too many failed attempts, try again later' : 'Unauthorized';
    return { denied: Response.json({ error: msg }, { status }) };
  }
  return { auth };
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const { denied, auth } = await authCheck(request, env);
  if (denied) return denied;
  if (!validateId(params.id)) return Response.json({ error: 'Invalid ID' }, { status: 400 });

  const book = await env.DB.prepare('SELECT * FROM books WHERE id = ?').bind(params.id).first();
  if (!book) return Response.json({ error: 'Book not found' }, { status: 404 });

  // demo只能编辑自己的书
  if (!await checkBookOwnership(auth, env, params.id)) {
    return Response.json({ error: '只能编辑自己创建的书籍' }, { status: 403 });
  }

  const body = await parseJsonBody(request);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const title = (body.title || book.title || '').trim().slice(0, 200);
  const author = (body.author ?? book.author ?? '').trim().slice(0, 100);
  const description = (body.description ?? book.description ?? '').trim().slice(0, 2000);

  await env.DB.prepare(`
    UPDATE books SET title = ?, author = ?, description = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(title, author, description, params.id).run();

  return Response.json({ success: true });
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const { denied, auth } = await authCheck(request, env);
  if (denied) return denied;
  if (!validateId(params.id)) return Response.json({ error: 'Invalid ID' }, { status: 400 });

  const book = await env.DB.prepare('SELECT * FROM books WHERE id = ?').bind(params.id).first();
  if (!book) return Response.json({ error: 'Book not found' }, { status: 404 });

  // demo只能删除自己的书
  if (!await checkBookOwnership(auth, env, params.id)) {
    return Response.json({ error: '只能删除自己创建的书籍' }, { status: 403 });
  }

  const currentStatus = book.status || 'normal';
  if (currentStatus === 'deleted') {
    return Response.json({ error: '该书籍已在待清理列表中' }, { status: 400 });
  }

  // 标记为 deleted，30天后由后台清理（见 /api/books purgeExpiredBooks）
  const deleteAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    "UPDATE books SET status = 'deleted', delete_at = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(deleteAt, params.id).run();

  return Response.json({ success: true, message: '书籍已标记删除，30天后自动清理', delete_at: deleteAt });
}

const VALID_ACTIONS = ['unlist', 'restore', 'purge'];

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const { denied, auth } = await authCheck(request, env);
  if (denied) return denied;
  if (!validateId(params.id)) return Response.json({ error: 'Invalid ID' }, { status: 400 });

  const book = await env.DB.prepare('SELECT * FROM books WHERE id = ?').bind(params.id).first();
  if (!book) return Response.json({ error: 'Book not found' }, { status: 404 });

  if (!await checkBookOwnership(auth, env, params.id)) {
    return Response.json({ error: '只能操作自己创建的书籍' }, { status: 403 });
  }

  const body = await parseJsonBody(request);
  if (!body || !body.action) return Response.json({ error: 'Missing action' }, { status: 400 });
  const { action } = body;
  if (!VALID_ACTIONS.includes(action)) return Response.json({ error: 'Unknown action' }, { status: 400 });

  const currentStatus = book.status || 'normal';

  if (action === 'unlist') {
    if (currentStatus !== 'normal') return Response.json({ error: '只有正常状态的书籍才能下架' }, { status: 400 });
    await env.DB.prepare(
      "UPDATE books SET status = 'unlisted', delete_at = NULL, updated_at = datetime('now') WHERE id = ?"
    ).bind(params.id).run();
    return Response.json({ success: true, message: '已下架' });
  }

  if (action === 'restore') {
    if (currentStatus === 'normal') return Response.json({ error: '该书籍已是正常状态' }, { status: 400 });
    await env.DB.prepare(
      "UPDATE books SET status = 'normal', delete_at = NULL, updated_at = datetime('now') WHERE id = ?"
    ).bind(params.id).run();
    return Response.json({ success: true, message: '已恢复上架' });
  }

  if (action === 'purge') {
    if (currentStatus !== 'deleted') {
      return Response.json({ error: '只有已删除的书籍才能彻底清理' }, { status: 400 });
    }
    if (!requireMinRole(auth, 'super_admin')) {
      return Response.json({ error: '只有超级管理员可以彻底清理' }, { status: 403 });
    }

    // CAS：避免重复清理
    const { meta } = await env.DB.prepare(
      "UPDATE books SET status = 'purging' WHERE id = ? AND status = 'deleted'"
    ).bind(params.id).run();
    if (!meta.changes) return Response.json({ error: '该书籍正在清理或已被清理' }, { status: 409 });

    // 先收集R2 keys（DB删后就拿不到了）
    const { results: chapters } = await env.DB.prepare('SELECT content_key FROM chapters WHERE book_id = ?')
      .bind(params.id).all();
    const r2Keys = (chapters || [])
      .map((c) => c?.content_key)
      .filter((k) => k && k !== 'pending');
    if (book.cover_key) r2Keys.push(book.cover_key);
    if (book.source_key) r2Keys.push(book.source_key);

    await env.DB.batch([
      env.DB.prepare('DELETE FROM chapter_stats WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)').bind(params.id),
      env.DB.prepare('DELETE FROM book_stats WHERE book_id = ?').bind(params.id),
      env.DB.prepare('DELETE FROM book_tags WHERE book_id = ?').bind(params.id),
      env.DB.prepare('DELETE FROM votes WHERE annotation_id IN (SELECT id FROM annotations WHERE book_id = ?)').bind(params.id),
      env.DB.prepare('DELETE FROM reports WHERE book_id = ?').bind(params.id),
      env.DB.prepare('DELETE FROM annotation_likes WHERE annotation_id IN (SELECT id FROM annotations WHERE book_id = ?)').bind(params.id),
      env.DB.prepare('DELETE FROM annotations WHERE book_id = ?').bind(params.id),
      env.DB.prepare('DELETE FROM chapters WHERE book_id = ?').bind(params.id),
      env.DB.prepare('DELETE FROM books WHERE id = ?').bind(params.id),
    ]);

    await Promise.all(r2Keys.map((k) => env.R2.delete(k).catch(() => {})));
    return Response.json({ success: true, message: '已彻底清理' });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}
