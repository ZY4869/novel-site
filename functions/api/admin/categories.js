// CRUD /api/admin/categories — 分类管理
import { checkAdmin, parseJsonBody, requireMinRole, validateId } from '../_utils.js';
import { normalizeMarks } from '../utils/categoryMarks.js';

function parseMarksJson(raw) {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed.map((x) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function toBoolInt(v) {
  if (v === true) return 1;
  if (v === false) return 0;
  if (v === 1 || v === '1') return 1;
  if (v === 0 || v === '0') return 0;
  if (typeof v === 'string' && v.toLowerCase() === 'true') return 1;
  if (typeof v === 'string' && v.toLowerCase() === 'false') return 0;
  return 0;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { results } = await env.DB.prepare(`
    SELECT c.id, c.name, c.marks_json, c.is_special, c.created_by, c.created_at, c.updated_at,
      (SELECT COUNT(*) FROM book_category_books bcb WHERE bcb.category_id = c.id) as book_count
    FROM book_categories c
    ORDER BY c.is_special DESC, c.name ASC
  `).all();

  const categories = (results || []).map((c) => ({
    id: c.id,
    name: c.name,
    is_special: c.is_special ? 1 : 0,
    marks: parseMarksJson(c.marks_json),
    book_count: Number(c.book_count || 0) || 0,
    created_by: c.created_by ?? null,
    created_at: c.created_at ?? null,
    updated_at: c.updated_at ?? null,
  }));

  return Response.json({ categories });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireMinRole(auth, 'admin')) return Response.json({ error: '权限不足' }, { status: 403 });

  const body = await parseJsonBody(request);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const name = String(body.name || '').trim().slice(0, 50);
  if (!name) return Response.json({ error: 'name required' }, { status: 400 });

  const marks = Object.prototype.hasOwnProperty.call(body, 'marks') ? normalizeMarks(body.marks) : [];
  const isSpecial = toBoolInt(body.is_special);

  try {
    const r = await env.DB.prepare(
      'INSERT INTO book_categories (name, marks_json, is_special, created_by) VALUES (?, ?, ?, ?)'
    ).bind(name, JSON.stringify(marks), isSpecial, auth.userId).run();

    return Response.json(
      { success: true, category: { id: r.meta.last_row_id, name, is_special: isSpecial, marks } },
      { status: 201 }
    );
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return Response.json({ error: '分类已存在' }, { status: 409 });
    console.error('create category error:', e);
    return Response.json({ error: 'Failed to create category' }, { status: 500 });
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireMinRole(auth, 'admin')) return Response.json({ error: '权限不足' }, { status: 403 });

  const body = await parseJsonBody(request);
  if (!body || !body.id) return Response.json({ error: 'id required' }, { status: 400 });
  if (!validateId(String(body.id))) return Response.json({ error: 'Invalid id' }, { status: 400 });

  const existing = await env.DB.prepare('SELECT id FROM book_categories WHERE id = ?').bind(body.id).first();
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

  const sets = [];
  const vals = [];

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = String(body.name || '').trim().slice(0, 50);
    if (!name) return Response.json({ error: 'name required' }, { status: 400 });
    sets.push('name = ?');
    vals.push(name);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'marks')) {
    const marks = normalizeMarks(body.marks);
    sets.push('marks_json = ?');
    vals.push(JSON.stringify(marks));
  }

  if (Object.prototype.hasOwnProperty.call(body, 'is_special')) {
    sets.push('is_special = ?');
    vals.push(toBoolInt(body.is_special));
  }

  if (sets.length === 0) return Response.json({ error: 'Nothing to update' }, { status: 400 });

  sets.push("updated_at = datetime('now')");

  vals.push(body.id);
  try {
    await env.DB.prepare(`UPDATE book_categories SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return Response.json({ success: true });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return Response.json({ error: '分类名已存在' }, { status: 409 });
    console.error('update category error:', e);
    return Response.json({ error: 'Failed to update category' }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireMinRole(auth, 'admin')) return Response.json({ error: '权限不足' }, { status: 403 });

  const body = await parseJsonBody(request);
  if (!body || !body.id) return Response.json({ error: 'id required' }, { status: 400 });
  if (!validateId(String(body.id))) return Response.json({ error: 'Invalid id' }, { status: 400 });

  await env.DB.batch([
    env.DB.prepare('DELETE FROM book_category_books WHERE category_id = ?').bind(body.id),
    env.DB.prepare('DELETE FROM book_categories WHERE id = ?').bind(body.id),
  ]);

  return Response.json({ success: true });
}

