import type { Leaderboard, PortedGameId } from '../app-state.svelte';
import { base64FromBytes, bytesFromBase64 } from '../bytes';
import { isActionKind } from '../game/action';
import { BorlandRng, SeededRng, type Rng } from '../game/port/rng';
import { MORAFFS_REVENGE_MAP, MORAFFS_WORLD_MAP, UNFORGIVEN_MAP } from '../map/game';
import { runMoveControl, startGame, type CharacterFile } from './engine';
import { journalEntry, unforgivenJournal, type JournalEntry, type JournalWords } from './journal';
import { runPlayLoop, type PlayLoopSession } from './loop';
import { runMwMoveControl, startMwGame, type MwCharacterFile } from './mw/engine';
import { moraffsWorldJournal } from './mw/journal';
import { mwTurn } from './mw/keys';
import { REV_CLOCK_TICK, runRevDungeon, startRevGame, type RevCharacterFile } from './rev/engine';
import { moraffsRevengeJournal } from './rev/journal';

/**
 * The run log: everything a character has played here, written down as it is played.
 *
 * Two of the three games are turn based and every random number they draw comes from one
 * generator, so one sitting at a game is completely described by three things — the character's
 * record as play began, the seed the generator was started from, and the keys that were pressed,
 * in order. Moraff's Revenge is not turn based, and the answer is the same shape: the ticks of
 * the clock its monsters move on are written into the log as inputs of their own, so a replay
 * makes the same number of them in the same places and needs no clock. A game of Dungeons of the
 * Unforgiven played on the clock, which reseeds from the machine's tick counter the way the
 * original does, answers it the same way again: what the counter read is written into the log
 * ahead of the input it was read for ({@link CLOCK_TICK_INPUT}), and the wall-clock second the
 * sitting began in goes in once at the top ({@link CLOCK_SECOND_INPUT}), since three of the
 * game's reseeds take the second rather than the tick. Running the same engine over the lot again
 * reproduces the whole game, which is what lets a claimed ending be checked rather than believed.
 * `replayRun` is the check.
 *
 * A character is played more than once, and its run is all of those sittings: a chain of
 * sessions, each starting from the record the one before it left behind, with the count of
 * actions and the game's own clock running on through the lot. That is what a run log holds and
 * what a verdict is passed on.
 *
 * Nothing here touches the browser: the log is built and replayed under Node just as it is in a
 * tab.
 */

/** The shape of the log itself. A reader that does not know this number should not trust what it
 *  finds. */
export const RUN_LOG_VERSION = 3;

/** Which of the playable games a run was played in. */
export type RunGame = PortedGameId;

/**
 * The commit the engine was built from, which `vite.config.ts` puts here with `git rev-parse
 * HEAD` at build time and vitest puts here the same way. A replay has to run the engine that
 * produced the run, and this is what says which one that was.
 */
export const ENGINE_COMMIT: string =
  typeof __ENGINE_COMMIT__ === 'string' ? __ENGINE_COMMIT__ : 'unknown';

/**
 * Not keys: Moraff's World has no key that turns the character without stepping, so a game played
 * with Dungeons of the Unforgiven's arrows turns them outside the loop (`mwTurn` in
 * `mw/keys.ts`). The log keeps each of those turns as an input of its own, by the facing it
 * leaves — 0 north, 1 south, 2 west, 3 east — so a replay makes the same turns in the same
 * places. Both games' keys are well inside -0x100 to 0xff, so nothing collides.
 */
export const TURN_INPUTS = [-0x101, -0x102, -0x103, -0x104];

/** Which facing a turn input asks for, or -1 for an input that is an ordinary key. */
export function turnedTo(input: number): number {
  return TURN_INPUTS.indexOf(input);
}

/** How many times a second the PC's tick counter counts (exe 1000:11b4). */
export const TICKS_A_SECOND = 18.2;

/**
 * Not a key: what the PC's tick counter read at the moment the input after it was made, which a
 * run played on the clock writes down ahead of every one of its inputs.
 *
 * Dungeons of the Unforgiven reseeds its generator from that counter before a swing, so what the
 * swing rolls is the reading rather than the next number of any sequence (section 8 of
 * `dotu-tools/docs/UNFORGIVEN-RE-NOTES.md`). A replay has to roll off the readings the player's
 * swings rolled off, so the readings are in the log, the way Moraff's Revenge keeps the ticks its
 * monsters move on ({@link REV_CLOCK_TICK}).
 *
 * A reading carries a number, which is how far below this the input sits: the counter is counted
 * from the start of the sitting, so a reading is never negative and the inputs it writes are
 * never above this. Keys are well inside -0x100 to 0xff, the turn inputs above are at -0x101 to
 * -0x104 and Moraff's Revenge's clock tick is -0x202, so an input at or below this is a reading
 * and nothing else.
 */
