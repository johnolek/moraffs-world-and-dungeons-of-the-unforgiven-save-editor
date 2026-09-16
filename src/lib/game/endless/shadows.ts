import type { Game } from '../port/state';
import { endlessStateOf } from './state';

/**
 * The Shadows of the endless dungeon: the boss standing on the last floor of every section past
 * the twentieth, and what killing one of them is worth.
 *
 * kill_monster (exe 3000:b12d) has a reward written for each of the twenty sections the game has
 * and nothing at all for a twenty-first, so a Shadow this deep is handed over to here instead
 * (`GameRules.deepShadows`).
 */

/**
 * A Shadow below the bottom of the game has just been killed on the floor the character is
 * standing on.
 *
 * The kill goes beside the record, since the record's own byte has one bit per section of a
 * module and the game has four in each. It is what keeps the boss off his floor from now on: a
 * section whose Shadow is not written down anywhere stands him up again every time his floor is
 * rolled.
 */
export function shadowKilled(game: Game): void {
  const pc = game.pc;
  endlessStateOf(pc).bossesKilled.add(game.rules.sectionOf(pc.module, pc.level));
}
