import { BATTLE_HP_Y, BLOW_Y, MENU_SPREAD_LENGTH, menuLine } from '../game/port/screens';
import type { ScreenLine, ScreenRect } from '../game/port/state';
import type { MessageBoxGrid } from './announcement-box';
import { BATTLE_SPELLS_BOX } from './display';

/**
 * The two places the game puts text while it is being played: the eight-line message box down
 * the right-hand side, and the screens that take the whole display over.
 *
 * Both are drawn in the grid pfont (exe 4000:0bb3) works in, 1600 across and 1200 down, and both
 * are painted onto the game's own screen by `view3d/text.ts`, in the faces pfont draws them in.
 * With the top-down map up in the screen's place there is no frame to paint on, and they go
 * through `src/lib/roller/screen.ts` instead, which is the character roller's own renderer.
 */

/**
 * FUN_2000_2f5d (exe 2000:2f5d, unf.c "FUN_2000_2f5d"): how many lines a message box holds. The
 * game copies eight strings into the buffer at DS:c694 and draws all eight every time.
 */
export const MESSAGE_BOX_LINES = 8;

/**
 * The rectangle the message box fills, which is the two rectangles the game wipes it with:
 * FUN_2000_28be (exe 2000:28be) takes the strip along the top and FUN_2000_2820 (exe 2000:2820)
 * takes the eight lines under it. Together they run from x 0x398 to the right edge and from y
 * 0x2ff to the bottom of the screen. `dotu-tools/docs/SCREEN.md` measures the same box off a
 * screenshot: dark grey, with a green bar across its top.
 */
export const MESSAGE_BOX_RECT = { x: 0x398, y: 0x2ff, right: 0x640, bottom: 0x4b0 };

/** Where the eight lines start, which is the top of FUN_2000_2820's own rectangle. The strip
 *  above it is the green bar, and is the one line a prompt is drawn on. */
export const MESSAGE_BOX_LINES_TOP = 0x324;

/**
 * Whether a drawn line stands inside a rectangle of the screen.
 *
 * The screen keeps a string's top left corner rather than the box its letters fill, so a line
 * counts as inside when the point it was drawn at is — which is the test every one of the game's
 * own wipes makes.
 */
export function inRect(rect: ScreenRect, line: ScreenLine): boolean {
  return line.x >= rect.x && line.x < rect.right && line.y >= rect.y && line.y < rect.bottom;
}

/** Whether a drawn line stands in the message box. */
export function onMessageBox(line: ScreenLine): boolean {
  return inRect(MESSAGE_BOX_RECT, line);
}

/**
 * The lines of a message box, ready for the screen renderer. A box line and a menu line are the
 * same line in the same place: FUN_2000_2f5d and mset_gmenu (exe 2000:2b08) both draw the eight
 * strings of that buffer, so `menuLine` in `src/lib/game/port/screens.ts` is the geometry.
 */
export function messageBoxLines(lines: string[]): ScreenLine[] {
  return lines.slice(0, MESSAGE_BOX_LINES).map((text, index) => menuLine(text, index));
}

/**
 * The box as a grid the tab can put a line of its own on, for the announcements the Play tab
 * draws over it. The longest line the game prints at the font's own spacing is one character
 * short of the length it starts squeezing at.
 */
export const MESSAGE_BOX_GRID: MessageBoxGrid = {
  rows: MESSAGE_BOX_LINES,
  columns: MENU_SPREAD_LENGTH - 1,
  line: menuLine,
};

/** What the game has drawn and where it stands, for {@link messageBoxScreen}. */
export interface MessageBoxShowing {
  /** The eight strings the last box filled the buffer with. */
  box: string[];
  /** Every line the game has drawn with pfont, wherever it drew it. */
  drawn: ScreenLine[];
}

/**
 * The two strips of the block a fight wipes for itself, each with the lines it then draws in it.
 *
 * strike (exe 2000:7e36) and print_battle_hp_info (exe 2000:b68d) are the only routines that draw
 * on the block without wiping the whole of it: each calls FUN_2000_295b (exe 2000:295b) on the
 * strip its own lines stand on and leaves the rest alone. So the battle banner is still standing
 * around them, and a message box that was up loses only the lines those strips cover rather than
 * being taken for a block somebody filled again.
 */
const BATTLE_STRIPS = [
  { top: 0x3c5, bottom: 0x419, drawnAt: BLOW_Y },
  { top: 0x377, bottom: 0x3a1, drawnAt: [BATTLE_HP_Y] },
];

/** The strips of {@link BATTLE_STRIPS} a fight has a line standing in, which are the ones it
 *  wiped to put that line there. */
function battleStripsWiped(drawn: ScreenLine[]): typeof BATTLE_STRIPS {
  return BATTLE_STRIPS.filter((strip) => drawn.some((line) => strip.drawnAt.includes(line.y)));
}

/** Whether a line stands in one of those strips, and so has been wiped off the block. */
function wipedForTheFight(strips: typeof BATTLE_STRIPS, y: number): boolean {
  return strips.some((strip) => y >= strip.top && y < strip.bottom);
}

/**
 * The message box as the screen has it.
 *
 * The eight lines hold whichever of the game's two ways of filling them came last, and the game
 * makes that easy to tell: everything that draws its own lines down that block — mset_gmenu, the
 * pockets menu, view_prep_spells, the battle banner — wipes the block with FUN_2000_2820 first,
 * and so does FUN_2000_2f5d before it copies a box in. So a line drawn on the block is newer
 * than the box, and with nothing drawn there the box shows.
 *
 * The strip above the eight lines is drawn either way: it is where kill_monster puts "YOU KILLED
 * IT!" and FUN_3000_a1c4 puts "GOOD NEWS...", over whatever the block holds.
 */
export function messageBoxScreen(showing: MessageBoxShowing): ScreenLine[] {
  const drawn = showing.drawn.filter(onMessageBox);
  const strips = battleStripsWiped(drawn);
  const filled = drawn.some(
    (line) => line.y >= MESSAGE_BOX_LINES_TOP && !wipedForTheFight(strips, line.y),
  );
  const lines = filled ? [] : messageBoxLines(showing.box);
  return [...lines.filter((line) => !wipedForTheFight(strips, line.y)), ...drawn];
}

/**
 * Whether a drawn line stands in the panel of battle spells at the bottom left.
 *
 * view_battle_spells (exe 2000:9417) draws that panel and leaves it there, and nothing in the
 * loop ever wipes that corner. The port's screen paints the panel from the character every time
 * the tab draws, so what the 2 key and a cast leave behind is a second copy of a panel that is
 * already showing, and it is left out of everything below.
 */
function inTheBattleSpellsPanel(line: ScreenLine): boolean {
  return (
    line.x >= BATTLE_SPELLS_BOX.left &&
    line.x < BATTLE_SPELLS_BOX.right &&
    line.y >= BATTLE_SPELLS_BOX.top &&
    line.y < BATTLE_SPELLS_BOX.bottom
  );
}

/**
 * The lines the game has drawn anywhere but the message box, which is it taking the whole display
 * over: the help, the V screen, the monster manual and the pages behind the P key all draw across
 * the four views.
 */
export function screenTakenOver(drawn: ScreenLine[]): ScreenLine[] {
  return drawn.filter((line) => !onMessageBox(line) && !inTheBattleSpellsPanel(line));
}
