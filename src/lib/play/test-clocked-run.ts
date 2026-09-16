import { characterFile, press, settle } from './battle.test-support';
import { runMoveControl, startGame } from './engine';
import { KEY } from './keys';
import { RunRecorder, type RunSession } from './run';

/** When the sitting began, which is both the instant the log is stamped with and the second the
 *  game's `time()` counts on from. */
const STARTED_AT = '2026-09-07T00:00:00.000Z';

/**
 * A short run of Dungeons of the Unforgiven played on the clock, for the tests that need one.
 *
 * Both clocks are scripted rather than taken from the machine — the tick counter and the second
 * the sitting began in — so the run is the same every time it is played. Two moments waited on a stocked floor is long enough for one
 * of the floor's own monsters to come face to face with the character, and each swing after that
 * rolls off the reading in front of its key: what the run did cannot be worked out from the seed
 * and the keys alone, which is why the readings are in the log.
 *
 * It is here rather than in a test file because the run server's tests replay it as well, and
 * importing a test file would declare that file's tests a second time.
 */
export async function unforgivenClockedRun(): Promise<RunSession> {
  // A floor stocked on the clock lays its monsters in diagonal stripes rather than scattering
  // them, so most of the floor has nothing within reach and where the character starts decides
  // whether anything comes. This square has a stripe passing close enough that a monster walks up
  // to it, and a way north for the character to face down.
  const file = characterFile({ level: 3, dir: 0, x: 9, y: 7, lev: 20, str: 60 });
  let tick = 1000;
  const run = new RunRecorder({
    game: 'unforgiven',
    name: 'BRAWLER',
    record: file.bytes,
    seed: 12345,
    startedAt: STARTED_AT,
    mode: 'faithful',
    tickCounter: () => (tick += 5),
    startedSecond: Math.floor(Date.parse(STARTED_AT) / 1000),
  });
  const session = startGame(file, run.rng, run);
  void runMoveControl(session);
  await settle();
  // The Enters after the swings answer the box each swing puts up.
  for (const key of [KEY.enter, KEY.enter, KEY.fight, KEY.enter, KEY.fight, KEY.enter]) {
    await press(session, key);
  }
  session.save();
  session.finish();
  return run.log();
}

/** Where in a clocked run's log the reading in front of its first swing is. */
export function firstSwingsReading(log: RunSession): number {
  return log.inputs.indexOf(KEY.fight) - 1;
}
