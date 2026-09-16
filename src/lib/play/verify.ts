import type { Leaderboard } from '../app-state.svelte';
import type { JournalEntry } from './journal';
import { bytesFromBase64, sameBytes } from '../bytes';
import type { KeptEndlessState } from '../game/endless/state';
import { isLeaderboard } from '../character/leaderboard';
import {
  actionWords,
  ENGINE_COMMIT,
  isRunGame,
  milestoneWords,
  replayRun,
  RUN_GAMES,
  RUN_LOG_VERSION,
  runLogOf,
  runTotals,
  type Milestone,
  type MilestoneKind,
  type RunGame,
  type RunLog,
  type RunReplay,
  type RunSession,
  type RunTotals,
} from './run';

/**
 * Checking a run: play its log through the engine again and say whether it arrives where the log
 * says it did.
 *
 * A log is a claim — this character, from this record, with this seed and these keys, spent this
 * many actions and reached this. `replayRun` in `run.ts` makes the claim checkable; this puts a
 * verdict on what comes back, and `src/cli/verify-run.ts` is the command that prints one.
 *
 * Every run gets a verdict, including one the engine could not play at all: a replay that throws
 * is caught here and reported as one that cannot be checked, rather than being left to come out
 * as a stack trace over the verdict.
 *
 * Nothing here knows which games there are: a game is a line in `RUN_GAMES`, and everything this
 * needs of one it asks that line for. Nothing here draws either, so it runs under Node.
 */

/** How a run came out of being checked. */
export type RunStatus = 'verified' | 'failed' | 'unverifiable';

/** Where the replay ended, which is what a run amounts to. */
export interface RunEnding {
  place: { x: number; y: number; floor: number; dungeon: number; dir: number };
  /** The loop came back: the character quit or died. */
  over: boolean;
  alive: boolean;
  /** The run reached the end of the game, in this session or one before it. */
  won: boolean;
  /** SHA-256 of the record the run ended with, in hex, so that two runs claiming to end with the
   *  same character can be told apart without the records themselves. */
  record: string;
}

/** What checking a run says about it. */
export interface RunVerdict {
  status: RunStatus;
  /** Why the run failed, or why it cannot be checked at all; null when it is verified. */
  reason: string | null;
  /** What is worth saying about a run that is not a reason to doubt it by itself. */
  notes: string[];
  game: RunGame;
  /** The character's name and the mode it was last played in, from the newest session of the
   *  chain. */
  name: string;
  mode: string | null;
  /** The board the character was rolled for, and null for a run played for its own sake. */
  leaderboard: Leaderboard | null;
  /** How many sittings the run was played in. */
  sessions: number;
  /** The commits the sessions say they were played on, oldest first and each named once, and the
   *  one this build was made from. A chain played over weeks names as many engines as it was
   *  played on. */
  engine: { played: string[]; build: string };
  /** What the log claims the whole run came to. */
  claimed: RunTotals;
  /** What the replays reached, as far as they got, or null when there was none to run. */
  replayed: RunTotals | null;
  /**
   * The run written up in words, as the replays wrote it, oldest session first.
   *
   * It is what the run was rather than whether it is honest, and it is the replay's rather than
   * the log's: the log carries no journal, and a replay writing the same one is the point of
   * keeping it out of the log. It is empty for a game whose journal has not been written yet,
   * and for a verdict reached without a replay having been run at all.
   */
  journal: JournalEntry[];
  /** Where the last replayed session ended. */
  ending: RunEnding | null;
}

/**
 * One session of a chain and what it takes to judge it: where it comes in the chain, what the run
 * had come to before it, and the record and the carried state the session before it ended with.
 */
export interface SessionInChain {
  session: RunSession;
  /** Where the session comes in the chain, counting from zero. */
  at: number;
  /** How many sessions the chain has, which is what decides whether a reason names a session at
   *  all: a run played in one sitting has none to name. */
  of: number;
  /** What the run had come to in the sessions before this one, which this session's own numbers
   *  count on from. */
  before: RunTotals;
  /** The record the replay of the session before this one ended with, and null for the first
   *  session of a chain, which starts from whatever the character was rolled as. */
  after: Uint8Array | null;
  /**
   * What an endless character was carrying beside that record — the trap door keys, the Shadows
   * and the hit points the record has no room for — and null for the first session of a chain and
   * for every session of a character playing the game as it shipped.
   *
   * It is threaded the way the record is, and for the same reason: a key found below floor 179 in
   * one sitting is a key the character still holds in the next, and a replay that started without
   * it would walk into a trap door it could not open.
   */
  endless: KeptEndlessState | null;
}

