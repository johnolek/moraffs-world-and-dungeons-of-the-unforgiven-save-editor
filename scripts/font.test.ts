import { describe, expect, it } from 'vitest';
import type opentype from 'opentype.js';
import { PIXEL, allBitmaps, buildFont, gameBitmaps, glyphPath, glyphRectangles, readBuiltFont, unicodesFor } from './font.mts';

const built = buildFont();
const committed = readBuiltFont();

/** Each glyph's outline, by name, which is what two builds of the same data have in common. The
 *  files themselves differ: TrueType stamps the time it was written into every font. */
function outlines(font: opentype.Font): Map<string, string> {
  return new Map(Object.values(font.glyphs.glyphs).map((glyph) => [glyph.name, glyph.path.toPathData(0)]));
}

/** Every character the font promises to draw: printable ASCII, with letters answering to both cases. */
const PRINTABLE = Array.from({ length: 0x7f - 0x20 }, (_, index) => String.fromCharCode(0x20 + index));

describe('the glyphs the font is built from', () => {
  it('takes the game its own and draws the rest of printable ASCII', () => {
    // Forty-six in the font file, plus the blank space the extractor adds, plus the twenty-two
    // characters of printable ASCII the game never had.
    expect(gameBitmaps().size).toBe(47);
    expect(allBitmaps().size).toBe(47 + 22);
  });

  it('gives every glyph the ten rows of eight the game font has', () => {
    for (const [char, rows] of allBitmaps()) {
      expect(rows, char).toHaveLength(10);
      for (const row of rows) expect(row, `${char} row "${row}"`).toMatch(/^[#.]{8}$/);
    }
  });

  it('leaves the left margin the game leaves on every glyph', () => {
    for (const [char, rows] of allBitmaps()) {
      for (const row of rows) expect(row[0], `${char} lights column 0`).toBe('.');
    }
  });
});

describe('glyphRectangles', () => {
  it('merges a run along a row into one rectangle', () => {
    expect(glyphRectangles(['.####...'])).toEqual([{ left: 1, right: 5, top: 0, bottom: 0 }]);
  });

  it('merges rows that light the same columns into one rectangle', () => {
    expect(glyphRectangles(['.##.....', '.##.....', '.##.....'])).toEqual([{ left: 1, right: 3, top: 0, bottom: 2 }]);
  });

  it('keeps two runs on one row apart', () => {
    expect(glyphRectangles(['.#...#..'])).toEqual([
      { left: 1, right: 2, top: 0, bottom: 0 },
      { left: 5, right: 6, top: 0, bottom: 0 },
    ]);
  });

  it('covers exactly the lit pixels, however it cuts them up', () => {
    for (const [char, rows] of allBitmaps()) {
      const lit = rows.join('').split('#').length - 1;
      const area = glyphRectangles(rows).reduce((total, rect) => total + (rect.right - rect.left) * (rect.bottom - rect.top + 1), 0);
      expect(area, char).toBe(lit);
    }
  });
});

describe('glyphPath', () => {
  it('puts the bottom row of the glyph box on the baseline', () => {
    const path = glyphPath(['........', '........', '........', '........', '........', '........', '........', '........', '........', '.##.....']);
    const ys = path.commands.flatMap((command) => ('y' in command ? [command.y] : []));
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(PIXEL);
  });

  it('draws nothing for the space', () => {
    expect(glyphPath(allBitmaps().get(' ')!).commands).toEqual([]);
  });
});

describe('unicodesFor', () => {
  it('answers a letter in both cases, the way the game uppercases what it draws', () => {
    expect(unicodesFor('A')).toEqual(['A'.charCodeAt(0), 'a'.charCodeAt(0)]);
    expect(unicodesFor('7')).toEqual(['7'.charCodeAt(0)]);
  });
});

describe('the committed moraff-bold.ttf', () => {
  it('is what building it from the glyph data now would write', () => {
    const fresh = outlines(built);
    const onDisk = outlines(committed);
    expect([...onDisk.keys()].sort()).toEqual([...fresh.keys()].sort());
    for (const [name, outline] of fresh) expect(onDisk.get(name), `${name} is out of date; run pnpm build:font`).toBe(outline);
  });

  it('draws every printable ASCII character with that character\'s own shape', () => {
    const bitmaps = allBitmaps();
    for (const char of PRINTABLE) {
      const drawn = committed.charToGlyph(char).path.toPathData(0);
      expect(drawn, `${JSON.stringify(char)} is drawn as some other character`).toBe(glyphPath(bitmaps.get(char.toUpperCase())!).toPathData(0));
    }
  });

  it('draws a lowercase letter as its capital, the way pfont uppercases what it is handed', () => {
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      expect(committed.charToGlyphIndex(letter.toLowerCase()), letter).toBe(committed.charToGlyphIndex(letter));
    }
  });

  it('is an em box as tall as the glyph box, so a size in pixels is a whole number of them', () => {
    expect(committed.unitsPerEm).toBe(10 * PIXEL);
    expect(committed.ascender).toBe(10 * PIXEL);
    expect(committed.descender).toBe(0);
  });

  it('steps every character the same width the game does', () => {
    for (const char of PRINTABLE) {
      expect(committed.charToGlyph(char).advanceWidth, char).toBe(8 * PIXEL);
    }
  });
});
