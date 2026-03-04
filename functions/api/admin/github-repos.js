// CRUD /api/admin/github-repos — GitHub 多仓库配置（仅超管）
import { checkAdmin, parseJsonBody, requireSuperAdmin, validateId } from '../_utils.js';
import { invalidateGitHubReposCache, normalizeGitHubRepoDir } from '../utils/githubRepos.js';

function validateOwnerRepoPart(s) {
  return /^[a-zA-Z0-9._-]+$/.test(String(s || ''));
}

function toBoolInt(v) {
  if (v === true) return 1;
  if (v === false) return 0;
  if (v === 1 || v === '1') return 1;
  if (v === 0 || v === '0') return 0;
  if (typeof v === 'string' && v.toLowerCase() === 'true') return 1;
  if (typeof v === 'string' && v.toLowerCase() === 'false') return 0;
  return 0;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可使用' }, { status: 403 });

  const { results } = await env.DB.prepare(
    `
      SELECT id, name, owner, repo, branch, novels_path, comics_path, enabled
      FROM github_repos
      ORDER BY id ASC
    `
  ).all();

  const repos = (results || []).map((r) => ({
    id: Number(r.id),
    name: String(r.name || '').trim(),
    owner: String(r.owner || '').trim(),
    repo: String(r.repo || '').trim(),
    branch: String(r.branch || '').trim() || 'main',
    novelsPath: normalizeGitHubRepoDir(r.novels_path, 'novels/') || 'novels/',
    comicsPath: normalizeGitHubRepoDir(r.comics_path, 'comics/') || 'comics/',
    enabled: r.enabled ? 1 : 0,
  }));

  return Response.json({ repos });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可使用' }, { status: 403 });

  const body = await parseJsonBody(request);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const name = String(body.name || '').trim().slice(0, 100);
  const owner = String(body.owner || '').trim().slice(0, 100);
  const repo = String(body.repo || '').trim().slice(0, 100);
  const branch = String(body.branch || '').trim().slice(0, 100) || 'main';
  const novelsPath = normalizeGitHubRepoDir(body.novelsPath, 'novels/');
  const comicsPath = normalizeGitHubRepoDir(body.comicsPath, 'comics/');
  const enabled = toBoolInt(body.enabled ?? 1);

  if (!name) return Response.json({ error: '请填写 name' }, { status: 400 });
  if (!owner || !validateOwnerRepoPart(owner)) return Response.json({ error: 'owner 不合法' }, { status: 400 });
  if (!repo || !validateOwnerRepoPart(repo)) return Response.json({ error: 'repo 不合法' }, { status: 400 });
  if (!branch) return Response.json({ error: 'branch 不合法' }, { status: 400 });
  if (!novelsPath) return Response.json({ error: '小说目录不合法（示例：novels/ 或 /）' }, { status: 400 });
  if (!comicsPath) return Response.json({ error: '漫画目录不合法（示例：comics/ 或 /）' }, { status: 400 });

  const r = await env.DB.prepare(
    `
      INSERT INTO github_repos (name, owner, repo, branch, novels_path, comics_path, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `
  )
    .bind(name, owner, repo, branch, novelsPath, comicsPath, enabled)
    .run();

  invalidateGitHubReposCache();

  return Response.json(
    {
      success: true,
      repo: { id: r.meta.last_row_id, name, owner, repo, branch, novelsPath, comicsPath, enabled },
    },
    { status: 201 }
  );
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可使用' }, { status: 403 });

  const body = await parseJsonBody(request);
  if (!body || body.id === undefined) return Response.json({ error: 'id required' }, { status: 400 });
  if (!validateId(String(body.id))) return Response.json({ error: 'Invalid id' }, { status: 400 });

  const existing = await env.DB.prepare('SELECT id FROM github_repos WHERE id = ?').bind(body.id).first();
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

  const sets = [];
  const vals = [];

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = String(body.name || '').trim().slice(0, 100);
    if (!name) return Response.json({ error: 'name 不合法' }, { status: 400 });
    sets.push('name = ?');
    vals.push(name);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'owner')) {
    const owner = String(body.owner || '').trim().slice(0, 100);
    if (!owner || !validateOwnerRepoPart(owner)) return Response.json({ error: 'owner 不合法' }, { status: 400 });
    sets.push('owner = ?');
    vals.push(owner);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'repo')) {
    const repo = String(body.repo || '').trim().slice(0, 100);
    if (!repo || !validateOwnerRepoPart(repo)) return Response.json({ error: 'repo 不合法' }, { status: 400 });
    sets.push('repo = ?');
    vals.push(repo);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'branch')) {
    const branch = String(body.branch || '').trim().slice(0, 100) || 'main';
    if (!branch) return Response.json({ error: 'branch 不合法' }, { status: 400 });
    sets.push('branch = ?');
    vals.push(branch);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'novelsPath')) {
    const novelsPath = normalizeGitHubRepoDir(body.novelsPath, 'novels/');
    if (!novelsPath) return Response.json({ error: '小说目录不合法（示例：novels/ 或 /）' }, { status: 400 });
    sets.push('novels_path = ?');
    vals.push(novelsPath);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'comicsPath')) {
    const comicsPath = normalizeGitHubRepoDir(body.comicsPath, 'comics/');
    if (!comicsPath) return Response.json({ error: '漫画目录不合法（示例：comics/ 或 /）' }, { status: 400 });
    sets.push('comics_path = ?');
    vals.push(comicsPath);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'enabled')) {
    sets.push('enabled = ?');
    vals.push(toBoolInt(body.enabled));
  }

  if (sets.length === 0) return Response.json({ error: 'Nothing to update' }, { status: 400 });

  sets.push("updated_at = datetime('now')");
  vals.push(body.id);

  await env.DB.prepare(`UPDATE github_repos SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  invalidateGitHubReposCache();

  return Response.json({ success: true });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可使用' }, { status: 403 });

  const body = await parseJsonBody(request);
  if (!body || body.id === undefined) return Response.json({ error: 'id required' }, { status: 400 });
  if (!validateId(String(body.id))) return Response.json({ error: 'Invalid id' }, { status: 400 });

  await env.DB.prepare('DELETE FROM github_repos WHERE id = ?').bind(body.id).run();

  invalidateGitHubReposCache();

  return Response.json({ success: true });
}

