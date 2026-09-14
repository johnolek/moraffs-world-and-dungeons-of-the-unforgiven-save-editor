import type { ScreenLine } from '../../game/port/state';
import type { Frame } from './frame';
import { bitmapBox, drawBitmapLine } from './menu-font';
import { drawStrokeScreenLine } from './stroke-font';

/**
 * The words on Dungeons of the Unforgiven's screen, drawn into the same buffer the 3-D views are,
 * in the game's own faces. `src/lib/play/mw/view3d/text.ts` is Moraff's World's half of this.
 *
 * `pfont` (exe 4000:0bb3, unf.c "pfont") and `psfont` (exe 4000:0db8) place a line in the 1600 by
 * 1200 grid the game draws everything in, and above 730 pixels across they hand it to the vector
 * font of `stroke-font.ts` rather than to the .FNT glyphs a smaller screen reads. The game is
 * played here at 1024 by 768, so that is every line but the two blocks that clear DS:4dec around
 * themselves: the key menu's thirteen words (`FUN_4000_667b`, exe 4000:667b) and the whole of the
 * condensed spell menu (`cast_a_spell`, exe 2000:e017). Those keep their .FNT glyphs at their own
 * size, `bitmapFace` on a line is where the port records the ask, and `menu-font.ts` draws them.
 *
 * What this declines to draw is the .FNT path for the eleven video modes narrower than 730 pixels,
 * where every line is a glyph stretched to the step its font is drawn at. The game is played in
 * one mode here and the render script draws in the same one, so nothing reaches such a screen.
 */

/** The screen the lines are drawn on, in pixels. */
export interface TextScreen {
  width: number;
  height: number;
}

/** One line of the game's screen, in whichever of the two faces the line asks for. */
export function drawDotuScreenLine(frame: Frame, screen: TextScreen, line: ScreenLine): void {
  // Both fonts draw with DS:4dec cleared, so a bitmap line may or may not carry the x psfont
  // spreads to; what it must carry is a font index the game has a glyph box for.
  if (line.bitmapFace && bitmapBox(line.font)) {
    drawBitmapLine(frame, screen, line);
    return;
  }
  drawStrokeScreenLine(frame, screen, 'dotu', line);
  if (line.value !== undefined && line.valueX !== undefined) {
    // The value beside a label is a call of its own, at its own x and with no spread.
    drawStrokeScreenLine(frame, screen, 'dotu', { ...line, text: line.value, x: line.valueX, spreadTo: undefined });
  }
}

/** Everything showing on the game's screen, in the order the game drew it. */
export function drawDotuScreenText(frame: Frame, screen: TextScreen, lines: ScreenLine[]): void {
  for (const line of lines) drawDotuScreenLine(frame, screen, line);
}