export const CLOCK_TICK_INPUT = -0x1000;

/** One reading of the tick counter, as the log holds it. */
export function clockTickInput(tick: number): number {
  return CLOCK_TICK_INPUT - tick;
}

/** The tick an input is a reading of, or -1 for an input the game was really given. */
export function tickRead(input: number): number {
  return input <= CLOCK_TICK_INPUT ? CLOCK_TICK_INPUT - input : -1;
}

/**
 * Not a key: the wall-clock second the sitting began, which a run played on the clock writes down
 * once, ahead of everything else in its log.
 *
 * Three of the game's reseeds take `time()` rather than the tick counter — the money a kill drops,
 * the character roller and the stocking of a floor — and `time()` only changes once a second, so
 * two kills in the same second drop the same money. A sitting reads the wall clock once and works
 * the rest out from the tick counter, which is what {@link RunRecorder.gameSeconds} does, and this
 * is the one reading a replay needs to arrive at the same seconds.
 *
 * A reading carries the second above this. Seconds since 1970 are in the billions, and every key
 * of the two games is between -0x100 and 0xff, so an input at or above this is the second the
 * sitting began and nothing else.
 */
export const CLOCK_SECOND_INPUT = 0x100;

/** The second a sitting began, as the log holds it. */
export function clockSecondInput(second: number): number {
  return CLOCK_SECOND_INPUT + second;
}

/** The second an input is a reading of, or -1 for an input the game was really given. */
export function secondRead(input: number): number {
  return input >= CLOCK_SECOND_INPUT ? input - CLOCK_SECOND_INPUT : -1;
}

/** Whether an input of a log is a reading of a clock rather than something the game was given. */
export function isClockReading(input: number): boolean {
  return tickRead(input) >= 0 || secondRead(input) >= 0;
}

/**
 * The tick counter of the machine this sitting is being played on: how many 1/18.2 of a second
 * have gone by since the sitting began, from `performance.now()`.
 *
 * The original's counter is the BIOS one, which counts from the machine being switched on, less
 * the reading the game took as it started. Counting from the start of the sitting is what makes a
 * reading in a log mean something on its own — the 100th tick is the 100th tick of that sitting,
 * whenever the sitting was — and a reseed does the same thing to a swing wherever the number was
 * counted from.
 */
export function sittingClock(): () => number {
  const began = performance.now();
  return () => Math.floor(((performance.now() - began) * TICKS_A_SECOND) / 1000);
}

