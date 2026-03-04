import { filenameToTitle, showMsg } from '../ui.js';
import { bindGitHubNovel } from './api.js';
import { refreshGitHubNovelBatchUi } from './novelBatchUi.js';
import { tryComputeAndSaveSourceMeta } from './novelMeta.js';
import { getNovelTargetFromUi } from './novelTargetUi.js';
import { syncImportGitHubNovel } from './syncNovel.js';
import { setBusy } from './state.js';

export async function bindOneGitHubNovel({ repoId, path, name, size, getCategoryIds, onNovelDone } = {}) {
  const defaultTitle = filenameToTitle(name);
  const title = (prompt('书名：', defaultTitle) || '').trim();
  if (!title) return;

  try {
    setBusy(true);
    showMsg('gh-repo-novels-msg', '绑定中...', '');
    const category_ids = typeof getCategoryIds === 'function' ? getCategoryIds() : [];
    const data = await bindGitHubNovel({ repo_id: repoId || undefined, path, title, name, size, category_ids });
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
    if (target?.type === 'new') target.category_ids = typeof getCategoryIds === 'function' ? getCategoryIds() : [];

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

