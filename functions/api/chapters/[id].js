// GET /api/chapters/:id — 获取章节内容（D1元数据 + R2正文）
import { validateId } from '../_utils.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;

  if (!validateId(id)) {
    return Response.json({ error: 'Invalid chapter ID' }, { status: 400 });
  }

  // 从D1读取章节元数据
  const chapter = await env.DB.prepare(`
    SELECT c.*, b.title as book_title
    FROM chapters c
    JOIN books b ON c.book_id = b.id
    WHERE c.id = ?
  `).bind(id).first();

  if (!chapter) {
    return Response.json({ error: 'Chapter not found' }, { status: 404 });
  }

  // 从R2读取正文内容
  let content = '';
  const r2Object = await env.R2.get(chapter.content_key);
  if (r2Object) {
    content = await r2Object.text();
  }

  // 查询上一章和下一章
  const prevChapter = await env.DB.prepare(`
    SELECT id, title FROM chapters
    WHERE book_id = ? AND sort_order < ?
    ORDER BY sort_order DESC LIMIT 1
  `).bind(chapter.book_id, chapter.sort_order).first();

  const nextChapter = await env.DB.prepare(`
    SELECT id, title FROM chapters
    WHERE book_id = ? AND sort_order > ?
    ORDER BY sort_order ASC LIMIT 1
  `).bind(chapter.book_id, chapter.sort_order).first();

  return Response.json({
    chapter,
    content,
    prevChapter: prevChapter || null,
    nextChapter: nextChapter || null
  });
}
