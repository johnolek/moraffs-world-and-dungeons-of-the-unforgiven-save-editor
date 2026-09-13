import { describe, expect, it } from 'vitest';
import { HEIGHT, WIDTH } from '../game/unfmap.js';
import { MAP_COLUMNS, MAP_ROWS } from './area';
import { drawFloor, drawSquare, drawYou } from './draw-floor';
import { UNFORGIVEN_MAP, type MapSquare } from './game';

function openFloor(): MapSquare[][] {
  return Array.from({ length: HEIGHT }, () =>
    Array.from({ length: WIDTH }, () => ({ n: 3, s: 3, w: 3, e: 3, solid: false, ladder: 0, chute: 0, trapdoor: -1, town: 0 }) as MapSquare),
  );
}

/** A canvas context that does nothing but remember the corner of every rectangle it fills. */
function recordingContext(fills: { x: number; y: number }[]): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: (_target, name) => (name === 'fillRect' ? (x: number, y: number) => fills.push({ x, y }) : () => {}),
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

describe('drawFloor', () => {
  it('draws only the squares the game itself shows', () => {
    const fills: { x: number; y: number }[] = [];
    // One pixel per square on a canvas large enough for every row the generator makes.
    drawFloor(recordingContext(fills), openFloor(), { cell: 1, originX: 0, originY: 0, width: WIDTH, height: HEIGHT, floor: 1, teleporterHue: null, game: UNFORGIVEN_MAP });
    // The first fill is the background; each square is filled one pixel in from its corner.
    const squares = fills.slice(1);
    expect(squares).toHaveLength(MAP_COLUMNS * MAP_ROWS);
    expect(Math.max(...squares.map((fill) => fill.x))).toBe(MAP_COLUMNS);
    expect(Math.max(...squares.map((fill) => fill.y))).toBe(MAP_ROWS);
  });

  it('washes the squares a loaded explored map has seen', () => {
    const fills: { x: number; y: number }[] = [];
    const options = { cell: 1, originX: 0, originY: 0, width: WIDTH, height: HEIGHT, floor: 1, teleporterHue: null, game: UNFORGIVEN_MAP };
    drawFloor(recordingContext(fills), openFloor(), { ...options, explored: (x, y) => x === 2 && y === 3 });
    // The seen square is filled twice, once for the square itself and once for the wash.
    expect(fills.filter((fill) => fill.x === 3 && fill.y === 4)).toHaveLength(2);
    expect(fills.filter((fill) => fill.x === 4 && fill.y === 4)).toHaveLength(1);
  });

  it('fills a seen square this dungeon makes rock, which nothing else draws', () => {
    const rock = openFloor();
    rock[3][2] = { ...rock[3][2], solid: true };
    const options = { cell: 1, originX: 0, originY: 0, width: WIDTH, height: HEIGHT, floor: 1, teleporterHue: null, game: UNFORGIVEN_MAP };
    const seen: { x: number; y: number }[] = [];
    drawFloor(recordingContext(seen), rock, { ...options, explored: (x, y) => x === 2 && y === 3 });
    expect(seen.filter((fill) => fill.x === 3 && fill.y === 4)).toHaveLength(1);
    const unseen: { x: number; y: number }[] = [];
    drawFloor(recordingContext(unseen), rock, options);
    expect(unseen.filter((fill) => fill.x === 3 && fill.y === 4)).toHaveLength(0);
  });
});

describe('drawFloor over the map a character has discovered', () => {
  const options = { cell: 1, originX: 0, originY: 0, width: WIDTH, height: HEIGHT, floor: 1, teleporterHue: null, game: UNFORGIVEN_MAP };
  const knows = (squares: [number, number][]) => ({
    known: (x: number, y: number) => squares.some(([sx, sy]) => sx === x && sy === y),
    knownOnArrival: () => true,
  });

  it('draws the known squares and nothing whatsoever for the rest', () => {
    const fills: { x: number; y: number }[] = [];
    drawFloor(recordingContext(fills), openFloor(), { ...options, discovered: knows([[2, 3], [3, 3]]) });
    // The first fill is the background, and each known square is filled one pixel in.
    expect(fills.slice(1)).toEqual([
      { x: 3, y: 4 },
      { x: 4, y: 4 },
    ]);
  });

  it('holds the chute glyph back until the square was known on arrival', () => {
    const withChute = openFloor();
    withChute[3][2] = { ...withChute[3][2], chute: 4 };
    const strokes: string[] = [];
    const ctx = new Proxy(
      {},
      { get: (_target, name) => (name === 'stroke' ? () => strokes.push('stroke') : () => {}), set: () => true },
    ) as unknown as CanvasRenderingContext2D;
    drawFloor(ctx, withChute, { ...options, discovered: { known: (x, y) => x === 2 && y === 3, knownOnArrival: () => false } });
    expect(strokes).toHaveLength(0);
    strokes.length = 0;
    drawFloor(ctx, withChute, { ...options, discovered: { known: (x, y) => x === 2 && y === 3, knownOnArrival: () => true } });
    expect(strokes.length).toBeGreaterThan(0);
  });

  it('draws a secret door and a module teleporter as the plain walls the game draws them as', () => {
    const secret = openFloor();
    secret[3][2] = { ...secret[3][2], n: 2, e: 4 };
    const dashes: number[][] = [];
    const ctx = new Proxy(
      {},
      { get: (_target, name) => (name === 'setLineDash' ? (dash: number[]) => dashes.push(dash) : () => {}), set: () => true },
    ) as unknown as CanvasRenderingContext2D;
    drawFloor(ctx, secret, { ...options, discovered: { known: (x, y) => x === 2 && y === 3, knownOnArrival: () => true } });
    expect(dashes.every((dash) => dash.length === 0)).toBe(true);
  });
});

