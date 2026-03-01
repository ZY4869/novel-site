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
import { initSourceRead } from '../read/source.js';
import { initBookmarks } from '../read/bookmarks.js';
import { initReadingStats } from '../read/stats.js';
import { initImmersive } from '../read/immersive.js';
import { initNavUser } from '../read/user.js';
import { initAnnotations } from '../read/annotations/index.js';

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
initNavUser();
const q = new URLSearchParams(location.search);
if (q.get('id')) initChapter();
else if (q.get('book')) initSourceRead();
else initChapter();
initAnnotations();

registerServiceWorker('/sw.js');
