import { getSavedTheme } from '../shared/theme.js';

export const FONTS = [
  "'Georgia','Noto Serif SC','Source Han Serif CN',serif",
  "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif",
  "'KaiTi','STKaiti','AR PL UKai CN',serif",
  "'FangSong','STFangsong',serif",
];

export const state = {
  immersiveActive: false,
  settings: null,
  pagerState: { currentPage: 0, totalPages: 1, columnWidth: 0 },
  nav: { prevUrl: null, nextUrl: null, backUrl: null },
  chapterId: null,
  chapterMeta: null,
  chapterData: null,
  prefetchedNext: null,
};

export const dom = {};

export function initReadDom() {
  dom.progressBar = document.getElementById('progress-bar');
  dom.backTop = document.getElementById('back-top');
  dom.navbarTitle = document.querySelector('.navbar h1 a');
  dom.backLink = document.getElementById('back-link');
  dom.navUser = document.getElementById('nav-user');
  dom.readerArea = document.getElementById('reader-area');
  dom.breadcrumb = document.getElementById('breadcrumb');
  dom.content = document.getElementById('content');

  dom.bottomBar = document.getElementById('bottom-bar');
  dom.barPrev = document.getElementById('bar-prev');
  dom.barNext = document.getElementById('bar-next');
  dom.barToc = document.getElementById('bar-toc');
  dom.barBookmark = document.getElementById('bar-bookmark');
  dom.bookmarkIcon = document.getElementById('bookmark-icon');
  dom.barSettings = document.getElementById('bar-settings');
  dom.barImmersive = document.getElementById('bar-immersive');

  dom.tocOverlay = document.getElementById('toc-overlay');
  dom.tocTitle = document.getElementById('toc-title');
  dom.tocList = document.getElementById('toc-list');

  dom.settingsOverlay = document.getElementById('settings-overlay');
  dom.closeSettings = document.getElementById('close-settings');
  dom.themeOptions = document.getElementById('theme-options');
  dom.fontOptions = document.getElementById('font-options');
  dom.fontSizeSlider = document.getElementById('font-size-slider');
  dom.fontSizeVal = document.getElementById('font-size-val');
  dom.lineHeightSlider = document.getElementById('line-height-slider');
  dom.lineHeightVal = document.getElementById('line-height-val');
  dom.widthSlider = document.getElementById('width-slider');
  dom.widthVal = document.getElementById('width-val');
  dom.modeOptions = document.getElementById('mode-options');

  dom.pagerTapLeft = document.getElementById('pager-tap-left');
  dom.pagerTapRight = document.getElementById('pager-tap-right');
  dom.pagerIndicator = document.getElementById('pager-indicator');

  dom.immersiveHint = document.getElementById('immersive-hint');
}

export function initReadState() {
  state.chapterId = new URLSearchParams(location.search).get('id');
  state.settings = loadSettings();
}

function loadSettings() {
  let readingMode = 'scroll';
  try {
    readingMode = localStorage.getItem('reading-mode') || 'scroll';
  } catch {}
  return {
    theme: getSavedTheme(),
    fontSize: safeInt(safeGet('font-size'), 17),
    lineHeight: safeFloat(safeGet('line-height'), 2),
    fontFamily: safeGet('font-family') || FONTS[0],
    readingWidth: safeInt(safeGet('reading-width'), 720),
    readingMode,
  };
}

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeInt(v, fallback) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function safeFloat(v, fallback) {
  const n = Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}
