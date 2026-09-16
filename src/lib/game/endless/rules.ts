import {
  FAITHFUL_RULES,
  keyIndex,
  type BossSquares,
  type GameRules,
  type SectionPlace,
  type TrapDoorKeys,
} from '../port/rules';
import type { PlayerCharacter } from '../port/state';
import { endlessMonsterKinds, endlessSection } from './monsters';
import { endlessStateOf } from './state';

/**
 * The rules an endless game of Dungeons of the Unforgiven is played by: the dungeon goes on below
 * the deepest floor the 1993 game has, in sections of its own numbered on past the twentieth.
 *
 * Nothing here is a departure from the port, because none of it is the port: every ported function
 * goes on doing exactly what it did, and this is another answer to the handful of questions the
 * engine asks its rules (`src/lib/game/port/rules.ts`). A faithful game never builds one of these.
 */

/**
 * The deepest floor an endless dungeon reaches.
 *
 * The record keeps the floor the character is standing on as a signed 16-bit word at 0x7b4, so
 * this is as deep as a character can be saved standing, and there is no point generating a floor
 * below it.
 */
export const ENDLESS_BOTTOM = 32767;

/** The last of the twenty sections the game itself has; the endless ones are numbered on from
 *  here. */
const LAST_OWN_SECTION = 20;

/** Module IV and Module V, as the port numbers modules. */
const MODULE_IV = 3;
const MODULE_V = 4;

/** How much deeper a module's floors count for a monster's level: the 15 per module
 *  `monsterLevelBase` adds. */
const LEVELS_PER_MODULE = 15;

/**
 * The monster level a kill's experience stops growing at, which is as far as the arithmetic
 * reaches rather than a rule anybody chose.
 *
 * `expValue` works out `expMult * (level + 1 + 5 * 1.23 ** level)`. The largest experience
 * multiplier any monster carries is 16, and 16 times 5 times 1.23 to the power 3408 is larger
 * than the largest number a double holds, so a kill deeper than this would be worth Infinity and
 * the character's experience would stop being a number at all. Everything up to here is a number,
 * though only levels up to about 170 are whole ones: past that the value is a very large double
 * with the low digits rounded off.
 */
const ENDLESS_EXPERIENCE_CAP = 3407;

/**
 * The floor an endless trap door's roll must name to be a door at all, which is Module V's own
 * number.
 *
 * The game keeps a door when the roll names a floor in the upper four fifths of the module, and
 * four fifths of a module 32767 floors deep is every floor the roll can name, so an endless floor
 * that asked the question the game's way would have a door on nearly every square. Module V asks
 * it of 105 floors and keeps sixteen of the 2400 rolls, which is a couple of dozen doors on a
 * floor, and the endless floors keep that test and move the floors it names instead.
 */
const ENDLESS_TRAP_DOOR_LIMIT = 84;

/** The deepest floor those sixteen rolls name. The offset slides it onto the last floor of the
 *  character's section, so the doors of a floor lead to the eighty floors ending there. */
const ENDLESS_TRAP_DOOR_DEEPEST = 80;

/**
 * The endless world every endless character is rolled into for now.
 *
 * A world is one number, and two characters rolled into the same one meet the same monsters on
 * the same floor. MORF-513 is where the run server hands the number out, so that everybody
 * playing at the same time is playing the same dungeon; until it lands there is this one world.
 */
export const ENDLESS_WORLD_SEED = 1;

/** One endless world. */
export interface EndlessWorld {
  /**
   * Whether the character was rolled under I Care How Awful, the hard difficulty.
   *
   * It decides which module the endless floors are in. `change_module` turns a character rolled
   * under the normal difficulty back at the door of Module V, so the deepest module such a
   * character can ever stand in is Module IV, whose bottom is floor 85; a character who can go
   * through that door bottoms out in Module V at floor 105.
   */
  hard: boolean;
  /** The number the world is built from. Two characters playing under the same seed meet the
   *  same monsters on the same floor. */
  seed: number;
}

/**
 * The rules of one endless world.
 *
 * Each new section has five monsters of its own, drawn from the hundred the game has
 * (`monsters.ts`), and is drawn and described as one of the game's own twenty, which
 * `sectionSource` names.
 *
 * The endless floors are the ones below the deepest module the character can reach, and the
 * sections that hold them are the game's own section numbering carried on past the twentieth:
 * `section_number3` counts a section every `5 * (module + 1)` floors and stops counting at the
 * module's fourth, so carrying on gives sections of 20 floors from floor 81 in Module IV and of
 * 25 floors from floor 101 in Module V. Each of them has a Shadow boss on its last floor, the way
 * the game's own sections do.
 *
 * Every module but that one, and every floor above where its own fourth section stops, answers
 * exactly what the faithful rules answer.
 */
