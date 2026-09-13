import type { Frame } from './view3d/frame';
import { fillRect } from './view3d/frame';
import { scaleImage } from './view3d/scale';
import { drawStrokeLine } from './view3d/stroke-font';
import type { PicRowImage } from './view3d/texture';

/**
 * `FUN_3000_9026` (exe 3000:9026, unf.c "FUN_3000_9026"): the stone tablet the little snake's
 * words are read on, which is a slab of the section's own wall material across the middle of the
 * screen with four lines of the big font cut into it.
 *
 * `tablet_message` (exe 3000:931c) is what fills those four lines out of UH2.BIN, and
 * `src/lib/game/port/hints.ts` is the port of that. Everything here is the drawing.
 */

/** How many lines the tablet has, which is what UH2.BIN gives it. */
export const TABLET_LINES = 4;

/**
 * The tablet while the fade is bringing it up: the slab, with nothing written on it yet.
 *
 * `FUN_3000_9026` draws the slab on a blacked screen, fades the palette up (exe 3000:9124) and
 * only then cuts the four lines into the stone, so the words are never part of what comes out of
 * black. {@link drawTabletLines} draws nothing for a line with nothing on it.
 */
export const TABLET_WITHOUT_ITS_WORDS: string[] = [];

/**
 * The pause between the words being cut in and the HIT ANY KEY sign, in the 18.2 ticks a second
 * the PC's clock counts: `FUN_3000_8fcc` (exe 3000:8fcc) reads INT 1Ah in a loop until the count
 * has moved on by the number it is given, and the call for the tablet gives it 0x3c
 * (exe 3000:92ec, a constant Ghidra's decompilation dropped). The high speed option at DS:00c3
 * skips it (exe 3000:92e5).
 */
const TABLET_PAUSE_TICKS = 0x3c;
const CLOCK_TICKS_PER_SECOND = 18.2065;
export const TABLET_PAUSE_MS = Math.round((TABLET_PAUSE_TICKS * 1000) / CLOCK_TICKS_PER_SECOND);

/**
 * How wide a line is by the time `tablet_message` (exe 3000:931c) hands it over: it writes spaces
 * from character 37 back to the end of the string and puts the terminator at 37, so every line is
 * exactly that long whatever it holds.
 *
 * That padding is what makes the tablet's letters the same size on every line. `FUN_4000_069a`
 * spreads a line across the width it is given, so a short line with the spaces taken off would be
 * drawn in letters two or three times the size of a full one's.
 */
export const TABLET_WIDTH = 37;

/**
 * The slab, in the 1600 by 1200 grid: a band across the middle of the screen, drawn in two halves
 * out of the same picture so that its right half repeats the left rather than stretching it
 * (exe 3000:90a8 and 3000:90d4).
 *
 * The halves overlap by a pixel at 799 and 800, and each takes its own window of the picture's
 * 256 columns: the left one everything up to column 210 and the right one everything from column
 * 40 on. The seam that leaves down the middle is the tablet's own look.
 */
const SLAB = { top: 0x122, bottom: 0x398, split: 799 };
/**
 * How far up or down the screen the slab and its lines are moved, which is what DS:2412 asks for
 * (exe 3000:9042): 0 leaves the tablet across the middle, 1 and 2 lift it by 0x122 so that its
 * top edge is the top of the screen, and 3 drops it by 0xfa.
 *
 * The monster manual sets DS:2412 to 2 before it reads its own words off the slab (exe 3000:c4d4),
 * which is what leaves the bottom half of that screen free for the five monsters.
 */
export const TABLET_RAISED = -0x122;
/**
 * The 3 the section boss's taunt puts in DS:2412 before it asks for the tablet
 * (`boss_office_message`, exe 3000:6c9d), which leaves the top of the screen free for the boss's
 * picture and the three lines beside it (`boss-office.ts`).
 */
export const TABLET_LOWERED = 0xfa;
const SLAB_LEFT = { x1: 1, x2: SLAB.split, srcX1: 0, srcX2: 0xd2 };
const SLAB_RIGHT = { x1: 800, x2: 0x63e, srcX1: 0x28, srcX2: 0xff };

/**
 * `ufwall<section>.pic` image 5, which is the third of the section's three wall materials: the
 * picture table `load_section_pictures` (exe 2000:372c) fills at DS:c3d7 puts the ten wall images
 * four bytes apart, and DS:c3eb is the sixth of them.
 */
