import { expLabel, levelLabel } from '../character/record';
import { DUNGEON_XMAX, DUNGEON_YMAX } from '../game/unfmap.js';
import { ARMOR_NAMES, WEAPON_NAMES } from '../game/port/drops';
import type { PlayerCharacter, ScreenLine, ScreenRect } from '../game/port/state';
import { fillRect, type Frame } from './view3d/frame';
import {
  drawExpandedZoomMap,
  drawZoomMap,
  drawZoomMarker,
  facingArrowRect,
  type ZoomMapFloor,
  type ZoomMapStyle,
  type ZoomMapWindow,
} from './zoom-map';
import { drawZoomMonsters } from './zoom-monsters';
import { drawZoomRoute } from './zoom-route';

/**
 * The whole screen `movecontrol` (exe 2000:c308) keeps up while the game is played: the four 3-D
 * views, the boxes around them and the blocks of text on them.
 *
 * Everything is placed in the grid the game draws in whatever the video mode, 1600 across and
 * 1200 down, which is the grid `view3d/text.ts` draws a line of text in and the one the view
 * rectangles in `view3d/geometry.ts` are given in. `dotu-tools/docs/SCREEN.md` is the same
 * screen described from a photograph of the real thing.
 */

/** The whole of it, for anything that wants the screen as a rectangle. */
export const SCREEN_WINDOW = { x: 0, y: 0, width: 1600, height: 1200 };

/** One of the twelve screens the game can run in. */
export interface VideoMode {
  /** The number DS:c6a8 holds, which the game takes from its fourth command-line argument. */
  mode: number;
  width: number;
  height: number;
  colours: number;
}

/**
 * The twelve video modes, from the jump table at `FUN_2000_1598` (exe 2000:1598, dispatched at
 * 2000:15ac). Each arm sets the screen's last column at DS:c6aa and its last row at DS:c6ae —
 * one less than the sizes below — and the number of colours at DS:c6e9.
 *
 * The G key does not choose between them: it only cycles the view size and the wall detail.
 */
export const VIDEO_MODES: VideoMode[] = [
  { mode: 0, width: 720, height: 348, colours: 2 },
  { mode: 1, width: 320, height: 200, colours: 4 },
  { mode: 2, width: 320, height: 200, colours: 16 },
  { mode: 3, width: 320, height: 200, colours: 256 },
  { mode: 4, width: 360, height: 480, colours: 256 },
  { mode: 5, width: 640, height: 350, colours: 16 },
  { mode: 6, width: 640, height: 480, colours: 16 },
  { mode: 7, width: 800, height: 600, colours: 16 },
  { mode: 8, width: 1024, height: 768, colours: 16 },
  { mode: 9, width: 1024, height: 768, colours: 256 },
  { mode: 10, width: 1024, height: 768, colours: 256 },
  { mode: 11, width: 640, height: 480, colours: 256 },
];

/** The mode the game is played in here: 1024 by 768 in 256 colours. */
export const SCREEN_MODE = VIDEO_MODES[9];
export const SCREEN_PIXELS = { width: SCREEN_MODE.width, height: SCREEN_MODE.height };

/** A box on the screen, in those same units. Both edges are inside it. */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  colour: number;
}

/**
 * The rectangles the game fills before it draws anything in them, in the order it fills them.
 *
 * Each is a `FUN_2000_20db` (exe 2000:20db) call, which scales its corners by 1599 and 1199 —
 * one unit off `pfont`'s 1600 and 1200. Every colour here is the one a 256-colour mode gets; the
 * lower ones fill some of these boxes flat black instead, which this port does not offer.
 */
export const KEY_MENU_BOX: ScreenBox = { left: 4, top: 5, right: 0x126, bottom: 0x20f, colour: 10 };
export const ZOOM_MAP_BOX: ScreenBox = { left: 0x519, top: 0, right: 0x63f, bottom: 0x20c, colour: 10 };
export const BATTLE_SPELLS_BOX: ScreenBox = { left: 5, top: 0x2fe, right: 0x2ac, bottom: 0x40c, colour: 10 };
/** The strip above the message box, which is the background of the one line drawn over the menu. */
export const MESSAGE_BAR_BOX: ScreenBox = { left: 0x398, top: 0x2ff, right: 0x640, bottom: 0x329, colour: 11 };
export const MESSAGE_BOX: ScreenBox = { left: 0x398, top: 0x324, right: 0x640, bottom: 0x4af, colour: 13 };
export const STATUS_BOX: ScreenBox = { left: 4, top: 0x40e, right: 0x393, bottom: 0x4ac, colour: 11 };

