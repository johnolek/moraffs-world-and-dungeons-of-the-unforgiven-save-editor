import type { Leaderboard, PortedGameId } from '../src/lib/app-state.svelte';
import type { JournalEntry } from '../src/lib/play/journal';
import type { Milestone } from '../src/lib/play/run';
import type { Queries } from './sql';

/**
 * The boards: which runs go on one, and what order they stand in.
 *
 * Everything about ranking is here so that the server and the site say the same thing about a
 * board. The site's pages over these are MORF-146; nothing here draws anything.
 *
 * A board is one game and one of faithful and speedrun, never the two mixed: they are different
 * games to play, so runs of one tell you nothing about runs of the other. A run's board is the
 * `leaderboard` of the character it was played with — the board it was rolled for and locked to
 * for life — and a character rolled for no board is on none of them. Only a run that was verified
 * and had no record written into it from outside the game is on a board at all, which is what
 * `eligible` on the verdict already says.
 *
 * A character can also be rolled to play the endless dungeon. Its runs are taken, replayed and
 * given a verdict like any other, and they stand on none of the boards below: the endless dungeon
 * has no board of its own yet.
 */

/**
 * How far a run got, which is not the same number in all three games.
 *
 * Moraff's Revenge has one dungeon and seventy floors of it, so how deep the character got is
 * what a run of it is measured by; every milestone is stamped with the floor the character was
 * standing on, so the deepest of those is the answer. The other two are measured by the module or
 * the dungeon reached, which is a milestone of its own. A run that never left the place it
 * started in has no such milestone, and that place is index 0 in both: Module I in Dungeons of
 * the Unforgiven, and the town in Moraff's World.
 */
export function deepestReach(game: string, milestones: readonly Milestone[]): number {
  if (game === 'revenge') return highest(milestones.map((milestone) => milestone.floor));
  return highest(milestones.filter((milestone) => milestone.kind === 'dungeon').map((milestone) => milestone.which));
}

/**
 * The highest level a run reached.
 *
 * A level is a milestone, so this is the highest one of those. A character that never gained a
 * level has none, and stands at 0: what it was rolled at is not in the run.
 */
export function highestLevel(milestones: readonly Milestone[]): number {
  return highest(milestones.filter((milestone) => milestone.kind === 'level').map((milestone) => milestone.which));
}

/**
 * The row of a section's five monsters that its Shadow boss stands in.
 *
 * Every section of the game loads five rows — the Shadow first, three regulars, then a level
 * drainer (`load_md_bin`, exe 2000:5fec) — and the endless sections are stocked the same way
 * (`src/lib/game/endless/monsters.ts`). A kill in the journal names the row its monster was
 * standing in, so this is how a Shadow is told from anything else that died.
 */
const SHADOW_ROW = 22;

/**
 * The deepest floor a run killed a Shadow monster on.
 *
 * This is what the endless dungeon is ranked by rather than the deepest floor reached, because
 * reaching a floor down there costs nothing: a trap door drops a character hundreds of floors in
 * one step, and a board of the deepest floor stood on would be a lottery of trap doors won by
 * whoever fell furthest before dying. Killing the Shadow of the section is the hardest thing a
 * floor asks for, so a floor counts once its Shadow is dead.
 *
 * It is read off the journal the replay wrote, which is the one place a kill and the floor it
 * happened on stand together. A run that has killed no Shadow at all has no floor to show and
 * stands at 0.
 */
export function deepestShadowKilled(journal: readonly JournalEntry[]): number {
  const floors: number[] = [];
  for (const entry of journal) {
    if (entry.event?.kind === 'killed' && entry.event.monster.type === SHADOW_ROW) floors.push(entry.floor);
  }
  return highest(floors);
}

/** How many monsters a run killed, which is a kill of the journal the replay wrote. */
export function killsIn(journal: readonly JournalEntry[]): number {
  return journal.filter((entry) => entry.event?.kind === 'killed').length;
}

function highest(numbers: number[]): number {
  return numbers.reduce((most, number) => Math.max(most, number), 0);
}

/** The games a board can be asked for, which are the three the site plays. */
export const BOARD_GAMES = ['unforgiven', 'moraffsWorld', 'revenge'] as const satisfies readonly PortedGameId[];

/** The ways a character is rolled to be played that have a board, which never share one. */
export const BOARD_LEADERBOARDS = ['faithful', 'speedrun'] as const satisfies readonly Leaderboard[];

export type BoardName = 'actions' | 'clock' | 'wall' | 'deepest' | 'level' | 'deaths';

/** Which of a row's numbers a board puts the runs in order of. */
export type SortedOn = 'actions' | 'clock' | 'playMs' | 'deepest' | 'level' | 'at';

export interface Board {
  name: BoardName;
  sortedOn: SortedOn;
  /** What the board holds and how it is ordered, in a few words for the site to show. */
  sorts: string;
}

/**
 * Every board there is, in the order the site should offer them.
 *
 * The wins come first because they are what the games are played for, then the two boards every
 * run stands on, then the deaths.
 */
