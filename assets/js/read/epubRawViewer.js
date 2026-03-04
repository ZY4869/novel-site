import { normalizePath, resolveRelativePath, stripFragmentAndQuery } from '../shared/epubUrl.js';

function dirOf(path) {
  const p = String(path || '');
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(0, i + 1) : '';
}

function hasScheme(u) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(String(u || ''));
}

function shouldSkipUrl(u) {
  const s = String(u || '').trim();
  if (!s) return true;
  if (s.startsWith('#')) return true;
  if (s.startsWith('//')) return true;
  return hasScheme(s);
}

function guessMime(path) {
  const p = String(path || '').toLowerCase();
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.gif')) return 'image/gif';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.woff2')) return 'font/woff2';
  if (p.endsWith('.woff')) return 'font/woff';
  if (p.endsWith('.ttf')) return 'font/ttf';
  if (p.endsWith('.otf')) return 'font/otf';
  if (p.endsWith('.css')) return 'text/css';
  if (p.endsWith('.xhtml') || p.endsWith('.html') || p.endsWith('.htm')) return 'text/html';
  return 'application/octet-stream';
}

function buildThemeStyle(colors) {
  const bg = String(colors?.bg || '').trim() || '#ffffff';
  const text = String(colors?.text || '').trim() || '#000000';
  return `
    html, body { background: ${bg} !important; color: ${text} !important; margin: 0; padding: 0; }
    body, p, div, span, li, td, th, h1, h2, h3, h4, h5, h6, blockquote { color: ${text} !important; }
    img, svg, video { max-width: 100% !important; height: auto !important; }
    a { color: inherit !important; text-decoration: underline; }
  `.trim();
}

function normalizePlainText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function removeDangerousNodes(doc) {
  doc.querySelectorAll('script, iframe, object, embed, base, meta[http-equiv]').forEach((n) => n.remove());
}

function stripDangerousAttrs(doc) {
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of Array.from(el.attributes || [])) {
      const name = String(a.name || '');
      if (/^on/i.test(name)) el.removeAttribute(name);
    }
    const href = el.getAttribute?.('href');
    if (typeof href === 'string' && href.trim().toLowerCase().startsWith('javascript:')) {
      el.setAttribute('href', '#');
    }
  });
}