describe('the ticks drawSquare puts across a door', () => {
  /** A canvas context that remembers every straight line it is asked to stroke, as the corner
   *  it starts from and the corner it stops at. */
  function recordLines(): { ctx: CanvasRenderingContext2D; lines: number[][] } {
    const lines: number[][] = [];
    let from: number[] = [];
    const calls: Record<string, (...args: number[]) => void> = {
      moveTo: (...args) => void (from = args),
      lineTo: (...args) => void lines.push([...from, ...args]),
    };
    const ctx = new Proxy(
      {},
      { get: (_target, name) => calls[name as string] ?? (() => {}), set: () => true },
    ) as unknown as CanvasRenderingContext2D;
    return { ctx, lines };
  }

  /** The lines drawn for one square of the given size with one side made a door: the ticks
   *  across the door run the other way from the door's own wall line, so a north door's ticks
   *  are the vertical lines and a west door's the horizontal ones. The coordinate a tick keeps
   *  carries the half pixel the drawer adds to centre a one-pixel line, and the far end is the
   *  pixel after the last one drawn. */
  function ticks(side: 'n' | 'w', size: number): number[][] {
    const { ctx, lines } = recordLines();
    const square = { n: 3, s: 3, w: 3, e: 3, solid: false, ladder: 0, chute: 0, trapdoor: -1, town: 0, [side]: 1 } as MapSquare;
    drawSquare(ctx, square, 0, 0, size, size, 1, null, UNFORGIVEN_MAP);
    const acrossTheDoor = side === 'n' ? (l: number[]) => l[0] === l[2] : (l: number[]) => l[1] === l[3];
    return lines.filter(acrossTheDoor);
  }

  it('crosses a door in a side running along the square with the long pair alone', () => {
    // Middle at 5, reach 3: one tick either side of the middle, nothing on the middle itself.
    expect(ticks('n', 10)).toEqual([
      [4.5, -3, 4.5, 4],
      [6.5, -3, 6.5, 4],
    ]);
  });

  it('crosses that door with the short tick alone on a square too small for the pair', () => {
    expect(ticks('n', 7)).toEqual([[3.5, -1, 3.5, 2]]);
  });

  it('crosses a door in a side running down the square with the short tick under the pair', () => {
    expect(ticks('w', 10)).toEqual([
      [-3, 6.5, 4, 6.5],
      [-3, 4.5, 4, 4.5],
      [-1, 5.5, 2, 5.5],
    ]);
    expect(ticks('w', 7)).toEqual([[-1, 3.5, 2, 3.5]]);
  });
});

describe('drawYou', () => {
  /** A canvas context that remembers the rectangle it filled and the corners of the path it was
   *  given, which is the whole difference between the two markers. */
  function recordMarker(): { ctx: CanvasRenderingContext2D; rects: number[][]; corners: number[][] } {
    const rects: number[][] = [];
    const corners: number[][] = [];
    const calls: Record<string, (...args: number[]) => void> = {
      fillRect: (...args) => void rects.push(args),
      moveTo: (...args) => void corners.push(args),
      lineTo: (...args) => void corners.push(args),
    };
    const ctx = new Proxy(
      {},
      { get: (_target, name) => calls[name as string] ?? (() => {}), set: () => true },
    ) as unknown as CanvasRenderingContext2D;
    return { ctx, rects, corners };
  }

  const view = { cell: 20, originX: 0, originY: 0 };
  /** Any colour: these tests are about the shape drawn, not what it is filled with. */
  const WHITE = '#ffffff';

  it('fills the square when nobody standing there is facing anywhere', () => {
    const { ctx, rects, corners } = recordMarker();
    drawYou(ctx, 1, 2, view, WHITE);
    expect(rects).toEqual([[23, 43, 16, 16]]);
    expect(corners).toEqual([]);
  });

  it("draws the game's own arrow a square of the cell to a pixel when it is asked for", () => {
    const { ctx, rects, corners } = recordMarker();
    drawYou(ctx, 1, 2, view, WHITE, 0, true);
    expect(corners).toEqual([]);
    // The 9 x 9 bitmap has 37 pixels lit, and the point of the arrow is the middle of its top row.
    expect(rects).toHaveLength(37);
    expect(rects).toContainEqual([30, 43, 2, 2]);
  });

  it('draws an arrowhead pointing the way the character faces', () => {
    const { ctx, rects, corners } = recordMarker();
    drawYou(ctx, 1, 2, view, WHITE, 0);
    expect(rects).toEqual([]);
    // The tip is on the middle of the square's north side, the back corners on its south ones.
    expect(corners[0]).toEqual([31, 43]);
    expect(corners[1]).toEqual([39, 59]);
    expect(corners[3]).toEqual([23, 59]);
  });
});
