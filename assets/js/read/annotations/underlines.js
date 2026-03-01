import { annoApi } from './api.js';
import { annotationOpacity, splitSentences } from './text.js';

function getTextNodes(el) {
  const nodes = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  return nodes;
}

function findTextInParagraph(p, targetText, sentIdx) {
  const fullText = p.textContent;
  const sentences = splitSentences(fullText);
  let start = 0;
  for (let i = 0; i < sentences.length && i < sentIdx; i++) {
    const idx = fullText.indexOf(sentences[i], start);
    if (idx >= 0) start = idx + sentences[i].length;
  }
  const exactStart = fullText.indexOf(targetText, start);
  if (exactStart < 0) return null;
  const end = exactStart + targetText.length;

  const textNodes = getTextNodes(p);
  let charCount = 0;
  let startNode = null;
  let startOffset = 0;
  let endNode = null;
  let endOffset = 0;
  for (const tn of textNodes) {
    const tnEnd = charCount + tn.length;
    if (!startNode && exactStart < tnEnd) {
      startNode = tn;
      startOffset = exactStart - charCount;
    }
    if (end <= tnEnd) {
      endNode = tn;
      endOffset = end - charCount;
      break;
    }
    charCount = tnEnd;
  }
  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function highlightRange(range, span) {
  if (range.startContainer === range.endContainer && range.startContainer.nodeType === 3) {
    range.surroundContents(span);
    return span;
  }
  try {
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
    return span;
  } catch {
    return null;
  }
}

export function clearAnnotationUnderlines(root = document) {
  root.querySelectorAll('.annotated').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  root.querySelectorAll('.reader-content p').forEach((p) => p.normalize());
}

export async function renderAnnotationUnderlines(chapterId) {
  if (!chapterId) return 0;
  try {
    const res = await annoApi('GET', `/api/annotations/summary?chapterId=${chapterId}`);
    if (!res.ok) return 0;
    const { sentences } = await res.json();
    if (!sentences || !sentences.length) return 0;

    const paraMap = {};
    document.querySelectorAll('.reader-content p[data-para-idx]').forEach((p) => {
      paraMap[p.dataset.paraIdx] = p;
    });

    let applied = 0;
    for (const s of sentences) {
      const p = paraMap[String(s.para_idx)];
      if (!p) continue;
      const sents = splitSentences(p.textContent);
      const target = sents[s.sent_idx];
      if (!target) continue;

      const range = findTextInParagraph(p, target, s.sent_idx);
      if (!range) continue;

      const span = document.createElement('span');
      span.className = 'annotated';
      span.dataset.paraIdx = String(s.para_idx);
      span.dataset.sentIdx = String(s.sent_idx);

      const hasPublic = (s.public_count || 0) > 0;
      const hasPrivate = (s.private_count || 0) > 0;
      if (hasPublic && hasPrivate) span.classList.add('has-both');
      else if (hasPublic) span.classList.add('has-public');
      else span.classList.add('private-only');

      const totalVisible = (s.public_count || 0) + (s.has_mine ? 1 : 0);
      span.style.setProperty('--anno-opacity', annotationOpacity(totalVisible));

      if (highlightRange(range, span)) applied++;
    }
    return applied;
  } catch {
    return 0;
  }
}

