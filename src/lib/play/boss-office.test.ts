import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawBossOffice } from './boss-office';
import { SCREEN_PIXELS } from './display';
import { NO_PICTURES, type ViewPictures } from './view3d/pictures';
import { sectionMonsterRecords } from './section-screen';
import { SLAB_BASE } from './tablet';
import { newFrame, pixelAt, type Frame } from './view3d/frame';
import { parsePicRows } from './view3d/texture';

/** Section 1, whose Shadow boss is the one the panel stands. */
const SECTION = 1;

const pictures = (file: string) => parsePicRows(readFileSync(`src/lib/game/pics/${file}`));

const sectionPictures = (): ViewPictures => {
  const own = pictures(`ufmon${SECTION}.pic`);
  return {
    ...NO_PICTURES,
    wall: pictures(`ufwall${SECTION}.pic`),
    monster: (picnum) => own?.[picnum - 7] ?? null,
  };
};

/** Four lines of a taunt, standing in for whatever UH2.BIN holds for this section. */
const TAUNT = ['I HAVE BEEN WATCHING YOU', 'AND I AM NOT IMPRESSED', '', 'THE SHADOW'];

function draw(from: ViewPictures, lines: string[] = TAUNT): Frame {
  const frame = newFrame(SCREEN_PIXELS.width, SCREEN_PIXELS.height);
  drawBossOffice(frame, SCREEN_PIXELS, { section: SECTION, lines }, from);
  return frame;
}

/** A point of the 1600 by 1200 grid as the drawer puts it on the screen (exe 4000:4929). */
const atX = (x: number) => Math.trunc(((SCREEN_PIXELS.width - 1) * x) / 1599);
const atY = (y: number) => Math.trunc(((SCREEN_PIXELS.height - 1) * y) / 1199);

/** Every palette entry drawn inside a rectangle of the 1600 by 1200 grid, less the untouched 0. */
function entriesIn(frame: Frame, x1: number, y1: number, x2: number, y2: number): Set<number> {
  const used = new Set<number>();
  for (let y = atY(y1); y <= atY(y2); y++) {
    for (let x = atX(x1); x <= atX(x2); x++) used.add(pixelAt(frame, x, y));
  }
  used.delete(0);
  return used;
}

describe("the panel beside the boss's taunt", () => {
  it('lays the section wall stone at the base the tablet left behind', () => {
    // A strip down the left of the panel, outside the rectangle the picture is stretched into.
    const used = entriesIn(draw(sectionPictures()), 4, 0x20, 0x14, 0x1c0);
    expect(used.size).toBeGreaterThan(1);
    for (const entry of used) {
      expect(entry).toBeGreaterThanOrEqual(SLAB_BASE);
      expect(entry).toBeLessThanOrEqual(SLAB_BASE + 31);
    }
  });

  it('stands the section Shadow boss inside it, in the colour set of its own record', () => {
    const boss = sectionMonsterRecords(SECTION)[0];
    const withBoss = entriesIn(draw(sectionPictures()), 0x19, 0x19, 0x145, 0x1d1);
    // The same panel with no picture to put in it, which is the stone on its own.
    const stone = entriesIn(draw({ ...sectionPictures(), monster: () => null }), 0x19, 0x19, 0x145, 0x1d1);
    const painted = [...withBoss].filter((entry) => !stone.has(entry));
    expect(painted.length).toBeGreaterThan(0);
    // A picture's pixels land in its own colour set's bank, except for values 29 to 31, which
    // read the gradient bank at 96 and up instead. The Gargalon this boss shares its picture
    // with has some of both.
    const base = boss.colorSet << 4;
    for (const entry of painted) {
      expect(entry >= base && entry <= base + 31).toBe(entry < 96);
    }
  });

  it('leaves the display bare between the panel and the tablet', () => {
    const frame = draw(sectionPictures());
    // Right of the panel, above the slab: where the three lines of the big font are printed,
    // which the tab draws over the picture rather than into it.
    expect([...entriesIn(frame, 0x16c + 4, 1, 0x63f, 0x218)]).toEqual([]);
  });

  it('lowers the tablet across the bottom, in the slab stone', () => {
    // The top of the slab, which DS:2412 = 3 drops from 0x122 to 0x21c, above where the fat
    // stroke of the first line of the taunt reaches.
    const used = entriesIn(draw(sectionPictures()), 0x100, 0x220, 0x500, 0x240);
    expect(used.size).toBeGreaterThan(1);
    for (const entry of used) {
      expect(entry).toBeGreaterThanOrEqual(SLAB_BASE);
      expect(entry).toBeLessThanOrEqual(SLAB_BASE + 31);
    }
  });

  it('cuts the taunt into the lowered slab', () => {
    // The two passes of the big font, a fat dark stroke and a thin bright one over it, on the
    // band the first line stands in.
    const used = entriesIn(draw(sectionPictures()), 100, 0x253, 0x5dc, 0x2a3);
    expect(used.has(14)).toBe(true);
    expect(used.has(15)).toBe(true);
  });

  it('lays the stone alone while the fade brings it up out of black', () => {
    const frame = newFrame(SCREEN_PIXELS.width, SCREEN_PIXELS.height);
    drawBossOffice(frame, SCREEN_PIXELS, { section: SECTION, lines: TAUNT, slabOnly: true }, sectionPictures());

    // The slab is there, in its own stone.
    const stone = entriesIn(frame, 0x100, 0x220, 0x500, 0x240);
    expect(stone.size).toBeGreaterThan(1);
    for (const entry of stone) {
      expect(entry).toBeGreaterThanOrEqual(SLAB_BASE);
      expect(entry).toBeLessThanOrEqual(SLAB_BASE + 31);
    }
    // The panel the boss stands in is not, and neither is the taunt: both are drawn once the
    // fade is over.
    expect([...entriesIn(frame, 1, 1, 0x168, 0x1ea)]).toEqual([]);
    const band = entriesIn(frame, 100, 0x253, 0x5dc, 0x2a3);
    expect(band.has(14)).toBe(false);
    expect(band.has(15)).toBe(false);
  });

  it('draws nothing at all with neither a picture nor a word', () => {
    const frame = newFrame(SCREEN_PIXELS.width, SCREEN_PIXELS.height);
    drawBossOffice(frame, SCREEN_PIXELS, { section: SECTION, lines: [] }, NO_PICTURES);
    expect([...entriesIn(frame, 1, 1, 0x63f, 0x4af)]).toEqual([]);
  });
});
