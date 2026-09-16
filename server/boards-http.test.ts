import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CURRENT_ENDLESS_WORLD, RUNS_PER_PAGE } from './boards';
import { createRunServer } from './http';
import type { Sql } from './sql';
import { openTestDatabase } from './test-sql';

/** A run already replayed and written down, which is all a board reads. */
async function keep(
  sql: Sql,
  run: { id: string; game?: string; leaderboard?: string; outcome?: string; actions?: number },
): Promise<void> {
  await sql.query(
    'INSERT INTO characters (id, player_id, game, name, finished_at, outcome) VALUES ($1, 1, $2, $3, $4, $5)',
    [run.id, run.game ?? 'unforgiven', 'Grond', '2026-09-01T00:00:00.000Z', run.outcome ?? 'win'],
  );
  await sql.query(
    `INSERT INTO verdicts (character_id, status, actions, time, milestones, play_ms, timed, eligible,
                           game, leaderboard, deepest, level, engine_commits)
     VALUES ($1, 'verified', $2, 30, '[]', 5000, true, true, $3, $4, 2, 7, '[]')`,
    [run.id, run.actions ?? 100, run.game ?? 'unforgiven', run.leaderboard ?? 'speedrun'],
  );
}

describe('asking the server for a board', () => {
  let sql: Sql;
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES (1, $1)', ['John']);
    await keep(sql, { id: 'slow', actions: 900 });
    await keep(sql, { id: 'quick', actions: 90 });
    await keep(sql, { id: 'faithful-run', leaderboard: 'faithful' });
    server = createRunServer({ allowedOrigin: 'https://johnolek.github.io' }, sql);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((thrown) => (thrown ? reject(thrown) : resolve()));
    });
    await sql.close();
  });

  it("answers with the runs of that game and board, in the board's order", async () => {
    const response = await fetch(`${origin}/boards/unforgiven/speedrun/actions`);

    expect(response.status).toBe(200);
    const board = await response.json();
    expect(board).toMatchObject({ game: 'unforgiven', leaderboard: 'speedrun', board: 'actions', page: 1, more: false });
    expect(board.rows.map((row: { characterId: string }) => row.characterId)).toEqual(['quick', 'slow']);
    expect(board.rows[0]).toMatchObject({ player: 'John', name: 'Grond', actions: 90, clock: 30, playMs: 5000 });
  });

  it("answers with the other board without the first board's runs on it", async () => {
    const response = await fetch(`${origin}/boards/unforgiven/faithful/actions`);

    const board = await response.json();
    expect(board.rows.map((row: { characterId: string }) => row.characterId)).toEqual(['faithful-run']);
  });

  it('is empty for a game nothing has been played in', async () => {
    const response = await fetch(`${origin}/boards/revenge/speedrun/deepest`);

    expect(response.status).toBe(200);
    expect((await response.json()).rows).toEqual([]);
  });

  it('answers with the page asked for', async () => {
    const response = await fetch(`${origin}/boards/unforgiven/speedrun/actions?page=2`);

    const board = await response.json();
    expect(board).toMatchObject({ page: 2, rows: [], more: false });
  });

  it('says there is no such board for a game it does not play', async () => {
    expect((await fetch(`${origin}/boards/wizardry/speedrun/actions`)).status).toBe(404);
  });

  it('says there is no such board for a way of playing that has none', async () => {
    expect((await fetch(`${origin}/boards/unforgiven/debug/actions`)).status).toBe(404);
  });

  it('says there is no such board for a board that does not exist', async () => {
    expect((await fetch(`${origin}/boards/unforgiven/speedrun/richest`)).status).toBe(404);
  });

  it('refuses a page that is not a page number', async () => {
    const response = await fetch(`${origin}/boards/unforgiven/speedrun/actions?page=first`);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('That is not a page of a board.');
  });

  it('holds fifty runs on a page', async () => {
    for (let at = 0; at < RUNS_PER_PAGE; at++) await keep(sql, { id: `deep-${at}`, actions: 1000 + at });

    const board = await (await fetch(`${origin}/boards/unforgiven/speedrun/actions`)).json();

    expect(board.rows).toHaveLength(RUNS_PER_PAGE);
    expect(board.more).toBe(true);
  });
});

describe('asking the server for everyone', () => {
  let sql: Sql;
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES (1, $1)', ['John']);
    await keep(sql, { id: 'champion' });
    await keep(sql, { id: 'faithful-champion', leaderboard: 'faithful' });
    server = createRunServer({ allowedOrigin: 'https://johnolek.github.io' }, sql);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((thrown) => (thrown ? reject(thrown) : resolve()));
    });
    await sql.close();
  });

  it('answers with every character of that game, whichever board it was rolled for', async () => {
    const response = await fetch(`${origin}/boards/unforgiven/everyone`);

    expect(response.status).toBe(200);
    const table = await response.json();
    expect(table.game).toBe('unforgiven');
    expect(table.rows.map((row: { characterId: string }) => row.characterId).sort()).toEqual([
      'champion',
      'faithful-champion',
    ]);
    expect(table.rows[0]).toMatchObject({ player: 'John', name: 'Grond', status: 'won', playing: false });
  });

  it('says there is no such board for a game it does not play', async () => {
    const response = await fetch(`${origin}/boards/chess/everyone`);

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('No such board: chess/everyone');
  });
});

