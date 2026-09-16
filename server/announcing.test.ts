import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Milestone } from '../src/lib/play/run';
import { announceRun, announcementsBefore, type AnnouncedRun } from './announcing';
import type { Sql } from './sql';
import { openTestDatabase } from './test-sql';

const CHARACTER = 'k3p9x1-ab12cd';
const ME = 1;

function reached(over: Partial<Milestone>): Milestone {
  return { kind: 'level', which: 2, actions: 10, time: 20, floor: 3, ...over };
}

function run(over: Partial<AnnouncedRun> = {}): AnnouncedRun {
  return {
    characterId: CHARACTER,
    player: 'Moraff',
    name: 'Grond',
    game: 'unforgiven',
    leaderboard: 'speedrun',
    outcome: 'death',
    milestones: [],
    actions: 120,
    time: 300,
    playMs: 60000,
    ...over,
  };
}

describe('announcing a run that has been checked', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES ($1, $2)', [ME, 'Moraff']);
    await sql.query('INSERT INTO characters (id, player_id, game, name) VALUES ($1, $2, $3, $4)', [
      CHARACTER,
      ME,
      'unforgiven',
      'Grond',
    ]);
  });

  afterEach(async () => {
    await sql.close();
  });

  it('announces each milestone of the chain and then how the run ended', async () => {
    const made = await announceRun(
      sql,
      run({
        milestones: [
          reached({ kind: 'boss', which: 2 }),
          reached({ kind: 'level', which: 12 }),
          reached({ kind: 'death', which: 0, floor: 7 }),
        ],
      }),
    );

    expect(made.map((announcement) => [announcement.kind, announcement.which])).toEqual([
      ['boss', 2],
      ['level', 12],
      ['death', 0],
    ]);
  });

  it('says nothing about a module, a dungeon or a floor reached', async () => {
    const made = await announceRun(
      sql,
      run({
        milestones: [
          reached({ kind: 'dungeon', which: 3 }),
          reached({ kind: 'floor', which: 30 }),
          reached({ kind: 'death', which: 0, floor: 7 }),
        ],
      }),
    );

    expect(made.map((announcement) => announcement.kind)).toEqual(['death']);
  });

  it('says where a death happened, which is the last milestone and what the run had reached', async () => {
    const made = await announceRun(
      sql,
      run({
        milestones: [
          reached({ kind: 'dungeon', which: 2 }),
          reached({ kind: 'level', which: 12 }),
          reached({ kind: 'death', which: 0, floor: 7 }),
        ],
      }),
    );

    expect(made[made.length - 1]).toMatchObject({
      kind: 'death',
      floor: 7,
      dungeon: 2,
      level: 12,
      player: 'Moraff',
      name: 'Grond',
      game: 'unforgiven',
      leaderboard: 'speedrun',
      actions: 120,
      time: 300,
      playMs: 60000,
    });
  });

  it('announces a win rather than a death for a run that was won', async () => {
    const made = await announceRun(sql, run({ outcome: 'win', milestones: [reached({ kind: 'win', which: 0 })] }));

    expect(made.map((announcement) => announcement.kind)).toEqual(['win']);
  });

  it('says nothing twice about one character, however often its run is checked again', async () => {
    const played = run({
      milestones: [reached({ kind: 'boss', which: 2 }), reached({ kind: 'death', which: 0 })],
    });

    expect(await announceRun(sql, played)).toHaveLength(2);
    expect(await announceRun(sql, played)).toEqual([]);
  });

  it('announces only what a later run of the same character added', async () => {
    await announceRun(sql, run({ milestones: [reached({ kind: 'level', which: 4 })] }));

    const later = await announceRun(
      sql,
      run({ milestones: [reached({ kind: 'level', which: 4 }), reached({ kind: 'level', which: 5 })] }),
    );

    expect(later.map((announcement) => [announcement.kind, announcement.which])).toEqual([['level', 5]]);
  });
});

describe('reading the announcements back', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES ($1, $2)', [ME, 'Moraff']);
    await sql.query('INSERT INTO characters (id, player_id, game, name) VALUES ($1, $2, $3, $4)', [
      CHARACTER,
      ME,
      'unforgiven',
      'Grond',
    ]);
    await announceRun(
      sql,
      run({
        milestones: [
          reached({ kind: 'level', which: 2 }),
          reached({ kind: 'level', which: 3 }),
          reached({ kind: 'level', which: 4 }),
        ],
      }),
    );
  });

  afterEach(async () => {
    await sql.close();
  });

  it('answers with the newest first', async () => {
    const page = await announcementsBefore(sql, null, 50);

    expect(page.announcements.map((announcement) => announcement.which)).toEqual([0, 4, 3, 2]);
    expect(page.more).toBe(false);
  });

  it('says there is more behind a page that filled up', async () => {
    const page = await announcementsBefore(sql, null, 2);

    expect(page.announcements).toHaveLength(2);
    expect(page.more).toBe(true);
  });

  it('answers with what is behind the oldest the reader already has', async () => {
    const first = await announcementsBefore(sql, null, 2);

    const next = await announcementsBefore(sql, first.announcements[1].id, 2);

    expect(next.announcements.map((announcement) => announcement.which)).toEqual([3, 2]);
    expect(next.more).toBe(false);
  });
});
