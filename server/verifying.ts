import { shortCommit } from '../src/lib/commit';
import type { KeptEndlessState } from '../src/lib/game/endless/state';
import type { JournalEntry } from '../src/lib/play/journal';
import type { Milestone, RunLog, RunSession, RunTotals } from '../src/lib/play/run';
import type { CheckedSession, RunVerdict } from '../src/lib/play/verify';
import { announceRun, type Announcement } from './announcing';
import { deepestReach, deepestShadowKilled, highestLevel, killsIn } from './boards';
import type { EngineStore, KeptEngine, SessionVerifier } from './engines';
import { batchesOf, runFor, sessionsOf, type KeptBatch, type KeptSession } from './runs';
import type { Queries } from './sql';

/**
 * Putting a run back together and passing a verdict on it.
 *
 * What arrived is a character, its sittings and the stretches of keys that came in while it was
 * being played. A run log is those stretches joined back up in the order they were sent, and the
 * engine the run was played on is what replays it: the same record, the same seed and the same
 * keys have to arrive where the site says they did.
 *
 * The play time is the one number the run itself does not carry. It is read off the moments the
 * batches landed, by this server's own clock, so a page that lies about how long it took is not
 * believed and time the player spent away from the game counts for nothing.
 *
 * A run that has ended is replayed once and given a verdict. A character still being played is
 * replayed over and over, as far as it has got each time, and what the replay reached is the
 * snapshot a board of the living shows: same walk of the chain, and a note of where it stands
 * rather than a verdict on how it came out.
 */

/**
 * How often the site sends while a character is being played, which
 * `src/lib/play/stream.ts` is the other half of.
 */
const SENDING_INTERVAL_MS = 5000;

/**
 * The longest gap between two batches that is counted as play.
 *
 * Three times the interval: a batch is late now and then, from a connection that dropped and a
 * retry that took its place, and this leaves room for that. Anything longer is the player having
 * left the game -- the tab closed, another character chosen, the page hidden -- and that time is
 * not the run's.
 */
const LONGEST_COUNTED_GAP_MS = 3 * SENDING_INTERVAL_MS;

/** More keys a second than anybody plays at. */
const MOST_PRESSES_PER_SECOND = 20;

/**
 * The allowance every batch gets on top of its own gap.
 *
 * A batch can land right behind the one before it -- the last batch of a run goes the moment the
 * character dies -- and the keys it carries were pressed over the seconds before that, so judging
 * its presses against a gap of a few milliseconds alone would fail an honest run.
 */
const PRESSES_GRACE_MS = 1000;

/** What the batch stamps say about a run: how long it was played, and whether that can be
 *  believed. */
export interface RunTiming {
  playMs: number;
  /**
   * Whether the run may stand on the wall-clock board. A stretch carrying more keys than anybody
   * could have pressed in the time it covers takes it off that board and leaves it on the others:
   * its actions and its verdict are unaffected.
   */
  timed: boolean;
}

/**
 * How long a run was played, from the moments its batches arrived.
 *
 * The gaps are taken within one sitting: the first batch of a sitting has no batch before it, so
 * the stretch of play in front of it -- at most one sending interval, and everything that was
 * played before the server was ever told about the character -- counts for nothing. That is the
 * price of measuring time the server can see rather than time the page claims.
 */
export function runTiming(batches: readonly KeptBatch[]): RunTiming {
  let playMs = 0;
  let timed = true;
  let before: KeptBatch | null = null;
  for (const batch of batches) {
    if (before !== null && before.sessionIndex === batch.sessionIndex) {
      const gap = batch.arrivedAt - before.arrivedAt;
      if (gap >= 0 && gap <= LONGEST_COUNTED_GAP_MS) {
        playMs += gap;
        if (batch.pressed > mostPressesIn(gap)) timed = false;
      }
    }
    before = batch;
  }
  return { playMs, timed };
}

