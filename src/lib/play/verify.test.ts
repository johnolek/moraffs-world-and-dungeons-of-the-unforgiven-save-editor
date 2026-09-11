import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bytesFromBase64 } from '../bytes';
import { savePlayer, loadPlayer } from '../game/port/record';
import { characterFile, press, settle, teleporterSquare, townSquare } from './battle.test-support';
import { runMoveControl, startGame } from './engine';
import { KEY } from './keys';
import { runMwMoveControl, startMwGame } from './mw/engine';
import { findMwSquare, mwCharacterFile } from './mw/test-engine';
import { MW_KEY, mwTurn } from './mw/keys';
import { runRevDungeon, startRevGame } from './rev/engine';
import { revCharacterFile, revRecord } from './rev/engine.test';
import { REV_KEY } from './rev/keys';
import { ENGINE_COMMIT, replayRun, runLogOf, RunRecorder, runTotals, type RunLog, type RunSession } from './run';
import { RUN_LOG_VERSION } from './run';
import { readRunLog, verifyRun, verifySession, whatToSayAboutTheEngine } from './verify';

/**
 * A short run of Dungeons of the Unforgiven, played headless with a seed of the test's own: three
 * steps, a turn and a swing, the first step being through the town's module teleporter, which is
 * a milestone. The first Escape after that step is the key the crossing's welcome waits for
 * (`tunnel.ts`) and the second is the key the snake's tablet waits for in the town it comes out
 * in; the Enters answer the boxes that step and that swing put up. The same keys always make the
 * same run, which is the whole point of a log.
 */
async function unforgivenRun(): Promise<RunSession> {
  const file = characterFile({ level: 0, dir: 0, ...teleporterSquare(), lev: 20, str: 60 });
  const run = new RunRecorder({
    game: 'unforgiven',
    name: 'BRAWLER',
    record: file.bytes,
    seed: 12345,
    startedAt: '2026-09-07T00:00:00.000Z',
    mode: 'faithful',
  });
  const session = startGame(file, run.rng, run);
  void runMoveControl(session);
  // The snake's stone tablet greets a character arriving in the town and waits for a key, so that
  // Escape is the first thing the game reads and the first input the run writes down.
  if (session.tablet) await press(session, KEY.escape);
  await settle();
  const keys = [
    KEY.arrowUp,
    KEY.escape,
    KEY.enter,
    KEY.escape,
    KEY.arrowUp,
    KEY.arrowLeft,
    KEY.arrowUp,
    KEY.fight,
    KEY.enter,
  ];
  for (const key of keys) {
    await press(session, key);
  }
  session.save();
  session.finish();
  return run.log();
}

/**
 * The same character played twice: the run above, left, and taken up again from the record it
 * ended with. Its second sitting counts on from the first, which is what a chain of sessions is
 * for and what a run is checked as.
 */
async function unforgivenChain(): Promise<RunLog> {
  const first = await unforgivenRun();
  const file = characterFile();
  file.bytes = (await replayRun(first)).record;
  const run = new RunRecorder({
    game: 'unforgiven',
    name: 'BRAWLER',
    record: file.bytes,
    seed: 999,
    startedAt: '2026-09-07T01:00:00.000Z',
    mode: 'faithful',
    before: runTotals([first]),
  });
  const session = startGame(file, run.rng, run);
  void runMoveControl(session);
  await settle();
  for (const key of [KEY.arrowUp, KEY.arrowLeft, KEY.enter, KEY.arrowUp]) {
    await press(session, key);
  }
  session.finish();
  return runLogOf([first, run.log()]);
}

/** The same in Moraff's World: four steps around a dungeon floor, a turn where the character
 *  stands, a moment waited and a swing at nothing. */
