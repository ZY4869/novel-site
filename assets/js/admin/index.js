import { initThemeToggle } from '../shared/theme.js';

import { initAuth, checkSession } from './auth.js';
import { initGitHubAuth, initGitHubConfig, loadGitHubConfig } from './github.js';
import { initSiteSettings, loadSiteSettings } from './siteSettings.js';
import { initBooks, refreshAllBooks } from './books.js';
import { initChapters, loadChapters } from './chapters.js';
import { initBatch } from './batch.js';
import { initTxtImport } from './txtImport.js';
import { initComics, loadComicList } from './comics.js';
import { initStorage, loadStorageObjects, loadStorageSummary } from './storage.js';
import { initAdminUsers, loadAdminUsers } from './users.js';
import { initBackup } from './backup.js';
import { initFonts, loadFontList } from './fonts.js';
import { initTags, loadTagList } from './tags.js';
import { initBookEditModal } from './bookEditModal.js';
import { initEpubImport } from './epubImport.js';
import { loadStats } from './stats.js';

export function initAdminApp() {
  initThemeToggle(document.querySelector('.theme-toggle'));

  initBookEditModal();
  initTags();
  initBooks();
  initChapters();
  initBatch();
  initTxtImport();
  initEpubImport();
  initComics();
  initStorage();
  initBackup();
  initFonts();
  initGitHubConfig();
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
      loadStorageObjects(true);
      loadTagList();

      if (role === 'super_admin') {
        loadAdminUsers();
        loadGitHubConfig();
      }

      // if a book is already selected in manage-book, refresh chapter list
      loadChapters();
    },
  });

  initGitHubAuth({ onToken: () => checkSession() });

  checkSession();
}

