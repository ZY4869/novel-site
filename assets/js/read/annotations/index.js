import { state } from '../state.js';
import { pagerRecalc } from '../pager.js';
import { getCurrentUser } from '../user.js';
import { createAnnotationEditor } from './editor.js';
import { createAnnotationPopover } from './popover.js';
import { clearAnnotationUnderlines, renderAnnotationUnderlines } from './underlines.js';

let inited = false;

export function initAnnotations() {
  if (inited) return;
  inited = true;

  const ctx = {
    bookId: null,
    chapterId: null,
    enabled: false,
    locked: false,
    canCreate: false,
  };

  const refreshUnderlines = async () => {
    clearAnnotationUnderlines();
    if (!ctx.enabled || !ctx.chapterId) return;
    await renderAnnotationUnderlines(ctx.chapterId);
    if (state.settings?.readingMode === 'pager') {
      requestAnimationFrame(() => requestAnimationFrame(() => pagerRecalc()));
    }
  };

  const popover = createAnnotationPopover({
    getChapterId: () => ctx.chapterId,
    getCurrentUser,
    refreshUnderlines,
  });

  const editor = createAnnotationEditor({
    canCreate: () => ctx.canCreate,
    getContext: () => ({ bookId: ctx.bookId, chapterId: ctx.chapterId }),
    refreshUnderlines,
  });

  document.addEventListener('read:chapter-rendered', (e) => {
    const detail = e.detail || {};
    handleChapter(detail.bookId, detail.chapterId).catch(() => {});
  });

  document.addEventListener('click', (e) => {
    const annotated = e.target.closest('.annotated');
    if (annotated && popover?.open) {
      e.preventDefault();
      popover.open(annotated.dataset.paraIdx, annotated.dataset.sentIdx, annotated);
      return;
    }

    if (popover?.isOpen?.() && popover.el && !popover.el.contains(e.target)) {
      popover.close();
    }

    if (editor?.floatBtn?.classList.contains('visible') && !editor.floatBtn.contains(e.target)) {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) editor.hideFloatBtn();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    editor?.hideFloatBtn?.();
    popover?.close?.();
    editor?.closeEditor?.();
  });

  // 兜底：若事件未捕获，尝试在稍后读取 state.chapterMeta
  queueMicrotask(() => {
    const m = state.chapterMeta;
    if (m && /^\d+$/.test(String(m.chapterId || ''))) {
      handleChapter(m.bookId, m.chapterId).catch(() => {});
    }
  });

  async function handleChapter(bookId, chapterId) {
    if (!bookId || !chapterId) return;
    ctx.bookId = Number(bookId);
    ctx.chapterId = Number(chapterId);
    ctx.enabled = false;
    ctx.locked = false;
    ctx.canCreate = false;
    popover?.close?.();
    editor?.hideFloatBtn?.();
    editor?.closeEditor?.();

    const enabled = await fetchAnnotationFlags(ctx.bookId);
    ctx.enabled = !!enabled?.enabled;
    ctx.locked = !!enabled?.locked;
    await refreshUnderlines();

    const user = await getCurrentUser();
    ctx.canCreate = !!user && ctx.enabled && !ctx.locked;
  }
}

async function fetchAnnotationFlags(bookId) {
  try {
    const res = await fetch(`/api/books/${bookId}`);
    if (!res.ok) return { enabled: false, locked: false };
    const data = await res.json();
    return {
      enabled: !!data?.book?.annotation_enabled,
      locked: !!data?.book?.annotation_locked,
    };
  } catch {
    return { enabled: false, locked: false };
  }
}

