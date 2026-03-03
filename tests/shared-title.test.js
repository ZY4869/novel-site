import { describe, expect, it } from 'vitest';

import { filenameToTitle } from '../assets/js/shared/title.js';

describe('assets/js/shared/title.js', () => {
  it('filenameToTitle (examples)', () => {
    expect(filenameToTitle('《与神对话》1-6.epub')).toBe('与神对话');
    expect(filenameToTitle('《野性的呼唤》杰克·伦敦.epub')).toBe('野性的呼唤');
    expect(filenameToTitle('【精】秘密.epub')).toBe('秘密');
    expect(filenameToTitle('C语言程序设计_a61a6d42.epub')).toBe('C语言程序设计');
    expect(filenameToTitle('E019_围城.epub')).toBe('围城');
    expect(filenameToTitle('三体（全集）.epub')).toBe('三体');
    expect(filenameToTitle('海贼王_卷01.cbz')).toBe('海贼王_卷01');
    expect(filenameToTitle('书名 1-6.epub')).toBe('书名');
  });
});