export const SCREEN_BOXES: ScreenBox[] = [
  KEY_MENU_BOX,
  ZOOM_MAP_BOX,
  BATTLE_SPELLS_BOX,
  MESSAGE_BAR_BOX,
  MESSAGE_BOX,
  STATUS_BOX,
];

/**
 * `FUN_4000_667b` (exe 4000:667b, unf.c "FUN_4000_667b"): the thirteen lines of the key menu.
 *
 * Every line is drawn twice, once in green and once in yellow, and the yellow pass puts the key
 * letter into a hole the green pass left. `psfont` (exe 4000:0db8) steps by the width it is
 * given divided by the string's own length, so a pass lands its letters where it does by how
 * long it is and how far it is spread; two of the lines are given a shorter string and a wider
 * spread above 1000 pixels across, which is what `keysSpreadTo` below is. The strings are the
 * bytes of the data segment, spaces and all.
 *
 * The two passes are not drawn in the same face. `FUN_4000_667b` clears DS:4dec around the green
 * pass, which stops `psfont` handing those lines to the vector font, so the menu's own words come
 * out as .FNT glyphs while the key letters over them are strokes — see `view3d/menu-font.ts`.
 */
export const KEY_MENU_X = 9;
export const KEY_MENU_SPREAD_TO = 0x126;
/** The colour of the key letter in every line. */
export const KEY_MENU_KEY_COLOUR = 4;

export const KEY_MENU_LINES: {
  y: number;
  body: string;
  keys: string;
  colour: number;
  /** The x the key letters are spread out to, where it is not the body's own. */
  keysSpreadTo?: number;
}[] = [
  { y: 0x00a, body: ' ) PREP SPELLS', keys: '1             ', colour: 8 },
  { y: 0x02f, body: 'VIEW  ONEY    ', keys: '   M     ', colour: 8, keysSpreadTo: 0x134 },
  { y: 0x054, body: ' IEW STATS    ', keys: 'V             ', colour: 8 },
  { y: 0x079, body: ' AST SPELL    ', keys: 'C             ', colour: 8 },
  { y: 0x09e, body: 'E PAND MAP    ', keys: ' X            ', colour: 8 },
  { y: 0x0c3, body: ' XP NEEDED    ', keys: 'E             ', colour: 8 },
  // The one line of the menu the game draws in pale blue rather than green.
  { y: 0x0e8, body: ' PTIONS MENU  ', keys: 'O             ', colour: 3 },
  { y: 0x10c, body: 'DIG  UNNEL    ', keys: '    T         ', colour: 8 },
  { y: 0x131, body: ' IGHT  OSE ITEM', keys: 'F     L        ', colour: 8 },
  { y: 0x156, body: ' RMOR  EAPONS ', keys: 'A   W    ', colour: 8, keysSpreadTo: 0x119 },
  { y: 0x17b, body: ' OOM   OCKETS ', keys: 'Z     P       ', colour: 8 },
  { y: 0x19f, body: ' ELP   RAPHICS', keys: 'H     G       ', colour: 8 },
  { y: 0x1c4, body: ' UIT  USE  TEM', keys: 'Q         I   ', colour: 8 },
];

/** The white line under the menu, in the same box (DS:6779). */
export const SECTION_INFO = { text: 'S) SECTION INFO', y: 0x1ea, colour: 15 };

/**
 * The font index `FUN_4000_667b` (exe 4000:667b) passes for its thirteen body lines on a screen
 * wider than 1000 of its own units, which is the glyph box they come out in.
 *
 * The thirteen key letters laid over them and the S) SECTION INFO line under them are a separate
 * pass, drawn after DS:4dec has been set again and given a literal 0, so they are strokes at the
 * body face's size rather than glyphs at the big one.
 */
export const KEY_MENU_BODY_FONT = 2;

/**
 * How far down its own line the game drops the body pass, which is twice the font index it
 * passes for it: 4 at 1024 by 768, where that index is 2.
 */
export const KEY_MENU_BODY_DROP = 2 * KEY_MENU_BODY_FONT;

/** The thirteen lines and the line under them, as the screen renderer takes them. */
export function keyMenuLines(): ScreenLine[] {
  const place = { x: KEY_MENU_X, spreadTo: KEY_MENU_SPREAD_TO, font: 0 };
  const lines = KEY_MENU_LINES.flatMap((line): ScreenLine[] => [
    { ...place, font: KEY_MENU_BODY_FONT, text: line.body, y: line.y + KEY_MENU_BODY_DROP, colour: line.colour, bitmapFace: true },
    {
      ...place,
      spreadTo: line.keysSpreadTo ?? KEY_MENU_SPREAD_TO,
      text: line.keys,
      y: line.y,
      colour: KEY_MENU_KEY_COLOUR,
    },
  ]);
  return [...lines, { ...place, text: SECTION_INFO.text, y: SECTION_INFO.y, colour: SECTION_INFO.colour }];
}