export const TABLET_SLAB_IMAGE = 5;

/**
 * `FUN_3000_9004` (exe 3000:9004): the colour-set base the slab is drawn at in a 256-colour mode,
 * which puts the picture's values in the palette's picture bank rather than in the wall colours
 * the same image wears in the corridor.
 */
export const SLAB_BASE = 0x23;

/**
 * The tint the slab's value-17 pixels take. `FUN_3000_9026` sets no tint of its own, so the
 * original draws the slab in whatever DS:4fbd was left holding by the last picture on the screen;
 * the port uses the 12 `FUN_3000_342d` (exe 3000:342d) gives a plain wall face, so the tablet
 * comes out the same every time it is drawn.
 */
export const SLAB_TINT = 12;

/** Where the four lines stand and how far each is spread, out of the 1600 by 1200 grid. */
const TEXT_X = 100;
const TEXT_TO = 0x5dc;
const TEXT_TOP = 0x159;
const TEXT_BOTTOM = 0x1a9;
const TEXT_STEP = 0x8c;

/**
 * Each line is drawn twice, which is what cuts it into the stone: a fat dark stroke first and a
 * thinner bright one over it. The pens are the two floats at DS:2e06 and DS:25f5, and the colours
 * the 14 and 15 `FUN_3000_9026` sets DS:c6ba to in a 256-colour mode.
 */
const TEXT_PASSES = [
  { colour: 14, pen: 8 },
  { colour: 15, pen: 4 },
];

/**
 * The slab on its own, without the words on it: the two halves of the section's wall image 5
 * (exe 3000:90a8 and 3000:90d4), moved by `offset` and tinted by whatever DS:4fbd was left
 * holding when `FUN_3000_9026` was called.
 */
export function drawTabletSlab(
  frame: Frame,
  screen: TabletScreen,
  wall: PicRowImage[] | null,
  offset: number,
  tint: number,
): void {
  const slab = wall?.[TABLET_SLAB_IMAGE] ?? null;
  if (!slab) return;
  const options = { screen, colours: { base: SLAB_BASE, tint } };
  for (const half of [SLAB_LEFT, SLAB_RIGHT]) {
    scaleImage(
      frame,
      half.x1,
      SLAB.top + offset,
      half.x2,
      SLAB.bottom + offset,
      slab,
      half.srcX1,
      half.srcX2,
      options,
    );
  }
}

/** The screen the tablet is drawn on, in pixels. */
export interface TabletScreen {
  width: number;
  height: number;
}

/**
 * The four lines cut into the slab, moved by `offset` with it: the `FUN_4000_069a` pairs of
 * `FUN_3000_9026` (exe 3000:9026), each of which is given the same offset as the slab.
 *
 * A blank line is skipped: `FUN_4000_069a` spreads whatever it is given across the width it is
 * given, and a line of nothing but the padding spaces has no letters to spread.
 */
export function drawTabletLines(
  frame: Frame,
  screen: TabletScreen,
  lines: string[],
  offset: number,
): void {
  lines.slice(0, TABLET_LINES).forEach((line, index) => {
    if (line.trim() === '') return;
    const text = line.slice(0, TABLET_WIDTH).padEnd(TABLET_WIDTH);
    const top = TEXT_TOP + offset + index * TEXT_STEP;
    const bottom = TEXT_BOTTOM + offset + index * TEXT_STEP;
    for (const pass of TEXT_PASSES) {
      drawStrokeLine(frame, screen, 'dotu', text, TEXT_X, top, TEXT_TO, bottom, pass.colour, pass.pen);
    }
  });
}

/**
 * The tablet, over a screen of its own.
 *
 * The original blacks the whole palette before it draws the slab and fades it back up afterwards
 * (`FUN_4000_5b3f` and `FUN_4000_5b91`, exe 4000:5b3f and 4000:5b91), which is why the tablet is
 * read on a dark screen; the port has no palette to fade, so it fills the display with colour 0
 * and leaves the slab standing on it.
 */
export function drawTablet(
  frame: Frame,
  screen: TabletScreen,
  lines: string[],
  wall: PicRowImage[] | null,
): void {
  fillRect(frame, 0, 0, frame.width - 1, frame.height - 1, 0);
  drawTabletSlab(frame, screen, wall, 0, SLAB_TINT);
  drawTabletLines(frame, screen, lines, 0);
}
