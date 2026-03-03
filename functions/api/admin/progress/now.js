// GET /api/admin/progress/now — 当前账号“正在观看内容”（最新进度）
import { checkAdmin } from '../../_utils.js';

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function clampPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return Math.round(v);
}

async function buildNovelNow(env, userId, bookId) {
  const p = await env.DB.prepare(
    'SELECT book_id, chapter_id, source_chapter_index, scroll_pct, updated_at FROM book_reading_progress WHERE user_id = ? AND book_id = ?'
  )
    .bind(userId, bookId)
    .first();
  if (!p) return null;

  const book = await env.DB.prepare('SELECT id, title, source_chapter_count FROM books WHERE id = ?').bind(bookId).first();
  if (!book) return null;

  const scrollPct = clamp01(p.scroll_pct);
  let subtitle = '';
  let href = `/book?id=${book.id}`;
  let progressPct = 0;

  if (p.chapter_id) {
    const ch = await env.DB.prepare('SELECT id, title, sort_order FROM chapters WHERE id = ?').bind(p.chapter_id).first();
    if (ch) {
      subtitle = ch.title || '';
      href = `/read?id=${ch.id}`;

      const totalRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM chapters WHERE book_id = ?').bind(book.id).first();
      const total = Number(totalRow?.cnt || 0) || 0;
      if (total > 0) {
        const idxRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM chapters WHERE book_id = ? AND sort_order <= ?')
          .bind(book.id, ch.sort_order)
          .first();
        const idx = Number(idxRow?.cnt || 0) || 0;
        if (idx > 0) progressPct = ((idx - 1 + scrollPct) / total) * 100;
        else progressPct = scrollPct * 100;
      } else {
        progressPct = scrollPct * 100;
      }
    } else {
      subtitle = `章节 ${p.chapter_id}`;
      progressPct = scrollPct * 100;
    }
  } else if (p.source_chapter_index) {
    const idx = Number(p.source_chapter_index) || 0;
    subtitle = idx > 0 ? `第 ${idx} 章` : '';
    href = idx > 0 ? `/read?book=${book.id}#pos=${idx}` : href;

    const total = Number(book.source_chapter_count || 0) || 0;
    if (total > 0 && idx > 0) progressPct = ((idx - 1 + scrollPct) / total) * 100;
    else progressPct = scrollPct * 100;
  }

  return {
    kind: 'novel',
    bookId: book.id,
    title: book.title || '未命名',
    subtitle,
    progressPct: clampPct(progressPct),
    updatedAt: p.updated_at || null,
    href,
  };
}

async function buildComicNow(env, userId, comicId) {
  const p = await env.DB.prepare('SELECT comic_id, page, updated_at FROM comic_reading_progress WHERE user_id = ? AND comic_id = ?')
    .bind(userId, comicId)
    .first();
  if (!p) return null;

  const comic = await env.DB.prepare('SELECT id, title, page_count FROM comics WHERE id = ?').bind(comicId).first();
  if (!comic) return null;

  const page = Number(p.page || 0) || 0;
  const total = Number(comic.page_count || 0) || 0;
  const progressPct = total > 0 && page > 0 ? (page / total) * 100 : 0;

  return {
    kind: 'comic',
    comicId: comic.id,
    title: comic.title || '未命名',
    subtitle: page > 0 ? `第 ${page} 页` : '',
    progressPct: clampPct(progressPct),
    updatedAt: p.updated_at || null,
    href: page > 0 ? `/comic-read?id=${comic.id}&page=${page}` : `/comic-read?id=${comic.id}`,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const row = await env.DB.prepare(
      `
        SELECT kind, id, updated_at
        FROM (
          SELECT 'novel' AS kind, book_id AS id, updated_at FROM book_reading_progress WHERE user_id = ?
          UNION ALL
          SELECT 'comic' AS kind, comic_id AS id, updated_at FROM comic_reading_progress WHERE user_id = ?
        )
        ORDER BY updated_at DESC
        LIMIT 1
      `
    )
      .bind(auth.userId, auth.userId)
      .first();

    if (!row) return Response.json({ success: true, now: null });

    const kind = String(row.kind || '').trim();
    const id = Number(row.id || 0) || 0;
    if (!id) return Response.json({ success: true, now: null });

    const now = kind === 'novel' ? await buildNovelNow(env, auth.userId, id) : await buildComicNow(env, auth.userId, id);
    return Response.json({ success: true, now: now || null });
  } catch (e) {
    console.error('progress now error:', e);
    return Response.json({ error: 'Load failed' }, { status: 500 });
  }
}