/** The numbers the green block along the bottom prints, which is the whole of what drawing it
 *  needs to know about the character. */
export type StatusNumbers = Pick<
  PlayerCharacter,
  | 'armor'
  | 'weapon'
  | 'lev'
  | 'exp'
  | 'hp'
  | 'maxHp'
  | 'sp'
  | 'maxSp'
  | 'str'
  | 'iq'
  | 'wis'
  | 'con'
  | 'dex'
  | 'luck'
>;

/** The numbers as they stand, for the block to be drawn with. */
export function statusNumbers(pc: PlayerCharacter): StatusNumbers {
  return {
    armor: pc.armor,
    weapon: pc.weapon,
    lev: pc.lev,
    exp: pc.exp,
    hp: pc.hp,
    maxHp: pc.maxHp,
    sp: pc.sp,
    maxSp: pc.maxSp,
    str: pc.str,
    iq: pc.iq,
    wis: pc.wis,
    con: pc.con,
    dex: pc.dex,
    luck: pc.luck,
  };
}

/**
 * `FUN_3000_caac` (exe 3000:caac, unf.c "FUN_3000_caac"): the green block along the bottom.
 *
 * The experience is printed with `%-20.0f`, whose trailing spaces draw nothing, so the port
 * prints the number alone. A character of level 9 or more gets the short labels and a different
 * set of x's, which is how the experience of a deep character still fits on the line.
 */
export function statusLines(pc: StatusNumbers): ScreenLine[] {
  const short = pc.lev >= 9;
  const at = (text: string, x: number, y: number, colour: number): ScreenLine => ({ text, x, y, font: 0, colour });
  return [
    at(`ARMOR:${ARMOR_NAMES[pc.armor] ?? '?'}`, 0x0a, 0x410, 3),
    at(`WEAPON:${WEAPON_NAMES[pc.weapon] ?? '?'}`, 0x190, 0x410, 3),
    at(`${levelLabel(pc.lev)}${pc.lev}`, 0x0a, 0x437, 4),
    at(expLabel(pc.lev), short ? 0x8c : 0x122, 0x437, 4),
    at(String(Math.round(pc.exp)), short ? 0xbe : 0x190, 0x437, 4),
    at(`SPELL POINTS:${Math.trunc(pc.sp)} OF ${Math.trunc(pc.maxSp)}`, 0x0a, 0x45d, 8),
    at(`HEALTH POINTS:${pc.hp} OF ${pc.maxHp}`, 0x0a, 0x483, 8),
    at(`STR:${pc.str}`, 0x24e, 0x437, 6),
    at(`INT:${pc.iq}`, 0x2f8, 0x437, 6),
    at(`WIZ:${pc.wis}`, 0x24e, 0x45d, 6),
    at(`CON:${pc.con}`, 0x2f8, 0x45d, 6),
    at(`DEX:${pc.dex}`, 0x24e, 0x483, 6),
    // The one label with no colon, which is why the block reads LUCK17 (DS:2831).
    at(`LUCK${pc.luck}`, 0x2f8, 0x483, 6),
  ];
}

/**
 * `FUN_3000_8e75` (exe 3000:8e75, unf.c "FUN_3000_8e75"): the small map in the top right corner,
 * drawn in the screen's own pixels rather than the 1600 x 1200 grid.
 *
 * `FUN_2000_59c0` (exe 2000:59c0) sets the three numbers below out of a table the video mode
 * indexes: 8 pixels in 15 columns by 26 rows on a 640 x 480 screen, and 10 in 19 by 33 on a
 * 1024 x 768 one. The window is centred on the character, who stands at column `columns >> 1`
 * and row `rows >> 1`.
 */
export const ZOOM_CELL = 10;
export const ZOOM_COLUMNS = 19;
export const ZOOM_ROWS = 33;

/** The left edge of the map, as DS:0411 works it out from the screen's width. */
export const zoomMapLeft = (screenWidth: number): number =>
  Math.trunc(((screenWidth - 1) * ZOOM_MAP_BOX.left) / 0x63f);

