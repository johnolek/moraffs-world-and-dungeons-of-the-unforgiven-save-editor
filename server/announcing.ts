import type { Milestone, MilestoneKind } from '../src/lib/play/run';
import type { Queries } from './sql';

/**
 * What the server says about a run once it has been checked.
 *
 * A verified run that may go on a board is announced: that the character won or died, and the few
 * things of its whole run worth stopping to read that have not been announced before. The chain
 * carries every milestone the character has ever reached, so a run of a character that has been
 * played before repeats most of them, and saying a thing once is the index on the table.
 *
 * The rows carry fields and no sentence: how an announcement reads is the site's, in
 * `src/lib/boards/announce.ts`, so that the feed and the history read the same way and neither is
 * frozen into the database.
 */

/**
 * What is being announced. A win and a death have nothing to count and their `which` is 0.
 *
 * `dungeon` and `floor` are kinds nothing writes any more. They are here because the table still
 * holds rows of them from when it did, and a row nobody can name is a row nobody can read.
 */
export type AnnouncementKind = 'win' | 'death' | 'boss' | 'dungeon' | 'level' | 'floor';

/** One announcement, as it is kept and as it goes out over the feed. */
export interface Announcement {
  id: number;
  characterId: string;
  kind: AnnouncementKind;
  /** Which boss, which level, which module or dungeon, which floor. */
  which: number;
  game: string;
  leaderboard: string | null;
  player: string;
  name: string;
  actions: number;
  /** The game's own clock: seconds, moves or ticks, depending on the game. */
  time: number;
  /** Where the character stood and what it had reached by then. */
  floor: number;
  dungeon: number;
  level: number;
  /** The run's play time, which is only there for what is said about a win. */
  playMs: number;
  at: string;
}

/** A checked run, as everything about it that is announced. */
export interface AnnouncedRun {
  characterId: string;
  player: string;
  name: string;
  game: string;
  leaderboard: string | null;
  outcome: 'win' | 'death';
  /** Every milestone of the whole chain, oldest first. */
  milestones: readonly Milestone[];
  actions: number;
  time: number;
  playMs: number;
}

/**
 * The milestone kinds announced one by one.
 *
 * A module, a dungeon and a floor are not among them. A character reaches dozens of those over a
 * run, and the feed is read on every page of the site, so it holds only what somebody would stop
 * to read. A death and a win are the run's outcome instead, and that is announced once whatever
 * the chain says about how it ended.
 */
const ANNOUNCED_MILESTONES: readonly MilestoneKind[] = ['boss', 'level'];

/**
 * Announce a run: the milestones it reached that have not been announced, oldest first, and then
 * how it ended.
 *
 * The outcome goes last so that it is the newest of them, which is the order a feed reads in. What
 * comes back is only what was written this time, which is what there is to push to anybody
 * listening.
 */
export async function announceRun(sql: Queries, run: AnnouncedRun): Promise<Announcement[]> {
  const made: Announcement[] = [];
  let dungeon = 0;
  let level = 0;
  for (const milestone of run.milestones) {
    if (milestone.kind === 'dungeon') dungeon = milestone.which;
    if (milestone.kind === 'level') level = Math.max(level, milestone.which);
    if (!ANNOUNCED_MILESTONES.includes(milestone.kind)) continue;
    const written = await announce(sql, run, {
      kind: milestone.kind,
      which: milestone.which,
      actions: milestone.actions,
      time: milestone.time,
      floor: milestone.floor,
      dungeon,
      level,
    });
    if (written !== null) made.push(written);
  }
  const ended = run.milestones[run.milestones.length - 1];
  const outcome = await announce(sql, run, {
    kind: run.outcome,
    which: 0,
    actions: run.actions,
    time: run.time,
    floor: ended?.floor ?? 0,
    dungeon,
    level,
  });
  if (outcome !== null) made.push(outcome);
  return made;
}

/** What one announcement says beyond the run it belongs to. */
interface AnnouncementMoment {
  kind: AnnouncementKind;
  which: number;
  actions: number;
  time: number;
  floor: number;
  dungeon: number;
  level: number;
}

/** Write one announcement, or nothing at all when that character has already made it. */
async function announce(sql: Queries, run: AnnouncedRun, moment: AnnouncementMoment): Promise<Announcement | null> {
  const rows = await sql.query<AnnouncementRow>(
    `INSERT INTO announcements (character_id, kind, which, game, leaderboard, player, name,
                                actions, time, floor, dungeon, level, play_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (character_id, kind, which) DO NOTHING
     RETURNING *`,
    [
      run.characterId,
      moment.kind,
      moment.which,
      run.game,
      run.leaderboard,
      run.player,
      run.name,
      moment.actions,
      moment.time,
      moment.floor,
      moment.dungeon,
      moment.level,
      run.playMs,
    ],
  );
  return rows.length === 0 ? null : announcementOf(rows[0]);
}

/** How many announcements a page of the history holds, which is also the most one may ask for. */
export const ANNOUNCEMENTS_PER_PAGE = 50;

/** A page of the history, newest first, and whether there is more of it behind. */
export interface AnnouncementPage {
  announcements: Announcement[];
  more: boolean;
}

/**
 * The announcements already made, newest first.
 *
 * The history is paged by id rather than by an offset: announcements are made while a page is
 * being read, and an offset would show one twice or skip one as they arrive. `before` is the
 * oldest id the reader already has, so the next page starts under it.
 */
export async function announcementsBefore(
  sql: Queries,
  before: number | null,
  limit: number,
): Promise<AnnouncementPage> {
  // One row more than a page is asked for and is not shown: that is the whole answer to whether
  // there is more behind, without counting the table.
  const rows = await sql.query<AnnouncementRow>(
    before === null
      ? 'SELECT * FROM announcements ORDER BY id DESC LIMIT $1'
      : 'SELECT * FROM announcements WHERE id < $1 ORDER BY id DESC LIMIT $2',
    before === null ? [limit + 1] : [before, limit + 1],
  );
  return { announcements: rows.slice(0, limit).map(announcementOf), more: rows.length > limit };
}

/** A row of the announcements table. It is a type rather than an interface so that a bag of
 *  columns can be read as one. */
type AnnouncementRow = {
  id: number;
  character_id: string;
  kind: string;
  which: number;
  game: string;
  leaderboard: string | null;
  player: string;
  name: string;
  actions: number;
  time: number;
  floor: number;
  dungeon: number;
  level: number;
  play_ms: number;
  at: Date;
};

function announcementOf(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    characterId: row.character_id,
    kind: row.kind as AnnouncementKind,
    which: row.which,
    game: row.game,
    leaderboard: row.leaderboard,
    player: row.player,
    name: row.name,
    actions: row.actions,
    time: row.time,
    floor: row.floor,
    dungeon: row.dungeon,
    level: row.level,
    playMs: row.play_ms,
    at: row.at.toISOString(),
  };
}
