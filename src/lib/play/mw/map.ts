import { DUNGEON_XMAX as MW_DUNGEON_XMAX, DUNGEON_YMAX as MW_DUNGEON_YMAX } from '../../game/mwmap.js';
import type { Rgb } from '../../game/dotu-pic.js';
import { GRADIENT_STEP_MS } from '../plaque';
import { fillRect, type Frame } from '../view3d/frame';
import {
  drawExpandedZoomMap,
  drawZoomMap,
  drawZoomMarker,
  type ZoomMapFloor,
  type ZoomMapStyle,
  type ZoomMapWindow,
} from '../zoom-map';
import { drawZoomMonsters } from '../zoom-monsters';
import {
  MW_COLOURS,
  MW_EXPANDED_CELL,
  MW_EXPANDED_CENTRE,
  MW_EXPANDED_COLUMNS,
  MW_EXPANDED_ROWS,
  MW_EXPANDED_TOP,
  MW_MAP_CELL,
  MW_MAP_COLUMNS,
  MW_MAP_LEFT,
  MW_MAP_ROWS,
  MW_SCREEN_UNITS_X,
  mwMapTop,
} from './view3d/screen';

/**
 * The little map at the far left of Moraff's World's middle band.
 *
 * `draw_map_square` (WORLD.EXE 3000:a97d, mw.c "draw_map_square") is the same routine Dungeons of
 * the Unforgiven draws its own corner map with, so `../zoom-map.ts` is the drawing and this file
 * is only what this game does differently.
 */

/**
 * Moraff's World's row of that table.
 *
 * The building colour is `surface_feature + 2` with no adjustment, where Dungeons of the
 * Unforgiven moves the inn's 6 on to 8; the map has no arrow because the game has no facing, and
 * the character's square is the whole cell filled instead; and `draw_wall_side` (exe 3000:a5f7)
 * has none of the screen-edge test `draw_side` puts in front of a door's tick.
 */
export const MORAFFS_WORLD_ZOOM_MAP: ZoomMapStyle = {
  window: (frame) => ({
    left: MW_MAP_LEFT,
    top: mwMapTop(frame.height),
    cell: MW_MAP_CELL,
    columns: MW_MAP_COLUMNS,
    rows: MW_MAP_ROWS,
  }),
  box: MW_COLOURS.map,
  // Only floor 0 has buildings, and `squareOn` leaves the field at 0 on every other floor.
  buildingOn: (square) => square.surface ?? 0,
  buildingColour: (building) => building + 2,
  // FUN_2000_7c8a (exe 2000:7c8a) fills the cell in the next of sixteen palette entries every
  // pass, so it blinks. The frame gets one of them — the recording's own yellow — and
  // `MwScreen.svelte` blinks a canvas of its own over {@link mwMarkerRect}.
  marker: { kind: 'cell', colour: MW_COLOURS.menuKey },
  clipDoorTick: false,
  lastColumn: MW_DUNGEON_XMAX,
  lastRow: MW_DUNGEON_YMAX,
};

/**
 * The maroon box the map is drawn on, from FUN_3000_b066 (WORLD.EXE 3000:b066, mw.c
 * "FUN_3000_b066"): from the screen's left edge to `0x119 * lastColumn / 0x640`, and from the
 * map's own top down past its last row. The bottom edge is lost in the decompilation, so it is
 * taken as the grid's own last row and the two pixels the cells' corner dots reach past it.
 */
const MW_MAP_BOX_RIGHT = 0x119;
const MW_MAP_BOX_BELOW_GRID = 2;

/** The map beside the views: its box, the squares the character knows, the cursor on their own
 *  square, and whatever monsters debug mode is marking. */
export function drawMwZoomMap(frame: Frame, floor: ZoomMapFloor): void {
  const window = MORAFFS_WORLD_ZOOM_MAP.window(frame);
  fillRect(
    frame,
    0,
    window.top,
    Math.trunc(((frame.width - 1) * MW_MAP_BOX_RIGHT) / MW_SCREEN_UNITS_X),
    window.top + window.rows * window.cell + MW_MAP_BOX_BELOW_GRID,
    MORAFFS_WORLD_ZOOM_MAP.box,
  );
  drawZoomMap(frame, floor, window, floor.at, MORAFFS_WORLD_ZOOM_MAP);
  drawZoomMarker(frame, window, MORAFFS_WORLD_ZOOM_MAP);
  drawZoomMonsters(frame, window, floor.at, floor.monsters ?? [], floor.thumbnail);
}

/** Where the X key's map goes: from the same corner the corner map starts at, over the whole
 *  floor. */
export const mwExpandedMapWindow = (): ZoomMapWindow => ({
  left: MW_MAP_LEFT,
  top: MW_EXPANDED_TOP,
  cell: MW_EXPANDED_CELL,
  columns: MW_EXPANDED_COLUMNS,
  rows: MW_EXPANDED_ROWS,
});

