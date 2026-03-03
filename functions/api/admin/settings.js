// PUT /api/admin/settings — 更新站点设置
// GET /api/admin/settings/github — 读取 GitHub OAuth 配置（仅超管）
// PUT /api/admin/settings/github — 保存 GitHub OAuth 配置（仅超管）
// GET /api/admin/settings?section=github_repo — 读取 GitHub 仓库配置（仅超管）
// POST /api/admin/settings?section=github_repo — 保存 GitHub 仓库配置（仅超管）
import { checkAdmin, requireSuperAdmin, parseJsonBody } from '../_utils.js';
import { getRepoConfig, getRepoToken, invalidateGitHubRepoCache } from '../utils/githubRepoContent.js';

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

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可查看' }, { status: 403 });

  const url = new URL(request.url);
  // GET /api/admin/settings?section=github
  if (url.searchParams.get('section') === 'github') {
    const enabled = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'github_oauth_enabled'").first();
    const clientId = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'github_client_id'").first();
    const hasSecret = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'github_client_secret'").first();
    const demoLimitRow = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'demo_user_limit'").first();
    return Response.json({
      enabled: enabled?.value === 'true',
      clientId: clientId?.value || '',
      hasSecret: !!hasSecret?.value,
      demoLimit: demoLimitRow ? Number(demoLimitRow.value) : 100,
    });
  }

  // GET /api/admin/settings?section=github_repo
  if (url.searchParams.get('section') === 'github_repo') {
    const config = await getRepoConfig(env);
    const token = await getRepoToken(env);
    const hasEnvToken = !!String(env.GITHUB_REPO_TOKEN || '').trim();

    return Response.json({
      enabled: !!config.enabled,
      owner: config.owner || '',
      repo: config.repo || '',
      branch: config.branch || 'main',
      novelsPath: config.novelsPath || 'novels/',
      comicsPath: config.comicsPath || 'comics/',
      hasToken: !!token,
      tokenFromEnv: hasEnvToken,
    });
  }

  return Response.json({ error: 'Unknown section' }, { status: 400 });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可修改' }, { status: 403 });

  const body = await parseJsonBody(request);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const url = new URL(request.url);
  // POST /api/admin/settings?section=github
  if (url.searchParams.get('section') === 'github') {
    const { enabled, clientId, clientSecret, demoLimit } = body;

    // 保存启用状态
    await env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('github_oauth_enabled', ?)")
      .bind(enabled ? 'true' : 'false').run();

    // 保存 Client ID
    if (clientId !== undefined) {
      const id = (clientId || '').trim().slice(0, 100);
      await env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('github_client_id', ?)")
        .bind(id).run();
    }

    // 保存 Client Secret（只在提供了新值时更新）
    if (clientSecret && clientSecret.trim()) {
      await env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('github_client_secret', ?)")
        .bind(clientSecret.trim().slice(0, 200)).run();
    }

    // 保存 Demo 用户上限
    if (demoLimit !== undefined) {
      const limit = Math.max(0, Math.min(10000, Math.floor(Number(demoLimit) || 0)));
      await env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('demo_user_limit', ?)")
        .bind(String(limit)).run();
    }

    return Response.json({ success: true });
  }

  // POST /api/admin/settings?section=github_repo
  if (url.searchParams.get('section') === 'github_repo') {
    const normalizeDir = (v, fallback) => {
      const raw = String(v ?? '').trim();
      const base = raw || fallback || '';
      const s = String(base).trim();
      if (!s) return '';
      if (s.includes('\\') || s.includes('\0')) return '';
      if (/^\/+$/.test(s) || s === '.' || s === './') return '/';

      const parts = s
        .replace(/^\/+/, '')
        .split('/')
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length === 0) return '';
      return parts.join('/') + '/';
    };

    const enabled = !!body.enabled;
    const owner = String(body.owner || '').trim().slice(0, 100);
    const repo = String(body.repo || '').trim().slice(0, 100);
    const branch = String(body.branch || '').trim().slice(0, 100) || 'main';
    const novelsPath = normalizeDir(body.novelsPath, 'novels/');
    const comicsPath = normalizeDir(body.comicsPath, 'comics/');

    if (enabled) {
      if (!owner) return Response.json({ error: '请填写 owner' }, { status: 400 });
      if (!repo) return Response.json({ error: '请填写 repo' }, { status: 400 });
      if (!branch) return Response.json({ error: '请填写 branch' }, { status: 400 });
      if (!novelsPath) return Response.json({ error: '小说目录不合法（示例：novels/ 或 /）' }, { status: 400 });
      if (!comicsPath) return Response.json({ error: '漫画目录不合法（示例：comics/ 或 /）' }, { status: 400 });
    }

    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('github_repo_enabled', ?)").bind(enabled ? 'true' : 'false'),
      env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('github_repo_owner', ?)").bind(owner),
      env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('github_repo_name', ?)").bind(repo),
      env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('github_repo_branch', ?)").bind(branch),
      env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('github_repo_novels_path', ?)").bind(novelsPath || 'novels/'),
      env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('github_repo_comics_path', ?)").bind(comicsPath || 'comics/'),
    ]);

    // token：留空不改；clearToken=true 则清除；否则写入（可选，用于私有仓库）
    if (body.clearToken === true) {
      await env.DB.prepare("DELETE FROM site_settings WHERE key = 'github_repo_token'").run();
    } else if (typeof body.token === 'string' && body.token.trim()) {
      await env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('github_repo_token', ?)")
        .bind(body.token.trim().slice(0, 300)).run();
    }

    invalidateGitHubRepoCache();

    return Response.json({ success: true });
  }

  return Response.json({ error: 'Unknown section' }, { status: 400 });
}
