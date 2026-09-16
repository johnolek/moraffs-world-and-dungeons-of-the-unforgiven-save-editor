import type { BossSquare } from '../port/rules';
import type { PlayerCharacter } from '../port/state';

/**
 * What an endless character carries that the 2695-byte record has no room for.
 *
 * The record holds one trap door key flag per five floors down to floor 179, and one square per
 * section for the Shadow bosses of the twenty sections the game has. An endless dungeon goes
 * deeper than 179 and has more sections than twenty, so the keys and the squares beyond what the
 * record reaches are kept here instead — beside the record, never in it, so that an endless
 * character's bytes are still a save Dungeons of the Unforgiven itself would read.
 *
 * It is held against the character rather than inside it the way `random_events_tick`'s step
 * count is (`src/lib/play/office.ts`): a character read from a record afresh starts with none,
 * which is the same thing that happens to the step count.
 */
export interface EndlessState {
  /** The floors a trap door key has been found for, past the ones the record's own flags reach.
   *  The floor is the one the door leads to, which is the number on its label. */
  keys: Set<number>;
  /** Where each section's Shadow boss was last put down, by section number, for the sections
   *  the record's own table has no place for. */
  bossSquares: Map<number, BossSquare>;
}

const states = new WeakMap<PlayerCharacter, EndlessState>();

/** The state kept beside this character, made the first time anything asks for it. */
export function endlessStateOf(pc: PlayerCharacter): EndlessState {
  const state = states.get(pc) ?? { keys: new Set<number>(), bossSquares: new Map<number, BossSquare>() };
  states.set(pc, state);
  return state;
}
