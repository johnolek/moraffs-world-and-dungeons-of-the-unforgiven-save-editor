import type { GameId } from '../app-state.svelte';
import type { RenderedImage } from '../bestiary/pictures';
import { bundledDungeon } from '../game/dungeon';
import { bundledMwDungeon } from '../game/mw-dungeon';
import { LEVELS as REVENGE_LEVELS, floor as revengeFloor, squareOn as revengeSquareOn } from '../game/revmap.js';
import { BOTTOM_LEVEL, type TrapdoorReach } from '../game/unfmap.js';
import { MORAFFS_REVENGE_AREA, MORAFFS_WORLD_AREA, UNFORGIVEN_AREA, type MapArea } from './area';
import {
  exploredFloorCount,
  loadedSummary,
  quarterSummary,
  readBinFile,
  readDotuDunFile,
  readDunFile,
  type ExploredMapFiles,
} from './explored';
import { MODULE_NUMERALS } from './labels';
import { MORAFFS_WORLD_STOCKING } from './mw-stocking';
import { MORAFFS_REVENGE_STOCKING } from './rev-stocking';
import { hasTeleporterSide } from './path';
import { UNFORGIVEN_STOCKING, type MonsterCountGroup, type StockedMonster } from './stocking';

/**
 * A square of either game's floor. The two generators fill the same fields apart from the
 * floor-0 building, which Dungeons of the Unforgiven calls `town` and Moraff's World `surface`;
 * {@link MapGame.buildingOn} reads whichever one the game has.
 */
export interface MapSquare {
  n: number;
  s: number;
  w: number;
  e: number;
  /** Rock: all four sides are walls, never enterable. */
  solid: boolean;
  /** Floor offset of the ladder here: >0 down, <0 up, 0 none. */
  ladder: number;
  /** Floor this chute drops to, 0 when there is no chute. */
  chute: number;
  /** Trap door destination floor, -1 when none. */
  trapdoor: number;
  /** Moraff's Revenge only: whether a chute drops you here and the fall can go on. */
  falseFloor?: boolean;
  town?: number;
  surface?: number;
}

/** One of the buildings floor 0 can hold, in the order the generator numbers them from 1. */
export interface Building {
  label: string;
  /** Fill colour of a square holding it. */
  colour: string;
  /** What the building does and what it charges, for the panel to print under its name. */
  note?: string;
}

/** What "Path to nearest ..." walks to, and the word the panel calls it by. */
export interface RouteTarget {
  noun: string;
  matches(square: MapSquare): boolean;
}

/** What the map needs to know about one type of monster it has put on a floor. */
export interface StockedKind {
  name: string;
  boss: boolean;
  /** Everything the drawing depends on besides the monster itself, so the map can keep the
   *  pictures it has already drawn rather than draw them again. */
  pictureKey(dungeon: number, floor: number): string;
  /** The monster as the game draws it on this floor, or null when the game has no picture. */
  picture(dungeon: number, floor: number): RenderedImage | null;
}

/**
 * How a game fills a floor with monsters, and what the map says about the ones it put there.
 * The two games roll from different tables by different rules, so each brings its own.
 */
export interface MapStocking {
  /** Whether the game itself could stock this floor. The floor override reaches ones it could
   *  not, and those are left alone. */
  stocks(dungeon: number, floor: number): boolean;
  /** A fresh roll of the floor's monsters. */
  stock(rows: MapSquare[][], dungeon: number, floor: number): StockedMonster[];
  kind(monsterId: string): StockedKind;
  /** The floor's monsters as the list beside the map groups them. */
  groups(monsters: StockedMonster[]): MonsterCountGroup[];
  /** The one line the tooltip and the selection panel print for one monster. */
  describe(monster: StockedMonster): string;
  /** What to say about the monsters standing outside the area the game shows. */
  beyondMap(count: number): string;
  /** What the panel says under the button about how the game itself rolls a floor, or null
   *  when there is nothing to add. */
  note: string | null;
}

