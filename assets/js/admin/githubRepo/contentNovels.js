import { showMsg } from '../ui.js';
import { renderNovelList } from './render.js';
import { isBusy, setBusy } from './state.js';
import { refreshGitHubNovelBatchUi } from './novelBatchUi.js';
import { fillGitHubRepoSelect, getNovelsBaseByRepoId, parseRepoSelectValue } from './contentRepos.js';
import { loadCachedNovelsAll, loadCachedNovelsRepo, loadOrScanNovelsRepoDir, scanNovelsAll, scanNovelsRepo } from './contentNovelsOps.js';
import { bindOneGitHubNovel, syncOneGitHubNovel } from './contentNovelsActions.js';

let getCategoryIds = null;
let onNovelDone = null;

let state = { mode: 'all', repoId: null, dir: null };

export function initGitHubRepoNovelsContent({ getCategoryIds: getCategoryIdsCb, onNovelDone: onNovelDoneCb } = {}) {
  getCategoryIds = typeof getCategoryIdsCb === 'function' ? getCategoryIdsCb : null;
  onNovelDone = typeof onNovelDoneCb === 'function' ? onNovelDoneCb : null;

  document.getElementById('gh-repo-scan-novels-btn')?.addEventListener('click', () => scanCurrent());
  document.getElementById('gh-repo-novels-repo-select')?.addEventListener('change', () => onRepoChanged());
  document.getElementById('gh-repo-novels-up-btn')?.addEventListener('click', () => goUp());
  document.getElementById('gh-repo-novels-root-btn')?.addEventListener('click', () => goRoot());

  document.getElementById('gh-repo-novels-list')?.addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-path]');
    if (!li || isBusy()) return;

    const kind = String(li.dataset.kind || 'file');
    const path = String(li.dataset.path || '').trim();
    const name = String(li.dataset.name || '').trim();
    const size = Number(li.dataset.size || 0) || 0;
    const repoId = parseRepoId(li.dataset.repoId);

    if (kind === 'dir' && e.target.classList.contains('btn-gh-enter-dir')) {
      await openDir(path);
      return;
    }

    if (e.target.classList.contains('btn-gh-bind-novel')) {
      await bindOneGitHubNovel({ repoId, path, name, size, getCategoryIds, onNovelDone });
      return;
    }

    if (e.target.classList.contains('btn-gh-sync-novel')) {
      await syncOneGitHubNovel({ repoId, path, name, getCategoryIds, onNovelDone });
    }
  });
}

export async function syncGitHubRepoNovelsUi() {
  fillGitHubRepoSelect(document.getElementById('gh-repo-novels-repo-select'));
  await onRepoChanged();
}

async function onRepoChanged() {
  const sel = document.getElementById('gh-repo-novels-repo-select');
  const { mode, repoId } = parseRepoSelectValue(sel?.value);
  state = { mode, repoId, dir: null };
  updateNav();
  await loadCachedCurrent();
}

function renderPlaceholder(text) {
  const el = document.getElementById('gh-repo-novels-list');
  if (!el) return;
  el.innerHTML = `<li style="color:var(--text-light)">${text}</li>`;
}

async function loadCachedCurrent() {
  try {
    if (state.mode === 'all') {
      const { items, cachedAny } = await loadCachedNovelsAll();
      if (!cachedAny) {
        renderPlaceholder('请先扫描');
        refreshGitHubNovelBatchUi();
        showMsg('gh-repo-novels-msg', '请先扫描', '');
        return;
      }
      renderNovelList(items);
      refreshGitHubNovelBatchUi();
      showMsg('gh-repo-novels-msg', `已加载缓存：${items.length} 个文件`, '');
      return;
    }

    const data = await loadCachedNovelsRepo({ repoId: state.repoId, dir: state.dir ?? '' });
    if (!data.cached) {
      renderPlaceholder('请先扫描');
      refreshGitHubNovelBatchUi();
      showMsg('gh-repo-novels-msg', '请先扫描', '');
      return;
    }
    renderNovelList(data.items);
    refreshGitHubNovelBatchUi();
    showMsg('gh-repo-novels-msg', `已加载缓存：${data.items.length} 条`, '');
  } catch {
    renderPlaceholder('请先扫描');
    refreshGitHubNovelBatchUi();
  }
}

async function scanCurrent() {
  try {
    setBusy(true);
    if (state.mode === 'all') {
      const { items } = await scanNovelsAll({
        onStep: ({ idx, total }) => showMsg('gh-repo-novels-msg', `扫描中...（${idx + 1}/${total}）`, ''),
      });
      renderNovelList(items);
      refreshGitHubNovelBatchUi();
      showMsg('gh-repo-novels-msg', `扫描完成：${items.length} 个文件`, 'success');
      return;
    }

    showMsg('gh-repo-novels-msg', '扫描中...', '');
    const { items } = await scanNovelsRepo({ repoId: state.repoId, dir: state.dir ?? '' });
    renderNovelList(items);
    refreshGitHubNovelBatchUi();
    showMsg('gh-repo-novels-msg', `扫描完成：${items.length} 条`, 'success');
  } catch (e) {
    showMsg('gh-repo-novels-msg', e.message || '扫描失败', 'error');
  } finally {
    setBusy(false);
    refreshGitHubNovelBatchUi();
  }
}

async function openDir(dirPath) {
  if (state.mode !== 'repo') return;
  state.dir = String(dirPath || '').trim() || null;
  updateNav();

  try {
    setBusy(true);
    const { items } = await loadOrScanNovelsRepoDir({ repoId: state.repoId, dir: state.dir ?? '' });
    renderNovelList(items);
    refreshGitHubNovelBatchUi();
  } catch (e) {
    showMsg('gh-repo-novels-msg', e.message || '加载失败', 'error');
  } finally {
    setBusy(false);
    refreshGitHubNovelBatchUi();
  }
}

async function goRoot() {
  if (state.mode !== 'repo') return;
  await openDir(null);
}

async function goUp() {
  if (state.mode !== 'repo' || !state.dir) return;
  const base = getNovelsBaseByRepoId(state.repoId);
  await openDir(parentDir(state.dir, base));
}

function updateNav() {
  const nav = document.getElementById('gh-repo-novels-nav');
  if (!nav) return;
  if (state.mode !== 'repo') {
    nav.style.display = 'none';
    return;
  }
  nav.style.display = 'flex';

  const base = getNovelsBaseByRepoId(state.repoId);
  const cur = state.dir ? state.dir : String(base || '').replace(/\/+$/, '');

  const crumb = document.getElementById('gh-repo-novels-breadcrumb');
  if (crumb) crumb.textContent = `当前目录：${cur || '/'}`;

  const atBase = !state.dir;
  const upBtn = document.getElementById('gh-repo-novels-up-btn');
  const rootBtn = document.getElementById('gh-repo-novels-root-btn');
  if (upBtn) upBtn.disabled = atBase;
  if (rootBtn) rootBtn.disabled = atBase;
}

function parentDir(dir, base) {
  const cleanBase = String(base || '').replace(/\/+$/, '');
  const s = String(dir || '').replace(/\/+$/, '');
  if (!s) return null;
  const parts = s.split('/').filter(Boolean);
  if (parts.length <= 1) return null;
  parts.pop();
  const p = parts.join('/');
  if (!p || p === cleanBase) return null;
  if (cleanBase && !p.startsWith(cleanBase + '/')) return null;
  return p;
}

function parseRepoId(v) {
  const s = String(v || '').trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}
