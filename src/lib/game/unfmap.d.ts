export const DUNGEON_XMAX: 79;
export const DUNGEON_YMAX: 104;
export const NUM_PATTERNS: 25;
/** Bottom floor of each module, indexed by module 0..4. */
export const BOTTOM_LEVEL: readonly [25, 45, 65, 85, 105];
export const WIDTH: 80;
export const HEIGHT: 110;

/** 0 wall, 1 door, 2 secret door, 3 open, 4 module teleporter (side2 only). */
export type Side = 0 | 1 | 2 | 3 | 4;

export interface Sides {
  n: Side;
  s: Side;
  w: Side;
  e: Side;
}

export interface Square extends Sides {
  /** Rock: all four sides are walls, never enterable. */
  solid: boolean;
  /** Floor offset of the ladder here: >0 down, <0 up, 0 none. */
  ladder: number;
  /** Floor this chute drops to, 0 when there is no chute. */
  chute: number;
  /** Trap door destination floor (multiple of 5), -1 when none. */
  trapdoor: number;
  /** Floor 0 only: 1 store, 2 temple, 3 bank, 4 inn, 0 nothing. */
  town: number;
}

export function myrand(x: number, y: number, level: number, dungeon: number, rng: number): number;

export class BorlandRand {
  constructor(seed: number);
  rand(): number;
  random(n: number): number;
}

export class Dungeon {
  /** @param dwall the 12,800 bytes of UNFDUNG.BIN */
  constructor(dwall: Uint8Array);
  dwall: Uint8Array;
  /** hv 0: side west of (x, y); hv 1: side north of (x, y). Never returns 4. */
  side(x: number, y: number, hv: 0 | 1, level: number, dungeon: number): Side;
  /** Like side() but reports 4 for module teleporters. */
  side2(x: number, y: number, hv: 0 | 1, level: number, dungeon: number): Side;
  sides(x: number, y: number, level: number, dungeon: number, teleporters?: boolean): Sides;
  solid(x: number, y: number, level: number, dungeon: number): boolean;
  /** @param bottom the module's deepest floor, which a ladder down stops above; the module's own
   *    unless a caller moves it. */
  ladder(x: number, y: number, level: number, dungeon: number, bottom?: number): number;
  townFeature(x: number, y: number, dungeon: number): number;
  trapdoor(x: number, y: number, level: number, dungeon: number, bottom?: number): number;
  chute(x: number, y: number, level: number, dungeon: number, bottom?: number): number;
  /** The (x, y) every trap door to `level` lands on. */
  trapdoorDest(level: number, dungeon: number): [number, number];
  /** Whole floor as rows[y][x]. */
  floor(level: number, dungeon: number, teleporters?: boolean, bottom?: number): Square[][];
}

/** ASCII rendering shared with unfmap.py, for cross-checking ports. */
export function render(rows: Square[][]): string[];