export const BOARDS: readonly Board[] = [
  { name: 'actions', sortedOn: 'actions', sorts: 'Wins, by fewest actions' },
  { name: 'clock', sortedOn: 'clock', sorts: "Wins, by the game's own clock" },
  { name: 'wall', sortedOn: 'playMs', sorts: 'Wins, by time played' },
  { name: 'deepest', sortedOn: 'deepest', sorts: 'Every run, by how far it got' },
  { name: 'level', sortedOn: 'level', sorts: 'Every run, by the highest level reached' },
  { name: 'deaths', sortedOn: 'at', sorts: 'Deaths, newest first' },
];

/**
 * The boards of the living: characters still being played, ranked by how high they have levelled
 * and by how far they have got.
 *
 * They are not among `BOARDS` above, because every row of one of those is about a run that has
 * ended -- how it came out, how long it took, when it finished -- and these are about a run that
 * has not. What they do share is the picker the site offers them all in, so they carry a name and
 * the words that name it the same way.
 */
export type LivingSort = 'level' | 'deepest';

export interface LivingBoard {
  name: `living-${LivingSort}`;
  sortedOn: LivingSort;
  /** What the board holds and how it is ordered, in a few words for the site to show. */
  sorts: string;
}

export const LIVING_BOARDS: readonly LivingBoard[] = [
  { name: 'living-level', sortedOn: 'level', sorts: 'Still alive, by level' },
  { name: 'living-deepest', sortedOn: 'deepest', sorts: 'Still alive, by depth' },
];

export function isLivingSort(sort: string): sort is LivingSort {
  return LIVING_BOARDS.some((board) => board.sortedOn === sort);
}

/** How many runs a page of a board holds. */
export const RUNS_PER_PAGE = 50;

/** One run as a board shows it. Every board's rows are this shape, and the board says which of
 *  the numbers it was put in order of. */
export interface BoardRow {
  characterId: string;
  /** The name the player claimed on this server, and the character's own. */
  player: string;
  name: string;
  actions: number;
  /** The game's own clock, which is seconds in Dungeons of the Unforgiven and moves in Moraff's
   *  World. */
  clock: number;
  /** How long the run was played, by the server's clock, and whether that may be believed. A run
   *  the server watched none of is `timed` with nothing to show for it, which is why the
   *  wall-clock board wants both. */
  playMs: number;
  timed: boolean;
  deepest: number;
  level: number;
  outcome: string | null;
  /** When the run ended. */
  at: string | null;
}

export interface BoardPage {
  game: string;
  leaderboard: string;
  board: BoardName;
  page: number;
  rows: BoardRow[];
  /** Whether there is a page after this one. */
  more: boolean;
}

export function isBoardGame(game: string): boolean {
  return (BOARD_GAMES as readonly string[]).includes(game);
}

export function isBoardLeaderboard(leaderboard: string): boolean {
  return (BOARD_LEADERBOARDS as readonly string[]).includes(leaderboard);
}

export function isBoardName(board: string): board is BoardName {
  return BOARDS.some((known) => known.name === board);
}

/**
 * What each board holds beyond an eligible run of the game and board asked for, and the order it
 * stands in.
 *
 * Every order ends in when the run finished, so that two runs with the same number stand in the
 * order they were played rather than in whatever order the rows happen to come back in.
 *
 * The wall-clock board wants a play time there is something to compare: a run the server watched
 * none of — played with the server unreachable and sent afterwards — comes to no play time at
 * all, and would otherwise top a board of the fastest wins with a run nobody timed.
 */
const ORDERS: Record<BoardName, { holds: string | null; order: string }> = {
  actions: { holds: "c.outcome = 'win'", order: 'v.actions ASC, c.finished_at ASC' },
  clock: { holds: "c.outcome = 'win'", order: 'v.time ASC, c.finished_at ASC' },
  wall: { holds: "c.outcome = 'win' AND v.timed AND v.play_ms > 0", order: 'v.play_ms ASC, c.finished_at ASC' },
  deepest: { holds: null, order: 'v.deepest DESC, v.actions ASC, c.finished_at ASC' },
  level: { holds: null, order: 'v.level DESC, v.actions ASC, c.finished_at ASC' },
  deaths: { holds: "c.outcome = 'death'", order: 'c.finished_at DESC' },
};

/** One page of a board. Pages count from one. */
export async function boardPage(
  sql: Queries,
  asked: { game: string; leaderboard: string; board: BoardName; page: number },
): Promise<BoardPage> {
  const board = ORDERS[asked.board];
  // One row more than a page is asked for, and it is not shown: that is the whole answer to
  // whether there is a page after this one, without counting the board twice.
  const rows = await sql.query<BoardRowShape>(
    `SELECT v.character_id, p.name AS player, c.name AS name, v.actions, v.time, v.play_ms,
            v.timed, v.deepest, v.level, c.outcome, c.finished_at
     FROM verdicts v
     JOIN characters c ON c.id = v.character_id
     JOIN players p ON p.id = c.player_id
     WHERE v.game = $1 AND v.leaderboard = $2 AND v.eligible${board.holds === null ? '' : ` AND ${board.holds}`}
     ORDER BY ${board.order}
     LIMIT $3 OFFSET $4`,
    [asked.game, asked.leaderboard, RUNS_PER_PAGE + 1, (asked.page - 1) * RUNS_PER_PAGE],
  );
  return {
    game: asked.game,
    leaderboard: asked.leaderboard,
    board: asked.board,
    page: asked.page,
    rows: rows.slice(0, RUNS_PER_PAGE).map(rowOf),
    more: rows.length > RUNS_PER_PAGE,
  };
}

