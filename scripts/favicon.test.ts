import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawFavicon, encodePng, FAVICON_SIZE } from './favicon.mts';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

describe('the site icon', () => {
  it('is the Ghoul, out of the picture file of the section he stands in', () => {
    const { source } = drawFavicon(root);
    expect(source).toEqual({ file: 'ufmon17.pic', image: 3, monster: 'Ghoul' });
  });

  it('is his head on transparency, with nothing of him below the shoulders', () => {
    const { pixels } = drawFavicon(root);
    const opaqueRows = [];
    for (let y = 0; y < FAVICON_SIZE; y++) {
      let drawn = 0;
      for (let x = 0; x < FAVICON_SIZE; x++) if (pixels[(y * FAVICON_SIZE + x) * 4 + 3] > 0) drawn += 1;
      if (drawn > 0) opaqueRows.push(y);
    }
    expect(opaqueRows[0]).toBe(9);
    expect(opaqueRows[opaqueRows.length - 1]).toBe(63);
  });

  it('is what src/favicon.png holds, so the committed icon cannot drift from the picture', () => {
    const { pixels } = drawFavicon(root);
    const written = encodePng(FAVICON_SIZE, pixels);
    expect(written.equals(readFileSync(`${root}/src/favicon.png`))).toBe(true);
  });
});
