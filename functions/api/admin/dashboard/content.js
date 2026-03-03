// GET /api/admin/dashboard/content?kind=novel|comic&id=<id> — 看板按内容获取统计 + 进度
import { checkAdmin, validateId } from '../../_utils.js';

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

function dateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}

async function loadNovelViews(env, bookId, { today, thirtyDaysAgo }) {
  const todayRow = await env.DB.prepare('SELECT COALESCE(views, 0) as views FROM book_stats WHERE book_id = ? AND date = ?')
    .bind(bookId, today)
    .first();
  const last30Row = await env.DB.prepare('SELECT COALESCE(SUM(views), 0) as views FROM book_stats WHERE book_id = ? AND date >= ?')
    .bind(bookId, thirtyDaysAgo)
    .first();
  const totalRow = await env.DB.prepare('SELECT COALESCE(SUM(views), 0) as views FROM book_stats WHERE book_id = ?').bind(bookId).first();
  const { results: daily } = await env.DB.prepare(
    'SELECT date, COALESCE(views, 0) as views FROM book_stats WHERE book_id = ? AND date >= ? ORDER BY date ASC'
  )
    .bind(bookId, thirtyDaysAgo)
    .all();

  return {
    today_views: todayRow?.views || 0,
    last30_views: last30Row?.views || 0,
    total_views: totalRow?.views || 0,
    daily: daily || [],
  };
}

async function loadComicViews(env, comicId, { today, thirtyDaysAgo }) {
  const todayRow = await env.DB.prepare('SELECT COALESCE(views, 0) as views FROM comic_stats WHERE comic_id = ? AND date = ?')
    .bind(comicId, today)
    .first()
    .catch(() => ({ views: 0 }));
  const last30Row = await env.DB.prepare('SELECT COALESCE(SUM(views), 0) as views FROM comic_stats WHERE comic_id = ? AND date >= ?')
    .bind(comicId, thirtyDaysAgo)
    .first()
    .catch(() => ({ views: 0 }));
  const totalRow = await env.DB.prepare('SELECT COALESCE(SUM(views), 0) as views FROM comic_stats WHERE comic_id = ?')
    .bind(comicId)
    .first()
    .catch(() => ({ views: 0 }));
  const { results: daily } = await env.DB.prepare(
    'SELECT date, COALESCE(views, 0) as views FROM comic_stats WHERE comic_id = ? AND date >= ? ORDER BY date ASC'
  )
    .bind(comicId, thirtyDaysAgo)
    .all()
    .catch(() => ({ results: [] }));

  return {
    today_views: todayRow?.views || 0,
    last30_views: last30Row?.views || 0,
    total_views: totalRow?.views || 0,
    daily: daily || [],
  };
}

async function loadNovelProgress(env, userId, book) {
  const p = await env.DB.prepare(
    'SELECT chapter_id, source_chapter_index, scroll_pct, updated_at FROM book_reading_progress WHERE user_id = ? AND book_id = ?'
  )
    .bind(userId, book.id)
    .first();
  if (!p) return null;

  const scrollPct = clamp01(p.scroll_pct);
  let progressPct = scrollPct * 100;
  let href = `/book?id=${book.id}`;

  const progress = {
    chapterId: p.chapter_id || null,
    sourceChapterIndex: p.source_chapter_index || null,
    scrollPct,
    updatedAt: p.updated_at || null,
    progressPct: 0,
    title: book.title || '未命名',
    subtitle: '',
    href,
    chapterIndex: null,
    totalChapters: null,
  };

  if (p.chapter_id) {
    const ch = await env.DB.prepare('SELECT id, title, sort_order FROM chapters WHERE id = ?').bind(p.chapter_id).first();
    progress.subtitle = ch?.title || `章节 ${p.chapter_id}`;
    if (ch?.id) href = `/read?id=${ch.id}`;
    progress.href = href;

    const totalRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM chapters WHERE book_id = ?').bind(book.id).first();
    const total = Number(totalRow?.cnt || 0) || 0;
    progress.totalChapters = total || null;
    if (total > 0 && ch) {
      const idxRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM chapters WHERE book_id = ? AND sort_order <= ?')
        .bind(book.id, ch.sort_order)
        .first();
      const idx = Number(idxRow?.cnt || 0) || 0;
      progress.chapterIndex = idx || null;
      if (idx > 0) progressPct = ((idx - 1 + scrollPct) / total) * 100;
    }
  } else if (p.source_chapter_index) {
    const idx = Number(p.source_chapter_index) || 0;
    progress.subtitle = idx > 0 ? `第 ${idx} 章` : '';
    progress.href = idx > 0 ? `/read?book=${book.id}#pos=${idx}` : href;

    const total = Number(book.source_chapter_count || 0) || 0;
    progress.totalChapters = total || null;
    progress.chapterIndex = idx || null;
    if (total > 0 && idx > 0) progressPct = ((idx - 1 + scrollPct) / total) * 100;
  }

  progress.progressPct = clampPct(progressPct);
  return progress;
}

async function loadComicProgress(env, userId, comic) {
  const p = await env.DB.prepare('SELECT page, updated_at FROM comic_reading_progress WHERE user_id = ? AND comic_id = ?')
    .bind(userId, comic.id)
    .first();
  if (!p) return null;

  const page = Number(p.page || 0) || 0;
  const total = Number(comic.page_count || 0) || 0;
  const progressPct = total > 0 && page > 0 ? (page / total) * 100 : 0;
  return {
    page,
    pageCount: total,
    updatedAt: p.updated_at || null,
    progressPct: clampPct(progressPct),
    title: comic.title || '未命名',
    subtitle: page > 0 ? `第 ${page} 页` : '',
    href: page > 0 ? `/comic-read?id=${comic.id}&page=${page}` : `/comic-read?id=${comic.id}`,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const kind = String(url.searchParams.get('kind') || '').trim();
  const id = url.searchParams.get('id');
  if (kind !== 'novel' && kind !== 'comic') return Response.json({ error: 'Invalid kind' }, { status: 400 });
  if (!validateId(id)) return Response.json({ error: 'Invalid id' }, { status: 400 });

  const numericId = Number(id);
  const today = dateStr(Date.now());
  const thirtyDaysAgo = dateStr(Date.now() - 30 * 86400000);

  try {
    if (kind === 'novel') {
      const book = await env.DB.prepare(
        `
          SELECT
            b.id, b.title, b.author, b.description,
            b.source_chapter_count, b.source_word_count,
            (SELECT COUNT(*) FROM chapters WHERE book_id = b.id) as chapter_count,
            (SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE book_id = b.id) as total_words
          FROM books b
          WHERE b.id = ?
        `
      )
        .bind(numericId)
        .first();
      if (!book) return Response.json({ error: 'Not found' }, { status: 404 });

      const views = await loadNovelViews(env, book.id, { today, thirtyDaysAgo });
      const progress = await loadNovelProgress(env, auth.userId, book);

      return Response.json({ success: true, kind, book, views, progress });
    }

    const comic = await env.DB.prepare('SELECT id, title, description, page_count FROM comics WHERE id = ?').bind(numericId).first();
    if (!comic) return Response.json({ error: 'Not found' }, { status: 404 });

    const views = await loadComicViews(env, comic.id, { today, thirtyDaysAgo });
    const progress = await loadComicProgress(env, auth.userId, comic);

    return Response.json({ success: true, kind, comic, views, progress });
  } catch (e) {
    console.error('dashboard content error:', e);
    return Response.json({ error: 'Load failed' }, { status: 500 });
  }
}