function mostPressesIn(gap: number): number {
  return (MOST_PRESSES_PER_SECOND * (gap + PRESSES_GRACE_MS)) / 1000;
}

/**
 * The version of the log shape, which is `RUN_LOG_VERSION` in `src/lib/play/run.ts`.
 *
 * It is written out here rather than imported because importing a value from that file would pull
 * the whole engine into this build, and the engine is what the server loads from disk per commit.
 * Nothing in `verifyRun` reads it; it is here so the log the engine is handed is a whole one.
 */
const RUN_LOG_VERSION = 3;

/** The sittings and the stretches joined back into the log the site would have written. */
export function runLogFrom(sessions: readonly KeptSession[], batches: readonly KeptBatch[]): RunLog {
  return {
    version: RUN_LOG_VERSION,
    sessions: sessions.map((session) => sessionFrom(session, batches)),
  };
}

function sessionFrom(session: KeptSession, batches: readonly KeptBatch[]): RunSession {
  const inputs = batches
    .filter((batch) => batch.sessionIndex === session.sessionIndex)
    .flatMap((batch) => batch.inputs);
  return { ...sessionWithoutKeys(session), inputs };
}

/**
 * One sitting as a run log names it, without the keys, which the stretches carry.
 *
 * The game and the board are strings out of the database, and an engine handed one it does not
 * know throws rather than passing a run: the verdict is then that the run cannot be checked.
 */
export function sessionWithoutKeys(session: KeptSession): Omit<RunSession, 'inputs'> {
  return {
    engine: session.engine,
    game: session.game as RunSession['game'],
    mode: session.mode,
    leaderboard: session.leaderboard as RunSession['leaderboard'],
    sound: session.sound,
    name: session.name,
    startedAt: session.startedAt,
    seed: session.seed,
    worldSeed: session.worldSeed,
    record: session.record,
    actions: session.actions,
    time: session.time,
    milestones: session.milestones,
    edits: session.edits,
  };
}

/** What was written down about a run once it had been replayed. */
export interface KeptVerdict {
  status: string;
  reason: string | null;
  actions: number;
  time: number;
  milestones: Milestone[];
  playMs: number;
  timed: boolean;
  /** Whether the run may go on a board at all. */
  eligible: boolean;
  game: string;
  /** The board the character was rolled for, and null for a run that is on no board. */
  leaderboard: string | null;
  /** How far the run got, and the highest level it reached. */
  deepest: number;
  level: number;
  /** How many monsters the run killed, which the endless dungeon has a board of. */
  kills: number;
  engines: string[];
  /**
   * The run written up in words by the replay, oldest sitting first, which is what a run's page
   * shows as its timeline and folds its summary out of.
   *
   * Empty for a game whose journal has not been written yet, and for a verdict reached without a
   * replay having been run at all.
   */
  journal: JournalEntry[];
  verifiedAt: string;
}

/**
 * What a verdict says about the way its run was replayed, since a chain whose sittings were each
 * replayed by their own build and a chain handed whole to one build are not the same claim.
 */
const EACH_BY_ITS_OWN_BUILD = 'Each sitting was replayed by the engine build it was played on.';
const THE_WHOLE_CHAIN_AT_ONCE =
  'The whole chain was replayed by the engine build of its newest sitting, since one of the builds it names cannot replay a sitting on its own.';

/**
 * Replay a character's whole run, write down what came of it, and announce it.
 *
 * Only a run that may go on a board is announced: a run nobody can check, or one with a record
 * written into it from outside the game, is the player's own business and is not news. What comes
 * back is what was announced this time, which is what there is to push to anybody listening.
 */
