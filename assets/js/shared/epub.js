export async function parseEpubArrayBuffer(arrayBuffer, filename, JSZip) {
  if (!JSZip?.loadAsync) throw new Error('缺少 JSZip，无法解析 EPUB');
  const zip = await JSZip.loadAsync(arrayBuffer);
  return await parseEpubZip(zip, filename);
}

async function parseEpubZip(zip, filename) {
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) throw new Error('无效的 EPUB：缺少 META-INF/container.xml');
  const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
  const rootfileEl = containerDoc.querySelector('rootfile[full-path]');
  if (!rootfileEl) throw new Error('无效的 EPUB：找不到 OPF 路径');

  const opfPath = rootfileEl.getAttribute('full-path');
  const opfDir = opfPath && opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfXml = opfPath ? await zip.file(opfPath)?.async('text') : null;
  if (!opfXml) throw new Error(`无效的 EPUB：找不到 OPF 文件 ${opfPath || ''}`.trim());
  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');

  const title = getMeta(opfDoc, 'title') || getMeta(opfDoc, 'dc:title') || String(filename || '').replace(/\.epub$/i, '');
  const author = getMeta(opfDoc, 'creator') || getMeta(opfDoc, 'dc:creator') || '';
  const description = getMeta(opfDoc, 'description') || getMeta(opfDoc, 'dc:description') || '';

  const manifest = new Map();
  opfDoc.querySelectorAll('manifest > item[id][href]').forEach((it) => {
    const id = it.getAttribute('id');
    const href = it.getAttribute('href');
    if (!id || !href) return;
    manifest.set(id, {
      href,
      mediaType: it.getAttribute('media-type') || '',
      properties: it.getAttribute('properties') || '',
    });
  });

  const spineIds = Array.from(opfDoc.querySelectorAll('spine > itemref[idref]')).map((it) => it.getAttribute('idref'));

  const chapters = [];
  for (const idref of spineIds) {
    const item = manifest.get(idref);
    const href = item?.href;
    if (!href) continue;
    const fullPath = normalizePath(opfDir + stripFragment(href));
    const txt = await zip.file(fullPath)?.async('text');
    if (!txt) continue;
    const parsed = extractChapterText(txt);
    if (!parsed.content) continue;
    chapters.push({ title: parsed.title || `章节 ${chapters.length + 1}`, content: parsed.content, checked: true });
  }

  if (chapters.length === 0) throw new Error('未解析到章节内容');

  const cover = await extractEpubCover(zip, opfDoc, opfDir, manifest);
  return { meta: { title, author, description }, chapters, cover };
}

function extractChapterText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = doc.querySelector('h1')?.textContent?.trim() || doc.querySelector('title')?.textContent?.trim() || '';
  const bodyText = doc.body?.textContent || '';
  const content = bodyText.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, content };
}

function safeQuerySelector(doc, selector) {
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}

function getMeta(doc, tag) {
  const safeTag = String(tag || '').replace(/:/g, '\\:');
  const el =
    safeQuerySelector(doc, `metadata ${safeTag}`) ||
    safeQuerySelector(doc, `metadata ${String(tag || '').replace('dc:', '')}`) ||
    doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', String(tag || '').replace('dc:', ''))?.[0];
  return el ? String(el.textContent || '').trim() : '';
}

function stripFragment(href) {
  return String(href || '').split('#')[0].split('?')[0];
}

async function extractEpubCover(zip, opfDoc, opfDir, manifest) {
  try {
    // EPUB2: <meta name="cover" content="cover-image-id" />
    const coverId = safeQuerySelector(opfDoc, 'metadata meta[name="cover"]')?.getAttribute('content');
    if (coverId && manifest.get(coverId)?.href) {
      return await loadCoverFromManifest(zip, opfDir, manifest.get(coverId));
    }

    // EPUB3: <item properties="cover-image" ... />
    for (const item of manifest.values()) {
      const props = String(item?.properties || '');
      if (props.split(/\s+/).includes('cover-image')) {
        const cover = await loadCoverFromManifest(zip, opfDir, item);
        if (cover) return cover;
      }
    }

    // fallback: filename/path contains "cover" and is image/*
    for (const item of manifest.values()) {
      const href = String(item?.href || '');
      const mt = String(item?.mediaType || '').toLowerCase();
      if (mt.startsWith('image/') && /cover/i.test(href)) {
        const cover = await loadCoverFromManifest(zip, opfDir, item);
        if (cover) return cover;
      }
    }
  } catch {}
  return null;
}

async function loadCoverFromManifest(zip, opfDir, item) {
  const href = item?.href;
  if (!href) return null;
  const fullPath = normalizePath(opfDir + stripFragment(href));
  const buf = await zip.file(fullPath)?.async('arraybuffer');
  if (!buf) return null;

  const filename = stripFragment(href).split('/').pop() || 'cover';
  const contentType = (item?.mediaType || guessImageTypeFromHref(filename) || 'image/jpeg').toLowerCase();
  return {
    blob: new Blob([buf], { type: contentType }),
    contentType,
    filename,
  };
}

function guessImageTypeFromHref(href) {
  const name = String(href || '').toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}

function normalizePath(p) {
  const parts = [];
  String(p || '').split('/').forEach((seg) => {
    if (!seg || seg === '.') return;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  });
  return parts.join('/');
}
