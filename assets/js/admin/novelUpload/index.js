import { filenameToTitle, formatBytes, showMsg } from '../ui.js';
import { setDisplay, setRadio, setText, setValue, getRadio } from './dom.js';
import { parseEpubFile } from './parseEpub.js';
import { parseTxtFile } from './parseTxt.js';
import { bindChaptersPreview, renderChaptersPreview, updateChapterSummary } from './preview.js';
import { startImportAction, startSourceOnlyAction } from './actions.js';

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

function detectKind(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  if (type.includes('epub') || name.endsWith('.epub')) return 'epub';
  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.text')) return 'txt';
  return 'other';
}

export function initNovelUpload({ onDone } = {}) {
  const fileEl = document.getElementById('novel-file');
  if (!fileEl) return;

  const autofillTitleFromFilename = (el, filename) => {
    if (!el) return;
    if (String(el.value || '').trim()) return;
    el.value = filenameToTitle(filename);
    el.dataset.autofill = 'filename';
  };

  const state = {
    file: null,
    kind: 'other',
    canImport: false,
    parsed: null,
  };

  const resetProgress = () => {
    setDisplay('novel-progress', 'none');
    const bar = document.getElementById('novel-bar');
    if (bar) bar.style.width = '0%';
    setText('novel-status', '');
  };

  const resetUi = ({ keepFileInput = false } = {}) => {
    Object.assign(state, { file: null, kind: 'other', canImport: false, parsed: null });
    if (!keepFileInput) fileEl.value = '';
    ['novel-file-info', 'novel-mode-tip', 'novel-source-tip'].forEach((id) => setText(id, ''));
    ['novel-mode-group', 'novel-import-box', 'novel-source-box', 'novel-book-meta', 'novel-import-preview'].forEach((id) =>
      setDisplay(id, 'none')
    );
    ['novel-msg', 'novel-source-msg'].forEach((id) => showMsg(id, '', ''));
    ['novel-source-title', 'novel-source-author', 'novel-source-desc', 'novel-book-title', 'novel-book-author', 'novel-book-desc'].forEach((id) =>
      setValue(id, '')
    );
    ['novel-source-title', 'novel-book-title'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) delete el.dataset.autofill;
    });
    resetProgress();
  };

  const applyTargetMode = () => {
    const target = getRadio('novel-import-target', 'existing');
    setDisplay('novel-existing-book', target === 'existing' ? '' : 'none');
    setDisplay('novel-book-meta', target === 'new' ? '' : 'none');
    if (target === 'new' && state.file) {
      const titleEl = document.getElementById('novel-book-title');
      autofillTitleFromFilename(titleEl, state.file.name);
    }
  };

  const fillMetaIfEmpty = () => {
    if (!state.parsed?.meta) return;
    const m = state.parsed.meta;
    const title = document.getElementById('novel-book-title');
    const author = document.getElementById('novel-book-author');
    const desc = document.getElementById('novel-book-desc');
    const metaTitle = String(m.title || '').trim();
    if (title && metaTitle) {
      const cur = String(title.value || '').trim();
      if (!cur || title.dataset.autofill === 'filename') {
        title.value = metaTitle.slice(0, 200);
        title.dataset.autofill = 'meta';
      }
    }
    if (author && !author.value.trim() && m.author) author.value = String(m.author).slice(0, 100);
    if (desc && !desc.value.trim() && m.description) desc.value = String(m.description).slice(0, 2000);
  };

  const ensureParsed = async () => {
    if (!state.file || !state.canImport) return null;
    if (state.parsed?.fileName === state.file.name && state.parsed?.fileSize === state.file.size) return state.parsed;
    setText('novel-mode-tip', '正在解析文件...');
    try {
      if (state.kind === 'txt') {
        const parsed = await parseTxtFile(state.file);
        state.parsed = { ...parsed, kind: 'txt', meta: null, coverBlob: null, fileName: state.file.name, fileSize: state.file.size };
      } else if (state.kind === 'epub') {
        const parsed = await parseEpubFile(state.file, globalThis.JSZip);
        state.parsed = { ...parsed, kind: 'epub', fileName: state.file.name, fileSize: state.file.size };
        fillMetaIfEmpty();
      }
      return state.parsed;
    } finally {
      setText('novel-mode-tip', '');
    }
  };

  const renderImportPreview = () => {
    const chapters = state.parsed?.chapters || [];
    if (chapters.length === 0) return;
    setDisplay('novel-import-preview', '');
    renderChaptersPreview({ kind: state.kind, chapters });
    bindChaptersPreview({
      kind: state.kind,
      chapters,
      onChange: () => updateChapterSummary(chapters),
    });
    updateChapterSummary(chapters);
  };

  const applyUploadMode = async () => {
    const mode = getRadio('novel-upload-mode', 'import');
    showMsg('novel-msg', '', '');
    showMsg('novel-source-msg', '', '');
    resetProgress();

    if (mode === 'import') {
      setDisplay('novel-source-box', 'none');
      if (!state.canImport) {
        setDisplay('novel-import-box', 'none');
        return;
      }
      setDisplay('novel-import-box', '');
      applyTargetMode();
      await ensureParsed();
      renderImportPreview();
      return;
    }

    // source-only
    setDisplay('novel-import-box', 'none');
    setDisplay('novel-source-box', state.file ? '' : 'none');
    if (state.file) {
      const titleEl = document.getElementById('novel-source-title');
      autofillTitleFromFilename(titleEl, state.file.name);
      setText(
        'novel-source-tip',
        state.kind === 'other'
          ? '该格式将作为源文件收纳（不会生成章节）。'
          : state.file.size > MAX_IMPORT_BYTES
            ? '文件超过 50MB，无法导入生成章节，将作为源文件收纳。'
            : '可选择仅收纳源文件（不会生成章节）。'
      );
    }
  };

  const onFileChange = async () => {
    const file = fileEl.files?.[0];
    if (!file) return resetUi();

    resetUi({ keepFileInput: true });
    state.file = file;
    state.kind = detectKind(file);
    state.canImport = (state.kind === 'txt' || state.kind === 'epub') && file.size <= MAX_IMPORT_BYTES;

    if (file.size > MAX_SOURCE_BYTES) {
      resetUi();
      setText('novel-file-info', '文件超过 200MB 限制');
      return;
    }

    const info = `${file.name}（${formatBytes(file.size)}） / ${state.kind === 'txt' ? 'TXT' : state.kind === 'epub' ? 'EPUB' : '其他格式'}`;
    setText('novel-file-info', info);

    setDisplay('novel-mode-group', '');

    const importRadio = document.querySelector('input[name="novel-upload-mode"][value="import"]');
    if (importRadio) importRadio.disabled = !state.canImport;

    if (!state.canImport) {
      setRadio('novel-upload-mode', 'source');
      setText(
        'novel-mode-tip',
        state.kind === 'other'
          ? '该格式不支持导入生成章节，将作为源文件收纳。'
          : `文件超过 50MB，无法导入生成章节，将作为源文件收纳。`
      );
    } else {
      setRadio('novel-upload-mode', 'import');
      setText('novel-mode-tip', '支持导入生成章节，也可选择仅收纳源文件。');
    }

    const sourceTitleEl = document.getElementById('novel-source-title');
    autofillTitleFromFilename(sourceTitleEl, file.name);
    const bookTitleEl = document.getElementById('novel-book-title');
    autofillTitleFromFilename(bookTitleEl, file.name);

    await applyUploadMode();
  };

  fileEl.addEventListener('change', onFileChange);
  document.querySelectorAll('input[name="novel-upload-mode"]').forEach((r) => r.addEventListener('change', applyUploadMode));
  document.querySelectorAll('input[name="novel-import-target"]').forEach((r) => r.addEventListener('change', applyTargetMode));

  ['novel-book-title', 'novel-source-title'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const el = e?.target;
      if (el?.dataset) delete el.dataset.autofill;
    });
  });

  document.getElementById('novel-start-btn')?.addEventListener('click', () =>
    startImportAction({ state, ensureParsed, onDone })
  );
  document.getElementById('novel-cancel-btn')?.addEventListener('click', () => resetUi());
  document.getElementById('novel-source-create-btn')?.addEventListener('click', () =>
    startSourceOnlyAction({ state, onDone })
  );
  document.getElementById('novel-source-cancel-btn')?.addEventListener('click', () => resetUi());

  resetUi();
}
