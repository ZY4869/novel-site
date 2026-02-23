// PUT /api/admin/settings — 更新站点设置
import { checkAdmin, requireSuperAdmin, parseJsonBody } from '../_utils.js';

const ALLOWED_KEYS = ['site_name', 'site_desc', 'footer_text'];
const MAX_VALUE_LENGTH = 500;

export async function onRequestPut(context) {
  const { request, env } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) {
    const status = auth.reason === 'locked' ? 429 : 401;
    const msg = auth.reason === 'locked' ? 'Too many failed attempts, try again later' : 'Unauthorized';
    return Response.json({ error: msg }, { status });
  }
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可修改设置' }, { status: 403 });

  const body = await parseJsonBody(request);
  if (!body || typeof body.settings !== 'object') {
    return Response.json({ error: 'Invalid request, expected { settings: { key: value } }' }, { status: 400 });
  }

  const updates = [];
  for (const [key, value] of Object.entries(body.settings)) {
    if (!ALLOWED_KEYS.includes(key)) continue;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim().slice(0, MAX_VALUE_LENGTH);
    updates.push(
      env.DB.prepare('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)')
        .bind(key, trimmed)
    );
  }

  if (updates.length > 0) {
    await env.DB.batch(updates);
  }

  return Response.json({ success: true, updated: updates.length });
}
