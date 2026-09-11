import type { Milestone, RunSession } from './run';

/**
 * A run on its way to the run server, a stretch at a time.
 *
 * The server measures how long a run took, and it can only measure what it sees, so a run is sent
 * while it is being played rather than posted whole at the end: every few seconds, and again when
 * the game is left. Each stretch is stamped as it arrives and the gaps between the stamps are the
 * run's play time — time the player spent away from the game is a gap too long to count and comes
 * to nothing. `server/README.md` is the other half of this.
 *
 * Nothing here touches the browser. What a batch holds and when the next one starts is worked out
 * here; posting it, the five-second tick and the last batch a page on its way out sends are
 * `streaming.ts`.
 */

/** The fixed facts about one sitting, which the first batch of that sitting carries. */
export interface BatchSession {
  seed: number;
  engine: string;
  game: string;
  leaderboard: string | null;
  sound: boolean | null;
  name: string;
  startedAt: string;
  /** The character's record as the sitting began, base64. */
  record: string;
}

/**
 * The character as the device holds it now, which the batches of the sitting being played carry.
 *
 * The chain says how the character got where it is, and reading it back is a replay of every
 * sitting it has ever been played in. So the character itself rides along with the keys: the
 * server keeps the newest one it was sent, and a device that has just signed in picks the
 * character up from that rather than playing the run again to find it.
 */
export interface CharacterSave {
  /**
   * The character's record as it stands now, base64.
   *
   * This is not the record on any sitting of the chain: those are what a replay of that sitting
   * starts from and never move again. This one is rewritten by every batch.
   */
  record: string;
  /**
   * The squares the character has discovered, as the device keeps them beside the record, and
   * null for a character that has discovered none.
   *
   * It is left out of a batch whose maps are the ones the batch before it carried: it is by far
   * the biggest thing here and most keys change nothing about it.
   */
  maps?: string | null;
  slot: number | null;
  dead: boolean;
  /** The board the character is locked to, or null for one played for its own sake. */
  leaderboard: string | null;
  /** When the character was rolled or imported, as the device stamped it. */
  createdAt: string;
  /** When the character was last changed, as the device stamped it. */
  editedAt: string;
}

/** What the sitting claims to have come to, which every batch carries and a replay checks. */
export interface BatchClaims {
  mode: string | null;
  actions: number;
  time: number;
  edits: number;
  milestones: Milestone[];
}

/**
 * One stretch of a sitting, as the server is sent it.
 *
 * A batch is fixed the moment it is built. The server holds a stretch under its sequence and
 * takes the same sequence twice as the same stretch, so a batch that is sent again after its
 * answer was lost has to hold exactly what the first attempt held: anything folded into it would
 * be dropped on the floor and the run would be missing keys it was really played with.
 */
export interface RunBatch {
  /** Where the sitting comes in the character's run, counting from zero. */
  sessionIndex: number;
  /** Which batch of that sitting this is, counting from zero. */
  sequence: number;
  inputs: number[];
  /** How many of those inputs the player pressed, which is what the server holds a run to a
   *  human speed by. */
  pressed: number;
  /** The character died or won, so this is the last batch of the run. */
  ending: boolean;
  claims: BatchClaims;
  /** The first batch of a sitting carries the sitting; the ones after it do not. */
  session?: BatchSession;
  /** The character as it stands. A sitting sent to catch the server up carries none: it is one
   *  of the sittings behind the character rather than the character. */
  save?: CharacterSave;
}

/** The sitting being played, as the sender reads it. */
export interface StreamedSession {
  /** Where it comes in the character's run, counting from zero. */
  index: number;
  /** The sitting as it stands, which is where the keys and the claims come from. */
  log(): RunSession;
  /** How many of its inputs the player pressed. */
  presses(): number;
  /** The character as the device holds it now, with its maps whether they have changed or not. */
  save(): CharacterSave;
}

/**
 * The server's word for a character it has been sent a newer run of than this device is playing:
 * another device carried the character on while this one was away.
 *
 * It is the one refusal the site does something about rather than only showing, which is why the
 * server's word for it is written down here beside the shapes the two halves agree on.
 */
export const MOVED_ON = 'moved-on';

/**
 * What came of posting a batch: the server has it, it refused it in words, or it was not reached
 * at all.
 *
 * The two failures are not the same. A refusal is the server saying this run is not one it will
 * take — the character is somebody else's, the device has claimed no name — and sending it again
 * would only be refused again. Being unreachable is nothing at all having happened, and the
 * stretch waits for the next batch.
 *
 * `refusal` is the words to show and `because` is the server's own word for what happened, which
 * is what the site acts on.
 */
export type BatchAnswer = { took: true } | { took: false; refusal: string | null; because?: string | null };

export type PostBatch = (batch: RunBatch) => Promise<BatchAnswer>;

/** What a round of sending came to. */
export type SendResult =
  | { sent: 'nothing' }
  | { sent: 'taken' }
  | { sent: 'unreachable' }
  | { sent: 'refused'; words: string; because: string | null };

/**
 * The sender for one sitting at a game.
 *
 * A batch that failed to go is kept as it was built and sent again under its own sequence, and
 * everything played since goes in the batch after it. So a flush after a stretch with no server
 * sends several batches, oldest first, rather than one big one.
 */