async function rewriteCssText(cssText, baseDir, getBlobUrl) {
  const css = String(cssText || '');
  const urlRe = /url\(\s*(?:'([^']*)'|"([^"]*)"|([^)\s]+))\s*\)/gi;
  const importRe = /@import\s+(["'])([^"']+)\1\s*;/gi;

  const candidates = new Set();
  css.replace(urlRe, (_, a, b, c) => {
    const v = String(a ?? b ?? c ?? '').trim();
    if (!v || shouldSkipUrl(v)) return '';
    candidates.add(v);
    return '';
  });
  css.replace(importRe, (_, __, v) => {
    const vv = String(v || '').trim();
    if (!vv || shouldSkipUrl(vv)) return '';
    candidates.add(vv);
    return '';
  });

  const map = new Map();
  for (const raw of candidates) {
    const resolved = resolveRelativePath(baseDir, raw);
    if (!resolved || shouldSkipUrl(resolved)) continue;
    const url = await getBlobUrl(resolved);
    if (url) map.set(raw, url);
  }

  let out = css;
  out = out.replace(urlRe, (m, a, b, c) => {
    const raw = String(a ?? b ?? c ?? '').trim();
    const rep = map.get(raw);
    if (!rep) return m;
    return `url("${rep}")`;
  });
  out = out.replace(importRe, (m, quote, raw) => {
    const rep = map.get(String(raw || '').trim());
    if (!rep) return m;
    return `@import url(${quote}${rep}${quote});`;
  });
  return out;
}

export async function createEpubRawViewer(arrayBuffer, filename, JSZip) {
  if (!JSZip?.loadAsync) throw new Error('缺少 JSZip，无法解析 EPUB');
  const zip = await JSZip.loadAsync(arrayBuffer);

  const fileIndex = new Map();
  for (const k of Object.keys(zip.files || {})) fileIndex.set(String(k).toLowerCase(), k);

  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) throw new Error('无效的 EPUB：缺少 META-INF/container.xml');
  const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
  const rootfileEl = containerDoc.querySelector('rootfile[full-path]');
  if (!rootfileEl) throw new Error('无效的 EPUB：找不到 OPF 路径');

  const opfPathRaw = rootfileEl.getAttribute('full-path') || '';
  const opfPath = normalizePath(opfPathRaw);
  const opfDir = dirOf(opfPath);
  const opfXml = opfPath ? await zip.file(opfPath)?.async('text') : null;
  if (!opfXml) throw new Error(`无效的 EPUB：找不到 OPF 文件 ${opfPath || ''}`.trim());
  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');

  const manifestById = new Map();
  const mediaTypeByPathLower = new Map();
  opfDoc.querySelectorAll('manifest > item[id][href]').forEach((it) => {
    const id = it.getAttribute('id');
    const href = it.getAttribute('href');
    if (!id || !href) return;
    const mediaType = String(it.getAttribute('media-type') || '');
    const fullPath = normalizePath(opfDir + stripFragmentAndQuery(href));
    manifestById.set(id, { href, mediaType, fullPath });
    mediaTypeByPathLower.set(fullPath.toLowerCase(), mediaType);
  });

  const spineIds = Array.from(opfDoc.querySelectorAll('spine > itemref[idref]')).map((it) => it.getAttribute('idref'));
  let spinePaths = spineIds
    .map((idref) => manifestById.get(idref)?.fullPath || '')
    .filter(Boolean)
    .filter((p) => {
      const mt = String(mediaTypeByPathLower.get(String(p).toLowerCase()) || '').toLowerCase();
      return mt.includes('html') || /\.(x?html?)$/i.test(p);
    });
  if (spinePaths.length === 0) {
    spinePaths = spineIds.map((idref) => manifestById.get(idref)?.fullPath || '').filter(Boolean);
  }
  if (spinePaths.length === 0) throw new Error('未解析到章节内容');

  const textCache = new Map();
  const blobUrlByPath = new Map();
  const revokeUrls = new Set();

  function resolveActualPath(p) {
    const norm = normalizePath(p);
    if (zip.file(norm)) return norm;
    const alt = fileIndex.get(norm.toLowerCase());
    if (alt && zip.file(alt)) return alt;
    return null;
  }

  async function readText(path) {
    const actual = resolveActualPath(path);
    if (!actual) return null;
    if (textCache.has(actual)) return textCache.get(actual);
    const txt = await zip.file(actual)?.async('text');
    if (typeof txt === 'string') textCache.set(actual, txt);
    return txt ?? null;
  }

  async function getBlobUrl(path) {
    const actual = resolveActualPath(path);
    if (!actual) return null;
    if (blobUrlByPath.has(actual)) return blobUrlByPath.get(actual);
    const buf = await zip.file(actual)?.async('arraybuffer');
    if (!buf) return null;
    const mt = String(mediaTypeByPathLower.get(actual.toLowerCase()) || '').trim() || guessMime(actual);
    const url = URL.createObjectURL(new Blob([buf], { type: mt }));
    blobUrlByPath.set(actual, url);
    revokeUrls.add(url);
    return url;
  }

  async function extractTitleForPath(path, fallbackTitle) {
    const html = await readText(path);
    if (!html) return fallbackTitle;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const h1 = doc.querySelector('h1')?.textContent?.trim();
    const t = doc.querySelector('title')?.textContent?.trim();
    return h1 || t || fallbackTitle;
  }

  const spineItems = [];
  for (let i = 0; i < spinePaths.length; i++) {
    const p = spinePaths[i];
    const title = await extractTitleForPath(p, `章节 ${i + 1}`);
    spineItems.push({ index: i, path: p, title });
  }

  async function buildChapter(index, colors) {
    const item = spineItems[index];
    if (!item) throw new Error('章节不存在');

    const chapterPath = item.path;
    const chapterDir = dirOf(chapterPath);
    const xhtml = await readText(chapterPath);
    if (!xhtml) throw new Error('章节内容读取失败');

    const doc = new DOMParser().parseFromString(xhtml, 'text/html');
    removeDangerousNodes(doc);
    stripDangerousAttrs(doc);

    // Inline style attributes (may include background images, etc.)
    const styleAttrEls = Array.from(doc.querySelectorAll('[style]'));
    for (const el of styleAttrEls) {
      const raw = el.getAttribute('style');
      if (!raw || !/url\(/i.test(raw)) continue;
      el.setAttribute('style', await rewriteCssText(raw, chapterDir, getBlobUrl));
    }

    // CSS: collect then remove from doc (avoid unresolved relative refs inside body)
    const cssBlocks = [];
    const linkHrefs = Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]'))
      .map((l) => l.getAttribute('href'))
      .filter(Boolean);
    doc.querySelectorAll('link[rel~="stylesheet"]').forEach((n) => n.remove());

    const styleEls = Array.from(doc.querySelectorAll('style'));
    for (const s of styleEls) {
      cssBlocks.push({ baseDir: chapterDir, text: s.textContent || '' });
      s.remove();
    }

    for (const hrefRaw of linkHrefs) {
      if (shouldSkipUrl(hrefRaw)) continue;
      const cssPath = resolveRelativePath(chapterDir, hrefRaw);
      if (!cssPath || shouldSkipUrl(cssPath)) continue;
      const cssText = await readText(cssPath);
      if (cssText) cssBlocks.push({ baseDir: dirOf(cssPath), text: cssText });
    }

    const rewrittenCss = [];
    for (const b of cssBlocks) {
      rewrittenCss.push(await rewriteCssText(b.text, b.baseDir, getBlobUrl));
    }

    // HTML resources
    const urlAttrs = [
      ['img', 'src'],
      ['source', 'src'],
      ['video', 'poster'],
    ];
    for (const [sel, attr] of urlAttrs) {
      doc.querySelectorAll(`${sel}[${attr}]`).forEach((el) => {
        const raw = el.getAttribute(attr);
        if (shouldSkipUrl(raw)) return;
        const resolved = resolveRelativePath(chapterDir, raw);
        if (!resolved || shouldSkipUrl(resolved)) return;
        el.setAttribute(attr, `__EPUB_BLOB__:${resolved}`);
      });
    }

    doc.querySelectorAll('svg image').forEach((el) => {
      const raw = el.getAttribute('href') || el.getAttribute('xlink:href');
      if (shouldSkipUrl(raw)) return;
      const resolved = resolveRelativePath(chapterDir, raw);
      if (!resolved || shouldSkipUrl(resolved)) return;
      el.setAttribute('href', `__EPUB_BLOB__:${resolved}`);
      el.removeAttribute('xlink:href');
    });

    // srcset fallback (if src missing)
    doc.querySelectorAll('img:not([src])[srcset]').forEach((el) => {
      const srcset = String(el.getAttribute('srcset') || '');
      const first = srcset.split(',')[0]?.trim()?.split(/\s+/)[0];
      if (!first || shouldSkipUrl(first)) return;
      const resolved = resolveRelativePath(chapterDir, first);
      if (!resolved || shouldSkipUrl(resolved)) return;
      el.setAttribute('src', `__EPUB_BLOB__:${resolved}`);
    });

    // Replace placeholders with blob URLs (async, but keeps DOM operations sync-safe)
    const pending = Array.from(doc.querySelectorAll('*')).filter((el) => {
      for (const a of Array.from(el.attributes || [])) {
        if (String(a.value || '').startsWith('__EPUB_BLOB__:')) return true;
      }
      return false;
    });
    for (const el of pending) {
      for (const a of Array.from(el.attributes || [])) {
        const v = String(a.value || '');
        if (!v.startsWith('__EPUB_BLOB__:')) continue;
        const path = v.slice('__EPUB_BLOB__:'.length);
        const url = await getBlobUrl(path);
        if (url) el.setAttribute(a.name, url);
        else el.removeAttribute(a.name);
      }
    }

    const title = item.title || `章节 ${index + 1}`;
    const plainText = normalizePlainText(doc.body?.textContent || '');

    const bodyClass = doc.body?.getAttribute('class') || '';
    const bodyDir = doc.body?.getAttribute('dir') || '';
    const bodyLang = doc.body?.getAttribute('lang') || doc.documentElement?.getAttribute?.('lang') || '';

    const themeCss = buildThemeStyle(colors);
    const styles = [
      `<style id="viewer-theme-style">${themeCss}</style>`,
      ...rewrittenCss.map((t) => `<style>${t}</style>`),
    ].join('\n');

    const srcdoc = `<!DOCTYPE html>
<html${bodyLang ? ` lang="${bodyLang}"` : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  ${styles}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}${bodyDir ? ` dir="${bodyDir}"` : ''}>
${doc.body?.innerHTML || ''}
</body>
</html>`;

    return { srcdoc, title, plainText };
  }

  function resizeIframeToContent(iframe) {
    try {
      const doc = iframe?.contentDocument;
      if (!doc) return;
      const h = Math.max(180, Math.ceil(doc.documentElement?.scrollHeight || doc.body?.scrollHeight || 0));
      iframe.style.height = `${h}px`;
    } catch {}
  }

  function applyThemeToIframe(iframe, colors) {
    try {
      const doc = iframe?.contentDocument;
      const style = doc?.getElementById?.('viewer-theme-style');
      if (!style) return;
      style.textContent = buildThemeStyle(colors);
    } catch {}
  }

  function interceptIframeLinks(iframe) {
    try {
      const doc = iframe?.contentDocument;
      if (!doc) return;
      doc.addEventListener(
        'click',
        (e) => {
          const a = e.target?.closest?.('a[href]');
          if (!a) return;
          const href = String(a.getAttribute('href') || '').trim();
          if (!href || href.startsWith('#')) return;
          if (/^https?:\/\//i.test(href) || href.startsWith('//')) {
            e.preventDefault();
            window.open(href, '_blank', 'noopener');
            return;
          }
          if (hasScheme(href)) {
            e.preventDefault();
            return;
          }
          // block internal file navigation for now
          e.preventDefault();
        },
        true
      );
    } catch {}
  }

  async function renderSpine(index, { colors } = {}) {
    const { srcdoc, title, plainText } = await buildChapter(index, colors);
    const iframe = document.createElement('iframe');
    iframe.className = 'source-epub-iframe';
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('scrolling', 'no');
    iframe.srcdoc = srcdoc;

    iframe.addEventListener(
      'load',
      () => {
        interceptIframeLinks(iframe);
        resizeIframeToContent(iframe);
        try {
          const doc = iframe.contentDocument;
          doc?.querySelectorAll?.('img').forEach((img) => {
            img.addEventListener('load', () => resizeIframeToContent(iframe));
            img.addEventListener('error', () => resizeIframeToContent(iframe));
          });
        } catch {}
        requestAnimationFrame(() => requestAnimationFrame(() => resizeIframeToContent(iframe)));
      },
      { once: true }
    );

    return { iframe, title, plainText };
  }

  function dispose() {
    for (const url of revokeUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
    revokeUrls.clear();
    blobUrlByPath.clear();
    textCache.clear();
  }

  return {
    filename: String(filename || 'book.epub'),
    spineItems,
    renderSpine,
    applyThemeToIframe,
    resizeIframeToContent,
    dispose,
  };
}
