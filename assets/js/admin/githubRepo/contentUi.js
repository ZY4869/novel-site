import { filenameToTitle, showMsg } from '../ui.js';
import { bindGitHubComicDir, bindGitHubNovel, fetchGitHubRepoScanCache, listGitHubComicPages, scanGitHubRepo } from './api.js';
import { renderComicList, renderNovelList } from './render.js';
import { isBusy, setBusy } from './state.js';
import { syncImportGitHubCbz } from './syncComicCbz.js';
import { syncImportGitHubNovel } from './syncNovel.js';
import { initGitHubNovelBatchUi, refreshGitHubNovelBatchUi } from './novelBatchUi.js';
import { tryComputeAndSaveSourceMeta } from './novelMeta.js';
import { createCategoryPicker } from '../categories/picker.js';

function getNovelTargetFromUi(defaultTitle) {
  const targetType = document.querySelector('input[name="novel-import-target"]:checked')?.value || 'existing';
  if (targetType === 'new') {
    const titleEl = document.getElementById('novel-book-title');
    if (titleEl && defaultTitle) {
      const cur = String(titleEl.value || '').trim();
      if (!cur || titleEl.dataset.autofill) {
        titleEl.value = defaultTitle;
        titleEl.dataset.autofill = 'filename';
      }
    }
    return {
      type: 'new',
      title: titleEl?.value?.trim() || '',
      titleSource: titleEl?.dataset?.autofill || '',
      author: document.getElementById('novel-book-author')?.value?.trim() || '',
      description: document.getElementById('novel-book-desc')?.value?.trim() || '',
    };
  }
  return { type: 'existing', bookId: document.getElementById('import-book')?.value || '' };
}

export function initGitHubRepoContentUi({ onNovelDone, onComicDone } = {}) {
  document.getElementById('gh-repo-scan-novels-btn')?.addEventListener('click', () => scanNovels());
  document.getElementById('gh-repo-scan-comics-btn')?.addEventListener('click', () => scanComics());

  const ghCategoryPicker = createCategoryPicker({ container: document.getElementById('gh-repo-category-picker') });
  const getCategoryIds = () => ghCategoryPicker?.getSelectedIds?.() || [];

  initGitHubNovelBatchUi({ onNovelDone, getCategoryIds });

  window.addEventListener('admin:role-changed', (e) => {
    const role = String(e?.detail?.role || '');
    if (role !== 'super_admin') return;
    loadCachedNovels();
    loadCachedComics();
  });

  document.getElementById('gh-repo-novels-list')?.addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-path]');
    if (!li || isBusy()) return;
    const path = li.dataset.path;
    const name = li.dataset.name;
    const size = Number(li.dataset.size || 0) || 0;

    if (e.target.classList.contains('btn-gh-bind-novel')) {
      const defaultTitle = filenameToTitle(name);
      const title = (prompt('书名：', defaultTitle) || '').trim();
      if (!title) return;
      try {
        setBusy(true);
        showMsg('gh-repo-novels-msg', '绑定中...', '');
        const data = await bindGitHubNovel({ path, title, name, size, category_ids: getCategoryIds() });
        const bookId = data?.book?.id;
        if (bookId) {
          showMsg('gh-repo-novels-msg', '已绑定，正在统计章数/字数...', '');
          await tryComputeAndSaveSourceMeta({
            bookId,
            path,
            name,
            sizeBytes: size,
            onTip: (t) => showMsg('gh-repo-novels-msg', t, ''),
          });
        }
        showMsg('gh-repo-novels-msg', `已绑定：${title}`, 'success');
        if (typeof onNovelDone === 'function') onNovelDone();
      } catch (err) {
        showMsg('gh-repo-novels-msg', err.message || '绑定失败', 'error');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (e.target.classList.contains('btn-gh-sync-novel')) {
      try {
        setBusy(true);
        const defaultTitle = filenameToTitle(name);
        const target = getNovelTargetFromUi(defaultTitle);
        if (target?.type === 'new') target.category_ids = getCategoryIds();
        const result = await syncImportGitHubNovel(
          { path, name, target },
          {
            onStatus: (t) => showMsg('gh-repo-novels-msg', t, ''),
            onProgress: ({ done, total, pct }) => showMsg('gh-repo-novels-msg', `${done}/${total} 章（${pct}%）`, ''),
          }
        );
        showMsg('gh-repo-novels-msg', `同步完成：bookId=${result.bookId}`, 'success');
        if (typeof onNovelDone === 'function') onNovelDone();
      } catch (err) {
        showMsg('gh-repo-novels-msg', err.message || '同步失败', 'error');
      } finally {
        setBusy(false);
      }
    }
  });

  document.getElementById('gh-repo-comics-list')?.addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-path]');
    if (!li || isBusy()) return;
    const kind = li.dataset.kind;
    const path = li.dataset.path;
    const name = li.dataset.name;

    if (kind === 'dir' && e.target.classList.contains('btn-gh-comic-pages')) {
      const hint = li.querySelector('.gh-pages-hint');
      if (hint) hint.textContent = '（扫描中...）';
      try {
        const data = await listGitHubComicPages(path);
        const count = (data.pages || []).length;
        if (hint) hint.textContent = `（${count} 页）`;
      } catch (err) {
        if (hint) hint.textContent = `（失败：${err.message || 'error'}）`;
      }
      return;
    }

    if (kind === 'dir' && e.target.classList.contains('btn-gh-bind-comic-dir')) {
      const defaultTitle = filenameToTitle(name);
      const title = (prompt('漫画标题：', defaultTitle) || '').trim();
      if (!title) return;
      try {
        setBusy(true);
        showMsg('gh-repo-comics-msg', '绑定中...', '');
        const data = await bindGitHubComicDir({ dir: path, title });
        showMsg('gh-repo-comics-msg', `已绑定：${data?.comic?.title || title}`, 'success');
        if (typeof onComicDone === 'function') onComicDone();
      } catch (err) {
        showMsg('gh-repo-comics-msg', err.message || '绑定失败', 'error');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (kind === 'cbz' && e.target.classList.contains('btn-gh-sync-comic-cbz')) {
      const defaultTitle = filenameToTitle(name);
      const title = (prompt('漫画标题：', defaultTitle) || '').trim();
      if (!title) return;
      try {
        setBusy(true);
        const result = await syncImportGitHubCbz(
          { path, name, title, description: '' },
          {
            onStatus: (t) => showMsg('gh-repo-comics-msg', t, ''),
            onProgress: ({ done, total, pct }) => showMsg('gh-repo-comics-msg', `${done}/${total} 页（${pct}%）`, ''),
          }
        );
        showMsg('gh-repo-comics-msg', `同步完成：comicId=${result.comicId}（${result.pageCount} 页）`, 'success');
        if (typeof onComicDone === 'function') onComicDone();
      } catch (err) {
        showMsg('gh-repo-comics-msg', err.message || '同步失败', 'error');
      } finally {
        setBusy(false);
      }
    }
  });
}

