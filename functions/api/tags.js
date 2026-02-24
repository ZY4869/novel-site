// GET /api/tags — 公开标签列表
import { ensureSchemaReady } from './_utils.js';

export async function onRequestGet(context) {
  const { env } = context;
  await ensureSchemaReady(env);
  const { results } = await env.DB.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM book_tags WHERE tag_id = t.id) as book_count
    FROM tags t ORDER BY t.name ASC
  `).all();
  return Response.json({ tags: results });
}
