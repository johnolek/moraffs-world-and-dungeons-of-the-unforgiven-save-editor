import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tickRead, type Milestone, type RunLog, type RunSession } from '../src/lib/play/run';
import { firstSwingsReading, unforgivenClockedRun } from '../src/lib/play/test-clocked-run';
import type { JournalEntry } from '../src/lib/play/journal';
import { verifyRun, verifySession, type RunVerdict } from '../src/lib/play/verify';
import { announcementsBefore, type Announcement } from './announcing';
import { openEngineStore, publishEngine, type EngineStore, type KeptEngine } from './engines';
import {
  batchesOf,
  endRun,
  sessionsOf,
  takeBatch,
  type BatchSender,
  type BatchSession,
  type KeptBatch,
  type RunBatch,
} from './runs';
import type { Sql } from './sql';
import { openTestDatabase } from './test-sql';
import {
  createRunVerifier,
  livingSnapshotFor,
  replayChain,
  REPLAY_LIVING_AFTER_MS,
  runLogFrom,
  runTiming,
  snapshotLivingRun,
  verdictFor,
  verifyKeptRun,
  type RunTiming,
} from './verifying';

const CHARACTER = 'k3p9x1-ab12cd';
const ENGINE = 'a'.repeat(40);
const ME: BatchSender = { player: 1, device: 'a'.repeat(64) };

function arrived(over: Partial<KeptBatch>): KeptBatch {
  return { id: 1, sessionIndex: 0, sequence: 0, inputs: [], pressed: 0, arrivedAt: 0, ending: false, ...over };
}

describe('the play time the batch stamps say', () => {
  function timing(...batches: KeptBatch[]): RunTiming {
    return runTiming(batches);
  }

  it('counts nothing for a sitting with one batch in it', () => {
    expect(timing(arrived({ arrivedAt: 1000 }))).toEqual({ playMs: 0, timed: true });
  });

  it('sums the gaps between the batches of a sitting', () => {
    expect(
      timing(
        arrived({ sequence: 0, arrivedAt: 1000 }),
        arrived({ sequence: 1, arrivedAt: 6000 }),
        arrived({ sequence: 2, arrivedAt: 11000 }),
      ).playMs,
    ).toBe(10000);
  });

  it('counts nothing for the time the player was away', () => {
    expect(
      timing(
        arrived({ sequence: 0, arrivedAt: 0 }),
        arrived({ sequence: 1, arrivedAt: 5000 }),
        // An hour off the game, and then play again.
        arrived({ sequence: 2, arrivedAt: 3605000 }),
        arrived({ sequence: 3, arrivedAt: 3610000 }),
      ).playMs,
    ).toBe(10000);
  });

  it('counts nothing across two sittings, since the game was left between them', () => {
    expect(
      timing(
        arrived({ sessionIndex: 0, sequence: 0, arrivedAt: 0 }),
        arrived({ sessionIndex: 0, sequence: 1, arrivedAt: 5000 }),
        arrived({ sessionIndex: 1, sequence: 0, arrivedAt: 6000 }),
        arrived({ sessionIndex: 1, sequence: 1, arrivedAt: 11000 }),
      ).playMs,
    ).toBe(10000);
  });

  it('leaves the wall clock to a stretch nobody could have pressed', () => {
    const cheated = timing(
      arrived({ sequence: 0, arrivedAt: 0 }),
      arrived({ sequence: 1, arrivedAt: 5000, pressed: 500 }),
    );

    expect(cheated.timed).toBe(false);
    expect(cheated.playMs).toBe(5000);
  });

  it('leaves a stretch anybody could have pressed on the wall clock', () => {
    expect(timing(arrived({ sequence: 0, arrivedAt: 0 }), arrived({ sequence: 1, arrivedAt: 5000, pressed: 60 })).timed).toBe(
      true,
    );
  });

  it('does not fail the batch that lands the moment the character dies', () => {
    expect(
      timing(
        arrived({ sequence: 0, arrivedAt: 0 }),
        arrived({ sequence: 1, arrivedAt: 5000, pressed: 20 }),
        arrived({ sequence: 2, arrivedAt: 5010, pressed: 1, ending: true }),
      ).timed,
    ).toBe(true);
  });
});