export async function verifyKeptRun(
  sql: Queries,
  engines: EngineStore,
  characterId: string,
): Promise<Announcement[]> {
  const sessions = await sessionsOf(sql, characterId);
  if (sessions.length === 0) return [];
  if (!forTheBoards(sessions[sessions.length - 1])) return [];
  const batches = await batchesOf(sql, characterId);
  const timing = runTiming(batches);
  const log = runLogFrom(sessions, batches);
  const edits = sessions.reduce((count, session) => count + session.edits, 0);
  const verdict = await replayChain(engines, log);
  // A record written from outside the game is not in the log, so a replay has no way of putting
  // the character back into it. The verifier says as much on its own; this says it again here so
  // that a board never has to trust an engine build about it.
  const eligible = verdict.status === 'verified' && edits === 0;
  await keepVerdict(sql, characterId, verdict, timing, eligible);
  return eligible ? announceVerifiedRun(sql, characterId, verdict, timing) : [];
}

/**
 * Whether a run is one to check at all, which the newest sitting of the chain says.
 *
 * Every character of a signed-in player is kept here, so that the player finds them all wherever
 * they sign in, and most of them are nobody's competition: one rolled for no board is played for
 * its own sake, and debug is the mode with the game's hidden numbers on the screen. Those get
 * their saves and no verdict — there is nothing to rank them against — so nothing is replayed for
 * them and nothing is announced about them.
 */
function forTheBoards(newest: KeptSession): boolean {
  return newest.leaderboard !== null && newest.mode !== 'debug';
}

/** What a checked run has to announce: how it ended, and the milestones the replay reached. */
async function announceVerifiedRun(
  sql: Queries,
  characterId: string,
  verdict: RunVerdict,
  timing: RunTiming,
): Promise<Announcement[]> {
  const run = await runFor(sql, characterId);
  if (run === null || run.outcome === null) return [];
  const totals = verdict.replayed ?? verdict.claimed;
  return announceRun(sql, {
    characterId,
    player: run.player,
    name: run.name,
    game: verdict.game,
    leaderboard: verdict.leaderboard,
    outcome: run.outcome === 'win' ? 'win' : 'death',
    milestones: totals.milestones,
    actions: totals.actions,
    time: totals.time,
    playMs: timing.playMs,
  });
}

/**
 * Replay a chain and pass a verdict on it, each sitting by the engine build it was played on.
 *
 * A character is played over days and the site is rebuilt between sittings, so the sittings of one
 * run can name several commits. A sitting replayed by anything but its own engine shows nothing,
 * which is the whole reason every build ever deployed is kept, so each sitting is handed to the
 * build it names and this walks the chain between them: it carries what the run had come to and
 * the record the sitting before ended with from one build to the next.
 *
 * A build deployed before it could replay a single sitting can only be handed a whole chain. Where
 * the chain names one of those, all of it goes through the newest build in one piece, and the
 * verdict's notes say which of the two happened.
 */
export async function replayChain(engines: EngineStore, log: RunLog): Promise<RunVerdict> {
  const builds: KeptEngine[] = [];
  const bySitting: SessionVerifier[] = [];
  for (const session of log.sessions) {
    const lookup = await engines.engineFor(session.engine);
    if (!lookup.kept) return unverifiable(log, lookup.reason);
    builds.push(lookup.engine);
    if (lookup.engine.verifySession !== null) bySitting.push(lookup.engine.verifySession);
  }
  const newest = builds[builds.length - 1];
  if (bySitting.length < log.sessions.length) return replayWholeChain(newest, log);
  return replaySittingBySitting(bySitting, log, newest.commit);
}

/** The chain handed whole to the build of its newest sitting, which is all a build that cannot
 *  replay one sitting on its own can be asked for. */
async function replayWholeChain(newest: KeptEngine, log: RunLog): Promise<RunVerdict> {
  let verdict: RunVerdict;
  try {
    verdict = await newest.verifyRun(log);
  } catch (thrown) {
    return unverifiable(log, `The replay stopped: ${whatStoppedIt(thrown)}`);
  }
  return { ...verdict, notes: [...verdict.notes, THE_WHOLE_CHAIN_AT_ONCE] };
}

