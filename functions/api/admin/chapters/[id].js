// PUT /api/admin/chapters/:id — 编辑章节
// DELETE /api/admin/chapters/:id — 删除章节
import { checkAdmin, validateId, parseJsonBody } from '../../_utils.js';

const MAX_CONTENT_LENGTH = 500000;

async function authCheck(request, env) {
  const auth = await checkAdmin(request, env);
  if (!auth.ok) {
    const status = auth.reason === 'locked' ? 429 : 401;
    const msg = auth.reason === 'locked' ? 'Too many failed attempts, try again later' : 'Unauthorized';
    return Response.json({ error: msg }, { status });
  }
  return null;
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const denied = await authCheck(request, env);
  if (denied) return denied;
  if (!validateId(params.id)) return Response.json({ error: 'Invalid chapter ID' }, { status: 400 });

  const chapter = await env.DB.prepare('SELECT * FROM chapters WHERE id = ?').bind(params.id).first();
  if (!chapter) return Response.json({ error: 'Chapter not found' }, { status: 404 });

  const body = await parseJsonBody(request);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const { title, content } = body;

  if (title && typeof title === 'string' && title.trim().length > 0) {
    if (title.length > 200) return Response.json({ error: 'Title too long' }, { status: 400 });
    await env.DB.prepare("UPDATE chapters SET title = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(title.trim(), params.id).run();
  }

  if (content && typeof content === 'string' && content.trim().length > 0) {
    if (content.length > MAX_CONTENT_LENGTH) {
      return Response.json({ error: `Content too long (max ${MAX_CONTENT_LENGTH} chars)` }, { status: 400 });
    }
    const wordCount = content.trim().length;
    try {
      await env.R2.put(chapter.content_key, content.trim());
      await env.DB.prepare("UPDATE chapters SET word_count = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(wordCount, params.id).run();
    } catch {
      return Response.json({ error: 'Failed to update content' }, { status: 500 });
    }
  }

  await env.DB.prepare("UPDATE books SET updated_at = datetime('now') WHERE id = ?")
    .bind(chapter.book_id).run();

  return Response.json({ success: true });
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const denied = await authCheck(request, env);
  if (denied) return denied;
  if (!validateId(params.id)) return Response.json({ error: 'Invalid chapter ID' }, { status: 400 });

  const chapter = await env.DB.prepare('SELECT * FROM chapters WHERE id = ?').bind(params.id).first();
  if (!chapter) return Response.json({ error: 'Chapter not found' }, { status: 404 });

  await env.DB.prepare('DELETE FROM chapters WHERE id = ?').bind(params.id).run();
  await env.R2.delete(chapter.content_key).catch(() => {});

  await env.DB.prepare("UPDATE books SET updated_at = datetime('now') WHERE id = ?")
    .bind(chapter.book_id).run();

  return Response.json({ success: true });
}