/** Which of the things the map can draw a game's floors ever hold, which is what its legend
 *  lists: an entry a game never has is left out rather than shown as a count of nothing. */
export interface MapFeatures {
  secretDoors: boolean;
  trapdoors: boolean;
  falseFloors: boolean;
}

/** Where a floor is: which numbered dungeon it belongs to and how deep it is. */
export interface MapGame {
  id: GameId;
  /** How much of a floor the game itself draws and lets you walk on. */
  area: MapArea;
  /** What the game calls the number that picks a set of floors. */
  dungeonNoun: string;
  /** How that number reads in a heading: "Module I", "Dungeon 0". */
  dungeonName(dungeon: number): string;
  /** The numbers that name a dungeon of this game, inclusive. */
  dungeons: { lowest: number; highest: number };
  /** The number the map starts at with nothing remembered. */
  defaultDungeon: number;
  /** Where the number last looked at is kept between visits, or null for a game whose number
   *  is chosen from a list rather than typed. */
  dungeonStorageKey: string | null;
  /** The deepest floor one dungeon has. */
  bottomFloor(dungeon: number): number;
  /**
   * A whole floor.
   *
   * `bottom` is how deep the ways down off it may lead, and `reach` how far its trap doors lead,
   * for a game played past the deepest floor the dungeon itself has; without them both stop where
   * the game stops them. Only Dungeons of the Unforgiven can be asked for a floor below its own
   * bottom, so the other two ignore them.
   */
  floor(level: number, dungeon: number, bottom?: number, reach?: TrapdoorReach): MapSquare[][];
  /** One square of any floor, without generating the rest of it. */
  squareOn(x: number, y: number, level: number, dungeon: number): MapSquare;
  /** The square every trap door leading to a floor lands on, or null for a game with none. */
  trapdoorLanding: ((level: number, dungeon: number) => [number, number]) | null;
  /** Which of the things the legend can list this game's floors ever hold. */
  features: MapFeatures;
  buildings: Building[];
  /** The building on a square, 0 when it has none. */
  buildingOn(square: MapSquare): number;
  routeTo: RouteTarget;
  /** How this game fills a floor with monsters, or null for a game whose monsters are not
   *  worked out. */
  stocking: MapStocking | null;
  /** The explored maps this game saves beside a character, which the map can shade a floor
   *  with, or null for a game that saves none. */
  exploredMaps: ExploredMapFiles | null;
  /** What an exported PNG of a floor is called. */
  pngName(dungeon: number, floor: number): string;
  /**
   * Whether the floors are the five modules of Dungeons of the Unforgiven's dungeon, which is
   * what its monster stocking, twin floors, module teleporters and section bosses all belong to.
   * Moraff's World numbers its dungeons instead and has none of those.
   */
  modules: boolean;
}

/** Whether a number names a dungeon the map can be pointed at. */
export function hasDungeon(game: MapGame, dungeon: number): boolean {
  return Number.isInteger(dungeon) && dungeon >= game.dungeons.lowest && dungeon <= game.dungeons.highest;
}

/** The floors of one dungeon, in the order the picker lists them. */
export function floorsOf(game: MapGame, dungeon: number): number[] {
  return Array.from({ length: game.bottomFloor(dungeon) + 1 }, (_, floor) => floor);
}

/** A floor number as a file name reads it, with negatives spelled out. */
function numberForFileName(value: number): string {
  return value < 0 ? `minus-${-value}` : String(value);
}

/**
 * Store, temple, bank and inn. drawsquare (exe 3000:87de) fills a building square with palette
 * entry `building + 2`, except the inn, which it moves from entry 6 to entry 8.
 */
const UNFORGIVEN_BUILDINGS: Building[] = [
  { label: 'Store', colour: '#51caff' },
  { label: 'Temple', colour: '#ffff51' },
  { label: 'Bank', colour: '#d75100' },
  { label: 'Inn', colour: '#00ff00' },
];

