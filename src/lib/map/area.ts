import { DUNGEON_XMAX as MW_DUNGEON_XMAX, DUNGEON_YMAX as MW_DUNGEON_YMAX } from '../game/mwmap.js';
import { COLUMNS as REVENGE_COLUMNS, ROWS as REVENGE_ROWS } from '../game/revmap.js';
import { DUNGEON_XMAX, DUNGEON_YMAX } from '../game/unfmap.js';
import type { Point } from './viewport';

/** How much of a floor one game shows and lets you walk on, counted from the north-west corner. */
export interface MapArea {
  columns: number;
  rows: number;
}

/**
 * How much of a floor Dungeons of the Unforgiven itself shows and lets you walk on. The game
 * keeps the size in two globals, DS:2328 = 79 columns and DS:232a = 104 rows, and checks a
 * destination square against them in relocate (exe 3000:da2c), pass_wall (exe 3000:e003) and
 * go_away. The generator fills the whole 80 x 110 grid, so column 79 and rows 104 to 109 exist
 * and can hold open squares that no step ever reaches.
 *
 * The map draws one square further than a step can reach: FUN_2000_7210 (exe 2000:7210) takes
 * the same two globals as the last column and row rather than as counts, so column 79 and row 104
 * are drawn when something has marked them known.
 */
export const MAP_COLUMNS = DUNGEON_XMAX;
export const MAP_ROWS = DUNGEON_YMAX;

export const UNFORGIVEN_AREA: MapArea = { columns: MAP_COLUMNS, rows: MAP_ROWS };

/**
 * How much of a floor Moraff's World shows and lets you walk on: 79 columns and all 110 rows.
 * Its two globals are DAT_6000_448b = 79 and DAT_6000_448d = 110, and movecontrol refuses a
 * step that would leave `0 <= x < 79` and `0 <= y < 110`. wall_side walls off the west side of
 * column 79 and everything past it, so the generator's last column is enclosed and unreachable,
 * while every row it makes is walked on.
 */
export const MORAFFS_WORLD_AREA: MapArea = { columns: MW_DUNGEON_XMAX, rows: MW_DUNGEON_YMAX };

/**
 * How much of a floor Moraff's Revenge shows: all of it. The move code stops the player at
 * column 1 (1000:33A3) and column 20 (1000:3223), at row 1 (1000:3167) and at row 19
 * (1000:32E5), and the map's own row loop is FOR row = 1 TO 19. The generator makes exactly
 * that, so every square it makes is one the game draws and walks on.
 */
export const MORAFFS_REVENGE_AREA: MapArea = { columns: REVENGE_COLUMNS, rows: REVENGE_ROWS };

/**
 * Whether a square is one of the squares the game shows.
 *
 * A negative coordinate is off the map on the other side. Moraff's Revenge is where that comes
 * up: an empty slot of its `1.NUM` names the square north-west of the corner the game draws from.
 */
export function isOnMap(point: Point, area: MapArea): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < area.columns && point.y < area.rows;
}

/** Visits every square of a floor that is inside that area, row by row from the north-west. */
export function forEachShownSquare<Square>(rows: Square[][], area: MapArea, visit: (square: Square, x: number, y: number) => void): void {
  const lastRow = Math.min(rows.length, area.rows);
  for (let y = 0; y < lastRow; y++) {
    const row = rows[y];
    const lastColumn = Math.min(row.length, area.columns);
    for (let x = 0; x < lastColumn; x++) visit(row[x], x, y);
  }
}