export class RunStream {
  /** The sittings of this character played before this one, each waiting to go as one batch. */
  private readonly earlier: RunBatch[];
  /** The batches of this sitting that have been built and that the server has not said it has,
   *  oldest first. */
  private readonly pending: RunBatch[] = [];
  private sequence = 0;
  /** How much of this sitting has gone into a batch, so that the next batch is what comes after
   *  it. What was built is counted rather than where the log now stands: the game goes on being
   *  played while a batch is in the air, and those keys belong to the batch after it. */
  private built = 0;
  private builtPresses = 0;
  private started = false;
  /** The batch that says the run is over has been built, so there is not another one. */
  private ended = false;
  /** The server's answer to a run it will not take, once it has given one. */
  private refused: { words: string; because: string | null } | null = null;
  /** The maps the last batch built carried, so that the next one carries them only if they have
   *  changed. Undefined until a batch has been built, which no character's maps ever are. */
  private sentMaps: string | null | undefined = undefined;

  constructor(
    private readonly session: StreamedSession,
    private readonly post: PostBatch,
    /** The sittings already in the character's run, which the server has never been told about
     *  unless it was sent them before. */
    earlier: readonly RunSession[] = [],
  ) {
    this.earlier = earlier.map(catchUpBatch);
  }

  /**
   * The batch to send now, or null when there is nothing to send.
   *
   * It is built rather than sent so that a page on its way out can hand it to `sendBeacon`, which
   * takes a body and answers nothing to wait on. Building one settles what it holds for good: it
   * is kept here until {@link took} says the server has it, and asking again hands back that same
   * batch rather than a bigger one.
   */
  next(ending: boolean): RunBatch | null {
    const waiting = this.waiting();
    if (waiting !== null) return waiting;
    const log = this.session.log();
    const inputs = log.inputs.slice(this.built);
    // The first batch of a sitting goes even with nothing played, since it is what tells the
    // server about the sitting, and so does the one that says the run is over.
    if (inputs.length === 0 && this.started && !(ending && !this.ended)) return null;
    const batch: RunBatch = {
      sessionIndex: this.session.index,
      sequence: this.sequence,
      inputs,
      pressed: this.session.presses() - this.builtPresses,
      ending,
      claims: {
        mode: log.mode,
        actions: log.actions,
        time: log.time,
        edits: log.edits,
        milestones: log.milestones,
      },
      session: this.started ? undefined : sessionHeader(log),
      save: this.saveNow(),
    };
    this.pending.push(batch);
    this.built += batch.inputs.length;
    this.builtPresses += batch.pressed;
    this.sequence += 1;
    this.started = true;
    if (ending) this.ended = true;
    return batch;
  }

  /**
   * A batch that was built in an earlier round and that the server has not said it has: a sitting
   * from before this one, or one of this sitting's that did not get through.
   */
  private waiting(): RunBatch | null {
    return this.earlier[0] ?? this.pending[0] ?? null;
  }

  /**
   * The character as this batch carries it: the maps only where they are not the ones the batch
   * before it carried.
   *
   * What was built is remembered rather than what the server has said it holds, because a batch
   * that failed to go is sent again exactly as it was built, so its maps go with it.
   */
  private saveNow(): CharacterSave {
    const save = this.session.save();
    const maps = save.maps ?? null;
    if (maps === this.sentMaps) return { ...save, maps: undefined };
    this.sentMaps = maps;
    return { ...save, maps };
  }

  /** The server has the batch, so it is done with and the one after it can go. */
  took(batch: RunBatch): void {
    if (batch.sessionIndex !== this.session.index) {
      this.earlier.shift();
      return;
    }
    if (this.pending[0]?.sequence === batch.sequence) this.pending.shift();
  }

  /**
   * Send what the server has not said it has: the batches built in earlier rounds, oldest first,
   * and then one batch of what has been played since.
   *
   * The round stops at that one batch. The game goes on being played while a batch is in the air,
   * and Moraff's Revenge writes an input every two hundred milliseconds whether anybody presses
   * anything or not, so a round that went on until there was nothing new to send would go on
   * sending for as long as the game was played. Those keys are the next round's, five seconds
   * later.
   */
  async send(ending: boolean): Promise<SendResult> {
    if (this.refused !== null) return { sent: 'refused', ...this.refused };
    let anything = false;
    for (;;) {
      const behind = this.waiting() !== null;
      const batch = this.next(ending);
      if (batch === null) return anything ? { sent: 'taken' } : { sent: 'nothing' };
      const answer = await this.post(batch);
      if (!answer.took) {
        if (answer.refusal === null) return { sent: 'unreachable' };
        this.refused = { words: answer.refusal, because: answer.because ?? null };
        return { sent: 'refused', ...this.refused };
      }
      this.took(batch);
      anything = true;
      // The batch just sent was built in this round rather than an earlier one, which also means
      // there was no backlog left in front of it, so the round is done.
      if (!behind) return { sent: 'taken' };
    }
  }
}

function sessionHeader(log: RunSession): BatchSession {
  return {
    seed: log.seed,
    engine: log.engine,
    game: log.game,
    leaderboard: log.leaderboard,
    sound: log.sound,
    name: log.name,
    startedAt: log.startedAt,
    record: log.record,
  };
}

/**
 * A sitting played before the server was ever told about this character, as one batch.
 *
 * Without them the server would hold a chain starting part-way through, and a replay of that
 * chain would arrive at numbers the log never claimed. It counts no presses, because how many of
 * those keys were pressed was never written down; one batch on its own has no gap before it, so
 * there is no stretch of time for the count to be judged against and none of it is play time.
 */
function catchUpBatch(log: RunSession, index: number): RunBatch {
  return {
    sessionIndex: index,
    sequence: 0,
    inputs: [...log.inputs],
    pressed: 0,
    ending: false,
    claims: { mode: log.mode, actions: log.actions, time: log.time, edits: log.edits, milestones: log.milestones },
    session: sessionHeader(log),
  };
}
