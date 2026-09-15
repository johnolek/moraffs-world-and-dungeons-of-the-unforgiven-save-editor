import { sectionPictures } from '../game/port/pictures';
import { SeededRng } from '../game/port/rng';
import type { MapSquare } from '../map/game';
import { monsterById, type StockedMonster } from '../map/stocking';
import type { KilledOnScreen } from './engine';
import { viewPictures } from './view3d/browser';
import type { ViewPictures } from './view3d/pictures';
import type { KilledMonster, ViewMonster, ViewScene } from './view3d/render';

/**
 * The scene Dungeons of the Unforgiven's 3-D views are drawn from: the floor, the monsters
 * standing on it, the pictures of the section it is in and where the character was standing when
 * the views were last drawn.
 *
 * `Screen.svelte` draws the game's four views from it and `ForwardView.svelte` the one view the
 * map's display shows, so neither can come to draw the same corridor differently from the other.
 * Nothing here reads the game or writes to it.
 */

/** The three sections the views draw under water (`bestiary/corridor.ts` names the same three). */
const WATER_SECTIONS = [4, 8, 20];

export interface ViewSceneInput {
  rows: MapSquare[][];
  /** Where the views are drawn from and which way the character faces. */
  from: { x: number; y: number; floor: number; module: number; dir: number };
  /** The section whose pictures the walls and the monsters are drawn out of, or null in the
   *  town, which is in none of the twenty. */
  section: number | null;
  /** The picture set to draw with, which a game takes from its rules. A scene built out of
   *  nothing but a section leaves it out and the section's own files are read. */
  pictures?: ViewPictures;
  monsters: ViewMonster[];
  /** The monster whose skull is standing, or null when nothing has just been killed. */
  killed: KilledMonster | null;
  /**
   * Which drawing of the views this is, which the coin flip that mirrors the monster ahead (exe
   * 3000:2323) is seeded from. A run has to replay exactly and a tab redraws far more often than
   * the loop draws the views, so the flips are drawn from the number of the drawing rather than
   * from the game's own generator: every redraw between two drawings mirrors the monster the same
   * way round.
   */
  viewsDrawn: number;
  /** DS:b8bd, the character's height, which is where the horizon sits. */
  height: number;
  /** The real screen the 1600 x 1200 units are scaled onto. */
  screen: { width: number; height: number };
}

export function dotuViewScene(input: ViewSceneInput): ViewScene {
  const flips = new SeededRng(input.viewsDrawn);
  return {
    rows: input.rows,
    at: { x: input.from.x, y: input.from.y },
    floor: input.from.floor,
    module: input.from.module,
    moduleCarried: input.from.module,
    pictures: input.pictures ?? viewPictures(sectionPictures(input.section ?? 1)),
    detail: 0,
    screen: input.screen,
    videoClass: 2,
    horizonWeight: input.height,
    dir: input.from.dir,
    monsters: input.monsters,
    water: WATER_SECTIONS.includes(input.section ?? 0),
    killed: input.killed,
    random: () => flips.rand() / 0x8000,
  };
}

/** The monsters stocked on the floor as the views draw them, leaving out any the catalogue has
 *  no entry for. */
export function viewMonsters(monsters: StockedMonster[]): ViewMonster[] {
  return monsters.flatMap((monster) => {
    const one = viewMonster(monster);
    return one ? [one] : [];
  });
}

/** The monster the skull is standing over. The square it stood on is not read: the skull goes
 *  into the rectangle its picture was drawn in, which the direction alone names. */
export function killedMonster(killed: KilledOnScreen | null): KilledMonster | null {
  if (!killed) return null;
  const one = viewMonster({ x: 0, y: 0, monsterId: killed.monsterId });
  return one ? { dir: killed.dir, monster: one } : null;
}

function viewMonster(monster: { x: number; y: number; monsterId: string }): ViewMonster | null {
  const entry = monsterById(monster.monsterId);
  if (!entry) return null;
  return {
    x: monster.x,
    y: monster.y,
    picnum: entry.picnum,
    builtin: entry.origin.kind === 'builtin',
    colour: entry.color,
    colorSet: entry.colorSet,
  };
}
