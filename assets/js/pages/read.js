import { registerServiceWorker } from '../shared/pwa.js';
import { initReadDom, initReadState } from '../read/state.js';
import { initPager } from '../read/pager.js';
import { applyAllSettings, initSettingsPanel } from '../read/settings.js';
import { initBottomBar } from '../read/bottomBar.js';
import { initProgress } from '../read/progress.js';
import { initShortcuts } from '../read/shortcuts.js';
import { initSiteSettings } from '../read/siteSettings.js';
import { initFonts } from '../read/fonts.js';
import { initChapter } from '../read/chapter.js';
import { initBookmarks } from '../read/bookmarks.js';
import { initReadingStats } from '../read/stats.js';
import { initImmersive } from '../read/immersive.js';

initReadDom();
initReadState();

initPager();
applyAllSettings();

initSettingsPanel();
initBottomBar();
initProgress();
initBookmarks();
initReadingStats();
initImmersive();
initShortcuts();
initSiteSettings();
initFonts();
initChapter();

registerServiceWorker('/sw.js');