describe('putting a run back together', () => {
  it('joins the stretches of each sitting in the order they were sent', () => {
    const sessions = [
      {
        sessionIndex: 0,
        seed: 1,
        engine: ENGINE,
        game: 'unforgiven',
        leaderboard: null,
        sound: null,
        name: 'Grond',
        startedAt: '2026-09-09T12:00:00.000Z',
        record: 'AAEC',
        mode: 'faithful',
        actions: 3,
        time: 9,
        edits: 0,
        milestones: [],
      },
    ];
    const batches = [
      arrived({ sequence: 0, inputs: [104] }),
      arrived({ sequence: 1, inputs: [106, 107] }),
    ];

    const log = runLogFrom(sessions, batches);

    expect(log.sessions).toHaveLength(1);
    expect(log.sessions[0].inputs).toEqual([104, 106, 107]);
    expect(log.sessions[0].seed).toBe(1);
  });
});

/** One line of a run journal, as a replay writes one. */
const STEPPED: JournalEntry = {
  at: 2,
  floor: 3,
  module: 0,
  text: 'Stepped north',
  event: { kind: 'stepped', dir: 0 },
};

/** An engine build that says what a test wants it to say about the run it is handed. */
function fakeEngines(verdictFor: (log: RunLog) => Partial<RunVerdict>): EngineStore {
  return {
    keptCommits: () => Promise.resolve([ENGINE]),
    engineFor: (commit) =>
      Promise.resolve(
        commit === ENGINE
          ? {
              kept: true,
              engine: {
                commit,
                verifySession: null,
                verifyRun: (log) =>
                  Promise.resolve({
                    status: 'verified',
                    reason: null,
                    notes: [],
                    game: 'unforgiven',
                    name: 'Grond',
                    mode: 'speedrun',
                    leaderboard: 'speedrun',
                    sessions: log.sessions.length,
                    engine: { played: [ENGINE], build: ENGINE },
                    claimed: { actions: 0, time: 0, milestones: [] },
                    replayed: { actions: 12, time: 30, milestones: [] },
                    journal: [],
                    ending: null,
                    ...verdictFor(log),
                  } as RunVerdict),
              },
            }
          : { kept: false, reason: 'not kept' },
      ),
  };
}

const header: BatchSession = {
  seed: 12345,
  engine: ENGINE,
  game: 'unforgiven',
  leaderboard: 'speedrun',
  sound: null,
  name: 'Grond',
  startedAt: '2026-09-09T12:00:00.000Z',
  record: 'AAEC',
};

function batch(over: Partial<RunBatch> = {}): RunBatch {
  return {
    sessionIndex: 0,
    sequence: 0,
    inputs: [104, 106],
    pressed: 2,
    ending: false,
    claims: { mode: 'speedrun', actions: 12, time: 30, edits: 0, milestones: [] },
    ...over,
  };
}