export function endlessRules({ hard, seed }: EndlessWorld): GameRules {
  const endlessModule = hard ? MODULE_V : MODULE_IV;
  const sectionFloors = 5 * (endlessModule + 1);
  /** The first floor of the twenty-first section, which is where the game stopped counting. */
  const firstEndlessFloor = sectionFloors * 4 + 1;

  const sectionOf = (module: number, floor: number): number => {
    if (module !== endlessModule || floor < firstEndlessFloor) return FAITHFUL_RULES.sectionOf(module, floor);
    return LAST_OWN_SECTION + 1 + Math.trunc((floor - firstEndlessFloor) / sectionFloors);
  };

  const sectionPlace = (section: number): SectionPlace | null => {
    if (section <= LAST_OWN_SECTION) return FAITHFUL_RULES.sectionPlace(section);
    const beyond = section - LAST_OWN_SECTION;
    return {
      module: endlessModule,
      // The module's own four are parts 1 to 4, so an endless section carries on counting.
      part: 4 + beyond,
      bossFloor: firstEndlessFloor - 1 + beyond * sectionFloors,
    };
  };

  const sectionSource = (section: number): number =>
    section <= LAST_OWN_SECTION ? section : endlessSection(seed, section).source;

  return {
    // How far down a ladder or a chute off a floor may lead. The map generator works a trap
    // door's destination out from the bottom as well, which a bottom this deep makes nonsense of,
    // so `trapdoorReach` answers that on its own.
    bottomLevel: (module) => (module === endlessModule ? ENDLESS_BOTTOM : FAITHFUL_RULES.bottomLevel(module)),
    sectionOf,
    trapdoorReach: (module, floor) => {
      if (module !== endlessModule) return FAITHFUL_RULES.trapdoorReach(module, floor);
      const lastFloor = sectionPlace(sectionOf(module, floor))?.bossFloor ?? 0;
      return { limit: ENDLESS_TRAP_DOOR_LIMIT, offset: Math.max(0, lastFloor - ENDLESS_TRAP_DOOR_DEEPEST) };
    },
    sectionPlace,
    sectionSource,
    monsterKinds: (section) =>
      section <= LAST_OWN_SECTION ? FAITHFUL_RULES.monsterKinds(section) : endlessMonsterKinds(seed, section),
    experienceCap: ENDLESS_EXPERIENCE_CAP,
    keys: endlessKeys(FAITHFUL_RULES.bottomLevel(endlessModule)),
    bossSquares: ENDLESS_BOSS_SQUARES,
    // stock_level's own base level rolls back round to 1 at 221, which no floor of the game is
    // deep enough to reach; an endless floor is, and a dungeon that got easier the deeper it went
    // would be no dungeon at all.
    monsterLevel: (module, floor) =>
      module === endlessModule ? floor + LEVELS_PER_MODULE * module : FAITHFUL_RULES.monsterLevel(module, floor),
    // The deepest base level the endless dungeon rolls monsters around, so that no monster is ever
    // put back to level 1 for standing deeper than the rules allow.
    monsterLevelMax: ENDLESS_BOTTOM + LEVELS_PER_MODULE * endlessModule,
    pictureFiles: (section) => FAITHFUL_RULES.pictureFiles(sectionSource(section)),
  };
}

/**
 * The trap door keys of an endless game: the record's own flags as far as they go, and the state
 * beside the record for the floors below that.
 *
 * A drainer carries a key on every floor from the fourth down. The shallowest floors are left out
 * for the same reason the game leaves them out — the key would be labelled 0 — and there is no
 * deep end, because a trap door on any floor is worth a key.
 *
 * `deepestOwnFloor` is the deepest floor the endless module has as the game ships it, which is
 * where the floor the odds are worked out from stops growing. The game makes a key rarer the
 * deeper the floor and hands out none at all from floor 200 down, so every endless floor hands
 * one out on the odds of the module's own last floor: a quarter of the drainers killed on it in
 * Module V, a little under a third in Module IV.
 */
function endlessKeys(deepestOwnFloor: number): TrapDoorKeys {
  return {
    foundOn: (floor) => floor > 3,
    oddsFloor: (floor) => Math.min(floor, deepestOwnFloor),
    flag: (pc, floor) => {
      if (recordKeepsKey(pc, floor)) return pc.keys[keyIndex(floor)];
      return endlessStateOf(pc).keys.has(keyIndex(floor)) ? 1 : 0;
    },
    take: (pc, floor) => {
      if (recordKeepsKey(pc, floor)) pc.keys[keyIndex(floor)] = 1;
      else endlessStateOf(pc).keys.add(keyIndex(floor));
    },
  };
}

/** Whether the record's own flags reach the key a trap door to this floor is opened with. */
function recordKeepsKey(pc: PlayerCharacter, floor: number): boolean {
  return keyIndex(floor) < pc.keys.length;
}

/**
 * Where an endless game remembers its Shadow bosses: the record's own table for the twenty
 * sections it was written for, and the state beside the record for the sections past them.
 */
const ENDLESS_BOSS_SQUARES: BossSquares = {
  of: (pc, section) => {
    if (section <= LAST_OWN_SECTION) return FAITHFUL_RULES.bossSquares.of(pc, section);
    const square = endlessStateOf(pc).bossSquares.get(section);
    return square ? { ...square } : { x: 0, y: 0 };
  },
  remember: (pc, section, square) => {
    if (section <= LAST_OWN_SECTION) FAITHFUL_RULES.bossSquares.remember(pc, section, square);
    else endlessStateOf(pc).bossSquares.set(section, { ...square });
  },
};
