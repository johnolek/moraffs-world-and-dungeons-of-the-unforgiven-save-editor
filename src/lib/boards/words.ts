import { GAME_CHOICES } from '../game-choice';
import { isRunGame, RUN_GAMES } from '../play/run';
import type { EveryoneStatus } from '../../../server/everyone';

/**
 * Every word the boards pages show, and the few turns of phrase they put a server's numbers
 * into.
 *
 * It is all here so that changing what a heading or an empty state says is one file. What the
 * boards themselves are called is the server's, in `BOARDS[].sorts`, since the server is where
 * the rules about them live; the words a run's own milestones read as are `milestoneWords` in
 * `src/lib/play/run.ts`, which the Play tab uses as well.
 */

/** The boards page: the toggle, the picker, the table and the announcements beside it. */
export const BOARDS_PAGE = {
  heading: 'Boards',
  leaderboard: 'Leaderboard:',
  bothLeaderboards: 'Both',
  board: 'Board:',
  rank: '#',
  player: 'Player',
  character: 'Character',
  reach: 'How far',
  level: 'Level',
  actions: 'Actions',
  playTime: 'Play time',
  finished: 'Finished',
  playingNow: 'Playing now',
  lastHeard: 'Last heard',
  beingPlayed: 'Playing',
  more: 'Show more',
  empty: 'Nobody has finished a run on this board yet.',
  noneAlive: 'Nobody is playing a character on this board right now.',
  unreachable: 'The boards are not answering.',
  announcements: 'Announcements',
  nothingAnnounced: 'Nothing has been announced yet.',
  announcementsUnreachable: 'The announcements are not answering.',
};

/**
 * The table of everyone: the checkboxes over it, the headings it does not share with the boards,
 * and what it says when there is nothing to show. The headings it does share — the player, the
 * character, the level, how far, the actions, the play time — are `BOARDS_PAGE` above.
 */
export const EVERYONE = {
  pick: 'Everyone',
  showing: 'Show:',
  ofClass: 'Class:',
  alive: 'Alive',
  dead: 'Dead',
  won: 'Won',
  playing: 'Playing now',
  board: 'Board',
  status: 'Status',
  cls: 'Class',
  hp: 'HP',
  when: 'When',
  empty: 'Nobody has a verified run in this game yet.',
  filteredOut: 'Nothing matches those filters.',
};

/** What has become of one character. A character a device is playing at this moment is said to be
 *  playing rather than alive, since that is the one row on the table still moving. */
export function statusWords(status: EveryoneStatus, playing: boolean): string {
  if (status === 'alive') return playing ? EVERYONE.playing : EVERYONE.alive;
  return status === 'won' ? EVERYONE.won : EVERYONE.dead;
}

/** A run's own page, which a row on a board opens. */
export const RUN_PAGE = {
  back: 'Back to the board',
  player: 'Player',
  character: 'Character',
  game: 'Game',
  board: 'Board',
  outcome: 'Outcome',
  actions: 'Actions',
  clock: 'Clock',
  playTime: 'Play time',
  engines: 'Engine',
  milestones: 'Milestones',
  verdict: 'Verdict',
  nothingReached: 'This run reached nothing worth naming.',
  unreachable: 'That run is not there to read.',
};

/** What a run came to, which is what a board's rows and a run's page say about it. */
export const OUTCOMES: Record<string, string> = {
  win: 'Won',
  death: 'Died',
};

/** How a run was judged, in the words the Play tab already uses for the same three answers. */
export const VERDICTS: Record<string, string> = {
  verified: 'Verified',
  failed: 'Not verified',
  unverifiable: 'Cannot be checked',
};

/** What a run that has not ended, or has not been judged, shows instead. */
export const STILL_GOING = 'Still going';

/** What a number that is not there to show reads as: a play time the server never saw, a board a
 *  character was never rolled for. */
export const NOTHING_TO_SHOW = '—';

/**
 * What the game's own clock counts in, which is the heading over that column.
 *
 * The number itself goes in the cells, since a column of "1234 seconds" says the same word over
 * and over. `RUN_GAMES[game].clockWords` is the whole phrase, and that is what a run's own page
 * uses, where the number is shown once.
 */
const CLOCK_HEADINGS: Record<string, string> = {
  unforgiven: 'Seconds',
  moraffsWorld: 'Moves',
  revenge: 'Ticks',
};

export function clockHeading(game: string): string {
  return CLOCK_HEADINGS[game] ?? 'Clock';
}

/** The game's own words for its clock, such as "12 seconds" or "12 moves". */
export function clockWords(game: string, time: number): string {
  return isRunGame(game) ? RUN_GAMES[game].clockWords(time) : String(time);
}

/** The game's own name for one of its modules or dungeons. A row naming a game this build has
 *  never heard of came from a newer server, and its number is all there is to say. */
export function dungeonName(game: string, dungeon: number): string {
  return isRunGame(game) ? RUN_GAMES[game].dungeonName(dungeon) : String(dungeon);
}

/** The game, as the switch in the header names it. */
export function gameName(game: string): string {
  return GAME_CHOICES.find((choice) => choice.id === game)?.label ?? game;
}

/**
 * How far a run got, which is not the same number in all three games: Moraff's Revenge has one
 * dungeon and seventy floors of it, so a run of it is measured by how deep it got, and the other
 * two by the module or the dungeon reached.
 */
export function reachWords(game: string, deepest: number): string {
  return game === 'revenge' ? `Floor ${deepest}` : dungeonName(game, deepest);
}

/**
 * How long a run was played, by the server's clock.
 *
 * A run the server watched none of — one played with it unreachable and sent afterwards — has no
 * play time, and neither has one carrying more keys than a person could press, so both show
 * nothing rather than a number nobody should read.
 */
export function playTimeWords(playMs: number, timed: boolean): string {
  if (!timed || playMs <= 0) return NOTHING_TO_SHOW;
  const seconds = Math.round(playMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/** When something happened, in the reader's own time. The server sends a moment as an ISO 8601
 *  string in UTC, which a browser reads as the moment it is and shows where the reader is. */
export function whenWords(at: string | null): string {
  if (at === null) return NOTHING_TO_SHOW;
  const when = new Date(at);
  return Number.isNaN(when.getTime()) ? at : when.toLocaleString();
}
