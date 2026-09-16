import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JournalEntry } from '../src/lib/play/journal';
import type { Milestone, MilestoneKind } from '../src/lib/play/run';
import type { RunVerdict } from '../src/lib/play/verify';
import { ENDLESS_WORLD_SEED } from '../src/lib/game/endless/rules';
import {
  boardPage,
  boardWorld,
  deepestReach,
  deepestShadowKilled,
  hasBoard,
  highestLevel,
  isBoardLeaderboard,
  killsIn,
  RUNS_PER_PAGE,
  type BoardName,
} from './boards';
import type { EngineStore } from './engines';
import { endRun, takeBatch, type BatchSender } from './runs';
import type { Sql } from './sql';
import { openTestDatabase } from './test-sql';
import { createRunVerifier } from './verifying';
import { currentEndlessWorld } from './worlds';

/** The world a database nobody has set one on is playing, which the migration puts there. */
const WORLD_NOW = ENDLESS_WORLD_SEED;

/** The player whose run a test streams in, playing from one device. */
const ME: BatchSender = { player: 1, device: 'a'.repeat(64) };

function reached(kind: MilestoneKind, which: number, floor = 0): Milestone {
  return { kind, which, actions: 0, time: 0, floor };
}

describe('how far a run got', () => {
  it('is the furthest module a run of Dungeons of the Unforgiven reached', () => {
    expect(deepestReach('unforgiven', [reached('dungeon', 1), reached('dungeon', 3), reached('dungeon', 2)])).toBe(3);
  });

  it("is the furthest dungeon a run of Moraff's World reached", () => {
    expect(deepestReach('moraffsWorld', [reached('dungeon', 4), reached('level', 9)])).toBe(4);
  });

  it('is the place a run started in when it never left it', () => {
    expect(deepestReach('unforgiven', [reached('level', 2), reached('death', 0, 7)])).toBe(0);
  });

  it("is the deepest floor a run of Moraff's Revenge stood on", () => {
    expect(deepestReach('revenge', [reached('floor', 12, 12), reached('death', 0, 9)])).toBe(12);
  });

  it("counts a floor a run of Moraff's Revenge reached without a milestone of its own", () => {
    expect(deepestReach('revenge', [reached('death', 0, 1)])).toBe(1);
  });

  it('is nothing for a run with no milestones at all', () => {
    expect(deepestReach('unforgiven', [])).toBe(0);
  });
});

/** One line of a run's journal: what happened, and the floor the character was standing on. */
function wrote(event: JournalEntry['event'], floor = 0): JournalEntry {
  return { at: 0, floor, module: 3, text: '', event };
}

/** A monster as a kill names it: the row of the section's five it was standing in, which is 22
 *  for the section's Shadow. */
function monster(type: number): { type: number; level: number; name: string } {
  return { type, level: 100, name: 'SHADOW CENTIPEDE' };
}

describe('the deepest floor a run killed a Shadow on', () => {
  it('is the deepest floor a kill of the section boss happened on', () => {
    const journal = [
      wrote({ kind: 'killed', monster: monster(22), experience: 10 }, 120),
      wrote({ kind: 'killed', monster: monster(22), experience: 10 }, 460),
      wrote({ kind: 'killed', monster: monster(22), experience: 10 }, 305),
    ];

    expect(deepestShadowKilled(journal)).toBe(460);
  });

  it('leaves out a floor the run only stood on, however deep a trap door dropped it', () => {
    const journal = [
      wrote({ kind: 'killed', monster: monster(22), experience: 10 }, 120),
      wrote({ kind: 'trapdoorTaken', from: { x: 1, y: 1 }, to: 800 }, 120),
      wrote({ kind: 'floorReached', floor: 800 }, 800),
      wrote({ kind: 'died', monster: null, floor: 800, dungeon: 3 }, 800),
    ];

    expect(deepestShadowKilled(journal)).toBe(120);
  });

  it('leaves out the four monsters of a section that are not its Shadow', () => {
    const journal = [23, 24, 25, 26].map((row) =>
      wrote({ kind: 'killed', monster: monster(row), experience: 10 }, 700),
    );

    expect(deepestShadowKilled(journal)).toBe(0);
  });

  it('is nothing for a run that killed no Shadow at all', () => {
    expect(deepestShadowKilled([])).toBe(0);
  });
});

