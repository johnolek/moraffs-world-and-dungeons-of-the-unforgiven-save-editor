import type { GameId, Leaderboard } from '../app-state.svelte';

/**
 * The two things a roll decides about a character and never decides again: the mode it is locked
 * to for life, and whether its runs go on that mode's leaderboard. These are the words the roller,
 * the roster and the Play tab use for them.
 *
 * The facts themselves are fields of the roster entry (`RosterEntry.lock` and
 * `RosterEntry.leaderboard`). This is what the pages say about them.
 */

/** Every mode a character can be locked to, in the order they are offered. */
const LEADERBOARDS: Leaderboard[] = ['faithful', 'speedrun', 'endless'];

export function isLeaderboard(value: unknown): value is Leaderboard {
  return LEADERBOARDS.includes(value as Leaderboard);
}

/** What a board is called where there is room for a word: the roster's column, the Play tab. */
export function leaderboardLabel(board: Leaderboard): string {
  if (board === 'faithful') return 'Faithful';
  if (board === 'speedrun') return 'Speedrun';
  return 'Endless';
}

/** One of the types the roller offers. */
export interface CharacterType {
  /** The mode a character of this type is locked to, or null for one that can be played any
   *  way. */
  id: Leaderboard | null;
  label: string;
  /** The line under the label, which says what the choice costs and what it gives. */
  how: string;
  /** The one game that offers this type, for a type not every game has. */
  game?: GameId;
}

/**
 * What the roller offers under its second question: a character that can be played any way, or one
 * locked to a mode for good.
 *
 * The choice is made once, because that is the whole point of a lock: a board is a set of runs
 * played the same way, and a character that could change the way it plays is not on one. A locked
 * character need not be on a board — the leaderboard is the roller's other question — but a board
 * character is always locked.
 */
export const CHARACTER_TYPES: CharacterType[] = [
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
  {
    id: 'endless',
    label: 'Endless',
    how: 'Locked to endless for good: the dungeon goes on past the bottom of the last module.',
    game: 'unforgiven',
  },
];

/**
 * The types on offer for a game.
 *
 * The endless dungeon is Dungeons of the Unforgiven's own rules carried on below the floor its
 * last module ends at (`src/lib/game/endless/rules.ts`), and the other two games have nothing of
 * the sort, so they are not offered it.
 */
export function characterTypes(game: GameId): CharacterType[] {
  return CHARACTER_TYPES.filter((type) => type.game === undefined || type.game === game);
}

/** Why free play is not on offer while the leaderboard is on. */
export const FREE_PLAY_OFF_A_BOARD =
  'A leaderboard compares runs played the same way, so a leaderboard character is locked to the mode it was rolled in.';

/**
 * What the Play tab says where the mode radios would be for a character locked to a mode.
 *
 * There are no radios for such a character: the mode is the one it was rolled as, and showing a
 * control that cannot be moved would be showing a choice that is not there. A character on a board
 * is told that its board is why, since that is the thing it can lose.
 */
export function lockedPlayNote(lock: Leaderboard, onBoard: boolean): string {
  return onBoard
    ? `Locked: this character was rolled for the ${lock} leaderboard, so every run of it is played this way.`
    : `Locked: this character was rolled as ${aCharacterOf(lock)}, so every run of it is played this way. Its runs go on no leaderboard.`;
}

/**
 * What the Play tab says over the mode radios of an endless character that is on no board.
 *
 * Such a character keeps its radios, because its lock names the dungeon it plays in rather than
 * how much of that dungeon is shown, and this is what says so: whichever radio is picked, the
 * floors below the bottom of the game are still there.
 */
export const ENDLESS_PLAY_NOTE =
  'This character plays the endless dungeon whichever mode you pick. Its runs go on no leaderboard.';

/** "a faithful character", "an endless character": the mode's own name with the article it
 *  wants. */
function aCharacterOf(lock: Leaderboard): string {
  return `${lock === 'endless' ? 'an' : 'a'} ${lock} character`;
}

/**
 * What the roster's column says a character is: the board its runs go on, the mode it is locked
 * to, or neither.
 */
export function characterTypeWords(leaderboard: Leaderboard | null, lock: Leaderboard | null): string {
  if (leaderboard !== null) return `${leaderboardLabel(leaderboard)} board`;
  return lock === null ? 'Free play' : leaderboardLabel(lock);
}

/**
 * What the Save Editor asks before it writes into a character whose runs are on a board.
 *
 * The editor's records are not in the run log, so a replay has no way of putting the character
 * back into them: a board's runs stop being comparable the moment one of them is written from
 * outside the game. So the place is given up rather than the edit refused, and the player is told
 * which of the two they are choosing. The mode the character is locked to is not one of them —
 * that is what it was rolled as and an edit does not change it — which the warning says so that
 * nobody expects an edit to set the character free.
 */
export function leaderboardEditWarning(board: Leaderboard): string {
  return `This character was rolled for the ${board} board. Editing it here takes it off that board for good, and its runs will stop counting. It stays ${aCharacterOf(board)} and is still played that way. Edit it anyway?`;
}
