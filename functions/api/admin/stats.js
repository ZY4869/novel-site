// GET /api/admin/stats — 访问统计数据
import { checkAdmin } from '../_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // 今日统计
    const today = new Date().toISOString().slice(0, 10);
    const todayStats = await env.DB.prepare(
      "SELECT pv, uv FROM site_visits WHERE date = ?"
    ).bind(today).first() || { pv: 0, uv: 0 };

    // 最近30天统计
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { results: dailyStats } = await env.DB.prepare(
      "SELECT date, pv, uv FROM site_visits WHERE date >= ? ORDER BY date ASC"
    ).bind(thirtyDaysAgo).all();

    // 总计
    const totals = await env.DB.prepare(
      "SELECT COALESCE(SUM(pv), 0) as total_pv, COALESCE(SUM(uv), 0) as total_uv FROM site_visits"
    ).first();

    // 小说阅读概览
    const novelTodayRow = await env.DB.prepare(
      'SELECT COALESCE(SUM(views), 0) as views FROM book_stats WHERE date = ?'
    ).bind(today).first();
    const novelLast30Row = await env.DB.prepare(
      'SELECT COALESCE(SUM(views), 0) as views FROM book_stats WHERE date >= ?'
    ).bind(thirtyDaysAgo).first();
    const novelTotalRow = await env.DB.prepare(
      'SELECT COALESCE(SUM(views), 0) as views FROM book_stats'
    ).first();
    const { results: novelDaily } = await env.DB.prepare(
      'SELECT date, COALESCE(SUM(views), 0) as views FROM book_stats WHERE date >= ? GROUP BY date ORDER BY date ASC'
    ).bind(thirtyDaysAgo).all();

    // 漫画阅读概览
    const comicTodayRow = await env.DB.prepare(
      'SELECT COALESCE(SUM(views), 0) as views FROM comic_stats WHERE date = ?'
    ).bind(today).first().catch(() => ({ views: 0 }));
    const comicLast30Row = await env.DB.prepare(
      'SELECT COALESCE(SUM(views), 0) as views FROM comic_stats WHERE date >= ?'
    ).bind(thirtyDaysAgo).first().catch(() => ({ views: 0 }));
    const comicTotalRow = await env.DB.prepare(
      'SELECT COALESCE(SUM(views), 0) as views FROM comic_stats'
    ).first().catch(() => ({ views: 0 }));
    const { results: comicDaily } = await env.DB.prepare(
      'SELECT date, COALESCE(SUM(views), 0) as views FROM comic_stats WHERE date >= ? GROUP BY date ORDER BY date ASC'
    ).bind(thirtyDaysAgo).all().catch(() => ({ results: [] }));

    // 热门书籍（最近30天阅读量Top10）
    const { results: hotBooks } = await env.DB.prepare(`
      SELECT bs.book_id, b.title, SUM(bs.views) as total_views
      FROM book_stats bs
      JOIN books b ON bs.book_id = b.id
      WHERE bs.date >= ?
      GROUP BY bs.book_id
      ORDER BY total_views DESC
      LIMIT 10
    `).bind(thirtyDaysAgo).all();

    // 热门章节（总阅读量Top10）
    const { results: hotChapters } = await env.DB.prepare(`
      SELECT cs.chapter_id, c.book_id, c.title as chapter_title, b.title as book_title, cs.views
      FROM chapter_stats cs
      JOIN chapters c ON cs.chapter_id = c.id
      JOIN books b ON c.book_id = b.id
      ORDER BY cs.views DESC
      LIMIT 10
    `).all();

    // 热门漫画（最近30天阅读量Top10）
    const { results: hotComics } = await env.DB.prepare(`
      SELECT cs.comic_id, c.title, SUM(cs.views) as total_views
      FROM comic_stats cs
      JOIN comics c ON cs.comic_id = c.id
      WHERE cs.date >= ?
      GROUP BY cs.comic_id
      ORDER BY total_views DESC
      LIMIT 10
    `).bind(thirtyDaysAgo).all().catch(() => ({ results: [] }));

    return Response.json({
      today: todayStats,
      totals,
      daily: dailyStats,
      hotBooks,
      hotChapters,
      hotComics,
      reading: {
        novels: {
          today_views: novelTodayRow?.views || 0,
          last30_views: novelLast30Row?.views || 0,
          total_views: novelTotalRow?.views || 0,
          daily: novelDaily || [],
        },
        comics: {
          today_views: comicTodayRow?.views || 0,
          last30_views: comicLast30Row?.views || 0,
          total_views: comicTotalRow?.views || 0,
          daily: comicDaily || [],
        },
      },
    });
  } catch (e) {
    console.error('Stats error:', e);
    return Response.json({ error: '获取统计失败' }, { status: 500 });
  }
}
