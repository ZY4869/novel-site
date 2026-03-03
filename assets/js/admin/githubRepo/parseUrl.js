function validateOwnerRepo(owner, repo) {
  const ok = (s) => /^[a-zA-Z0-9._-]+$/.test(String(s || ''));
  if (!ok(owner)) throw new Error('owner 不合法');
  if (!ok(repo)) throw new Error('repo 不合法');
}

function parseOwnerRepoFromPath(path) {
  const p = String(path || '').split('#')[0].split('?')[0].replace(/\/+$/, '');
  const seg = p.split('/').map((x) => x.trim()).filter(Boolean);
  if (seg.length < 2) throw new Error('链接缺少 owner/repo');
  const owner = seg[0];
  const repo = String(seg[1]).replace(/\.git$/i, '');
  validateOwnerRepo(owner, repo);
  return { owner, repo, branch: '', subpath: '' };
}

export function parseGitHubRepoInput(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Empty input');

  // scp-like: git@github.com:owner/repo.git
  const scp = raw.match(/^[^@]+@github\.com:([^#?]+)$/i);
  if (scp) {
    const path = scp[1].replace(/^\/+/, '').replace(/\/+$/, '');
    return parseOwnerRepoFromPath(path);
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    try {
      url = new URL(`https://${raw}`);
    } catch {
      throw new Error('不是有效的 URL');
    }
  }

  const host = String(url.hostname || '').toLowerCase();
  if (host !== 'github.com') throw new Error('仅支持 github.com 仓库链接');

  const parts = String(url.pathname || '')
    .split('/')
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length < 2) throw new Error('链接缺少 owner/repo');

  const owner = parts[0];
  const repo = String(parts[1]).replace(/\.git$/i, '');

  let branch = '';
  let subpath = '';
  if (parts[2] === 'tree' && parts[3]) {
    branch = parts[3];
    subpath = parts.slice(4).join('/');
  }

  validateOwnerRepo(owner, repo);
  return { owner, repo, branch, subpath };
}

export function inferBasePathHints(subpath) {
  const p = String(subpath || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!p) return { novelsPath: '', comicsPath: '', note: '' };

  const parts = p.split('/').map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0) return { novelsPath: '', comicsPath: '', note: '' };

  const last = parts[parts.length - 1].toLowerCase();
  const base = parts.join('/') + '/';

  if (last === 'novels') return { novelsPath: base, comicsPath: '', note: `已提示小说目录：${base}` };
  if (last === 'comics') return { novelsPath: '', comicsPath: base, note: `已提示漫画目录：${base}` };
  return { novelsPath: '', comicsPath: '', note: '' };
}

