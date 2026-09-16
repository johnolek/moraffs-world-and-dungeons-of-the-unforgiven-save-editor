import type { RosterEntry } from '../app-state.svelte';
import { base64FromBytes } from '../bytes';
import { readCharacterMaps } from '../character/maps';
import { offTheBoards, playerSecret } from '../player';
import { runServerUrl } from '../run-server';
import type { PlayMode } from './mode';
import type { RunRecorder, RunSession } from './run';
import {
  DEAD,
  MOVED_ON,
  RunStream,
  type BatchAnswer,
  type CharacterSave,
  type RunBatch,
  type StreamedSession,
} from './stream';

/**
 * Sending a run to the run server while it is being played.
 *
 * `stream.ts` works out what each batch holds; this is the part that touches the browser — the
 * tick it goes on, the last one a page on its way out sends, and asking for the verdict once the
 * run has ended. A build with no server address behaves as the site always has and none of this
 * runs, and neither does any of it while the player has opted out of the boards
 * (`offTheBoards` in `src/lib/player.ts`).
 *
 * The words the Play tab shows are here as well, since they are all about what became of the
 * sending.
 */

/**
 * How often a run is sent. The server counts a gap of up to three of these as play and anything
 * longer as time the player was away, so this is the coarseness of its wall clock.
 */
const SEND_EVERY_MS = 5000;

/** How often the site asks whether the verdict is in, once the run has ended. */
const ASK_EVERY_MS = 2000;

/** How long it goes on asking. A long chain takes a while to replay; past this the tab stops
 *  asking and the verdict is there next time the run is looked at. */
const ASK_FOR_AT_MOST_MS = 120_000;

/** What the Play tab says about a run being sent. */
export interface RunMark {
  words: string;
  /** A line under the words, or null. */
  note: string | null;
  tone: 'plain' | 'good' | 'bad';
}

const SENDING: RunMark = { words: 'Sending to the boards.', note: null, tone: 'plain' };
const SAVING: RunMark = { words: 'Saving your character.', note: null, tone: 'plain' };
const SAVED: RunMark = { words: 'Character saved.', note: null, tone: 'plain' };
const UNREACHABLE: RunMark = { words: 'The boards are not answering.', note: null, tone: 'bad' };
const CHECKING: RunMark = { words: 'Checking the run.', note: null, tone: 'plain' };
const OFF_THE_BOARDS: RunMark = {
  words: 'Off the boards.',
  note: 'Nothing about this run is being sent.',
  tone: 'plain',
};
const NOT_CHECKED_YET: RunMark = { words: 'Still being checked.', note: null, tone: 'plain' };
const PLAYED_ELSEWHERE: RunMark = {
  words: 'This character was played elsewhere.',
  note: 'The copy here has been replaced with the one from the boards.',
  tone: 'bad',
};
const ALREADY_DEAD: RunMark = {
  words: 'This character has already died.',
  note: 'The boards keep nothing more of this run.',
  tone: 'bad',
};
const OFF_THE_CLOCK = 'Off the wall clock: more keys than a person could press.';

function refusedMark(why: string): RunMark {
  return { words: 'The boards refused the run.', note: why, tone: 'bad' };
}

function verdictMark(verdict: RunVerdictAnswer): RunMark {
  if (verdict.status === 'verified') {
    return { words: 'Run verified.', note: verdict.timed ? null : OFF_THE_CLOCK, tone: 'good' };
  }
  const words = verdict.status === 'failed' ? 'Run not verified.' : 'Run cannot be checked.';
  return { words, note: verdict.reason, tone: 'bad' };
}

/** The verdict as `GET /runs/:id` gives it. */
interface RunVerdictAnswer {
  status: string;
  reason: string | null;
  timed: boolean;
  eligible: boolean;
  playMs: number;
}

/** The characters a run is being sent for, by roster entry id. */
const beingSent = new Set<string>();

/**
 * Whether a run of this character is being sent now.
 *
 * Every batch carries the character as the device holds it, so while a run is going there is
 * nothing for anything else to send: `src/lib/character/current.ts` asks this before sending a
 * character edited outside a game.
 */
export function runIsBeingSent(id: string): boolean {
  return beingSent.has(id);
}

