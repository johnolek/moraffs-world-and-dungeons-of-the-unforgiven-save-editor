import { describe, expect, it } from 'vitest';
import type { Rgb } from '../../game/dotu-pic.js';
import type { MapSquare } from '../../map/game';
import { GRADIENT_STEP_MS } from '../plaque';
import { UNFORGIVEN_ZOOM_MAP } from '../display';
import { newFrame, pixelAt, type Frame } from '../view3d/frame';
import {
  drawZoomMap,
  ZOOM_CHUTE_COLOUR,
  ZOOM_CORNER_COLOUR,
  ZOOM_MARK_COLOUR,
  ZOOM_SIDE_COLOUR,
} from '../zoom-map';
import {
  drawMwExpandedMap,
  drawMwZoomMap,
  MORAFFS_WORLD_ZOOM_MAP,
  mwExpandedMarkerColour,
  mwExpandedMarkerRect,
  mwMarkerColour,
  mwMarkerPass,
  mwMarkerRect,
  mwYouColour,
} from './map';
import {
  MW_COLOURS,
  MW_EXPANDED_CELL,
  MW_EXPANDED_COLUMNS,
  MW_EXPANDED_ROWS,
  MW_EXPANDED_TOP,
  MW_MAP_LEFT,
  MW_SCREEN_PIXELS,
} from './view3d/screen';

const open = (): MapSquare => ({ n: 3, s: 3, w: 3, e: 3, solid: false, ladder: 0, chute: 0, trapdoor: -1, surface: 0 });

const WINDOW = MORAFFS_WORLD_ZOOM_MAP.window(MW_SCREEN_PIXELS);
const at = { x: 40, y: 50 };
/** A cell well clear of the character's own, which the cursor would otherwise draw over. */
const COLUMN = 3;
const ROW = 3;
const marked = { x: at.x + COLUMN - (WINDOW.columns >> 1), y: at.y + ROW - (WINDOW.rows >> 1) };
const x0 = WINDOW.left + COLUMN * WINDOW.cell;
const y0 = WINDOW.top + ROW * WINDOW.cell;

/** The map of a floor of open squares with one square given what the test is about. */
function drawn(square: Partial<MapSquare>, chuteKnown = true): Frame {
  const rows: MapSquare[][] = Array.from({ length: 80 }, () => Array.from({ length: 80 }, open));
  Object.assign(rows[marked.y][marked.x], square);
  const frame = newFrame(MW_SCREEN_PIXELS.width, MW_SCREEN_PIXELS.height);
  drawMwZoomMap(frame, { rows, at, map: { known: () => true, knownOnArrival: () => chuteKnown } });
  return frame;
}

/** One pixel of that square's own cell, by how far it is from the cell's top left corner. */
const dot = (frame: Frame, dx: number, dy: number): number => pixelAt(frame, x0 + dx, y0 + dy);

/** Two points, one on each diagonal and on neither of the other's two passes. */
const strokes = (frame: Frame): number[] => [dot(frame, 2, 2), dot(frame, 2, 8)];

describe("the window Moraff's World's map is drawn in", () => {
  it('is eighteen ten-pixel cells across and thirty-eight down, four in from the left edge', () => {
    expect(WINDOW).toEqual({ left: 4, top: 274, cell: 10, columns: 18, rows: 38 });
  });

  it('is a different size from Dungeons of the Unforgiven, in the same ten-pixel cells', () => {
    const unforgiven = UNFORGIVEN_ZOOM_MAP.window(MW_SCREEN_PIXELS);
    expect(unforgiven.cell).toBe(WINDOW.cell);
    expect([unforgiven.columns, unforgiven.rows]).toEqual([19, 33]);
  });

  it('draws the maroon box the squares stand on', () => {
    // A corner of the box well outside the grid's own first cell.
    expect(pixelAt(drawn({}), 1, WINDOW.top + 1)).toBe(MW_COLOURS.map);
  });
});

