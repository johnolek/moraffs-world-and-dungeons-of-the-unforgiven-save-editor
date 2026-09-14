import { describe, expect, it } from 'vitest';
import { glyphRows, pixelFont, textWidth } from './pixel-font';

const bold = pixelFont('bold');

describe('pixelFont', () => {
  it('carries the three game fonts with their sizes', () => {
    expect(bold.height).toBe(10);
    expect(bold.advance).toBe(8);
    expect(pixelFont('small').height).toBe(5);
    expect(pixelFont('tall').height).toBe(13);
  });

  /**
   * The two faces the game itself still draws at 1024 by 768, which are the second and third of
   * 320x200.fnt's three sizes. Row 0 of the glyph box tables at DS:4d22 and DS:4d5e gives that
   * screen 4 by 6, 6 by 8 and 10 by 14 for font indices 0, 1 and 2, and these are the last two
   * of those, whole rather than trimmed the way `small` is.
   */
  it('carries both faces the game draws as glyphs at 1024 by 768', () => {
    const spells = pixelFont('small_spells');
    expect([spells.height, spells.advance]).toEqual([8, 6]);
    const menu = pixelFont('menu');
    expect([menu.height, menu.advance]).toEqual([14, 10]);
    for (const rows of Object.values(spells.glyphs)) {
      expect(rows).toHaveLength(8);
      for (const row of rows) expect(row).toBeLessThan(1 << 6);
    }
  });

  it('has one row word per pixel row for every glyph', () => {
    for (const rows of Object.values(bold.glyphs)) expect(rows).toHaveLength(bold.height);
  });
});

describe('glyphRows', () => {
  it('reads the A of the bold font as the game draws it', () => {
    const picture = glyphRows(bold, 'A').map((row) => [...Array(8).keys()].map((bit) => ((row >> bit) & 1 ? '#' : '.')).join(''));
    expect(picture).toEqual(['....#...', '...###..', '..##.##.', '.##...##', '.##...##', '.#######', '.#######', '.##...##', '.##...##', '.##...##']);
  });

  it('reads the A of the condensed spell menu as the game draws it', () => {
    const spells = pixelFont('small_spells');
    const picture = glyphRows(spells, 'A').map((row) => [...Array(6).keys()].map((bit) => ((row >> bit) & 1 ? '#' : '.')).join(''));
    expect(picture).toEqual(['...#..', '..#.#.', '.#...#', '.#####', '.#...#', '.#...#', '.#...#', '......']);
  });

  it('is uppercase only and falls back to a question mark', () => {
    expect(glyphRows(bold, 'a')).toBe(glyphRows(bold, 'A'));
    expect(glyphRows(bold, '#')).toBe(glyphRows(bold, '?'));
    expect(glyphRows(bold, ' ')).toEqual(Array(10).fill(0));
  });
});

describe('textWidth', () => {
  it('is the advance per character', () => {
    expect(textWidth(bold, 'MORAFF TOOLS')).toBe(96);
  });
});