/** A run being sent, which the Play tab starts with the game and stops when the game is left. */
export interface RunStreamer {
  /** The character has died or won, which is the last batch of the run. */
  ended(): void;
  /** The game is being left: whatever is left goes, and nothing more is sent. */
  stop(): void;
}

/** The recorder of the game being played, as the sender reads it. */
export function streamedSession(run: RunRecorder, index: number, entry: RosterEntry): StreamedSession {
  return { index, log: () => run.log(), presses: () => run.presses, save: () => characterSave(entry) };
}

/**
 * The character as the device holds it now, which every batch carries.
 *
 * It is read again for every batch rather than taken once when the game starts: the record is
 * rewritten wherever the game saves, the maps grow with every floor walked, and a death marks the
 * roster entry. The server keeps the newest of them, so a device that signs in elsewhere picks
 * the character up where it stands instead of replaying its whole run to find out.
 */
export function characterSave(entry: RosterEntry): CharacterSave {
  return {
    record: base64FromBytes(entry.bytes),
    maps: readCharacterMaps(entry.id),
    slot: entry.slot,
    dead: entry.dead,
    leaderboard: entry.leaderboard,
    lock: entry.lock,
    worldSeed: entry.worldSeed ?? null,
    endless: entry.endless ?? null,
    createdAt: entry.createdAt,
    editedAt: entry.editedAt,
  };
}

export interface StreamRun {
  /** The roster entry's id, which is what the character is called on the server. */
  characterId: string;
  session: StreamedSession;
  /** The sittings the character was played in before this one. */
  earlier: readonly RunSession[];
  /** How the game is being shown now. Debug is the mode with the game's hidden numbers on the
   *  screen: such a run is kept like any other and never checked or ranked. */
  mode: () => PlayMode;
  onMark: (mark: RunMark) => void;
  /**
   * Write the character and the run down as they stand, for a game still being played.
   *
   * The roster is written at the end of a turn and the sender reads the run log as it stands, so
   * a turn that has not finished has already put its key in the log and nowhere else. Sending
   * that key without keeping it would leave the server holding a run the device cannot carry on
   * from, and the server refuses every later sitting of such a character.
   */
  writeTheGameDown: () => void;
  /**
   * The server holds a newer run of this character than the one being played: another device
   * carried it on while this one was away. The tab takes the server's copy over.
   */
  movedOn: () => void;
}

/**
 * Start sending a run, or null when this build has no server to send it to.
 */
export function streamRun(run: StreamRun): RunStreamer | null {
  const server = runServerUrl();
  if (server === null) return null;
  return new Streamer(server, run);
}

class Streamer implements RunStreamer {
  private readonly stream: RunStream;
  private readonly tick: ReturnType<typeof setInterval>;
  /** A batch is in the air, so the next tick leaves it alone rather than sending the same
   *  stretch twice. */
  private sending = false;
  private over = false;
  private stopped = false;
  /**
   * The page is going away, so the batch is sent in a way that outlives it. It is not the usual
   * way because a request that outlives its page may carry only a small body, and a batch that
   * has been waiting through a stretch with no server can be much bigger than that.
   */
  private leaving = false;
  private readonly onHide = () => {
    this.leaving = true;
    void this.send(false);
  };

  constructor(
    private readonly server: string,
    private readonly run: StreamRun,
  ) {
    this.stream = new RunStream(run.session, (batch) => this.postBatch(batch), run.earlier);
    beingSent.add(run.characterId);
    this.tick = setInterval(() => void this.send(false), SEND_EVERY_MS);
    window.addEventListener('pagehide', this.onHide);
    // The first batch would not go for another five seconds, and a player who has opted out
    // should not have to wait that long to be told nothing is leaving the device.
    if (offTheBoards()) run.onMark(OFF_THE_BOARDS);
  }

  ended(): void {
    if (this.over || this.stopped) return;
    this.over = true;
    void this.send(true).then(() => {
      // A character on no board, and one played with the game's hidden numbers on the screen, is
      // kept and never checked, so there is no verdict coming to ask about.
      if (this.forTheBoards()) return this.askForTheVerdict();
    });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    beingSent.delete(this.run.characterId);
    clearInterval(this.tick);
    window.removeEventListener('pagehide', this.onHide);
    if (!this.over) void this.send(false);
  }

