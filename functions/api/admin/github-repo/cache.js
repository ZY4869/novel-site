// GET /api/admin/github-repo/cache?type=novels|comics&repo_id=&dir= — 读取 GitHub 扫描缓存（不触发扫描，仅超管）
import { checkAdmin, requireSuperAdmin, sha256Hash } from '../../_utils.js';
import { sanitizeRepoPath } from '../../utils/githubRepoContent.js';
import { getGitHubRepoGlobalEnabled, resolveGitHubRepoConfig } from '../../utils/githubRepos.js';

function ensureConfigReady(config) {
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
    const enabled = await getGitHubRepoGlobalEnabled(env);
    if (!enabled) throw new Error('GitHub 仓库内容未启用');

    const repoIdRaw = url.searchParams.get('repo_id');
    if (repoIdRaw !== null && !/^\d+$/.test(repoIdRaw)) {
      return Response.json({ error: 'Invalid repo_id' }, { status: 400 });
    }
    const repoId = repoIdRaw ? Number(repoIdRaw) : null;

    const config = await resolveGitHubRepoConfig(env, { repoId });
    if (!config) throw new Error('未找到可用的 GitHub 仓库配置');
    ensureConfigReady(config);

    const base = type === 'novels' ? config.novelsPath : config.comicsPath;
    const dirParam = type === 'novels' ? url.searchParams.get('dir') : null;
    if (type !== 'novels' && url.searchParams.has('dir')) {
      return Response.json({ error: 'dir only supported for novels' }, { status: 400 });
    }
    const baseOrDirInput = dirParam === null ? base : (dirParam || base);
    const cleanBase = sanitizeRepoPath(baseOrDirInput, [base]);

    const repoKey = config.id ? `id${config.id}` : 'legacy';
    const variant = type === 'novels' ? (dirParam === null ? 'flat' : 'dir') : 'base';
    const configHash = await sha256Hash(`${repoKey}:${config.owner}/${config.repo}@${config.branch}:${variant}:${cleanBase}`);

    const row = await env.DB.prepare(
      'SELECT base, items_json, updated_at FROM github_repo_scan_cache WHERE type = ? AND config_hash = ?'
    )
      .bind(type, configHash)
      .first();

    if (!row) {
      return Response.json({
        success: true,
        type,
        repo_id: config.id ?? null,
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
      repo_id: config.id ?? null,
      cached: true,
      updatedAt: row.updated_at || null,
      base: row.base || cleanBase,
      items,
    });
  } catch (e) {
    return Response.json({ error: e.message || 'Load cache failed' }, { status: 400 });
  }
}
