import { qs } from '../../shared/dom.js';

export function loadSiteSettings() {
  fetch('/api/settings')
    .then((r) => r.json())
    .then((d) => {
      const s = d.settings || {};
      if (s.site_name) {
        document.title = s.site_name;
        qs('.navbar h1 a').textContent = '📚 ' + s.site_name;
        qs('meta[property="og:title"]').content = s.site_name;
      }
      if (s.site_desc) {
        qs('meta[name="description"]').content = s.site_desc;
        qs('meta[property="og:description"]').content = s.site_desc;
      }
    })
    .catch(() => {});
}

