import { filenameToTitle, showMsg } from '../ui.js';
import { bindGitHubNovel, resolveGitHubRepoCategories } from './api.js';
import { loadCategories } from '../categories/state.js';
import { refreshGitHubNovelBatchUi } from './novelBatchUi.js';
import { tryComputeAndSaveSourceMeta } from './novelMeta.js';
import { getNovelTargetFromUi } from './novelTargetUi.js';
import { syncImportGitHubNovel } from './syncNovel.js';
import { setBusy } from './state.js';

function isAutoCategoryEnabled() {
  const el = document.getElementById('gh-repo-auto-category');
  return el ? !!el.checked : true;
}

export async function bindOneGitHubNovel({ repoId, path, name, size, getCategoryIds, onNovelDone } = {}) {
  const defaultTitle = filenameToTitle(name);
  const title = (prompt('书名：', defaultTitle) || '').trim();
  if (!title) return;

  try {
    setBusy(true);
    showMsg('gh-repo-novels-msg', '绑定中...', '');
    const category_ids = typeof getCategoryIds === 'function' ? getCategoryIds() : [];
    const auto_category = isAutoCategoryEnabled();
    const data = await bindGitHubNovel({ repo_id: repoId || undefined, path, title, name, size, category_ids, auto_category });
    if (auto_category) await loadCategories().catch(() => {});
    const bookId = data?.book?.id;
    if (bookId) {
      showMsg('gh-repo-novels-msg', '已绑定，正在统计章数/字数...', '');
      await tryComputeAndSaveSourceMeta({
        bookId,
        repoId,
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
    refreshGitHubNovelBatchUi();
  }
}

export async function syncOneGitHubNovel({ repoId, path, name, getCategoryIds, onNovelDone } = {}) {
  try {
    setBusy(true);

    const target = getNovelTargetFromUi(filenameToTitle(name));
    const auto_category = isAutoCategoryEnabled();

    if (target?.type === 'new') {
      const manualIds = typeof getCategoryIds === 'function' ? getCategoryIds() : [];
      target.category_ids = manualIds;

      if (auto_category) {
        try {
          const resolved = await resolveGitHubRepoCategories([{ repo_id: repoId || null, path }], { autoCategory: true });
          await loadCategories().catch(() => {});
          const autoIds = resolved?.results?.[0]?.category_ids || [];
          target.category_ids = Array.from(new Set([...(manualIds || []), ...(autoIds || [])])).slice(0, 20);
        } catch {}
      }
    }

    const result = await syncImportGitHubNovel(
      { repoId, path, name, target },
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
    refreshGitHubNovelBatchUi();
  }
}
