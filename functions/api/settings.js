// GET /api/settings — 公开读取站点设置（白名单过滤）
const PUBLIC_KEYS = ['site_name', 'site_desc', 'footer_text', 'custom_fonts'];

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare('SELECT key, value FROM site_settings').all();
  const settings = {};
  for (const row of results) {
    if (PUBLIC_KEYS.includes(row.key)) {
      settings[row.key] = row.value;
    }
  }
  return Response.json({ settings });
}
