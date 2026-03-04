import { filenameToTitle, showMsg } from '../ui.js';
import { bindGitHubNovel } from './api.js';
import { syncImportGitHubNovel } from './syncNovel.js';
import { isBusy, setBusy } from './state.js';
import { tryComputeAndSaveSourceMeta } from './novelMeta.js';
let abortRequested = false;

export function initGitHubNovelBatchUi({ onNovelDone, getCategoryIds } = {}) {
  document.getElementById('gh-repo-novels-select-all')?.addEventListener('change', (e) => {
    if (isBusy()) return;
    setAllNovelSelected(!!e.target.checked);
    refreshGitHubNovelBatchUi();
  });
  document.getElementById('gh-repo-novels-list')?.addEventListener('change', (e) => {
    if (!e.target?.classList?.contains('gh-novel-select')) return;
    refreshGitHubNovelBatchUi();
  });
  document.getElementById('gh-repo-novels-batch-bind-btn')?.addEventListener('click', () =>
    batchBindSelectedNovels({ onNovelDone, getCategoryIds })
  );
  document.getElementById('gh-repo-novels-batch-sync-btn')?.addEventListener('click', () =>
    batchSyncSelectedNovels({ onNovelDone, getCategoryIds })
  );
  document.getElementById('gh-repo-novels-batch-cancel-btn')?.addEventListener('click', () => {
    abortRequested = true;
    showMsg('gh-repo-novels-msg', '正在停止...', '');
  });
  refreshGitHubNovelBatchUi();
}

export function refreshGitHubNovelBatchUi() {
  const allLis = getAllNovelLis();
  const selectedLis = getSelectedNovelLis();
  const selectAllEl = document.getElementById('gh-repo-novels-select-all');
  if (selectAllEl) {
    selectAllEl.checked = allLis.length > 0 && selectedLis.length === allLis.length;
    selectAllEl.indeterminate = selectedLis.length > 0 && selectedLis.length < allLis.length;
  }
  const hintEl = document.getElementById('gh-repo-novels-selected-hint');
  if (hintEl) {
    hintEl.textContent = allLis.length > 0 ? `已选 ${selectedLis.length}/${allLis.length}` : '';
  }
  const disable = isBusy() || selectedLis.length === 0;
  const bindBtn = document.getElementById('gh-repo-novels-batch-bind-btn');
  const syncBtn = document.getElementById('gh-repo-novels-batch-sync-btn');
  if (bindBtn) bindBtn.disabled = disable;
  if (syncBtn) syncBtn.disabled = disable;
}

function getAllNovelLis() {
  return Array.from(document.querySelectorAll('#gh-repo-novels-list li[data-kind=\"file\"][data-path]') || []);
}

function getSelectedNovelLis() {
  return getAllNovelLis().filter((li) => li.querySelector('input.gh-novel-select')?.checked);
}

function setAllNovelSelected(checked) {
  for (const li of getAllNovelLis()) {
    const cb = li.querySelector('input.gh-novel-select');
    if (cb) cb.checked = checked;
  }
}

function showCancelBtn(visible) {
  const el = document.getElementById('gh-repo-novels-batch-cancel-btn');
  if (!el) return;
  el.style.display = visible ? '' : 'none';
}

function getBatchImportTemplate() {
  return {
    author: document.getElementById('novel-book-author')?.value?.trim() || '',
    description: document.getElementById('novel-book-desc')?.value?.trim() || '',
  };
}

function getLiInfo(li) {
  const path = String(li?.dataset?.path || '').trim();
  const name = String(li?.dataset?.name || '').trim();
  const size = Number(li?.dataset?.size || 0) || 0;
  const repoIdRaw = String(li?.dataset?.repoId || '').trim();
  const repoId = /^\d+$/.test(repoIdRaw) ? Number(repoIdRaw) : null;
  return { repoId, path, name, size };
}