const UNFORGIVEN_DUN_FILES: ExploredMapFiles = {
  extension: '.DUN',
  namesDungeon: true,
  hint: "Dungeons of the Unforgiven saves the squares your character has seen beside the save, in files named <character><quarter><module>.DUN — E14.DUN is character 21's floors 32 to 63 of Module V.",
  read: readDotuDunFile,
  summarize: quarterSummary,
};

export const UNFORGIVEN_MAP: MapGame = {
  id: 'unforgiven',
  area: UNFORGIVEN_AREA,
  dungeonNoun: 'Module',
  dungeonName: (dungeon) => `Module ${MODULE_NUMERALS[dungeon]}`,
  dungeons: { lowest: 0, highest: BOTTOM_LEVEL.length - 1 },
  defaultDungeon: 0,
  dungeonStorageKey: null,
  bottomFloor: (dungeon) => BOTTOM_LEVEL[dungeon],
  floor: (level, dungeon, bottom, reach) => bundledDungeon.floor(level, dungeon, true, bottom, reach),
  squareOn(x, y, level, dungeon) {
    const square: MapSquare = {
      ...bundledDungeon.sides(x, y, level, dungeon),
      solid: bundledDungeon.solid(x, y, level, dungeon),
      ladder: 0,
      chute: 0,
      trapdoor: -1,
      town: 0,
    };
    if (square.solid) return square;
    square.ladder = bundledDungeon.ladder(x, y, level, dungeon);
    if (square.ladder !== 0) return square;
    if (level === 0) {
      square.town = bundledDungeon.townFeature(x, y, dungeon);
    } else {
      square.trapdoor = bundledDungeon.trapdoor(x, y, level, dungeon);
      const chute = bundledDungeon.chute(x, y, level, dungeon);
      square.chute = chute !== level ? chute : 0;
    }
    return square;
  },
  trapdoorLanding: (level, dungeon) => bundledDungeon.trapdoorDest(level, dungeon),
  features: { secretDoors: true, trapdoors: true, falseFloors: false },
  buildings: UNFORGIVEN_BUILDINGS,
  buildingOn: (square) => square.town ?? 0,
  routeTo: { noun: 'teleporter', matches: hasTeleporterSide },
  stocking: UNFORGIVEN_STOCKING,
  exploredMaps: UNFORGIVEN_DUN_FILES,
  pngName: (dungeon, floor) => `dotu-module-${dungeon + 1}-${floor === 0 ? 'town' : `floor-${numberForFileName(floor)}`}.png`,
  modules: true,
};

/**
 * Store, temple, bank, inn and the gate back out to the world map. draw_map_square
 * (exe 3000:a97d) fills a building square with palette entry `building + 2`.
 */
const MORAFFS_WORLD_BUILDINGS: Building[] = [
  { label: 'Store', colour: '#51caff' },
  { label: 'Temple', colour: '#ffff51' },
  { label: 'Bank', colour: '#d75100' },
  { label: 'Inn', colour: '#ff0028' },
  { label: 'World map gate', colour: '#ffb600' },
];

/**
 * Ladders never reach past floor 202: ladder_delta (exe 3000:a449) will not offer a way down
 * to one, and nothing else in the game goes deeper.
 */
const MORAFFS_WORLD_BOTTOM_FLOOR = 202;

/**
 * The dungeon number is a signed 16-bit word in the character record, so the map takes any value
 * one can hold. Only about -3,204 to 3,528 are reachable by walking off the world map, but the
 * generator answers for every one of them.
 */
const DUNGEON_MIN = -32768;
const DUNGEON_MAX = 32767;

/** Which Moraff's World dungeon the map was last pointed at. */
const MORAFFS_WORLD_DUNGEON_KEY = 'moraff-tools.mw-dungeon';

