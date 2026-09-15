import type { ScreenLine } from '../../game/port/state';
import { AHEAD_VIEW, BEHIND_VIEW, LEFT_VIEW, RIGHT_VIEW, type ViewRect } from './geometry';

/**
 * `FUN_2000_ac9e` (exe 2000:ac9e, unf.c "FUN_2000_ac9e"): the four views `movecontrol` draws
 * every turn — the way the character faces large across the top, and the other three ways at a
 * quarter of the size — and the yellow labels over them.
 */

/** Which of the four ways a view looks. */
export type ViewName = 'ahead' | 'left' | 'right' | 'behind';

/** Where a label goes, as psfont (exe 4000:0db8) is handed it. */
interface LabelPlace {
  x: number;
  /** The x the string is spread out to reach. */
  spreadTo: number;
  /** The y for a character of {@link TALL_ENOUGH} or more, and the y for a shorter one. */
  tallY: number;
  shortY: number;
}

/** One of the four views: where it is drawn, which way it looks, and where its label goes. */
export interface FourView {
  name: ViewName;
  rect: ViewRect;
  label: LabelPlace;
}

/**
 * The three other facings, by the way the character faces: `local_4`, `local_6` and `local_8` at
 * exe 2000:acac..ad01. Facings are 0 north, 1 south, 2 west, 3 east.
 */
export const LEFT_OF = [2, 3, 1, 0] as const;
export const BEHIND_OF = [1, 0, 3, 2] as const;
export const RIGHT_OF = [3, 2, 0, 1] as const;

/** Which way one of the four views looks when the character faces `facing`. */
export function viewFacing(name: ViewName, facing: number): number {
  if (name === 'left') return LEFT_OF[facing];
  if (name === 'right') return RIGHT_OF[facing];
  if (name === 'behind') return BEHIND_OF[facing];
  return facing;
}

/**
 * The four views in the order the game draws them. The rectangles are the arguments of the four
 * `draw_3d_view` calls at exe 2000:adf1..ae89, in the 1600 x 1200 units everything the game draws
 * is placed in.
 */
export const FOUR_VIEWS: FourView[] = [
  { name: 'ahead', rect: AHEAD_VIEW, label: { x: 0x2bf, spreadTo: 0x388, tallY: 0x0b, shortY: 0x2d0 } },
  { name: 'left', rect: LEFT_VIEW, label: { x: 0x12, spreadTo: 0x120, tallY: 0x2d8, shortY: 0x21c } },
  { name: 'behind', rect: BEHIND_VIEW, label: { x: 0x2bf, spreadTo: 0x388, tallY: 0x3e9, shortY: 0x30c } },
  { name: 'right', rect: RIGHT_VIEW, label: { x: 0x527, spreadTo: 0x634, tallY: 0x2d8, shortY: 0x21c } },
];

/**
 * The two sets of labels, at DS:0483 and DS:048b, in the order the four psfont calls read them:
 * ahead, left, behind, right.
 *
 * DS:c9ee picks the set, and DS:c9ee is whether the game is being played with a mouse: `main`
 * sets it to 1 when `mouse_detect` (exe 4000:39c0) finds one at start-up (exe 2000:630d), and
 * Escape turns it off and on again from the top of movecontrol's loop (exe 2000:c845). A player
 * with a mouse is told what clicking a view does; a player without one is told which arrow key
 * to press. This port has no mouse, so it draws the arrow set.
 */
export const VIEW_LABELS: Record<ViewName, string>[] = [
  { ahead: 'UP ARROW', left: 'LEFT ARROW', behind: 'DOWN ARROW', right: 'RIGHT ARROW' },
  { ahead: 'MOVE FORWARD', left: 'TURN LEFT', behind: 'TURN AROUND', right: 'TURN RIGHT' },
];

/** The colour every label is drawn in, which is the yellow of palette entry 4. */
export const LABEL_COLOUR = 4;

/**
 * Experience of 40 or more and the labels stop being drawn, so they are help for a character who
 * has not killed anything yet. DS:c024 is the experience field of the character record, which
 * starts at DS:b880 and holds it at offset 0x7a4.
 *
 * The test is `fld qword [c024]; fcomp dword [197d]; fnstsw; sahf; jb` at exe 2000:ae97, and
 * DS:197d holds the single-precision 40. `jb` is taken when the experience is the smaller of the
 * two, so the four labels are drawn for a character who has earned less than 40 and skipped for
 * one who has earned 40 or more.
 */
export const LABEL_EXP_LIMIT = 40;

/**
 * A character whose height (DS:b8bd, the record's own height field) is this or more gets the
 * labels above the big view and below the small ones; a shorter one, who sees a lower horizon,
 * gets them the other way up (`cmp word [b8bd], 0xe` at exe 2000:aeaf).
 */
export const TALL_ENOUGH = 15;

/** The labels over the four views, or none when the character has earned enough to lose them. */
export function viewLabels(exp: number, height: number, set = 0): ScreenLine[] {
  if (exp >= LABEL_EXP_LIMIT) return [];
  const words = VIEW_LABELS[set] ?? VIEW_LABELS[0];
  return FOUR_VIEWS.map((view) => ({
    text: words[view.name],
    x: view.label.x,
    y: height >= TALL_ENOUGH ? view.label.tallY : view.label.shortY,
    font: 0,
    colour: LABEL_COLOUR,
    spreadTo: view.label.spreadTo,
  }));
}
