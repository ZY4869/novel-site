import { api } from './api.js';
import { refreshAllBooks } from './books.js';
import { showMsg } from './ui.js';

export function initBackup() {
  document.getElementById('backup-btn')?.addEventListener('click', exportBackup);
  document.getElementById('restore-file')?.addEventListener('change', restoreBackupFromFile);
}

async function exportBackup() {
  const btn = document.getElementById('backup-btn');
  const bar = document.getElementById('backup-bar');
  const status = document.getElementById('backup-status');
  const progress = document.getElementById('backup-progress');

  if (btn) {
    btn.disabled = true;
    btn.textContent = '导出中...';
  }
  if (progress) progress.style.display = 'block';

  try {
    const booksRes = await api('GET', '/api/books');
    const booksData = await booksRes.json();
    const books = booksData.books || [];

    const settingsRes = await fetch('/api/settings');
    const settingsData = await settingsRes.json();

    const backup = { version: 1, exportedAt: new Date().toISOString(), settings: settingsData.settings || {}, books: [] };

    let done = 0;
    for (const book of books) {
      const bookRes = await fetch(`/api/books/${book.id}`);
      const bookData = await bookRes.json();
      const chapters = bookData.chapters || [];
      const fullChapters = [];
      for (const ch of chapters) {
        const chRes = await fetch(`/api/chapters/${ch.id}`);
        const chData = await chRes.json();
        fullChapters.push({
          title: ch.title,
          sort_order: ch.sort_order,
          word_count: ch.word_count,
          content: chData.content || '',
        });
      }
      backup.books.push({ title: book.title, author: book.author || '', description: book.description || '', chapters: fullChapters });

      done++;
      const pct = books.length ? Math.round((done / books.length) * 100) : 100;
      if (bar) bar.style.width = `${pct}%`;
      if (status) status.textContent = `${done}/${books.length} 本书`;
    }

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `novel-site-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showMsg('backup-msg', `备份成功：${books.length} 本书`, 'success');
  } catch (e) {
    showMsg('backup-msg', `备份失败：${e.message}`, 'error');
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = '导出备份';
  }
  setTimeout(() => {
    if (progress) progress.style.display = 'none';
  }, 2000);
}

async function restoreBackupFromFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!confirm('恢复备份会添加数据（不会删除现有数据）。确定继续？')) {
    e.target.value = '';
    return;
  }

  const bar = document.getElementById('backup-bar');
  const status = document.getElementById('backup-status');
  const progress = document.getElementById('backup-progress');
  if (progress) progress.style.display = 'block';

  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    if (!backup.version || !backup.books) throw new Error('无效的备份文件');

    const books = backup.books;
    let done = 0;
    const errors = [];

    for (const book of books) {
      try {
        const res = await api('POST', '/api/admin/books', { title: book.title, author: book.author, description: book.description });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        const bookId = d.book.id;
        for (const ch of book.chapters || []) {
          await api('POST', '/api/admin/chapters', { book_id: bookId, title: ch.title, content: ch.content });
        }
      } catch (err) {
        errors.push(`${book.title}: ${err.message}`);
      }

      done++;
      const pct = books.length ? Math.round((done / books.length) * 100) : 100;
      if (bar) bar.style.width = `${pct}%`;
      if (status) status.textContent = `${done}/${books.length} 本书`;
    }

    if (errors.length > 0) showMsg('backup-msg', `恢复完成，${errors.length} 本失败：${errors.slice(0, 3).join('；')}`, 'error');
    else showMsg('backup-msg', `成功恢复 ${books.length} 本书`, 'success');

    refreshAllBooks();
  } catch (err) {
    showMsg('backup-msg', `恢复失败：${err.message}`, 'error');
  }

  e.target.value = '';
  setTimeout(() => {
    if (progress) progress.style.display = 'none';
  }, 2000);
}

