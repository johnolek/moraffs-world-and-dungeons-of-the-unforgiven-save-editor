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

/**
 * The same state as plain arrays, which is how it is kept beside the character between sittings.
 *
 * A character is played, put down and played again, and the second sitting has to start with the
 * keys and the bosses the first one left behind. The record cannot carry them, so the roster
 * entry does (`RosterEntry.endless`), and the browser's database writes down plain data rather
 * than a Set and a Map.
 */
export interface KeptEndlessState {
  /** {@link EndlessState.keys}. */
  keys: number[];
  /** {@link EndlessState.bossSquares}, each square with the section it belongs to. */
  bossSquares: { section: number; x: number; y: number }[];
}

const states = new WeakMap<PlayerCharacter, EndlessState>();

/** The state kept beside this character, made the first time anything asks for it. */
export function endlessStateOf(pc: PlayerCharacter): EndlessState {
  const state = states.get(pc) ?? { keys: new Set<number>(), bossSquares: new Map<number, BossSquare>() };
  states.set(pc, state);
  return state;
}

/** What this character is carrying now, ready to be written down. */
export function keptEndlessState(pc: PlayerCharacter): KeptEndlessState {
  const state = endlessStateOf(pc);
  return {
    keys: [...state.keys],
    bossSquares: [...state.bossSquares].map(([section, square]) => ({ section, x: square.x, y: square.y })),
  };
}

/** Put back what this character was carrying when it was last written down. */
export function restoreEndlessState(pc: PlayerCharacter, kept: KeptEndlessState): void {
  const state = endlessStateOf(pc);
  state.keys = new Set(kept.keys);
  state.bossSquares = new Map(kept.bossSquares.map((boss) => [boss.section, { x: boss.x, y: boss.y }]));
}
