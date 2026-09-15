import type { DiscoveredMap } from '../map/draw-floor';
import type { Point } from '../map/viewport';
import type { MapSquare } from '../map/game';
import { arrowPixel, FACING_ARROW, FACING_ARROW_SIZE } from '../map/you';
import { drawLine, fillRect, plot, type Frame } from './view3d/frame';
import type { ZoomMapMonster, ZoomThumbnailFor } from './zoom-monsters';

/**
 * The little map in the corner of the screen, which both C games draw with the same routine.
 *
 * `drawsquare` (UNF.EXE 3000:87de, unf.c "drawsquare") and `draw_map_square` (WORLD.EXE 3000:a97d,
 * mw.c "draw_map_square") are the same function three years apart, and so are `draw_side` (UNF.EXE
 * 3000:8432) and `draw_wall_side` (WORLD.EXE 3000:a5f7): the same fill, the same four sides, the
 * same four corner dots, the same diagonals for a ladder and a trap door and the same plus sign
 * for a chute, in the same palette entries. {@link ZoomMapStyle} is everything the two differ
 * over, and there is very little of it.
 *
 * Both games plot the corner dots in every video mode above the fourth and neither plots them in
 * the four below it, so the port, which draws mode 9 alone, always plots them.
 */

/** Where a game draws its zoom map and how much of the floor it shows. */
export interface ZoomMapWindow {
  /** The top-left corner of the grid, in the frame's own pixels. */
  left: number;
  top: number;
  /** How wide and tall one square is drawn. */
  cell: number;
  columns: number;
  rows: number;
}

/** What stands on the character's own square. */
export type ZoomMapMarker =
  /** Dungeons of the Unforgiven's arrow, which points the way they face. movecontrol flashes it
   *  between white and black while it waits for a key (exe 2000:c748); this draws the lit half of
   *  that, and `Screen.svelte` runs the flash over it. */
  | { kind: 'arrow' }
  /**
   * Moraff's World's cursor, which is the whole cell filled (WORLD.EXE 2000:7c8a). That game has
   * no facing to point, and the original fills the cell in the next of sixteen palette entries
   * every pass, so it blinks; the port draws it steady in one of them.
   */
  | { kind: 'cell'; colour: number };

/** The handful of numbers the two games' copies of `drawsquare` and `draw_side` differ over. */
export interface ZoomMapStyle {
  /** Where the map goes on a frame this size, and how much of the floor it shows. */
  window(frame: { width: number; height: number }): ZoomMapWindow;
  /** The palette entry the box behind the map is filled with. */
  box: number;
  /**
   * Which of a square's fields holds one of the town's buildings, and 0 for a square with none.
   * Dungeons of the Unforgiven asks only inside a module's town and only where there is no
   * ladder; Moraff's World asks only on floor 0 and does not care about the ladder.
   */
  buildingOn(square: MapSquare): number;
  /** The palette entry that building's square is filled with. */
  buildingColour(building: number): number;
  marker: ZoomMapMarker;
  /**
   * Whether a door's tick in a side running down a cell is dropped when its right-hand end would
   * land past the last column of the screen. `draw_side` tests for that and `draw_wall_side` does
   * not, which is the only place the two routines disagree.
   */
  clipDoorTick: boolean;
  /**
   * The last column and row of the floor the game's own map will draw, which each game keeps in a
   * pair of globals: DS:2328 and DS:232a in Dungeons of the Unforgiven, DS:448b and DS:448d in
   * Moraff's World.
   *
   * `FUN_2000_7210` (UNF.EXE 2000:7210) and `FUN_2000_5196` (WORLD.EXE 2000:5196) are the same
   * test, and each game's loop asks it about every cell of the window before drawing one: a
   * square past these is answered no however well it is known. It matters because the generator
   * fills a grid larger than the game shows — Dungeons of the Unforgiven's floors run to row 109
   * and it draws to row 104 — so without it a map handed over whole shows rows the game never
   * draws and the character can never stand on.
   */
  lastColumn: number;
  lastRow: number;
}

/**
 * The colours a square's own marks are drawn in, which are the same entries in both games.
 *
 * The white is every side and every door tick; the red is the four corner dots; the yellow is the
 * ladder and trap door diagonals, and the pale blue the chute's, which the chute branch swaps in
 * for the yellow.
 *
 * Both games turn the two marks white instead when a switch of theirs is set — DS:00c7 in
 * Dungeons of the Unforgiven, DS:00c5 in Moraff's World — which each takes from a negative video
 * mode number on its command line. The mode played here is a positive 9, so neither is on.
 */