describe('replaying a run once its last batch has arrived', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES ($1, $2)', [ME.player, 'John']);
  });

  afterEach(async () => {
    await sql.close();
  });

  async function play(engines: EngineStore, ...batches: { batch: RunBatch; at: number }[]): Promise<void> {
    for (const sent of batches) await takeBatch(sql, CHARACTER, ME, sent.batch, sent.at);
    const verifier = createRunVerifier(sql, engines, () => {});
    verifier.verifySoon(CHARACTER);
    await verifier.idle();
  }

  it('writes down what the engine made of the run', async () => {
    await play(
      fakeEngines(() => ({})),
      { batch: batch({ session: header }), at: 1000 },
      { batch: batch({ sequence: 1, ending: true }), at: 6000 },
    );

    expect(await verdictFor(sql, CHARACTER)).toMatchObject({
      status: 'verified',
      actions: 12,
      time: 30,
      playMs: 5000,
      timed: true,
      eligible: true,
      engines: [ENGINE],
    });
  });

  it('writes down the journal the replay wrote', async () => {
    await play(
      fakeEngines(() => ({ journal: [STEPPED] })),
      { batch: batch({ session: header }), at: 1000 },
      { batch: batch({ sequence: 1, ending: true }), at: 6000 },
    );

    expect((await verdictFor(sql, CHARACTER))?.journal).toEqual([STEPPED]);
  });

  it('writes down what the boards read the run by', async () => {
    await play(
      fakeEngines(() => ({
        replayed: {
          actions: 12,
          time: 30,
          milestones: [
            { kind: 'dungeon', which: 2, actions: 4, time: 10, floor: 3 },
            { kind: 'level', which: 5, actions: 9, time: 20, floor: 3 },
            { kind: 'death', which: 0, actions: 12, time: 30, floor: 3 },
          ],
        },
      })),
      { batch: batch({ session: header }), at: 1000 },
      { batch: batch({ sequence: 1, ending: true }), at: 6000 },
    );

    expect(await verdictFor(sql, CHARACTER)).toMatchObject({
      game: 'unforgiven',
      leaderboard: 'speedrun',
      deepest: 2,
      level: 5,
    });
  });

  it('keeps a run whose keys nobody could have pressed, off the wall clock', async () => {
    await play(
      fakeEngines(() => ({})),
      { batch: batch({ session: header }), at: 1000 },
      { batch: batch({ sequence: 1, pressed: 900, ending: true }), at: 6000 },
    );

    expect(await verdictFor(sql, CHARACTER)).toMatchObject({ status: 'verified', timed: false, eligible: true });
  });

  it('keeps a run written from outside the game off the boards', async () => {
    await play(
      fakeEngines(() => ({ status: 'unverifiable', reason: 'The record was written from outside the game.' })),
      { batch: batch({ session: header }), at: 1000 },
      {
        batch: batch({
          sequence: 1,
          ending: true,
          claims: { mode: 'speedrun', actions: 12, time: 30, edits: 1, milestones: [] },
        }),
        at: 6000,
      },
    );

    expect(await verdictFor(sql, CHARACTER)).toMatchObject({ status: 'unverifiable', eligible: false });
  });

  it('says a run cannot be checked when the engine it was played on is not kept', async () => {
    const nothingKept: EngineStore = {
      keptCommits: () => Promise.resolve([]),
      engineFor: () => Promise.resolve({ kept: false, reason: 'The engine the run was played on is not kept here.' }),
    };

    await play(nothingKept, { batch: batch({ session: header, ending: true }), at: 1000 });

    expect(await verdictFor(sql, CHARACTER)).toMatchObject({
      status: 'unverifiable',
      reason: 'The engine the run was played on is not kept here.',
      eligible: false,
    });
  });
});