/** The wall-clock second a sitting begins in, which is the one `time()` reading its log keeps. */
export function sittingSecond(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * What a run is verified against: the handful of things that happened in it worth naming.
 *
 * A boss is a section's Shadow boss in Dungeons of the Unforgiven (0 to 19) and one of the eight
 * quest bosses in Moraff's World (0 to 7); a level is the one the character woke on at the inn,
 * or bought at Moraff's Revenge's temple; a dungeon is the module or the dungeon the character
 * moved to; a floor is the deepest one a Moraff's Revenge character has reached, which is what
 * that game is measured by since it has only the one dungeon. A death and a win have nothing to
 * count, and `which` is 0 for them.
 */
export type MilestoneKind = 'boss' | 'level' | 'dungeon' | 'floor' | 'death' | 'win';

export interface Milestone {
  kind: MilestoneKind;
  /** Which boss, which level, which module or dungeon. */
  which: number;
  /** How many actions the run had spent by then. */
  actions: number;
  /** The game's own clock: the seconds call_check_eng counts in Dungeons of the Unforgiven, the
   *  moves spend_time counts in Moraff's World. */
  time: number;
  /** The floor the character was standing on. */
  floor: number;
}

/** Where the game had got to when a milestone was reached. */
export interface RunClock {
  time: number;
  floor: number;
  /** The module of Dungeons of the Unforgiven, or the dungeon of Moraff's World. */
  dungeon: number;
}

/**
 * The events either game's ported functions push that become milestones. Both `GameEvent` and
 * `MwEvent` carry these three, so a run reads them the same way whichever game it is.
 */
export type RunEvent =
  | { kind: 'bossKilled'; boss: number }
  | { kind: 'gameWon' }
  | { kind: 'levelGained'; level: number };

/** The same event, if it is one a run keeps. The events arrive as two unions this file does not
 *  import, and their three shared members are what it reads. */
function runEvent(event: { kind: string }): RunEvent | null {
  const kind = event.kind;
  if (kind !== 'bossKilled' && kind !== 'gameWon' && kind !== 'levelGained') return null;
  return event as RunEvent;
}

/**
 * What a run comes to: the numbers it is judged by, for one session of it or for the whole
 * chain.
 *
 * It is what the Play tab draws its run line from and what a verdict on a run holds twice over,
 * once for what the log claims and once for what the replay reached.
 */
export interface RunTotals {
  actions: number;
  /** The game's own clock: the seconds call_check_eng counts in Dungeons of the Unforgiven, the
   *  moves spend_time counts in Moraff's World, the ticks the monsters move on in Moraff's
   *  Revenge. */
  time: number;
  milestones: Milestone[];
}

/** "1 action", "12 actions": how much of a run has been spent. */
export function actionWords(actions: number): string {
  return `${actions} action${actions === 1 ? '' : 's'}`;
}

/**
 * The few words a milestone shows as. `dungeonName` is the game's own name for a module or a
 * dungeon, which `src/lib/map/game.ts` gives for each game.
 */
export function milestoneWords(milestone: Milestone, dungeonName: (dungeon: number) => string): string {
  if (milestone.kind === 'boss') return `Boss ${milestone.which + 1} beaten`;
  if (milestone.kind === 'level') return `Level ${milestone.which}`;
  if (milestone.kind === 'dungeon') return dungeonName(milestone.which);
  if (milestone.kind === 'floor') return `Floor ${milestone.which}`;
  return milestone.kind === 'win' ? 'Won' : 'Died';
}

/** Where in the run a milestone happened. `clock` is the game's own words for its time, such as
 *  "12 seconds" or "12 moves". */
export function milestoneNote(milestone: Milestone, clock: string): string {
  const where = milestone.floor === 0 ? 'in the town' : `on floor ${milestone.floor}`;
  return `After ${actionWords(milestone.actions)} and ${clock}, ${where}.`;
}

/** How many milestones the Play tab's run line has room to show one by one. */
export const MILESTONES_SHOWN = 4;

/**
 * A run's milestones split into the last few and everything before them.
 *
 * The milestones are the whole chain's rather than this sitting's, so a character played for
 * long enough has more of them than a line can hold. The newest are the ones worth reading, and
 * the line folds the rest away behind a count of them.
 */
export function lastMilestones(milestones: readonly Milestone[]): {
  earlier: Milestone[];
  shown: Milestone[];
} {
  return {
    earlier: milestones.slice(0, Math.max(0, milestones.length - MILESTONES_SHOWN)),
    shown: milestones.slice(-MILESTONES_SHOWN),
  };
}

/** One sitting at a game, played, as it is written down. */
export interface RunSession {
  /** The commit of the engine this session was played on. */
  engine: string;
  game: RunGame;
  /**
   * Which way the game was set up to be played, for a run to be compared with runs played the
   * same way. Null until the Play tab has a mode to name.
   */
  mode: string | null;
  /**
   * The board the character was rolled for, which is the mode it is locked to for life, and null
   * for a character played for its own sake and for a log written before the site had boards.
   *
   * A board is a set of runs played the same way, and this is what says a run belongs to one: the
   * mode beside it is only how this run happened to be set up, and a free character can be played
   * a different way tomorrow.
   */
  leaderboard: Leaderboard | null;
  /**
   * Whether the game's sound was on as play began, and null for a game with no such flag and for
   * a log written before this was recorded.
   *
   * Only Moraff's Revenge has one: DUNSMALL.EXE asks "Sound (Y or N)?" on the way in
   * (1000:0517), and the answer is the starting value of the flag the `O` key flips. Nothing a
   * replay arrives at turns on it — what the flag decides is whether a tune plays or the screen
   * is held for four seconds instead, and the clock's ticks are inputs of the log either way —
   * so it is here for the same reason the mode is: to say how the run was set up.
   */
  sound: boolean | null;
  /** The character's name, as the record held it when this session began. */
  name: string;
  /** When this session started, as an ISO 8601 instant. */
  startedAt: string;
  /** The seed this session's generator was started from. */
  seed: number;
  /** The character's record as this session began, base64. */
  record: string;
  /** Every input the game was given in this session, in order. */
  inputs: number[];
  /**
   * How many actions the whole run had spent by the end of this session, which is what a run is
   * judged by.
   *
   * It counts from the start of the chain rather than from this session, so that leaving the
   * game and playing the character again goes on from where the count stood.
   */
  actions: number;
  /** The game's own clock where the whole run had got to by the end of this session, counted
   *  from the start of the chain the same way the actions are. */
  time: number;
  /** What this session reached, oldest first, each stamped with the actions and the clock of the
   *  whole run. */
  milestones: Milestone[];
  /**
   * How many times a record written outside the game — the Save Editor's — reached the character
   * while this session was being played. A run with any cannot be checked: those records are not
   * in the log, so a replay has no way of putting the character back into them.
   */
  edits: number;
}

/** A seed of its own for every run, from the best randomness the platform has. */
function drawSeed(): number {
  const bits = new Uint32Array(1);
  crypto.getRandomValues(bits);
  return bits[0];
}

/** What a run is started with. Everything but the game and the record has a sensible default;
 *  a replay is what passes the rest. */
export interface RunStart {
  game: RunGame;
  name: string;
  /** The character's record as play begins. It is copied, so the game may write over it. */
  record: Uint8Array;
  seed?: number;
  startedAt?: string;
  mode?: string | null;
  /** The board the character is locked to, which the roster entry carries. */
  leaderboard?: Leaderboard | null;
  /** Whether the game starts with its sound on, for a game that has such a flag. */
  sound?: boolean | null;
  /**
   * What the character's run had come to before this session, which everything this session
   * counts goes on from. A character being played for the first time has none.
   */
  before?: RunTotals;
  /**
   * The inputs are coming from a log rather than from a player, so anything the engine would
   * otherwise make up for itself — Ctrl-F's own swings — is taken from the log instead.
   */
  replaying?: boolean;
  /**
   * The tick counter the run is played on, read before every input and written into the log
   * beside it, or null for a run played off the clock.
   *
   * A run played on the clock is one where the game reseeds from the counter the way the
   * original does, which is what `Game.clock` decides for a game
   * (`src/lib/game/port/state.ts`). {@link sittingClock} is the counter a sitting is played on;
   * a replay reads the log's own readings back instead, and a test scripts them.
   */
  tickCounter?: (() => number) | null;
  /**
   * The wall-clock second the sitting began, which the game's `time()` counts on from. It is only
   * read for a run played on the clock, and such a run writes it into its log
   * ({@link CLOCK_SECOND_INPUT}); a replay hands back the one the log holds, and a test scripts it.
   */
  startedSecond?: number;
}

/** What a run had come to before it had been played at all. */
function nothingYet(): RunTotals {
  return { actions: 0, time: 0, milestones: [] };
}

/**
 * A character's whole run as it is handed about: every session it has been played in, oldest
 * first.
 *
 * Each session starts from the record the one before it ended with, which is what makes the
 * chain checkable as a whole rather than a sitting at a time.
 */
export interface RunLog {
  version: number;
  sessions: RunSession[];
}

/** The sessions of a character's run, as the log that is written to a file. */
export function runLogOf(sessions: RunSession[]): RunLog {
  return { version: RUN_LOG_VERSION, sessions };
}

/**
 * What a character's run comes to over the sessions it has been played in.
 *
 * Every session counts its actions and its clock from the start of the chain, so the last of them
 * holds both totals; the milestones are each session's own, and the run's are all of them in the
 * order they were reached.
 */
export function runTotals(sessions: readonly RunSession[]): RunTotals {
  const last = sessions[sessions.length - 1];
  return {
    actions: last?.actions ?? 0,
    time: last?.time ?? 0,
    milestones: sessions.flatMap((session) => session.milestones),
  };
}

/**
 * One session being written down. The game session holds one and hands it every input it is
 * given, and `log()` is that session as it stands.
 */
export class RunRecorder {
  readonly game: RunGame;
  readonly name: string;
  readonly seed: number;
  readonly startedAt: string;
  /** How the game is being shown, which the Play tab moves while the game is being played. */
  mode: string | null;
  readonly leaderboard: Leaderboard | null;
  readonly sound: boolean | null;
  /** The run is being replayed from a log rather than played by anybody. */
  readonly replaying: boolean;
  /** The character's record as this session began. */
  readonly record: Uint8Array;
  /** What the run had come to before this session, which is what it goes on counting from. */
  readonly before: RunTotals;
  /**
   * The generator the game is played through, which is the seed and nothing else.
   *
   * A run played on the clock is rolled with Borland's own generator instead, because what the
   * original gets out of a reseed is that generator answering the tick counter: the same seed
   * put through anything else is another number.
   */
  readonly rng: Rng;
  readonly inputs: number[] = [];
  /**
   * How many of those inputs the player pressed.
   *
   * Not all of them are: a held Ctrl-F swings without the keyboard being read (`engine.ts`) and
   * Moraff's Revenge's clock ticks are inputs of the log as well (`rev/engine.ts`), and nobody
   * pressed either. The run server holds a run to a speed a person can play at, and it counts
   * this rather than the length of the log, which those two would swell.
   *
   * It is not part of the log and nothing about a replay depends on it: a replay makes the same
   * inputs whether or not anybody was sitting there.
   */
  presses = 0;
  /**
   * How many actions the run has spent, counting from the start of the chain.
   *
   * An action is a thing that happened to the character or to the world, which the games push
   * onto their event lists as they do it (`src/lib/game/action.ts`); this counts them as it
   * reads them. Fewest actions is the order a leaderboard puts runs in, so this is the number a
   * run is judged by.
   */
  actions: number;
  /** How many records written outside the game have reached the character in this session. */
  edits = 0;
  /** What this session has reached, oldest first. */
  readonly milestones: Milestone[] = [];
  /**
   * Everything that has happened in this session, in words, oldest first
   * (`journal.ts`).
   *
   * It is not part of the log: a replay of the log writes the same journal, so what is exported
   * stays the keys alone. What keeps it is the roster, beside the session it belongs to.
   */
  readonly entries: JournalEntry[] = [];

  /** The tick counter the run is played on, or null for a run played off the clock. */
  private readonly tickCounter: (() => number) | null;
  /** What the counter read before the input the game is handling now. */
  private lastTick = 0;
  /** The wall-clock second the sitting began, which the game's `time()` counts on from. */
  private readonly startedSecond: number;

  /** Where the game has got to, which stamps a milestone. Null until the session hands it over. */
  private clock: (() => RunClock) | null = null;
  /** The events the game's ported functions push, and how many of them have been read. */
  private events: readonly { kind: string }[] = [];
  private eventsRead = 0;
  /** The module or dungeon the character was last seen in, so that moving between them shows. */
  private dungeon = 0;
  /** The deepest floor the character has reached, which only Moraff's Revenge counts. */
  private deepest = 0;

  constructor(start: RunStart) {
    this.game = start.game;
    this.name = start.name;
    this.record = start.record.slice();
    this.seed = start.seed ?? drawSeed();
    this.startedAt = start.startedAt ?? new Date().toISOString();
    this.mode = start.mode ?? null;
    this.leaderboard = start.leaderboard ?? null;
    this.sound = start.sound ?? null;
    this.before = start.before ?? nothingYet();
    this.actions = this.before.actions;
    this.replaying = start.replaying ?? false;
    this.tickCounter = start.tickCounter ?? null;
    this.rng = this.tickCounter === null ? new SeededRng(this.seed) : new BorlandRng(this.seed);
    this.startedSecond = start.startedSecond ?? sittingSecond();
    // The floor the character wakes on is stocked before a key is ever pressed, so the reading
    // goes in as the log is opened rather than in front of the first input.
    if (this.tickCounter !== null) this.inputs.push(clockSecondInput(this.startedSecond));
  }

  /**
   * What `Game.clock` is handed for a run played on the clock, and null for one that is not,
   * which leaves the game drawing its own numbers.
   *
   * It answers the reading taken before the input the game is handling, and answers the same one
   * for everything that input does. The original reads the counter afresh at every reseed, and a
   * counter that moves 18.2 times a second has not moved between two reseeds of one key.
   */
  gameClock(): (() => number) | null {
    return this.tickCounter === null ? null : () => this.lastTick;
  }

  /**
   * What `Game.seconds` is handed for a run played on the clock, and null for one that is not.
   *
   * The original reads the DOS clock, which is the same clock the BIOS tick counter is driven
   * by; here the sitting's own counter is what says how far into the sitting an input is, so the
   * second is the one the sitting began in plus the ticks divided by 18.2. Both numbers are in
   * the log, so a replay answers the same seconds the sitting did.
   */
  gameSeconds(): (() => number) | null {
    if (this.tickCounter === null) return null;
    return () => this.startedSecond + Math.trunc(this.lastTick / TICKS_A_SECOND);
  }

  /**
   * The session hands over the events its ported functions push and the game's own clock, which
   * between them are where the milestones come from. Anything already pushed belongs to setting
   * the game up rather than to playing it.
   */
  watch(events: readonly { kind: string }[], clock: () => RunClock): void {
    this.events = events;
    this.eventsRead = events.length;
    this.clock = clock;
    this.dungeon = clock().dungeon;
    this.deepest = clock().floor;
  }

  /** A key on its way into the game, pressed by the player. */
  input(key: number): void {
    this.readTheClock();
    this.inputs.push(key);
    this.presses += 1;
  }

  /** An input the game made for itself rather than reading: Ctrl-F's own swings and Moraff's
   *  Revenge's clock ticks, which are in the log so that a replay makes the same ones. */
  unpressed(key: number): void {
    this.readTheClock();
    this.inputs.push(key);
  }

  /** Moraff's World's turn where the character stands, which is no key of the game's. It is an
   *  arrow the player pressed all the same. */
  turned(dir: number): void {
    this.readTheClock();
    this.inputs.push(TURN_INPUTS[dir]);
    this.presses += 1;
  }

  /**
   * The reading the tick counter takes before an input, which goes into the log ahead of that
   * input ({@link CLOCK_TICK_INPUT}). A run played off the clock takes none and its log holds
   * only the inputs.
   *
   * Nobody pressed a reading, so it is no part of {@link presses}: what that counts is the keys
   * a person really pressed.
   */
  private readTheClock(): void {
    if (this.tickCounter === null) return;
    this.lastTick = this.tickCounter();
    this.inputs.push(clockTickInput(this.lastTick));
  }

  /**
   * The loop has read a key and is about to hand it to its handler, which is where everything the
   * key before it did is written down.
   */
  dispatched(): void {
    this.note();
  }

  /** A record the Save Editor wrote has reached the character, which is the end of what this log
   *  describes: the log holds the record the run began with and nothing since. */
  edited(): void {
    this.edits += 1;
  }

  /** The character is dead, which is the end of the run. */
  died(): void {
    this.note();
    const now = this.clock?.();
    if (now) this.milestones.push({ kind: 'death', which: 0, actions: this.actions, time: this.time(), floor: now.floor });
  }

  /**
   * Everything the game has done since this was last asked, as milestones. It is asked before
   * every action, at a death and whenever the log is read, so nothing is left behind.
   */
  private note(): void {
    const clock = this.clock;
    if (clock === null) return;
    const arrived = this.events.slice(this.eventsRead);
    this.eventsRead = this.events.length;
    // The actions are counted before anything is stamped with the count, so that a milestone
    // reached by an action -- the module a step led to, the level a night at the inn handed over
    // -- is stamped with the run including it rather than as it stood a moment before.
    const words = RUN_GAMES[this.game].journal;
    const where = clock();
    for (const event of arrived) {
      if (isActionKind(event.kind)) this.actions += 1;
      if (words === undefined) continue;
      const entry = journalEntry(event, { at: this.actions, floor: where.floor, module: where.dungeon }, words);
      if (entry !== null) this.entries.push(entry);
    }
    const now = clock();
    const reach = (kind: MilestoneKind, which: number) =>
      this.milestones.push({ kind, which, actions: this.actions, time: this.time(), floor: now.floor });
    if (now.dungeon !== this.dungeon) {
      this.dungeon = now.dungeon;
      reach('dungeon', now.dungeon);
    }
    // Moraff's Revenge has one dungeon and seventy levels of it, so how deep a character got is
    // what a run of that game is measured by. The other two are measured by their modules and
    // dungeons and their logs are left as they were.
    if (this.game === 'revenge' && now.floor > this.deepest) {
      this.deepest = now.floor;
      reach('floor', now.floor);
    }
    for (const arrival of arrived) {
      const event = runEvent(arrival);
      if (event === null) continue;
      if (event.kind === 'bossKilled') reach('boss', event.boss);
      if (event.kind === 'levelGained') reach('level', event.level);
      if (event.kind === 'gameWon') reach('win', 0);
    }
  }

  /** The game's own clock, counting from the start of the chain the way the actions do. */
  private time(): number {
    return this.before.time + (this.clock?.().time ?? 0);
  }

  /**
   * How the whole run stands, which is what the Play tab draws: this session and every session
   * before it, since what a player wants to see is the character's count rather than this
   * sitting's.
   */
  summary(): RunTotals {
    this.note();
    return {
      actions: this.actions,
      time: this.time(),
      milestones: [...this.before.milestones, ...this.milestones].map((milestone) => ({ ...milestone })),
    };
  }

  /** Everything this session has done, in words, which is what the timeline reads and what a
   *  replay writes again. */
  journal(): JournalEntry[] {
    this.note();
    return [...this.entries];
  }

  /** This session alone, which is what a replay of it reproduces. Its actions and its clock are
   *  the whole run's, and its milestones are the ones reached in this sitting. */
  log(): RunSession {
    this.note();
    return {
      engine: ENGINE_COMMIT,
      game: this.game,
      mode: this.mode,
      leaderboard: this.leaderboard,
      sound: this.sound,
      name: this.name,
      startedAt: this.startedAt,
      seed: this.seed,
      record: base64FromBytes(this.record),
      inputs: [...this.inputs],
      actions: this.actions,
      time: this.time(),
      milestones: this.milestones.map((milestone) => ({ ...milestone })),
      edits: this.edits,
    };
  }
}

/** Where a session ended: what a claim about it is checked against. */
export interface RunReplay {
  /**
   * The record the game itself last wrote, which is the whole of what the character is.
   *
   * It is the same record the roster is left holding when a player walks away from a game, so
   * it is also what the next session of the chain has to start from for the chain to join up.
   */
  record: Uint8Array;
  place: { x: number; y: number; floor: number; dungeon: number; dir: number };
  /** The game's own clock, counting from the start of the chain. */
  time: number;
  /** How many actions the whole run had spent by the end of this session. */
  actions: number;
  /** What this session reached. */
  milestones: Milestone[];
  /** Everything the session did, in words, which is what a run is read as and what the summary
   *  is folded from. */
  journal: JournalEntry[];
  /** The loop came back: the character quit or died. */
  over: boolean;
  dead: boolean;
}

/**
 * What a run needs of the game it was played in: the loop that plays it again, the game's own
 * words for its clock, and its own name for a dungeon.
 *
 * A game with an entry in {@link RUN_GAMES} can be recorded, replayed and checked, and nothing
 * that does any of those three has to know which games there are.
 */
export interface RunGameEngine {
  replay(recorded: RunSession, run: RunRecorder): Promise<RunReplay>;
  /**
   * The game's own words for one of its events, for the run journal, and undefined for a game
   * whose journal has not been written yet: that game's runs keep their milestones and their
   * count and no journal at all.
   */
  journal?: JournalWords;
  /** "12 seconds" in Dungeons of the Unforgiven, "12 moves" in Moraff's World. */
  clockWords(time: number): string;
  /** The game's own name for one of its modules or dungeons. */
  dungeonName(dungeon: number): string;
  /** What the town is paid in: "300 rubles", "300 jewels", "300 jewel pieces". */
  moneyWords(amount: number): string;
  /** What the dungeon turns up, which in Dungeons of the Unforgiven is not the money the town is
   *  paid in. */
  foundMoneyWords(amount: number): string;
}

/**
 * Play a run session through the engine again and hand back where it ended.
 *
 * This is the check MORF-145 is for: a claimed ending is believed because the same engine, given
 * the same record, the same seed and the same keys, arrives at the same place. It runs under Node
 * as well as in a browser, since nothing here draws.
 *
 * `before` is what the character's run had come to in the sessions before this one, which is what
 * the session's own numbers count on from; a session played from a roll has none.
 *
 * The engine it runs is this build's. A session whose `engine` is not {@link ENGINE_COMMIT} was made
 * by another one and its ending is only as good as the two engines agreeing; the caller is what
 * compares them.
 */
export async function replayRun(recorded: RunSession, before?: RunTotals): Promise<RunReplay> {
  const record = bytesFromBase64(recorded.record);
  const run = new RunRecorder({
    game: recorded.game,
    name: recorded.name,
    record,
    seed: recorded.seed,
    startedAt: recorded.startedAt,
    mode: recorded.mode,
    leaderboard: recorded.leaderboard,
    sound: recorded.sound,
    before,
    replaying: true,
    tickCounter: countedTicks(recorded),
    startedSecond: recordedSecond(recorded),
  });
  return RUN_GAMES[recorded.game].replay(recorded, run);
}

/**
 * The tick counter a replay is played on: the readings the log holds, handed back in the order
 * they were taken.
 *
 * The run reads the counter before every input it writes down, whoever is making the inputs, so
 * a replay making the inputs the sitting made asks for the readings the sitting took, one for
 * one. Null for a log with no readings in it, which is a run played off the clock and replays
 * with no clock at all.
 */
function countedTicks(recorded: RunSession): (() => number) | null {
  const ticks = recorded.inputs.map(tickRead).filter((tick) => tick >= 0);
  if (ticks.length === 0) return null;
  let at = 0;
  return () => {
    // The replay has made more inputs than the log holds readings for, which is a log missing
    // some of its own: there is no number to hand back and nothing to be learned from carrying on.
    if (at >= ticks.length) throw new Error('The log holds fewer readings of the tick counter than inputs.');
    return ticks[at++];
  };
}

/**
 * The wall-clock second the sitting the log describes began in, which its `time()` reseeds
 * counted on from.
 *
 * A log with no such reading is a run played off the clock, which reseeds nothing and asks its
 * replay for no seconds; the number handed back there is never read.
 */
function recordedSecond(recorded: RunSession): number {
  const second = recorded.inputs.map(secondRead).find((reading) => reading >= 0);
  return second ?? 0;
}

/** Let the loop take what it has been given and come back to waiting for the next key. */
function loopRuns(): Promise<unknown> {
  return new Promise((resolve) => setTimeout(resolve));
}

/**
 * A replay whose loop threw is no replay at all, so the throw is raised again here.
 *
 * `runPlayLoop` catches it to keep a tab from freezing; a replay has no tab, and the numbers a
 * game left half-played hold would be read as the run having gone somewhere else rather than as
 * the engine having stopped.
 */
function stoppedReplay(session: PlayLoopSession): void {
  if (session.stopped !== null) throw new Error(session.stopped);
}

async function replayUnforgiven(recorded: RunSession, run: RunRecorder): Promise<RunReplay> {
  const file: CharacterFile = {
    bytes: run.record.slice(),
    write(bytes) {
      this.bytes = bytes;
    },
    died() {},
  };
  const session = startGame(file, run.rng, run);
  void runPlayLoop(session, runMoveControl(session));
  await loopRuns();
  for (const input of recorded.inputs) {
    if (session.over) break;
    // A reading of either clock is no key: the run takes it back off the log as it writes the log
    // again, and hands it to the game as the clock of the key it stands in front of.
    if (isClockReading(input)) continue;
    session.press(input);
    await loopRuns();
  }
  session.finish();
  stoppedReplay(session);
  const ended = run.log();
  const pc = session.game.pc;
  return {
    record: file.bytes,
    place: { x: pc.x, y: pc.y, floor: pc.level, dungeon: pc.module, dir: pc.dir },
    time: ended.time,
    actions: ended.actions,
    milestones: ended.milestones,
    journal: run.journal(),
    over: session.over,
    dead: session.dead,
  };
}

async function replayMoraffsWorld(recorded: RunSession, run: RunRecorder): Promise<RunReplay> {
  const file: MwCharacterFile = {
    bytes: run.record.slice(),
    write(bytes) {
      this.bytes = bytes;
    },
    died() {},
  };
  const session = startMwGame(file, run.rng, run);
  void runPlayLoop(session, runMwMoveControl(session));
  await loopRuns();
  for (const input of recorded.inputs) {
    if (session.over) break;
    const dir = turnedTo(input);
    if (dir === -1) session.press(input);
    else mwTurn(session, dir);
    await loopRuns();
  }
  session.finish();
  stoppedReplay(session);
  const ended = run.log();
  const pc = session.game.pc;
  return {
    record: file.bytes,
    place: { x: pc.x, y: pc.y, floor: pc.floor, dungeon: pc.dungeon, dir: pc.dir },
    time: ended.time,
    actions: ended.actions,
    milestones: ended.milestones,
    journal: run.journal(),
    over: session.over,
    dead: session.dead,
  };
}

/**
 * Moraff's Revenge, replayed.
 *
 * Its log holds two kinds of input: the keys the dungeon read, and {@link REV_CLOCK_TICK}, one
 * for each tick of the clock the monsters moved on. A tick is not a key and is not pressed —
 * `session.tick()` runs the passes of the poll it stands for, drawing the same numbers from the
 * same generator, which is what makes a run that nobody was sitting still through replayable.
 */
async function replayMoraffsRevenge(recorded: RunSession, run: RunRecorder): Promise<RunReplay> {
  const file: RevCharacterFile = {
    bytes: run.record.slice(),
    write(bytes) {
      this.bytes = bytes;
    },
    died() {},
    name: recorded.name,
  };
  const session = startRevGame(file, run.rng, run, run.sound ?? true);
  void runPlayLoop(session, runRevDungeon(session));
  await loopRuns();
  for (const input of recorded.inputs) {
    if (session.over) break;
    if (input === REV_CLOCK_TICK) session.tick();
    else session.press(input);
    await loopRuns();
  }
  session.finish();
  stoppedReplay(session);
  const ended = run.log();
  const pc = session.game.pc;
  return {
    record: file.bytes,
    place: { x: pc.column, y: pc.row, floor: pc.dungeonLevel, dungeon: 0, dir: pc.facing },
    time: ended.time,
    actions: ended.actions,
    milestones: ended.milestones,
    journal: run.journal(),
    over: session.over,
    dead: session.dead,
  };
}

export const RUN_GAMES: Record<RunGame, RunGameEngine> = {
  unforgiven: {
    replay: replayUnforgiven,
    journal: unforgivenJournal,
    clockWords: (seconds) => `${seconds} second${seconds === 1 ? '' : 's'}`,
    dungeonName: UNFORGIVEN_MAP.dungeonName,
    moneyWords: (amount) => `${amount} rubles`,
    foundMoneyWords: (amount) => `${amount} Greater-American Dollars`,
  },
  moraffsWorld: {
    replay: replayMoraffsWorld,
    journal: moraffsWorldJournal,
    // The clock counts in fractions of a move, which is rounded wherever it is shown.
    clockWords: (moves) => `${Math.round(moves)} move${Math.round(moves) === 1 ? '' : 's'}`,
    dungeonName: MORAFFS_WORLD_MAP.dungeonName,
    moneyWords: (amount) => `${amount} jewels`,
    foundMoneyWords: (amount) => `${amount} jewels' worth of stones`,
  },
  revenge: {
    replay: replayMoraffsRevenge,
    journal: moraffsRevengeJournal,
    // This game's clock is the ticks of the poll its monsters move on, which `rev/clock.ts` has.
    clockWords: (ticks) => `${ticks} tick${ticks === 1 ? '' : 's'}`,
    dungeonName: MORAFFS_REVENGE_MAP.dungeonName,
    moneyWords: (amount) => `${amount} jewel pieces`,
    foundMoneyWords: (amount) => `${amount} in treasure`,
  },
};

/** Whether a value out of a file names one of the games a run can have been played in. */
export function isRunGame(value: unknown): value is RunGame {
  return typeof value === 'string' && Object.keys(RUN_GAMES).includes(value);
}
