import { api } from './api.js';
import { showMsg } from './ui.js';

export function initSiteSettings() {
  document.getElementById('save-settings-btn')?.addEventListener('click', saveSiteSettings);
}

export async function loadSiteSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    const s = data.settings || {};
    const nameEl = document.getElementById('set-site-name');
    const descEl = document.getElementById('set-site-desc');
    const footerEl = document.getElementById('set-footer');
    if (nameEl) nameEl.value = s.site_name || '';
    if (descEl) descEl.value = s.site_desc || '';
    if (footerEl) footerEl.value = s.footer_text || '';
    if (s.site_name) {
      const title = document.querySelector('.navbar h1 a');
      if (title) title.textContent = `📎 ${s.site_name}`;
    }
  } catch {}
}

export async function saveSiteSettings() {
  const settings = {
    site_name: document.getElementById('set-site-name')?.value?.trim() || '',
    site_desc: document.getElementById('set-site-desc')?.value?.trim() || '',
    footer_text: document.getElementById('set-footer')?.value?.trim() || '',
  };
  try {
    const res = await api('PUT', '/api/admin/settings', { settings });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showMsg('settings-msg', '保存成功', 'success');
    loadSiteSettings();
  } catch (e) {
    showMsg('settings-msg', e.message, 'error');
  }
}

