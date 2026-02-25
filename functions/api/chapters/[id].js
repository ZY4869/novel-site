// GET /api/chapters/:id — 获取章节内容（D1元数据 + R2正文）
import { validateId } from '../_utils.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;

  if (!validateId(id)) {
    return Response.json({ error: 'Invalid chapter ID' }, { status: 400 });
  }

  // 从D1读取章节元数据（不暴露content_key）
  const chapter = await env.DB.prepare(`
    SELECT c.id, c.book_id, c.title, c.sort_order, c.word_count, c.created_at, c.updated_at,
           b.title as book_title, b.status as book_status
    FROM chapters c
    JOIN books b ON c.book_id = b.id
    WHERE c.id = ?
  `).bind(id).first();

  if (!chapter) {
    return Response.json({ error: 'Chapter not found' }, { status: 404 });
  }

  // 下架或待删除的书籍不可阅读
  // 下架或待删除的书籍不可阅读
  if (chapter.book_status && chapter.book_status !== 'normal') {
    return Response.json({ error: '该书籍已下架' }, { status: 403 });
  }
  // 🟢-1: 不暴露内部字段
  delete chapter.book_status;

  // 从R2读取正文内容（需要单独查content_key）
  let content = '';
  const chapterFull = await env.DB.prepare('SELECT content_key FROM chapters WHERE id = ?').bind(id).first();
  if (chapterFull && chapterFull.content_key && chapterFull.content_key !== 'pending') {
    const r2Object = await env.R2.get(chapterFull.content_key);
    if (r2Object) content = await r2Object.text();
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

  const response = Response.json({
    chapter,
    content,
    prevChapter: prevChapter || null,
    nextChapter: nextChapter || null
  });

  // 异步记录阅读统计（不阻塞响应）
  context.waitUntil(trackChapterView(env, chapter));

  return response;
}

async function trackChapterView(env, chapter) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // 章节阅读量 +1
    await env.DB.prepare(
      "INSERT INTO chapter_stats (chapter_id, views) VALUES (?, 1) ON CONFLICT(chapter_id) DO UPDATE SET views = views + 1"
    ).bind(chapter.id).run();
    // 书籍日阅读量 +1
    await env.DB.prepare(
      "INSERT INTO book_stats (book_id, date, views) VALUES (?, ?, 1) ON CONFLICT(book_id, date) DO UPDATE SET views = views + 1"
    ).bind(chapter.book_id, today).run();
  } catch (e) {
    console.error('Track chapter view error:', e);
  }
}
