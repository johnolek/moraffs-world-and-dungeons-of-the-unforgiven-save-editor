import strokeFont from '../../game/stroke-font.json';
import { drawLine, plot, type Frame } from './frame';

/**
 * The letters both games draw on a screen wider than 730 pixels, which is every SVGA mode and so
 * the 1024 by 768 both are played in here.
 *
 * `print_text` (WORLD.EXE 4000:0b14, mw.c "print_text"; unf.exe 4000:0bb3, unf.c "pfont") loads a
 * .FNT file of bitmap glyphs for the small modes, but neither game ships a 1024 by 768 .FNT, and
 * above 730 pixels across it hands the line to FUN_4000_0699 (unf.exe 4000:069a) instead. That
 * routine draws each character with FUN_4000_0034 (unf.exe 4000:0035) out of a table of strokes:
 * lines and elliptical arcs in a box 256 units square, scaled to whatever the screen is. It is
 * the plotter-style lettering John's recording of the game at 1024 by 768 shows.
 *
 * The table is `src/lib/game/stroke-font.json`, built out of both executables by
 * `dotu-tools/reference/scripts/build_stroke_font.py`. The two games' copies differ in
 * twenty-nine bytes, so each keeps its own.
 */

export type StrokeGame = 'dotu' | 'mw';

/** The whole screen the game places everything in, whatever the video mode. */
export const UNITS_X = 1600;
export const UNITS_Y = 1200;

/** Above this many pixels across, `print_text` draws strokes rather than bitmap glyphs. */
export const STROKE_ABOVE_WIDTH = 730;

/**
 * DS:4dda (Dungeons of the Unforgiven) and DS:7f6a (Moraff's World): 1600 divided by this is how
 * much of the screen's width one character of each of the three fonts takes. The two games chose
 * different numbers, so the later game's SVGA letters are the narrower.
 */
const ADVANCE_DIVISOR: Record<StrokeGame, number[]> = { dotu: [80, 50, 28], mw: [68, 42, 24] };

/** DS:4de0 and DS:7f70, the same in both games: 1100 divided by this is a line's height. */
const LINE_DIVISOR = [36, 22, 12];

/**
 * The pen `print_text` asks for: 4 on a screen up to 800 pixels across and 3 above it. It is a
 * length in the 1600 by 1200 grid, which the string routine turns into a pen of whole pixels.
 */
export const strokePenUnits = (maxX: number): number => (maxX > 800 ? 3 : 4);

/** The screen the strokes are scaled onto, in pixels. */
export interface StrokeScreen {
  width: number;
  height: number;
}

/** Where one character of a font ends, in the 1600 by 1200 grid, when the caller gave no right
 *  edge of its own. */
export const strokeAdvance = (game: StrokeGame, font: number): number =>
  Math.trunc(UNITS_X / ADVANCE_DIVISOR[game][font]);

/** How far below a line's top the next one starts. */
export const strokeLineHeight = (font: number): number => Math.trunc(1100 / LINE_DIVISOR[font]);

/** How the pen and the glyph box come out for one line of text, once it is on the screen. */
interface StrokePen {
  /** DS:cda7 and DS:cda9: the glyph box, in 128ths of a pixel. */
  scaleX: number;
  scaleY: number;
  /** DS:cdab and DS:cdac: how many pixels wide the pen is across and down. */
  penX: number;
  penY: number;
  colour: number;
}

const round = (value: number): number => Math.trunc(value + 0.5);

/**
 * One line as `print_text` and `print_text_clipped` hand it over.
 *
 * `print_text` works the right edge out from the string's own length. `print_text_clipped` is
 * given one and pulls it in by half a character, so that the last glyph's box ends on it rather
 * than starting there. A line carrying a bottom edge of its own went to `FUN_4000_069a` without
 * passing through either, so it keeps the box and the pen it was given.
 */
