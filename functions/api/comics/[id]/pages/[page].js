// GET /api/comics/:id/pages/:page — 漫画页图（公开）
import { validateId, ensureSchemaReady } from '../../../_utils.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;
  const pageStr = params.page;

  if (!validateId(id) || !validateId(pageStr)) return new Response('Not found', { status: 404 });
  const pageIndex = Number(pageStr);
  if (!Number.isFinite(pageIndex) || pageIndex < 1 || pageIndex > 9999) return new Response('Not found', { status: 404 });

  await ensureSchemaReady(env);

  const row = await env.DB.prepare(
    'SELECT image_key, content_type FROM comic_pages WHERE comic_id = ? AND page_index = ?'
  ).bind(id, pageIndex).first();

  if (!row || !row.image_key) return new Response('Not found', { status: 404 });

  const obj = await env.R2.get(row.image_key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || row.content_type || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=86400');
  return new Response(obj.body, { headers });
}

