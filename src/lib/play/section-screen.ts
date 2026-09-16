import data from '../game/dotu-data.json';
import { drawTabletSlab, TABLET_RAISED } from './tablet';
import { fillRect, type Frame } from './view3d/frame';
import type { ViewPictures } from './view3d/pictures';
import { scaleImage } from './view3d/scale';
import { drawStrokeLine } from './view3d/stroke-font';

/**
 * The pictures on the S key's screen: `monster_manual` (exe 3000:c39d, unf.c "monster_manual")
 * draws the section's five monsters across the bottom of it, each in a panel of the section's own
 * wall material, with the stone tablet of `tablet.ts` lifted to the top for the words.
 *
 * `manual.ts` is the key itself, and it is where every string on this screen comes from.
 *
 * Each of the screen's big-font lines is drawn twice, a fat dark stroke and then a thin bright one
 * over it, which is what cuts the letters into the stone. A screen line is one line at one place,
 * so the port cannot hold both passes as lines: the fat pass is drawn here with the pictures and
 * the thin one is the line `manual.ts` prints, in that order, which is the order the original
 * draws them in.
 */

/** The screen the 1600 by 1200 grid is drawn onto, in pixels. */
export interface SectionScreenPixels {
  width: number;
  height: number;
}

/** One of the two calls a line of the big font is drawn with. */
export interface ManualPass {
  colour: number;
  /** The pen `FUN_4000_069a` (exe 4000:069a) is given, in the 1600 by 1200 grid. */
  pen: number;
}

/** Where one of the screen's big-font lines stands, as `FUN_4000_069a` is given it. */
export interface ManualBox {
  x: number;
  y: number;
  /** The right edge the line is spread to, which this call is given rather than working out. */
  spreadTo: number;
  /** The bottom edge, which is what makes the letters as tall as they are. */
  strokeBottom: number;
}

/**
 * The four lines of the section's own words, on the slab lifted to the top of the screen, and the
 * two pens at DS:2e06 and DS:25f5 `FUN_3000_9026` (exe 3000:9026) draws each of them with.
 */
export const MANUAL_TEXT = {
  x: 100,
  top: 0x37,
  strokeBottom: 0x87,
  step: 0x8c,
  spreadTo: 0x5dc,
  shadow: { colour: 14, pen: 8 } satisfies ManualPass,
  bright: { colour: 15, pen: 4 } satisfies ManualPass,
};

/** Where the manual's `index`th line of section text stands. */
export const manualTextBox = (index: number): ManualBox => ({
  x: MANUAL_TEXT.x,
  y: MANUAL_TEXT.top + index * MANUAL_TEXT.step,
  spreadTo: MANUAL_TEXT.spreadTo,
  strokeBottom: MANUAL_TEXT.strokeBottom + index * MANUAL_TEXT.step,
});

/** The row of letters under the panels (exe DS:352b), in the box exe 3000:c4a9 gives it. */
export const MANUAL_LETTERS = {
  text: 'A     B     C     D     E',
  box: { x: 0x19, y: 0x41a, spreadTo: 0x564, strokeBottom: 0x460 } satisfies ManualBox,
  /** Colours 14 and 15, with the pens at DS:3545 and DS:2f68. */
  shadow: { colour: 14, pen: 13 } satisfies ManualPass,
  bright: { colour: 15, pen: 5 } satisfies ManualPass,
};

/**
 * The stamp over the first panel (exe DS:3549), which the original prints when the section's own
 * Shadow boss is already dead (exe 3000:c4c1). A is the panel that boss stands in.
 */
export const MANUAL_DEAD = {
  text: 'DEAD',
  box: { x: 0x19, y: 0x352, spreadTo: 0x113, strokeBottom: 0x3a2 } satisfies ManualBox,
  /** Black and then white, with the pens at DS:2e24 and DS:2f68. */
  shadow: { colour: 0, pen: 9 } satisfies ManualPass,
  bright: { colour: 15, pen: 5 } satisfies ManualPass,
};

/**
 * The five panels, from the table at DS:2521 that `monster_manual` fills at 3000:c3c1. Each is 299
 * units across and they step 321 apart.
 */
export const SECTION_PANELS: ManualRect[] = [
  { x1: 1, y1: 0x2b2, x2: 0x12c, y2: 0x47e },
  { x1: 0x142, y1: 0x2b2, x2: 0x26e, y2: 0x47e },
  { x1: 0x287, y1: 0x2b2, x2: 0x3b3, y2: 0x47e },
  { x1: 0x3ca, y1: 0x2b2, x2: 0x4f6, y2: 0x47e },
  { x1: 0x50f, y1: 0x2b2, x2: 0x63b, y2: 0x47e },
];

/** A rectangle in the 1600 by 1200 grid, as `scale_image2` (exe 4000:4818) is given one. */
interface ManualRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The rectangle each monster's picture is stretched into (exe 3000:c40d onwards), one per panel.
 * The fifth has its two x values the other way round, which is `scale_image2` being asked to
 * mirror it, so the monster at E faces back along the row.
 */
