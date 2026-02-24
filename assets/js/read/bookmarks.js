import { state, dom } from './state.js';

export function initBookmarks() {
  if (!dom.barBookmark) return;
  dom.barBookmark.addEventListener('click', () => toggleBookmark());
}

export function updateBookmarkIcon() {
  if (!dom.bookmarkIcon) return;
  dom.bookmarkIcon.textContent = isBookmarked() ? '★' : '☆';
}

function toggleBookmark() {
  if (!state.chapterMeta) return;
  const m = state.chapterMeta;

  const bookmarks = getBookmarks(m.bookId);
  const idx = bookmarks.findIndex((b) => b.chapterId === m.chapterId);
  if (idx >= 0) bookmarks.splice(idx, 1);
  else {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const pct = h > 0 ? window.scrollY / h : 0;
    bookmarks.push({
      chapterId: m.chapterId,
      chapterTitle: m.chapterTitle,
      scrollPct: pct,
      time: Date.now(),
    });
  }

  saveBookmarks(m.bookId, bookmarks);
  updateBookmarkIcon();
}

function getBookmarks(bookId) {
  try {
    return JSON.parse(localStorage.getItem(`bookmarks_${bookId}`)) || [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookId, bookmarks) {
  try {
    localStorage.setItem(`bookmarks_${bookId}`, JSON.stringify(bookmarks));
  } catch {}
}

function isBookmarked() {
  if (!state.chapterMeta) return false;
  const m = state.chapterMeta;
  return getBookmarks(m.bookId).some((b) => b.chapterId === m.chapterId);
}

