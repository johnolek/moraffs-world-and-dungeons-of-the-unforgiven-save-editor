import data from '../dotu-data.json';
import { bossIndex, sectionOf } from '../dotu-files.js';
import { monsterLevelBase } from '../dotu-mech.js';
import { trapdoorReach, type TrapdoorReach } from '../unfmap.js';
import { sectionPictures, type SectionPictures } from './pictures';
import type { MonsterKind, PlayerCharacter } from './state';

/**
 * The tables the engine looks a floor up in, gathered behind one object so that a game can be
 * played by rules other than the ones the 1993 executable shipped with.
 *
 * This is not a departure from the port. {@link faithfulRules} answers exactly what the game's
 * own tables answer, and every ported function goes on doing what it did; the seam only moves
 * the lookup out of the function that needed the answer. A mode that wants floors below the
 * bottom of Module V, or sections past the twentieth, hands the engine a different object and
 * changes nothing else.
 */
export interface GameRules {
  /** The deepest floor a module has. */
  bottomLevel(module: number): number;
  /** Which section a floor belongs to, counted 1 to 20 across all five modules. */
  sectionOf(module: number, floor: number): number;
  /**
   * How far the trap doors of a floor lead.
   *
   * The roll behind a door names a floor between 5 and 11995 and the game keeps the door when
   * that floor is in the upper four fifths of the module, so a module deeper than 14994 floors
   * keeps every roll and has a door on nearly every square. Rules that go that deep answer with
   * a reach of their own instead.
   */
  trapdoorReach(module: number, floor: number): TrapdoorReach;
  /** Where a section sits, or null when there is no section of that number. */
  sectionPlace(section: number): SectionPlace | null;
  /**
   * Which of the game's own twenty sections a section's pictures and words are taken from. A
   * section the game itself has is its own source; a section beyond them borrows one.
   */
  sectionSource(section: number): number;
  /** The 27 monster descriptions the game keeps loaded while the character is in a section. */
  monsterKinds(section: number): MonsterKind[];
  /** The highest monster level a kill is paid experience for. */
  readonly experienceCap: number;
  /** The trap door keys the character carries. */
  readonly keys: TrapDoorKeys;
  /** Where each section's Shadow boss was last put down. */
  readonly bossSquares: BossSquares;
  /**
   * Whether this section's Shadow boss has already been killed, which keeps him off his floor
   * for good. `section` is 1 to 20, and past 20 for a section of a dungeon deeper than the
   * game's own.
   */
  bossBeaten(pc: PlayerCharacter, section: number): boolean;
  /** The level the monsters of a floor are rolled around. */
  monsterLevel(module: number, floor: number): number;
  /** The highest level a stocked monster may be nudged to; one nudged past it is put back to 1. */
  readonly monsterLevelMax: number;
  /**
   * The number the nudge on a stocked monster's level counts round, which for a game that keeps
   * the level in one byte is 256, and null for rules that keep it in a number of any width.
   */
  readonly monsterLevelWrap: number | null;
  /** The most hit points a stocked monster may be rolled with. */
  readonly monsterHpMax: number;
  /** The two picture files a section's corridors and monsters are drawn from. */
  pictureFiles(section: number): SectionPictures;
}

/**
 * Where the character's trap door keys are kept, and which floors have one at all.
 *
 * The record keeps one flag per five floors in 36 bytes at 0x822, which reaches floor 179 and no
 * deeper. Rules that take the dungeon past that have to put the keys of the deeper floors
 * somewhere else, so every read and every write of one goes through here.
 */
export interface TrapDoorKeys {
  /** Whether a level drainer killed on this floor can be carrying the key labelled for it. */
  foundOn(floor: number): boolean;
  /**
   * The floor the roll that decides between a potion and a key counts, which for the game itself
   * is the floor the character is standing on.
   *
   * kill_monster rolls against that floor plus 175 out of 375, so a key grows rarer the deeper
   * the floor and from floor 200 down a drainer always carries a potion. Rules whose dungeon goes
   * deeper than that stop the floor growing while a key is still worth finding.
   */
  oddsFloor(floor: number): number;
  /**
   * The flag kept for the key a trap door to this floor is opened with: 0 for a key the
   * character has not found, and 1 for one they have.
   *
   * The two places the game reads it do not read it the same way — kill_monster asks whether it
   * is exactly 1 and explain_trapdoor whether it is anything but 0 — so the flag comes back as
   * it stands and each of them makes its own test.
   */
  flag(pc: PlayerCharacter, floor: number): number;
  /** The character has just found the key labelled for this floor. */
  take(pc: PlayerCharacter, floor: number): void;
}

