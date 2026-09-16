import type { JournalEntry } from '../src/lib/play/journal';
import type { Milestone } from '../src/lib/play/run';
import { ANNOUNCED_FINDS, SHADOW_ROW } from './boards';
import type { Queries } from './sql';

/**
 * What the server says about a run once it has been checked.
 *
 * A verified run that may go on a board is announced: the few things of its whole run worth
 * stopping to read that have not been announced before. Those are a boss beaten, the twentieth
 * level and every fifth past it, the kill counts in {@link ANNOUNCED_KILLS}, one of the rare finds
 * in `ANNOUNCED_FINDS` (`server/boards.ts`), a floor an endless character has taken a Shadow
 * deeper than it ever had before, and how the run ended. A module, a dungeon and a floor reached
 * are not among them: a character reaches dozens of those, and the feed is read on every page of
 * the site.
 *
 * The chain carries every milestone the character has ever reached and the journal is its whole
 * run, so a run checked again repeats most of them, and saying a thing once is the index on the
 * table.
 *
 * A character still being played has no outcome yet, and what it has reached is announced without
 * one: the feed is read live rather than only after a character dies or wins.
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
export type AnnouncementKind =
  | 'win'
  | 'death'
  | 'boss'
  | 'shadow'
  | 'kills'
  | 'find'
  | 'dungeon'
  | 'level'
  | 'floor';

/** One announcement, as it is kept and as it goes out over the feed. */
export interface Announcement {
  id: number;
  characterId: string;
  kind: AnnouncementKind;
  /** Which boss, which floor a Shadow was killed on, which level, which kill count, which find,
   *  which module or dungeon, which floor. */
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
  /** How the run came out, and null for a character still being played: nothing is said about how
   *  a run ended until it has. */
  outcome: 'win' | 'death' | null;
  /** Every milestone of the whole chain, oldest first. */
  milestones: readonly Milestone[];
  /** The whole run written up by the replay, oldest first, which is what the kills, the finds and
   *  the Shadows are read out of. */
  journal: readonly JournalEntry[];
  actions: number;
  time: number;
  playMs: number;
}

/**
 * Whether a milestone is one to announce.
 *
 * A boss is, every time: a section's Shadow is the hardest thing the game asks for. A level only
 * when it is the twentieth or a fifth past it — a character gains its first twenty levels in the
 * first hour and nobody would stop to read about those.
 *
 * A module, a dungeon and a floor are never announced. A character reaches dozens of those over a
 * run, and the feed is read on every page of the site, so it holds only what somebody would stop
 * to read. A death and a win are the run's outcome instead, and that is announced once whatever
 * the chain says about how it ended.
 */
function worthAnnouncing(milestone: Milestone): boolean {
  if (milestone.kind === 'boss') return true;
  if (milestone.kind === 'level') return milestone.which >= 20 && milestone.which % 5 === 0;
  return false;
}

/**
 * The kill counts worth saying, which are the ones a player would notice passing.
 *
 * They are counted over the character's whole run rather than one sitting of it, and the index on
 * the table is what keeps a run replayed again from saying any of them a second time.
 */
const ANNOUNCED_KILLS: readonly number[] = [100, 500, 1000, 2500, 5000];

/**
 * Announce a run: everything it has to say that has not been announced for this character before.
 *
 * What comes back is only what was written this time, which is what there is to push to anybody
 * listening.
 */
export async function announceRun(sql: Queries, run: AnnouncedRun): Promise<Announcement[]> {
  const made: Announcement[] = [];
  for (const moment of momentsOf(run)) {
    const written = await announce(sql, run, moment);
    if (written !== null) made.push(written);
  }
  return made;
}

/**
 * Everything a run has to announce, in the order it goes out.
 *
 * The milestones come first, then what the journal counted, and the outcome last so that it is
 * the newest of them, which is the order a feed reads in. A character still being played has no
 * outcome yet and everything it has reached is announced without one.
 */
function momentsOf(run: AnnouncedRun): AnnouncementMoment[] {
  const moments: AnnouncementMoment[] = [];
  let dungeon = 0;
  let level = 0;
  for (const milestone of run.milestones) {
    if (milestone.kind === 'dungeon') dungeon = milestone.which;
    if (milestone.kind === 'level') level = Math.max(level, milestone.which);
    if (!worthAnnouncing(milestone)) continue;
    moments.push({
      kind: milestone.kind,
      which: milestone.which,
      actions: milestone.actions,
      time: milestone.time,
      floor: milestone.floor,
      dungeon,
      level,
    });
  }
  moments.push(...journalMoments(run));
  if (run.outcome !== null) {
    const ended = run.milestones[run.milestones.length - 1];
    moments.push({
      kind: run.outcome,
      which: 0,
      actions: run.actions,
      time: run.time,
      floor: ended?.floor ?? 0,
      dungeon,
      level,
    });
  }
  return moments;
}

/**
 * What the journal the replay wrote has to announce: the kill counts the run passed, the rare
 * things it turned up, and how deep an endless character has taken a Shadow.
 *
 * The endless dungeon has no bottom and no winning, so what a run of it is measured by is the
 * deepest floor it has killed the Shadow of -- `deepestShadowKilled` in `server/boards.ts` is the
 * same reading, for the board. Every floor that beats the deepest before it is worth saying, so
 * the walk keeps the running deepest as it goes. The other two ways of playing stop where the
 * game does, and their Shadows are the `boss` milestones the run already carries.
 */
function journalMoments(run: AnnouncedRun): AnnouncementMoment[] {
  const moments: AnnouncementMoment[] = [];
  let kills = 0;
  let deepestShadow = 0;
  for (const entry of run.journal) {
    const event = entry.event;
    if (event === null) continue;
    if (event.kind === 'killed') {
      kills += 1;
      if (ANNOUNCED_KILLS.includes(kills)) moments.push(momentAt(run, entry, 'kills', kills));
      if (run.leaderboard === 'endless' && event.monster.type === SHADOW_ROW && entry.floor > deepestShadow) {
        deepestShadow = entry.floor;
        moments.push(momentAt(run, entry, 'shadow', entry.floor));
      }
    }
    // A spellbook, a trap door key and a purse of money have no name to match, and the finds that
    // do are matched by the name the game's own line gives them.
    if (event.kind === 'found' && 'item' in event.find) {
      const found = ANNOUNCED_FINDS.indexOf(event.find.item);
      if (found !== -1) moments.push(momentAt(run, entry, 'find', found));
    }
  }
  return moments;
}

/**
 * One line of the journal as an announcement of it.
 *
 * The line says how many actions the run had spent, the floor the character was standing on and
 * the module it was in. The game's own clock and the level the character had reached are not in
 * the journal at all, so they come off the milestones instead.
 */
function momentAt(
  run: AnnouncedRun,
  entry: JournalEntry,
  kind: AnnouncementKind,
  which: number,
): AnnouncementMoment {
  const standing = standingAt(run.milestones, entry.at);
  return {
    kind,
    which,
    actions: entry.at,
    time: standing.time,
    floor: entry.floor,
    dungeon: entry.module,
    level: standing.level,
  };
}

/** The game's clock and the level the run had reached by the time it had spent these actions,
 *  which is what the last milestone before then left them at. */
function standingAt(milestones: readonly Milestone[], actions: number): { time: number; level: number } {
  let time = 0;
  let level = 0;
  for (const milestone of milestones) {
    if (milestone.actions > actions) break;
    time = milestone.time;
    if (milestone.kind === 'level') level = Math.max(level, milestone.which);
  }
  return { time, level };
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
