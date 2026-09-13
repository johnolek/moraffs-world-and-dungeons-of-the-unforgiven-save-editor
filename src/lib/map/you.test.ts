import { describe, expect, it } from 'vitest';
import type { Square } from '../game/unfmap.js';
import { MAP_COLUMNS, MAP_ROWS, UNFORGIVEN_AREA } from './area';
import {
  arrowPixel,
  ARROW_FLASH_MS,
  FACING_ARROW_SIZE,
  facingArrowCells,
  nearestOpenSquare,
  stepFrom,
  youAlpha,
  youArrow,
  youFlash,
} from './you';

/** A floor from a picture: '#' is rock, '.' is an open square. */
function floorOf(picture: string[]): Square[][] {
  return picture.map((line) =>
    [...line].map((char) => ({ n: 0, s: 0, w: 0, e: 0, solid: char === '#', ladder: 0, chute: 0, trapdoor: -1, town: 0 })),
  );
}

describe('nearestOpenSquare', () => {
  it('stays put when the square is open', () => {
    expect(nearestOpenSquare(floorOf(['...', '...']), { x: 2, y: 1 }, UNFORGIVEN_AREA)).toEqual({ x: 2, y: 1 });
  });

  it('takes the fewest steps to an open square', () => {
    const rows = floorOf(['#####', '##.##', '#####', '#...#']);
    expect(nearestOpenSquare(rows, { x: 2, y: 2 }, UNFORGIVEN_AREA)).toEqual({ x: 2, y: 1 });
    expect(nearestOpenSquare(rows, { x: 4, y: 3 }, UNFORGIVEN_AREA)).toEqual({ x: 3, y: 3 });
  });

  it('breaks a tie on the smaller y, then the smaller x', () => {
    // (1, 0) and (0, 1) are both one step from (1, 1), and so are (0, 1) and (2, 1).
    expect(nearestOpenSquare(floorOf(['#.#', '.##', '###']), { x: 1, y: 1 }, UNFORGIVEN_AREA)).toEqual({ x: 1, y: 0 });
    expect(nearestOpenSquare(floorOf(['###', '.#.', '###']), { x: 1, y: 1 }, UNFORGIVEN_AREA)).toEqual({ x: 0, y: 1 });
  });

  it('finds nowhere to stand on a floor of solid rock', () => {
    expect(nearestOpenSquare(floorOf(['##', '##']), { x: 0, y: 0 }, UNFORGIVEN_AREA)).toBeNull();
  });

  it('ignores the open squares outside the area the game shows', () => {
    const picture = Array.from({ length: MAP_ROWS + 2 }, () => '#'.repeat(MAP_COLUMNS + 1));
    picture[MAP_ROWS] = `.${'#'.repeat(MAP_COLUMNS)}`;
    picture[0] = `${'#'.repeat(MAP_COLUMNS)}.`;
    expect(nearestOpenSquare(floorOf(picture), { x: 0, y: 0 }, UNFORGIVEN_AREA)).toBeNull();
  });
});

/** An open square whose four sides are open, unless a side is given another value. */
function open(overrides: Partial<Square> = {}): Square {
  return { n: 3, s: 3, w: 3, e: 3, solid: false, ladder: 0, chute: 0, trapdoor: -1, town: 0, ...overrides };
}

describe('stepFrom', () => {
  const room = [
    [open(), open()],
    [open(), open()],
  ];
  const openFloor = Array.from({ length: MAP_ROWS + 2 }, () => Array.from({ length: MAP_COLUMNS + 1 }, () => open()));

  it('steps one square in each of the four directions', () => {
    expect(stepFrom(room, { x: 1, y: 1 }, 0, -1, UNFORGIVEN_AREA)).toEqual({ x: 1, y: 0 });
    expect(stepFrom(room, { x: 0, y: 0 }, 0, 1, UNFORGIVEN_AREA)).toEqual({ x: 0, y: 1 });
    expect(stepFrom(room, { x: 1, y: 1 }, -1, 0, UNFORGIVEN_AREA)).toEqual({ x: 0, y: 1 });
    expect(stepFrom(room, { x: 0, y: 0 }, 1, 0, UNFORGIVEN_AREA)).toEqual({ x: 1, y: 0 });
  });

  it('walks through a door and a secret door as well as an open side', () => {
    expect(stepFrom([[open({ e: 1 }), open()]], { x: 0, y: 0 }, 1, 0, UNFORGIVEN_AREA)).toEqual({ x: 1, y: 0 });
    expect(stepFrom([[open({ e: 2 }), open()]], { x: 0, y: 0 }, 1, 0, UNFORGIVEN_AREA)).toEqual({ x: 1, y: 0 });
  });

  it('is stopped by a wall and by a teleporter side', () => {
    expect(stepFrom([[open({ e: 0 }), open()]], { x: 0, y: 0 }, 1, 0, UNFORGIVEN_AREA)).toBeNull();
    expect(stepFrom([[open({ e: 4 }), open()]], { x: 0, y: 0 }, 1, 0, UNFORGIVEN_AREA)).toBeNull();
  });

  it('stops at the edge of the floor', () => {
    expect(stepFrom(room, { x: 0, y: 0 }, -1, 0, UNFORGIVEN_AREA)).toBeNull();
    expect(stepFrom(room, { x: 0, y: 0 }, 0, -1, UNFORGIVEN_AREA)).toBeNull();
  });

  it('never steps beyond the area the game shows', () => {
    expect(stepFrom(openFloor, { x: MAP_COLUMNS - 2, y: 5 }, 1, 0, UNFORGIVEN_AREA)).toEqual({ x: MAP_COLUMNS - 1, y: 5 });
    expect(stepFrom(openFloor, { x: MAP_COLUMNS - 1, y: 5 }, 1, 0, UNFORGIVEN_AREA)).toBeNull();
    expect(stepFrom(openFloor, { x: 5, y: MAP_ROWS - 1 }, 0, 1, UNFORGIVEN_AREA)).toBeNull();
  });

  it('goes nowhere on a direction that is not one step along an axis', () => {
    expect(stepFrom(room, { x: 0, y: 0 }, 1, 1, UNFORGIVEN_AREA)).toBeNull();
    expect(stepFrom(room, { x: 0, y: 0 }, 0, 0, UNFORGIVEN_AREA)).toBeNull();
  });
});