describe('announcing a run that has been checked', () => {
  const DIED: Milestone[] = [
    { kind: 'dungeon', which: 2, actions: 4, time: 10, floor: 3 },
    { kind: 'level', which: 5, actions: 9, time: 20, floor: 3 },
    { kind: 'death', which: 0, actions: 12, time: 30, floor: 7 },
  ];
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES ($1, $2)', [ME.player, 'Moraff']);
  });

  afterEach(async () => {
    await sql.close();
  });

  async function playToADeath(engines: EngineStore): Promise<Announcement[]> {
    await takeBatch(sql, CHARACTER, ME, batch({ session: header }), 1000);
    await takeBatch(sql, CHARACTER, ME, batch({ sequence: 1, ending: true }), 6000);
    await endRun(sql, CHARACTER, 'death');
    return verifyKeptRun(sql, engines, CHARACTER);
  }

  it('announces the milestones the replay reached and how the run ended', async () => {
    const announcements = await playToADeath(fakeEngines(() => ({ replayed: { actions: 12, time: 30, milestones: DIED } })));

    expect(announcements.map((announcement) => [announcement.kind, announcement.which])).toEqual([
      ['dungeon', 2],
      ['level', 5],
      ['death', 0],
    ]);
    expect(announcements[2]).toMatchObject({ player: 'Moraff', name: 'Grond', game: 'unforgiven', floor: 7, level: 5 });
  });

  it('checks and announces nothing for a character rolled for no board', async () => {
    await takeBatch(sql, CHARACTER, ME, batch({ session: { ...header, leaderboard: null } }), 1000);
    await takeBatch(sql, CHARACTER, ME, batch({ sequence: 1, ending: true }), 6000);
    await endRun(sql, CHARACTER, 'death');

    const announcements = await verifyKeptRun(
      sql,
      fakeEngines(() => ({ replayed: { actions: 12, time: 30, milestones: DIED } })),
      CHARACTER,
    );

    expect(announcements).toEqual([]);
    expect(await verdictFor(sql, CHARACTER)).toBeNull();
  });

  it('checks and announces nothing for a run played in debug', async () => {
    const debug = { mode: 'debug', actions: 12, time: 30, edits: 0, milestones: [] };
    await takeBatch(sql, CHARACTER, ME, batch({ session: header, claims: debug }), 1000);
    await takeBatch(sql, CHARACTER, ME, batch({ sequence: 1, ending: true, claims: debug }), 6000);
    await endRun(sql, CHARACTER, 'death');

    const announcements = await verifyKeptRun(
      sql,
      fakeEngines(() => ({ replayed: { actions: 12, time: 30, milestones: DIED } })),
      CHARACTER,
    );

    expect(announcements).toEqual([]);
    expect(await verdictFor(sql, CHARACTER)).toBeNull();
  });

  it('announces nothing about a run that could not be checked', async () => {
    const announcements = await playToADeath(
      fakeEngines(() => ({ status: 'unverifiable', reason: 'not kept', replayed: { actions: 12, time: 30, milestones: DIED } })),
    );

    expect(announcements).toEqual([]);
    expect((await announcementsBefore(sql, null, 50)).announcements).toEqual([]);
  });
});

