import { esc } from '../../shared/dom.js';
import { annoApi } from './api.js';

export function createAnnotationPopover({ getChapterId, getCurrentUser, refreshUnderlines }) {
  const popover = document.getElementById('anno-popover');
  if (!popover) return null;

  let popoverSort = 'latest';
  let popoverContext = null; // { paraIdx, sentIdx, anchorEl }

  popover.addEventListener('click', (e) => {
    const sortBtn = e.target.closest('.anno-sort-tab');
    if (sortBtn && popoverContext) {
      e.preventDefault();
      open(popoverContext.paraIdx, popoverContext.sentIdx, popoverContext.anchorEl, sortBtn.dataset.sort);
      return;
    }

    const expand = e.target.closest('.anno-expand');
    if (expand) {
      e.preventDefault();
      const contentEl = expand.closest('.anno-popover-content');
      if (!contentEl) return;
      contentEl.textContent = contentEl.dataset.full || '';
      contentEl.classList.remove('truncated');
      return;
    }

    const likeBtn = e.target.closest('.anno-like-btn');
    if (likeBtn) {
      e.preventDefault();
      const id = Number(likeBtn.dataset.id);
      if (Number.isFinite(id)) toggleLike(id, likeBtn);
      return;
    }

    const delBtn = e.target.closest('.anno-delete-btn');
    if (delBtn) {
      e.preventDefault();
      const id = Number(delBtn.dataset.id);
      if (Number.isFinite(id)) deleteAnnotation(id);
      return;
    }

    const reportBtn = e.target.closest('.anno-report-btn');
    if (reportBtn) {
      e.preventDefault();
      const id = Number(reportBtn.dataset.id);
      if (Number.isFinite(id)) showReportDialog(id);
    }
  });

  async function open(paraIdx, sentIdx, anchorEl, sort = popoverSort) {
    const chapterId = getChapterId?.();
    if (!chapterId) return;
    popoverContext = { paraIdx, sentIdx, anchorEl };
    popoverSort = sort;

    try {
      const res = await annoApi(
        'GET',
        `/api/annotations?chapterId=${chapterId}&paraIdx=${paraIdx}&sentIdx=${sentIdx}&sort=${sort}`
      );
      if (!res.ok) return;
      const { annotations } = await res.json();
      if (!annotations || !annotations.length) {
        close();
        return;
      }

      const sortBtns = `
        <div class="anno-popover-header">
          <div class="anno-sort-tabs">
            <button class="anno-sort-tab ${sort === 'latest' ? 'active' : ''}" data-sort="latest">最新</button>
            <button class="anno-sort-tab ${sort === 'hot' ? 'active' : ''}" data-sort="hot">最热</button>
          </div>
        </div>
      `;

      const items = annotations
        .map((a) => {
          const content = a.content || '';
          const isLong = content.length > 100;
          const displayContent = isLong ? content.slice(0, 100) : content;
          const likeCount = a.like_count || 0;
          const liked = !!a.liked;

          return `
            <div class="anno-popover-item" data-id="${a.id}">
              <div class="anno-popover-content ${isLong ? 'truncated' : ''}" data-full="${esc(content)}">${esc(displayContent)}${
                isLong ? '<span class="anno-expand">...展开</span>' : ''
              }</div>
              <div class="anno-popover-footer">
                <div class="anno-popover-meta">
                  ${esc(a.username || '匿名')} · ${timeAgo(a.created_at)}
                  ${a.visibility === 'private' ? ' · 🔒' : ''}
                </div>
                <div class="anno-popover-actions">
                  <button class="anno-like-btn ${liked ? 'liked' : ''}" data-id="${a.id}">
                    <span class="like-icon">${liked ? '❤️' : '🤍'}</span>
                    <span class="like-count">${likeCount || ''}</span>
                  </button>
                  ${
                    a.is_mine
                      ? `<button class="btn-link anno-delete-btn" data-id="${a.id}">删除</button>`
                      : `<button class="btn-link anno-report-btn" data-id="${a.id}">举报</button>`
                  }
                </div>
              </div>
            </div>
          `;
        })
        .join('');

      popover.innerHTML = sortBtns + '<div class="anno-popover-list">' + items + '</div>';

      // 定位
      const rect = anchorEl.getBoundingClientRect();
      popover.style.display = 'block';
      const popRect = popover.getBoundingClientRect();
      let top = rect.bottom + 8;
      let left = rect.left + rect.width / 2 - popRect.width / 2;
      if (top + popRect.height > window.innerHeight) top = rect.top - popRect.height - 8;
      if (left < 8) left = 8;
      if (left + popRect.width > window.innerWidth - 8) left = window.innerWidth - popRect.width - 8;
      popover.style.top = top + 'px';
      popover.style.left = left + 'px';
    } catch {}
  }

  function close() {
    popover.style.display = 'none';
    popoverContext = null;
  }

  function isOpen() {
    return popover.style.display !== 'none';
  }

  async function toggleLike(annoId, btn) {
    const user = await getCurrentUser?.();
    if (!user) {
      alert('请先登录');
      return;
    }
    try {
      const res = await annoApi('POST', `/api/annotations/${annoId}/like`);
      if (!res.ok) return;
      const { liked } = await res.json();

      const icon = btn.querySelector('.like-icon');
      const countEl = btn.querySelector('.like-count');
      const currentCount = Number.parseInt(countEl?.textContent || '', 10) || 0;

      if (liked) {
        btn.classList.add('liked');
        if (icon) icon.textContent = '❤️';
        if (countEl) countEl.textContent = String(currentCount + 1 || 1);
      } else {
        btn.classList.remove('liked');
        if (icon) icon.textContent = '🤍';
        if (countEl) countEl.textContent = currentCount > 1 ? String(currentCount - 1) : '';
      }
    } catch {}
  }

  async function deleteAnnotation(id) {
    if (!confirm('确定删除这条批注？')) return;
    try {
      const res = await annoApi('DELETE', `/api/annotations/${id}`);
      if (res.ok) {
        close();
        await refreshUnderlines?.();
      } else {
        alert('删除失败');
      }
    } catch {
      alert('网络错误');
    }
  }

  function showReportDialog(annoId) {
    const reason = prompt('请输入举报理由（至少10个字）：');
    if (!reason) return;
    if (reason.trim().length < 10) {
      alert('举报理由至少10个字');
      return;
    }
    submitReport(annoId, reason.trim());
  }

  async function submitReport(annoId, reason) {
    try {
      const res = await annoApi('POST', '/api/reports', { annotationId: annoId, reason });
      if (res.ok) {
        alert('举报已提交，感谢反馈');
        close();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || '举报失败');
      }
    } catch {
      alert('网络错误');
    }
  }

  return { open, close, isOpen, el: popover };
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(String(dateStr || '') + 'Z').getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}天前`;
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN');
  } catch {
    return '';
  }
}

