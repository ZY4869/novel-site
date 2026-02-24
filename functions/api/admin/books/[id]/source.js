// PUT /api/admin/books/:id/source — 上传书籍源文件（不拆解保留）
import { checkAdmin, validateId, checkBookOwnership, sanitizeFilename } from '../../../_utils.js';

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

  const bookId = params.id;
  if (!validateId(bookId)) return Response.json({ error: 'Invalid book ID' }, { status: 400 });

  const book = await env.DB.prepare('SELECT id, source_key FROM books WHERE id = ?').bind(bookId).first();
  if (!book) return Response.json({ error: 'Book not found' }, { status: 404 });

  // demo 只能操作自己创建的书
  if (!await checkBookOwnership(auth, env, bookId)) {
    return Response.json({ error: '只能管理自己创建的书籍' }, { status: 403 });
  }

  const size = getFileSize(request);
  if (!size) return Response.json({ error: 'Missing or invalid X-File-Size' }, { status: 400 });
  if (size > MAX_SOURCE_BYTES) return Response.json({ error: 'File too large' }, { status: 413 });

  const rawName = request.headers.get('X-File-Name') || 'file';
  const safeName = sanitizeFilename(rawName, 120);
  const contentType = (request.headers.get('Content-Type') || '').trim() || 'application/octet-stream';
  if (!request.body) return Response.json({ error: 'Empty body' }, { status: 400 });

  const key = `sources/books/${bookId}/${Date.now()}-${safeName}`;

  try {
    await env.R2.put(key, request.body, { httpMetadata: { contentType } });
  } catch (e) {
    console.error('Book source upload error:', e);
    return Response.json({ error: 'Failed to store source file' }, { status: 500 });
  }

  try {
    await env.DB.prepare(`
      UPDATE books
      SET source_key = ?, source_name = ?, source_type = ?, source_size = ?,
          source_uploaded_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(key, safeName, contentType, size, bookId).run();
  } catch (e) {
    console.error('Book source DB update error:', e);
    await env.R2.delete(key).catch(() => {});
    return Response.json({ error: 'Failed to save source metadata' }, { status: 500 });
  }

  // 替换成功后再删旧源文件
  if (book.source_key && book.source_key !== key) {
    await env.R2.delete(book.source_key).catch(() => {});
  }

  return Response.json({ success: true, source_key: key, source_name: safeName, source_size: size });
}