async function moraffsWorldRun(): Promise<RunSession> {
  const start = findMwSquare(
    3,
    (square, x, y) => square.n === 3 && square.s === 3 && square.w === 3 && x > 5 && y > 5 && square.ladder === 0,
  );
  const file = mwCharacterFile({ floor: 3, dir: 0, ...start });
  const run = new RunRecorder({
    game: 'moraffsWorld',
    name: 'GRIMWALD',
    record: file.bytes,
    seed: 7,
    startedAt: '2026-09-07T00:00:00.000Z',
    mode: 'faithful',
  });
  const session = startMwGame(file, run.rng, run);
  void runMwMoveControl(session);
  await settle();
  for (const key of [MW_KEY.arrowUp, MW_KEY.arrowDown, MW_KEY.arrowLeft, MW_KEY.arrowRight]) {
    session.press(key);
    await settle();
  }
  mwTurn(session, 2);
  for (const key of [MW_KEY.wait, MW_KEY.fight]) {
    session.press(key);
    await settle();
  }
  session.save();
  session.finish();
  return run.log();
}

/** What a run this build played carries about its engine: nothing when the tree it was built from
 *  was clean, and the note that a tree with changes in it cannot vouch for itself when it was not.
 *  Either way it is what a run with nothing wrong with it comes back with. */
function ownEngineNotes(): string[] {
  const note = whatToSayAboutTheEngine(ENGINE_COMMIT, ENGINE_COMMIT);
  return note === null ? [] : [note];
}