async function batchBindSelectedNovels({ onNovelDone, getCategoryIds } = {}) {
  if (isBusy()) return;
  const selected = getSelectedNovelLis();
  if (selected.length === 0) return showMsg('gh-repo-novels-msg', '请先勾选要处理的文件', 'error');
  const ok = confirm(`确定批量直连绑定 ${selected.length} 个文件吗？\n将为每个文件创建一本书（不导入章节、不存储到 R2）。`);
  if (!ok) return;
  const computeMeta = confirm('是否在绑定后自动统计章数/字数？（会额外下载每个文件，可能较慢）');
  abortRequested = false;
  showCancelBtn(true);
  setBusy(true);

  let created = 0;
  let existed = 0;
  let failed = 0;

  try {
    for (let i = 0; i < selected.length; i++) {
      if (abortRequested) break;

      const { path, name, size } = getLiInfo(selected[i]);
      const title = filenameToTitle(name);
      showMsg('gh-repo-novels-msg', `批量直连绑定 ${i + 1}/${selected.length}：${title}`, '');

      try {
        const category_ids = typeof getCategoryIds === 'function' ? getCategoryIds() : [];
        const { repoId } = getLiInfo(selected[i]);
        const data = await bindGitHubNovel({ repo_id: repoId || undefined, path, title, name, size, category_ids });
        const bookId = data?.book?.id;
        const already = !!data?.alreadyExists;
        if (already) existed++;
        else created++;

        if (computeMeta && bookId && !already) {
          showMsg('gh-repo-novels-msg', `统计章数/字数 ${i + 1}/${selected.length}：${title}`, '');
          await tryComputeAndSaveSourceMeta({
            bookId,
            repoId,
            path,
            name,
            sizeBytes: size,
            onTip: (t) => showMsg('gh-repo-novels-msg', t, ''),
          });
        }
      } catch (e) {
        failed++;
      }
    }
  } finally {
    showCancelBtn(false);
    setBusy(false);
    refreshGitHubNovelBatchUi();
  }

  const stopped = abortRequested ? '（已停止）' : '';
  showMsg('gh-repo-novels-msg', `批量直连绑定完成${stopped}：新增 ${created}，已存在 ${existed}，失败 ${failed}`, failed ? 'error' : 'success');
  if (created > 0 && typeof onNovelDone === 'function') onNovelDone();
}

async function batchSyncSelectedNovels({ onNovelDone, getCategoryIds } = {}) {
  if (isBusy()) return;
  const selected = getSelectedNovelLis();
  if (selected.length === 0) return showMsg('gh-repo-novels-msg', '请先勾选要处理的文件', 'error');
  const ok = confirm(
    `确定批量同步导入 ${selected.length} 个文件吗？\n将为每个文件创建一本新书并导入到本地 D1+R2（不会导入到“已选择书籍”）。`
  );
  if (!ok) return;
  const tpl = getBatchImportTemplate();
  const category_ids = typeof getCategoryIds === 'function' ? getCategoryIds() : [];

  abortRequested = false;
  showCancelBtn(true);
  setBusy(true);

  let imported = 0;
  let failed = 0;

  try {
    for (let i = 0; i < selected.length; i++) {
      if (abortRequested) break;

      const { path, name } = getLiInfo(selected[i]);
      const { repoId } = getLiInfo(selected[i]);
      const title = filenameToTitle(name);

      try {
        await syncImportGitHubNovel(
          {
            repoId,
            path,
            name,
            target: {
              type: 'new',
              title,
              author: tpl.author,
              description: tpl.description,
              category_ids,
            },
          },
          {
            onStatus: (t) => showMsg('gh-repo-novels-msg', `同步导入 ${i + 1}/${selected.length}：${title} - ${t}`, ''),
            onProgress: ({ done, total, pct }) =>
              showMsg('gh-repo-novels-msg', `同步导入 ${i + 1}/${selected.length}：${title} - ${done}/${total} 章（${pct}%）`, ''),
          }
        );
        imported++;
      } catch {
        failed++;
      }
    }
  } finally {
    showCancelBtn(false);
    setBusy(false);
    refreshGitHubNovelBatchUi();
  }

  const stopped = abortRequested ? '（已停止）' : '';
  showMsg('gh-repo-novels-msg', `批量同步导入完成${stopped}：成功 ${imported}，失败 ${failed}`, failed ? 'error' : 'success');
  if (imported > 0 && typeof onNovelDone === 'function') onNovelDone();
}