export const ZOOM_SIDE_COLOUR = 15;
export const ZOOM_CORNER_COLOUR = 6;
export const ZOOM_MARK_COLOUR = 4;
export const ZOOM_CHUTE_COLOUR = 3;

/** What the drawing half of the screen needs to know about the floor the character stands on. */
export interface ZoomMapFloor {
  rows: MapSquare[][];
  at: { x: number; y: number };
  /** The map the character has discovered: a square it does not know is not drawn at all, and a
   *  chute is marked only on a square that was already known when they arrived. */
  map: DiscoveredMap;
  /** The monsters to mark on the map, which neither game ever marks and debug mode always does. */
  monsters?: ZoomMapMonster[];
  /** Where the pictures those marks are drawn with come from, or undefined to mark them with the
   *  plain red square instead. */
  thumbnail?: ZoomThumbnailFor;
  /** The kind of monster picked out of debug mode's list, every one of which is ringed, or null
   *  while nothing is picked. */
  highlight?: string | null;
  /** The squares of the route debug mode is drawing, or undefined while it is drawing none. */
  route?: Point[];
}

/** Which square of the floor a cell of the map shows. */
export function zoomMapSquare(
  centre: { x: number; y: number },
  window: { columns: number; rows: number },
  column: number,
  row: number,
): { x: number; y: number } {
  return { x: centre.x + column - (window.columns >> 1), y: centre.y + row - (window.rows >> 1) };
}

/** A square with neither a trap door nor a chute on it, which is what the game leaves the
 *  destination floor at and what stops both diagonals being drawn. */
const NOTHING_CROSSED = -1;

/**
 * The diagonals are drawn twice, a pixel apart, on a screen wider than 1000 of its own pixels
 * (exe 3000:8c02, mw.c the same test in draw_map_square). The play screen is 1024 across, so its
 * map always draws them thick.
 */
const THICK_MARK_ABOVE_WIDTH = 1000;

/** The cell size from which a door's tick is drawn as a pair of long lines as well. */
const DOOR_TICK_PAIR_FROM_CELL = 8;

/**
 * `drawsquare` and `draw_side` for every square of the window.
 *
 * `FUN_3000_8e75` (UNF.EXE 3000:8e75) and `FUN_3000_b066` (WORLD.EXE 3000:b066) are the loop: each
 * walks its own columns and rows and asks for the square `centre + cell - window / 2`, so the same
 * drawing serves the map beside the views, centred on the character, and Dungeons of the
 * Unforgiven's X key, centred on the middle of the floor.
 */
/** `FUN_2000_7210` (UNF.EXE 2000:7210) and `FUN_2000_5196` (WORLD.EXE 2000:5196): whether the
 *  square is one of the floor's own and the character knows it. */
function drawnSquare(floor: ZoomMapFloor, style: ZoomMapStyle, x: number, y: number): boolean {
  if (x < 0 || x > style.lastColumn || y < 0 || y > style.lastRow) return false;
  return floor.map.known(x, y);
}

export function drawZoomMap(
  frame: Frame,
  floor: ZoomMapFloor,
  window: ZoomMapWindow,
  centre: { x: number; y: number },
  style: ZoomMapStyle,
): void {
  for (let column = 0; column < window.columns; column++) {
    for (let row = 0; row < window.rows; row++) {
      const square = zoomMapSquare(centre, window, column, row);
      if (!drawnSquare(floor, style, square.x, square.y)) continue;
      const here = floor.rows[square.y]?.[square.x];
      // Rock is never drawn. solidcheck (UNF.EXE 3000:86b5) and is_solid (WORLD.EXE 3000:a854)
      // both call a square rock when it has a wall on all four sides, and nothing ever stands on
      // one: a step cannot reach it and no 3-D view sees into it, so the character's own map
      // never marks one. The test only bites on a floor the site has revealed whole, where it
      // keeps the rock blank instead of drawing it as a square somebody could be standing in.
      if (!here || here.solid) continue;
      drawZoomSquare(frame, here, window.left + column * window.cell, window.top + row * window.cell, window.cell, style, {
        chuteKnown: floor.map.knownOnArrival(square.x, square.y),
      });
    }
  }
}