export const SECTION_PICTURES: ManualRect[] = [
  { x1: 0x1f, y1: 0x2d0, x2: 0x10e, y2: 0x460 },
  { x1: 0x160, y1: 0x2d0, x2: 0x250, y2: 0x460 },
  { x1: 0x2a5, y1: 0x2d0, x2: 0x395, y2: 0x460 },
  { x1: 0x3e7, y1: 0x2d0, x2: 0x4d8, y2: 0x460 },
  { x1: 0x61d, y1: 0x2d0, x2: 0x52d, y2: 0x460 },
];

/**
 * Which of the section's five monsters stands in each panel, by its place in the section's own
 * table (exe 3000:c40d, which reads the record at DS:5247 and the four 29 bytes apart after it).
 *
 * The order is not the table's: the Shadow boss is under A, the first of the four ordinary
 * monsters is under E, and the other three fill B, C and D. `manual.ts` shows the descriptions in
 * that same order, so a letter reads about the monster above it.
 */
export const SECTION_PANEL_MONSTERS = [0, 2, 3, 4, 1];

/**
 * The wall image the panels are filled with: image 5, the section's third wall material, which is
 * the one the stone tablet is cut from as well (exe 3000:c3d3 reads the same DS:c3eb).
 */
export const PANEL_IMAGE = 5;

/**
 * The colour-set base the panels are drawn at, which `monster_manual` sets DS:4fc1 to at
 * 3000:c3c9: 0x10 puts the wall picture's values in the section's own wall colours rather than in
 * the picture bank the tablet's slab uses.
 */
const PANEL_BASE = 0x10;

/**
 * The tint the panels' value-17 pixels take. `monster_manual` sets none before it fills them, so
 * the original draws them in whatever DS:4fbd was left holding by the last picture `movecontrol`
 * put on the screen; the port uses the 12 `FUN_3000_342d` (exe 3000:342d) gives a plain wall face,
 * exactly as `tablet.ts` does, so the screen comes out the same every time it is opened.
 */
const PANEL_TINT = 12;

/** One monster's record, as far as the drawer needs it. */
interface PanelMonster {
  picnum: number;
  colorSet: number;
  color: number;
}

/**
 * The section's five monsters, in the order their records sit in the section's table: the Shadow
 * boss first and then the four ordinary ones.
 */
export function sectionMonsterRecords(section: number): PanelMonster[] {
  return data.sections[section - 1]?.monsters ?? [];
}

/**
 * The tint the tablet's slab is drawn in on this screen.
 *
 * `FUN_3000_9026` sets no tint of its own, and on the way here `monster_manual` has just drawn the
 * fifth panel's monster (exe 3000:c4a4), so DS:4fbd still holds that monster's own colour byte —
 * which is the section table's second record, the first of the four ordinary monsters.
 */
export function sectionSlabTint(section: number): number {
  return sectionMonsterRecords(section)[1]?.color ?? 0;
}

/** What the S key's screen is showing, which is what the tab needs to draw it. */
export interface SectionScreen {
  /** The section the five monsters in the panels come from, 1 to 20. */
  section: number;
  /** The four lines standing on the slab: the section's introduction, or one monster's. */
  lines: string[];
  /** The section's own Shadow boss is dead, which is what puts DEAD over the first panel. */
  bossDead: boolean;
}

/**
 * Everything the S key's screen draws that is not a printed line: the five panels, the monsters
 * standing in them, the slab the section's text is read off, and the fat dark pass of every line
 * of the big font.
 *
 * The original blacks the whole screen first — `erase_menu_block` (exe 4000:4225) on the way in —
 * so the panels stand on black.
 */
export function drawSectionScreen(
  frame: Frame,
  screen: SectionScreenPixels,
  showing: SectionScreen,
  pictures: ViewPictures,
): void {
  fillRect(frame, 0, 0, frame.width - 1, frame.height - 1, 0);
  const wall = pictures.wall?.[PANEL_IMAGE] ?? null;
  if (wall) {
    const options = { screen, colours: { base: PANEL_BASE, tint: PANEL_TINT } };
    for (const panel of SECTION_PANELS) {
      scaleImage(frame, panel.x1, panel.y1, panel.x2, panel.y2, wall, 0, 0xff, options);
    }
  }
  const monsters = sectionMonsterRecords(showing.section);
  SECTION_PANEL_MONSTERS.forEach((slot, panel) => {
    const monster = monsters[slot];
    if (!monster) return;
    const picture = pictures.monster(monster.picnum, false);
    if (!picture) return;
    const box = SECTION_PICTURES[panel];
    scaleImage(frame, box.x1, box.y1, box.x2, box.y2, picture, 0, 0xff, {
      screen,
      colours: { base: monster.colorSet << 4, tint: monster.color },
    });
  });
  const shadow = (text: string, box: ManualBox, pass: ManualPass): void =>
    drawStrokeLine(frame, screen, 'dotu', text, box.x, box.y, box.spreadTo, box.strokeBottom, pass.colour, pass.pen);
  shadow(MANUAL_LETTERS.text, MANUAL_LETTERS.box, MANUAL_LETTERS.shadow);
  if (showing.bossDead) shadow(MANUAL_DEAD.text, MANUAL_DEAD.box, MANUAL_DEAD.shadow);
  drawTabletSlab(frame, screen, pictures.wall, TABLET_RAISED, sectionSlabTint(showing.section));
  showing.lines.forEach((line, index) => shadow(line, manualTextBox(index), MANUAL_TEXT.shadow));
}
