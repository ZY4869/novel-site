// GET /api/categories — 公开分类列表（仅返回至少包含 1 本可见书籍的分类）
import { checkAdmin, ensureSchemaReady } from './_utils.js';

function parseMarksJson(raw) {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed.map((x) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  await ensureSchemaReady(env);

  const auth = await checkAdmin(request, env);
  const isAdmin = auth.ok;
  const isDemo = isAdmin && auth.role === 'demo';

  const commonQuery = `
    SELECT c.id, c.name, c.is_special, c.marks_json,
      COUNT(b.id) as book_count
    FROM book_categories c
    JOIN book_category_books bcb ON bcb.category_id = c.id
    JOIN books b ON b.id = bcb.book_id
  `;

  const query = !isAdmin
    ? `
      ${commonQuery}
      WHERE (b.status IS NULL OR b.status = 'normal')
      GROUP BY c.id
      HAVING COUNT(b.id) > 0
      ORDER BY c.is_special DESC, c.name ASC
    `
    : isDemo
      ? `
        ${commonQuery}
        WHERE (b.status IS NULL OR b.status = 'normal') OR b.created_by = ?
        GROUP BY c.id
        HAVING COUNT(b.id) > 0
        ORDER BY c.is_special DESC, c.name ASC
      `
      : `
        ${commonQuery}
        GROUP BY c.id
        HAVING COUNT(b.id) > 0
        ORDER BY c.is_special DESC, c.name ASC
      `;

  const stmt = env.DB.prepare(query);
  const { results } = isDemo ? await stmt.bind(auth.userId).all() : await stmt.all();

  const categories = (results || []).map((c) => ({
    id: c.id,
    name: c.name,
    is_special: c.is_special ? 1 : 0,
    marks: parseMarksJson(c.marks_json),
    book_count: Number(c.book_count || 0) || 0,
  }));

  return Response.json({ categories });
}

