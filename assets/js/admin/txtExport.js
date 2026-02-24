import { esc, showMsg } from './ui.js';

export function downloadTxt(text, filename) {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportBook(bookId) {
  showMsg('manage-msg', '正在导出...', '');
  try {
    const res = await fetch(`/api/books/${bookId}`);
    const data = await res.json();
    const book = data.book;
    const chapters = data.chapters || [];
    if (chapters.length === 0) return showMsg('manage-msg', '没有章节可导出', 'error');

    const parts = [];
    for (const ch of chapters) {
      const r = await fetch(`/api/chapters/${ch.id}`);
      const d = await r.json();
      parts.push(`${ch.title}\n\n${d.content}`);
    }
    const sep = `\n\n${'='.repeat(40)}\n\n`;
    const header = `《${book.title}》\n${book.author ? `作者：${book.author}\n` : ''}\n`;

    const filename = `${book.title}${book.author ? `_${book.author}` : ''}.txt`.replace(/[<>:\"/\\\\|?*]/g, '_');
    downloadTxt(header + parts.join(sep), filename);
    showMsg('manage-msg', '导出成功', 'success');
  } catch (e) {
    showMsg('manage-msg', `导出失败：${e.message}`, 'error');
  }
}

export async function exportChapter(chapterId, title) {
  try {
    const res = await fetch(`/api/chapters/${chapterId}`);
    const data = await res.json();
    downloadTxt(data.content, `${title}.txt`.replace(/[<>:\"/\\\\|?*]/g, '_'));
  } catch (e) {
    alert(`导出失败：${e.message}`);
  }
}

