import { characterStatus, type CharacterStatus } from '../src/lib/character/record';
import type { Queries } from './sql';

/**
 * Everyone: one table of every character of a game the server has checked.
 *
 * Each of the eight boards answers one question — the fewest actions, the furthest reach, who is
 * alive — so a reader who wants to see who is playing a game at all has to click through all of
 * them and hold the answers in their head. This is the other way about: every character in one
 * answer, living beside dead beside won and faithful beside speedrun, with what the character is
 * now next to how far its run got. Which of them a reader wants to see is theirs to pick, so
 * nothing is left out here and no order but a first one is decided.
 *
 * Who is here is exactly who is on the eight boards put together: a run that has ended with a
 * verdict of verified that may go on a board, and a character still being played whose chain the
 * replay passed. A run nothing has verified is nobody's to read but the player's, which is the
 * rule `server/README.md` states for a run's own page as well.
 *
 * The site draws this and imports the shapes below as types. `characterStatus` is the site's own
 * reader for a character record and comes the other way, which is safe for the same reason: it
 * reads bytes and reaches nothing.
 */

/** What has become of a character: still being played, dead, or the game won. */
export type EveryoneStatus = 'alive' | 'dead' | 'won';

/**
 * What the character is now, read out of the newest record a device sent.
 *
 * The six characteristics are in the game's own order and unlabelled, since every character of
 * one game keeps them in the same order and the labels are the same six for the whole column
 * (`statLabels` in `src/lib/character/record.ts`).
 */
export interface EveryoneNumbers {
  cls: string;
  hp: number;
  maxHp: number;
  stats: number[];
}

/** One character, whatever has become of it. */
export interface EveryoneRow {
  characterId: string;
  /** The name the player claimed on this server, and the character's own. */
  player: string;
  name: string;
  /** Which of the two boards the character was rolled for, and null for one rolled for neither. */
  leaderboard: string | null;
  status: EveryoneStatus;
  /** Whether a device is playing the character at this moment, which is its lease not yet having
   *  lapsed. A run that has ended is played by nobody. */
  playing: boolean;
  /** The highest level and the furthest reach a replay found, and what they cost. */
  level: number;
  deepest: number;
  actions: number;
  /** The game's own clock, which is seconds in Dungeons of the Unforgiven and moves in Moraff's
   *  World. */
  clock: number;
  /** How long the run was played by the server's clock, and whether that may be believed. Both
   *  are a verdict's, so a run that has not ended has no play time to show. */
  playMs: number;
  timed: boolean;
  /** When the run ended, or when the server last heard from a character still being played. */
  at: string | null;
  /** What the character is now, and null where there is no record to read it from. */
  now: EveryoneNumbers | null;
}

export interface EveryoneAnswer {
  game: string;
  rows: EveryoneRow[];
}

/**
 * Everyone of one game, in one answer.
 *
 * The runs that have ended and the characters still being played are two tables and so two
 * queries, put together here. There is no paging: the reader filters and sorts this table
 * themselves, and half a table cannot be sorted.
 *
 * `now` is what the lease is read against: a character whose lease has not lapsed has a device
 * playing it at this moment.
 */
export async function everyoneOf(sql: Queries, game: string, now: number): Promise<EveryoneAnswer> {
  const ended = await sql.query<EndedShape>(
    `SELECT v.character_id, p.name AS player, c.name AS name, v.leaderboard, c.outcome,
            v.level, v.deepest, v.actions, v.time, v.play_ms, v.timed, c.finished_at, c.record
     FROM verdicts v
     JOIN characters c ON c.id = v.character_id
     JOIN players p ON p.id = c.player_id
     WHERE v.game = $1 AND v.status = 'verified' AND v.eligible`,
    [game],
  );
  const living = await sql.query<LivingShape>(
    `SELECT l.character_id, p.name AS player, c.name AS name, l.leaderboard,
            l.level, l.deepest, l.actions, l.time, c.leased_until, c.saved_at, c.record
     FROM living l
     JOIN characters c ON c.id = l.character_id
     JOIN players p ON p.id = c.player_id
     WHERE l.game = $1 AND l.status = 'verified' AND c.finished_at IS NULL`,
    [game],
  );
  const rows = [
    ...ended.map((row) => endedRow(row, game)),
    ...living.map((row) => livingRow(row, game, now)),
  ];
  rows.sort(standing);
  return { game, rows };
}

