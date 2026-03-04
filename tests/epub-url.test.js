import { describe, expect, it } from 'vitest';

import { extractCssUrlRefs, normalizePath, resolveRelativePath, stripFragmentAndQuery } from '../assets/js/shared/epubUrl.js';

describe('assets/js/shared/epubUrl.js', () => {
  it('stripFragmentAndQuery removes # and ?', () => {
    expect(stripFragmentAndQuery('a/b.xhtml#frag')).toBe('a/b.xhtml');
    expect(stripFragmentAndQuery('a/b.xhtml?x=1')).toBe('a/b.xhtml');
    expect(stripFragmentAndQuery('a/b.xhtml?x=1#y')).toBe('a/b.xhtml');
  });

  it('normalizePath resolves . and .. and extra slashes', () => {
    expect(normalizePath('a/../b/c')).toBe('b/c');
    expect(normalizePath('./a//b')).toBe('a/b');
    expect(normalizePath('../a')).toBe('a');
  });

  it('resolveRelativePath joins baseDir and decodes', () => {
    expect(resolveRelativePath('OEBPS/Text/', '../Images/a%20b.png#x')).toBe('OEBPS/Images/a b.png');
    expect(resolveRelativePath('OEBPS/Text/', 'images/a.png?ver=1')).toBe('OEBPS/Text/images/a.png');
    expect(resolveRelativePath('OEBPS/Text/', '/Images/a.png')).toBe('Images/a.png');
  });

  it('extractCssUrlRefs finds url(...) values', () => {
    const css = `
      .a{background:url("../Images/a.png")}
      .b{background:url( '../Images/b.png' )}
      .c{background:url(\"../Images/c.png\")}
      .d{mask-image:url(data:image/svg+xml;base64,xxx)}
    `;
    expect(extractCssUrlRefs(css)).toEqual(['../Images/a.png', '../Images/b.png', '../Images/c.png', 'data:image/svg+xml;base64,xxx']);
  });
});