describe('verifying a run', () => {
  it('verifies a run of Dungeons of the Unforgiven, milestone and all', async () => {
    const log = await unforgivenRun();
    const verdict = await verifyRun(runLogOf([log]));

    expect(verdict.status).toBe('verified');
    expect(verdict.reason).toBeNull();
    expect(verdict.notes).toEqual(ownEngineNotes());
    expect(verdict.replayed).toEqual({ actions: log.actions, time: log.time, milestones: log.milestones });
    expect(log.milestones).toEqual([{ kind: 'dungeon', which: 1, actions: 1, time: 0, floor: 0 }]);
    expect(verdict.ending).toMatchObject({ alive: true, won: false, place: { dungeon: 1 } });
    expect(verdict.ending?.record).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies a run of Moraff's World, turns where the character stands and all", async () => {
    const log = await moraffsWorldRun();
    const verdict = await verifyRun(runLogOf([log]));

    expect(verdict.status).toBe('verified');
    expect(verdict.replayed).toEqual({ actions: log.actions, time: log.time, milestones: log.milestones });
    expect(verdict.ending).toMatchObject({ alive: true, place: { floor: 3 } });
  });

  it('fails a run whose action count has been raised', async () => {
    const log = await unforgivenRun();
    const verdict = await verifyRun(runLogOf([{ ...log, actions: log.actions + 1 }]));

    expect(verdict.status).toBe('failed');
    expect(verdict.reason).toBe(
      `The replay spent ${log.actions} actions and the log claims ${log.actions + 1} actions.`,
    );
  });

  it('fails a run with a key taken out of it', async () => {
    const log = await unforgivenRun();
    // The first of them, so that every key after it answers something else and the run ends
    // somewhere the log does not claim.
    const verdict = await verifyRun(runLogOf([{ ...log, inputs: log.inputs.slice(1) }]));

    expect(verdict.status).toBe('failed');
  });

  it('fails a run whose milestone has been edited', async () => {
    const log = await unforgivenRun();
    const milestones = [{ ...log.milestones[0], which: 2 }];
    const verdict = await verifyRun(runLogOf([{ ...log, milestones }]));

    expect(verdict.status).toBe('failed');
    expect(verdict.reason).toContain("The log's milestone 1 is");
  });

  it('fails a run claiming a milestone it never reached', async () => {
    const log = await unforgivenRun();
    const invented = { kind: 'win', which: 0, actions: log.actions, time: log.time, floor: 0 } as const;
    const verdict = await verifyRun(runLogOf([{ ...log, milestones: [...log.milestones, invented] }]));

    expect(verdict.status).toBe('failed');
    expect(verdict.reason).toContain('The replay never reached Won');
  });

  it('cannot check a run whose log cannot be played at all', async () => {
    const log = await unforgivenRun();
    const verdict = await verifyRun(runLogOf([{ ...log, record: 'not a record' }]));

    expect(verdict.status).toBe('unverifiable');
    expect(verdict.reason).toContain('The replay stopped');
    expect(verdict.ending).toBeNull();
  });

  it("cannot check a run whose Moraff's Revenge record is not one", async () => {
    const log = await moraffsRevengeRun();
    const verdict = await verifyRun(runLogOf([{ ...log, record: btoa('not a record') }]));

    expect(verdict.status).toBe('unverifiable');
    expect(verdict.reason).toBe("The replay stopped: These bytes are not a Moraff's Revenge character record.");
    expect(verdict.ending).toBeNull();
  });

  it('takes a run played on a working tree with changes in it for one it cannot vouch for', () => {
    // Two dirty trees at the same commit can hold different code, so the strings matching says
    // nothing.
    expect(whatToSayAboutTheEngine('46f877a-dirty', '46f877a-dirty')).toBe(
      'The run was played on an engine built from a working tree with changes in it, which the commit does not name, so this build cannot be shown to be that same engine.',
    );
    expect(whatToSayAboutTheEngine('46f877a', '46f877a')).toBeNull();
  });

  it('cannot vouch for two builds that had no commit to read', () => {
    expect(whatToSayAboutTheEngine('unknown', 'unknown')).toBe(
      'The run was played on an engine built where no commit could be read, so this build cannot be shown to be that same engine.',
    );
  });

  it('takes an engine that is not this build for a note rather than a failure', async () => {
    const log = await unforgivenRun();
    const verdict = await verifyRun(runLogOf([{ ...log, engine: 'aaaaaaa' }]));

    expect(verdict.status).toBe('verified');
    expect(verdict.notes).toEqual([
      'The run was played on an engine other than this build, so a replay is only as good as the two agreeing.',
    ]);
    expect(verdict.engine).toEqual({ played: ['aaaaaaa'], build: log.engine });
  });

  it('cannot check a run the save editor wrote a record into', async () => {
    const file = characterFile({ level: 0, dir: 0, ...townSquare(), str: 20 });
    const run = new RunRecorder({ game: 'unforgiven', name: 'BRAWLER', record: file.bytes, seed: 12345 });
    const session = startGame(file, run.rng, run);
    void runMoveControl(session);
    await press(session, KEY.arrowUp);
    session.recordEdited(savePlayer({ ...loadPlayer(file.bytes), str: 99 }, file.bytes));
    await settle();
    session.finish();
    const verdict = await verifyRun(runLogOf([run.log()]));

    expect(verdict.status).toBe('unverifiable');
    expect(verdict.reason).toBe(
      "The character's record was written from outside the game once while the run was played, and those records are not in the log.",
    );
    expect(verdict.replayed).toBeNull();
  });
});

/**
 * The same in Moraff's Revenge: down one of the town's own ladders, four steps around the level
 * below, and two ticks of the clock the monsters move on — which is the thing about this game a
 * log has to hold that the other two do not.
 */
async function moraffsRevengeRun(): Promise<RunSession> {
  const file = revCharacterFile(revRecord({ 23: 15, 24: 5 }));
  const run = new RunRecorder({
    game: 'revenge',
    name: 'FIGHTY',
    record: file.bytes,
    seed: 4242,
    startedAt: '2026-09-07T00:00:00.000Z',
    mode: 'faithful',
    sound: false,
  });
  const session = startRevGame(file, run.rng, run, false);
  void runRevDungeon(session);
  await settle();
  session.press(REV_KEY.down);
  await settle();
  for (const key of [REV_KEY.arrowUp, REV_KEY.arrowRight, REV_KEY.arrowDown, REV_KEY.arrowLeft]) {
    session.press(key);
    await settle();
  }
  session.tick();
  await settle();
  session.tick();
  await settle();
  session.save();
  session.finish();
  return run.log();
}

