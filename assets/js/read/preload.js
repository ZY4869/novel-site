import { state } from './state.js';

export function takePrefetchedChapter(chapterId) {
  const d = state.prefetchedNext;
  if (d && d.chapter && String(d.chapter.id) === String(chapterId)) {
    state.prefetchedNext = null;
    return d;
  }
  return null;
}

export function prefetchChapterAfterDelay(chapterId, delayMs = 2000) {
  if (!chapterId) return;
  setTimeout(() => {
    fetch(`/api/chapters/${chapterId}`)
      .then((r) => r.json())
      .then((d) => {
        state.prefetchedNext = d;
      })
      .catch(() => {});
  }, delayMs);
}