/** What replaying one session of a chain came to. */
export type CheckedSession =
  | {
      status: 'verified';
      reason: null;
      /** What the run has come to including this session. */
      totals: RunTotals;
      /** This session written up in words, as the replay wrote it. */
      journal: JournalEntry[];
      ending: RunEnding;
      /** The record the replay ended with, which the next session of the chain has to start
       *  from. */
      record: Uint8Array;
      /** What the character was carrying beside that record, which the next session of the chain
       *  starts carrying. */
      endless: KeptEndlessState | null;
    }
  | {
      status: 'failed' | 'unverifiable';
      reason: string;
      /** What the replay reached before the session was refused, or null when it never ran. */
      totals: RunTotals | null;
      /** What the replay wrote before it was refused, and nothing when it never ran. */
      journal: JournalEntry[];
      ending: RunEnding | null;
      record: null;
    };

/**
 * Replay one session of a chain and judge it: does it reach what it claims, and does it start
 * from the record the replay of the session before it ended with.
 *
 * Both of those are here rather than in the loop below so that everything that walks a chain
 * judges a session the same way. The run server is the other caller: it keeps an engine build per
 * commit and replays each session of a chain with the build that session was played on, so it
 * walks the chain itself and only the judging is shared.
 */
export async function verifySession(chain: SessionInChain): Promise<CheckedSession> {
  const { session, at, of, before, after, endless } = chain;
  if (session.edits > 0) {
    return refusedSession('unverifiable', `${whichSession(of, at)}${recordWrittenFromOutside(session.edits)}`);
  }
  if (after !== null && !sameBytes(bytesFromBase64(session.record), after)) {
    return refusedSession('failed', `Session ${at + 1} does not start from the record session ${at} ended with.`);
  }
  let replay: RunReplay;
  try {
    replay = await replayRun(session, { ...before }, endless);
  } catch (thrown) {
    // A replay that stopped part-way says nothing about the run either way: the log may be an
    // honest one and the engine may be what broke. So the verdict is that it cannot be checked,
    // with the message it stopped on, rather than a failure the run is blamed for.
    const stopped = thrown instanceof Error ? thrown.message : String(thrown);
    return refusedSession('unverifiable', `${whichSession(of, at)}The replay stopped: ${stopped}`);
  }
  const totals: RunTotals = {
    actions: replay.actions,
    time: replay.time,
    milestones: [...before.milestones, ...replay.milestones],
  };
  const ending: RunEnding = {
    place: replay.place,
    over: replay.over,
    alive: !replay.dead,
    // The end of the game is reached once, in whichever session reached it, and the run has been
    // won from then on.
    won: totals.milestones.some((milestone) => milestone.kind === 'win'),
    record: await recordHash(replay.record),
  };
  const mismatch = firstMismatch(session, replay);
  if (mismatch !== null) {
    const reason = `${whichSession(of, at)}${mismatch}`;
    return { status: 'failed', reason, totals, journal: replay.journal, ending, record: null };
  }
  return {
    status: 'verified',
    reason: null,
    totals,
    journal: replay.journal,
    ending,
    record: replay.record,
    endless: replay.endless,
  };
}

/** A session nothing was learned from, since the replay either never ran or stopped. */
function refusedSession(status: 'failed' | 'unverifiable', reason: string): CheckedSession {
  return { status, reason, totals: null, journal: [], ending: null, record: null };
}

/** A record written into the character from outside the game leaves a replay nothing to put the
 *  character back into, since those records are not in the log. */
function recordWrittenFromOutside(edits: number): string {
  return `The character's record was written from outside the game ${timesWords(edits)} while the run was played, and those records are not in the log.`;
}

/**
 * Play a run log again and say whether it is what it claims to be.
 *
 * The log is a chain of sessions, and each of them is replayed from the record it says it began
 * with, counting on from what the sessions before it came to. Two things have to hold for the
 * chain: every session has to reach what it claims, and every session has to start from the
 * record the replay of the one before it ended with, carrying what that replay was carrying
 * beside it. The second is what stops a run being padded
 * with a session of a character somebody else played, or with the same session twice. Both are
 * {@link verifySession}; this walks the chain and puts a verdict on the whole run.
 *
 * An engine that is not this build's is a note rather than a failure: the two may well agree, and
 * a replay that then reproduces the run says they did. It is only worth reading as an excuse when
 * the replay diverges, which is why it is kept beside the verdict rather than folded into it. An
 * engine whose commit ends in `-dirty` gets a note of its own even where the two strings are the
 * same, since neither of them names the code it was built from.
 */
