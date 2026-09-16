import { sectionPictures } from '../game/port/pictures';
import type { MapSquare } from '../map/game';
import { viewPictures } from '../play/view3d/browser';
import { newFrame, toRgba } from '../play/view3d/frame';
import { WHOLE_SCREEN_VIEW } from '../play/view3d/geometry';
import { renderView, type ViewScene } from '../play/view3d/render';
import { DETAIL_TEXTURED } from '../play/view3d/wall';
import type { Monster } from './monsters';
import { sectionPalette, type RenderedImage } from './pictures';

/**
 * A monster drawn the way you meet it: standing one square ahead of you in a dungeon corridor,
 * through the game's own 3-D view.
 *
 * The corridor is made up rather than found. The view is drawn from a floor built here — solid
 * rock with one straight passage cut through it — so the picture does not depend on where the
 * monster happens to be stocked on a real floor. Everything else is the game's: `renderView` is
 * the port of `draw_3d_view`, and it draws the monster on the square ahead itself.
 */

/** The picture's size, which is also how wide the card shows it, so its pixels stay square. */
export const CORRIDOR_WIDTH = 512;
export const CORRIDOR_HEIGHT = 384;

/** Facings are 0 north, 1 south, 2 west, 3 east. The corridor is cut northward. */
const NORTH = 0;

/** Where the character stands on the made-up floor. Anywhere inside it will do; the square's own
 *  x and y are read for the wall decorations, so this being fixed is what keeps one section's
 *  corridor the same from monster to monster. */
const STANDING = { x: 5, y: 5 };

/** How many squares of corridor are cut. The monster fills the view from the first of them, so
 *  the rest only show as the walls either side of it. */
const CORRIDOR_DEPTH = 4;

/** The height the horizon is weighed by (DS:b8bd), in the quarter-feet the character record
 *  counts height in: 18 is the six-foot character the port rolls by default. */
const EYE_HEIGHT = 18;

/** The video mode the corridor is drawn as though the game were running in: 2 and up are the
 *  256-colour ones, which is what the site draws everywhere else. */
const VIDEO_CLASS = 2;

/** The three sections whose monsters stand in water. `Screen.svelte` names the same three. */
const WATER_SECTIONS = [4, 8, 20];

/** Where the card is showing the monster, which is what the corridor is drawn from. */
export interface CorridorPlace {
  /** The module, counted from 0 the way the game counts them. */
  module: number;
  floor: number;
  /** The section that floor belongs to, 1..20, which picks the wall pictures. */
  section: number;
  /** Which quarter of the module that section is, 1..4, which picks the colours. */
  part: number;
}

/** A square with a wall on all four sides, which is what solid rock is. */
const rock = (): MapSquare => ({ n: 0, s: 0, w: 0, e: 0, solid: false, ladder: 0, chute: 0, trapdoor: -1 });

/**
 * Solid rock with a corridor running north from where the character stands. Opening a square's
 * north side is what makes the way through to the square beyond it; leaving every east and west
 * side shut is what gives the corridor its walls.
 */
export function corridorFloor(): MapSquare[][] {
  const size = STANDING.y + CORRIDOR_DEPTH + 2;
  const rows = Array.from({ length: size }, () => Array.from({ length: size }, rock));
  for (let step = 0; step < CORRIDOR_DEPTH; step++) rows[STANDING.y - step][STANDING.x].n = 3;
  return rows;
}

/** What the view is drawn from: the made-up corridor, the section's pictures and colours, and
 *  the monster standing one square ahead. */
export function corridorScene(entry: Monster, place: CorridorPlace): ViewScene {
  return {
    rows: corridorFloor(),
    at: STANDING,
    floor: place.floor,
    module: place.module,
    moduleCarried: place.module,
    pictures: viewPictures(sectionPictures(place.section)),
    detail: DETAIL_TEXTURED,
    screen: { width: CORRIDOR_WIDTH, height: CORRIDOR_HEIGHT },
    videoClass: VIDEO_CLASS,
    horizonWeight: EYE_HEIGHT,
    dir: NORTH,
    monsters: [
      {
        x: STANDING.x,
        y: STANDING.y - 1,
        picnum: entry.picnum,
        builtin: entry.origin.kind === 'builtin',
        section: entry.origin.kind === 'section' ? entry.origin.section : null,
        colour: entry.color,
        colorSet: entry.colorSet,
      },
    ],
    water: WATER_SECTIONS.includes(place.section),
    // No generator is handed over, so the monster is never mirrored: a card that redrew itself
    // for a different reason would otherwise turn the monster round under you.
  };
}

/** The monster standing in the corridor of the place the card is showing it in. */
export function renderMonsterInCorridor(entry: Monster, place: CorridorPlace): RenderedImage {
  const frame = newFrame(CORRIDOR_WIDTH, CORRIDOR_HEIGHT);
  renderView(frame, corridorScene(entry, place), WHOLE_SCREEN_VIEW, NORTH);
  return {
    width: CORRIDOR_WIDTH,
    height: CORRIDOR_HEIGHT,
    data: toRgba(frame, sectionPalette(place.module + 1, place.part)),
  };
}