const MORAFFS_WORLD_DUN_FILES: ExploredMapFiles = {
  extension: '.DUN',
  // The dungeon is not in the name, which is why the game deletes every one of a slot's files
  // when the character walks into another dungeon.
  namesDungeon: false,
  hint: "Moraff's World saves the squares your character has seen beside the save, in files named <slot><block>.DUN — 30.DUN is slot 3, floors 0 to 31.",
  read: readDunFile,
  summarize: loadedSummary,
};

/** Squares holding a ladder, which is all Moraff's World has worth walking to. */
function hasLadder(square: MapSquare): boolean {
  return square.ladder !== 0;
}

export const MORAFFS_WORLD_MAP: MapGame = {
  id: 'moraffsWorld',
  area: MORAFFS_WORLD_AREA,
  dungeonNoun: 'Dungeon',
  dungeonName: (dungeon) => `Dungeon ${dungeon}`,
  dungeons: { lowest: DUNGEON_MIN, highest: DUNGEON_MAX },
  defaultDungeon: 0,
  dungeonStorageKey: MORAFFS_WORLD_DUNGEON_KEY,
  bottomFloor: () => MORAFFS_WORLD_BOTTOM_FLOOR,
  floor: (level, dungeon) => bundledMwDungeon.floor(level, dungeon),
  squareOn(x, y, level, dungeon) {
    const square: MapSquare = {
      ...bundledMwDungeon.sides(x, y, level, dungeon),
      solid: bundledMwDungeon.solid(x, y, level, dungeon),
      ladder: 0,
      chute: 0,
      trapdoor: -1,
      surface: 0,
    };
    if (square.solid) return square;
    if (level === 0) square.surface = bundledMwDungeon.surface(x, y, level, dungeon);
    square.ladder = bundledMwDungeon.ladder(x, y, level, dungeon);
    if (square.ladder !== 0) return square;
    square.trapdoor = bundledMwDungeon.trapdoor(x, y, level, dungeon);
    if (square.trapdoor === -1 && level > 0) {
      const chute = bundledMwDungeon.chute(x, y, level, dungeon);
      square.chute = chute !== level ? chute : 0;
    }
    return square;
  },
  trapdoorLanding: (level, dungeon) => bundledMwDungeon.trapdoorDest(level, dungeon),
  features: { secretDoors: true, trapdoors: true, falseFloors: false },
  buildings: MORAFFS_WORLD_BUILDINGS,
  buildingOn: (square) => square.surface ?? 0,
  routeTo: { noun: 'ladder', matches: hasLadder },
  stocking: MORAFFS_WORLD_STOCKING,
  exploredMaps: MORAFFS_WORLD_DUN_FILES,
  pngName: (dungeon, floor) => `mw-dungeon-${numberForFileName(dungeon)}-floor-${numberForFileName(floor)}.png`,
  modules: false,
};

/** Which generation of Moraff's Revenge the map was last pointed at. */
const MORAFFS_REVENGE_GENERATION_KEY = 'moraff-tools.revenge-generation';

const MORAFFS_REVENGE_BIN_FILES: ExploredMapFiles = {
  extension: '.BIN',
  // One file holds every level of the one dungeon that character's generation gives it.
  namesDungeon: false,
  hint: "Moraff's Revenge saves the squares your character has walked on in a file of its own beside the character, named <n>.BIN — 5.BIN is character 5, and holds every level at once.",
  read: readBinFile,
  summarize: exploredFloorCount,
};

/**
 * The generation is the character's own number, value 26 of its record: 1 until it drinks from
 * the fountain of youth, and two more each time it does (1000:3ED0), which gives that character
 * a dungeon of its own. The game divides by it, and its arithmetic is exact for whole numbers
 * up to 2 ** 24, so that is as far as the map answers.
 */
const GENERATION_LOWEST = 1;
const GENERATION_HIGHEST = 0xffffff;