export function drawStrokeScreenLine(
  frame: Frame,
  screen: StrokeScreen,
  game: StrokeGame,
  line: {
    text: string;
    x: number;
    y: number;
    font: number;
    colour: number;
    spreadTo?: number;
    strokeBottom?: number;
    pen?: number;
  },
): void {
  const { text, x, y, font, colour, spreadTo, strokeBottom } = line;
  if (text.length === 0) return;
  const ownBox = strokeBottom !== undefined;
  const right =
    spreadTo === undefined
      ? x + strokeAdvance(game, font) * text.length
      : ownBox
        ? spreadTo
        : spreadTo - Math.trunc(Math.trunc((spreadTo - x) / text.length) / 2);
  const bottom = strokeBottom ?? y + strokeLineHeight(font);
  drawStrokeLine(frame, screen, game, text, x, y, right, bottom, colour, line.pen);
}

/**
 * One line of text, drawn between two x values the way FUN_4000_0699 draws one.
 *
 * `left` and `right` are in the 1600-wide grid. `print_text` works the right edge out from the
 * string's length; `print_text_clipped` (exe 4000:0d0f) is given one and pulls it in by half a
 * character. Either way character `i` starts a whole number of pixels along the span, so a line
 * spreads rather than stepping by a fixed width.
 */
export function drawStrokeLine(
  frame: Frame,
  screen: StrokeScreen,
  game: StrokeGame,
  text: string,
  left: number,
  top: number,
  right: number,
  bottom: number,
  colour: number,
  /** The pen `print_text` is given, when the caller asks for one of its own: the stone tablet
   *  draws each of its lines twice, at 8 units and then at 4 (exe DS:2e06 and DS:25f5). */
  penUnits?: number,
): void {
  if (text.length === 0) return;
  const maxX = screen.width - 1;
  const maxY = screen.height - 1;
  const x1 = Math.max(left, 3);
  const y1 = Math.max(top, 3);
  const x2 = Math.min(right, 1597);
  const y2 = Math.min(bottom, 1197);

  const startX = round((x1 * maxX) / UNITS_X);
  const startY = round((y1 * maxY) / UNITS_Y);
  const endX = round((x2 * maxX) / UNITS_X);
  const endY = round((y2 * maxY) / UNITS_Y);

  const size = penUnits ?? strokePenUnits(maxX);
  const pen: StrokePen = {
    scaleX: Math.trunc(Math.trunc((3 * (endX - startX)) / text.length) / 8),
    scaleY: (endY - startY) >> 1,
    penX: Math.max(1, round((maxX * size) / UNITS_X)),
    penY: Math.max(1, round((maxY * size) / UNITS_Y)),
    colour,
  };

  const span = endX - startX;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') continue;
    drawStrokeGlyph(frame, game, text[i], startX + Math.trunc((span * i) / text.length), startY, pen);
  }
}

/**
 * One character. A glyph is up to six entries of `kind, x1, y1, x2, y2`; the kind says whether the
 * entry is a line or an arc, and 0x10 ends the glyph. The font has lower case of its own, so the
 * character is looked up as it comes; `?` and `$` are the only printable ones with nothing to draw.
 *
 * Two of the original's oddities are kept. A pen wider than one pixel draws every stroke twice
 * per step, so the innermost step is drawn on top of itself; and an entry whose kind is 1 with a
 * last byte of 1 moves the glyph half a line down instead of drawing, which is how the font would
 * stack two rows in one box. No glyph in either game's table uses that.
 */
