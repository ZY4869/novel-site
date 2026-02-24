// POST /api/admin/comics/:id/finalize — 收口：写入 page_count
import { checkAdmin, validateId, checkComicOwnership } from '../../../_utils.js';

export async function onRequestPost(context) {
  const { request, env, params } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) {
    const status = auth.reason === 'locked' ? 429 : 401;
    const msg = auth.reason === 'locked' ? 'Too many failed attempts, try again later' : 'Unauthorized';
    return Response.json({ error: msg }, { status });
  }

  const comicId = params.id;
  if (!validateId(comicId)) return Response.json({ error: 'Invalid comic ID' }, { status: 400 });

  const comic = await env.DB.prepare('SELECT id FROM comics WHERE id = ?').bind(comicId).first();
  if (!comic) return Response.json({ error: 'Comic not found' }, { status: 404 });

  if (!await checkComicOwnership(auth, env, comicId)) {
    return Response.json({ error: '只能管理自己创建的漫画' }, { status: 403 });
  }

  const r = await env.DB.prepare('SELECT COUNT(*) as cnt FROM comic_pages WHERE comic_id = ?').bind(comicId).first();
  const pageCount = Number(r?.cnt || 0);

  await env.DB.prepare("UPDATE comics SET page_count = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(pageCount, comicId).run();

  return Response.json({ success: true, page_count: pageCount });
}