describe('replaying a chain whose sittings name more than one commit', () => {
  const OLDER = 'e'.repeat(40);
  const NEWER = 'f'.repeat(40);
  const ON_ITS_OWN = 'd'.repeat(40);
  let sql: Sql;

  /**
   * A build small enough to read.
   *
   * Its session replay takes only the sittings played on its own commit and only a chain it was
   * handed the record of the sitting before, so a chain that comes out verified is one whose
   * sittings each went to the build they name, joined up in order.
   */
  function fakeEngine(commit: string, aSittingAtATime: boolean): Uint8Array {
    return Buffer.from(
      `export const ENGINE_COMMIT = '${commit}';\n` +
        `export function verifyRun(log) {\n` +
        `  const newest = log.sessions[log.sessions.length - 1];\n` +
        `  return Promise.resolve({\n` +
        `    status: 'verified', reason: null, notes: [], game: newest.game, name: newest.name,\n` +
        `    mode: newest.mode, leaderboard: newest.leaderboard, sessions: log.sessions.length,\n` +
        `    engine: { played: [newest.engine], build: ENGINE_COMMIT },\n` +
        `    claimed: { actions: newest.actions, time: newest.time, milestones: [] },\n` +
        `    replayed: { actions: newest.actions, time: newest.time, milestones: [] }, ending: null,\n` +
        `  });\n` +
        `}\n` +
        (aSittingAtATime
          ? `function refused(reason) {\n` +
            `  return { status: 'failed', reason, totals: null, ending: null, record: null };\n` +
            `}\n` +
            `export function verifySession(chain) {\n` +
            `  if (chain.session.engine !== ENGINE_COMMIT) return Promise.resolve(refused('Another build was handed this sitting.'));\n` +
            `  if (chain.at > 0 && chain.after === null) return Promise.resolve(refused('The chain was not joined up.'));\n` +
            `  return Promise.resolve({\n` +
            `    status: 'verified', reason: null, ending: null, record: new Uint8Array([chain.at]),\n` +
            `    totals: { actions: chain.before.actions + chain.session.inputs.length, time: 0, milestones: [] },\n` +
            `  });\n` +
            `}\n`
          : ''),
    );
  }

  function sitting(over: Partial<RunSession>): RunSession {
    return {
      engine: ENGINE,
      game: 'unforgiven',
      mode: 'speedrun',
      leaderboard: 'speedrun',
      sound: null,
      name: 'Grond',
      startedAt: '2026-09-09T12:00:00.000Z',
      seed: 12345,
      record: 'AAEC',
      inputs: [104, 106],
      actions: 2,
      time: 4,
      milestones: [],
      edits: 0,
      ...over,
    };
  }

  beforeAll(async () => {
    sql = await openTestDatabase();
    await publishEngine(sql, OLDER, fakeEngine(OLDER, true));
    await publishEngine(sql, NEWER, fakeEngine(NEWER, true));
    await publishEngine(sql, ON_ITS_OWN, fakeEngine(ON_ITS_OWN, false));
  });

  afterAll(async () => {
    await sql.close();
  });

  it('hands each sitting to the build it was played on', async () => {
    const log: RunLog = {
      version: 3,
      sessions: [sitting({ engine: OLDER, inputs: [104, 106] }), sitting({ engine: NEWER, inputs: [107, 108, 109] })],
    };

    const verdict = await replayChain(openEngineStore(sql), log);

    expect(verdict.reason).toBeNull();
    expect(verdict.status).toBe('verified');
    expect(verdict.notes).toContain('Each sitting was replayed by the engine build it was played on.');
    expect(verdict.engine).toEqual({ played: [OLDER, NEWER], build: NEWER });
    // Every sitting counts on from what the ones before it came to, which is what the builds were
    // handed and what the last of them gave back.
    expect(verdict.replayed).toEqual({ actions: 5, time: 0, milestones: [] });
  });

  it('hands the whole chain to the newest build when one of them cannot take a sitting', async () => {
    const log: RunLog = { version: 3, sessions: [sitting({ engine: ON_ITS_OWN })] };

    const verdict = await replayChain(openEngineStore(sql), log);

    expect(verdict.status).toBe('verified');
    expect(verdict.notes).toContain(
      'The whole chain was replayed by the engine build of its newest sitting, since one of the builds it names cannot replay a sitting on its own.',
    );
  });

  it('cannot check a chain one of whose sittings names a build nobody kept', async () => {
    const log: RunLog = {
      version: 3,
      sessions: [sitting({ engine: OLDER }), sitting({ engine: 'b'.repeat(40) })],
    };

    const verdict = await replayChain(openEngineStore(sql), log);

    expect(verdict.status).toBe('unverifiable');
    expect(verdict.reason).toContain('is not kept here');
  });
});

