import type { ScreenLine } from '../../game/port/state';
import { glyphRows, pixelFont, type PixelFont } from '../../ui/pixel-font';
import { notePaint, plot, type Frame } from './frame';

/**
 * The .FNT glyphs Dungeons of the Unforgiven still draws at 1024 by 768.
 *
 * `pfont` (exe 4000:0bb3, unf.c "pfont") and `psfont` (exe 4000:0db8) only hand a line to the
 * vector font when DS:4dec is set, and exactly two places clear it. `FUN_4000_667b` (exe
 * 4000:667b) draws the key menu down the left of the play screen and clears it around its
 * thirteen body lines; `cast_a_spell` (exe 2000:e017) clears it around the whole of its condensed
 * spell menu. Everything else on the screen comes out as strokes, which is why the key menu reads
 * thin against the bold status block, and why its first line looks like `1>` when the string is
 * really `1)`: these faces draw a parenthesis as two straight diagonals meeting at a point.
 */

/**
 * The glyph box each font index is read with, which `FUN_4000_095b` (exe 4000:095b) fills from
 * one row of the tables at DS:4d22 and DS:4d5e. This screen reads row 0, which is 320x200.fnt's
 * own three sizes.
 *
 * Font 0, the 4 by 6, is not here: neither place that clears DS:4dec ever asks for it, so no line
 * on this screen is drawn as a glyph in that size.
 */
const BOXES: Record<number, { face: PixelFont; width: number }> = {
  1: { face: pixelFont('small_spells'), width: 6 },
  2: { face: pixelFont('menu'), width: 10 },
};

/** The box a line of this font index is drawn with, or nothing when the game never draws one. */
export const bitmapBox = (font: number): { face: PixelFont; width: number } | undefined => BOXES[font];

/** The whole screen every line is placed in, whatever the video mode. */
const UNITS_X = 1600;
const UNITS_Y = 1200;

/** The screen the glyphs are drawn on, in pixels. */
export interface MenuScreen {
  width: number;
  height: number;
}

/**
 * The scaling both fonts use for the .FNT path: the screen's last column over 1600 across and its
 * last row over 1200 down, both truncated.
 */
const toX = (screen: MenuScreen, x: number): number => Math.trunc(((screen.width - 1) * x) / UNITS_X);
const toY = (screen: MenuScreen, y: number): number => Math.trunc(((screen.height - 1) * y) / UNITS_Y);

/**
 * One glyph, drawn at its own size. `FUN_4000_09a5` (exe 4000:09a5) plots one screen pixel per
 * set bit and leaves the rest of the box alone, so nothing behind a line is painted over, and it
 * returns at once for a space.
 */
function drawGlyph(
  frame: Frame,
  face: PixelFont,
  width: number,
  char: string,
  left: number,
  top: number,
  colour: number,
): void {
  if (char === ' ') return;
  const rows = glyphRows(face, char);
  rows.forEach((row, r) => {
    for (let bit = 0; row >> bit; bit++) {
      if (row & (1 << bit)) plot(frame, left + bit, top + r, colour);
    }
  });
  // A glyph is one paint of the journal: the box its bits are plotted in.
  notePaint(frame, left, top, left + width - 1, top + rows.length - 1);
}

/**
 * How far apart `pfont` sets two glyphs: the glyph box widened by a fraction of itself that the
 * video mode picks. The port draws mode 9, which takes a quarter.
 */
const pfontStep = (width: number): number => width + (width >> 2);

/**
 * One line of .FNT glyphs, placed the way whichever of the two functions drew it places them.
 *
 * `psfont` is given the x it spreads to: it scales both edges onto the screen first and then puts
 * character i a whole number of pixels along the span, so the step is not a whole number of
 * anything. `pfont` is given one x and steps by the glyph box instead, which is what draws the
 * condensed spell menu's heading and the thirty key letters over its spells.
 */
export function drawBitmapLine(
  frame: Frame,
  screen: MenuScreen,
  line: Pick<ScreenLine, 'text' | 'x' | 'y' | 'colour' | 'font' | 'spreadTo'>,
): void {
  const box = bitmapBox(line.font);
  if (!box) return;
  const left = toX(screen, line.x);
  const top = toY(screen, line.y);
  const span = line.spreadTo === undefined ? 0 : toX(screen, line.spreadTo) - left;
  for (let i = 0; i < line.text.length; i++) {
    const along =
      line.spreadTo === undefined ? pfontStep(box.width) * i : Math.trunc((span * i) / line.text.length);
    drawGlyph(frame, box.face, box.width, line.text[i], left + along, top, line.colour);
  }
}