describe('how many monsters a run killed', () => {
  it('counts every kill of its journal', () => {
    const journal = [
      wrote({ kind: 'killed', monster: monster(22), experience: 10 }, 120),
      wrote({ kind: 'hit', monster: monster(23), damage: 4, breath: null }, 120),
      wrote({ kind: 'killed', monster: monster(24), experience: 10 }, 120),
    ];

    expect(killsIn(journal)).toBe(2);
  });

  it('is nothing for a run with no journal to read', () => {
    expect(killsIn([])).toBe(0);
  });
});

describe('the highest level a run reached', () => {
  it('is the highest of its level milestones', () => {
    expect(highestLevel([reached('level', 2), reached('level', 5), reached('boss', 1)])).toBe(5);
  });

  it('is nothing for a character that never gained one', () => {
    expect(highestLevel([reached('dungeon', 2), reached('death', 0, 4)])).toBe(0);
  });
});

/**
 * A run already replayed and written down, so that a test about the order runs stand in says only
 * what it is about. `boards.test.ts` is the one place that writes a verdict without replaying
 * anything; the test below it goes the whole way through `takeBatch` and the verifier.
 */
interface Kept {
  id: string;
  player: string;
  name: string;
  game: string;
  leaderboard: string | null;
  outcome: 'win' | 'death';
  finishedAt: string;
  actions: number;
  time: number;
  playMs: number;
  timed: boolean;
  eligible: boolean;
  status: string;
  deepest: number;
  level: number;
  kills: number;
  /** The endless world the character was rolled into, and null for one playing the game as it
   *  shipped. */
  worldSeed: number | null;
}

