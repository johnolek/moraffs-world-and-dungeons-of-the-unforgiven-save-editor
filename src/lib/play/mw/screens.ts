import { mwOnMessageLine, type MwGame } from '../../game/mw-port/state';
import type { ScreenLine } from '../../game/port/state';
import type { MessageBoxGrid } from '../announcement-box';

/**
 * The two places Moraff's World puts text while it is being played: the eight-line message box
 * down the left of the screen, and the screens that take the whole display over.
 *
 * Both are drawn in the grid print_text (WORLD.EXE 4000:0b14) works in, 1600 across and 1200
 * down. On the game's screen `MwScreen.svelte` paints them into the frame with the views; on the
 * top-down map they go through `src/lib/roller/screen.ts`, which is the renderer the character
 * roller's screens use.
 */

/**
 * FUN_2000_216b (WORLD.EXE 2000:216b, mw.c "FUN_2000_216b"): where the eight lines of a message
 * box go. Each is drawn at x 0 in the body font in colour 5, fifty apart down the screen; a line
 * of 27 characters or more goes through draw_text_box instead, which wraps it at 0x29e.
 *
 * The port has no wrapping, so a long line is spread to that same limit, the way the Dungeons of
 * the Unforgiven side spreads its own.
 */
export const MW_MESSAGE_BOX = {
  x: 0,
  y: 0x28,
  step: 0x32,
  lines: 8,
  colour: 5,
  right: 0x29e,
  squeezeFrom: 27,
} as const;

/** One line of a message box, on the row FUN_2000_216b would draw it on. */
export function mwMessageBoxLine(text: string, row: number): ScreenLine {
  return {
    text,
    x: MW_MESSAGE_BOX.x,
    y: MW_MESSAGE_BOX.y + row * MW_MESSAGE_BOX.step,
    font: 0,
    colour: MW_MESSAGE_BOX.colour,
    spreadTo: text.length >= MW_MESSAGE_BOX.squeezeFrom ? MW_MESSAGE_BOX.right : undefined,
  };
}

/** The lines of a message box, ready for the screen renderer. */
export function mwMessageBoxLines(lines: string[]): ScreenLine[] {
  return lines.slice(0, MW_MESSAGE_BOX.lines).map((text, index) => mwMessageBoxLine(text, index));
}

/**
 * The box as a grid the tab can put a line of its own on, for the announcements the Play tab
 * draws over it. The longest line the game prints at the font's own spacing is one character
 * short of the length draw_text_box starts wrapping at.
 */
export const MW_MESSAGE_BOX_GRID: MessageBoxGrid = {
  rows: MW_MESSAGE_BOX.lines,
  columns: MW_MESSAGE_BOX.squeezeFrom - 1,
  line: mwMessageBoxLine,
};

/**
 * The colour every line movecontrol draws straight onto the play screen comes out in: DS:1303,
 * which holds 15 and which nothing in the executable ever writes.
 */
export const MW_TEXT_COLOUR = 15;

/**
 * How far apart the lines of the strip at the top left of the screen are. strike (WORLD.EXE
 * 2000:5bef) prints its two at y 0x28 and 0x50, monster_turn (exe 2000:6123) writes at y 0, and
 * the fourth line of "YOU ARE FIGHTING THE MONSTER" reaches 0x78.
 */
const MW_STRIP_STEP = 0x28;

/**
 * How wide that corner is. The strip monster_killed wipes before it writes reaches x 0x2d0, which
 * is further than the message box's own right-hand edge, and "YOU ARE FIGHTING THE MONSTER" needs
 * all of it.
 */
export const MW_CORNER_WIDTH = 0x2d0;

/**
 * How far down the screen the message box reaches. Everything that writes in the box wipes this
 * far before it prints: FUN_2000_216b (WORLD.EXE 2000:216b) fills to y 0x1ac and the little
 * mouse's advice (exe 3000:9383) to y 0x1ae, both from the top of the screen, so the strip a kill
 * and a fight write on goes with the box.
 */
export const MW_MESSAGE_BOX_BOTTOM = 0x1ae;

/**
 * Whether a line the game has drawn stands in that corner of the screen rather than somewhere a
 * screen of its own would put it. A line inside it is drawn with the message box; a line outside
 * it is the game having taken the whole display over.
 */
export function mwInMessageBox(line: ScreenLine): boolean {
  return line.x < MW_CORNER_WIDTH && line.y < MW_MESSAGE_BOX_BOTTOM;
}

/** The fill_rect (WORLD.EXE 4000:2020) the advice wipes that whole corner with before it writes. */
export function mwClearMessageBox(game: MwGame): void {
  for (let at = game.screen.length - 1; at >= 0; at -= 1) {
    if (mwInMessageBox(game.screen[at])) game.screen.splice(at, 1);
  }
}

/** Everything showing in the top left corner of the screen, and how tall it is. */
export interface MwCorner {
  lines: ScreenLine[];
  /** The height of the window that holds it, in the game's units. */
  height: number;
}

/**
 * The corner of the screen the game writes to while it is being played: the strip a kill and a
 * fight write on, and the eight-line message box under it.
 *
 * The original draws the strip straight over the top of the box — its first line and the box's
 * are both at y 0x28 — and gets away with it because a menu is never up while a monster is being
 * swung at. This port cannot count on that, so the box is moved down by however much of the strip
 * is in use and nothing is hidden. Every line keeps the x, the font and the colour the game gives
 * it, and each group keeps its own spacing.
 *
 * A line drawn further down that corner than the strip reaches — the little mouse's advice, which
 * writes on the box's own last four rows — is left exactly where the game drew it, since it is
 * already in the box's own grid and the game has wiped the box to make room for it.
 *
 * @param drawn the lines a ported function has drawn in that corner, which is where
 *   "YOU KILLED IT!" goes.
 * @param banner the fight's own lines, which the session collects out of the box.
 * @param box the message box, already placed by {@link mwMessageBoxLines}.
 */
export function mwCorner(drawn: ScreenLine[], banner: string[], box: ScreenLine[]): MwCorner {
  const stripLines = drawn.filter(mwOnMessageLine);
  const belowStrip = drawn.filter((line) => !mwOnMessageLine(line));
  const lines: ScreenLine[] = stripLines.map((line, index) => ({
    ...line,
    y: index * MW_STRIP_STEP,
  }));
  const bannerTop = lines.length * MW_STRIP_STEP;
  for (const [index, text] of banner.entries()) {
    lines.push({ text, x: 0, y: bannerTop + index * MW_STRIP_STEP, font: 0, colour: MW_TEXT_COLOUR });
  }
  const strip = bannerTop + banner.length * MW_STRIP_STEP;
  for (const line of box) lines.push({ ...line, y: line.y + strip });
  lines.push(...belowStrip);
  const height = belowStrip.reduce(
    (deepest, line) => Math.max(deepest, line.y + MW_MESSAGE_BOX.step),
    strip + MW_MESSAGE_BOX.y + box.length * MW_MESSAGE_BOX.step,
  );
  return { lines, height };
}
