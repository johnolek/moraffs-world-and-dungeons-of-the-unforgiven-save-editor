import { describe, expect, it } from 'vitest';
import data from '../game/dotu-data.json';
import {
  drawSectionScreen,
  PANEL_IMAGE,
  sectionMonsterRecords,
  sectionSlabTint,
  type SectionScreen,
} from './section-screen';
import { newFrame, pixelAt, type Frame } from './view3d/frame';
import type { ViewPictures } from './view3d/pictures';
import type { PicRowImage } from './view3d/texture';

/** The screen the game's 1600 x 1200 units scale onto one for one, so a test can name a row. */
const SCREEN = { width: 1600, height: 1200 };

/** The value the wall picture's own pixels are, and the two the monster picture is made of. */
const WALL_BODY = 5;
const LEFT = 5;
const RIGHT = 6;

/** A picture whose every row is one run of the same value across all 256 columns. */
const solid = (value: number): PicRowImage =>
  Array.from({ length: 200 }, () => ({ startX: 0, runs: [{ colour: value, length: 256 }] }));

/** A picture whose left quarter is one value and the rest another, so a mirror shows. */
const twoSided = (): PicRowImage =>
  Array.from({ length: 200 }, () => ({
    startX: 0,
    runs: [
      { colour: LEFT, length: 64 },
      { colour: RIGHT, length: 192 },
    ],
  }));

function wallFile(): PicRowImage[] {
  const images = Array.from({ length: 10 }, () => solid(1));
  images[PANEL_IMAGE] = solid(WALL_BODY);
  return images;
}

const pictures = (monster: PicRowImage | null): ViewPictures => ({
  wall: wallFile(),
  overlay: null,
  monster: () => monster,
  ladder: () => null,
});

const drawn = (showing: Partial<SectionScreen> = {}, monster: PicRowImage | null = solid(LEFT)): Frame => {
  const frame = newFrame(SCREEN.width, SCREEN.height);
  drawSectionScreen(frame, SCREEN, { section: 1, lines: [], bossDead: false, ...showing }, pictures(monster));
  return frame;
};

/** Section 1's monsters are all colour set 2, so their pictures are drawn at base 0x20. */
const MONSTER_BASE = 0x20;
/** The panels take the section's own wall colours, entries 16 to 31. */
const PANEL_BASE = 0x10;
/** The slab is drawn in the picture bank, at the base FUN_3000_9004 sets. */
const SLAB_BASE = 0x23;

describe('the S key screen', () => {
  it('fills the five panels with the wall material in the section wall colours', () => {
    const frame = drawn();
    // Inside the first panel but above the monster's own rectangle.
    expect(pixelAt(frame, 5, 700)).toBe(WALL_BODY + PANEL_BASE);
    expect(pixelAt(frame, 1590, 700)).toBe(WALL_BODY + PANEL_BASE);
    // The gap between the first two panels is the black the screen was cleared to.
    expect(pixelAt(frame, 310, 700)).toBe(0);
    // And so is everything below them: the panels stop at 1150.
    expect(pixelAt(frame, 5, 1160)).toBe(0);
  });

  it('stands each monster in its panel', () => {
    const frame = drawn();
    expect(pixelAt(frame, 100, 800)).toBe(LEFT + MONSTER_BASE);
    expect(pixelAt(frame, 1400, 800)).toBe(LEFT + MONSTER_BASE);
  });

  it('mirrors the fifth monster and no other', () => {
    const frame = drawn({}, twoSided());
    // The fourth panel's picture runs from 999 to 1240 and the fifth's the other way round, from
    // 1565 back to 1325, which is what scale_image2 draws mirrored.
    expect(pixelAt(frame, 1020, 800)).toBe(LEFT + MONSTER_BASE);
    expect(pixelAt(frame, 1200, 800)).toBe(RIGHT + MONSTER_BASE);
    expect(pixelAt(frame, 1340, 800)).toBe(RIGHT + MONSTER_BASE);
    expect(pixelAt(frame, 1550, 800)).toBe(LEFT + MONSTER_BASE);
  });

  it('lifts the tablet slab to the top of the screen', () => {
    const frame = drawn();
    // DS:2412 of 2 moves the slab up by 0x122, so it runs from row 0 to row 630 rather than
    // across the middle, and the band between it and the panels is black.
    expect(pixelAt(frame, 800, 5)).toBe(WALL_BODY + SLAB_BASE);
    expect(pixelAt(frame, 800, 620)).toBe(WALL_BODY + SLAB_BASE);
    expect(pixelAt(frame, 800, 660)).toBe(0);
  });

  it("stands each of the game's own sections on the five monsters of its own table", () => {
    for (const section of data.sections) {
      expect(sectionMonsterRecords(section.section), `section ${section.section}`).toEqual(
        section.monsters.map((monster) => ({
          picnum: monster.picnum,
          colorSet: monster.colorSet,
          color: monster.color,
          section: section.section,
        })),
      );
    }
  });

  it('takes the slab tint from the monster drawn just before it', () => {
    // monster_manual leaves DS:4fbd holding the fifth panel's monster, which is the section's
    // first ordinary one — the Gargalon, whose colour byte is 52.
    expect(sectionSlabTint(1)).toBe(52);
  });

  it('cuts the fat dark pass of the DEAD stamp only over a boss already beaten', () => {
    const black = (frame: Frame): number => {
      let count = 0;
      for (let y = 850; y <= 930; y++) for (let x = 25; x <= 275; x++) if (pixelAt(frame, x, y) === 0) count += 1;
      return count;
    };
    expect(black(drawn())).toBe(0);
    expect(black(drawn({ bossDead: true }))).toBeGreaterThan(0);
  });

  it('draws the fat pass of the section words on the slab', () => {
    const frame = drawn({ lines: ['IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII'] });
    let found = 0;
    for (let x = 100; x < 1500; x++) if (pixelAt(frame, x, 100) === 14) found += 1;
    expect(found).toBeGreaterThan(0);
  });

  it('draws what it can when the pictures are missing', () => {
    const frame = newFrame(SCREEN.width, SCREEN.height);
    const none: ViewPictures = { wall: null, overlay: null, monster: () => null, ladder: () => null };
    drawSectionScreen(frame, SCREEN, { section: 1, lines: [], bossDead: false }, none);
    expect(pixelAt(frame, 5, 700)).toBe(0);
  });
});