describe('replaying the chain of a character still being played', () => {
  /** What the replay says the character has reached: module II and level five. */
  const REACHED: Milestone[] = [
    { kind: 'dungeon', which: 2, actions: 4, time: 10, floor: 3 },
    { kind: 'level', which: 5, actions: 9, time: 20, floor: 3 },
  ];
  const AT_NOON = Date.parse('2026-09-09T12:00:00.000Z');
  let sql: Sql;
  let replays: number;

  beforeEach(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES ($1, $2)', [ME.player, 'John']);
    replays = 0;
  });

  afterEach(async () => {
    await sql.close();
  });

  /** An engine that counts what it is asked to replay, so a test can say whether a replay
   *  happened at all. */
  function counting(reached: Milestone[] = REACHED): EngineStore {
    return fakeEngines(() => {
      replays += 1;
      return { replayed: { actions: 12, time: 30, milestones: reached } };
    });
  }

  /** One more batch of the sitting, with what the site claims by then. */
  async function played(sequence: number, claimed: Milestone[], at: number): Promise<void> {
    await takeBatch(
      sql,
      CHARACTER,
      ME,
      batch({
        sequence,
        session: sequence === 0 ? header : undefined,
        claims: { mode: 'speedrun', actions: 12, time: 30, edits: 0, milestones: claimed },
      }),
      at,
    );
  }

  it('writes down the level and the depth the replay reached', async () => {
    await played(0, [], 1000);

    const snapshot = await snapshotLivingRun(sql, counting(), CHARACTER, AT_NOON);

    expect(snapshot).toMatchObject({ status: 'verified', level: 5, deepest: 2, actions: 12, time: 30 });
    expect(await livingSnapshotFor(sql, CHARACTER)).toMatchObject({ level: 5, deepest: 2 });
  });

  it('writes down the journal of the run so far', async () => {
    await played(0, [], 1000);

    const snapshot = await snapshotLivingRun(
      sql,
      fakeEngines(() => ({ journal: [STEPPED] })),
      CHARACTER,
      AT_NOON,
    );

    expect(snapshot?.journal).toEqual([STEPPED]);
  });

  it('leaves the chain alone while nothing has been played since', async () => {
    const engines = counting();
    await played(0, [], 1000);
    await snapshotLivingRun(sql, engines, CHARACTER, AT_NOON);

    await snapshotLivingRun(sql, engines, CHARACTER, AT_NOON + 1000);

    expect(replays).toBe(1);
  });

  it('leaves the chain alone for a batch that reaches nothing new', async () => {
    const engines = counting();
    await played(0, [], 1000);
    await snapshotLivingRun(sql, engines, CHARACTER, AT_NOON);
    await played(1, [], 6000);

    await snapshotLivingRun(sql, engines, CHARACTER, AT_NOON + 5000);

    expect(replays).toBe(1);
  });

  it('replays again for a batch claiming a level past the one the replay found', async () => {
    const engines = counting([]);
    await played(0, [], 1000);
    await snapshotLivingRun(sql, engines, CHARACTER, AT_NOON);
    await played(1, [{ kind: 'level', which: 6, actions: 11, time: 28, floor: 3 }], 6000);

    await snapshotLivingRun(sql, engines, CHARACTER, AT_NOON + 5000);

    expect(replays).toBe(2);
  });

  it('replays again two minutes on, whatever the site claims', async () => {
    const engines = counting();
    await played(0, [], 1000);
    await snapshotLivingRun(sql, engines, CHARACTER, AT_NOON);
    await played(1, [], 6000);

    await snapshotLivingRun(sql, engines, CHARACTER, AT_NOON + REPLAY_LIVING_AFTER_MS);

    expect(replays).toBe(2);
  });

  it('keeps the snapshot of a chain the replay refused, with why', async () => {
    await played(0, [], 1000);

    const snapshot = await snapshotLivingRun(
      sql,
      fakeEngines(() => ({ status: 'failed', reason: 'The replay spent 3 actions and the log claims 12.' })),
      CHARACTER,
      AT_NOON,
    );

    expect(snapshot).toMatchObject({ status: 'failed', reason: 'The replay spent 3 actions and the log claims 12.' });
  });

  it('replays nothing for a character whose run has ended', async () => {
    await played(0, [], 1000);
    await endRun(sql, CHARACTER, 'death');

    expect(await snapshotLivingRun(sql, counting(), CHARACTER, AT_NOON)).toBeNull();
    expect(replays).toBe(0);
  });

  it('replays nothing for a character rolled for no board', async () => {
    await takeBatch(sql, CHARACTER, ME, batch({ session: { ...header, leaderboard: null } }), 1000);

    expect(await snapshotLivingRun(sql, counting(), CHARACTER, AT_NOON)).toBeNull();
    expect(replays).toBe(0);
  });

  it('replays nothing for a character played in debug', async () => {
    await takeBatch(
      sql,
      CHARACTER,
      ME,
      batch({ session: header, claims: { mode: 'debug', actions: 12, time: 30, edits: 0, milestones: [] } }),
      1000,
    );

    expect(await snapshotLivingRun(sql, counting(), CHARACTER, AT_NOON)).toBeNull();
    expect(replays).toBe(0);
  });

  it('takes a snapshot for a batch the line was told about', async () => {
    const verifier = createRunVerifier(sql, counting(), () => {});
    await played(0, [], 1000);

    verifier.snapshotSoon(CHARACTER);
    await verifier.idle();

    expect(await livingSnapshotFor(sql, CHARACTER)).toMatchObject({ status: 'verified', level: 5 });
  });
});

