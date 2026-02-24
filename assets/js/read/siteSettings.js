import { dom } from './state.js';

export function initSiteSettings() {
  fetch('/api/settings')
    .then((r) => r.json())
    .then((d) => {
      const s = d.settings || {};
      if (s.site_name && dom.navbarTitle) dom.navbarTitle.textContent = `📎 ${s.site_name}`;
    })
    .catch(() => {});
}