/** Where the map is drawn on a frame of this width, and how much of the floor it shows. */
export const zoomMapWindow = (frameWidth: number): ZoomMapWindow => ({
  left: zoomMapLeft(frameWidth),
  top: 0,
  cell: ZOOM_CELL,
  columns: ZOOM_COLUMNS,
  rows: ZOOM_ROWS,
});

/**
 * The two colours the arrow on the character's square flashes between, as palette entries.
 * `ARROW_FLASH_MS` in `../map/you` is how long each is held.
 *
 * Black is `FUN_2000_9d17` plotting the same bitmap in colour 0, so the arrow disappears into the
 * cell rather than changing colour. Colour 15 is what every video mode but the first lights it in
 * (exe 2000:c792), and the port draws mode 9 alone.
 *
 * Nothing else in the game draws the arrow, so it stands still in whatever colour it was left in
 * while a message box waits behind its plaque: that wait is `FUN_2000_2a2e` (exe 2000:2a2e),
 * which polls the keyboard without going round `movecontrol`'s loop.
 */
export const ARROW_LIT_COLOUR = 15;
export const ARROW_DARK_COLOUR = 0;

/** The square the arrow stands in on the game's own screen, which is fixed: the map's window is
 *  always centred on the character. */
export const FACING_ARROW_RECT = facingArrowRect(zoomMapWindow(SCREEN_PIXELS.width));

/**
 * Dungeons of the Unforgiven's row of the table `drawsquare` (exe 3000:87de) is drawn from.
 * `src/lib/play/mw/map.ts` holds Moraff's World's, and `zoom-map.ts` says what the two differ
 * over.
 */
export const UNFORGIVEN_ZOOM_MAP: ZoomMapStyle = {
  window: (frame) => zoomMapWindow(frame.width),
  box: ZOOM_MAP_BOX.colour,
  // The town is the only floor with buildings, and `squareOn` leaves the field at 0 everywhere
  // else; `drawsquare` asks about the ladder first and leaves a square with one alone.
  buildingOn: (square) => (square.ladder === 0 ? (square.town ?? 0) : 0),
  buildingColour: zoomBuildingColour,
  marker: { kind: 'arrow' },
  clipDoorTick: true,
  lastColumn: DUNGEON_XMAX,
  lastRow: DUNGEON_YMAX,
};

/**
 * `FUN_2000_59c0(0)` (exe 2000:59c0): the map the X key fills the screen with, which is the same
 * drawing at seven pixels a square over the whole eighty by a hundred and ten floor, from the
 * screen's own top left corner — the branch sets DS:0411 and DS:0413 to zero before it draws.
 */
export const EXPANDED_CELL = 7;
export const EXPANDED_COLUMNS = 80;
export const EXPANDED_ROWS = 110;

/**
 * The square the X branch centres the map on (exe 2000:d349 and 2000:d34d): column 40 and row 55,
 * which with a window of the floor's own size shows the floor from its first square.
 */
export const EXPANDED_CENTRE = { x: 40, y: 55 };

/**
 * The colour `FUN_3000_8e75` (exe 3000:8e75) fills the screen with before it draws the squares —
 * 10 in a 256-colour mode, which is the maroon the corner map's own box is drawn in.
 */
export const EXPANDED_GROUND = 10;

/** Where the expanded map is drawn, which is the whole screen from its top left corner. */
export const expandedMapWindow = (): ZoomMapWindow => ({
  left: 0,
  top: 0,
  cell: EXPANDED_CELL,
  columns: EXPANDED_COLUMNS,
  rows: EXPANDED_ROWS,
});

/**
 * Where a corner of a filled rectangle lands on the frame. `FUN_2000_20db` (exe 2000:20db) scales
 * its corners by the screen's last column over 1599 and its last row over 1199, one unit off
 * `pfont`'s own 1600 and 1200.
 */
const fillX = (frame: Frame, x: number): number => Math.trunc(((frame.width - 1) * x) / 0x63f);
const fillY = (frame: Frame, y: number): number => Math.trunc(((frame.height - 1) * y) / 0x4af);

/**
 * The colour 0 a screen that takes the display over is drawn on: `cast_a_spell` fills the top of
 * the screen for its spell table and the message column for the miniature one, and a screen whose
 * own fill is lost in the decompilation blacks the whole display out instead.
 */
export function clearScreenRect(frame: Frame, rect: ScreenRect): void {
  const [left, top] = [fillX(frame, rect.x), fillY(frame, rect.y)];
  fillRect(frame, left, top, fillX(frame, rect.right), fillY(frame, rect.bottom), 0);
}