async function loadCachedNovels() {
  const el = document.getElementById('gh-repo-novels-list');
  if (!el) return;

  try {
    const data = await fetchGitHubRepoScanCache('novels');
    if (!data?.cached) return;
    renderNovelList(data.items || []);
    refreshGitHubNovelBatchUi();
    const ts = data.updatedAt ? `（上次扫描：${String(data.updatedAt)}）` : '';
    showMsg('gh-repo-novels-msg', `已加载缓存：${(data.items || []).length} 个文件${ts}`, '');
  } catch {}
}

async function loadCachedComics() {
  const el = document.getElementById('gh-repo-comics-list');
  if (!el) return;

  try {
    const data = await fetchGitHubRepoScanCache('comics');
    if (!data?.cached) return;
    renderComicList(data.items || []);
    const ts = data.updatedAt ? `（上次扫描：${String(data.updatedAt)}）` : '';
    showMsg('gh-repo-comics-msg', `已加载缓存：${(data.items || []).length} 个条目${ts}`, '');
  } catch {}
}

async function scanNovels() {
  try {
    setBusy(true);
    showMsg('gh-repo-novels-msg', '扫描中...', '');
    const data = await scanGitHubRepo('novels');
    renderNovelList(data.items || []);
    refreshGitHubNovelBatchUi();
    showMsg('gh-repo-novels-msg', `扫描完成：${(data.items || []).length} 个文件`, 'success');
  } catch (e) {
    showMsg('gh-repo-novels-msg', e.message || '扫描失败', 'error');
  } finally {
    setBusy(false);
    refreshGitHubNovelBatchUi();
  }
}

async function scanComics() {
  try {
    setBusy(true);
    showMsg('gh-repo-comics-msg', '扫描中...', '');
    const data = await scanGitHubRepo('comics');
    renderComicList(data.items || []);
    showMsg('gh-repo-comics-msg', `扫描完成：${(data.items || []).length} 个条目`, 'success');
  } catch (e) {
    showMsg('gh-repo-comics-msg', e.message || '扫描失败', 'error');
  } finally {
    setBusy(false);
  }
}
