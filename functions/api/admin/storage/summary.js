// GET /api/admin/storage/summary — R2 存储概览（含可选配额/缓存）
import { checkAdmin, requireSuperAdmin } from '../../_utils.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

function parseLimitBytes(v) {
  if (!v || typeof v !== 'string') return null;
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM site_settings WHERE key = ?').bind(key).first();
  return row?.value ?? null;
}

async function setSetting(env, key, value) {
  await env.DB.prepare('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)').bind(key, value).run();
}

async function deleteSetting(env, key) {
  await env.DB.prepare('DELETE FROM site_settings WHERE key = ?').bind(key).run();
}

function classifyBytes(key, size, byCategory) {
  const k = key || '';
  if (k.startsWith('sources/')) byCategory.sources += size;
  else if (k.startsWith('novels/')) byCategory.novels += size;
  else if (k.startsWith('comics/')) byCategory.comics += size;
  else if (k.startsWith('covers/')) byCategory.covers += size;
  else if (k.startsWith('fonts/')) byCategory.fonts += size;
  else if (k.startsWith('derived/')) byCategory.derived += size;
  else byCategory.other += size;
}

async function computeSummary(env) {
  let usedBytes = 0;
  let objectsCount = 0;
  const byCategory = { sources: 0, novels: 0, comics: 0, covers: 0, fonts: 0, derived: 0, other: 0 };

  let cursor;
  do {
    const listed = await env.R2.list({ cursor, limit: 1000 });
    cursor = listed.truncated ? listed.cursor : undefined;
    for (const obj of (listed.objects || [])) {
      const size = Number(obj.size || 0);
      usedBytes += size;
      objectsCount += 1;
      classifyBytes(obj.key, size, byCategory);
    }
  } while (cursor);

  const computedAtMs = Date.now();
  return { computedAtMs, computedAt: new Date(computedAtMs).toISOString(), usedBytes, objectsCount, byCategory };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const limitBytes = parseLimitBytes(await getSetting(env, 'storage_limit_bytes'));

  // cache
  let cached = null;
  try {
    const cacheJson = await getSetting(env, 'storage_cache_json');
    if (cacheJson) {
      const parsed = JSON.parse(cacheJson);
      if (parsed && typeof parsed.computedAtMs === 'number') {
        const age = Date.now() - parsed.computedAtMs;
        if (age >= 0 && age < CACHE_TTL_MS) cached = parsed;
      }
    }
  } catch {}

  const summary = cached || await computeSummary(env);
  if (!cached) {
    await setSetting(env, 'storage_cache_json', JSON.stringify(summary)).catch(() => {});
  }

  const remainingBytes = limitBytes ? Math.max(0, limitBytes - summary.usedBytes) : null;

  return Response.json({
    summary: {
      computedAt: summary.computedAt,
      usedBytes: summary.usedBytes,
      objectsCount: summary.objectsCount,
      byCategory: summary.byCategory,
      limitBytes,
      remainingBytes,
    }
  });
}

// PUT /api/admin/storage/summary — 设置配额（仅 super_admin）
export async function onRequestPut(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可修改' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { body = null; }
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const limitBytes = body.limitBytes;
  if (limitBytes === null || limitBytes === undefined || limitBytes === 0 || limitBytes === '0') {
    await deleteSetting(env, 'storage_limit_bytes');
    await deleteSetting(env, 'storage_cache_json').catch(() => {});
    return Response.json({ success: true, limitBytes: null });
  }

  if (!Number.isFinite(limitBytes) || limitBytes <= 0) {
    return Response.json({ error: 'Invalid limitBytes' }, { status: 400 });
  }
  // 防误填：最大 10TB
  if (limitBytes > 10 * 1024 * 1024 * 1024 * 1024) {
    return Response.json({ error: 'limitBytes too large' }, { status: 400 });
  }

  await setSetting(env, 'storage_limit_bytes', String(Math.floor(limitBytes)));
  await deleteSetting(env, 'storage_cache_json').catch(() => {});
  return Response.json({ success: true, limitBytes: Math.floor(limitBytes) });
}