describe('a run played on the clock', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES ($1, $2)', [ME.player, 'John']);
  });

  afterEach(async () => {
    await sql.close();
  });

  /**
   * The engine builds the server keeps, answered by the engine these tests were built with.
   *
   * A run played on the clock says nothing without a real engine: what its swings rolled is in
   * the readings of the tick counter the batches carried, and only the engine turns those back
   * into the swings they were.
   */
  function thisBuildsEngine(commit: string): EngineStore {
    const engine: KeptEngine = { commit, verifyRun, verifySession };
    return {
      keptCommits: () => Promise.resolve([commit]),
      engineFor: (asked) =>
        Promise.resolve(asked === commit ? { kept: true, engine } : { kept: false, reason: 'not kept' }),
    };
  }

  /** The run sent as one batch, and the log the server puts back together out of what it kept. */
  async function sentAndKept(log: RunSession, inputs: number[]): Promise<RunLog> {
    const batch: RunBatch = {
      sessionIndex: 0,
      sequence: 0,
      inputs,
      pressed: inputs.filter((input) => tickRead(input) === -1).length,
      ending: true,
      claims: { mode: log.mode, actions: log.actions, time: log.time, edits: log.edits, milestones: log.milestones },
      session: {
        seed: log.seed,
        engine: log.engine,
        game: log.game,
        leaderboard: log.leaderboard,
        sound: log.sound,
        name: log.name,
        startedAt: log.startedAt,
        record: log.record,
      },
    };
    await takeBatch(sql, CHARACTER, ME, batch, 1000);
    return runLogFrom(await sessionsOf(sql, CHARACTER), await batchesOf(sql, CHARACTER));
  }

  it('verifies a run whose readings of the tick counter came in with its keys', async () => {
    const log = await unforgivenClockedRun();
    const kept = await sentAndKept(log, log.inputs);

    expect(kept.sessions[0].inputs).toEqual(log.inputs);
    const verdict = await replayChain(thisBuildsEngine(log.engine), kept);

    expect(verdict.reason).toBeNull();
    expect(verdict.status).toBe('verified');
    expect(verdict.replayed).toEqual({ actions: log.actions, time: log.time, milestones: log.milestones });
  });

  it('fails a run one of whose readings was moved on the way here', async () => {
    const log = await unforgivenClockedRun();
    const at = firstSwingsReading(log);
    // Seven ticks later is another moment of the sawtooth Borland's generator answers, so the
    // swing under it rolls something else and the run no longer reaches what it claims.
    const moved = log.inputs.map((input, index) => (index === at ? input - 7 : input));

    const verdict = await replayChain(thisBuildsEngine(log.engine), await sentAndKept(log, moved));

    // Moving the reading changes more than the swing under it now: every Random call of the
    // fight reseeds from the clock as well, so the monster answers differently too and the run
    // ends three actions short of what the log claims rather than one.
    expect(verdict.status).toBe('failed');
    expect(verdict.reason).toBe(`The replay spent 3 actions and the log claims ${log.actions} actions.`);
  });
});