/**
 * The order the table arrives in: the highest level first, then the furthest, then the one who
 * got there for the fewest actions, and the name to settle the rest.
 *
 * It is only the order the reader is handed the table in, since every column here sorts on the
 * site. What it is for is a first screen worth reading, and a settled one: two characters
 * standing equally are in the same order every time the table is read rather than in whatever
 * order the two queries happened to come back in.
 */
function standing(one: EveryoneRow, other: EveryoneRow): number {
  if (one.level !== other.level) return other.level - one.level;
  if (one.deepest !== other.deepest) return other.deepest - one.deepest;
  if (one.actions !== other.actions) return one.actions - other.actions;
  return one.name.localeCompare(other.name);
}

/** A row as the database hands it back. It is a type rather than an interface so that a bag of
 *  columns can be read as one. */
type EndedShape = {
  character_id: string;
  player: string;
  name: string;
  leaderboard: string | null;
  outcome: string | null;
  level: number;
  deepest: number;
  actions: number;
  time: number;
  play_ms: number;
  timed: boolean;
  finished_at: Date | null;
  record: Uint8Array | null;
};

type LivingShape = {
  character_id: string;
  player: string;
  name: string;
  leaderboard: string | null;
  level: number;
  deepest: number;
  actions: number;
  time: number;
  leased_until: Date | null;
  saved_at: Date | null;
  record: Uint8Array | null;
};

function endedRow(row: EndedShape, game: string): EveryoneRow {
  return {
    characterId: row.character_id,
    player: row.player,
    name: row.name,
    leaderboard: row.leaderboard,
    status: row.outcome === 'win' ? 'won' : 'dead',
    playing: false,
    level: row.level,
    deepest: row.deepest,
    actions: row.actions,
    clock: row.time,
    playMs: row.play_ms,
    timed: row.timed,
    at: row.finished_at === null ? null : row.finished_at.toISOString(),
    now: numbersOf(game, row.name, row.record),
  };
}

function livingRow(row: LivingShape, game: string, now: number): EveryoneRow {
  return {
    characterId: row.character_id,
    player: row.player,
    name: row.name,
    leaderboard: row.leaderboard,
    status: 'alive',
    playing: row.leased_until !== null && row.leased_until.getTime() > now,
    level: row.level,
    deepest: row.deepest,
    actions: row.actions,
    clock: row.time,
    playMs: 0,
    timed: false,
    // Every batch of the sitting being played carries the character itself, and this is when the
    // newest of those landed, so it is when the server last heard anything of the run.
    at: row.saved_at === null ? null : row.saved_at.toISOString(),
    now: numbersOf(game, row.name, row.record),
  };
}

/** The few of a character's numbers the table shows, out of the newest record sent for it. */
function numbersOf(game: string, name: string, record: Uint8Array | null): EveryoneNumbers | null {
  const status = statusOf(game, name, record);
  if (status === null) return null;
  return {
    cls: status.cls,
    hp: status.hp,
    maxHp: status.maxHp,
    stats: status.stats.map((stat) => stat.value),
  };
}

/**
 * A stored record read as a character, and null for anything that will not read as one.
 *
 * A run's page shows the whole of this and the table above shows a few of its numbers, so both
 * come through here rather than each reading the bytes its own way.
 *
 * The record is the device's bytes and the server never reads them anywhere else, so this is the
 * one place they could be anything: a character kept before the server held records at all has
 * none, and one shorter than the game's own file, or of a game this build cannot read, is bytes
 * this cannot make a character of. None of that is worth failing a whole table or page for, so
 * anything but a record that reads is nothing to show and the rest of it stands.
 *
 * The bytes are copied onto an ArrayBuffer of their own because what the database hands back may
 * be a view into a buffer it shares with other rows, and a reader given the buffer would be
 * reading the wrong character.
 */
export function statusOf(game: string, name: string, record: Uint8Array | null): CharacterStatus | null {
  if (record === null) return null;
  try {
    return characterStatus({ game, name, slot: null, bytes: new Uint8Array(record) });
  } catch {
    return null;
  }
}
