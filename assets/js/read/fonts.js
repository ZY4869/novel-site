import { state, dom } from './state.js';

export function initFonts() {
  fetch('/api/fonts')
    .then((r) => r.json())
    .then((d) => {
      const fonts = d.fonts || [];
      const container = dom.fontOptions;
      if (!container) return;

      fonts.forEach((name) => {
        const familyName = `Custom-${String(name).replace(/\\.woff2$/i, '')}`;
        const face = new FontFace(familyName, `url(/api/fonts/${encodeURIComponent(name)})`);
        face
          .load()
          .then((loaded) => {
            document.fonts.add(loaded);
            const div = document.createElement('div');
            div.className = 'font-option';
            div.dataset.font = `'${familyName}'`;
            div.style.fontFamily = familyName;
            div.textContent = String(name).replace(/\\.woff2$/i, '');
            container.appendChild(div);
            if (state.settings.fontFamily === `'${familyName}'`) div.classList.add('active');
          })
          .catch(() => {});
      });
    })
    .catch(() => {});
}

