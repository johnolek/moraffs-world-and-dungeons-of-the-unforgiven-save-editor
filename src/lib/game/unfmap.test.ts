import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bundledDungeon } from './dungeon';
import { floorBounds, summarizeFloor, type FloorSummary } from './floor-summary';
import { MAP_ROWS } from '../map/area';
import { floorsOf, UNFORGIVEN_MAP } from '../map/game';
import { BOTTOM_LEVEL, HEIGHT, WIDTH, render, type Dungeon, type Square } from './unfmap.js';

// Both fixtures were produced by the verified generator (dotu-tools/reference/make_fixtures.mjs).
// A single differing character means the port is wrong.

function fixtureFloors(): { module: number; floor: number; lines: string[] }[] {
  const text = readFileSync('dotu-tools/fixtures/floors.txt', 'utf8');
  const blocks = text.split(/^=== Module (\d+) floor (\d+) ===\n/m).slice(1);
  const floors = [];
  for (let i = 0; i < blocks.length; i += 3) {
    floors.push({ module: +blocks[i], floor: +blocks[i + 1], lines: blocks[i + 2].trimEnd().split('\n') });
  }
  return floors;
}

describe('bundled dungeon', () => {
  it.each(fixtureFloors())('renders module $module floor $floor like the fixture', ({ module, floor, lines }) => {
    expect(render(bundledDungeon.floor(floor, module - 1))).toEqual(lines);
  });

  const fixtureSummaries: FloorSummary[] = JSON.parse(readFileSync('dotu-tools/fixtures/floor-summary.json', 'utf8'));

  it.each([1, 2, 3, 4, 5])('counts every feature of every floor of module %i like the fixture', (module) => {
    const expected = fixtureSummaries.filter((summary) => summary.module === module);
    const actual = floorsOf(UNFORGIVEN_MAP, module - 1).map((floor) => summarizeFloor(bundledDungeon, floor, module - 1, HEIGHT));
    expect(actual).toEqual(expected);
  });
});

describe('a module told where its bottom is', () => {
  const MODULE_I = 0;
  const DEEPEST_FLOOR = BOTTOM_LEVEL[MODULE_I] - 1;

  it('generates the floor it always did when told the bottom it already has', () => {
    expect(bundledDungeon.floor(DEEPEST_FLOOR, MODULE_I, true, BOTTOM_LEVEL[MODULE_I])).toEqual(
      bundledDungeon.floor(DEEPEST_FLOOR, MODULE_I),
    );
  });

  it('lets ladders, trap doors and chutes reach past the bottom it had', () => {
    const asIs = bundledDungeon.floor(DEEPEST_FLOOR, MODULE_I).flat();
    const deeper = bundledDungeon.floor(DEEPEST_FLOOR, MODULE_I, true, BOTTOM_LEVEL[1]).flat();
    expect(deeper.some((square, i) => square.ladder > 0 && asIs[i].ladder === 0)).toBe(true);
    expect(deeper.some((square, i) => square.trapdoor > asIs[i].trapdoor)).toBe(true);
    expect(deeper.some((square, i) => square.chute > 0 && asIs[i].chute === 0)).toBe(true);
  });
});

describe('summarizeFloor', () => {
  it('asks for no trap door landing on a floor with no open square', () => {
    const solidRows = Array.from({ length: HEIGHT }, () =>
      Array.from({ length: WIDTH }, () => ({ n: 0, s: 0, w: 0, e: 0, solid: true, ladder: 0, chute: 0, trapdoor: -1, town: 0 }) as Square),
    );
    const solidDungeon = {
      floor: () => solidRows,
      trapdoorDest: () => {
        throw new Error('trapdoorDest would search for ever');
      },
    } as unknown as Dungeon;
    const summary = summarizeFloor(solidDungeon, 7, 0, HEIGHT);
    expect(summary.open).toBe(0);
    expect(summary.trapdoorLanding).toBeUndefined();
  });

  it('counts a square on a row the game never shows only when asked for every row', () => {
    const rows = Array.from({ length: HEIGHT }, () =>
      Array.from({ length: WIDTH }, () => ({ n: 0, s: 0, w: 0, e: 0, solid: true, ladder: 0, chute: 0, trapdoor: -1, town: 0 }) as Square),
    );
    rows[3][2] = { ...rows[3][2], solid: false };
    rows[MAP_ROWS][2] = { ...rows[MAP_ROWS][2], solid: false };
    const dungeon = { floor: () => rows, trapdoorDest: () => [2, 3] } as unknown as Dungeon;
    expect(summarizeFloor(dungeon, 7, 0, MAP_ROWS).open).toBe(1);
    expect(summarizeFloor(dungeon, 7, 0, HEIGHT).open).toBe(2);
  });
});

describe('floorBounds', () => {
  it('frames the open squares of a floor', () => {
    const rows = bundledDungeon.floor(1, 0);
    const bounds = floorBounds(rows, MAP_ROWS);
    expect(bounds.minX).toBeGreaterThanOrEqual(0);
    expect(bounds.maxX).toBeLessThanOrEqual(79);
    for (let y = 0; y < MAP_ROWS; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        if (!rows[y][x].solid) {
          expect(x).toBeGreaterThanOrEqual(bounds.minX);
          expect(x).toBeLessThanOrEqual(bounds.maxX);
          expect(y).toBeGreaterThanOrEqual(bounds.minY);
          expect(y).toBeLessThanOrEqual(bounds.maxY);
        }
      }
    }
    expect(rows.some((row) => !row[bounds.minX].solid)).toBe(true);
    expect(rows[bounds.minY].some((square) => !square.solid)).toBe(true);
    expect(rows[bounds.maxY].some((square) => !square.solid)).toBe(true);
  });

  it('leaves out the rows the game cannot walk into', () => {
    const rows = bundledDungeon.floor(1, 0);
    expect(rows[109].some((square) => !square.solid)).toBe(true);
    expect(floorBounds(rows, MAP_ROWS).maxY).toBe(MAP_ROWS - 1);
  });
});
