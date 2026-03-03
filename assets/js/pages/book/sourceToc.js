import { esc } from '../../shared/dom.js';
import { formatBytes, formatWords } from '../../shared/format.js';
import { parseEpubArrayBuffer } from '../../shared/epub.js';
import { decodeText, splitTextBySize, splitTextChapters } from '../../shared/text.js';

const JSZIP_SRC = '/jszip.min.js';
const LARGE_FILE_BYTES = 50 * 1024 * 1024;

let jsZipPromise = null;

function getSourceReadMode(book) {
  const type = String(book?.source_type || '').toLowerCase();
  const name = String(book?.source_name || book?.title || '').toLowerCase();
  if (type.includes('epub') || name.endsWith('.epub')) return 'epub';
  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.text')) return 'text';
  return null;
}

async function ensureJsZip() {
  if (globalThis.JSZip?.loadAsync) return globalThis.JSZip;
  if (jsZipPromise) return jsZipPromise;
  jsZipPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSZIP_SRC;
    s.onload = () => (globalThis.JSZip?.loadAsync ? resolve(globalThis.JSZip) : reject(new Error('JSZip 加载失败')));
    s.onerror = () => reject(new Error('JSZip 加载失败'));
    document.head.appendChild(s);
  });
  return jsZipPromise;
}

function setMsg(text, type = '') {
  const el = document.getElementById('source-toc-msg');
  if (!el) return;
  el.className = type ? `msg msg-${type}` : '';
  el.textContent = String(text || '');
}

function renderTocList(bookId, toc) {
  const list = document.getElementById('source-toc-list');
  if (!list) return;
  list.style.display = '';
  list.innerHTML = toc
    .map(
      (ch, idx) => `
        <li>
          <a href="/read?book=${bookId}#pos=${idx + 1}">
            <span class="chapter-title">${esc(ch.title || `章节 ${idx + 1}`)}</span>
            <span class="chapter-meta">${Number(ch.wordCount || 0)} 字</span>
          </a>
        </li>
      `
    )
    .join('');
}

async function parseSourceToToc(book, arrayBuffer) {
  const mode = getSourceReadMode(book);
  if (!mode) throw new Error('该源文件格式暂不支持生成目录');

  if (mode === 'epub') {
    const JSZip = await ensureJsZip();
    const parsed = await parseEpubArrayBuffer(arrayBuffer, book?.source_name || book?.title || 'book.epub', JSZip);
    const chapters = parsed?.chapters || [];
    return chapters.map((c, idx) => ({
      title: String(c.title || `章节 ${idx + 1}`),
      wordCount: String(c.content || '').length,
    }));
  }

  const text = decodeText(arrayBuffer);
  const chapters = splitTextChapters(text) || splitTextBySize(text, 8000);
  return (chapters || []).map((c, idx) => ({
    title: String(c.title || `第${idx + 1}章`),
    wordCount: String(c.content || '').length,
  }));
}

export function bindSourceTocBuilder(book) {
  const btn = document.getElementById('build-source-toc-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (btn.disabled) return;

    const size = Number(book?.source_size || 0);
    if (Number.isFinite(size) && size > LARGE_FILE_BYTES) {
      const ok = confirm(`源文件较大（${formatBytes(size)}），生成目录需要下载并解析，可能较慢且耗流量。是否继续？`);
      if (!ok) return;
    }

    btn.disabled = true;
    setMsg('加载源文件中...');

    try {
      const res = await fetch(`/api/books/${book.id}/source`);
      if (!res.ok) throw new Error(res.status === 404 ? '源文件不存在' : '源文件加载失败');
      const ab = await res.arrayBuffer();

      setMsg('解析源文件中...');
      const toc = await parseSourceToToc(book, ab);
      if (!toc.length) throw new Error('未解析到内容');

      const totalWords = toc.reduce((sum, c) => sum + Number(c.wordCount || 0), 0);
      setMsg(`已生成目录：${toc.length} 章 / ${formatWords(totalWords)}`, 'success');
      renderTocList(book.id, toc);
    } catch (e) {
      btn.disabled = false;
      setMsg(e.message || '生成失败', 'error');
    }
  });
}

