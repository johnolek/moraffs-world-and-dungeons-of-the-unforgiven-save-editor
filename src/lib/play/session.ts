import { sameBytes } from '../bytes';
import type { PlayLoopSession } from './loop';
import type { PlayMode } from './mode';
import { DEFAULT_PLAY_MODE, waitsAreEnforced } from './mode';
import type { JournalEntry } from './journal';
import type { RunRecorder, RunSession } from './run';

/**
 * The keyboard, the record and the run log the three games are played out of.
 *
 * None of this is a port of anything. Each original blocks on the keyboard in the middle of its
 * own loop; here the loops are asynchronous and every read of a key is a promise the Play tab
 * settles, the record can be written from the save editor while a game is being played, and a
 * run is written down as it goes so that it can be played again. That machinery is the same in
 * all three games, so it is here, and what each game does with a key is not, so it is not.
 *
 * A session is what `runPlayLoop` (`loop.ts`) starts a loop out of and what the tab draws.
 */

/** How many keys are kept for a loop that is not waiting for one yet. */
const KEY_QUEUE = 4;

/**
 * Not a key: what the loop's wait hands back when the save editor has written the record while
 * the game was waiting for one, so the pass starts again with the character it now describes.
 *
 * It is a number no key table can hold. DOS hands over a key that makes a character as its byte
 * and one that does not — an arrow, a function key — as the negated scan code, and all three
 * ports write those the same way, so nothing a player can press reaches -0x201.
 */
export const RECORD_EDITED = -0x201;

/** Where the character record lives while it is being played. */
export interface CharacterFile {
  /** The record as the roster holds it. */
  bytes: Uint8Array;
  /** Keep these bytes as the character from now on. */
  write(bytes: Uint8Array<ArrayBuffer>): void;
  /** The character has died, which the roster marks and never undoes. */
  died(): void;
  /**
   * Keep this session as the newest of the character's run, and the journal it has been written
   * up in beside it. The roster is what has a run to keep them in; a replay, which plays a
   * session rather than living one, has none.
   */
  keepRun?(session: RunSession, journal: JournalEntry[]): void;
}

/**
 * The screens a game asked to be left up for a moment, which the tab draws in place of the live
 * screen for as long as each was asked for (`timed.ts`, `rev/held.ts`).
 *
 * The session needs two things of them: a key gives up whatever is left of a frame's time, and a
 * session nobody is drawing any more drops them.
 */
export interface HeldFrames {
  release(): void;
  stop(): void;
}

/** One key a loop dispatches on, in whatever a game works its turn out into. */
export interface KeyHandler<Turn> {
  /** The function of the game the key runs, for anyone reading the table. */
  c: string;
  run(turn: Turn): void | Promise<void>;
}

/**
 * One character being played: the keyboard the loop waits on, the record it was read from and
 * the log it is being written down in.
 *
 * `Record` is the character as the game holds it, which is what {@link readRecord} makes of a
 * record's bytes.
 */
export abstract class KeyedSession<Record> implements PlayLoopSession {
  /**
   * Whether a key gives up the pauses the game is in the middle of: both the frames it is holding
   * on the screen and the stretches it leaves one standing for before it reads the keyboard again
   * (`GameSession.keyWithPlaque`).
   *
   * The tab tells a session which mode it is being played in, and that settles this (`mode.ts`):
   * faithful and speedrun sit through the game's own pauses, since none of the three games reads
   * the keyboard while one is on the screen and a speedrun is run against the original's timing;
   * debug cuts them short so the port can be stepped through.
   *
   * A session nobody is watching is never told a mode and cuts them short: a replay, the fight
   * simulator and a test have no screen in front of them to hold anything on.
   */
  protected cutsPausesShort = true;

  /** The loop has come back: the character has quit or died. */
  over = false;
  /** Why the play loop stopped, when it stopped because it threw (`loop.ts`), or null. */
  stopped: string | null = null;
  dead = false;
  /**
   * How much of the game the tab is showing (`mode.ts`). It is here so that the run being written
   * down can say which mode it was played in, which is why setting it reaches the run as well,
   * and it settles {@link cutsPausesShort}. Nothing the game itself does reads it, and neither of
   * those changes which keys reach the game or the order they reach it in.
   */
  get mode(): PlayMode {
    return this.playMode;
  }

  set mode(mode: PlayMode) {
    this.playMode = mode;
    this.cutsPausesShort = !waitsAreEnforced(mode);
    if (this.run) this.run.mode = mode;
  }

  private playMode: PlayMode = DEFAULT_PLAY_MODE;
  /** Called whenever the game is about to wait for a key, so the tab can draw what it is
   *  waiting with. */
  onChange: (() => void) | null = null;

  /** A key pressed while nothing was waiting for one, which is where DOS kept it too. */
  private queued: number[] = [];
  private waiting: ((key: number) => void) | null = null;
  /** The record as the game last read it or wrote it back, which is how a record the save editor
   *  has written is told from the game's own save. */
  private known: Uint8Array;
  /** A record the save editor has written, waiting for the loop to be between actions. */
  private edited: Uint8Array | null = null;
  /** The loop is waiting for the player's key with nothing of the game's own part-way through. */
  private betweenActions = false;

  constructor(
    readonly file: CharacterFile,
    /** The run log this game is being written down in, or null for a game nobody is recording. */
    readonly run: RunRecorder | null = null,
  ) {
    this.known = file.bytes.slice();
  }

  /** The frames the game has asked to be left on the screen, which a key gives up. */
  protected abstract get frames(): HeldFrames;

  /** A record's bytes as the character the game plays, or null where they are not a character
   *  at all. */
  protected abstract readRecord(bytes: Uint8Array): Record | null;

