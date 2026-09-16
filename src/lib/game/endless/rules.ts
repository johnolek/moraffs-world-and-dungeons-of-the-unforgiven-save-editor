import { SeededRng } from '../port/rng';
import {
  FAITHFUL_RULES,
  keyIndex,
  type BossSquares,
  type GameRules,
  type SectionPlace,
  type TrapDoorKeys,
} from '../port/rules';
import type { PlayerCharacter } from '../port/state';
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

/** The odd multiplier a 32-bit hash spreads its input with: two to the 32 over the golden
 *  ratio. */
const GOLDEN_RATIO = 0x9e3779b1;

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
  const faithful = FAITHFUL_RULES;
  const endlessModule = hard ? MODULE_V : MODULE_IV;
  const sectionFloors = 5 * (endlessModule + 1);
  /** The first floor of the twenty-first section, which is where the game stopped counting. */
  const firstEndlessFloor = sectionFloors * 4 + 1;

  const sectionOf = (module: number, floor: number): number => {
    if (module !== endlessModule || floor < firstEndlessFloor) return faithful.sectionOf(module, floor);
    return LAST_OWN_SECTION + 1 + Math.trunc((floor - firstEndlessFloor) / sectionFloors);
  };

  const sectionPlace = (section: number): SectionPlace | null => {
    if (section <= LAST_OWN_SECTION) return faithful.sectionPlace(section);
    const beyond = section - LAST_OWN_SECTION;
    return {
      module: endlessModule,
      // The module's own four are parts 1 to 4, so an endless section carries on counting.
      part: 4 + beyond,
      bossFloor: firstEndlessFloor - 1 + beyond * sectionFloors,
    };
  };

  const sectionSource = (section: number): number =>
    section <= LAST_OWN_SECTION ? section : borrowedSection(seed, section);

  return {
    // The map generator reads the bottom three ways, and one of them has a consequence worth
    // knowing about: `trapdoor` puts a door on a square whenever the floor it rolls lies in the
    // upper four fifths of the module, and the deepest floor it can ever roll is 11995. A module
    // 32767 floors deep therefore has a trap door on nearly every square that has no ladder,
    // where Module V as the game ships it has about twenty per floor.
    bottomLevel: (module) => (module === endlessModule ? ENDLESS_BOTTOM : faithful.bottomLevel(module)),
    sectionOf,
    sectionPlace,
    sectionSource,
    monsterKinds: (section) => faithful.monsterKinds(sectionSource(section)),
    experienceCap: ENDLESS_EXPERIENCE_CAP,
    keys: ENDLESS_KEYS,
    bossSquares: ENDLESS_BOSS_SQUARES,
    // stock_level's own base level rolls back round to 1 at 221, which no floor of the game is
    // deep enough to reach; an endless floor is, and a dungeon that got easier the deeper it went
    // would be no dungeon at all.
    monsterLevel: (module, floor) =>
      module === endlessModule ? floor + LEVELS_PER_MODULE * module : faithful.monsterLevel(module, floor),
    // The deepest base level the endless dungeon rolls monsters around, so that no monster is ever
    // put back to level 1 for standing deeper than the rules allow.
    monsterLevelMax: ENDLESS_BOTTOM + LEVELS_PER_MODULE * endlessModule,
    pictureFiles: (section) => faithful.pictureFiles(sectionSource(section)),
  };
}

/**
 * Which of the game's own twenty sections an endless section takes its monsters, its pictures and
 * its words from.
 *
 * This is a stand-in until each endless section is given a set of its own drawn from the whole
 * bestiary: the bestiary's catalogue has the five monsters of sections 1 to 20 and nothing else,
 * so a floor of section 21 has to be stocked from one of those twenty tables or from nothing at
 * all. Which one is drawn from the world's seed and the section number alone, and nothing of the
 * character reaches the roll, so the same section is the same section for everyone playing that
 * world.
 */
function borrowedSection(seed: number, section: number): number {
  return new SeededRng(Math.imul(section, GOLDEN_RATIO) ^ seed).random(LAST_OWN_SECTION) + 1;
}

/**
 * The trap door keys of an endless game: the record's own flags as far as they go, and the state
 * beside the record for the floors below that.
 *
 * A drainer carries a key on every floor from the fourth down. The shallowest floors are left out
 * for the same reason the game leaves them out — the key would be labelled 0 — and there is no
 * deep end, because a trap door on any floor is worth a key.
 */
const ENDLESS_KEYS: TrapDoorKeys = {
  foundOn: (floor) => floor > 3,
  flag: (pc, floor) => {
    if (recordKeepsKey(pc, floor)) return pc.keys[keyIndex(floor)];
    return endlessStateOf(pc).keys.has(keyIndex(floor)) ? 1 : 0;
  },
  take: (pc, floor) => {
    if (recordKeepsKey(pc, floor)) pc.keys[keyIndex(floor)] = 1;
    else endlessStateOf(pc).keys.add(keyIndex(floor));
  },
};

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
