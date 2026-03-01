import { state } from '../state.js';
import { annoApi } from './api.js';
import { snapToSentence, sentenceHash } from './text.js';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function nodeToElement(node) {
  if (!node) return null;
  return node.nodeType === 3 ? node.parentElement : node;
}

export function createAnnotationEditor({ canCreate, getContext, refreshUnderlines }) {
  const floatBtn = document.getElementById('anno-float-btn');
  const editor = document.getElementById('anno-editor');
  const quoteEl = document.getElementById('anno-quote');
  const inputEl = document.getElementById('anno-input');
  const charNumEl = document.getElementById('anno-char-num');
  const visBtn = document.getElementById('anno-vis-btn');
  const cancelBtn = document.getElementById('anno-cancel');
  const submitBtn = document.getElementById('anno-submit');

  if (!floatBtn || !editor || !quoteEl || !inputEl || !charNumEl || !visBtn || !cancelBtn || !submitBtn) return null;

  const annoState = {
    paraIdx: null,
    sentIdx: null,
    sentText: '',
    sentHash: '',
    visibility: 'private',
    editing: false,
    selRect: null,
  };

  let selectionTimer = null;

  function hideFloatBtn() {
    floatBtn.classList.remove('visible');
  }

  function showFloatBtnForSelection(sel) {
    if (!canCreate?.()) return;
    hideFloatBtn();
    if (!sel || sel.isCollapsed || annoState.editing) return;
    if (!sel.rangeCount) return;

    const anchorEl = nodeToElement(sel.anchorNode);
    const focusEl = nodeToElement(sel.focusNode);
    const p1 = anchorEl?.closest('p[data-para-idx]');
    const p2 = focusEl?.closest('p[data-para-idx]');
    if (!p1 || p1 !== p2) return;
    if (!p1.closest('.reader-content')) return;

    const paraIdx = Number.parseInt(p1.dataset.paraIdx || '', 10);
    if (!Number.isFinite(paraIdx) || paraIdx < 0) return;

    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.setStart(p1, 0);
    try {
      preRange.setEnd(range.startContainer, range.startOffset);
    } catch {
      return;
    }

    const selStart = preRange.toString().length;
    const selEnd = selStart + sel.toString().length;
    const paraText = p1.textContent;
    const snapped = snapToSentence(paraText, selStart, selEnd);
    if (!snapped) return;

    annoState.paraIdx = paraIdx;
    annoState.sentIdx = snapped.sentIdx;
    annoState.sentText = snapped.text;

    let rect = range.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      const rects = range.getClientRects();
      if (rects && rects.length) rect = rects[rects.length - 1];
    }
    if (!rect) return;
    annoState.selRect = { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width };

    floatBtn.classList.add('visible');
    const x = clamp(rect.left + rect.width / 2 - 18, 8, window.innerWidth - 44);
    const y = clamp(rect.top - 44, 8, window.innerHeight - 44);
    floatBtn.style.left = `${Math.round(x)}px`;
    floatBtn.style.top = `${Math.round(y)}px`;
  }

  async function openEditor() {
    hideFloatBtn();

    if (!annoState.sentText) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        showFloatBtnForSelection(sel);
        hideFloatBtn();
      }
      if (!annoState.sentText) {
        alert('请先选中一段文字');
        return;
      }
    }

    try {
      annoState.editing = true;
      annoState.sentHash = await sentenceHash(annoState.sentText);

      quoteEl.textContent = annoState.sentText;
      inputEl.value = '';
      charNumEl.textContent = '0';

      annoState.visibility = 'private';
      visBtn.textContent = '🔒 仅自己可见';
      visBtn.classList.remove('public');

      editor.style.display = 'block';
      inputEl.focus();

      if (window.innerWidth > 768 && annoState.selRect) {
        const rect = annoState.selRect;
        editor.style.left = `${clamp(rect.left, 8, window.innerWidth - 340)}px`;
        editor.style.top = `${rect.bottom + 12}px`;
        editor.style.transform = 'none';
        requestAnimationFrame(() => {
          const edRect = editor.getBoundingClientRect();
          if (edRect.bottom > window.innerHeight - 8) {
            editor.style.top = `${rect.top - edRect.height - 12}px`;
          }
        });
      } else if (window.innerWidth > 768) {
        editor.style.left = '50%';
        editor.style.top = '30%';
        editor.style.transform = 'translateX(-50%)';
      }
    } catch {
      annoState.editing = false;
    }
  }

  function closeEditor() {
    annoState.editing = false;
    editor.style.display = 'none';
  }

  function toggleVisibility() {
    if (annoState.visibility === 'private') {
      annoState.visibility = 'public';
      visBtn.textContent = '🌐 所有人可见';
      visBtn.classList.add('public');
    } else {
      annoState.visibility = 'private';
      visBtn.textContent = '🔒 仅自己可见';
      visBtn.classList.remove('public');
    }
  }

  async function submit() {
    const ctx = getContext?.();
    if (!ctx?.chapterId || !ctx?.bookId) {
      alert('章节信息缺失，请刷新重试');
      return;
    }

    const content = inputEl.value.trim();
    if (!content) return;
    if (content.length > 500) {
      alert('批注内容不能超过500字');
      return;
    }

    submitBtn.disabled = true;
    const oldText = submitBtn.textContent;
    submitBtn.textContent = '发表中...';

    try {
      const res = await annoApi('POST', '/api/annotations', {
        chapterId: ctx.chapterId,
        bookId: ctx.bookId,
        paraIdx: annoState.paraIdx,
        sentIdx: annoState.sentIdx,
        sentHash: annoState.sentHash,
        sentText: annoState.sentText,
        content,
        visibility: annoState.visibility,
      });

      if (res.ok) {
        closeEditor();
        await refreshUnderlines?.();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || '发表失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = oldText || '发表';
    }
  }

  document.addEventListener('selectionchange', () => {
    if (!canCreate?.() || annoState.editing) {
      hideFloatBtn();
      return;
    }
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || annoState.editing) {
        hideFloatBtn();
        return;
      }
      const anchorEl = nodeToElement(sel.anchorNode);
      if (!anchorEl?.closest('.reader-content')) {
        hideFloatBtn();
        return;
      }
      showFloatBtnForSelection(sel);
    }, 150);
  });

  document.addEventListener('mouseup', () => {
    if (!canCreate?.() || annoState.editing) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || annoState.editing) return;
      const anchorEl = nodeToElement(sel.anchorNode);
      if (!anchorEl?.closest('.reader-content')) {
        hideFloatBtn();
        return;
      }
      showFloatBtnForSelection(sel);
    }, 50);
  });

  document.addEventListener('contextmenu', (e) => {
    if (!canCreate?.()) return;
    if (!e.target.closest('.reader-content')) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) e.preventDefault();
  });

  floatBtn.addEventListener('mousedown', (e) => {
    if (!canCreate?.()) return;
    e.preventDefault();
    e.stopPropagation();
    openEditor();
  });

  visBtn.addEventListener('click', toggleVisibility);
  cancelBtn.addEventListener('click', closeEditor);
  submitBtn.addEventListener('click', submit);

  inputEl.addEventListener('input', () => {
    const len = inputEl.value.length;
    charNumEl.textContent = String(len);
    charNumEl.parentElement?.classList.toggle('warn', len > 450);
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeEditor();
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      if (state.settings?.readingMode === 'pager') return;
      hideFloatBtn();
    },
    { passive: true }
  );

  return {
    closeEditor,
    hideFloatBtn,
    isEditing: () => annoState.editing,
    floatBtn,
    editorEl: editor,
  };
}