/** A character whose chain has been replayed while it was being played, which is all a board of
 *  the living reads. */
async function alive(
  sql: Sql,
  who: {
    id: string;
    level?: number;
    deepest?: number;
    actions?: number;
    status?: string;
    leaderboard?: string;
    playingUntil?: string | null;
    heardAt?: string;
    ended?: boolean;
    rolledAt?: string;
  },
): Promise<void> {
  await sql.query(
    `INSERT INTO characters (id, player_id, game, name, created_at, finished_at, outcome, leased_to,
                             leased_until, saved_at)
     VALUES ($1, 1, 'unforgiven', $2, $3, $4, $5, 'a-device', $6, $7)`,
    [
      who.id,
      `Grond ${who.id}`,
      who.rolledAt ?? '2026-09-01T00:00:00.000Z',
      who.ended === true ? '2026-09-08T00:00:00.000Z' : null,
      who.ended === true ? 'death' : null,
      who.playingUntil ?? null,
      who.heardAt ?? '2026-09-08T12:00:00.000Z',
    ],
  );
  await sql.query(
    `INSERT INTO living (character_id, status, level, deepest, actions, time, game, leaderboard,
                         replayed_through)
     VALUES ($1, $2, $3, $4, $5, 30, 'unforgiven', $6, 1)`,
    [who.id, who.status ?? 'verified', who.level ?? 3, who.deepest ?? 1, who.actions ?? 100, who.leaderboard ?? 'speedrun'],
  );
}

describe('asking the server for a board of the living', () => {
  let sql: Sql;
  let server: Server;
  let origin: string;

  /** A lease that has not lapsed, far enough ahead to still stand when the board is read. */
  const stillPlaying = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  beforeAll(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES (1, $1)', ['John']);
    await alive(sql, { id: 'low', level: 2, deepest: 4, rolledAt: '2026-09-01T00:00:00.000Z' });
    await alive(sql, {
      id: 'high',
      level: 9,
      deepest: 1,
      playingUntil: stillPlaying,
      heardAt: '2026-09-08T13:00:00.000Z',
      rolledAt: '2026-09-02T00:00:00.000Z',
    });
    await alive(sql, { id: 'not-checked', level: 20, status: 'failed', rolledAt: '2026-09-03T00:00:00.000Z' });
    await alive(sql, { id: 'dead', level: 30, ended: true, rolledAt: '2026-09-04T00:00:00.000Z' });
    await alive(sql, { id: 'faithful-one', level: 15, leaderboard: 'faithful', rolledAt: '2026-09-05T00:00:00.000Z' });
    server = createRunServer({ allowedOrigin: 'https://johnolek.github.io' }, sql);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((thrown) => (thrown ? reject(thrown) : resolve()));
    });
    await sql.close();
  });

  async function living(query: string) {
    const response = await fetch(`${origin}/boards/unforgiven/speedrun/living${query}`);
    return { status: response.status, body: await response.json() };
  }

  it('answers with the living of that game and board, highest level first', async () => {
    const { status, body } = await living('?sort=level');

    expect(status).toBe(200);
    expect(body).toMatchObject({ game: 'unforgiven', leaderboard: 'speedrun', sort: 'level', page: 1, more: false });
    expect(body.rows.map((row: { characterId: string }) => row.characterId)).toEqual(['high', 'low']);
  });

  it('ranks them by how far they have got when asked for that', async () => {
    expect((await living('?sort=deepest')).body.rows.map((row: { characterId: string }) => row.characterId)).toEqual([
      'low',
      'high',
    ]);
  });

  it('ranks them by level when the request names no order', async () => {
    expect((await living('')).body).toMatchObject({ sort: 'level' });
  });

  it('says which of them is being played at this moment, and when each was last heard from', async () => {
    const rows = (await living('?sort=level')).body.rows;

    expect(rows[0]).toMatchObject({
      characterId: 'high',
      player: 'John',
      level: 9,
      deepest: 1,
      actions: 100,
      clock: 30,
      playing: true,
      heardAt: '2026-09-08T13:00:00.000Z',
    });
    expect(rows[1]).toMatchObject({ characterId: 'low', playing: false });
  });

  it('leaves off a character whose chain the replay would not pass', async () => {
    const on = (await living('?sort=level')).body.rows.map((row: { characterId: string }) => row.characterId);

    expect(on).not.toContain('not-checked');
  });

  it('leaves off a character whose run has ended', async () => {
    const on = (await living('?sort=level')).body.rows.map((row: { characterId: string }) => row.characterId);

    expect(on).not.toContain('dead');
  });

  it("leaves off the other board's characters", async () => {
    const on = (await living('?sort=level')).body.rows.map((row: { characterId: string }) => row.characterId);

    expect(on).not.toContain('faithful-one');
    expect((await fetch(`${origin}/boards/unforgiven/faithful/living`)).status).toBe(200);
  });

  it('refuses an order the living are not ranked in', async () => {
    const { status, body } = await living('?sort=richest');

    expect(status).toBe(400);
    expect(body.error).toBe('That is not an order the living are ranked in.');
  });

  it('refuses a page that is not a page number', async () => {
    expect((await living('?page=first')).status).toBe(400);
  });

  it('says there is no such board for a game it does not play', async () => {
    expect((await fetch(`${origin}/boards/wizardry/speedrun/living`)).status).toBe(404);
  });

  it('holds fifty characters on a page', async () => {
    for (let at = 0; at < RUNS_PER_PAGE; at++) {
      await alive(sql, { id: `crowd-${at}`, level: 1, actions: 1000 + at });
    }

    const first = (await living('?sort=level')).body;
    const second = (await living('?sort=level&page=2')).body;

    expect(first.rows).toHaveLength(RUNS_PER_PAGE);
    expect(first.more).toBe(true);
    expect(second.rows).toHaveLength(2);
    expect(second.more).toBe(false);
  });
});

