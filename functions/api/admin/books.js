// POST /api/admin/books — 创建新书籍
import { checkAdmin, parseJsonBody } from '../_utils.js';

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

  const { title, description, author } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return Response.json({ error: 'Title is required' }, { status: 400 });
  }
  if (title.length > 200) {
    return Response.json({ error: 'Title too long (max 200)' }, { status: 400 });
  }

  const result = await env.DB.prepare(`
    INSERT INTO books (title, description, author) VALUES (?, ?, ?)
  `).bind(
    title.trim(),
    (description || '').trim().slice(0, 2000),
    (author || '').trim().slice(0, 100)
  ).run();

  return Response.json({
    success: true,
    book: { id: result.meta.last_row_id, title: title.trim() }
  }, { status: 201 });
}