/**
 * Each sitting replayed by its own build, and the verdict on the run they add up to.
 *
 * The builds judge the sittings and this joins them: a sitting is handed what the run had come to
 * before it, so its own numbers count on from there, and the record the last replay ended with,
 * which it has to start from for the chain to be one character's run rather than several, along
 * with what an endless character was carrying beside that record.
 */
async function replaySittingBySitting(
  bySitting: readonly SessionVerifier[],
  log: RunLog,
  build: string,
): Promise<RunVerdict> {
  const sessions = log.sessions;
  const verdict = verdictOf(log, build);
  verdict.notes.push(EACH_BY_ITS_OWN_BUILD);
  let before: RunTotals = { actions: 0, time: 0, milestones: [] };
  let after: Uint8Array | null = null;
  let carried: KeptEndlessState | null = null;
  for (const [at, session] of sessions.entries()) {
    let checked: CheckedSession;
    try {
      checked = await bySitting[at]({ session, at, of: sessions.length, before, after, endless: carried });
    } catch (thrown) {
      // A build that throws here is a broken build rather than a bad run: a replay that stops
      // part-way is caught inside the build and comes back as a verdict of its own.
      return unverifiable(log, `The engine build ${shortCommit(session.engine)} stopped: ${whatStoppedIt(thrown)}`);
    }
    // A build kept from a commit older than the run journal hands back a sitting with none.
    verdict.journal.push(...(checked.journal ?? []));
    if (checked.totals !== null) verdict.replayed = checked.totals;
    if (checked.ending !== null) verdict.ending = checked.ending;
    if (checked.status !== 'verified') {
      verdict.status = checked.status;
      verdict.reason = checked.reason;
      return verdict;
    }
    before = checked.totals;
    after = checked.record;
    // A build kept from a commit older than this carries nothing between sittings, so what it
    // hands back is the record alone.
    carried = checked.endless ?? null;
  }
  verdict.status = 'verified';
  return verdict;
}