/** One of the screen's boxes, filled in its own colour. */
export function fillScreenBox(frame: Frame, box: ScreenBox): void {
  const [left, top] = [fillX(frame, box.left), fillY(frame, box.top)];
  fillRect(frame, left, top, fillX(frame, box.right), fillY(frame, box.bottom), box.colour);
}

/**
 * The boxes and the zoom map, painted into the frame the four views are drawn on. The words over
 * them go on afterwards, through `view3d/text.ts`.
 */
export function drawScreenFurniture(frame: Frame, floor: UnforgivenZoomMapFloor): void {
  for (const box of SCREEN_BOXES) fillScreenBox(frame, box);
  drawZoomMapOnly(frame, floor);
}

/**
 * The floor as this game's map draws it. Dungeons of the Unforgiven has a facing and marks it
 * with an arrow, so its own square needs the way the character is turned; Moraff's World has none.
 */
export interface UnforgivenZoomMapFloor extends ZoomMapFloor {
  at: { x: number; y: number; dir: number };
}

/** The map beside the views on its own, without the boxes around it. */
export function drawZoomMapOnly(frame: Frame, floor: UnforgivenZoomMapFloor): void {
  drawZoomMapWithoutMarker(frame, floor);
  drawZoomMapMarker(frame, floor.at.dir);
}

/**
 * The map window as FUN_3000_8e75 draws it at the top of a pass, before the arrow: the arrow is
 * FUN_2000_9d17's, drawn after the four views, so a slow redraw shows it last.
 */
export function drawZoomMapWithoutMarker(frame: Frame, floor: UnforgivenZoomMapFloor): void {
  const window = UNFORGIVEN_ZOOM_MAP.window(frame);
  drawZoomMap(frame, floor, window, floor.at, UNFORGIVEN_ZOOM_MAP);
  drawZoomRoute(frame, window, floor.at, floor.route ?? []);
  drawZoomMonsters(frame, window, floor.at, floor.monsters ?? [], floor.thumbnail, floor.highlight);
}

/** FUN_2000_9d17 (exe 2000:9d17): the arrow on the character's own square. */
export function drawZoomMapMarker(frame: Frame, dir: number): void {
  drawZoomMarker(frame, UNFORGIVEN_ZOOM_MAP.window(frame), UNFORGIVEN_ZOOM_MAP, dir);
}

/**
 * The X key's map (exe 2000:d341): the whole screen filled and the floor drawn over it at the
 * expanded size, with the character's own square filled on top.
 *
 * `FUN_2000_a068` (exe 2000:a068) is that last square, which the original redraws in a new colour
 * every time round the loop it waits for a key in, so it flickers through the whole palette.
 * Nothing here waits, so the frame gets one colour — the white the loop's own marker flashes in
 * (exe 2000:c799) — and the tab flickers a canvas of its own over {@link expandedMarkerRect}.
 */
export function drawExpandedMap(frame: Frame, floor: UnforgivenZoomMapFloor): void {
  const window = expandedMapWindow();
  drawExpandedZoomMap(frame, floor, UNFORGIVEN_ZOOM_MAP, {
    window,
    centre: EXPANDED_CENTRE,
    ground: EXPANDED_GROUND,
    cursor: EXPANDED_MARKER,
  });
  drawZoomRoute(frame, window, EXPANDED_CENTRE, floor.route ?? []);
  drawZoomMonsters(frame, window, EXPANDED_CENTRE, floor.monsters ?? [], floor.thumbnail, floor.highlight);
}

/** The colour the character's own square is left in, which is what movecontrol's marker flashes
 *  in on the map beside the views. */
const EXPANDED_MARKER = 15;

/**
 * The pixels of the screen the character's own square covers on the X key's map: what
 * `FUN_2000_a068` (exe 2000:a068) fills, which is two pixels inside the cell and out to the first
 * pixel of the next one.
 *
 * The X branch's counter starts at 0 and goes up by one for every poll of the keyboard (exe
 * 2000:d2fe), and its low byte is the colour, so the square walks palette entries 0 to 255 and
 * round again for as long as the map is up.
 */
export function expandedMarkerRect(at: { x: number; y: number }): { x: number; y: number; size: number } {
  const { left, top, cell } = expandedMapWindow();
  return { x: left + cell * at.x + 2, y: top + cell * at.y + 2, size: cell - 1 };
}

/**
 * The colour a square with one of the town's four buildings on it is filled with: the building's
 * own number plus two, except that the inn's 6 is moved on to 8 (exe 3000:8864). Six is the red
 * the corner dots are plotted in, and eight a dark grey.
 */
export function zoomBuildingColour(building: number): number {
  const colour = building + 2;
  return colour === 6 ? 8 : colour;
}
