import type { Leaderboard } from '../app-state.svelte';

/**
 * Whether a character's run journal is there to be read yet.
 *
 * A run on a board is somebody's competition, and John's rule is that what it came to is read
 * once the run is over: the character is dead, or it has beaten the game. Everything else is open
 * from the first key, because there is nothing to judge it against — a character rolled for no
 * board is played for its own sake, and debug is the mode with the game's hidden numbers on the
 * screen.
 *
 * Those are the same two things `forTheBoards` in `server/verifying.ts` asks before it replays a
 * run at all, so a run this holds back is exactly a run the server ranks.
 */

/** What a run has to say about itself for the rule below to be applied to it. */
export interface RunSoFar {
  /** The board the character's runs go on, and null for one whose runs go on no board. */
  leaderboard: Leaderboard | null;
  /** The mode the newest sitting of the run was played in, and null for a run with no sitting
   *  yet. */
  mode: string | null;
  dead: boolean;
  /** The run reached the end of the game, in this sitting or one before it. */
  won: boolean;
}

/** Whether the journal and the summary of this run may be shown. */
export function journalIsOpen(run: RunSoFar): boolean {
  if (run.leaderboard === null || run.mode === 'debug') return true;
  return run.dead || run.won;
}