/** The square a Shadow boss stands on. Both zero is a boss who has never been put down, which is
 *  how stock_level tells a first placement from a later one. */
export interface BossSquare {
  x: number;
  y: number;
}

/**
 * Where the square each section's Shadow boss was last put down on is kept.
 *
 * The record keeps eight per module at 0x855 and 0x8a5, of which the game uses four, one per
 * section. Rules with more sections than the twenty have to put the rest somewhere else, so
 * stock_level goes through here for both the read and the write.
 */
export interface BossSquares {
  /** Where this section's Shadow boss was last put down. */
  of(pc: PlayerCharacter, section: number): BossSquare;
  /** He has just been put down again. */
  remember(pc: PlayerCharacter, section: number, square: BossSquare): void;
}

/** Where a section sits in the dungeon, which is what a floor is stocked from. */
export interface SectionPlace {
  /** The module the section belongs to, 0 to 4, the way the port counts modules. */
  module: number;
  /** Which of its module's sections this one is, 1 to 4. */
  part: number;
  /** The floor the section's Shadow boss stands on. */
  bossFloor: number;
}

/** The shape of `dotu-data.json`, which is where the game's own tables were read out to. */
type GameData = typeof data;

/**
 * The tables of Dungeons of the Unforgiven itself, read out of `dotu-data.json`.
 *
 * `bottomLevel` is the table at exe DS:0493: 25, 45, 65, 85, 105. `trapdoorReach` is the test
 * town_features (exe 2000:bd32), the routine that puts a trap door on a square, makes on the floor
 * it rolls: the module's bottom again, and no offset at all. `sectionOf` is section_number3
 * (unf.c) and `monsterLevel` the base level stock_level (exe 2000:671e) rolls a floor's monsters
 * around, both of them in the reference bundle already. `experienceCap` is the level exp_value
 * (exe 3000:a0fa) stops counting at, `monsterKinds` what load_md_bin (exe 2000:5fec) reads for a
 * section, and `pictureFiles` the two files load_section_pictures (exe 2000:372c) reads for one.
 * `sectionPlace` is the twenty-row section table of `dotu-data.json`, which counts four sections
 * to a module and puts each section's Shadow boss on the last of its floors, and
 * `monsterLevelMax` the 210 stock_level reads a nudged level against (exe 2000:7005),
 * `monsterHpMax` the 32,000 the same routine tops a hit point roll off at, which keeps the roll
 * inside the two bytes the monster's record holds it in, and `monsterLevelWrap` the 256 its nudge
 * counts round, the level being one byte of that record.
 * `sectionSource` is every section's own number: the game has a wall file, a palette and a row
 * of MD.BIN for each of the twenty, so none of them borrows another's. `keys` and `bossSquares` are the two tables of the
 * character record that a dungeon deeper than the game's own would run off the end of.
 */
export function faithfulRules(data: GameData): GameRules {
  return {
    bottomLevel: (module) => data.constants.bottomLevel[module],
    sectionOf,
    trapdoorReach: (module) => trapdoorReach(data.constants.bottomLevel[module]),
    sectionPlace: (section) => sectionPlace(data, section),
    sectionSource: (section) => section,
    monsterKinds: (section) => sectionMonsterKinds(data, section),
    experienceCap: data.constants.expValueLevelCap,
    keys: RECORD_KEYS,
    bossSquares: RECORD_BOSS_SQUARES,
    bossBeaten: recordBossBeaten,
    monsterLevel: (module, floor) => monsterLevelBase(floor, module),
    monsterLevelMax: data.constants.monsterLevelMax,
    monsterHpMax: data.constants.monsterHpMax,
    monsterLevelWrap: MONSTER_LEVEL_BYTE,
    pictureFiles: sectionPictures,
  };
}

/** What a stocked monster's level counts round at in the game itself: it is one byte of the
 *  monster's six (exe 2000:671e, unf.c "stock_level"). */
const MONSTER_LEVEL_BYTE = 256;

