// Writes src/lib/ui/moraff-bold.otf, the game's bold bitmap font as a font the browser can use.
// `font.mts` beside this does the work, and `font.test.ts` fails if the committed file stops
// matching the glyph data it was built from.
import { writeFileSync } from 'node:fs';
import { FONT_FILE, allBitmaps, buildFont, glyphRectangles } from './font.mts';

const font = buildFont();
const bytes = Buffer.from(font.toArrayBuffer());
writeFileSync(FONT_FILE, bytes);

const bitmaps = allBitmaps();
const rects = [...bitmaps.values()].reduce((total, rows) => total + glyphRectangles(rows).length, 0);
const pixels = [...bitmaps.values()].reduce((total, rows) => total + rows.join('').split('#').length - 1, 0);
console.log(`${FONT_FILE}: ${bitmaps.size} glyphs, ${(bytes.length / 1024).toFixed(1)} KB`);
console.log(`${pixels} lit pixels merged into ${rects} rectangles`);