  /**
   * Whether this run is one for the boards, which is what says there is a verdict to wait for.
   *
   * Every character of a player with a name is kept on the server, so that it is there on
   * whatever device they sign in on next. Only a character rolled for a board, played in a mode
   * that counts, is checked and ranked; the rest are saved and no more.
   */
  private forTheBoards(): boolean {
    return this.run.session.log().leaderboard !== null && this.run.mode() !== 'debug';
  }

  private async send(ending: boolean): Promise<void> {
    if (this.sending) {
      this.leaving = false;
      return;
    }
    // Everything the game has done goes into the roster before the log is read for a batch, so
    // that the device never holds less of a sitting than the server does. It goes in whether or
    // not anything is sent, since it is also the only thing that writes down a turn the player
    // left in the middle of.
    this.run.writeTheGameDown();
    // The player has opted out, so nothing about the character leaves the device. The keys are
    // still written down, and coming back on to the boards sends the lot from then on.
    if (offTheBoards()) {
      this.leaving = false;
      this.run.onMark(OFF_THE_BOARDS);
      return;
    }
    this.sending = true;
    try {
      const result = await this.stream.send(ending);
      if (result.sent === 'unreachable') this.run.onMark(UNREACHABLE);
      else if (result.sent === 'refused') this.refused(result.words, result.because);
      else if (!this.over) this.run.onMark(this.forTheBoards() ? SENDING : SAVING);
      else this.run.onMark(this.forTheBoards() ? CHECKING : SAVED);
    } finally {
      this.sending = false;
      this.leaving = false;
    }
  }

  /**
   * A run the server will not take.
   *
   * A character the server holds a newer run of than this device is playing is the one refusal
   * there is something to do about: the copy here is behind, so the tab takes the server's over
   * and says so. A character the server has already seen die gets words of its own, since
   * nothing about the keys being played now will ever be kept. The rest are shown as the server
   * worded them.
   */
  private refused(words: string, because: string | null): void {
    if (because === MOVED_ON) {
      this.run.onMark(PLAYED_ELSEWHERE);
      this.run.movedOn();
      return;
    }
    if (because === DEAD) {
      this.run.onMark(ALREADY_DEAD);
      return;
    }
    this.run.onMark(refusedMark(words));
  }

  /** Replaying a run happens behind the answer to the batch that ended it, so the verdict is
   *  asked for until it is there. */
  private async askForTheVerdict(): Promise<void> {
    // The run that would have been checked was never sent, so there is nothing to ask about.
    if (offTheBoards()) return;
    const until = Date.now() + ASK_FOR_AT_MOST_MS;
    for (;;) {
      const verdict = await this.readVerdict();
      if (verdict !== null) {
        this.run.onMark(verdictMark(verdict));
        return;
      }
      if (Date.now() > until || this.stopped) {
        this.run.onMark(NOT_CHECKED_YET);
        return;
      }
      await new Promise((wake) => setTimeout(wake, ASK_EVERY_MS));
    }
  }

  private async readVerdict(): Promise<RunVerdictAnswer | null> {
    try {
      const response = await fetch(`${this.server}/runs/${encodeURIComponent(this.run.characterId)}`, {
        headers: { Authorization: `Bearer ${playerSecret()}` },
      });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      const verdict = (body as { verdict?: unknown } | null)?.verdict;
      return verdict === null || verdict === undefined ? null : (verdict as RunVerdictAnswer);
    } catch {
      return null;
    }
  }

  private async postBatch(batch: RunBatch): Promise<BatchAnswer> {
    try {
      const response = await fetch(`${this.server}/runs/${encodeURIComponent(this.run.characterId)}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerSecret()}` },
        body: JSON.stringify(batch),
        keepalive: this.leaving,
      });
      if (response.ok) return { took: true };
      // A server that broke or is not up is not a run being refused: the stretch waits and goes
      // with the next batch, the way it does when nothing answered at all.
      if (response.status >= 500) return { took: false, refusal: null };
      // A refusal carries the words to show, and the server's own word for what happened beside
      // them: the server is where the rules about a run live.
      const body: unknown = await response.json().catch(() => null);
      const said = body as { error?: unknown; because?: unknown } | null;
      return {
        took: false,
        refusal: typeof said?.error === 'string' ? said.error : 'The boards refused the run.',
        because: typeof said?.because === 'string' ? said.because : null,
      };
    } catch {
      return { took: false, refusal: null };
    }
  }
}