export async function verifyRun(log: RunLog): Promise<RunVerdict> {
  const sessions = log.sessions;
  const newest = sessions[sessions.length - 1];
  const verdict: RunVerdict = {
    status: 'unverifiable',
    reason: null,
    notes: [],
    game: newest.game,
    name: newest.name,
    mode: newest.mode,
    leaderboard: newest.leaderboard ?? null,
    sessions: sessions.length,
    engine: { played: enginesPlayedOn(sessions), build: ENGINE_COMMIT },
    claimed: runTotals(sessions),
    replayed: null,
    journal: [],
    ending: null,
  };
  for (const engine of verdict.engine.played) {
    const note = whatToSayAboutTheEngine(engine, ENGINE_COMMIT);
    if (note !== null && !verdict.notes.includes(note)) verdict.notes.push(note);
  }
  const journal = verdict.journal;
  let before: RunTotals = { actions: 0, time: 0, milestones: [] };
  let after: Uint8Array | null = null;
  let carried: KeptEndlessState | null = null;
  for (const [at, session] of sessions.entries()) {
    const checked = await verifySession({ session, at, of: sessions.length, before, after, endless: carried });
    journal.push(...checked.journal);
    if (checked.totals !== null) verdict.replayed = checked.totals;
    if (checked.ending !== null) verdict.ending = checked.ending;
    if (checked.status !== 'verified') {
      verdict.status = checked.status;
      verdict.reason = checked.reason;
      return verdict;
    }
    before = checked.totals;
    after = checked.record;
    carried = checked.endless;
  }
  verdict.status = 'verified';
  return verdict;
}

/** Every engine the sessions of a run were played on, oldest first and each named once. */
function enginesPlayedOn(sessions: readonly RunSession[]): string[] {
  return [...new Set(sessions.map((session) => session.engine))];
}

/** Which session of the chain something is being said about, for a run played in more than one
 *  sitting. A run played in one sitting has no session to name. */
function whichSession(sessions: number, at: number): string {
  return sessions === 1 ? '' : `Session ${at + 1}: `;
}

/**
 * What is worth saying about the engine a run was played on, or null when there is nothing: the
 * log names this build's own commit, and that commit names the code it was built from.
 *
 * A commit with `-dirty` on it names no code at all. The tree it was built from had changes in it
 * that nobody handed the run log can get back, so two dirty engines are not shown to be the same
 * engine by their strings matching, and the run is replayed here with that said out loud.
 */
export function whatToSayAboutTheEngine(logEngine: string, buildEngine: string): string | null {
  if (logEngine !== buildEngine) {
    return 'The run was played on an engine other than this build, so a replay is only as good as the two agreeing.';
  }
  if (logEngine.endsWith('-dirty')) {
    return 'The run was played on an engine built from a working tree with changes in it, which the commit does not name, so this build cannot be shown to be that same engine.';
  }
  // vite.config.ts writes `unknown` when there is no git to ask, so two such builds have no
  // commit in common to be the same engine by.
  if (logEngine === 'unknown') {
    return 'The run was played on an engine built where no commit could be read, so this build cannot be shown to be that same engine.';
  }
  return null;
}

/**
 * The first thing the replay of a session did not reproduce, in words, or null when it reproduced
 * all of it. The milestones are compared one by one and in order, since a run is a sequence
 * rather than a bag: reaching the same things in another order is another run.
 */
function firstMismatch(session: RunSession, replayed: RunTotals): string | null {
  if (replayed.actions !== session.actions) {
    return `The replay spent ${actionWords(replayed.actions)} and the log claims ${actionWords(session.actions)}.`;
  }
  const clockWords = RUN_GAMES[session.game].clockWords;
  if (replayed.time !== session.time) {
    return `The replay's clock reached ${clockWords(replayed.time)} and the log claims ${clockWords(session.time)}.`;
  }
  const reach = Math.max(session.milestones.length, replayed.milestones.length);
  for (let at = 0; at < reach; at++) {
    const claimed = session.milestones[at];
    const reached = replayed.milestones[at];
    if (claimed === undefined) {
      return `The replay reached ${milestoneLine(session.game, reached)}, which the log does not claim.`;
    }
    if (reached === undefined) {
      return `The replay never reached ${milestoneLine(session.game, claimed)}, which the log claims.`;
    }
    if (!sameMilestone(claimed, reached)) {
      return `The log's milestone ${at + 1} is ${milestoneLine(session.game, claimed)}, and the replay reached ${milestoneLine(session.game, reached)}.`;
    }
  }
  return null;
}

