// GET/POST /api/admin/comics — 漫画管理（列表/创建）
import { checkAdmin, parseJsonBody, requireMinRole } from '../_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) {
    const status = auth.reason === 'locked' ? 429 : 401;
    const msg = auth.reason === 'locked' ? 'Too many failed attempts, try again later' : 'Unauthorized';
    return Response.json({ error: msg }, { status });
  }

  const isAdmin = requireMinRole(auth, 'admin');
  const q = isAdmin
    ? `SELECT id, title, description, cover_key, source_name, source_type, source_size, source_uploaded_at,
         page_count, created_by, created_at, updated_at
       FROM comics ORDER BY updated_at DESC`
    : `SELECT id, title, description, cover_key, source_name, source_type, source_size, source_uploaded_at,
         page_count, created_by, created_at, updated_at
       FROM comics WHERE created_by = ? ORDER BY updated_at DESC`;

  const stmt = isAdmin ? env.DB.prepare(q) : env.DB.prepare(q).bind(auth.userId);
  const { results } = await stmt.all();
  return Response.json({ comics: results || [] });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) {
    const status = auth.reason === 'locked' ? 429 : 401;
    const msg = auth.reason === 'locked' ? 'Too many failed attempts, try again later' : 'Unauthorized';
    return Response.json({ error: msg }, { status });
  }

  const body = await parseJsonBody(request);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const title = (body.title || '').trim();
  const description = (body.description || '').trim();
  if (!title) return Response.json({ error: 'Title is required' }, { status: 400 });
  if (title.length > 200) return Response.json({ error: 'Title too long (max 200)' }, { status: 400 });

  const r = await env.DB.prepare(
    `INSERT INTO comics (title, description, created_by) VALUES (?, ?, ?)`
  ).bind(title, description.slice(0, 2000), auth.userId).run();

  return Response.json({ success: true, comic: { id: r.meta.last_row_id, title } }, { status: 201 });
}

