import type { PlayerCharacter } from '../game/port/state';
import type { FightMonster, FightSummary } from './fight-sim';
import type { JournalEntry } from './journal';

/**
 * The fights the Fight tab has finished, kept side by side so that one can be read against
 * another.
 *
 * They live for as long as the page does and no longer: nothing here is written to the roster,
 * to the browser's storage or to the run server. A fight is a thing a player tries, changes a
 * number and tries again, and the list is there to hold the tries next to each other while they
 * are doing it.
 */

/** One finished fight, as it was fought. */
export interface KeptFight {
  /** What tells one kept fight from another, so that a row can be deleted by name. */
  id: number;
  /** When it was fought, which is what the row is headed with. */
  at: Date;
  /** The character the form had typed when the fight was set up, which is what "Again" would
   *  fight it with. */
  character: PlayerCharacter;
  monster: FightMonster;
  /** The spells cast before the monster was sent in, by the name the game's menu prints. */
  prepared: string[];
  summary: FightSummary;
  /** Every line of the fight, in the words a run journal uses. */
  entries: JournalEntry[];
}

const kept: KeptFight[] = $state([]);

let lastId = 0;

/** The fights kept against one kind of monster, the most recent first. */
export function keptFights(monsterId: string): KeptFight[] {
  return kept.filter((fight) => fight.monster.monsterId === monsterId);
}

/** Keep a fight that has just finished. */
export function keepFight(fight: Omit<KeptFight, 'id'>): void {
  lastId += 1;
  kept.unshift({ ...fight, id: lastId });
}

/** Forget one kept fight. */
export function forgetFight(id: number): void {
  const at = kept.findIndex((fight) => fight.id === id);
  if (at !== -1) kept.splice(at, 1);
}

/** Forget every fight kept against one kind of monster. */
export function forgetFights(monsterId: string): void {
  for (let at = kept.length - 1; at >= 0; at -= 1) {
    if (kept[at].monster.monsterId === monsterId) kept.splice(at, 1);
  }
}
