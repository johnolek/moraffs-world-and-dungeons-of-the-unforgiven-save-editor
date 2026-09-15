import type { Leaderboard } from '../app-state.svelte';

/**
 * The two things a roll decides about a character and never decides again: the mode it is locked
 * to for life, and whether its runs go on that mode's leaderboard. These are the words the roller,
 * the roster and the Play tab use for them.
 *
 * The facts themselves are fields of the roster entry (`RosterEntry.lock` and
 * `RosterEntry.leaderboard`). This is what the pages say about them.
 */

/** The two boards, in the order they are offered. */
const LEADERBOARDS: Leaderboard[] = ['faithful', 'speedrun'];

export function isLeaderboard(value: unknown): value is Leaderboard {
  return LEADERBOARDS.includes(value as Leaderboard);
}

/** What a board is called where there is room for a word: the roster's column, the Play tab. */
export function leaderboardLabel(board: Leaderboard): string {
  return board === 'faithful' ? 'Faithful' : 'Speedrun';
}

/**
 * What the roller offers under its second question: a character that can be played any way, or one
 * locked to one of the two modes for good.
 *
 * The choice is made once, because that is the whole point of a lock: a board is a set of runs
 * played the same way, and a character that could change the way it plays is not on one. A locked
 * character need not be on a board — the leaderboard is the roller's other question — but a board
 * character is always locked.
 */
export const CHARACTER_TYPES: { id: Leaderboard | null; label: string; how: string }[] = [
  {
    id: null,
    label: 'Free play',
    how: 'Play the character however you like and change the mode whenever you want.',
  },
  {
    id: 'faithful',
    label: 'Faithful',
    how: 'Locked to faithful for good: only what the game shows.',
  },
  {
    id: 'speedrun',
    label: 'Speedrun',
    how: 'Locked to speedrun for good: the whole floor, so a route can be planned.',
  },
];

/** Why free play is not on offer while the leaderboard is on. */
export const FREE_PLAY_OFF_A_BOARD =
  'A leaderboard compares runs played the same way, so a leaderboard character is faithful or speedrun.';

/**
 * What the Play tab says where the mode radios would be for a character rolled for a board.
 *
 * There are no radios for such a character: the mode is the board's, and showing a control that
 * cannot be moved would be showing a choice that is not there.
 */
export function lockedPlayNote(board: Leaderboard): string {
  return `Locked: this character was rolled for the ${board} leaderboard, so every run of it is played this way.`;
}

/**
 * What the Save Editor asks before it writes into a character rolled for a board.
 *
 * The editor's records are not in the run log, so a replay has no way of putting the character
 * back into them: a board's runs stop being comparable the moment one of them is written from
 * outside the game. So the place is given up rather than the edit refused, and the player is told
 * which of the two they are choosing.
 */
export function leaderboardEditWarning(board: Leaderboard): string {
  return `This character was rolled for the ${board} board. Editing it here takes it off that board for good, and its runs will stop counting. Edit it anyway?`;
}
