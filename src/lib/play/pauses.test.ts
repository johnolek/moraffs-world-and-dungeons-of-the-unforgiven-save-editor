import { describe, expect, it } from 'vitest';
import type { Rng } from '../game/port/rng';
import { characterFile, inTheTown, press, settle, standingOn, teleporterSquare, townSquare } from './battle.test-support';
import { KEY_HANDLERS, runMoveControl, startGame, type GameSession } from './engine';
import { KEY } from './keys';
import type { PlayMode } from './mode';
import { PLAQUE_DELAY_MS } from './plaque';
import { RunRecorder, runLogOf, type RunSession } from './run';
import { verifyRun } from './verify';

/**
 * The pauses Dungeons of the Unforgiven holds a screen for, against the mode the game is being
 * played in: the teleporter tunnel's turns and the moment the HIT ANY KEY plaque's corner is left
 * empty. `dig.test.ts` is the same question about the DIGGING... flashes.
 *
 * The original reads no key while one of these is running, so a player at it could not hurry one
 * along. Faithful and speedrun sit through them here and debug cuts them short, and either way
 * the key itself is taken rather than thrown away, which is what the last test of the file is
 * about: the same keys make the same run whichever mode it was played in.
 */

const sleep = (ms: number): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, ms));

/** The snake greets a character arriving in the town and waits for a key. That key is taken
 *  before the mode under test is set, so that what the test presses afterwards answers the pause
 *  it is about. */
async function pastTheGreeting(session: GameSession, mode: PlayMode): Promise<void> {
  await settle();
  if (session.view().tablet) await press(session, KEY.escape);
  session.mode = mode;
}

describe('a key given while a message is still on the screen', () => {
  /** How long the screen is held for, and long enough after it for the hold to be over. */
  const HELD_MS = 80;
  const PAST_IT_MS = 150;

  /** A character standing in the town, with a key of the test's own that holds the screen the way
   *  `digging` and every other run of `delay` calls does, and then ends its turn. */
  async function holdingTheScreen(mode: PlayMode): Promise<{ session: GameSession; held: number }> {
    const session = standingOn(0, townSquare());
    await pastTheGreeting(session, mode);
    const held = 0x62;
    KEY_HANDLERS[held] = {
      c: 'a handler that exists only in this test',
      run: (turn) => turn.game.delay(HELD_MS),
    };
    await press(session, held);
    return { session, held };
  }

  it('is not read until the game comes out of its delay, in faithful', async () => {
    const { session, held } = await holdingTheScreen('faithful');
    const facing = session.game.pc.dir;
    try {
      await press(session, KEY.pageUpTurnRight);
      expect(session.game.pc.dir).toBe(facing);

      await sleep(PAST_IT_MS);
    } finally {
      delete KEY_HANDLERS[held];
    }

    expect(session.game.pc.dir).not.toBe(facing);
    session.finish();
  });

  it('is read at once in debug, which reads through every pause', async () => {
    const { session, held } = await holdingTheScreen('debug');
    const facing = session.game.pc.dir;
    try {
      await press(session, KEY.pageUpTurnRight);
    } finally {
      delete KEY_HANDLERS[held];
    }

    expect(session.game.pc.dir).not.toBe(facing);
    session.finish();
  });
});

describe("the teleporter tunnel's turns", () => {
  /** A character stepping into the town's module teleporter, with the tunnel on the screen and
   *  the welcome still to come. */
  async function crossing(mode: PlayMode): Promise<GameSession> {
    const session = standingOn(0, teleporterSquare());
    await pastTheGreeting(session, mode);
    await press(session, KEY.arrowUp);
    expect(session.view().tunnel).toEqual({ module: 1, welcome: false });
    expect(session.game.pc.module).toBe(0);
    return session;
  }

  it('go on rushing in faithful, whatever the player presses', async () => {
    const session = await crossing('faithful');

    await press(session, KEY.escape);

    expect(session.view().tunnel).toEqual({ module: 1, welcome: false });
    expect(session.game.pc.module).toBe(0);
    session.finish();
  });

  it('go on rushing in speedrun as well, a run being timed against the original', async () => {
    const session = await crossing('speedrun');

    await press(session, KEY.escape);

    expect(session.view().tunnel).toEqual({ module: 1, welcome: false });
    expect(session.game.pc.module).toBe(0);
    session.finish();
  });

  it('are given up on a key in debug, which is where the port is stepped through', async () => {
    const session = await crossing('debug');

    await press(session, KEY.escape);

    expect(session.game.pc.module).toBe(1);
    session.finish();
  });
});

