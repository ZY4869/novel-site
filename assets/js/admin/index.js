import { initThemeToggle } from '../shared/theme.js';

import { initAuth, checkSession } from './auth.js';
import { initAdminTabs } from './tabs.js';
import { initGitHubAuth, initGitHubConfig, loadGitHubConfig } from './github.js';
import { initGitHubRepo, loadGitHubRepoConfig } from './githubRepo/index.js';
import { initSiteSettings, loadSiteSettings } from './siteSettings.js';
import { initBooks, refreshAllBooks } from './books.js';
import { initChapters, loadChapters } from './chapters.js';
import { initBatch } from './batch.js';
import { initNovelUpload } from './novelUpload/index.js';
import { initComics, loadComicList } from './comics.js';
import { initStorage, loadStorageSummary } from './storage.js';
import { initAdminUsers, loadAdminUsers } from './users.js';
import { initBackup } from './backup.js';
import { initFonts, loadFontList } from './fonts.js';
import { initTags, loadTagList } from './tags.js';
import { initBookEditModal } from './bookEditModal.js';
import { loadStats } from './stats.js';
import { initCategories, loadCategoriesOrShowError } from './categories/index.js';

export function initAdminApp() {
  initThemeToggle(document.querySelector('.theme-toggle'));

  initAdminTabs();

  initBookEditModal();
  initTags();
  initCategories();
  initBooks();
  initChapters();
  initBatch();
  initNovelUpload({ onDone: () => { refreshAllBooks(); loadChapters(); } });
  initComics();
  initStorage();
  initBackup();
  initFonts();
  initGitHubConfig();
  initGitHubRepo({
    onNovelDone: () => {
      refreshAllBooks();
      loadChapters();
    },
    onComicDone: () => loadComicList(),
  });
  initAdminUsers();
  initSiteSettings();

  initAuth({
    onAuthed: async ({ role }) => {
      refreshAllBooks();
      loadSiteSettings();
      loadStats();
      loadFontList();
      loadComicList();
      loadStorageSummary();
      loadTagList();
      loadCategoriesOrShowError();

      if (role === 'super_admin') {
        loadAdminUsers();
        loadGitHubConfig();
        loadGitHubRepoConfig();
      }

      // if a book is already selected in manage-book, refresh chapter list
      loadChapters();
    },
  });

  initGitHubAuth({ onToken: () => checkSession() });

  checkSession();
}