async function keep(sql: Sql, over: Partial<Kept> & { id: string }): Promise<void> {
  const run: Kept = {
    player: 'John',
    name: 'Grond',
    game: 'unforgiven',
    leaderboard: 'speedrun',
    outcome: 'win',
    finishedAt: '2026-09-01T00:00:00.000Z',
    actions: 100,
    time: 100,
    playMs: 100000,
    timed: true,
    eligible: true,
    status: 'verified',
    deepest: 0,
    level: 0,
    kills: 0,
    worldSeed: null,
    ...over,
  };
  const held = await sql.query<{ id: number }>('SELECT id FROM players WHERE name = $1', [run.player]);
  const players =
    held.length > 0
      ? held
      : await sql.query<{ id: number }>('INSERT INTO players (name) VALUES ($1) RETURNING id', [run.player]);
  await sql.query(
    `INSERT INTO characters (id, player_id, game, name, finished_at, outcome, world_seed)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [run.id, players[0].id, run.game, run.name, run.finishedAt, run.outcome, run.worldSeed],
  );
  await sql.query(
    `INSERT INTO verdicts (character_id, status, reason, actions, time, milestones, play_ms, timed,
                           eligible, game, leaderboard, deepest, level, kills, engine_commits)
     VALUES ($1, $2, NULL, $3, $4, '[]', $5, $6, $7, $8, $9, $10, $11, $12, '[]')`,
    [
      run.id,
      run.status,
      run.actions,
      run.time,
      run.playMs,
      run.timed,
      run.eligible,
      run.game,
      run.leaderboard,
      run.deepest,
      run.level,
      run.kills,
    ],
  );
}

async function ids(
  sql: Sql,
  board: BoardName,
  over: { game?: string; leaderboard?: string; page?: number; world?: number } = {},
): Promise<string[]> {
  const leaderboard = over.leaderboard ?? 'speedrun';
  const page = await boardPage(sql, {
    game: over.game ?? 'unforgiven',
    leaderboard,
    board,
    page: over.page ?? 1,
    world: await boardWorld(sql, leaderboard, over.world ?? null),
  });
  return page.rows.map((row) => row.characterId);
}

describe('the order a board puts runs in', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
  });

  afterEach(async () => {
    await sql.close();
  });

  it('puts the wins with the fewest actions first', async () => {
    await keep(sql, { id: 'slow', actions: 900 });
    await keep(sql, { id: 'quick', actions: 90 });
    await keep(sql, { id: 'died', actions: 9, outcome: 'death' });

    expect(await ids(sql, 'actions')).toEqual(['quick', 'slow']);
  });

  it("puts the wins with the least on the game's own clock first", async () => {
    await keep(sql, { id: 'later', time: 900 });
    await keep(sql, { id: 'sooner', time: 90 });

    expect(await ids(sql, 'clock')).toEqual(['sooner', 'later']);
  });

  it('puts the wins played in the least time first, and leaves out the ones nobody timed', async () => {
    await keep(sql, { id: 'long', playMs: 900000 });
    await keep(sql, { id: 'short', playMs: 90000 });
    await keep(sql, { id: 'untimed', playMs: 90000, timed: false });
    await keep(sql, { id: 'never-watched', playMs: 0 });

    expect(await ids(sql, 'wall')).toEqual(['short', 'long']);
  });

  it('puts the runs that got furthest first, and the fewest actions first among them', async () => {
    await keep(sql, { id: 'shallow', deepest: 1 });
    await keep(sql, { id: 'deep-slow', deepest: 4, actions: 900 });
    await keep(sql, { id: 'deep-quick', deepest: 4, actions: 90 });

    expect(await ids(sql, 'deepest')).toEqual(['deep-quick', 'deep-slow', 'shallow']);
  });

  it('puts the highest level first, whether the run was won or lost', async () => {
    await keep(sql, { id: 'low', level: 2 });
    await keep(sql, { id: 'high', level: 20, outcome: 'death' });

    expect(await ids(sql, 'level')).toEqual(['high', 'low']);
  });

  it('puts the newest death first, and says where it happened and at what level', async () => {
    await keep(sql, { id: 'older', outcome: 'death', finishedAt: '2026-09-01T00:00:00.000Z' });
    await keep(sql, { id: 'newer', outcome: 'death', finishedAt: '2026-09-08T00:00:00.000Z', deepest: 3, level: 7 });
    await keep(sql, { id: 'won' });

    const page = await boardPage(sql, {
      game: 'unforgiven',
      leaderboard: 'speedrun',
      board: 'deaths',
      page: 1,
      world: null,
    });

    expect(page.rows.map((row) => row.characterId)).toEqual(['newer', 'older']);
    expect(page.rows[0]).toMatchObject({ deepest: 3, level: 7, outcome: 'death', player: 'John', name: 'Grond' });
  });
});

describe('which runs a board holds at all', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
  });

  afterEach(async () => {
    await sql.close();
  });

  it('never mixes faithful with speedrun', async () => {
    await keep(sql, { id: 'faithful-run', leaderboard: 'faithful' });
    await keep(sql, { id: 'speedrun-run', leaderboard: 'speedrun' });

    expect(await ids(sql, 'actions', { leaderboard: 'faithful' })).toEqual(['faithful-run']);
    expect(await ids(sql, 'actions', { leaderboard: 'speedrun' })).toEqual(['speedrun-run']);
  });

  it('never mixes one game with another', async () => {
    await keep(sql, { id: 'unforgiven-run', game: 'unforgiven' });
    await keep(sql, { id: 'revenge-run', game: 'revenge' });

    expect(await ids(sql, 'actions', { game: 'revenge' })).toEqual(['revenge-run']);
  });

  it('leaves out a run that may not be on a board', async () => {
    await keep(sql, { id: 'edited', eligible: false });

    expect(await ids(sql, 'deepest')).toEqual([]);
  });

  it('leaves out a run that was never verified', async () => {
    await keep(sql, { id: 'unchecked', status: 'unverifiable', eligible: false });

    expect(await ids(sql, 'deepest')).toEqual([]);
  });

  it('never mixes an endless run with the runs of the game as it shipped', async () => {
    await keep(sql, { id: 'endless-run', leaderboard: 'endless', worldSeed: WORLD_NOW, deepest: 460 });

    expect(isBoardLeaderboard('endless')).toBe(true);
    expect(await ids(sql, 'deepest', { leaderboard: 'endless' })).toEqual(['endless-run']);
    expect(await ids(sql, 'deepest', { leaderboard: 'faithful' })).toEqual([]);
    expect(await ids(sql, 'deepest', { leaderboard: 'speedrun' })).toEqual([]);
  });

  it('leaves out a character that was rolled for no board', async () => {
    await keep(sql, { id: 'free', leaderboard: null });

    expect(await ids(sql, 'deepest')).toEqual([]);
    expect(await ids(sql, 'deepest', { leaderboard: 'faithful' })).toEqual([]);
  });
});

describe('the boards of the endless dungeon', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
  });

  afterEach(async () => {
    await sql.close();
  });

  /** Another world than the one being played now, which is a board of its own. */
  const OLDER_WORLD = 9;

  it('starts at the world the site rolls a character into when the server cannot be reached', async () => {
    expect(await currentEndlessWorld(sql)).toBe(ENDLESS_WORLD_SEED);
  });

  it('holds the runs of one world and not another world’s', async () => {
    await keep(sql, { id: 'now', leaderboard: 'endless', worldSeed: WORLD_NOW, deepest: 300 });
    await keep(sql, { id: 'before', leaderboard: 'endless', worldSeed: OLDER_WORLD, deepest: 900 });

    expect(await ids(sql, 'deepest', { leaderboard: 'endless' })).toEqual(['now']);
    expect(await ids(sql, 'deepest', { leaderboard: 'endless', world: OLDER_WORLD })).toEqual(['before']);
  });

  it('reads the world being played now for a request that names none', async () => {
    await keep(sql, { id: 'now', leaderboard: 'endless', worldSeed: WORLD_NOW });

    expect(await boardWorld(sql, 'endless', null)).toBe(WORLD_NOW);
    expect(await boardWorld(sql, 'faithful', null)).toBeNull();
    expect(await ids(sql, 'deepest', { leaderboard: 'endless' })).toEqual(['now']);
  });

  it('puts the run that killed the most first on the board of kills', async () => {
    const world = { leaderboard: 'endless', worldSeed: WORLD_NOW };
    await keep(sql, { id: 'butcher', ...world, kills: 4000 });
    await keep(sql, { id: 'tourist', ...world, kills: 12 });

    expect(await ids(sql, 'kills', { leaderboard: 'endless' })).toEqual(['butcher', 'tourist']);
  });

  it('puts the deepest Shadow first, and the fewest actions first among equals', async () => {
    const world = { leaderboard: 'endless', worldSeed: WORLD_NOW };
    await keep(sql, { id: 'shallow', ...world, deepest: 120 });
    await keep(sql, { id: 'deep-slow', ...world, deepest: 460, actions: 900 });
    await keep(sql, { id: 'deep-quick', ...world, deepest: 460, actions: 90 });

    expect(await ids(sql, 'deepest', { leaderboard: 'endless' })).toEqual(['deep-quick', 'deep-slow', 'shallow']);
  });

  it('offers no board of wins, there being no winning it, and no kills anywhere else', () => {
    expect(hasBoard('endless', 'deepest')).toBe(true);
    expect(hasBoard('endless', 'level')).toBe(true);
    expect(hasBoard('endless', 'kills')).toBe(true);
    expect(hasBoard('endless', 'actions')).toBe(false);
    expect(hasBoard('endless', 'clock')).toBe(false);
    expect(hasBoard('endless', 'wall')).toBe(false);
    expect(hasBoard('endless', 'deaths')).toBe(false);
    expect(hasBoard('faithful', 'kills')).toBe(false);
    expect(hasBoard('speedrun', 'actions')).toBe(true);
  });
});

describe('paging a board', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
    for (let at = 0; at < RUNS_PER_PAGE + 2; at++) await keep(sql, { id: `run-${at}`, actions: at });
  });

  afterEach(async () => {
    await sql.close();
  });

  it('holds fifty runs on a page and says there is another', async () => {
    const page = await boardPage(sql, {
      game: 'unforgiven',
      leaderboard: 'speedrun',
      board: 'actions',
      page: 1,
      world: null,
    });

    expect(page.rows).toHaveLength(RUNS_PER_PAGE);
    expect(page.rows[0].characterId).toBe('run-0');
    expect(page.more).toBe(true);
  });

  it('goes on from where the page before it stopped', async () => {
    const page = await boardPage(sql, {
      game: 'unforgiven',
      leaderboard: 'speedrun',
      board: 'actions',
      page: 2,
      world: null,
    });

    expect(page.rows.map((row) => row.characterId)).toEqual(['run-50', 'run-51']);
    expect(page.more).toBe(false);
  });

  it('is empty past the end of the board', async () => {
    expect(await ids(sql, 'actions', { page: 3 })).toEqual([]);
  });
});

describe('a run that went the whole way through the verifier', () => {
  const ENGINE = 'a'.repeat(40);
  const CHARACTER = 'k3p9x1-ab12cd';

  /** A build that passes the run it is handed, reaching the milestones the boards read. */
  const engines: EngineStore = {
    keptCommits: () => Promise.resolve([ENGINE]),
    engineFor: () =>
      Promise.resolve({
        kept: true,
        engine: {
          commit: ENGINE,
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
              claimed: { actions: 12, time: 30, milestones: [] },
              replayed: {
                actions: 12,
                time: 30,
                milestones: [
                  { kind: 'dungeon', which: 3, actions: 6, time: 12, floor: 2 },
                  { kind: 'level', which: 8, actions: 9, time: 20, floor: 2 },
                  { kind: 'win', which: 0, actions: 12, time: 30, floor: 2 },
                ],
              },
              journal: [],
              ending: null,
            } as RunVerdict),
        },
      }),
  };

  it('stands on the boards of its game and its own leaderboard', async () => {
    const sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES (1, $1)', ['John']);
    const won: Milestone[] = [{ kind: 'win', which: 0, actions: 12, time: 30, floor: 2 }];
    const claims = { mode: 'speedrun', actions: 12, time: 30, edits: 0, milestones: [] as Milestone[] };
    await takeBatch(
      sql,
      CHARACTER,
      ME,
      {
        sessionIndex: 0,
        sequence: 0,
        inputs: [104],
        pressed: 1,
        ending: false,
        claims,
        session: {
          seed: 12345,
          engine: ENGINE,
          game: 'unforgiven',
          leaderboard: 'speedrun',
          sound: null,
          name: 'Grond',
          startedAt: '2026-09-09T12:00:00.000Z',
          record: 'AAEC',
        },
      },
      1000,
    );
    await takeBatch(
      sql,
      CHARACTER,
      ME,
      { sessionIndex: 0, sequence: 1, inputs: [106], pressed: 1, ending: true, claims: { ...claims, milestones: won } },
      6000,
    );
    await endRun(sql, CHARACTER, 'win');
    const verifier = createRunVerifier(sql, engines, () => {});
    verifier.verifySoon(CHARACTER);
    await verifier.idle();

    const page = await boardPage(sql, {
      game: 'unforgiven',
      leaderboard: 'speedrun',
      board: 'actions',
      page: 1,
      world: null,
    });

    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({
      characterId: CHARACTER,
      player: 'John',
      name: 'Grond',
      actions: 12,
      clock: 30,
      playMs: 5000,
      timed: true,
      deepest: 3,
      level: 8,
      outcome: 'win',
    });
    expect(await ids(sql, 'actions', { leaderboard: 'faithful' })).toEqual([]);
    await sql.close();
  });
});
