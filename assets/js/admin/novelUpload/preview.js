import { setText } from './dom.js';

function escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/\"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(s) {
  return escapeAttr(s).replace(/'/g, '&#39;');
}

export function renderChaptersPreview({ kind, chapters, containerId = 'novel-chapters' } = {}) {
  const box = document.getElementById(containerId);
  if (!box) return;

  box.innerHTML = (chapters || [])
    .map((c, i) => {
      const title = String(c?.title || `章节 ${i + 1}`);
      const wordCount = String(c?.content || '').length;
      const titleHtml =
        kind === 'epub'
          ? `<input type="text" class="novel-title-input" data-idx="${i}" value="${escapeAttr(title)}" style="flex:1;min-width:0;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px">`
          : `<div style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(title)}</div>`;

      return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border)">
          <input type="checkbox" class="novel-chk" data-idx="${i}" ${c?.checked ? 'checked' : ''}>
          <div style="flex:1;min-width:0">
            ${titleHtml}
            <div style="font-size:12px;color:var(--text-light);margin-top:2px">${wordCount.toLocaleString()} 字</div>
          </div>
        </div>
      `;
    })
    .join('');
}

export function bindChaptersPreview({
  kind,
  chapters,
  containerId = 'novel-chapters',
  onChange,
  onTitleChange,
} = {}) {
  const box = document.getElementById(containerId);
  if (!box) return;

  box.querySelectorAll('input.novel-chk').forEach((cb) => {
    cb.addEventListener('change', () => {
      const idx = Number(cb.dataset.idx);
      if (chapters?.[idx]) chapters[idx].checked = cb.checked;
      if (typeof onChange === 'function') onChange(chapters);
    });
  });

  if (kind !== 'epub') return;
  box.querySelectorAll('input.novel-title-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.idx);
      if (chapters?.[idx]) chapters[idx].title = inp.value;
      if (typeof onTitleChange === 'function') onTitleChange(chapters);
    });
  });
}

export function updateChapterSummary(chapters, { totalId = 'novel-total', wordsId = 'novel-words' } = {}) {
  const total = (chapters || []).length;
  const checked = (chapters || []).filter((c) => c && c.checked);
  const words = checked.reduce((sum, c) => sum + String(c.content || '').length, 0);
  setText(totalId, String(total));
  setText(wordsId, words.toLocaleString());
}