function whatStoppedIt(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/** The verdict as it stands before anything has been replayed: everything about a run that is
 *  read off its sittings rather than found by playing them again. */
function verdictOf(log: RunLog, build: string): RunVerdict {
  const newest = log.sessions[log.sessions.length - 1];
  return {
    status: 'unverifiable',
    reason: null,
    notes: [],
    game: newest.game,
    name: newest.name,
    mode: newest.mode,
    leaderboard: newest.leaderboard,
    sessions: log.sessions.length,
    engine: { played: [...new Set(log.sessions.map((session) => session.engine))], build },
    claimed: { actions: newest.actions, time: newest.time, milestones: [] },
    replayed: null,
    journal: [],
    ending: null,
  };
}

/** A verdict for a run that was never replayed at all, so that a run always has one to show. */
function unverifiable(log: RunLog, reason: string): RunVerdict {
  return { ...verdictOf(log, ''), reason };
}

async function keepVerdict(
  sql: Queries,
  characterId: string,
  verdict: RunVerdict,
  timing: RunTiming,
  eligible: boolean,
): Promise<void> {
  const totals = verdict.replayed ?? verdict.claimed;
  const journal = journalOf(verdict);
  // The game, the board and the numbers a board sorts on go here as well as being reachable
  // through the character's rows, the milestones and the journal, so that reading a board is one
  // table and no JSON. `server/boards.ts` is what they are for.
  await sql.query(
    `INSERT INTO verdicts (character_id, status, reason, actions, time, milestones, play_ms, timed,
                           eligible, game, leaderboard, deepest, level, kills, engine_commits,
                           journal, verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
     ON CONFLICT (character_id) DO UPDATE SET
       status = excluded.status, reason = excluded.reason, actions = excluded.actions,
       time = excluded.time, milestones = excluded.milestones, play_ms = excluded.play_ms,
       timed = excluded.timed, eligible = excluded.eligible, game = excluded.game,
       leaderboard = excluded.leaderboard, deepest = excluded.deepest, level = excluded.level,
       kills = excluded.kills, engine_commits = excluded.engine_commits, journal = excluded.journal,
       verified_at = excluded.verified_at`,
    [
      characterId,
      verdict.status,
      verdict.reason,
      totals.actions,
      totals.time,
      JSON.stringify(totals.milestones),
      timing.playMs,
      timing.timed,
      eligible,
      verdict.game,
      verdict.leaderboard,
      howFarItGot(verdict, totals.milestones, journal),
      highestLevel(totals.milestones),
      killsIn(journal),
      JSON.stringify(verdict.engine.played),
      JSON.stringify(journal),
    ],
  );
}

/**
 * How far a run got, as the board it stands on counts it.
 *
 * The endless dungeon is ranked by the deepest floor a run killed a Shadow monster on, and the
 * other two boards by the module or the dungeon the run reached. Both go in the one column: a
 * board asks how far a run got and reads the answer in its own currency, which is what
 * `server/boards.ts` decides.
 */
function howFarItGot(
  verdict: RunVerdict,
  milestones: readonly Milestone[],
  journal: readonly JournalEntry[],
): number {
  if (verdict.leaderboard === 'endless') return deepestShadowKilled(journal);
  return deepestReach(verdict.game, milestones);
}

/** The journal a verdict carries. A build kept from a commit older than the run journal hands
 *  back a verdict with none, which is a run with nothing to read rather than an error. */
function journalOf(verdict: RunVerdict): JournalEntry[] {
  return verdict.journal ?? [];
}

/** The verdict a run was given, or null when it has not been replayed. */
export async function verdictFor(sql: Queries, characterId: string): Promise<KeptVerdict | null> {
  const rows = await sql.query<{
    status: string;
    reason: string | null;
    actions: number;
    time: number;
    milestones: Milestone[];
    play_ms: number;
    timed: boolean;
    eligible: boolean;
    game: string;
    leaderboard: string | null;
    deepest: number;
    level: number;
    kills: number;
    engine_commits: string[];
    journal: JournalEntry[] | null;
    verified_at: Date;
  }>('SELECT * FROM verdicts WHERE character_id = $1', [characterId]);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    status: row.status,
    reason: row.reason,
    actions: row.actions,
    time: row.time,
    milestones: row.milestones,
    playMs: row.play_ms,
    timed: row.timed,
    eligible: row.eligible,
    game: row.game,
    leaderboard: row.leaderboard,
    deepest: row.deepest,
    level: row.level,
    kills: row.kills,
    engines: row.engine_commits,
    // A verdict written before this server kept journals has none.
    journal: row.journal ?? [],
    verifiedAt: row.verified_at.toISOString(),
  };
}

/**
 * How long a snapshot of a character still being played stands before its chain is worth
 * replaying again.
 *
 * A replay is the engine playing the whole run through from its first key, and it manages about
 * eight hundred keys a second: an hour at the game is a few thousand keys and replays in seconds,
 * while a chain played all day takes a minute. Doing that after every five-second batch would
 * leave the server time for nothing else, so a chain is replayed again at most this often --
 * unless the site claims the character has reached something a board of the living shows, which
 * is worth going for at once.
 *
 * Replays are done one at a time, so a chain long enough to take longer than this only keeps the
 * line busy rather than piling replays on top of each other, and the board says when each
 * character was last heard from.
 */
export const REPLAY_LIVING_AFTER_MS = 2 * 60 * 1000;

/** What a replay of a character's chain reached, while that character was still being played. */
export interface LivingSnapshot {
  /** How the replay came out, in the same three words a verdict uses. Only a verified snapshot
   *  stands on a board of the living. */
  status: string;
  reason: string | null;
  level: number;
  deepest: number;
  actions: number;
  time: number;
  /** The run so far written up in words by the replay, which is what a still-going run's page
   *  shows as its timeline. */
  journal: JournalEntry[];
  /** The id of the last batch the replay took in. */
  replayedThrough: number;
  replayedAt: string;
}