describe('youAlpha', () => {
  it('pulses between two opacities once a second', () => {
    expect(youAlpha(250)).toBeCloseTo(0.85);
    expect(youAlpha(750)).toBeCloseTo(0.3);
    expect(youAlpha(1250)).toBeCloseTo(youAlpha(250));
  });
});

describe('youFlash', () => {
  it('turns white and black over every six BIOS ticks', () => {
    expect(youFlash(0)).toBe('#ffffff');
    expect(youFlash(ARROW_FLASH_MS - 1)).toBe('#ffffff');
    expect(youFlash(ARROW_FLASH_MS)).toBe('#000000');
    expect(youFlash(2 * ARROW_FLASH_MS)).toBe('#ffffff');
  });

  it('is never the half-lit white the other two games are marked in', () => {
    const colours = new Set(Array.from({ length: 40 }, (_, step) => youFlash(step * 50)));
    expect([...colours].sort()).toEqual(['#000000', '#ffffff']);
  });
});

describe('youArrow', () => {
  /** The middle of the side the arrowhead's tip should sit on, by the facing. */
  const tips = [
    { x: 0.5, y: 0 },
    { x: 0.5, y: 1 },
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
  ];

  it('puts the tip on the side the character faces', () => {
    tips.forEach((tip, dir) => expect(youArrow(dir)[0]).toEqual(tip));
  });

  it('fills the square it is drawn in without leaving it', () => {
    for (let dir = 0; dir < 4; dir++) {
      const corners = youArrow(dir);
      expect(corners).toHaveLength(4);
      expect(corners.every((corner) => corner.x >= 0 && corner.x <= 1 && corner.y >= 0 && corner.y <= 1)).toBe(true);
      expect(Math.max(...corners.map((corner) => corner.x)) - Math.min(...corners.map((corner) => corner.x))).toBe(1);
      expect(Math.max(...corners.map((corner) => corner.y)) - Math.min(...corners.map((corner) => corner.y))).toBe(1);
    }
  });

  it('notches the back of the arrowhead behind the tip', () => {
    // The third corner is the notch: on the line the tip is on, and short of the back.
    expect(youArrow(0)[2]).toEqual({ x: 0.5, y: 0.72 });
    expect(youArrow(3)[2]).toEqual({ x: 0.28, y: 0.5 });
  });
});

describe("the arrow the game's own map marks the character with", () => {
  it('turns it by the way the character faces', () => {
    // The point of the arrow is the middle of its top row, and it swings to the matching side.
    expect(arrowPixel(0, 100, 100, 4, 0)).toEqual({ x: 103, y: 99 });
    expect(arrowPixel(1, 100, 100, 4, 0)).toEqual({ x: 103, y: 107 });
    expect(arrowPixel(2, 100, 100, 4, 0)).toEqual({ x: 99, y: 103 });
    expect(arrowPixel(3, 100, 100, 4, 0)).toEqual({ x: 107, y: 103 });
  });

  it('fills the same 37 cells of a nine by nine grid whichever way it faces', () => {
    for (let dir = 0; dir < 4; dir++) {
      const cells = facingArrowCells(dir);
      expect(cells).toHaveLength(37);
      const inside = (along: number) => along >= 0 && along < FACING_ARROW_SIZE;
      expect(cells.every((cell) => inside(cell.x) && inside(cell.y))).toBe(true);
    }
  });

  it('puts the point of the arrow on the side the character faces', () => {
    const middle = FACING_ARROW_SIZE >> 1;
    const points = [
      { x: middle, y: 0 },
      { x: middle, y: FACING_ARROW_SIZE - 1 },
      { x: 0, y: middle },
      { x: FACING_ARROW_SIZE - 1, y: middle },
    ];
    points.forEach((point, dir) => expect(facingArrowCells(dir)).toContainEqual(point));
  });
});
