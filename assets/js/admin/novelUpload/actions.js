import { filenameToTitle, showMsg } from '../ui.js';
import { getRadio, setDisplay, setText } from './dom.js';
import { runImportFlow } from './importFlow.js';
import { createBookAndUploadSource } from './uploadSourceOnly.js';

const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

export async function startImportAction({ state, ensureParsed, onDone } = {}) {
  if (!state?.file) return showMsg('novel-msg', '请先选择文件', 'error');
  if (!state?.canImport) return showMsg('novel-msg', '该文件无法导入生成章节', 'error');

  const parsed = await ensureParsed?.();
  if (!parsed?.chapters?.length) return showMsg('novel-msg', '未解析到章节内容', 'error');

  const targetType = getRadio('novel-import-target', 'existing');
  const target =
    targetType === 'new'
      ? {
          type: 'new',
          title: document.getElementById('novel-book-title')?.value?.trim() || '',
          author: document.getElementById('novel-book-author')?.value?.trim() || '',
          description: document.getElementById('novel-book-desc')?.value?.trim() || '',
        }
      : { type: 'existing', bookId: document.getElementById('import-book')?.value || '' };

  const bar = document.getElementById('novel-bar');
  setDisplay('novel-progress', '');
  if (bar) bar.style.width = '0%';
  setText('novel-status', '准备中...');

  try {
    const { coverErr, result } = await runImportFlow({
      file: state.file,
      kind: state.kind,
      parsed,
      target,
      onStatus: (t) => setText('novel-status', t),
      onProgress: ({ done, total, pct }) => {
        if (bar) bar.style.width = `${pct}%`;
        setText('novel-status', `${done}/${total} 章（${pct}%）`);
      },
    });

    const coverNote = coverErr ? `；封面提取失败：${coverErr.message || '未知错误'}` : '';
    if (result.errors.length > 0) {
      showMsg('novel-msg', `导入完成，${result.errors.length} 章失败：${result.errors.slice(0, 3).join('；')}${coverNote}`, 'error');
    } else if (coverErr) {
      showMsg('novel-msg', `导入完成${coverNote}`, 'error');
    } else {
      showMsg('novel-msg', `成功导入 ${result.total} 章`, 'success');
    }

    if (typeof onDone === 'function') onDone();
  } catch (e) {
    showMsg('novel-msg', e.message || '导入失败', 'error');
  }
}

export async function startSourceOnlyAction({ state, onDone } = {}) {
  if (!state?.file) return showMsg('novel-source-msg', '请先选择文件', 'error');
  if (state.file.size > MAX_SOURCE_BYTES) return showMsg('novel-source-msg', '文件超过 200MB 限制', 'error');

  const title = (document.getElementById('novel-source-title')?.value?.trim() || filenameToTitle(state.file.name)).slice(0, 200);
  const author = (document.getElementById('novel-source-author')?.value?.trim() || '').slice(0, 100);
  const description = (document.getElementById('novel-source-desc')?.value?.trim() || '').slice(0, 2000);
  if (!title) return showMsg('novel-source-msg', '请输入书名', 'error');

  try {
    const { coverErr } = await createBookAndUploadSource({
      file: state.file,
      title,
      author,
      description,
      JSZip: globalThis.JSZip,
      onStatus: (t) => showMsg('novel-source-msg', t, ''),
    });

    const note = coverErr ? `；封面提取失败：${coverErr.message || '未知错误'}` : '';
    showMsg('novel-source-msg', `创建成功：${title}${note}`, coverErr ? 'error' : 'success');
    if (typeof onDone === 'function') onDone();
  } catch (e) {
    showMsg('novel-source-msg', e.message || '失败', 'error');
  }
}

