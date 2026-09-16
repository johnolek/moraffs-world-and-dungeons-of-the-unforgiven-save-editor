import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JournalEntry } from '../src/lib/play/journal';
import type { Milestone } from '../src/lib/play/run';
import { announceRun, announcementsBefore, type AnnouncedRun } from './announcing';
import type { Sql } from './sql';
import { openTestDatabase } from './test-sql';

const CHARACTER = 'k3p9x1-ab12cd';
const ME = 1;

function reached(over: Partial<Milestone>): Milestone {
  return { kind: 'level', which: 2, actions: 10, time: 20, floor: 3, ...over };
}

/** A kill of something ordinary, at the action count named. */
function killed(at: number): JournalEntry {
  return {
    at,
    floor: 5,
    module: 2,
    text: 'Killed a GHOUL',
    event: { kind: 'killed', monster: { type: 3, level: 10, name: 'GHOUL' }, experience: 40 },
  };
}

/** Something turned up, as the journal writes it down. */
function found(item: string): JournalEntry {
  return {
    at: 40,
    floor: 9,
    module: 1,
    text: `Found a ${item}`,
    event: { kind: 'found', find: { what: 'item', item } },
  };
}

/** A Shadow of the endless dungeon killed on the floor named. It stands in row 22 of the five a
 *  section loads, which is how a Shadow is told from anything else that died. */
function killedAShadow(floor: number): JournalEntry {
  return {
    at: floor,
    floor,
    module: 0,
    text: 'Killed a SHADOW CENTIPEDE',
    event: { kind: 'killed', monster: { type: 22, level: 300, name: 'SHADOW CENTIPEDE' }, experience: 900 },
  };
}

/** A journal of nothing but kills, one an action. */
function kills(count: number): JournalEntry[] {
  return Array.from({ length: count }, (ignored, index) => killed(index + 1));
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
    journal: [],
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
          reached({ kind: 'level', which: 20 }),
          reached({ kind: 'death', which: 0, floor: 7 }),
        ],
      }),
    );

    expect(made.map((announcement) => [announcement.kind, announcement.which])).toEqual([
      ['boss', 2],
      ['level', 20],
      ['death', 0],
    ]);
  });

  it('announces the twentieth level and every fifth past it, and no other', async () => {
    const made = await announceRun(
      sql,
      run({
        milestones: [15, 19, 20, 21, 25, 30, 32].map((level) => reached({ kind: 'level', which: level })),
      }),
    );

    expect(made.filter((announcement) => announcement.kind === 'level').map((announcement) => announcement.which)).toEqual(
      [20, 25, 30],
    );
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

  it('announces each kill count the run passed, where the kill that passed it happened', async () => {
    const made = await announceRun(sql, run({ journal: kills(600) }));

    expect(made.filter((announcement) => announcement.kind === 'kills')).toMatchObject([
      { which: 100, actions: 100, floor: 5, dungeon: 2 },
      { which: 500, actions: 500, floor: 5, dungeon: 2 },
    ]);
  });

  it('says a kill count once, however many more a later run of the same character kills', async () => {
    await announceRun(sql, run({ journal: kills(120) }));

    const later = await announceRun(sql, run({ journal: kills(600) }));

    expect(later.map((announcement) => [announcement.kind, announcement.which])).toEqual([['kills', 500]]);
  });

  it('announces a rare find by its place in the list of them', async () => {
    const made = await announceRun(sql, run({ journal: [found('RING OF REGENERATION')] }));

    expect(made.filter((announcement) => announcement.kind === 'find')).toMatchObject([
      { which: 5, actions: 40, floor: 9, dungeon: 1 },
    ]);
  });

  it('says nothing about a find that is not one of them', async () => {
    const made = await announceRun(
      sql,
      run({ journal: [found('LONG SWORD'), found('ORANGE POTION'), found('PLUS 3 MACE')] }),
    );

    expect(made.map((announcement) => announcement.kind)).toEqual(['death']);
  });

  it('announces every floor an endless run has taken a Shadow deeper than the one before', async () => {
    const made = await announceRun(
      sql,
      run({
        leaderboard: 'endless',
        journal: [killedAShadow(120), killedAShadow(60), killedAShadow(460), killedAShadow(305)],
      }),
    );

    expect(made.filter((announcement) => announcement.kind === 'shadow').map((announcement) => announcement.which)).toEqual(
      [120, 460],
    );
  });

  it('leaves a Shadow of a run that is on no endless board to its boss milestone', async () => {
    const made = await announceRun(sql, run({ leaderboard: 'speedrun', journal: [killedAShadow(120)] }));

    expect(made.map((announcement) => announcement.kind)).toEqual(['death']);
  });

  it('announces what a character still being played has reached, and nothing about an outcome', async () => {
    const made = await announceRun(
      sql,
      run({
        outcome: null,
        milestones: [reached({ kind: 'boss', which: 2 }), reached({ kind: 'level', which: 20 })],
        journal: kills(100),
      }),
    );

    expect(made.map((announcement) => [announcement.kind, announcement.which])).toEqual([
      ['boss', 2],
      ['level', 20],
      ['kills', 100],
    ]);
    expect(await sql.query('SELECT 1 FROM announcements WHERE kind IN ($1, $2)', ['death', 'win'])).toEqual([]);
  });

  it('says where a death happened, which is the last milestone and what the run had reached', async () => {
    const made = await announceRun(
      sql,
      run({
        milestones: [
          reached({ kind: 'dungeon', which: 2 }),
          reached({ kind: 'level', which: 20 }),
          reached({ kind: 'death', which: 0, floor: 7 }),
        ],
      }),
    );

    expect(made[made.length - 1]).toMatchObject({
      kind: 'death',
      floor: 7,
      dungeon: 2,
      level: 20,
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
    await announceRun(sql, run({ milestones: [reached({ kind: 'level', which: 20 })] }));

    const later = await announceRun(
      sql,
      run({ milestones: [reached({ kind: 'level', which: 20 }), reached({ kind: 'level', which: 25 })] }),
    );

    expect(later.map((announcement) => [announcement.kind, announcement.which])).toEqual([['level', 25]]);
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
          reached({ kind: 'level', which: 20 }),
          reached({ kind: 'level', which: 25 }),
          reached({ kind: 'level', which: 30 }),
        ],
      }),
    );
  });

  afterEach(async () => {
    await sql.close();
  });

  it('answers with the newest first', async () => {
    const page = await announcementsBefore(sql, null, 50);

    expect(page.announcements.map((announcement) => announcement.which)).toEqual([0, 30, 25, 20]);
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

    expect(next.announcements.map((announcement) => announcement.which)).toEqual([25, 20]);
    expect(next.more).toBe(false);
  });
});
