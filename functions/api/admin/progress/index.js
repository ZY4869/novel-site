// POST /api/admin/progress — 上报阅读/观看进度（用于管理端看板展示）
import { checkAdmin, parseJsonBody, parseNullableInt } from '../../_utils.js';

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function parsePositiveInt(value) {
  const r = parseNullableInt(value, { min: 1 });
  if (!r.ok) return null;
  return r.value === undefined ? null : r.value;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await parseJsonBody(request);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const kind = String(body.kind || '').trim();
  if (kind !== 'novel' && kind !== 'comic') {
    return Response.json({ error: 'Invalid kind' }, { status: 400 });
  }

  try {
    if (kind === 'novel') {
      const bookId = parsePositiveInt(body.bookId);
      if (!bookId) return Response.json({ error: 'Invalid bookId' }, { status: 400 });

      const chapterId = parsePositiveInt(body.chapterId);
      const sourceChapterIndex = parsePositiveInt(body.sourceChapterIndex);
      if (!!chapterId && !!sourceChapterIndex) {
        return Response.json({ error: 'Invalid progress target' }, { status: 400 });
      }
      if (!chapterId && !sourceChapterIndex) {
        return Response.json({ error: 'Missing progress target' }, { status: 400 });
      }

      const scrollPct = clamp01(body.scrollPct);

      await env.DB.prepare(
        `
          INSERT INTO book_reading_progress (user_id, book_id, chapter_id, source_chapter_index, scroll_pct, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, book_id) DO UPDATE SET
            chapter_id = excluded.chapter_id,
            source_chapter_index = excluded.source_chapter_index,
            scroll_pct = excluded.scroll_pct,
            updated_at = datetime('now')
        `
      )
        .bind(auth.userId, bookId, chapterId || null, sourceChapterIndex || null, scrollPct)
        .run();

      return Response.json({ success: true });
    }

    const comicId = parsePositiveInt(body.comicId);
    if (!comicId) return Response.json({ error: 'Invalid comicId' }, { status: 400 });
    const page = parsePositiveInt(body.page);
    if (!page) return Response.json({ error: 'Invalid page' }, { status: 400 });

    await env.DB.prepare(
      `
        INSERT INTO comic_reading_progress (user_id, comic_id, page, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, comic_id) DO UPDATE SET
          page = excluded.page,
          updated_at = datetime('now')
      `
    )
      .bind(auth.userId, comicId, page)
      .run();

    return Response.json({ success: true });
  } catch (e) {
    console.error('progress error:', e);
    return Response.json({ error: 'Update failed' }, { status: 500 });
  }
}