/** How many floors apart the trap door keys are: one key per five floors, which is what both the
 *  door's label and the record's index are worked out from (explain_trapdoor, exe 2000:be3d). */
const KEY_STEP = 5;

/** Which of the record's 36 flags is the key a trap door to this floor is opened with. */
export function keyIndex(floor: number): number {
  return Math.trunc(floor / KEY_STEP);
}

/**
 * The keys as the game itself keeps them: the record's own 36 flags, and a drainer who carries
 * one only on floors 4 to 178.
 *
 * kill_monster (exe 3000:b12d) leaves the shallowest floors out because their key would be
 * labelled 0, and stops at 179 because that is where the record's flags run out. It counts the
 * floor the character is standing on for the odds, which is as deep as the game goes.
 */
const RECORD_KEYS: TrapDoorKeys = {
  foundOn: (floor) => floor > 3 && floor < 179,
  oddsFloor: (floor) => floor,
  flag: (pc, floor) => pc.keys[keyIndex(floor)],
  take: (pc, floor) => {
    pc.keys[keyIndex(floor)] = 1;
  },
};

/**
 * The boss squares as the game itself keeps them: the record's own table, indexed by the module
 * and the section's place among that module's four (`bossIndex`, exe: the module times eight
 * plus section_number2).
 */
const RECORD_BOSS_SQUARES: BossSquares = {
  of: (pc, section) => {
    const index = recordBossIndex(pc, section);
    return { x: pc.bossX[index], y: pc.bossY[index] };
  },
  remember: (pc, section, square) => {
    const index = recordBossIndex(pc, section);
    pc.bossX[index] = square.x;
    pc.bossY[index] = square.y;
  },
};

function recordBossIndex(pc: PlayerCharacter, section: number): number {
  return bossIndex(pc.module, (section - 1) % 4);
}

/**
 * Whether the record says this section's Shadow boss is dead: his section's bit of the module's
 * byte at 0x849, which the save calls `objective` and the game keeps at DS:c0c9.
 *
 * Bits 1, 2, 4 and 8 are the module's four sections, and kill_monster (exe 3000:b12d) sets one as
 * each boss dies.
 */
function recordBossBeaten(pc: PlayerCharacter, section: number): boolean {
  return (pc.objective[pc.module] & (1 << ((section - 1) % 4))) !== 0;
}

/** The section's row of `dotu-data.json`, which numbers modules from 1 where the port numbers
 *  them from 0. `section` is 1 to 20. */
function sectionPlace(data: GameData, section: number): SectionPlace | null {
  const entry = data.sections[section - 1];
  if (!entry) return null;
  return { module: entry.module - 1, part: entry.part, bossFloor: entry.bossFloor };
}

/**
 * The 27 monster descriptions the game has loaded while the character is in a section: the 22
 * built-in ones, then the five load_md_bin (exe 2000:5fec) reads out of `MD.BIN` for that
 * section, which fill slots 22 to 26. `section` is 1 to 20, the way section_number (exe
 * 2000:1d23) counts them.
 *
 * `dotu-data.json` title-cases the names for the bestiary; the game holds them upper case,
 * which is how a battle message prints them.
 */
function sectionMonsterKinds(data: GameData, section: number): MonsterKind[] {
  return [
    ...data.builtinMonsters.map((kind) => monsterKind(`builtin-${kind.id}`, kind)),
    ...data.sections[section - 1].monsters.map((kind) => monsterKind(`section-${section}-${kind.slot}`, kind)),
  ];
}

/** A row of `dotu-data.json`'s monster tables, which the two tables spell alike but for the
 *  number each of them is found by. */
type MonsterRow = GameData['builtinMonsters'][number] | GameData['sections'][number]['monsters'][number];

/** One loaded row, out of the row of `dotu-data.json` it was read from. The id is the one the
 *  catalogue of `src/lib/bestiary/monsters.ts` knows the same monster by. */
function monsterKind(id: string, kind: MonsterRow): MonsterKind {
  return {
    id,
    name: kind.name.toUpperCase(),
    levelDrain: kind.levelDrain,
    statDrain: kind.statDrain,
    breath: kind.breath,
    special: kind.special,
    type: kind.type,
    expMult: kind.expMult,
  };
}

/** The rules a faithful game is played by. */
export const FAITHFUL_RULES = faithfulRules(data);
