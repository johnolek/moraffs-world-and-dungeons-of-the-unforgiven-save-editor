import { describe, expect, it } from 'vitest';
import { sectionInfo } from '../game/sections';
import { BOTTOM_LEVEL } from '../game/unfmap.js';
import { newFrame, pixelAt } from '../play/view3d/frame';
import { WALL_BASE, WALL_GRADIENT, WALL_TINT } from '../play/view3d/pictures';
import { drawWallFace, type PicRowImage } from '../play/view3d/texture';
import { renderWallTexture, wallTexture, wallTilePattern } from './wall-texture';

/** The file each of the twenty sections draws its walls from, section 1 first. */
const EXPECTED_FILES = [1, 2, 3, 4, 2, 3, 1, 4, 1, 2, 3, 1, 2, 1, 3, 2, 3, 2, 1, 4].map((n) => `ufwall${n}.pic`);

/** How many wall colour sets Moraff's World rotates through. */
const WALL_SETS = 11;

/** The file the walls of every section of every module come out as, found by walking the floors. */
function filesBySection(): Map<number, string> {
  const files = new Map<number, string>();
  for (let module = 0; module < BOTTOM_LEVEL.length; module++) {
    for (let floor = 0; floor <= BOTTOM_LEVEL[module]; floor++) {
      const section = sectionInfo(module, floor)!.section;
      files.set(section, wallTexture('unforgiven', module, floor)!.file);
    }
  }
  return files;
}

/** A floor of the given module that belongs to the given section. */
function floorInSection(module: number, section: number): number {
  for (let floor = 0; floor <= BOTTOM_LEVEL[module]; floor++) {
    if (sectionInfo(module, floor)!.section === section) return floor;
  }
  throw new Error(`module ${module} has no section ${section}`);
}

const opaquePixels = (data: Uint8ClampedArray) => {
  let count = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] === 255) count++;
  return count;
};

describe('the wall texture of a Dungeons of the Unforgiven floor', () => {
  it('draws each section from the wall picture its name table names', () => {
    const files = filesBySection();
    expect(files.size).toBe(EXPECTED_FILES.length);
    expect(EXPECTED_FILES.map((_, index) => files.get(index + 1))).toEqual(EXPECTED_FILES);
  });

  it('gives the four sections of the first module a wall picture each', () => {
    expect(wallTexture('unforgiven', 0, 0)).toMatchObject({ file: 'ufwall1.pic' });
    expect(wallTexture('unforgiven', 0, 6)).toMatchObject({ file: 'ufwall2.pic' });
    expect(wallTexture('unforgiven', 0, 11)).toMatchObject({ file: 'ufwall3.pic' });
    expect(wallTexture('unforgiven', 0, 16)).toMatchObject({ file: 'ufwall4.pic' });
  });

  it('draws two sections that share a wall picture in their own colours', () => {
    // Sections 1 and 7 both draw from ufwall1.pic, one in the first module and one in the second.
    const first = wallTexture('unforgiven', 0, floorInSection(0, 1))!;
    const seventh = wallTexture('unforgiven', 1, floorInSection(1, 7))!;
    expect(seventh.file).toBe(first.file);
    expect(seventh.key).not.toBe(first.key);
    expect(seventh.palette).not.toEqual(first.palette);
  });

  it('has none for the floors below the town, which belong to no section', () => {
    expect(wallTexture('unforgiven', 0, -5)).toBeNull();
  });
});

describe("the wall texture of a Moraff's World floor", () => {
  it('draws every floor from the one wall in WALL.PIC', () => {
    for (const floor of [0, 1, 42, 202]) {
      expect(wallTexture('moraffsWorld', 0, floor)).toMatchObject({ file: 'wall.pic', image: 1 });
    }
  });

  it('recolours it by the floor modulo eleven', () => {
    expect(wallTexture('moraffsWorld', 0, 3)!.key).toBe(wallTexture('moraffsWorld', 0, 3 + WALL_SETS)!.key);
    expect(wallTexture('moraffsWorld', 0, 3)!.palette).not.toEqual(wallTexture('moraffsWorld', 0, 4)!.palette);
  });
});

