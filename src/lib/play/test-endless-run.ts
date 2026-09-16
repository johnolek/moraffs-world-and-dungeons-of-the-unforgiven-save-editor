import type { EndlessStore, KeptEndlessState } from '../game/endless/state';
import { characterFile, press, settle } from './battle.test-support';
import { runMoveControl, startGame, type CharacterFile } from './engine';
import { KEY } from './keys';
import { RunRecorder, runTotals, type RunSession } from './run';

/**
 * A character rolled into the endless dungeon, played headless, for the tests that need one.
 *
 * It is here rather than in a test file because the run server's tests play these runs as well,
 * and importing a test file would declare that file's tests a second time.
 */

/**
 * The world these runs are played in.
 *
 * It is not the world an endless character is rolled into today, so a replay that took the world
 * for granted rather than reading it off the log would stock these floors from another section's
 * monsters.
 */
export const RUN_WORLD = 7;

/** Module IV, as the port numbers modules, which is the deepest module a character rolled under
 *  the normal difficulty can stand in and so the one its endless floors are in. */
const MODULE = 3;

/**
 * The last floor of section 22, which is the second of the endless sections of Module IV and so
 * one the record's own table of Shadow boss squares has no place for.
 */
const BOSS_FLOOR = 120;

/** The section that floor is in, past the twenty the game itself has. */
export const RUN_SECTION = 22;

/**
 * The seeds the two sittings' generators are started from. The same seeds always make the same
 * run, which is the whole point of a log.
 *
 * The second is not any old number: it is one whose roll of the floor puts the Shadow boss back on
 * the square he was left on, which is what {@link FACING_THE_BOSS} needs of it.
 */
const FIRST_SEED = 1;
const SECOND_SEED = 204;

/**
 * The square the character stands on for the whole of both sittings, facing north, which is the
 * square the section's Shadow boss is put down on.
 *
 * A boss his section has never put down is rolled onto the middle fifty squares of each axis, and
 * under {@link FIRST_SEED} that roll puts him here. Every roll of his floor after that puts him
 * within seven squares of where he was last seen, and under {@link SECOND_SEED} that roll puts
 * him back on the same square. So both sittings' swings land on him — and a replay of the second
 * that started carrying nothing would roll him into the middle of the floor again, twenty squares
 * away, and swing at air.
 */
const FACING_THE_BOSS = { x: 39, y: 64 };

/** When each of the two sittings began. */
const SITTINGS = ['2026-09-07T00:00:00.000Z', '2026-09-07T01:00:00.000Z'];

/** The keys of a sitting: swing, answer the box the swing puts up, and again. */
const SWINGS = [KEY.fight, KEY.enter, KEY.fight, KEY.enter, KEY.fight, KEY.enter];

/** Where what the character carries between sittings is kept while these runs are played, which
 *  is the roster entry's job on the site. */
function heldBetweenSittings(): EndlessStore & { kept: KeptEndlessState | null } {
  return {
    kept: null,
    read() {
      return this.kept;
    },
    write(state) {
      this.kept = state;
    },
  };
}

/** The character these runs are played with: deep in the endless dungeon, tough enough to stand
 *  in front of a Shadow boss of floor 120 for a few swings. */
function endlessCharacter(): Uint8Array {
  return characterFile({
    module: MODULE,
    level: BOSS_FLOOR,
    dir: 0,
    ...FACING_THE_BOSS,
    lev: 99,
    hp: 30000,
    maxHp: 30000,
  }).bytes;
}

/** One sitting in the endless dungeon: the log it wrote, the record it left and what the
 *  character was carrying when it was put down. */
async function playOneSitting(
  record: Uint8Array,
  kept: EndlessStore & { kept: KeptEndlessState | null },
  seed: number,
  startedAt: string,
  before: RunSession[],
  world: number,
): Promise<{ log: RunSession; record: Uint8Array }> {
  const file: CharacterFile = { ...characterFile(), bytes: record, endless: { seed: world, kept } };
  const run = new RunRecorder({
    game: 'unforgiven',
    name: 'DEEPER',
    record: file.bytes,
    seed,
    startedAt,
    mode: 'endless',
    leaderboard: 'endless',
    worldSeed: world,
    before: runTotals(before),
  });
  const session = startGame(file, run.rng, run);
  void runMoveControl(session);
  await settle();
  for (const key of SWINGS) await press(session, key);
  session.save();
  session.finish();
  return { log: run.log(), record: file.bytes };
}

/**
 * One sitting in the endless dungeon, played in the world asked for: the character wakes face to
 * face with the Shadow boss of a section past the twenty the game has, and swings at him.
 *
 * Which of the game's own sections that boss is borrowed from is the world's own answer, so the
 * same keys in two worlds meet two different monsters.
 */
export async function endlessRun(world = RUN_WORLD): Promise<RunSession> {
  const played = await playOneSitting(endlessCharacter(), heldBetweenSittings(), FIRST_SEED, SITTINGS[0], [], world);
  return played.log;
}

/**
 * The same character played twice, where the second sitting can only be replayed by a replay that
 * carries what the first one left behind.
 *
 * The first sitting is the roll of the section's Shadow boss onto a floor his section has never
 * put him down on, and the square he was put on is written where an endless character keeps what
 * its record has no room for. The second sitting rolls the same floor again, and the boss is put
 * within seven squares of where he was last seen — so a replay that started the second sitting
 * carrying nothing would put him back in the middle of the floor instead, and the character's
 * swings would be at empty air.
 */
export async function endlessChain(): Promise<RunSession[]> {
  const kept = heldBetweenSittings();
  const first = await playOneSitting(endlessCharacter(), kept, FIRST_SEED, SITTINGS[0], [], RUN_WORLD);
  const second = await playOneSitting(first.record, kept, SECOND_SEED, SITTINGS[1], [first.log], RUN_WORLD);
  return [first.log, second.log];
}