describe('the blank before the HIT ANY KEY plaque', () => {
  /** The Z key says its piece and waits for a key, which is what puts a plaque up. */
  const lowest: Rng = { random: () => 0 };

  /** A box up with its plaque's corner still empty, which is the 330 ms the game counts out
   *  before it draws the plaque. */
  async function waiting(mode: PlayMode): Promise<GameSession> {
    const session = inTheTown(lowest);
    await pastTheGreeting(session, mode);
    await press(session, KEY.zoomView);
    expect(session.plaque).toBe('blanked');
    return session;
  }

  it('cannot be answered while the corner is empty in faithful', async () => {
    const session = await waiting('faithful');

    await press(session, KEY.escape);

    expect(session.plaque).toBe('blanked');
    // The key was taken rather than thrown away, so it answers the box the moment the plaque is
    // drawn, which is what a key sitting in the DOS buffer does.
    await sleep(PLAQUE_DELAY_MS + 60);
    expect(session.plaque).toBeNull();
    session.finish();
  });

  it('cannot be answered while the corner is empty in speedrun either', async () => {
    const session = await waiting('speedrun');

    await press(session, KEY.escape);

    expect(session.plaque).toBe('blanked');
    await sleep(PLAQUE_DELAY_MS + 60);
    expect(session.plaque).toBeNull();
    session.finish();
  });

  it('is not there at all with the high speed option on, so the key answers at once', async () => {
    const session = inTheTown(lowest);
    await pastTheGreeting(session, 'faithful');
    // DS:00c3, which is the one thing that shortens this pause: the plaque is drawn with the box
    // rather than after a blank, so there is nothing to sit through.
    session.game.highSpeed = true;

    await press(session, KEY.zoomView);
    expect(session.plaque).toBe('showing');
    await press(session, KEY.escape);

    expect(session.plaque).toBeNull();
    session.finish();
  });

  it('is answered at once in debug', async () => {
    const session = await waiting('debug');

    await press(session, KEY.escape);

    expect(session.plaque).toBeNull();
    session.finish();
  });
});

describe('a run played in one mode and in another', () => {
  /** Four steps around the town and a look at the character sheet, which is a box with a plaque
   *  of its own. */
  const KEYS = [KEY.arrowUp, KEY.arrowLeft, KEY.arrowUp, KEY.viewStats, KEY.escape, KEY.arrowUp];

  /**
   * Press a key and wait until the game has read it, which is how a player plays: the key goes in
   * and the game takes it when it is ready for one. A mode that sits through the game's pauses
   * takes it when the pause is out and one that cuts them short takes it at once, so the same
   * keys reach the game either way.
   */
  async function pressWhenRead(session: GameSession, run: RunRecorder, key: number): Promise<void> {
    const before = run.log().inputs.length;
    session.press(key);
    for (let waited = 0; waited < 4000 && run.log().inputs.length === before; waited += 10) {
      await sleep(10);
    }
    await settle();
  }

  async function playedIn(mode: PlayMode): Promise<RunSession> {
    const file = characterFile({ level: 0, dir: 0, ...townSquare(), lev: 20, str: 60 });
    const run = new RunRecorder({
      game: 'unforgiven',
      name: 'BRAWLER',
      record: file.bytes,
      seed: 12345,
      startedAt: '2026-09-07T00:00:00.000Z',
      mode,
    });
    const session = startGame(file, run.rng, run);
    void runMoveControl(session);
    session.mode = mode;
    await settle();
    if (session.view().tablet) await pressWhenRead(session, run, KEY.escape);
    for (const key of KEYS) await pressWhenRead(session, run, key);
    session.save();
    session.finish();
    return run.log();
  }

  it('is the same run, and gives the same verdict', async () => {
    const faithful = await playedIn('faithful');
    const debug = await playedIn('debug');

    expect(faithful.inputs).toEqual(debug.inputs);
    expect(faithful.actions).toBe(debug.actions);
    expect(faithful.record).toBe(debug.record);
    expect(faithful.milestones).toEqual(debug.milestones);
    const verdicts = await Promise.all([faithful, debug].map((log) => verifyRun(runLogOf([log]))));
    expect(verdicts[0].status).toBe('verified');
    expect(verdicts[0].replayed).toEqual(verdicts[1].replayed);
    expect(verdicts[0].ending?.record).toBe(verdicts[1].ending?.record);
  });
});