/**
 * The town's buildings, in the order 1000:10FD numbers them and 1000:132A's `ON building GOTO`
 * lists their routines. The names are the game's own, off the line each building opens with.
 *
 * Moraff's Revenge draws nothing on a town square -- its automap marks only the ladders -- so
 * unlike the other two games' buildings these colours are ours: the three the other games have
 * as well keep the colours the site already gives them, and the three inns are a scale of the
 * green Dungeons of the Unforgiven fills an inn with, cheapest first.
 *
 * Every charge below is the double the routine subtracts, not the one its menu prints: the two
 * agree everywhere. The three inns are at 1000:1E0A, 1F3D and 1FCD, the bank at 22F7, the
 * temple at 2522, the store at 281E and the guild at 2BB8.
 */
const MORAFFS_REVENGE_BUILDINGS: Building[] = [
  { label: 'Flea Bag Inn', colour: '#1e7a3c', note: 'A room costs 10 JP. You sleep, and wake with one health point more.' },
  { label: 'Yuppydom Inn', colour: '#00cc44', note: 'A suite costs 200 JP. You sleep, and wake with three health points more.' },
  { label: 'Kings Inn', colour: '#5cff8f', note: 'A grand suite costs 6,000 JP, and the hotel cleric heals every wound.' },
  { label: 'Bank', colour: '#d75100', note: 'Exchanges the treasure you are carrying for jewel pieces, and keeps them for you.' },
  {
    label: 'Temple',
    colour: '#ffff51',
    note: 'Cures wounds for 75 JP, every wound for 1,000, disease for 400 and poison for 20,000, and sells a level for 500,000.',
  },
  {
    label: 'Store',
    colour: '#51caff',
    note: 'Weapons and armour, from a 10 JP knife to field plate at 10,000. The town itself is on the list at 1,000,000, and is a joke.',
  },
  {
    label: "Wizard's Guild",
    colour: '#c060ff',
    note: 'Says what the spells and the magic items do: 800 JP for the items, and 220 JP times the spell level to the power 1.75 for one level of spells.',
  },
];

/**
 * Moraff's Revenge. Almost none of its dungeon is stored anywhere: every wall comes out of the
 * square's own coordinates, and so does every ladder and chute, but which squares carry one at
 * all is read from the game's own `7.NUM`. `src/lib/game/revmap.js` is both halves.
 *
 * The game numbers its columns from 1 and its rows from 1, and the map numbers both from 0, so
 * the map's (x, y) is the game's (x + 1, y + 1).
 */
export const MORAFFS_REVENGE_MAP: MapGame = {
  id: 'revenge',
  area: MORAFFS_REVENGE_AREA,
  dungeonNoun: 'Generation',
  dungeonName: (generation) => `Generation ${generation}`,
  dungeons: { lowest: GENERATION_LOWEST, highest: GENERATION_HIGHEST },
  defaultDungeon: GENERATION_LOWEST,
  dungeonStorageKey: MORAFFS_REVENGE_GENERATION_KEY,
  bottomFloor: () => REVENGE_LEVELS,
  floor: (level, generation) => revengeFloor(level, generation),
  squareOn: (x, y, level, generation) => revengeSquareOn(x + 1, y + 1, level, generation),
  trapdoorLanding: null,
  features: { secretDoors: false, trapdoors: false, falseFloors: true },
  buildings: MORAFFS_REVENGE_BUILDINGS,
  buildingOn: (square) => square.town ?? 0,
  routeTo: { noun: 'ladder', matches: hasLadder },
  stocking: MORAFFS_REVENGE_STOCKING,
  exploredMaps: MORAFFS_REVENGE_BIN_FILES,
  pngName: (generation, floor) => `revenge-generation-${generation}-${floor === 0 ? 'town' : `floor-${floor}`}.png`,
  modules: false,
};

export const MAP_GAMES: Record<GameId, MapGame> = {
  unforgiven: UNFORGIVEN_MAP,
  moraffsWorld: MORAFFS_WORLD_MAP,
  revenge: MORAFFS_REVENGE_MAP,
};
