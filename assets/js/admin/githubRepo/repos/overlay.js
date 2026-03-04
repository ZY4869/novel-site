import { createGitHubRepo, updateGitHubRepo } from './api.js';
import { inferBasePathHints, parseGitHubRepoInput } from '../parseUrl.js';

let onSaved = null;

export function initGitHubRepoEditOverlay({ onSaved: onSavedCb } = {}) {
  onSaved = typeof onSavedCb === 'function' ? onSavedCb : null;

  document.getElementById('close-gh-repo-edit')?.addEventListener('click', () => closeGitHubRepoEditOverlay());
  document.getElementById('gh-repo-edit-cancel-btn')?.addEventListener('click', () => closeGitHubRepoEditOverlay());
  document.getElementById('gh-repo-edit-parse-btn')?.addEventListener('click', () => parseRepoUrlIntoOverlay());
  document.getElementById('gh-repo-edit-url')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    parseRepoUrlIntoOverlay();
  });
  document.getElementById('gh-repo-edit-save-btn')?.addEventListener('click', () => saveOverlay());
}

export function openGitHubRepoEditOverlay(repo) {
  const overlay = document.getElementById('gh-repo-edit-overlay');
  if (!overlay) return;
  overlay.classList.add('active');

  setOverlayMsg('');

  setVal('gh-repo-edit-id', repo?.id ? String(repo.id) : '');
  setVal('gh-repo-edit-url', '');
  setVal('gh-repo-edit-name', repo?.name || '');
  setVal('gh-repo-edit-owner', repo?.owner || '');
  setVal('gh-repo-edit-repo', repo?.repo || '');
  setVal('gh-repo-edit-branch', repo?.branch || 'main');
  setVal('gh-repo-edit-novels-path', repo?.novelsPath || 'novels/');
  setVal('gh-repo-edit-comics-path', repo?.comicsPath || 'comics/');
  const enabledEl = document.getElementById('gh-repo-edit-enabled');
  if (enabledEl) enabledEl.checked = repo ? !!repo.enabled : true;
}

export function closeGitHubRepoEditOverlay() {
  const overlay = document.getElementById('gh-repo-edit-overlay');
  overlay?.classList.remove('active');
}

function setOverlayMsg(text, type = '') {
  const el = document.getElementById('gh-repo-edit-msg');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = type === 'error' ? 'var(--danger,#e74c3c)' : 'var(--text-light)';
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = String(value ?? '');
}

function getVal(id) {
  const el = document.getElementById(id);
  return String(el?.value ?? '').trim();
}

function setValIfEmpty(id, value) {
  const el = document.getElementById(id);
  if (el && !String(el.value || '').trim()) el.value = String(value ?? '');
}

function parseRepoUrlIntoOverlay() {
  const s = getVal('gh-repo-edit-url');
  if (!s) return setOverlayMsg('请粘贴 GitHub 仓库链接', 'error');

  try {
    const info = parseGitHubRepoInput(s);

    setVal('gh-repo-edit-owner', info.owner);
    setVal('gh-repo-edit-repo', info.repo);
    if (info.branch) setVal('gh-repo-edit-branch', info.branch);

    const nameEl = document.getElementById('gh-repo-edit-name');
    if (nameEl && !String(nameEl.value || '').trim()) {
      nameEl.value = `${info.owner}/${info.repo}`;
    }

    const hint = inferBasePathHints(info.subpath);
    if (hint.novelsPath) setValIfEmpty('gh-repo-edit-novels-path', hint.novelsPath);
    if (hint.comicsPath) setValIfEmpty('gh-repo-edit-comics-path', hint.comicsPath);

    const notes = [`已解析：${info.owner}/${info.repo}`, info.branch ? `分支：${info.branch}` : null, hint.note || null]
      .filter(Boolean)
      .join('；');
    setOverlayMsg(notes, '');
  } catch (e) {
    setOverlayMsg(`解析失败：${e.message || '未知错误'}`, 'error');
  }
}

async function saveOverlay() {
  const id = getVal('gh-repo-edit-id');
  const name = getVal('gh-repo-edit-name');
  const owner = getVal('gh-repo-edit-owner');
  const repo = getVal('gh-repo-edit-repo');
  const branch = getVal('gh-repo-edit-branch') || 'main';
  const novelsPath = getVal('gh-repo-edit-novels-path') || 'novels/';
  const comicsPath = getVal('gh-repo-edit-comics-path') || 'comics/';
  const enabled = !!document.getElementById('gh-repo-edit-enabled')?.checked;

  if (!name) return setOverlayMsg('请填写显示名', 'error');
  if (!owner || !repo) return setOverlayMsg('请填写 owner/repo', 'error');
  if (!novelsPath || !comicsPath) return setOverlayMsg('请填写目录', 'error');

  try {
    setOverlayMsg('保存中...');
    if (id) {
      await updateGitHubRepo({ id, name, owner, repo, branch, novelsPath, comicsPath, enabled });
    } else {
      await createGitHubRepo({ name, owner, repo, branch, novelsPath, comicsPath, enabled });
    }
    closeGitHubRepoEditOverlay();
    if (onSaved) await onSaved();
  } catch (err) {
    setOverlayMsg(err.message || '保存失败', 'error');
  }
}