describe("what Moraff's World's map draws on one square", () => {
  it('fills a plain square black and dots its four corners red', () => {
    const frame = drawn({});
    expect(dot(frame, 5, 5)).toBe(0);
    expect([
      dot(frame, 0, 0),
      dot(frame, WINDOW.cell, 0),
      dot(frame, 0, WINDOW.cell),
      dot(frame, WINDOW.cell, WINDOW.cell),
    ]).toEqual([ZOOM_CORNER_COLOUR, ZOOM_CORNER_COLOUR, ZOOM_CORNER_COLOUR, ZOOM_CORNER_COLOUR]);
  });

  it('lines every side but an open one', () => {
    expect(dot(drawn({ w: 3 }), 0, 5)).toBe(0);
    for (const side of [0, 1, 2, 4]) expect(dot(drawn({ w: side }), 0, 5)).toBe(ZOOM_SIDE_COLOUR);
  });

  it('ticks a door in a side running down the cell, with a short line under the long pair', () => {
    const frame = drawn({ w: 1 });
    expect([dot(frame, -3, 4), dot(frame, 3, 4)]).toEqual([ZOOM_SIDE_COLOUR, ZOOM_SIDE_COLOUR]);
    expect([dot(frame, -3, 6), dot(frame, 3, 6)]).toEqual([ZOOM_SIDE_COLOUR, ZOOM_SIDE_COLOUR]);
    expect([dot(frame, -1, 5), dot(frame, 1, 5)]).toEqual([ZOOM_SIDE_COLOUR, ZOOM_SIDE_COLOUR]);
  });

  it('draws a ladder down as one diagonal and a ladder up as the other', () => {
    expect(strokes(drawn({ ladder: 1 }))).toEqual([ZOOM_MARK_COLOUR, 0]);
    expect(strokes(drawn({ ladder: -1 }))).toEqual([0, ZOOM_MARK_COLOUR]);
  });

  it('crosses a trap door with both of them', () => {
    expect(strokes(drawn({ trapdoor: 25 }))).toEqual([ZOOM_MARK_COLOUR, ZOOM_MARK_COLOUR]);
  });

  it('draws a chute as the cross with a plus sign through it, in pale blue', () => {
    const frame = drawn({ chute: 4 });
    expect(strokes(frame)).toEqual([ZOOM_CHUTE_COLOUR, ZOOM_CHUTE_COLOUR]);
    expect([dot(frame, 5, 1), dot(frame, 1, 5)]).toEqual([ZOOM_CHUTE_COLOUR, ZOOM_CHUTE_COLOUR]);
  });

  it('marks no chute on a square that was not known on arrival', () => {
    expect(strokes(drawn({ chute: 4 }, false))).toEqual([0, 0]);
  });

  it("fills a building's square with its own number plus two, and the inn's is not moved on", () => {
    const fills = [1, 2, 3, 4].map((building) => dot(drawn({ surface: building }), 8, 5));
    expect(fills).toEqual([3, 4, 5, 6]);
    // Dungeons of the Unforgiven moves the fourth building's 6 on to 8 and this game does not,
    // which is the one number the two fills differ by.
    expect([1, 2, 3, 4].map(UNFORGIVEN_ZOOM_MAP.buildingColour)).toEqual([3, 4, 5, 8]);
  });

  it("fills the character's own cell rather than pointing an arrow, since the game has no facing", () => {
    const frame = drawn({});
    const cx = WINDOW.left + (WINDOW.columns >> 1) * WINDOW.cell;
    const cy = WINDOW.top + (WINDOW.rows >> 1) * WINDOW.cell;
    expect(pixelAt(frame, cx + 5, cy + 5)).toBe(MW_COLOURS.menuKey);
    // Every pixel inside the cell, which an arrow would leave most of black.
    expect(pixelAt(frame, cx + 2, cy + WINDOW.cell)).toBe(MW_COLOURS.menuKey);
  });
});

describe("a door's tick at the right-hand edge of the screen", () => {
  /** One cell whose right-hand door tick would land past the last column. */
  const drawAtEdge = (style: typeof MORAFFS_WORLD_ZOOM_MAP): Frame => {
    const rows: MapSquare[][] = Array.from({ length: 4 }, () => Array.from({ length: 4 }, open));
    rows[1][1].w = 1;
    const frame = newFrame(64, 32);
    drawZoomMap(
      frame,
      { rows, at: { x: 1, y: 1 }, map: { known: () => true, knownOnArrival: () => true } },
      { left: frame.width - 4, top: 0, cell: 10, columns: 1, rows: 1 },
      { x: 1, y: 1 },
      style,
    );
    return frame;
  };

  it('is drawn by draw_wall_side and dropped by draw_side', () => {
    // A pixel of the tick's upper long line, which reaches three to the left of the cell's own
    // side. The side's plain line stands at the cell's corner in both games.
    const edge = { x: 64 - 4 - 3, y: 4 };
    expect(pixelAt(drawAtEdge(MORAFFS_WORLD_ZOOM_MAP), edge.x, edge.y)).toBe(ZOOM_SIDE_COLOUR);
    expect(pixelAt(drawAtEdge(UNFORGIVEN_ZOOM_MAP), edge.x, edge.y)).toBe(0);
  });
});

