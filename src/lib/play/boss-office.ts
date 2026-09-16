import { FAITHFUL_RULES, type GameRules } from '../game/port/rules';
import type { Frame } from './view3d/frame';
import { fillRect } from './view3d/frame';
import type { ViewPictures } from './view3d/pictures';
import { scaleImage } from './view3d/scale';
import { sectionMonsterRecords } from './section-screen';
import { drawTabletLines, drawTabletSlab, SLAB_BASE, SLAB_TINT, TABLET_LOWERED, TABLET_SLAB_IMAGE } from './tablet';

/**
 * The screen a section's Shadow boss sends its taunt on: `boss_office_message` (exe 3000:6c9d,
 * unf.c "boss_office_message") erases the display, brings the stone tablet down across the bottom
 * with the four lines of the taunt on it, lays a panel of the section's own wall material down
 * the left and stands the boss inside it, with three lines of the big font to its right saying
 * whose office the message is from.
 *
 * `office.ts` is the message itself and `src/lib/game/port/town.ts` prints the three lines.
 * Everything here is the drawing, and every coordinate is in the 1600 by 1200 grid the game
 * places everything in.
 *
 * The office rises out of black: `FUN_3000_9026` blacks the DAC before it draws the slab and
 * brings it back up afterwards (exe 4000:5b3f and 4000:5b91). `office.ts` runs that fade over a
 * frame whose office is handed no lines, because the original cuts the four lines into the stone
 * after the fade rather than during it.
 */

/** The screen the grid is drawn onto, in pixels. */
export interface BossOfficeScreen {
  width: number;
  height: number;
}

/**
 * The panel behind the boss (exe 3000:6d9d onwards), and the rectangle the picture is stretched
 * into inside it (exe 3000:6de0 onwards). Both take the whole 256 columns of their picture.
 */
const PANEL = { x1: 1, y1: 1, x2: 0x168, y2: 0x1ea };
const PICTURE = { x1: 0x19, y1: 0x19, x2: 0x145, y2: 0x1d1 };

/** What the tab needs to draw the screen. */
export interface BossOffice {
  /** The section the character is standing in: 1 to 20 in the game itself, and past 20 on a
   *  floor below the bottom of it. */
  section: number;
  /** The four lines of the taunt, which are read off the lowered tablet (`tablet.ts`). */
  lines: string[];
}

/**
 * The office: the display erased, the tablet lowered with the taunt on it, and the boss standing
 * in its panel.
 *
 * The panel goes through `FUN_4000_433e` rather than `scale_image2`, and the two blitters have
 * colour rules of their own (see `dotu-tools/docs/PICTURES.md`); the wall material has no pixel
 * they disagree about, so the port draws it with the one drawer it has. The base is the 0x23
 * `FUN_3000_9004` left at DS:4fc1 for the tablet's slab, and the tint is whatever the last
 * picture on the screen left at DS:4fbd, which the port stands in for the same way `tablet.ts`
 * does.
 */
export function drawBossOffice(
  frame: Frame,
  screen: BossOfficeScreen,
  showing: BossOffice,
  pictures: ViewPictures,
  rules: GameRules = FAITHFUL_RULES,
): void {
  // erase_menu_block (exe 4000:42b4) fills the whole display with colour 0, so nothing of the
  // screen the character was walking through is left under the office.
  fillRect(frame, 0, 0, frame.width - 1, frame.height - 1, 0);
  // The tablet is brought down before the panel is laid over the top of it, so the slab's own
  // stone goes on first.
  drawTabletSlab(frame, screen, pictures.wall ?? null, TABLET_LOWERED, SLAB_TINT);
  drawTabletLines(frame, screen, showing.lines, TABLET_LOWERED);
  const stone = pictures.wall?.[TABLET_SLAB_IMAGE] ?? null;
  if (stone) {
    scaleImage(frame, PANEL.x1, PANEL.y1, PANEL.x2, PANEL.y2, stone, 0, 0xff, {
      screen,
      colours: { base: SLAB_BASE, tint: SLAB_TINT },
    });
  }
  // The record at DS:5247, which is the section's Shadow boss and the first of its five monsters.
  // A section below the bottom of the game borrows its boss from one of the game's own twenty,
  // and the drawer is told which section's picture file to read him out of.
  const boss = sectionMonsterRecords(showing.section, rules)[0];
  if (!boss) return;
  const picture = pictures.monster(boss.picnum, false, boss.section);
  if (!picture) return;
  scaleImage(frame, PICTURE.x1, PICTURE.y1, PICTURE.x2, PICTURE.y2, picture, 0, 0xff, {
    screen,
    colours: { base: boss.colorSet << 4, tint: boss.color },
  });
}