/**
 * The mark on the character's own square, which both games redraw in a new colour every time
 * round the loop they wait for a key in.
 *
 * This is one drawing of it, in the colour it is lit in. Dungeons of the Unforgiven's tab runs
 * the flash over the top of it (`Screen.svelte`); Moraff's World's blink is not ported.
 *
 * @param dir the way the character faces, which only the arrow uses.
 */
export function drawZoomMarker(
  frame: Frame,
  window: ZoomMapWindow,
  style: ZoomMapStyle,
  dir = 0,
): void {
  const x = window.left + (window.columns >> 1) * window.cell;
  const y = window.top + (window.rows >> 1) * window.cell;
  if (style.marker.kind === 'cell') {
    fillRect(frame, x + 2, y + 2, x + window.cell, y + window.cell, style.marker.colour);
    return;
  }
  FACING_ARROW.forEach((line, row) => {
    for (let column = 0; column < line.length; column++) {
      if (line[column] !== 'X') continue;
      const at = arrowPixel(dir, x + 2, y + 2, column, row);
      plot(frame, at.x, at.y, ZOOM_SIDE_COLOUR);
    }
  });
}

/**
 * Where a game's X key draws the whole floor: the window it fills the screen with, the square that
 * window is centred on, the colour behind it and the colour the character's own square is left in.
 */
export interface ZoomMapExpansion {
  window: ZoomMapWindow;
  centre: { x: number; y: number };
  ground: number;
  cursor: number;
}

/**
 * The map the X key fills the screen with, which both C games draw with the routine they draw the
 * corner map with: the screen filled, the floor drawn over it from its own first square, and the
 * character's square filled on top.
 *
 * `FUN_3000_8e75` (UNF.EXE 3000:8e75) and `FUN_3000_b066` (WORLD.EXE 3000:b066) are the two loops,
 * and `FUN_2000_a068` (UNF.EXE 2000:a068) and `FUN_2000_7d00` (WORLD.EXE 2000:7d00) the two
 * cursors, which fill the same rectangle: two pixels inside the cell, out to its far corner. Both
 * games redraw that cursor in a new colour every time round the loop they wait for a key in, so it
 * flickers; nothing here waits, so it is drawn once.
 *
 * Monsters are left to the caller, since debug mode marks them over the finished map.
 */
export function drawExpandedZoomMap(
  frame: Frame,
  floor: ZoomMapFloor,
  style: ZoomMapStyle,
  expanded: ZoomMapExpansion,
): void {
  fillRect(frame, 0, 0, frame.width - 1, frame.height - 1, expanded.ground);
  const { left, top, cell } = expanded.window;
  drawZoomMap(frame, floor, expanded.window, expanded.centre, style);
  fillRect(
    frame,
    left + cell * floor.at.x + 2,
    top + cell * floor.at.y + 2,
    left + cell * (floor.at.x + 1),
    top + cell * (floor.at.y + 1),
    expanded.cursor,
  );
}

/**
 * The square the arrow's own pixels stand in, for anything drawing the arrow over the frame
 * rather than into it.
 *
 * The rotations of `arrowPixel` put a pixel one before the corner they are given, so the square
 * starts a pixel inside the cell rather than the two `drawsquare`'s fill starts at.
 */
export function facingArrowRect(window: ZoomMapWindow): { x: number; y: number; size: number } {
  return {
    x: window.left + (window.columns >> 1) * window.cell + 1,
    y: window.top + (window.rows >> 1) * window.cell + 1,
    size: FACING_ARROW_SIZE,
  };
}

/**
 * One square of the map, in the order the routine draws it: the fill, the four sides, the four
 * corner dots, and the marks for what the square holds.
 *
 * A square is filled black unless one of the town's four buildings stands on it, which is all the
 * map ever says about a building — no mark goes over the colour. The marks belong to the other
 * three things a square can hold, and the routine asks about them in order, each only on a square
 * the last one left alone: a ladder down is one diagonal and a ladder up the other, a trap door is
 * both, and a chute is both with a plus sign through them, in pale blue rather than yellow. The
 * chute is asked about only on a square that was already known when the character arrived on the
 * floor, which is why a chute shows on the map after they have left and come back and not before.
 *
 * Moraff's World fills a square a pixel taller on a screen narrower than 330 of its own pixels
 * and Dungeons of the Unforgiven does not; the port draws neither game at that size.
 */
