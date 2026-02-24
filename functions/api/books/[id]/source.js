// GET /api/books/:id/source — 下载书籍源文件（不拆解保留）
import { validateId, ensureSchemaReady, sanitizeFilename } from '../../_utils.js';

function contentDispositionAttachment(filename) {
  const safe = String(filename || 'file').replace(/["\\]/g, '_');
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;

  if (!validateId(id)) return new Response('Not found', { status: 404 });
  await ensureSchemaReady(env);

  const book = await env.DB.prepare(
    'SELECT source_key, source_name, source_type FROM books WHERE id = ?'
  ).bind(id).first();

  if (!book || !book.source_key) return new Response('Not found', { status: 404 });

  const obj = await env.R2.get(book.source_key);
  if (!obj) return new Response('Not found', { status: 404 });

  const filename = sanitizeFilename(book.source_name || `book-${id}`, 120);
  const ct = obj.httpMetadata?.contentType || book.source_type || 'application/octet-stream';

  const headers = new Headers();
  headers.set('Content-Type', ct);
  headers.set('Content-Disposition', contentDispositionAttachment(filename));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'private, max-age=0, no-store');

  return new Response(obj.body, { headers });
}

