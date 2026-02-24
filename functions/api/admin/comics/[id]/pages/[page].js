// PUT /api/admin/comics/:id/pages/:page — 上传单页图片（派生数据）
import { checkAdmin, validateId, checkComicOwnership, sanitizeFilename } from '../../../../_utils.js';

const MAX_PAGE_BYTES = 20 * 1024 * 1024;

function getFileSize(request) {
  const sizeStr = request.headers.get('X-File-Size');
  if (!sizeStr || !/^\d+$/.test(sizeStr)) return null;
  const size = Number(sizeStr);
  if (!Number.isFinite(size) || size <= 0) return null;
  return size;
}

function guessExt(contentType, origName) {
  const ct = (contentType || '').toLowerCase();
  const byCt = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/bmp': 'bmp',
  };
  if (byCt[ct]) return byCt[ct];
  const safe = sanitizeFilename(origName || '', 120).toLowerCase();
  const m = safe.match(/\.([a-z0-9]+)$/);
  if (m && ['jpg','jpeg','png','webp','gif','avif','bmp'].includes(m[1])) return m[1] === 'jpeg' ? 'jpg' : m[1];
  return 'img';
}

export async function onRequestPut(context) {
  const { request, env, params } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) {
    const status = auth.reason === 'locked' ? 429 : 401;
    const msg = auth.reason === 'locked' ? 'Too many failed attempts, try again later' : 'Unauthorized';
    return Response.json({ error: msg }, { status });
  }

  const comicId = params.id;
  const pageStr = params.page;
  if (!validateId(comicId) || !validateId(pageStr)) return Response.json({ error: 'Invalid params' }, { status: 400 });
  const pageIndex = Number(pageStr);
  if (!Number.isFinite(pageIndex) || pageIndex < 1 || pageIndex > 9999) {
    return Response.json({ error: 'Invalid page index' }, { status: 400 });
  }

  const comic = await env.DB.prepare('SELECT id, cover_key FROM comics WHERE id = ?').bind(comicId).first();
  if (!comic) return Response.json({ error: 'Comic not found' }, { status: 404 });

  if (!await checkComicOwnership(auth, env, comicId)) {
    return Response.json({ error: '只能管理自己创建的漫画' }, { status: 403 });
  }

  const size = getFileSize(request);
  if (!size) return Response.json({ error: 'Missing or invalid X-File-Size' }, { status: 400 });
  if (size > MAX_PAGE_BYTES) return Response.json({ error: 'File too large' }, { status: 413 });

  const contentType = (request.headers.get('Content-Type') || '').trim();
  if (!contentType.startsWith('image/')) return Response.json({ error: 'Only images allowed' }, { status: 400 });
  if (!request.body) return Response.json({ error: 'Empty body' }, { status: 400 });

  const origName = request.headers.get('X-Orig-Name') || '';
  const ext = guessExt(contentType, origName);
  const pageKey = String(pageIndex).padStart(4, '0');
  const key = `comics/${comicId}/pages/${pageKey}.${ext}`;

  try {
    await env.R2.put(key, request.body, { httpMetadata: { contentType } });
  } catch (e) {
    console.error('Comic page upload error:', e);
    return Response.json({ error: 'Failed to store page' }, { status: 500 });
  }

  const w = request.headers.get('X-Img-Width');
  const h = request.headers.get('X-Img-Height');
  const width = w && /^\d+$/.test(w) ? Number(w) : null;
  const height = h && /^\d+$/.test(h) ? Number(h) : null;

  try {
    await env.DB.prepare(`
      INSERT INTO comic_pages (comic_id, page_index, image_key, width, height, size_bytes, content_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(comic_id, page_index) DO UPDATE SET
        image_key = excluded.image_key,
        width = excluded.width,
        height = excluded.height,
        size_bytes = excluded.size_bytes,
        content_type = excluded.content_type
    `).bind(comicId, pageIndex, key, width, height, size, contentType).run();

    // 第一页作为封面（若尚未设置）
    if (pageIndex === 1 && !comic.cover_key) {
      await env.DB.prepare("UPDATE comics SET cover_key = ? WHERE id = ? AND (cover_key IS NULL OR cover_key = '')")
        .bind(key, comicId).run().catch(() => {});
    }
    await env.DB.prepare("UPDATE comics SET updated_at = datetime('now') WHERE id = ?").bind(comicId).run().catch(() => {});
  } catch (e) {
    console.error('Comic page DB error:', e);
    await env.R2.delete(key).catch(() => {});
    return Response.json({ error: 'Failed to save page metadata' }, { status: 500 });
  }

  return Response.json({ success: true, image_key: key });
}

