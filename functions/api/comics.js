// GET /api/comics — 漫画列表（公开）
import { ensureSchemaReady } from './_utils.js';

export async function onRequestGet(context) {
  const { env } = context;
  await ensureSchemaReady(env);

  const { results } = await env.DB.prepare(
    "SELECT id, title, description, cover_key, page_count, updated_at FROM comics ORDER BY updated_at DESC"
  ).all();

  const comics = (results || []).map(c => ({
    ...c,
    cover_url: c.cover_key ? `/api/comics/${c.id}/cover` : null,
  }));

  return Response.json({ comics });
}

