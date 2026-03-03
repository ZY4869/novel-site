import { parseEpubArrayBuffer } from '../../shared/epub.js';

export async function parseEpubFile(file, JSZip) {
  const ab = await file.arrayBuffer();
  const parsed = await parseEpubArrayBuffer(ab, file.name || 'book.epub', JSZip);
  const chapters = parsed?.chapters || [];
  const meta = parsed?.meta || { title: '', author: '', description: '' };
  const coverBlob = parsed?.cover?.blob || null;
  const totalWords = chapters.reduce((sum, ch) => sum + String(ch.content || '').length, 0);
  return { meta, chapters, coverBlob, totalWords };
}