describe('verifying a run played in more than one sitting', () => {
  it('verifies the chain and says what the whole run came to', async () => {
    const log = await unforgivenChain();
    const verdict = await verifyRun(log);

    expect(verdict.status).toBe('verified');
    expect(verdict.sessions).toBe(2);
    expect(verdict.claimed.actions).toBe(log.sessions[1].actions);
    expect(verdict.claimed.actions).toBeGreaterThan(log.sessions[0].actions);
    expect(verdict.claimed.milestones).toEqual([...log.sessions[0].milestones, ...log.sessions[1].milestones]);
    expect(verdict.replayed).toEqual(verdict.claimed);
  });

  it('fails a chain whose second session does not start where the first ended', async () => {
    const log = await unforgivenChain();
    const elsewhere = { ...log.sessions[1], record: log.sessions[0].record };
    const verdict = await verifyRun(runLogOf([log.sessions[0], elsewhere]));

    expect(verdict.status).toBe('failed');
    expect(verdict.reason).toBe('Session 2 does not start from the record session 1 ended with.');
  });

  it('says which session of a chain the replay stopped agreeing with', async () => {
    const log = await unforgivenChain();
    const raised = { ...log.sessions[1], actions: log.sessions[1].actions + 1 };
    const verdict = await verifyRun(runLogOf([log.sessions[0], raised]));

    expect(verdict.status).toBe('failed');
    expect(verdict.reason).toContain('Session 2: The replay spent');
  });

  it('cannot check a chain a record was written into in any of its sessions', async () => {
    const log = await unforgivenChain();
    const verdict = await verifyRun(runLogOf([{ ...log.sessions[0], edits: 1 }, log.sessions[1]]));

    expect(verdict.status).toBe('unverifiable');
    expect(verdict.reason).toContain('written from outside the game once');
  });

  it('names every engine the sessions were played on', async () => {
    const log = await unforgivenChain();
    const verdict = await verifyRun(runLogOf([{ ...log.sessions[0], engine: 'aaaaaaa' }, log.sessions[1]]));

    expect(verdict.engine.played).toEqual(['aaaaaaa', ENGINE_COMMIT]);
  });
});

describe('judging one session of a chain on its own', () => {
  const nothingYet = { actions: 0, time: 0, milestones: [] };

  it('counts a session on from what the sessions before it came to', async () => {
    const log = await unforgivenChain();

    const first = await verifySession({ session: log.sessions[0], at: 0, of: 2, before: nothingYet, after: null });
    expect(first.status).toBe('verified');
    if (first.status !== 'verified') return;
    expect(first.totals).toEqual(runTotals([log.sessions[0]]));

    const second = await verifySession({
      session: log.sessions[1],
      at: 1,
      of: 2,
      before: first.totals,
      after: first.record,
    });
    expect(second.status).toBe('verified');
    if (second.status !== 'verified') return;
    expect(second.totals).toEqual(runTotals(log.sessions));
  });

  it('fails a session that does not start from the record it is handed', async () => {
    const log = await unforgivenChain();

    const checked = await verifySession({
      session: log.sessions[1],
      at: 1,
      of: 2,
      before: runTotals([log.sessions[0]]),
      after: bytesFromBase64(log.sessions[0].record),
    });

    expect(checked.status).toBe('failed');
    expect(checked.reason).toBe('Session 2 does not start from the record session 1 ended with.');
  });
});

