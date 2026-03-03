// GET /api/admin/github-repo/cache?type=novels|comics — 读取 GitHub 扫描缓存（不触发扫描，仅超管）
import { checkAdmin, requireSuperAdmin, sha256Hash } from '../../_utils.js';
import { getRepoConfig, sanitizeRepoPath } from '../../utils/githubRepoContent.js';

function ensureConfigReady(config) {
  if (!config?.enabled) throw new Error('GitHub 仓库内容未启用');
  if (!config.owner || !config.repo || !config.branch) throw new Error('GitHub 仓库配置不完整');
  if (!config.novelsPath || !config.comicsPath) throw new Error('GitHub 目录配置不完整');
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可使用' }, { status: 403 });

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  if (type !== 'novels' && type !== 'comics') {
    return Response.json({ error: 'Invalid type' }, { status: 400 });
  }

  try {
    const config = await getRepoConfig(env);
    ensureConfigReady(config);

    const base = type === 'novels' ? config.novelsPath : config.comicsPath;
    const cleanBase = sanitizeRepoPath(base, [base]);
    const configHash = await sha256Hash(`${config.owner}/${config.repo}@${config.branch}:${cleanBase}`);

    const row = await env.DB.prepare(
      'SELECT base, items_json, updated_at FROM github_repo_scan_cache WHERE type = ? AND config_hash = ?'
    )
      .bind(type, configHash)
      .first();

    if (!row) {
      return Response.json({
        success: true,
        type,
        cached: false,
        updatedAt: null,
        base: cleanBase,
        items: [],
      });
    }

    let items = [];
    try {
      const parsed = JSON.parse(row.items_json || '[]');
      if (Array.isArray(parsed)) items = parsed;
    } catch {}

    return Response.json({
      success: true,
      type,
      cached: true,
      updatedAt: row.updated_at || null,
      base: row.base || cleanBase,
      items,
    });
  } catch (e) {
    return Response.json({ error: e.message || 'Load cache failed' }, { status: 400 });
  }
}

