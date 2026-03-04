import { filenameToTitle, showMsg } from '../ui.js';
import { bindGitHubComicDir, fetchGitHubRepoScanCache, listGitHubComicPages, scanGitHubRepo } from './api.js';
import { renderComicList } from './render.js';
import { isBusy, setBusy } from './state.js';
import { syncImportGitHubCbz } from './syncComicCbz.js';
import { decorateItems, fillGitHubRepoSelect, getGitHubRepoContext, parseRepoSelectValue, sortByRepoThenName } from './contentRepos.js';

let onComicDone = null;
let state = { mode: 'all', repoId: null };

export function initGitHubRepoComicsContent({ onComicDone: onComicDoneCb } = {}) {
  onComicDone = typeof onComicDoneCb === 'function' ? onComicDoneCb : null;

  document.getElementById('gh-repo-scan-comics-btn')?.addEventListener('click', () => scanCurrent());
  document.getElementById('gh-repo-comics-repo-select')?.addEventListener('change', () => onRepoChanged());

  document.getElementById('gh-repo-comics-list')?.addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-path]');
    if (!li || isBusy()) return;

    const kind = String(li.dataset.kind || '');
    const path = String(li.dataset.path || '').trim();
    const name = String(li.dataset.name || '').trim();
    const repoId = parseRepoId(li.dataset.repoId);

    if (kind === 'dir' && e.target.classList.contains('btn-gh-comic-pages')) {
      const hint = li.querySelector('.gh-pages-hint');
      if (hint) hint.textContent = '（扫描中...）';
      try {
        const data = await listGitHubComicPages(path, { repoId });
        const count = (data.pages || []).length;
        if (hint) hint.textContent = `（${count} 页）`;
      } catch (err) {
        if (hint) hint.textContent = `（失败：${err.message || 'error'}）`;
      }
      return;
    }

    if (kind === 'dir' && e.target.classList.contains('btn-gh-bind-comic-dir')) {
      const title = (prompt('漫画标题：', filenameToTitle(name)) || '').trim();
      if (!title) return;
      try {
        setBusy(true);
        showMsg('gh-repo-comics-msg', '绑定中...', '');
        const data = await bindGitHubComicDir({ repo_id: repoId || undefined, dir: path, title });
        showMsg('gh-repo-comics-msg', `已绑定：${data?.comic?.title || title}`, 'success');
        if (onComicDone) onComicDone();
      } catch (err) {
        showMsg('gh-repo-comics-msg', err.message || '绑定失败', 'error');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (kind === 'cbz' && e.target.classList.contains('btn-gh-sync-comic-cbz')) {
      const title = (prompt('漫画标题：', filenameToTitle(name)) || '').trim();
      if (!title) return;
      try {
        setBusy(true);
        const result = await syncImportGitHubCbz(
          { repoId, path, name, title, description: '' },
          {
            onStatus: (t) => showMsg('gh-repo-comics-msg', t, ''),
            onProgress: ({ done, total, pct }) => showMsg('gh-repo-comics-msg', `${done}/${total} 页（${pct}%）`, ''),
          }
        );
        showMsg('gh-repo-comics-msg', `同步完成：comicId=${result.comicId}（${result.pageCount} 页）`, 'success');
        if (onComicDone) onComicDone();
      } catch (err) {
        showMsg('gh-repo-comics-msg', err.message || '同步失败', 'error');
      } finally {
        setBusy(false);
      }
    }
  });
}

export async function syncGitHubRepoComicsUi() {
  fillGitHubRepoSelect(document.getElementById('gh-repo-comics-repo-select'));
  await onRepoChanged();
}

async function onRepoChanged() {
  const sel = document.getElementById('gh-repo-comics-repo-select');
  const { mode, repoId } = parseRepoSelectValue(sel?.value);
  state = { mode, repoId };
  await loadCachedCurrent();
}

function renderPlaceholder(text) {
  const el = document.getElementById('gh-repo-comics-list');
  if (!el) return;
  el.innerHTML = `<li style="color:var(--text-light)">${text}</li>`;
}

async function loadCachedCurrent() {
  const { enabledRepos } = getGitHubRepoContext();

  try {
    if (state.mode === 'all') {
      const repoIds = enabledRepos.length > 0 ? enabledRepos.map((r) => r.id) : [null];
      const cacheResults = await Promise.all(
        repoIds.map((rid) => fetchGitHubRepoScanCache('comics', { repoId: rid || null }).catch(() => null))
      );
      const merged = [];
      for (const data of cacheResults) {
        if (!data?.cached) continue;
        merged.push(...(data.items || []));
      }
      if (merged.length === 0) {
        renderPlaceholder('请先扫描');
        showMsg('gh-repo-comics-msg', '请先扫描', '');
        return;
      }
      const items = sortByRepoThenName(decorateItems(merged));
      renderComicList(items);
      showMsg('gh-repo-comics-msg', `已加载缓存：${items.length} 个条目`, '');
      return;
    }

    const data = await fetchGitHubRepoScanCache('comics', { repoId: state.repoId });
    if (!data?.cached) {
      renderPlaceholder('请先扫描');
      showMsg('gh-repo-comics-msg', '请先扫描', '');
      return;
    }
    const items = decorateItems(data.items || []);
    renderComicList(items);
    showMsg('gh-repo-comics-msg', `已加载缓存：${items.length} 个条目`, '');
  } catch {
    renderPlaceholder('请先扫描');
  }
}

async function scanCurrent() {
  const { enabledRepos } = getGitHubRepoContext();

  try {
    setBusy(true);
    if (state.mode === 'all') {
      const repoIds = enabledRepos.length > 0 ? enabledRepos.map((r) => r.id) : [null];
      const merged = [];
      for (let i = 0; i < repoIds.length; i++) {
        showMsg('gh-repo-comics-msg', `扫描中...（${i + 1}/${repoIds.length}）`, '');
        const rid = repoIds[i] || null;
        const data = await scanGitHubRepo('comics', { repoId: rid });
        merged.push(...(data.items || []));
      }
      const items = sortByRepoThenName(decorateItems(merged));
      renderComicList(items);
      showMsg('gh-repo-comics-msg', `扫描完成：${items.length} 个条目`, 'success');
      return;
    }

    showMsg('gh-repo-comics-msg', '扫描中...', '');
    const data = await scanGitHubRepo('comics', { repoId: state.repoId });
    const items = decorateItems(data.items || []);
    renderComicList(items);
    showMsg('gh-repo-comics-msg', `扫描完成：${items.length} 个条目`, 'success');
  } catch (e) {
    showMsg('gh-repo-comics-msg', e.message || '扫描失败', 'error');
  } finally {
    setBusy(false);
  }
}

function parseRepoId(v) {
  const s = String(v || '').trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

