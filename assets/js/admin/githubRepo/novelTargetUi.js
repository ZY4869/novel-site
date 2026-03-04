export function getNovelTargetFromUi(defaultTitle) {
  const targetType = document.querySelector('input[name="novel-import-target"]:checked')?.value || 'existing';
  if (targetType === 'new') {
    const titleEl = document.getElementById('novel-book-title');
    const hintTitle = String(defaultTitle || '').trim();

    if (titleEl && hintTitle) {
      const cur = String(titleEl.value || '').trim();
      if (!cur || titleEl.dataset.autofill) {
        titleEl.value = hintTitle;
        titleEl.dataset.autofill = 'filename';
      }
    }

    return {
      type: 'new',
      title: titleEl?.value?.trim() || '',
      titleSource: titleEl?.dataset?.autofill || '',
      author: document.getElementById('novel-book-author')?.value?.trim() || '',
      description: document.getElementById('novel-book-desc')?.value?.trim() || '',
    };
  }
  return { type: 'existing', bookId: document.getElementById('import-book')?.value || '' };
}
