import { forEachShownSquare, isOnMap, type MapArea } from './area';
import type { MapSquare } from './game';
import { DIRECTIONS, passable } from './path';
import type { Point } from './viewport';

/** One pulse a second, between these two opacities. */
const PULSE_MS = 1000;
const DIMMEST = 0.3;
const BRIGHTEST = 0.85;

/** The open square nearest to `from` within the area the game shows, counting steps along the
 *  two axes, or null when that area is solid all the way through. `from` itself wins when it is
 *  open; among equally near squares the northernmost comes first, and then the westernmost. */
export function nearestOpenSquare(rows: MapSquare[][], from: Point, area: MapArea): Point | null {
  let best: Point | null = null;
  let bestDistance = Infinity;
  forEachShownSquare(rows, area, (square, x, y) => {
    if (square.solid) return;
    const distance = Math.abs(x - from.x) + Math.abs(y - from.y);
    if (distance >= bestDistance) return;
    best = { x, y };
    bestDistance = distance;
  });
  return best;
}

/**
 * Where one step from a square in the given direction lands, or null when nothing is there to
 * walk to: a wall or a teleporter side between the two squares, a step off the area the game
 * shows, or a direction that is not one of the four the party can walk in.
 */
export function stepFrom(rows: MapSquare[][], from: Point, dx: number, dy: number, area: MapArea): Point | null {
  const direction = DIRECTIONS.find((candidate) => candidate.dx === dx && candidate.dy === dy);
  if (!direction) return null;
  if (!passable(rows[from.y][from.x][direction.side])) return null;
  const to = { x: from.x + dx, y: from.y + dy };
  if (to.x < 0 || to.y < 0 || !isOnMap(to, area)) return null;
  return to;
}

/** How solid the marker showing where you stand is drawn at a moment in time. */
export function youAlpha(timeMs: number): number {
  const phase = (1 + Math.sin((timeMs / PULSE_MS) * 2 * Math.PI)) / 2;
  return DIMMEST + (BRIGHTEST - DIMMEST) * phase;
}

/**
 * `FUN_2000_9d17` (exe 2000:9d17, unf.c "FUN_2000_9d17"): the arrow Dungeons of the Unforgiven
 * marks the character's square with on its own map. Its point is at the top before the facing
 * turns it.
 *
 * The routine keeps four of these and picks between them by how many pixels a map square is: 5 x 5
 * at DS:0439, this one at DS:0443, 12 x 12 at DS:0455 and 7 x 7 at DS:046d. `FUN_2000_59c0` (exe
 * 2000:59c0) gives the square ten pixels in video classes 8, 9 and 10, and the port draws mode 9
 * alone, so this is the only one it ever needs.
 */
export const FACING_ARROW = [
  '    X    ',
  '   XXX   ',
  '  XXXXX  ',
  ' XXXXXXX ',
  'XX XXX XX',
  'X  XXX  X',
  '   XXX   ',
  '   XXX   ',
  '   XXX   ',
];

/** How many pixels across the arrow's bitmap is. */
export const FACING_ARROW_SIZE = FACING_ARROW.length;

/**
 * How far back a mirrored row is counted from. `FUN_2000_9d17` writes this down once per bitmap —
 * 2, 5, 7 and 10 for its four — and every one of them is two short of that bitmap's own width,
 * which is what lands the mirrored half over the same pixels the plain half covers.
 */
const MIRROR_FROM = FACING_ARROW_SIZE - 2;

/**
 * Where one pixel of that bitmap lands, given the corner of the character's cell. The four cases
 * are the original's own rotations, which mirror rather than turn for south and east.
 */
export function arrowPixel(
  facing: number,
  x: number,
  y: number,
  column: number,
  row: number,
): Point {
  if (facing === 1) return { x: x + column - 1, y: y - row + MIRROR_FROM };
  if (facing === 2) return { x: x + row - 1, y: y + column - 1 };
  if (facing === 3) return { x: x - row + MIRROR_FROM, y: y + column - 1 };
  return { x: x + column - 1, y: y + row - 1 };
}

/**
 * The squares of the arrow's own grid it fills when it is turned to face `dir`, for anything
 * drawing it at a size of its own.
 *
 * The rotations put a pixel anywhere from one before the corner they are given to two short of
 * the bitmap's width past it, so a corner of one puts the whole arrow between 0 and one short of
 * its width.
 */
export function facingArrowCells(dir: number): Point[] {
  const cells: Point[] = [];
  FACING_ARROW.forEach((line, row) => {
    for (let column = 0; column < line.length; column++) {
      if (line[column] === 'X') cells.push(arrowPixel(dir, 1, 1, column, row));
    }
  });
  return cells;
}

/** How far into the arrowhead the notch in its back is cut, as a fraction of its length. */
const NOTCH = 0.28;

/** The corners of the arrowhead that shows which way the character faces, as fractions of the
 *  square it is drawn in: the tip on the side faced, the two corners behind it, and the notch
 *  between those. Facing is the games' own: 0 north, 1 south, 2 west, 3 east. */
const ARROWS: Point[][] = [
  [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 1 - NOTCH }, { x: 0, y: 1 }],
  [{ x: 0.5, y: 1 }, { x: 0, y: 0 }, { x: 0.5, y: NOTCH }, { x: 1, y: 0 }],
  [{ x: 0, y: 0.5 }, { x: 1, y: 0 }, { x: 1 - NOTCH, y: 0.5 }, { x: 1, y: 1 }],
  [{ x: 1, y: 0.5 }, { x: 0, y: 1 }, { x: NOTCH, y: 0.5 }, { x: 0, y: 0 }],
];

export function youArrow(dir: number): Point[] {
  return ARROWS[dir];
}
