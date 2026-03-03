// GET /api/comics/:id/cover — 漫画封面（公开）
import { validateId, ensureSchemaReady } from '../../_utils.js';
import { getRepoConfig, githubRawFetchByPath, sanitizeRepoPath } from '../../utils/githubRepoContent.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;
  if (!validateId(id)) return new Response('Not found', { status: 404 });
  await ensureSchemaReady(env);

  const comic = await env.DB.prepare('SELECT cover_key FROM comics WHERE id = ?').bind(id).first();
  if (!comic) return new Response('Not found', { status: 404 });

  let key = comic.cover_key;
  let contentType = null;
  if (!key) {
    const first = await env.DB.prepare('SELECT image_key, content_type FROM comic_pages WHERE comic_id = ? AND page_index = 1')
      .bind(id).first();
    key = first?.image_key || null;
    contentType = first?.content_type || null;
  }
  if (!key) return new Response('Not found', { status: 404 });

  // GitHub 直连：cover_key / image_key = "gh:<path>"
  if (String(key).startsWith('gh:')) {
    try {
      const config = await getRepoConfig(env);
      if (!config?.enabled || !config.owner || !config.repo || !config.branch || !config.comicsPath) {
        return new Response('Not found', { status: 404 });
      }

      const cleanPath = sanitizeRepoPath(String(key).slice(3), [config.comicsPath]);
      const upstream = await githubRawFetchByPath(env, config, cleanPath);

      const headers = new Headers();
      headers.set('Content-Type', upstream.headers.get('content-type') || contentType || 'image/jpeg');
      headers.set('Cache-Control', 'public, max-age=86400');
      return new Response(upstream.body, { headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }

  const obj = await env.R2.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || contentType || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=86400');
  return new Response(obj.body, { headers });
}