  /** The character back into the bytes a record is kept as. */
  protected abstract writeRecord(): Uint8Array<ArrayBuffer>;

  /** Where a record the save editor wrote leaves the character standing, which is the one part
   *  of taking an edit that is each game's own. */
  protected abstract placeEdited(record: Record): void;

  /**
   * Nothing is going to draw this session again, so anything of its own still running — a
   * message's timer, the monsters' clock — is dropped rather than left holding the page, or a
   * replay under Node, open.
   */
  abstract finish(): void;

  /**
   * A key from the Play tab.
   *
   * The key itself is taken at once, which is what DOS does with one typed while the game is
   * inside a delay of its own: it sits in the keyboard buffer and the next `getch` has it. What
   * {@link cutsPausesShort} decides is whether the frames still standing on the screen are given
   * up along with it, or left to play out with whatever the key draws queued up behind them.
   */
  press(key: number): void {
    if (this.cutsPausesShort) this.frames.release();
    if (this.wake(key)) return;
    if (this.queued.length < KEY_QUEUE) this.queued.push(key);
  }

  /**
   * The `while (kbhit()) getch();` each game strikes its keyboard with — exe 2000:7f2b in
   * Dungeons of the Unforgiven, flush_keys at WORLD.EXE 4000:3532, and the eighteen `INKEY$`
   * reads at DUNSMALL.EXE 1000:2FCB — which is this queue here: whatever was typed while the
   * game was busy is thrown away rather than answering the next turn.
   */
  flushKeys(): void {
    this.queued = [];
  }

  /** kbhit (exe 1000:3385): whether a key is waiting to be read. */
  keyWaiting(): boolean {
    return this.queued.length > 0;
  }

  /** getch (exe 4000:417b, WORLD.EXE 1000:28b4, DUNSMALL.EXE 1000:2F71): the next key, once
   *  there is one. */
  key(): Promise<number> {
    const queued = this.queued.shift();
    if (queued !== undefined) {
      this.took(queued);
      return Promise.resolve(queued);
    }
    this.changed();
    return new Promise((resolve) => {
      this.waiting = (key) => {
        this.took(key);
        resolve(key);
      };
    });
  }

  /**
   * The key the loop waits for at the top of a pass — exe 2000:c82d, movecontrol's own read in
   * Moraff's World, and the `INKEY$` poll at DUNSMALL.EXE 1000:087F — or {@link RECORD_EDITED}
   * when the save editor writes the record while it waits.
   *
   * Nothing of the game's own is running while the loop waits here, which is what makes it the
   * one place a record written outside the game is safe to take.
   */
  async keyOrEdit(): Promise<number> {
    this.betweenActions = true;
    try {
      return await this.waitForTheKey();
    } finally {
      this.betweenActions = false;
    }
  }

  /**
   * The save editor has written the character's record while the game is being played, and the
   * game follows it. The record is read again at the next point the loop is between actions; a
   * loop already waiting for a key is woken so that it takes the edit at once.
   *
   * The bytes the game itself last read or saved are the ones it already has, so its own save
   * writing the record back is not an edit.
   */
  recordEdited(bytes: Uint8Array): void {
    if (sameBytes(bytes, this.known)) return;
    this.edited = bytes;
    if (this.betweenActions) this.wake(RECORD_EDITED);
  }

  /**
   * Read the record again, if the save editor has written one. The loop calls this at the top of
   * a pass, where no ported function is part-way through.
   *
   * Everything the record holds becomes the character; everything it does not — the monsters
   * standing on the floor, the monster being fought, the timers a moment counts down — is left
   * exactly as it was. {@link placeEdited} is where each game puts the character the record
   * describes.
   */
  takeEdits(): void {
    const bytes = this.edited;
    if (bytes === null) return;
    this.edited = null;
    this.run?.edited();
    this.known = bytes.slice();
    this.file.bytes = bytes;
    const record = this.readRecord(bytes);
    if (record === null) return;
    this.placeEdited(record);
  }

  /** The record back into the character it came from, with the run as it stands beside it. */
  save(): void {
    const bytes = this.writeRecord();
    this.known = bytes.slice();
    this.file.write(bytes);
    this.keepRun();
  }

  /**
   * Write the run down as it stands.
   *
   * It goes wherever the record goes, so that the two never disagree about how far the game got:
   * the next session of this character's run starts from the record left behind here, and a
   * replay of the session written here has to arrive at exactly those bytes.
   */
  keepRun(): void {
    if (this.run) this.file.keepRun?.(this.run.log(), this.run.journal());
  }

  /** The character is dead: the roster is told, and nothing more is written. */
  die(): void {
    this.dead = true;
    this.run?.died();
    this.file.died();
  }

  /** Tell the Play tab to draw. */
  changed(): void {
    this.onChange?.();
  }

  /**
   * The wait itself, which is where a game that has something to do while the loop sits at the
   * top of a pass does it.
   */
  protected waitForTheKey(): Promise<number> {
    return this.key();
  }

  /**
   * A key the game has just read, which is where it reaches the run log.
   *
   * The log is what the game read rather than what the player pressed, because the two differ: a
   * key typed while the game was busy is thrown away by {@link flushKeys} and the game never sees
   * it, so a replay that pressed it would act on a key this run did not. {@link RECORD_EDITED} is
   * not a key at all.
   */
  protected took(key: number): void {
    if (key !== RECORD_EDITED) this.run?.input(key);
  }

  /** Hand a loop that is waiting for a key something to go on with, and say whether one was. */
  protected wake(key: number): boolean {
    const waiting = this.waiting;
    if (waiting === null) return false;
    this.waiting = null;
    waiting(key);
    return true;
  }

  /** How many keys are waiting to be read, which is all a game needs to know of the queue. */
  protected get keysWaiting(): number {
    return this.queued.length;
  }
}
