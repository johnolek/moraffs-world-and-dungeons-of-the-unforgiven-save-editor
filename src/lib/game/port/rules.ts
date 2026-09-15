import data from '../dotu-data.json';
import { sectionOf } from '../dotu-files.js';
import { monsterLevelBase } from '../dotu-mech.js';
import { sectionPictures, type SectionPictures } from './pictures';
import type { MonsterKind } from './state';

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
  /** Where a section sits, or null when there is no section of that number. */
  sectionPlace(section: number): SectionPlace | null;
  /** The 27 monster descriptions the game keeps loaded while the character is in a section. */
  monsterKinds(section: number): MonsterKind[];
  /** The highest monster level a kill is paid experience for. */
  readonly experienceCap: number;
  /** The level the monsters of a floor are rolled around. */
  monsterLevel(module: number, floor: number): number;
  /** The highest level a stocked monster may be nudged to; one nudged past it is put back to 1. */
  readonly monsterLevelMax: number;
  /** The two picture files a section's corridors and monsters are drawn from. */
  pictureFiles(section: number): SectionPictures;
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
 * `bottomLevel` is the table at exe DS:0493: 25, 45, 65, 85, 105. `sectionOf` is section_number3
 * (unf.c) and `monsterLevel` the base level stock_level (exe 2000:671e) rolls a floor's monsters
 * around, both of them in the reference bundle already. `experienceCap` is the level exp_value
 * (exe 3000:a0fa) stops counting at, `monsterKinds` what load_md_bin (exe 2000:5fec) reads for a
 * section, and `pictureFiles` the two files load_section_pictures (exe 2000:372c) reads for one.
 * `sectionPlace` is the twenty-row section table of `dotu-data.json`, which counts four sections
 * to a module and puts each section's Shadow boss on the last of its floors, and
 * `monsterLevelMax` the 210 stock_level reads a nudged level against (exe 2000:7005).
 */
export function faithfulRules(data: GameData): GameRules {
  return {
    bottomLevel: (module) => data.constants.bottomLevel[module],
    sectionOf,
    sectionPlace: (section) => sectionPlace(data, section),
    monsterKinds: (section) => sectionMonsterKinds(data, section),
    experienceCap: data.constants.expValueLevelCap,
    monsterLevel: (module, floor) => monsterLevelBase(floor, module),
    monsterLevelMax: data.constants.monsterLevelMax,
    pictureFiles: sectionPictures,
  };
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
  return [...data.builtinMonsters, ...data.sections[section - 1].monsters].map((kind) => ({
    name: kind.name.toUpperCase(),
    levelDrain: kind.levelDrain,
    statDrain: kind.statDrain,
    breath: kind.breath,
    special: kind.special,
    type: kind.type,
    expMult: kind.expMult,
  }));
}

/** The rules a faithful game is played by. */
export const FAITHFUL_RULES = faithfulRules(data);
