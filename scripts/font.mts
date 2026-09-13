// Turns the game's bold bitmap font into an ordinary web font, so the browser can set text in it
// instead of the site painting a canvas a word at a time.
//
// `scripts/build-font.mts` writes the file and `scripts/font.test.ts` holds the two apart:
// regenerate and the committed font must still say what the glyph data says now.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import fonts from '../src/lib/game/dotu-fonts.json' with { type: 'json' };
import { DRAWN_BOLD_GLYPHS } from '../src/lib/ui/drawn-glyphs.ts';

/** Where the built font is written, and the family name it carries. */
export const FONT_FILE = fileURLToPath(new URL('../src/lib/ui/moraff-bold.otf', import.meta.url));
export const FAMILY_NAME = 'Moraff Bold';

/**
 * Font units per pixel of the original glyph box.
 *
 * The em box is made exactly as tall as the glyph box, so `font-size: 30px` draws the ten-row
 * font three pixels to the pixel and nothing has to be scaled by eye. Sixty-four units a pixel
 * leaves plenty of room under the format's integer grid while keeping every edge on a whole unit,
 * which is what stops the glyphs blurring.
 */
export const PIXEL = 64;

const BOLD = fonts.bold;
const UNITS_PER_EM = BOLD.height * PIXEL;

/** A lit run of pixels: columns `left` up to but not including `right`, on rows `top` to `bottom`. */
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The game's own glyphs, as rows of `#` and `.`, the shape the drawn ones are written in. */
export function gameBitmaps(): Map<string, string[]> {
  const bitmaps = new Map<string, string[]>();
  for (const [char, words] of Object.entries(BOLD.glyphs)) {
    const rows = words.map((word) => {
      let row = '';
      for (let bit = 0; bit < BOLD.advance; bit += 1) row += (word >> bit) & 1 ? '#' : '.';
      return row;
    });
    bitmaps.set(char, rows);
  }
  return bitmaps;
}

/**
 * Every character the built font can draw: the game's forty-six, and the rest of printable ASCII
 * drawn in `drawn-glyphs.ts`.
 */
export function allBitmaps(): Map<string, string[]> {
  const bitmaps = gameBitmaps();
  for (const [char, rows] of Object.entries(DRAWN_BOLD_GLYPHS)) bitmaps.set(char, rows);
  return bitmaps;
}

/**
 * The lit pixels of a glyph as as few rectangles as possible: runs along each row, then runs of
 * rows that light exactly the same columns.
 *
 * A rectangle per pixel would draw the same shape, but every shared edge between two of them is a
 * seam the rasterizer can show as a hairline. Merging them away leaves the flat sides flat.
 */
export function glyphRectangles(rows: string[]): Rect[] {
  const runs = rows.map((row) => {
    const found: { left: number; right: number }[] = [];
    for (let column = 0; column < row.length; column += 1) {
      if (row[column] !== '#') continue;
      const last = found[found.length - 1];
      if (last && last.right === column) last.right = column + 1;
      else found.push({ left: column, right: column + 1 });
    }
    return found;
  });

  const rects: Rect[] = [];
  const taken = runs.map((row) => row.map(() => false));
  runs.forEach((row, top) => {
    row.forEach((run, index) => {
      if (taken[top][index]) return;
      let bottom = top;
      for (let next = top + 1; next < runs.length; next += 1) {
        const below = runs[next].findIndex((other) => other.left === run.left && other.right === run.right);
        if (below === -1 || taken[next][below]) break;
        taken[next][below] = true;
        bottom = next;
      }
      rects.push({ left: run.left, right: run.right, top, bottom });
    });
  });
  return rects;
}

/**
 * One glyph's outline. Row 0 is the top of the glyph box and the baseline sits at its bottom, so
 * a row's distance from the baseline counts up from the last row.
 *
 * The rectangles never overlap and none of them sits inside another — the hole in an O is simply
 * a place with no rectangle, not a contour cutting one out — so which way round each is wound
 * decides nothing, and they are all wound the same way.
 */
export function glyphPath(rows: string[]): opentype.Path {
  const path = new opentype.Path();
  for (const rect of glyphRectangles(rows)) {
    const left = rect.left * PIXEL;
    const right = rect.right * PIXEL;
    const bottom = (rows.length - 1 - rect.bottom) * PIXEL;
    const top = (rows.length - rect.top) * PIXEL;
    path.moveTo(left, bottom);
    path.lineTo(left, top);
    path.lineTo(right, top);
    path.lineTo(right, bottom);
    path.close();
  }
  return path;
}

/**
 * The code points a glyph answers to. The game's `pfont` uppercases whatever it is handed, so a
 * letter answers to its lowercase as well and the font draws "Moraff" the way the game would.
 */
export function unicodesFor(char: string): number[] {
  const upper = char.charCodeAt(0);
  if (char < 'A' || char > 'Z') return [upper];
  return [upper, char.toLowerCase().charCodeAt(0)];
}

/** A name for the glyph table; the format wants one per glyph and only cares that they differ. */
function glyphName(char: string): string {
  return char === ' ' ? 'space' : `uni${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * The whole font.
 *
 * `.notdef` is drawn as a hyphen rather than the usual empty box, because that is what the game
 * shows for a character it has no glyph for: its lookup table sends anything it does not know to
 * index 0, which is `-`.
 */
export function buildFont(): opentype.Font {
  const bitmaps = allBitmaps();
  const glyphs = [
    new opentype.Glyph({
      name: '.notdef',
      unicode: 0,
      advanceWidth: BOLD.advance * PIXEL,
      path: glyphPath(bitmaps.get('-')!),
    }),
  ];
  // In code point order: the cmap table is built as a list of ranges in ascending order, and
  // glyphs handed over in any other order come out mapped to each other's characters.
  for (const [char, rows] of [...bitmaps].sort(([a], [b]) => a.charCodeAt(0) - b.charCodeAt(0))) {
    glyphs.push(
      new opentype.Glyph({
        name: glyphName(char),
        unicodes: unicodesFor(char),
        advanceWidth: BOLD.advance * PIXEL,
        path: glyphPath(rows),
      }),
    );
  }
  return new opentype.Font({
    familyName: FAMILY_NAME,
    styleName: 'Regular',
    unitsPerEm: UNITS_PER_EM,
    ascender: UNITS_PER_EM,
    descender: 0,
    glyphs,
  });
}

/** The committed font, parsed back. */
export function readBuiltFont(): opentype.Font {
  const file = readFileSync(FONT_FILE);
  return opentype.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
}
