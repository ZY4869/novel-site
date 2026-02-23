// GET /api/settings — 公开读取站点设置
export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare('SELECT key, value FROM site_settings').all();
  const settings = {};
  for (const row of results) {
    settings[row.key] = row.value;
  }
  return Response.json({ settings });
}
