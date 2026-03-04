import { refreshAllBooks } from '../books.js';
import { createCategoryPicker } from '../categories/picker.js';
import { loadCategories } from '../categories/state.js';
import { showMsg } from '../ui.js';
import { backfillGitHubRepoCategories } from './api.js';
import { refreshGitHubRepoContext } from './contentRepos.js';
import { parseRepoSelectValue } from './contentRepos.js';
import { initGitHubRepoComicsContent, syncGitHubRepoComicsUi } from './contentComics.js';
import { initGitHubRepoNovelsContent, syncGitHubRepoNovelsUi } from './contentNovels.js';
import { initGitHubNovelBatchUi } from './novelBatchUi.js';
import { setBusy } from './state.js';

let backfillAbort = false;

function setBackfillCancelVisible(visible) {
  const el = document.getElementById('gh-repo-backfill-categories-cancel-btn');
  if (!el) return;
  el.style.display = visible ? '' : 'none';
}

async function runBackfillCategories() {
  const sel = document.getElementById('gh-repo-novels-repo-select');
  const parsed = parseRepoSelectValue(sel?.value);

  // mapping: "全部仓库" -> omit repo_id; "默认/legacy" -> repo_id=null; specific -> repo_id=number
  const repo_id = parsed?.mode === 'repo' ? (parsed.repoId ?? null) : undefined;

  const ok = confirm(
    '将回填已直连绑定（source_key=gh:*）书籍的目录分类。\n\n规则：只新增不删除（不会移除你手动添加的分类）。\n可能耗时较久，确定继续？'
  );
  if (!ok) return;

  backfillAbort = false;
  setBackfillCancelVisible(true);
  setBusy(true);

  let after_id = 0;
  let rounds = 0;
  const acc = {
    scanned: 0,
    matched: 0,
    created_categories: 0,
    attached_links: 0,
    skipped_no_category: 0,
    skipped_outside_base: 0,
    errors: 0,
  };

  try {
    while (!backfillAbort) {
      rounds++;
      const data = await backfillGitHubRepoCategories({ repo_id, after_id, limit: 200, dry_run: false });
      const s = data?.stats || {};

      acc.scanned += Number(s.scanned || 0) || 0;
      acc.matched += Number(s.matched || 0) || 0;
      acc.created_categories += Number(s.created_categories || 0) || 0;
      acc.attached_links += Number(s.attached_links || 0) || 0;
      acc.skipped_no_category += Number(s.skipped_no_category || 0) || 0;
      acc.skipped_outside_base += Number(s.skipped_outside_base || 0) || 0;
      acc.errors += Number(s.errors || 0) || 0;

      const next = Number(data?.next_after_id || 0) || after_id;
      const hasMore = !!data?.has_more && next > after_id;
      after_id = next;

      const stopped = backfillAbort ? '（已停止）' : '';
      showMsg(
        'gh-repo-novels-msg',
        `回填进度${stopped}：批次${rounds}，after_id=${after_id}；累计扫描${acc.scanned}，匹配${acc.matched}，新建分类${acc.created_categories}，新增关联${acc.attached_links}，跳过无目录${acc.skipped_no_category}，跳过越界${acc.skipped_outside_base}，错误${acc.errors}`,
        ''
      );

      if (!hasMore) break;
    }

    if (backfillAbort) {
      showMsg('gh-repo-novels-msg', '回填已停止', 'warn');
    } else {
      showMsg(
        'gh-repo-novels-msg',
        `回填完成：扫描${acc.scanned}，匹配${acc.matched}，新建分类${acc.created_categories}，新增关联${acc.attached_links}，错误${acc.errors}`,
        acc.errors ? 'warn' : 'success'
      );
    }

    await loadCategories().catch(() => {});
    await refreshAllBooks().catch(() => {});
  } catch (e) {
    showMsg('gh-repo-novels-msg', e?.message || '回填失败', 'error');
  } finally {
    setBackfillCancelVisible(false);
    setBusy(false);
  }
}

export function initGitHubRepoContentUi({ onNovelDone, onComicDone } = {}) {
  const ghCategoryPicker = createCategoryPicker({ container: document.getElementById('gh-repo-category-picker') });
  const getCategoryIds = () => ghCategoryPicker?.getSelectedIds?.() || [];

  initGitHubNovelBatchUi({ onNovelDone, getCategoryIds });
  initGitHubRepoNovelsContent({ onNovelDone, getCategoryIds });
  initGitHubRepoComicsContent({ onComicDone });

  document.getElementById('gh-repo-backfill-categories-btn')?.addEventListener('click', async () => {
    if (backfillAbort === false && document.getElementById('gh-repo-backfill-categories-cancel-btn')?.style?.display !== 'none') return;
    await runBackfillCategories();
  });

  document.getElementById('gh-repo-backfill-categories-cancel-btn')?.addEventListener('click', () => {
    backfillAbort = true;
    showMsg('gh-repo-novels-msg', '正在停止回填...', '');
  });

  window.addEventListener('admin:role-changed', async (e) => {
    const role = String(e?.detail?.role || '');
    if (role !== 'super_admin') return;
    await refreshGitHubRepoContext();
    await syncGitHubRepoNovelsUi();
    await syncGitHubRepoComicsUi();
  });

  window.addEventListener('admin:github-repo-content-changed', async () => {
    try {
      await refreshGitHubRepoContext();
      await syncGitHubRepoNovelsUi();
      await syncGitHubRepoComicsUi();
    } catch {}
  });
}
