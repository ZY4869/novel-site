import { fetchGitHubRepoScanCache, scanGitHubRepo } from './api.js';
import { decorateItems, getGitHubRepoContext, sortByRepoThenName } from './contentRepos.js';

export async function loadCachedNovelsAll() {
  const { enabledRepos } = getGitHubRepoContext();
  const repoIds = enabledRepos.length > 0 ? enabledRepos.map((r) => r.id) : [null];

  const cacheResults = await Promise.all(
    repoIds.map((rid) => fetchGitHubRepoScanCache('novels', { repoId: rid || null }).catch(() => null))
  );

  const merged = [];
  for (const data of cacheResults) {
    if (!data?.cached) continue;
    merged.push(...(data.items || []));
  }

  const items = sortByRepoThenName(decorateItems(merged));
  return { items, cachedAny: merged.length > 0 };
}

export async function loadCachedNovelsRepo({ repoId = null, dir = '' } = {}) {
  const data = await fetchGitHubRepoScanCache('novels', { repoId, dir });
  const items = decorateItems(data.items || []);
  return { items, cached: !!data?.cached, updatedAt: data?.updatedAt || null };
}

export async function scanNovelsAll({ onStep } = {}) {
  const { enabledRepos } = getGitHubRepoContext();
  const repoIds = enabledRepos.length > 0 ? enabledRepos.map((r) => r.id) : [null];

  const merged = [];
  for (let i = 0; i < repoIds.length; i++) {
    if (typeof onStep === 'function') onStep({ idx: i, total: repoIds.length });
    const rid = repoIds[i] || null;
    const data = await scanGitHubRepo('novels', { repoId: rid });
    merged.push(...(data.items || []));
  }

  const items = sortByRepoThenName(decorateItems(merged));
  return { items };
}

export async function scanNovelsRepo({ repoId = null, dir = '' } = {}) {
  const data = await scanGitHubRepo('novels', { repoId, dir });
  const items = decorateItems(data.items || []);
  return { items };
}

export async function loadOrScanNovelsRepoDir({ repoId = null, dir = '' } = {}) {
  try {
    const cached = await loadCachedNovelsRepo({ repoId, dir });
    if (cached.cached) return { ...cached, from: 'cache' };
  } catch {}

  const scanned = await scanNovelsRepo({ repoId, dir });
  return { ...scanned, from: 'scan' };
}

