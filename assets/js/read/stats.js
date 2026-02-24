export function initReadingStats() {
  setInterval(() => {
    if (document.hidden) return;
    const s = getReadingStats();
    s.totalSeconds = (s.totalSeconds || 0) + 30;
    saveReadingStats(s);
  }, 30000);
}

export function trackReadingStats(chId, charCount) {
  const s = getReadingStats();
  if (!s.totalSeconds) s.totalSeconds = 0;
  if (!s.totalChars) s.totalChars = 0;
  if (!Array.isArray(s.readChapterIds)) s.readChapterIds = [];
  if (!Array.isArray(s.days)) s.days = [];

  const today = new Date().toISOString().slice(0, 10);
  if (!s.days.includes(today)) s.days.push(today);

  if (!s.readChapterIds.includes(chId)) {
    s.readChapterIds.push(chId);
    s.totalChars += charCount;
  }

  s.lastActiveDate = today;
  saveReadingStats(s);
}

function getReadingStats() {
  try {
    return JSON.parse(localStorage.getItem('readingStats')) || {};
  } catch {
    return {};
  }
}

function saveReadingStats(s) {
  try {
    localStorage.setItem('readingStats', JSON.stringify(s));
  } catch {}
}

