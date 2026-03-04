import { createCategoryPicker } from '../categories/picker.js';
import { refreshGitHubRepoContext } from './contentRepos.js';
import { initGitHubRepoComicsContent, syncGitHubRepoComicsUi } from './contentComics.js';
import { initGitHubRepoNovelsContent, syncGitHubRepoNovelsUi } from './contentNovels.js';
import { initGitHubNovelBatchUi } from './novelBatchUi.js';

export function initGitHubRepoContentUi({ onNovelDone, onComicDone } = {}) {
  const ghCategoryPicker = createCategoryPicker({ container: document.getElementById('gh-repo-category-picker') });
  const getCategoryIds = () => ghCategoryPicker?.getSelectedIds?.() || [];

  initGitHubNovelBatchUi({ onNovelDone, getCategoryIds });
  initGitHubRepoNovelsContent({ onNovelDone, getCategoryIds });
  initGitHubRepoComicsContent({ onComicDone });

  window.addEventListener('admin:role-changed', async (e) => {
    const role = String(e?.detail?.role || '');
    if (role !== 'super_admin') return;
    await refreshGitHubRepoContext();
    await syncGitHubRepoNovelsUi();
    await syncGitHubRepoComicsUi();
  });

  window.addEventListener('admin:github-repo-content-changed', async () => {
    try {
      await refreshGitHubRepoContext();
      await syncGitHubRepoNovelsUi();
      await syncGitHubRepoComicsUi();
    } catch {}
  });
}