/**
 * The colour the character's own square is left in on that map. FUN_2000_7d00 (exe 2000:7d00) is
 * handed the counter movecontrol's wait keeps adding to, and unlike the corner map's own
 * FUN_2000_7c8a (exe 2000:7c8a) it does not take it modulo 16, so the square blinks through the
 * whole palette rather than through the first sixteen entries. The frame gets the colour the
 * corner map's cursor is drawn in, and `MwScreen.svelte` blinks a canvas over
 * {@link mwExpandedMarkerRect}.
 */
const MW_EXPANDED_CURSOR = MW_COLOURS.menuKey;

/**
 * movecontrol's X key (exe 2000:aad5): the whole floor over the whole screen, the character's own
 * square filled on top, and whatever monsters debug mode is marking.
 *
 * The colour FUN_3000_b066 fills the screen with before it draws is lost in the decompilation, so
 * it is taken as the maroon the corner map's own box is filled with, which is what Dungeons of the
 * Unforgiven's FUN_3000_8e75 fills its own expanded map with.
 */
export function drawMwExpandedMap(frame: Frame, floor: ZoomMapFloor): void {
  const window = mwExpandedMapWindow();
  drawExpandedZoomMap(frame, floor, MORAFFS_WORLD_ZOOM_MAP, {
    window,
    centre: MW_EXPANDED_CENTRE,
    ground: MORAFFS_WORLD_ZOOM_MAP.box,
    cursor: MW_EXPANDED_CURSOR,
  });
  drawZoomMonsters(frame, window, MW_EXPANDED_CENTRE, floor.monsters ?? [], floor.thumbnail);
}

/**
 * The two blinks the game marks the character's own square with.
 *
 * `movecontrol` keeps a counter it adds one to every time round the loop it waits for a key in
 * and hands to whichever fill is drawing the square. `FUN_2000_7c8a` (WORLD.EXE 2000:7c8a) takes
 * that counter modulo sixteen for the map beside the views, so that square turns over the first
 * sixteen entries of the palette; `FUN_2000_7d00` (WORLD.EXE 2000:7d00) takes it as it stands for
 * the map the X key fills the screen with, so that one walks the whole palette and round again.
 * Neither game ever settles on a colour, which is how a character is found on a floor with a lot
 * of it revealed.
 */
const MW_MARKER_ENTRIES = 0x10;
const MW_EXPANDED_MARKER_ENTRIES = 0x100;

/** Which palette entry the square beside the views stands in on a given pass of that loop. */
export const mwMarkerColour = (pass: number): number => pass % MW_MARKER_ENTRIES;

/** Which palette entry the square on the X key's map stands in on the same pass. */
export const mwExpandedMarkerColour = (pass: number): number => pass % MW_EXPANDED_MARKER_ENTRIES;

/**
 * How many passes of that loop have gone by at a moment in time.
 *
 * The original counts them rather than the clock, so the pace is the machine's; `GRADIENT_STEP_MS`
 * is the one number the site counts such a pass at, which everything that crawls or flickers over
 * a screen takes.
 */
export const mwMarkerPass = (timeMs: number): number => Math.floor(timeMs / GRADIENT_STEP_MS);

/**
 * The pixels of the screen the character's own square covers on the map beside the views, which
 * is the rectangle `FUN_2000_7c8a` fills: two pixels inside the cell and out to the first pixel
 * of the next one. The map is centred on the character, so the cell is the middle of the window.
 */
export function mwMarkerRect(frame: { width: number; height: number }): { x: number; y: number; size: number } {
  const window = MORAFFS_WORLD_ZOOM_MAP.window(frame);
  const x = window.left + (window.columns >> 1) * window.cell;
  const y = window.top + (window.rows >> 1) * window.cell;
  return { x: x + 2, y: y + 2, size: window.cell - 1 };
}

/** The same square on the map the X key fills the screen with, which `FUN_2000_7d00` fills where
 *  the character stands on the floor rather than in the middle of a window. */
export function mwExpandedMarkerRect(at: { x: number; y: number }): { x: number; y: number; size: number } {
  const { left, top, cell } = mwExpandedMapWindow();
  return { x: left + cell * at.x + 2, y: top + cell * at.y + 2, size: cell - 1 };
}

/**
 * The colour that square stands in at a moment in time, as a CSS colour, for the site's own 2-D
 * map (`src/lib/map/FloorCanvas.svelte`). It follows the corner map's sixteen, which is the map
 * of the game this one stands in for.
 */
export function mwYouColour(palette: Rgb[], timeMs: number): string {
  const [r, g, b] = palette[mwMarkerColour(mwMarkerPass(timeMs))] ?? [0, 0, 0];
  return `rgb(${r} ${g} ${b})`;
}
