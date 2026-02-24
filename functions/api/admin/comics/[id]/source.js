// PUT /api/admin/comics/:id/source — 上传漫画源文件（CBZ，不拆解保留）
import { checkAdmin, validateId, checkComicOwnership, sanitizeFilename } from '../../../_utils.js';

const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

function getFileSize(request) {
  const sizeStr = request.headers.get('X-File-Size');
  if (!sizeStr || !/^\d+$/.test(sizeStr)) return null;
  const size = Number(sizeStr);
  if (!Number.isFinite(size) || size <= 0) return null;
  return size;
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
  if (!validateId(comicId)) return Response.json({ error: 'Invalid comic ID' }, { status: 400 });

  const comic = await env.DB.prepare('SELECT id, source_key FROM comics WHERE id = ?').bind(comicId).first();
  if (!comic) return Response.json({ error: 'Comic not found' }, { status: 404 });

  if (!await checkComicOwnership(auth, env, comicId)) {
    return Response.json({ error: '只能管理自己创建的漫画' }, { status: 403 });
  }

  const size = getFileSize(request);
  if (!size) return Response.json({ error: 'Missing or invalid X-File-Size' }, { status: 400 });
  if (size > MAX_SOURCE_BYTES) return Response.json({ error: 'File too large' }, { status: 413 });

  const rawName = request.headers.get('X-File-Name') || 'comic.cbz';
  let safeName = sanitizeFilename(rawName, 120);
  if (!/\.cbz$/i.test(safeName)) safeName = safeName.replace(/\.\w+$/,'') + '.cbz';

  const contentType = (request.headers.get('Content-Type') || '').trim() || 'application/zip';
  if (!request.body) return Response.json({ error: 'Empty body' }, { status: 400 });

  const key = `sources/comics/${comicId}/${Date.now()}-${safeName}`;

  try {
    await env.R2.put(key, request.body, { httpMetadata: { contentType } });
  } catch (e) {
    console.error('Comic source upload error:', e);
    return Response.json({ error: 'Failed to store source file' }, { status: 500 });
  }

  try {
    await env.DB.prepare(`
      UPDATE comics
      SET source_key = ?, source_name = ?, source_type = ?, source_size = ?,
          source_uploaded_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(key, safeName, contentType, size, comicId).run();
  } catch (e) {
    console.error('Comic source DB update error:', e);
    await env.R2.delete(key).catch(() => {});
    return Response.json({ error: 'Failed to save source metadata' }, { status: 500 });
  }

  if (comic.source_key && comic.source_key !== key) {
    await env.R2.delete(comic.source_key).catch(() => {});
  }

  return Response.json({ success: true, source_key: key, source_name: safeName, source_size: size });
}

