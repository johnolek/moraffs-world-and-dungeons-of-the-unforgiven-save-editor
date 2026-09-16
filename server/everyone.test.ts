import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { everyoneOf, statusOf, type EveryoneRow } from './everyone';
import type { Sql } from './sql';
import { openTestDatabase } from './test-sql';

/**
 * A run already replayed and written down, so that a test about who is in the table says only
 * what it is about. Nothing here replays anything: `server/verifying.test.ts` is where a verdict
 * being written is the thing under test.
 */
interface Ended {
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
  record: Uint8Array | null;
}

async function ended(sql: Sql, over: Partial<Ended> & { id: string }): Promise<void> {
  const run: Ended = {
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
    record: null,
    ...over,
  };
  await sql.query(
    `INSERT INTO characters (id, player_id, game, name, finished_at, outcome, record)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [run.id, await playerId(sql, run.player), run.game, run.name, run.finishedAt, run.outcome, run.record],
  );
  await sql.query(
    `INSERT INTO verdicts (character_id, status, reason, actions, time, milestones, play_ms, timed,
                           eligible, game, leaderboard, deepest, level, engine_commits)
     VALUES ($1, $2, NULL, $3, $4, '[]', $5, $6, $7, $8, $9, $10, $11, '[]')`,
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
    ],
  );
}

/** A character whose chain has been replayed while it was being played, which is the other half
 *  of the table. */
interface Alive {
  id: string;
  player: string;
  name: string;
  game: string;
  leaderboard: string | null;
  status: string;
  level: number;
  deepest: number;
  actions: number;
  time: number;
  playingUntil: string | null;
  heardAt: string;
  finishedAt: string | null;
  record: Uint8Array | null;
}

async function alive(sql: Sql, over: Partial<Alive> & { id: string }): Promise<void> {
  const who: Alive = {
    player: 'John',
    name: 'Thok',
    game: 'unforgiven',
    leaderboard: 'speedrun',
    status: 'verified',
    level: 3,
    deepest: 1,
    actions: 40,
    time: 60,
    playingUntil: null,
    heardAt: '2026-09-08T12:00:00.000Z',
    finishedAt: null,
    record: null,
    ...over,
  };
  await sql.query(
    `INSERT INTO characters (id, player_id, game, name, finished_at, leased_to, leased_until,
                             saved_at, record)
     VALUES ($1, $2, $3, $4, $5, 'a-device', $6, $7, $8)`,
    [
      who.id,
      await playerId(sql, who.player),
      who.game,
      who.name,
      who.finishedAt,
      who.playingUntil,
      who.heardAt,
      who.record,
    ],
  );
  await sql.query(
    `INSERT INTO living (character_id, status, level, deepest, actions, time, game, leaderboard,
                         replayed_through)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)`,
    [who.id, who.status, who.level, who.deepest, who.actions, who.time, who.game, who.leaderboard],
  );
}

async function playerId(sql: Sql, name: string): Promise<number> {
  const held = await sql.query<{ id: number }>('SELECT id FROM players WHERE name = $1', [name]);
  if (held.length > 0) return held[0].id;
  const made = await sql.query<{ id: number }>('INSERT INTO players (name) VALUES ($1) RETURNING id', [name]);
  return made[0].id;
}

/** Where the six characteristics sit in a Dungeons of the Unforgiven record. */
const STAT_OFFSETS = [0x816, 0x818, 0x81a, 0x81c, 0x81e, 0x820];

/** A Dungeons of the Unforgiven record with the fields the status block reads written into it,
 *  built the way `src/lib/character/record.test.ts` builds one. */
function unforgivenRecord(of: {
  cls: number;
  hp: number;
  maxHp: number;
  level: number;
  stats: number[];
}): Uint8Array {
  const bytes = new Uint8Array(0x900);
  const view = new DataView(bytes.buffer);
  view.setInt8(0x2a, of.cls);
  view.setInt16(0x31, of.hp, true);
  view.setInt16(0x33, of.maxHp, true);
  view.setInt16(0x7ac, of.level, true);
  STAT_OFFSETS.forEach((offset, index) => view.setInt16(offset, of.stats[index], true));
  return bytes;
}

async function rows(sql: Sql, game = 'unforgiven', now = Date.now()): Promise<EveryoneRow[]> {
  return (await everyoneOf(sql, game, now)).rows;
}

async function ids(sql: Sql, game = 'unforgiven'): Promise<string[]> {
  return (await rows(sql, game)).map((row) => row.characterId);
}

describe('who is in the table of everyone', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
  });

  afterEach(async () => {
    await sql.close();
  });

  it('has a run that was won and a run that ended in a death, each said to be what it is', async () => {
    await ended(sql, { id: 'champion', outcome: 'win', level: 9 });
    await ended(sql, { id: 'corpse', outcome: 'death', level: 4 });

    expect(await rows(sql)).toMatchObject([
      { characterId: 'champion', status: 'won', playing: false },
      { characterId: 'corpse', status: 'dead', playing: false },
    ]);
  });

  it('carries what an ended run came to and when it ended', async () => {
    await ended(sql, {
      id: 'champion',
      name: 'Grond',
      leaderboard: 'faithful',
      actions: 700,
      time: 900,
      playMs: 123000,
      deepest: 3,
      level: 9,
    });

    expect((await rows(sql))[0]).toMatchObject({
      player: 'John',
      name: 'Grond',
      leaderboard: 'faithful',
      level: 9,
      deepest: 3,
      actions: 700,
      clock: 900,
      playMs: 123000,
      timed: true,
      at: '2026-09-01T00:00:00.000Z',
    });
  });

  it('has a character still being played, and says when it was last heard from', async () => {
    await alive(sql, { id: 'wanderer', level: 5, deepest: 2, actions: 40, time: 60 });

    expect((await rows(sql))[0]).toMatchObject({
      characterId: 'wanderer',
      status: 'alive',
      playing: false,
      level: 5,
      deepest: 2,
      actions: 40,
      clock: 60,
      at: '2026-09-08T12:00:00.000Z',
    });
  });

  it('has no play time for a character still being played, since the run has not ended', async () => {
    await alive(sql, { id: 'wanderer' });

    expect((await rows(sql))[0]).toMatchObject({ playMs: 0, timed: false });
  });

  it('says which character a device is playing at this moment', async () => {
    const now = Date.parse('2026-09-08T12:00:30.000Z');
    await alive(sql, { id: 'playing-now', playingUntil: '2026-09-08T12:01:00.000Z' });
    await alive(sql, { id: 'put-down', playingUntil: '2026-09-08T11:00:00.000Z' });

    const held = await rows(sql, 'unforgiven', now);

    expect(held.find((row) => row.characterId === 'playing-now')?.playing).toBe(true);
    expect(held.find((row) => row.characterId === 'put-down')?.playing).toBe(false);
  });

  it('shows a character whose run has ended once, as the run it ended as', async () => {
    await ended(sql, { id: 'fallen', outcome: 'death' });
    // The replays made while the character was alive leave a snapshot behind, and it is still
    // there after the run has ended.
    await sql.query(
      `INSERT INTO living (character_id, status, level, deepest, actions, time, game, leaderboard,
                           replayed_through)
       VALUES ('fallen', 'verified', 3, 1, 40, 60, 'unforgiven', 'speedrun', 1)`,
    );

    expect(await ids(sql)).toEqual(['fallen']);
    expect((await rows(sql))[0].status).toBe('dead');
  });

  it('leaves out a run the replay would not pass and one that may not go on a board', async () => {
    await ended(sql, { id: 'ok' });
    await ended(sql, { id: 'unchecked', status: 'unverifiable', eligible: false });
    await ended(sql, { id: 'edited', eligible: false });

    expect(await ids(sql)).toEqual(['ok']);
  });

  it('leaves out a character whose chain the replay would not pass', async () => {
    await alive(sql, { id: 'ok' });
    await alive(sql, { id: 'not-checked', status: 'failed' });

    expect(await ids(sql)).toEqual(['ok']);
  });

  it('leaves out another game’s characters', async () => {
    await ended(sql, { id: 'here' });
    await ended(sql, { id: 'elsewhere', game: 'revenge' });
    await alive(sql, { id: 'alive-elsewhere', game: 'revenge' });

    expect(await ids(sql)).toEqual(['here']);
    expect(await ids(sql, 'revenge')).toEqual(['alive-elsewhere', 'elsewhere']);
  });

  it('puts both boards in the one table', async () => {
    await ended(sql, { id: 'quick', leaderboard: 'speedrun', level: 4 });
    await ended(sql, { id: 'true-to-it', leaderboard: 'faithful', level: 9 });
    await alive(sql, { id: 'still-going', leaderboard: 'faithful', level: 6 });

    expect(await ids(sql)).toEqual(['true-to-it', 'still-going', 'quick']);
  });
});

describe('the order the table arrives in', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
  });

  afterEach(async () => {
    await sql.close();
  });

  it('puts the highest level first, then the furthest, then the fewest actions', async () => {
    await ended(sql, { id: 'low', level: 2, deepest: 9, actions: 10 });
    await ended(sql, { id: 'high-shallow', level: 9, deepest: 1, actions: 10 });
    await ended(sql, { id: 'high-deep-slow', level: 9, deepest: 4, actions: 900 });
    await ended(sql, { id: 'high-deep-quick', level: 9, deepest: 4, actions: 90 });

    expect(await ids(sql)).toEqual(['high-deep-quick', 'high-deep-slow', 'high-shallow', 'low']);
  });

  it('settles two characters that stand alike by name', async () => {
    await ended(sql, { id: 'second', name: 'Zog' });
    await alive(sql, { id: 'first', name: 'Arka', level: 0, deepest: 0, actions: 100 });

    expect(await ids(sql)).toEqual(['first', 'second']);
  });
});

describe('what a character is now', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
  });

  afterEach(async () => {
    await sql.close();
  });

  it('is read out of the newest record the server was sent', async () => {
    await alive(sql, {
      id: 'sagey',
      record: unforgivenRecord({ cls: 5, hp: 5690, maxHp: 5808, level: 45, stats: [94, 88, 63, 101, 70, 55] }),
    });

    expect((await rows(sql))[0].now).toEqual({
      cls: 'Sage',
      hp: 5690,
      maxHp: 5808,
      stats: [94, 88, 63, 101, 70, 55],
    });
  });

  it('is beside the level the replay found rather than the record’s own', async () => {
    await ended(sql, {
      id: 'grond',
      level: 12,
      record: unforgivenRecord({ cls: 0, hp: 10, maxHp: 20, level: 45, stats: [1, 2, 3, 4, 5, 6] }),
    });

    expect((await rows(sql))[0]).toMatchObject({ level: 12, now: { cls: 'Fighter' } });
  });

  it('reads the whole of a character for a run’s page, not only the table’s few numbers', () => {
    const record = unforgivenRecord({ cls: 5, hp: 5690, maxHp: 5808, level: 45, stats: [94, 88, 63, 101, 70, 55] });

    const status = statusOf('unforgiven', 'SAGEY', record);

    expect(status).toMatchObject({ cls: 'Sage', lev: 45, hp: 5690, maxHp: 5808 });
    expect(status?.stats.map((stat) => stat.value)).toEqual([94, 88, 63, 101, 70, 55]);
  });

  it('reads nothing out of bytes that are no character', () => {
    expect(statusOf('unforgiven', 'SHORTY', new Uint8Array(3))).toBeNull();
    expect(statusOf('unforgiven', 'NOBODY', null)).toBeNull();
  });

  it('is nothing for a character the server holds no record of', async () => {
    await alive(sql, { id: 'unknown', record: null });

    expect((await rows(sql))[0].now).toBeNull();
  });

  it('is nothing for a record too short to read a character out of', async () => {
    await alive(sql, { id: 'stub', record: new Uint8Array(0x40) });

    expect((await rows(sql))[0].now).toBeNull();
  });
});