function drawZoomSquare(
  frame: Frame,
  square: MapSquare,
  x: number,
  y: number,
  cell: number,
  style: ZoomMapStyle,
  asTheGame: { chuteKnown: boolean },
): void {
  const building = style.buildingOn(square);
  fillRect(frame, x + 1, y + 1, x + cell, y + cell, building === 0 ? 0 : style.buildingColour(building));

  drawZoomSide(frame, square.w, x, y, cell, false, style);
  drawZoomSide(frame, square.n, x, y, cell, true, style);
  drawZoomSide(frame, square.e, x + cell, y, cell, false, style);
  drawZoomSide(frame, square.s, x, y + cell, cell, true, style);
  for (const corner of [x, x + cell]) {
    plot(frame, corner, y, ZOOM_CORNER_COLOUR);
    plot(frame, corner, y + cell, ZOOM_CORNER_COLOUR);
  }

  // The trap door's own destination floor, which the square is crossed for whatever it is, and
  // which the chute branch borrows when it claims the square instead.
  const ladder = square.ladder;
  let crossed = ladder === 0 ? square.trapdoor : NOTHING_CROSSED;
  let colour = ZOOM_MARK_COLOUR;
  if (ladder === 0 && crossed === NOTHING_CROSSED && asTheGame.chuteKnown && square.chute !== 0) {
    crossed = square.chute;
    colour = ZOOM_CHUTE_COLOUR;
    const middle = Math.trunc(cell / 2);
    drawLine(frame, x + middle, y, x + middle, y + cell, colour);
    drawLine(frame, x, y + middle, x + cell, y + middle, colour);
  }

  const thick = frame.width - 1 > THICK_MARK_ABOVE_WIDTH;
  if (ladder > 0 || crossed !== NOTHING_CROSSED) {
    drawLine(frame, x, y, x + cell, y + cell, colour);
    if (thick) drawLine(frame, x, y + 1, x + cell, y + cell + 1, colour);
  }
  if (ladder < 0 || crossed !== NOTHING_CROSSED) {
    drawLine(frame, x, y + cell, x + cell, y, colour);
    if (thick) drawLine(frame, x, y + cell + 1, x + cell, y + 1, colour);
  }
}

/**
 * `draw_side` (UNF.EXE 3000:8432) and `draw_wall_side` (WORLD.EXE 3000:a5f7): one side of one
 * cell. `horizontal` sides run along the cell's top edge and the others down its left edge; `x`
 * and `y` are the cell's own corner, so the east and south sides are drawn as the west and north
 * sides of the next cell along.
 *
 * Every side but an open one gets a plain line, so a secret door and a module teleporter are
 * walls to look at. A door gets ticks across it as well, which is the gap in the wall the map
 * draws a doorway as: a short one three pixels long, and on a cell of eight pixels or more two
 * longer ones a pixel either side of it. The two halves of the routine differ over that short
 * tick — the side running along the top draws it only on a cell too small for the long pair,
 * and the side running down the left draws it always, under the pair.
 */
function drawZoomSide(
  frame: Frame,
  side: number,
  x: number,
  y: number,
  cell: number,
  horizontal: boolean,
  style: ZoomMapStyle,
): void {
  if (side !== 3) {
    if (horizontal) drawLine(frame, x + 1, y, x + cell - 1, y, ZOOM_SIDE_COLOUR);
    else drawLine(frame, x, y + 1, x, y + cell - 1, ZOOM_SIDE_COLOUR);
  }
  if (side !== 1) return;
  const middle = cell >> 1;
  const reach = Math.trunc(cell / 3);
  const long = cell >= DOOR_TICK_PAIR_FROM_CELL;
  if (horizontal) {
    if (long) {
      drawLine(frame, x + middle - 1, y - reach, x + middle - 1, y + reach, ZOOM_SIDE_COLOUR);
      drawLine(frame, x + middle + 1, y - reach, x + middle + 1, y + reach, ZOOM_SIDE_COLOUR);
      return;
    }
    drawLine(frame, x + middle, y - 1, x + middle, y + 1, ZOOM_SIDE_COLOUR);
    return;
  }
  // A door on a side too near the right of the screen draws no tick at all: draw_side works out
  // where the right-hand end would reach and gives up when that is past the last column.
  if (style.clipDoorTick && x + reach >= frame.width - 1) return;
  if (long) {
    drawLine(frame, x - reach, y + middle + 1, x + reach, y + middle + 1, ZOOM_SIDE_COLOUR);
    drawLine(frame, x - reach, y + middle - 1, x + reach, y + middle - 1, ZOOM_SIDE_COLOUR);
  }
  drawLine(frame, x - 1, y + middle, x + 1, y + middle, ZOOM_SIDE_COLOUR);
}