/** The snapshot a character's chain last came to, or null when it has never been replayed. */
export async function livingSnapshotFor(sql: Queries, characterId: string): Promise<LivingSnapshot | null> {
  const rows = await sql.query<{
    status: string;
    reason: string | null;
    level: number;
    deepest: number;
    actions: number;
    time: number;
    journal: JournalEntry[] | null;
    replayed_through: number;
    replayed_at: Date;
  }>('SELECT * FROM living WHERE character_id = $1', [characterId]);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    status: row.status,
    reason: row.reason,
    level: row.level,
    deepest: row.deepest,
    actions: row.actions,
    time: row.time,
    // A snapshot written before this server kept journals has none.
    journal: row.journal ?? [],
    replayedThrough: row.replayed_through,
    replayedAt: row.replayed_at.toISOString(),
  };
}

/**
 * Replay the chain a character has played so far and write down what it came to, where that is
 * worth doing.
 *
 * What comes back is the snapshot that stands afterwards, which is the one already kept when
 * nothing had changed enough to replay for. Null is for a character there is no board of the
 * living for at all: one whose run has ended is `verifyKeptRun`'s, and one rolled for no board or
 * played in debug is ranked against nothing.
 */
export async function snapshotLivingRun(
  sql: Queries,
  engines: EngineStore,
  characterId: string,
  now: number,
): Promise<LivingSnapshot | null> {
  if (!(await stillBeingPlayed(sql, characterId))) return null;
  const sessions = await sessionsOf(sql, characterId);
  if (sessions.length === 0 || !forTheBoards(sessions[sessions.length - 1])) return null;
  const held = await livingSnapshotFor(sql, characterId);
  const batches = await batchesOf(sql, characterId);
  const newest = batches[batches.length - 1]?.id ?? 0;
  if (!worthReplaying(held, newest, claimedReach(sessions), now)) return held;
  return keepLivingSnapshot(sql, characterId, await replayChain(engines, runLogFrom(sessions, batches)), newest, now);
}

/**
 * Whether the character's run is still going.
 *
 * A run that has ended has a verdict of its own and is on no board of the living, so replaying
 * its chain again would be a long piece of work for an answer nobody reads.
 */
async function stillBeingPlayed(sql: Queries, characterId: string): Promise<boolean> {
  const rows = await sql.query<{ finished_at: Date | null }>('SELECT finished_at FROM characters WHERE id = $1', [
    characterId,
  ]);
  return rows[0]?.finished_at === null;
}

/** How far up and how far down a character has got, which is what a board of the living ranks
 *  by. */
interface Reach {
  level: number;
  /** Null where the site claims nothing this board could read as a depth. */
  deepest: number | null;
}

/**
 * What the site claims the character has reached over its whole run. Each sitting claims the
 * milestones reached in that sitting, so the run's are all of them together.
 *
 * An endless run's depth is the deepest floor it killed a Shadow monster on, which is in the
 * journal a replay writes and in nothing a sitting claims, so such a character claims no depth at
 * all and its chain is replayed again on the level or on the clock alone.
 */
function claimedReach(sessions: readonly KeptSession[]): Reach {
  const newest = sessions[sessions.length - 1];
  const milestones = sessions.flatMap((session) => session.milestones);
  return {
    level: highestLevel(milestones),
    deepest: newest.leaderboard === 'endless' ? null : deepestReach(newest.game, milestones),
  };
}

/**
 * Whether a character's chain is worth replaying again.
 *
 * A batch has to have arrived past the one the snapshot took in, or nothing has been played since
 * and the replay would reach exactly what is already written down. Beyond that there are two
 * reasons to go: the site claims a level or a depth past the one the last replay found, which is
 * the only kind of change a board of the living shows; or the snapshot is old enough that its
 * numbers are no longer a picture of now.
 *
 * The claims are a reason to look and never what goes on the board -- what the board shows is
 * what the replay reached. They are not read at all where the last replay did not come out
 * verified: such a character is off the board whatever the site says about it, so there is
 * nothing to hurry for and the two minutes are soon enough.
 */