describe("the map Moraff's World's X key fills the screen with", () => {
  const standing = { x: 12, y: 20 };

  function expanded(): Frame {
    const rows: MapSquare[][] = Array.from({ length: MW_EXPANDED_ROWS }, () =>
      Array.from({ length: MW_EXPANDED_COLUMNS }, open),
    );
    const frame = newFrame(MW_SCREEN_PIXELS.width, MW_SCREEN_PIXELS.height);
    drawMwExpandedMap(frame, {
      rows,
      at: standing,
      map: { known: () => true, knownOnArrival: () => true },
    });
    return frame;
  }

  /** Where a square of the floor lands on that map. */
  const cell = (x: number, y: number) => ({
    x: MW_MAP_LEFT + x * MW_EXPANDED_CELL,
    y: MW_EXPANDED_TOP + y * MW_EXPANDED_CELL,
  });

  it("shows the whole floor from the map's own corner, at seven pixels a square", () => {
    const frame = expanded();
    const first = cell(0, 0);
    expect(pixelAt(frame, first.x, first.y)).toBe(ZOOM_CORNER_COLOUR);
    expect(pixelAt(frame, first.x + 3, first.y + 3)).toBe(0);
  });

  it('fills the screen the map does not reach with the maroon it is drawn on', () => {
    const frame = expanded();
    expect(pixelAt(frame, MW_EXPANDED_COLUMNS * MW_EXPANDED_CELL + 20, 400)).toBe(MW_COLOURS.map);
  });

  it("marks the character's own square, which is what the original blinks there", () => {
    const frame = expanded();
    const here = cell(standing.x, standing.y);
    expect(pixelAt(frame, here.x + 3, here.y + 3)).toBe(MW_COLOURS.menuKey);
    // The square next door is a plain black one, so the mark is one square and not a smear.
    const next = cell(standing.x + 1, standing.y);
    expect(pixelAt(frame, next.x + 3, next.y + 3)).toBe(0);
  });
});

describe("the blink on the character's own square", () => {
  it('turns the map beside the views over the first sixteen palette entries', () => {
    expect([0, 1, 15, 16, 17, 255, 256].map(mwMarkerColour)).toEqual([0, 1, 15, 0, 1, 15, 0]);
  });

  it('walks the map the X key fills the screen with through the whole palette', () => {
    expect([0, 15, 16, 255, 256, 257].map(mwExpandedMarkerColour)).toEqual([0, 15, 16, 255, 0, 1]);
  });

  it('counts one pass of the loop the game waits for a key in per step', () => {
    expect(mwMarkerPass(0)).toBe(0);
    expect(mwMarkerPass(GRADIENT_STEP_MS - 1)).toBe(0);
    expect(mwMarkerPass(GRADIENT_STEP_MS)).toBe(1);
    expect(mwMarkerPass(16 * GRADIENT_STEP_MS)).toBe(16);
  });

  it("reads the site's own map marker out of the floor's palette, sixteen entries round", () => {
    const palette: Rgb[] = Array.from({ length: 256 }, (_, entry) => [entry, entry, entry]);
    expect(mwYouColour(palette, 0)).toBe('rgb(0 0 0)');
    expect(mwYouColour(palette, 3 * GRADIENT_STEP_MS)).toBe('rgb(3 3 3)');
    expect(mwYouColour(palette, 16 * GRADIENT_STEP_MS)).toBe('rgb(0 0 0)');
  });

  it('fills the square the map beside the views draws in the middle of its window', () => {
    const window = MORAFFS_WORLD_ZOOM_MAP.window(MW_SCREEN_PIXELS);
    const rect = mwMarkerRect(MW_SCREEN_PIXELS);
    expect(rect.x).toBe(window.left + (window.columns >> 1) * window.cell + 2);
    expect(rect.y).toBe(window.top + (window.rows >> 1) * window.cell + 2);
    expect(rect.size).toBe(window.cell - 1);
  });

  it("fills the square the X key's map draws the character on", () => {
    const rect = mwExpandedMarkerRect({ x: 3, y: 5 });
    expect(rect.x).toBe(MW_MAP_LEFT + 3 * MW_EXPANDED_CELL + 2);
    expect(rect.y).toBe(MW_EXPANDED_TOP + 5 * MW_EXPANDED_CELL + 2);
    expect(rect.size).toBe(MW_EXPANDED_CELL - 1);
  });
});