function sameMilestone(one: Milestone, other: Milestone): boolean {
  return (
    one.kind === other.kind &&
    one.which === other.which &&
    one.actions === other.actions &&
    one.time === other.time &&
    one.floor === other.floor
  );
}

/** A milestone and everywhere it happened, in one phrase a sentence can hold. */
export function milestoneLine(game: RunGame, milestone: Milestone): string {
  const { clockWords, dungeonName } = RUN_GAMES[game];
  const where = milestone.floor === 0 ? 'in the town' : `on floor ${milestone.floor}`;
  return `${milestoneWords(milestone, dungeonName)} ${where} after ${actionWords(milestone.actions)} and ${clockWords(milestone.time)}`;
}

/** "once", "twice", "5 times". */
function timesWords(times: number): string {
  if (times === 1) return 'once';
  if (times === 2) return 'twice';
  return `${times} times`;
}

/** SHA-256 in hex, which Node and a browser both have without anything installed. */
async function recordHash(record: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', record.slice());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * A run log out of the text of a file, or null when the text is not one this build reads: not
 * JSON, not the shape of a log, a log of another version, or a game this build has no engine for.
 */
export function readRunLog(text: string): RunLog | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (isRunLog(parsed)) return parsed;
  return isOneSessionLog(parsed) ? runLogOf([parsed]) : null;
}

function isRunLog(value: unknown): value is RunLog {
  if (typeof value !== 'object' || value === null) return false;
  const log = value as Record<string, unknown>;
  return (
    log.version === RUN_LOG_VERSION &&
    Array.isArray(log.sessions) &&
    // A run nobody has played is no run: there is nothing in it to check.
    log.sessions.length > 0 &&
    log.sessions.every(isRunSession)
  );
}

/**
 * The version a log had when it held one sitting at a game and called that the whole run, which
 * is what every log written before MORF-359 is. Such a log reads as a chain of one session.
 */
const ONE_SESSION_LOG_VERSION = 2;

function isOneSessionLog(value: unknown): value is RunSession {
  if (typeof value !== 'object' || value === null) return false;
  return (value as Record<string, unknown>).version === ONE_SESSION_LOG_VERSION && isRunSession(value);
}

/** Whether a value out of a file is one sitting at a game, written down the way this build
 *  writes one. */
export function isRunSession(value: unknown): value is RunSession {
  if (typeof value !== 'object' || value === null) return false;
  const session = value as Record<string, unknown>;
  return (
    isRunGame(session.game) &&
    typeof session.engine === 'string' &&
    typeof session.name === 'string' &&
    (session.mode === null || typeof session.mode === 'string') &&
    // A log written before the site had leaderboards has no field, and reads as no board.
    (session.leaderboard === null || session.leaderboard === undefined || isLeaderboard(session.leaderboard)) &&
    // A log written before the sound flag was recorded simply has no field, and reads as null.
    (session.sound === null || session.sound === undefined || typeof session.sound === 'boolean') &&
    typeof session.startedAt === 'string' &&
    typeof session.seed === 'number' &&
    // A log written before the endless world was recorded has no field, and reads as the first
    // world, which is the only one there was then.
    (session.worldSeed === null || session.worldSeed === undefined || typeof session.worldSeed === 'number') &&
    typeof session.record === 'string' &&
    typeof session.actions === 'number' &&
    typeof session.time === 'number' &&
    typeof session.edits === 'number' &&
    Array.isArray(session.inputs) &&
    session.inputs.every((input) => typeof input === 'number') &&
    Array.isArray(session.milestones) &&
    session.milestones.every(isMilestone)
  );
}

const MILESTONE_KINDS: MilestoneKind[] = ['boss', 'level', 'dungeon', 'floor', 'death', 'win'];

function isMilestone(value: unknown): value is Milestone {
  if (typeof value !== 'object' || value === null) return false;
  const milestone = value as Record<string, unknown>;
  return (
    typeof milestone.kind === 'string' &&
    MILESTONE_KINDS.includes(milestone.kind as MilestoneKind) &&
    typeof milestone.which === 'number' &&
    typeof milestone.actions === 'number' &&
    typeof milestone.time === 'number' &&
    typeof milestone.floor === 'number'
  );
}
