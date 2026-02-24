export async function exportBook(bookId, title, author) {
  try {
    const res = await fetch(`/api/books/${bookId}`);
    const data = await res.json();
    const chapters = data.chapters || [];
    if (chapters.length === 0) return alert('没有章节可导出');

    const parts = [];
    for (const ch of chapters) {
      const r = await fetch(`/api/chapters/${ch.id}`);
      const d = await r.json();
      parts.push(ch.title + '\n\n' + d.content);
    }

    const sep = '\n\n' + '='.repeat(40) + '\n\n';
    const header = `《${title}》\n${author ? '作者：' + author + '\n' : ''}\n`;
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + header + parts.join(sep)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (title + (author ? '_' + author : '') + '.txt').replace(/[<>:"/\\|?*]/g, '_');
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('导出失败：' + e.message);
  }
}

