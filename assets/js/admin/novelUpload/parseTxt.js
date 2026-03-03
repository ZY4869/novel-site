import { decodeText, splitTextBySize, splitTextChapters } from '../../shared/text.js';

export async function parseTxtFile(file) {
  const buffer = await file.arrayBuffer();
  const text = decodeText(buffer);
  const chapters = splitTextChapters(text) || splitTextBySize(text, 6000);
  const totalWords = (chapters || []).reduce((sum, ch) => sum + String(ch.content || '').length, 0);
  return { chapters: chapters || [], totalWords };
}

