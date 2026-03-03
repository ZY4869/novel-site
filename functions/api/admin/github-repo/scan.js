// GET /api/admin/github-repo/scan?type=novels|comics — 扫描 GitHub 仓库目录内容（仅超管）
import { checkAdmin, requireSuperAdmin, sha256Hash } from '../../_utils.js';
import { getRepoConfig, githubApiJson, sanitizeRepoPath } from '../../utils/githubRepoContent.js';

function encodePathSegments(path) {
  return String(path || '')
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}

function ensureConfigReady(config) {
  if (!config?.enabled) throw new Error('GitHub 仓库内容未启用');
  if (!config.owner || !config.repo || !config.branch) throw new Error('GitHub 仓库配置不完整');
  if (!config.novelsPath || !config.comicsPath) throw new Error('GitHub 目录配置不完整');
}

function isNovelFile(name) {
  const n = String(name || '').toLowerCase();
  return n.endsWith('.txt') || n.endsWith('.text') || n.endsWith('.epub');
}

function isCbzFile(name) {
  const n = String(name || '').toLowerCase();
  return n.endsWith('.cbz') || n.endsWith('.zip');
}

async function saveScanCache(env, { type, configHash, base, items }) {
  try {
    const itemsJson = JSON.stringify(Array.isArray(items) ? items : []);
    await env.DB.prepare(
      `
        INSERT INTO github_repo_scan_cache (type, config_hash, base, items_json, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(type, config_hash) DO UPDATE SET
          base = excluded.base,
          items_json = excluded.items_json,
          updated_at = datetime('now')
      `
    )
      .bind(type, configHash, base, itemsJson)
      .run();
  } catch {}
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
    const apiPath = encodePathSegments(cleanBase);

    const urlPath = apiPath
      ? `/repos/${config.owner}/${config.repo}/contents/${apiPath}`
      : `/repos/${config.owner}/${config.repo}/contents`;
    const data = await githubApiJson(env, urlPath, { ref: config.branch });
    if (!Array.isArray(data)) return Response.json({ error: 'GitHub 返回不是目录列表' }, { status: 400 });

    if (type === 'novels') {
      const items = data
        .filter((x) => x && x.type === 'file' && isNovelFile(x.name))
        .map((x) => ({ name: x.name, path: x.path, size: x.size || 0, sha: x.sha || '' }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' }));
      context.waitUntil(saveScanCache(env, { type, configHash, base: cleanBase, items }));
      return Response.json({ success: true, type, base: cleanBase, items });
    }

    const items = data
      .filter((x) => x && (x.type === 'dir' || (x.type === 'file' && isCbzFile(x.name))))
      .map((x) => ({
        kind: x.type === 'dir' ? 'dir' : 'cbz',
        name: x.name,
        path: x.path,
        size: x.size || 0,
        sha: x.sha || '',
      }))
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
        return String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' });
      });
    context.waitUntil(saveScanCache(env, { type, configHash, base: cleanBase, items }));
    return Response.json({ success: true, type, base: cleanBase, items });
  } catch (e) {
    return Response.json({ error: e.message || 'Scan failed' }, { status: 400 });
  }
}