describe('asking the server for the boards of the endless dungeon', () => {
  let sql: Sql;
  let server: Server;
  let origin: string;

  /** A world nobody is rolled into any more, which has a board of its own all the same. */
  const OLDER_WORLD = 9;

  /** An endless run that has been replayed and written down, in the world named. */
  async function keepEndless(run: { id: string; world: number; deepest?: number; kills?: number }): Promise<void> {
    await sql.query(
      `INSERT INTO characters (id, player_id, game, name, created_at, finished_at, outcome, world_seed)
       VALUES ($1, 1, 'unforgiven', $2, '2026-09-01T00:00:00.000Z', '2026-09-08T00:00:00.000Z', 'death', $3)`,
      [run.id, `Grond ${run.id}`, run.world],
    );
    await sql.query(
      `INSERT INTO verdicts (character_id, status, actions, time, milestones, play_ms, timed, eligible,
                             game, leaderboard, deepest, level, kills, engine_commits)
       VALUES ($1, 'verified', 100, 30, '[]', 5000, true, true, 'unforgiven', 'endless', $2, 7, $3, '[]')`,
      [run.id, run.deepest ?? 0, run.kills ?? 0],
    );
  }

  beforeAll(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES (1, $1)', ['John']);
    await keepEndless({ id: 'now-deep', world: CURRENT_ENDLESS_WORLD, deepest: 460, kills: 40 });
    await keepEndless({ id: 'now-shallow', world: CURRENT_ENDLESS_WORLD, deepest: 120, kills: 900 });
    await keepEndless({ id: 'older-world', world: OLDER_WORLD, deepest: 2000, kills: 5 });
    server = createRunServer({ allowedOrigin: 'https://johnolek.github.io' }, sql);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((thrown) => (thrown ? reject(thrown) : resolve()));
    });
    await sql.close();
  });

  async function board(path: string) {
    const response = await fetch(`${origin}/boards/unforgiven/endless${path}`);
    return { status: response.status, body: await response.json() };
  }

  it('answers with the worlds there are boards for, the one being played now first', async () => {
    const { status, body } = await board('/worlds');

    expect(status).toBe(200);
    expect(body).toEqual({
      game: 'unforgiven',
      current: CURRENT_ENDLESS_WORLD,
      worlds: [CURRENT_ENDLESS_WORLD, OLDER_WORLD],
    });
  });

  it('says there is no such board of worlds for a game it does not play', async () => {
    expect((await fetch(`${origin}/boards/chess/endless/worlds`)).status).toBe(404);
  });

  it('answers with the world being played now where the request names none', async () => {
    const { body } = await board('/deepest');

    expect(body).toMatchObject({ leaderboard: 'endless', board: 'deepest', world: CURRENT_ENDLESS_WORLD });
    expect(body.rows.map((row: { characterId: string }) => row.characterId)).toEqual(['now-deep', 'now-shallow']);
  });

  it('answers with the board of the world asked for', async () => {
    const { body } = await board('/deepest?world=9');

    expect(body).toMatchObject({ world: OLDER_WORLD });
    expect(body.rows.map((row: { characterId: string }) => row.characterId)).toEqual(['older-world']);
  });

  it('ranks the monsters killed on the board of kills', async () => {
    const { body } = await board('/kills');

    expect(body.rows.map((row: { characterId: string }) => row.characterId)).toEqual(['now-shallow', 'now-deep']);
    expect(body.rows[0]).toMatchObject({ kills: 900, deepest: 120 });
  });

  it('says there is no such board for a board of wins, there being no winning it', async () => {
    expect((await board('/actions')).status).toBe(404);
    expect((await board('/deaths')).status).toBe(404);
  });

  it('says there is no board of kills for the game as it shipped', async () => {
    expect((await fetch(`${origin}/boards/unforgiven/speedrun/kills`)).status).toBe(404);
  });

  it('refuses a world that is not a world', async () => {
    const { status, body } = await board('/deepest?world=other');

    expect(status).toBe(400);
    expect(body.error).toBe('That is not an endless world.');
  });
});