function drawStrokeGlyph(
  frame: Frame,
  game: StrokeGame,
  char: string,
  baseX: number,
  baseY: number,
  pen: StrokePen,
): void {
  const index = strokeFont.characters[char as keyof typeof strokeFont.characters];
  const glyph = index === undefined ? undefined : strokeFont[game][index];
  if (!glyph) return;

  let top = baseY;
  for (const [kind, gx1, gy1, gx2, gy2] of glyph) {
    if (kind === 1 && gy2 === 1) {
      top += pen.scaleY >> 1;
      continue;
    }
    const x1 = ((gx1 * pen.scaleX) >> 7) + baseX;
    const y1 = ((gy1 * pen.scaleY) >> 7) + top;
    if (kind >= 0x10) {
      const x2 = ((gx2 * pen.scaleX) >> 7) + baseX;
      const y2 = ((gy2 * pen.scaleY) >> 7) + top;
      drawThickLine(frame, kind, x1, y1, x2, y2, pen);
      continue;
    }
    // Anything under 0x10 is an ellipse, and the four bits pick the quadrants it draws.
    const radiusX = (gx2 * pen.scaleX) >> 7;
    const radiusY = (gy2 * pen.scaleY) >> 7;
    if (pen.penX === 1 && pen.penY === 1) {
      strokeEllipse(frame, x1, y1, radiusX, radiusY, pen.colour, kind);
      continue;
    }
    for (let step = 0; step < pen.penX; step++) {
      strokeEllipse(frame, x1, y1, radiusX + step, radiusY + step, pen.colour, kind);
      strokeEllipse(frame, x1, y1, radiusX - step, radiusY - step, pen.colour, kind);
    }
  }
}

/**
 * A stroke of the pen. Kind 0xfe is a line the pen widens up and down, and every other kind one it
 * widens left and right; either way the line is also run out by the pen's other measure at both
 * ends, so two strokes meeting at a corner close it.
 */
function drawThickLine(
  frame: Frame,
  kind: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pen: StrokePen,
): void {
  const acrossPen = kind === 0xfe ? pen.penY : pen.penX;
  if (acrossPen === 1) {
    drawLine(frame, x1, y1, x2, y2, pen.colour);
    return;
  }
  if (kind === 0xfe) {
    for (let step = 0; step < pen.penY; step++) {
      drawLine(frame, x1 - pen.penX + 1, y1 - step, x2 + pen.penX - 1, y2 - step, pen.colour);
      drawLine(frame, x1 - pen.penX + 1, y1 + step, x2 + pen.penX - 1, y2 + step, pen.colour);
    }
    return;
  }
  for (let step = 0; step < pen.penX; step++) {
    drawLine(frame, x1 - step, y1 - pen.penY + 1, x2 - step, y2 + pen.penY - 1, pen.colour);
    drawLine(frame, x1 + step, y1 - pen.penY + 1, x2 + step, y2 + pen.penY - 1, pen.colour);
  }
}

/**
 * `FUN_2000_04ee` (WORLD.EXE 2000:04ee), the 256-colour driver's ellipse: the midpoint algorithm
 * in two regions, with `FUN_2000_0467` (exe 2000:0467) plotting the four mirror images of each
 * point. `quadrants` is the mask that function tests: 1 upper left, 2 lower left, 4 upper right,
 * 8 lower right.
 */
export function strokeEllipse(
  frame: Frame,
  centreX: number,
  centreY: number,
  radiusX: number,
  radiusY: number,
  colour: number,
  quadrants: number,
): void {
  if (radiusX < 1 || radiusY < 1) return;
  const squareX = radiusX * radiusX;
  const squareY = radiusY * radiusY;
  let x = 0;
  let y = radiusY;
  let alongX = 0;
  let alongY = radiusY * 2 * squareX;
  let error = squareY - radiusY * squareX + Math.trunc(squareX / 4);

  const mark = () => {
    if (quadrants & 8) plot(frame, centreX + x, centreY + y, colour);
    if (quadrants & 2) plot(frame, centreX - x, centreY + y, colour);
    if (quadrants & 4) plot(frame, centreX + x, centreY - y, colour);
    if (quadrants & 1) plot(frame, centreX - x, centreY - y, colour);
  };

  while (alongY > alongX) {
    mark();
    if (error > 0) {
      y -= 1;
      alongY -= 2 * squareX;
      error -= alongY;
    }
    x += 1;
    alongX += 2 * squareY;
    error += squareY + alongX;
  }

  error += Math.trunc((Math.trunc((3 * (squareX - squareY)) / 2) - (alongY + alongX)) / 2);
  while (y >= 0) {
    mark();
    if (error < 0) {
      x += 1;
      alongX += 2 * squareY;
      error += alongX;
    }
    y -= 1;
    alongY -= 2 * squareX;
    error += squareX - alongY;
  }
}
