import { syncImportFromBookSource } from '../booksSync.js';

export async function syncOneBook(book, { onStatus, onProgress } = {}) {
  return await syncImportFromBookSource(book, { onStatus, onProgress });
}

export async function syncBatchBooks(books, { shouldAbort, onStatus, onProgress } = {}) {
  const list = Array.isArray(books) ? books : [];

  let ok = 0;
  let fail = 0;
  let lastOkId = null;
  let aborted = false;

  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const idx = i + 1;

    if (typeof shouldAbort === 'function' && shouldAbort()) {
      aborted = true;
      break;
    }

    try {
      await syncImportFromBookSource(b, {
        onStatus: (t) => {
          if (typeof onStatus === 'function') onStatus({ idx, total: list.length, title: b.title || '', status: t });
        },
        onProgress: ({ done, total, pct }) => {
          if (typeof onProgress === 'function') {
            onProgress({ idx, total: list.length, title: b.title || '', done, totalChapters: total, pct });
          }
        },
      });
      ok++;
      lastOkId = Number(b?.id) || lastOkId;
    } catch {
      fail++;
    }
  }

  return { ok, fail, lastOkId, aborted };
}