function worthReplaying(held: LivingSnapshot | null, newest: number, claimed: Reach, now: number): boolean {
  if (held === null) return true;
  if (newest <= held.replayedThrough) return false;
  if (now - Date.parse(held.replayedAt) >= REPLAY_LIVING_AFTER_MS) return true;
  if (held.status !== 'verified') return false;
  return claimed.level > held.level || (claimed.deepest !== null && claimed.deepest > held.deepest);
}

async function keepLivingSnapshot(
  sql: Queries,
  characterId: string,
  verdict: RunVerdict,
  replayedThrough: number,
  now: number,
): Promise<LivingSnapshot> {
  const totals = verdict.replayed ?? verdict.claimed;
  const journal = journalOf(verdict);
  await sql.query(
    `INSERT INTO living (character_id, status, reason, level, deepest, actions, time, game,
                         leaderboard, journal, replayed_through, replayed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, to_timestamp($12::double precision / 1000.0))
     ON CONFLICT (character_id) DO UPDATE SET
       status = excluded.status, reason = excluded.reason, level = excluded.level,
       deepest = excluded.deepest, actions = excluded.actions, time = excluded.time,
       game = excluded.game, leaderboard = excluded.leaderboard, journal = excluded.journal,
       replayed_through = excluded.replayed_through, replayed_at = excluded.replayed_at`,
    [
      characterId,
      verdict.status,
      verdict.reason,
      highestLevel(totals.milestones),
      howFarItGot(verdict, totals.milestones, journal),
      totals.actions,
      totals.time,
      verdict.game,
      verdict.leaderboard,
      JSON.stringify(journal),
      replayedThrough,
      now,
    ],
  );
  return (await livingSnapshotFor(sql, characterId)) as LivingSnapshot;
}

/** Runs waiting to be replayed, one at a time, off the request that ended them. */
export interface RunVerifier {
  /** Put this character's ended run in line to be judged. */
  verifySoon(characterId: string): void;
  /** Put this character in line to have the chain it has played so far replayed, so that a board
   *  of the living can say where it stands. */
  snapshotSoon(characterId: string): void;
  /** Settles when everything in line when it was called has been replayed. */
  idle(): Promise<void>;
}

/**
 * The line runs are replayed in.
 *
 * A long run takes seconds to replay, and the browser sending the batch that put it here is
 * waiting on an answer, so the answer goes first and the replay happens behind it. One at a time,
 * because a replay is the whole engine running as fast as it can and two at once would only make
 * both slow -- which is also why the boards of the living share this line rather than keeping one
 * of their own.
 *
 * `announced` is handed everything a checked run had to say, which is how the feed hears about a
 * run whose last batch was answered seconds before the replay finished.
 */
export function createRunVerifier(
  sql: Queries,
  engines: EngineStore,
  announced: (announcements: Announcement[]) => void,
): RunVerifier {
  let line: Promise<void> = Promise.resolve();
  const waiting = new Set<string>();

  /** One piece of work behind everything already in line, and never the same piece twice over:
   *  what it is called is both what it is waiting under and what a failure is reported as. */
  function inLine(what: string, work: () => Promise<void>): void {
    if (waiting.has(what)) return;
    waiting.add(what);
    line = line.then(async () => {
      waiting.delete(what);
      try {
        await work();
      } catch (thrown) {
        console.error(`${what} failed:`, thrown);
      }
    });
  }

  return {
    verifySoon(characterId: string): void {
      inLine(`Replaying the run of ${characterId}`, async () => {
        announced(await verifyKeptRun(sql, engines, characterId));
      });
    },
    snapshotSoon(characterId: string): void {
      inLine(`Replaying the chain ${characterId} has played so far`, async () => {
        await snapshotLivingRun(sql, engines, characterId, Date.now());
      });
    },
    idle(): Promise<void> {
      return line;
    },
  };
}
