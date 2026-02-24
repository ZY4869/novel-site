// GET /api/comics/:id — 漫画详情（公开）
import { validateId, ensureSchemaReady } from '../_utils.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;
  if (!validateId(id)) return Response.json({ error: 'Invalid comic ID' }, { status: 400 });
  await ensureSchemaReady(env);

  const comic = await env.DB.prepare(
    "SELECT id, title, description, cover_key, page_count, updated_at FROM comics WHERE id = ?"
  ).bind(id).first();

  if (!comic) return Response.json({ error: 'Comic not found' }, { status: 404 });
  comic.cover_url = comic.cover_key ? `/api/comics/${comic.id}/cover` : null;
  return Response.json({ comic });
}

