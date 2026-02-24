// GET /api/admin/storage/objects — R2 对象明细（分页）
import { checkAdmin } from '../../_utils.js';

function parseLimit(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) return 200;
  return Math.min(1000, Math.max(1, Math.floor(n)));
}

function normalizePrefix(prefix) {
  const p = String(prefix || '').trim();
  if (!p) return '';
  return p.replace(/^\/+/, '').slice(0, 200);
}

function classifyKey(key) {
  const k = String(key || '');

  // sources/books/{bookId}/...
  let m = k.match(/^sources\/books\/(\d+)\//);
  if (m) return { category: 'source', ownerType: 'book', ownerId: Number(m[1]), kind: 'book_source' };

  // novels/books/{bookId}/chapters/{chapterId}.txt
  m = k.match(/^novels\/books\/(\d+)\/chapters\/(\d+)\.txt$/);
  if (m) return { category: 'novel', ownerType: 'book', ownerId: Number(m[1]), kind: 'chapter_text', chapterId: Number(m[2]) };

  // covers/{bookId}.*
  m = k.match(/^covers\/(\d+)\.[a-z0-9]+$/i);
  if (m) return { category: 'cover', ownerType: 'book', ownerId: Number(m[1]), kind: 'cover' };

  // sources/comics/{comicId}/...
  m = k.match(/^sources\/comics\/(\d+)\//);
  if (m) return { category: 'source', ownerType: 'comic', ownerId: Number(m[1]), kind: 'comic_source' };

  // comics/{comicId}/pages/{page}.*
  m = k.match(/^comics\/(\d+)\/pages\/(\d{4})\.[a-z0-9]+$/i);
  if (m) return { category: 'comic', ownerType: 'comic', ownerId: Number(m[1]), kind: 'comic_page', pageIndex: Number(m[2]) };

  if (k.startsWith('fonts/')) return { category: 'font', ownerType: 'site', ownerId: null, kind: 'font' };
  if (k.startsWith('derived/')) return { category: 'derived', ownerType: null, ownerId: null, kind: 'derived' };
  if (k.startsWith('novels/')) return { category: 'novel', ownerType: null, ownerId: null, kind: 'novel' };
  if (k.startsWith('comics/')) return { category: 'comic', ownerType: null, ownerId: null, kind: 'comic' };
  if (k.startsWith('sources/')) return { category: 'source', ownerType: null, ownerId: null, kind: 'source' };

  return { category: 'other', ownerType: null, ownerId: null, kind: 'other' };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const prefix = normalizePrefix(url.searchParams.get('prefix'));
  const cursor = url.searchParams.get('cursor') || undefined;
  const limit = parseLimit(url.searchParams.get('limit'));

  const listed = await env.R2.list({ prefix: prefix || undefined, cursor, limit });

  const objects = (listed.objects || []).map(o => {
    const info = classifyKey(o.key);
    return {
      key: o.key,
      size: o.size,
      uploaded: o.uploaded,
      etag: o.etag,
      ...info,
    };
  });

  return Response.json({
    objects,
    cursor: listed.truncated ? listed.cursor : null,
    truncated: !!listed.truncated,
  });
}

