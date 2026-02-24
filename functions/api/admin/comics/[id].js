// PUT/DELETE /api/admin/comics/:id — 编辑/删除漫画
import { checkAdmin, validateId, parseJsonBody, checkComicOwnership } from '../../_utils.js';

async function deletePrefix(env, prefix) {
  let cursor;
  do {
    const listed = await env.R2.list({ prefix, cursor, limit: 1000 });
    cursor = listed.truncated ? listed.cursor : undefined;
    const keys = (listed.objects || []).map(o => o.key);
    for (let i = 0; i < keys.length; i += 20) {
      await Promise.all(keys.slice(i, i + 20).map(k => env.R2.delete(k).catch(() => {})));
    }
  } while (cursor);
}

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

  const comic = await env.DB.prepare('SELECT * FROM comics WHERE id = ?').bind(params.id).first();
  if (!comic) return Response.json({ error: 'Comic not found' }, { status: 404 });

  if (!await checkComicOwnership(auth, env, params.id)) {
    return Response.json({ error: '只能管理自己创建的漫画' }, { status: 403 });
  }

  const body = await parseJsonBody(request);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const title = (body.title ?? comic.title ?? '').trim().slice(0, 200);
  const description = (body.description ?? comic.description ?? '').trim().slice(0, 2000);
  if (!title) return Response.json({ error: 'Title is required' }, { status: 400 });

  await env.DB.prepare(
    "UPDATE comics SET title = ?, description = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(title, description, params.id).run();

  return Response.json({ success: true });
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const { denied, auth } = await authCheck(request, env);
  if (denied) return denied;
  if (!validateId(params.id)) return Response.json({ error: 'Invalid ID' }, { status: 400 });

  const comic = await env.DB.prepare('SELECT * FROM comics WHERE id = ?').bind(params.id).first();
  if (!comic) return Response.json({ error: 'Comic not found' }, { status: 404 });

  if (!await checkComicOwnership(auth, env, params.id)) {
    return Response.json({ error: '只能管理自己创建的漫画' }, { status: 403 });
  }

  // 先删R2，再删DB（best-effort）
  await deletePrefix(env, `comics/${params.id}/`).catch(() => {});
  await deletePrefix(env, `sources/comics/${params.id}/`).catch(() => {});

  await env.DB.batch([
    env.DB.prepare('DELETE FROM comic_pages WHERE comic_id = ?').bind(params.id),
    env.DB.prepare('DELETE FROM comics WHERE id = ?').bind(params.id),
  ]).catch(() => {});

  return Response.json({ success: true });
}

