import { qs } from '../shared/dom.js';
import { registerServiceWorker } from '../shared/pwa.js';
import { initThemeToggle } from '../shared/theme.js';
import { loadBooks } from './index/books.js';
import { bindSearch } from './index/search.js';
import { loadSiteSettings } from './index/siteSettings.js';

initThemeToggle(qs('.theme-toggle'));
registerServiceWorker();
bindSearch();
loadBooks();
loadSiteSettings();