describe('reading a run log out of a file', () => {
  it('reads back a log this build wrote', async () => {
    const log = runLogOf([await unforgivenRun()]);
    expect(readRunLog(JSON.stringify(log))).toEqual(log);
  });

  it('refuses anything that is not a log this build reads', async () => {
    const session = await unforgivenRun();
    const log = runLogOf([session]);
    expect(readRunLog('')).toBeNull();
    expect(readRunLog('null')).toBeNull();
    expect(readRunLog('{}')).toBeNull();
    expect(readRunLog(JSON.stringify({ ...log, version: log.version + 1 }))).toBeNull();
    expect(readRunLog(JSON.stringify({ ...log, sessions: [] }))).toBeNull();
    expect(readRunLog(JSON.stringify(runLogOf([{ ...session, game: 'snake' as RunSession['game'] }])))).toBeNull();
    expect(readRunLog(JSON.stringify(runLogOf([{ ...session, inputs: ['up'] as unknown as number[] }])))).toBeNull();
    expect(readRunLog(JSON.stringify(runLogOf([{ ...session, milestones: [{ kind: 'boss' }] as RunSession['milestones'] }])))).toBeNull();
  });

  it('reads a log written before a run was a chain of sessions, as a chain of one', async () => {
    const session = await unforgivenRun();
    const olderLog = { ...session, version: 2 };

    const log = readRunLog(JSON.stringify(olderLog));
    expect(log?.version).toBe(RUN_LOG_VERSION);
    expect(log?.sessions).toHaveLength(1);
    expect(log?.sessions[0].inputs).toEqual(session.inputs);
    expect((await verifyRun(log!)).status).toBe('verified');
  });

  it('reads a log written before the site had boards, which simply has no field', async () => {
    const { leaderboard, ...older } = await unforgivenRun();
    expect(leaderboard).toBeNull();
    const read = (session: unknown) => readRunLog(JSON.stringify({ version: RUN_LOG_VERSION, sessions: [session] }));
    expect(read(older)?.sessions[0].leaderboard).toBeUndefined();
    expect(read({ ...older, leaderboard: 'faithful' })?.sessions[0].leaderboard).toBe('faithful');
    expect(read({ ...older, leaderboard: 'debug' })).toBeNull();
  });

  it('reads a log written before the sound flag was recorded, which simply has no field', async () => {
    const { sound, ...older } = await moraffsRevengeRun();
    expect(sound).toBe(false);
    const read = (session: unknown) => readRunLog(JSON.stringify({ version: RUN_LOG_VERSION, sessions: [session] }));
    expect(read(older)).not.toBeNull();
    expect(read({ ...older, sound: 'yes' })).toBeNull();
  });
});

/**
 * The runs kept as files, which are what the `verify-run` command is tried against and what says
 * that a log written down today still verifies tomorrow. The three one-session ones were written
 * before a run was kept as a chain and are left in that older shape on purpose, since a log
 * somebody has kept from then still has to be readable.
 *
 * Writing them again, after a change to the engine that legitimately moves them:
 * `WRITE_RUN_FIXTURES=1 pnpm test src/lib/play/verify.test.ts`. A fixture that stops verifying
 * without one is the engine having changed a game under runs already played. Writing them again
 * puts all four in the chain shape and stamps them with this build's commit, so the three older
 * ones have to be put back the way they were by hand afterwards, with only the numbers the change
 * moved taken from what was written.
 */
const FIXTURES = [
  { file: 'unforgiven-run.json', log: async () => runLogOf([await unforgivenRun()]) },
  { file: 'moraffs-world-run.json', log: async () => runLogOf([await moraffsWorldRun()]) },
  { file: 'moraffs-revenge-run.json', log: async () => runLogOf([await moraffsRevengeRun()]) },
  { file: 'unforgiven-chain-run.json', log: unforgivenChain },
];

function fixturePath(file: string): URL {
  return new URL(`./fixtures/${file}`, import.meta.url);
}

describe('the runs kept beside these tests', () => {
  for (const fixture of FIXTURES) {
    it(`verifies ${fixture.file}`, async () => {
      if (process.env.WRITE_RUN_FIXTURES) {
        writeFileSync(fixturePath(fixture.file), `${JSON.stringify(await fixture.log(), null, 2)}\n`);
      }
      const log = readRunLog(readFileSync(fixturePath(fixture.file), 'utf8'));
      if (log === null) throw new Error(`${fixture.file} is not a run log this build reads`);

      const verdict = await verifyRun(log);
      expect(verdict.reason).toBeNull();
      expect(verdict.status).toBe('verified');
      expect(verdict.replayed).toEqual(runTotals(log.sessions));
    });
  }
});