/** A row as the database hands it back. It is a type rather than an interface so that a bag of
 *  columns can be read as one. */
type BoardRowShape = {
  character_id: string;
  player: string;
  name: string;
  actions: number;
  time: number;
  play_ms: number;
  timed: boolean;
  deepest: number;
  level: number;
  outcome: string | null;
  finished_at: Date | null;
};

function rowOf(row: BoardRowShape): BoardRow {
  return {
    characterId: row.character_id,
    player: row.player,
    name: row.name,
    actions: row.actions,
    clock: row.time,
    playMs: row.play_ms,
    timed: row.timed,
    deepest: row.deepest,
    level: row.level,
    outcome: row.outcome,
    at: row.finished_at === null ? null : row.finished_at.toISOString(),
  };
}

/** One character as a board of the living shows it. */
export interface LivingRow {
  characterId: string;
  /** The name the player claimed on this server, and the character's own. */
  player: string;
  name: string;
  /** The highest level and the furthest reach the replay of the chain so far found. */
  level: number;
  deepest: number;
  actions: number;
  /** The game's own clock, which is seconds in Dungeons of the Unforgiven and moves in Moraff's
   *  World. */
  clock: number;
  /** Whether a device is playing the character at this moment, which is its lease not yet having
   *  lapsed. */
  playing: boolean;
  /** When the server last heard from the device playing it. */
  heardAt: string | null;
}

export interface LivingPage {
  game: string;
  leaderboard: string;
  sort: LivingSort;
  page: number;
  rows: LivingRow[];
  /** Whether there is a page after this one. */
  more: boolean;
}

/**
 * The order each board of the living stands in.
 *
 * Both end in the fewest actions and then the oldest character, so that two characters standing
 * equally deep or equally high are in a settled order rather than in whatever order the rows come
 * back in, and the one who got there for less is first.
 */
const LIVING_ORDERS: Record<LivingSort, string> = {
  level: 'l.level DESC, l.actions ASC, c.created_at ASC',
  deepest: 'l.deepest DESC, l.actions ASC, c.created_at ASC',
};

/**
 * One page of a board of the living. Pages count from one.
 *
 * A character is on a board while three things hold: the chain it has played came out verified,
 * its run has not ended, and it was rolled for this board. A snapshot the replay failed or could
 * not check keeps the character off, and so does a death or a win, since a run that has ended has
 * a verdict of its own and stands on the boards above.
 *
 * `now` is what the lease is read against: a character whose lease has not lapsed has a device
 * playing it at this moment.
 */
export async function livingPage(
  sql: Queries,
  asked: { game: string; leaderboard: string; sort: LivingSort; page: number },
  now: number,
): Promise<LivingPage> {
  // One row more than a page is asked for, and it is not shown: that is the whole answer to
  // whether there is a page after this one, without counting the board twice.
  const rows = await sql.query<LivingRowShape>(
    `SELECT l.character_id, p.name AS player, c.name AS name, l.level, l.deepest, l.actions,
            l.time, c.leased_until, c.saved_at
     FROM living l
     JOIN characters c ON c.id = l.character_id
     JOIN players p ON p.id = c.player_id
     WHERE l.game = $1 AND l.leaderboard = $2 AND l.status = 'verified' AND c.finished_at IS NULL
     ORDER BY ${LIVING_ORDERS[asked.sort]}
     LIMIT $3 OFFSET $4`,
    [asked.game, asked.leaderboard, RUNS_PER_PAGE + 1, (asked.page - 1) * RUNS_PER_PAGE],
  );
  return {
    game: asked.game,
    leaderboard: asked.leaderboard,
    sort: asked.sort,
    page: asked.page,
    rows: rows.slice(0, RUNS_PER_PAGE).map((row) => livingRowOf(row, now)),
    more: rows.length > RUNS_PER_PAGE,
  };
}

/** A row as the database hands it back. It is a type rather than an interface so that a bag of
 *  columns can be read as one. */
type LivingRowShape = {
  character_id: string;
  player: string;
  name: string;
  level: number;
  deepest: number;
  actions: number;
  time: number;
  leased_until: Date | null;
  saved_at: Date | null;
};

function livingRowOf(row: LivingRowShape, now: number): LivingRow {
  return {
    characterId: row.character_id,
    player: row.player,
    name: row.name,
    level: row.level,
    deepest: row.deepest,
    actions: row.actions,
    clock: row.time,
    playing: row.leased_until !== null && row.leased_until.getTime() > now,
    // Every batch of the sitting being played carries the character itself, and this is when the
    // newest of those landed, so it is when the server last heard anything of the run.
    heardAt: row.saved_at === null ? null : row.saved_at.toISOString(),
  };
}