describe('renderWallTexture', () => {
  it("draws Dungeons of the Unforgiven's wall in the section's own colours", () => {
    // The wall drawer adds DS:4fc3, which holds 16 and is never written, so every pixel of a
    // wall material lands in palette entries 16 to 31 (exe 4000:549d).
    const texture = wallTexture('unforgiven', 0, 1)!;
    const bank = new Set(texture.palette.slice(16, 32).map((colour) => colour.join()));
    const { data } = renderWallTexture(texture)!;
    const used = new Set<string>();
    for (let at = 0; at < data.length; at += 4) {
      if (data[at + 3] === 255) used.add([data[at], data[at + 1], data[at + 2]].join());
    }
    expect(used.size).toBeGreaterThan(1);
    expect([...used].filter((colour) => !bank.has(colour))).toEqual([]);
  });

  it("draws a whole 256 by 200 wall of Moraff's World", () => {
    const image = renderWallTexture(wallTexture('moraffsWorld', 0, 1)!)!;
    expect([image.width, image.height]).toEqual([256, 200]);
    expect(opaquePixels(image.data)).toBe(image.width * image.height);
  });

  it('draws the same floor the same way and two colour sets differently', () => {
    const first = renderWallTexture(wallTexture('moraffsWorld', 0, 1)!)!;
    expect(renderWallTexture(wallTexture('moraffsWorld', 0, 1 + WALL_SETS)!)!.data).toEqual(first.data);
    expect(renderWallTexture(wallTexture('moraffsWorld', 0, 2)!)!.data).not.toEqual(first.data);
  });
});

describe("Moraff's Revenge", () => {
  it('has no wall texture, since nothing has read its wall pictures', () => {
    expect(wallTexture('revenge', 1, 1)).toBeNull();
  });
});

describe('the swatch and the wall faces of the 3-D view', () => {
  /** A picture whose every pixel is the one value, so a face painted from it is that value. */
  const solid = (colour: number): PicRowImage =>
    Array.from({ length: 200 }, () => ({ startX: 0, runs: [{ colour, length: 255 }] }));

  /**
   * The colour the view gives a pixel of this value on a plain wall face, read from the face's
   * leftmost column. Values 18 and 19 are drawn by the screen column rather than by the picture,
   * and column zero is the one the swatch stands in.
   */
  function faceColour(value: number): number {
    const frame = newFrame(40, 40);
    drawWallFace(frame, 0, 20, 8, 8, 24, 24, solid(value), 0, 392, {
      base: WALL_BASE,
      tint: WALL_TINT,
      gradient: WALL_GRADIENT,
    });
    return pixelAt(frame, 0, 16);
  }

  it('give a pixel of the same value the same colour', () => {
    const texture = wallTexture('unforgiven', 0, 1)!;
    for (const value of [16, 17, 18]) {
      expect([value, texture.pixelIndex(value, 0)]).toEqual([value, faceColour(value)]);
    }
  });
});

describe('the tile behind the map', () => {
  /** A canvas context that hands back a pattern and remembers how it was asked for and what was
   *  done to it afterwards. */
  function patternContext() {
    const asked: string[] = [];
    const transformed: unknown[] = [];
    const pattern = { setTransform: (matrix: unknown) => transformed.push(matrix) } as unknown as CanvasPattern;
    const ctx = {
      createPattern: (_tile: CanvasImageSource, repetition: string) => {
        asked.push(repetition);
        return pattern;
      },
    } as unknown as CanvasRenderingContext2D;
    return { ctx, asked, transformed, pattern };
  }

  const tile = {} as CanvasImageSource;

  it('repeats across the canvas', () => {
    const { ctx, asked, pattern } = patternContext();
    expect(wallTilePattern(ctx, tile)).toBe(pattern);
    expect(asked).toEqual(['repeat']);
  });

  it('is anchored to the canvas, so zooming the map cannot move it', () => {
    const { ctx, transformed } = patternContext();
    wallTilePattern(ctx, tile);
    expect(transformed).toEqual([]);
  });
});
