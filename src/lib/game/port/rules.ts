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
  /** The 27 monster descriptions the game keeps loaded while the character is in a section. */
  monsterKinds(section: number): MonsterKind[];
  /** The highest monster level a kill is paid experience for. */
  readonly experienceCap: number;
  /** The level the monsters of a floor are rolled around. */
  monsterLevel(module: number, floor: number): number;
  /** The two picture files a section's corridors and monsters are drawn from. */
  pictureFiles(section: number): SectionPictures;
}

/** The shape of `dotu-data.json`, which is where the game's own tables were read out to. */
type GameData = typeof data;

/**
 * The tables of Dungeons of the Unforgiven itself, read out of `dotu-data.json`.
 *
 * `bottomLevel` is the table at exe DS:0493: 25, 45, 65, 85, 105. `sectionOf` is section_number3
 * (unf.c) and `monsterLevel` the base level stock_level (exe 2000:671e) rolls a floor's monsters
 * around, both of them in the reference bundle already. `experienceCap` is the level exp_value
 * (exe 3000:a0fa) stops counting at.
 */
export function faithfulRules(data: GameData): GameRules {
  return {
    bottomLevel: (module) => data.constants.bottomLevel[module],
    sectionOf: (module, floor) => sectionOf(module, floor),
    monsterKinds: (section) => sectionMonsterKinds(data, section),
    experienceCap: data.constants.expValueLevelCap,
    monsterLevel: (module, floor) => monsterLevelBase(floor, module),
    pictureFiles: (section) => sectionPictures(section),
  };
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
