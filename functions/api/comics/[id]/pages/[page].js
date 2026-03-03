// GET /api/comics/:id/pages/:page — 漫画页图（公开）
import { validateId, ensureSchemaReady } from '../../../_utils.js';
import { getRepoConfig, githubRawFetchByPath, sanitizeRepoPath } from '../../../utils/githubRepoContent.js';

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

  // GitHub 直连：image_key = "gh:<path>"
  if (String(row.image_key).startsWith('gh:')) {
    try {
      const config = await getRepoConfig(env);
      if (!config?.enabled || !config.owner || !config.repo || !config.branch || !config.comicsPath) {
        return new Response('Not found', { status: 404 });
      }

      const cleanPath = sanitizeRepoPath(String(row.image_key).slice(3), [config.comicsPath]);
      const upstream = await githubRawFetchByPath(env, config, cleanPath);

      const headers = new Headers();
      headers.set('Content-Type', upstream.headers.get('content-type') || row.content_type || 'image/jpeg');
      headers.set('Cache-Control', 'public, max-age=86400');
      return new Response(upstream.body, { headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }

  const obj = await env.R2.get(row.image_key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || row.content_type || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=86400');
  return new Response(obj.body, { headers });
}
