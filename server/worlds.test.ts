import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENDLESS_WORLD_SEED } from '../src/lib/game/endless/rules';
import { flagAdminPlayer } from './admins';
import { endlessWorlds } from './board-worlds';
import { createRunServer } from './http';
import { claimPlayerName } from './players';
import type { Sql } from './sql';
import { openTestDatabase } from './test-sql';
import { currentEndlessWorld, drawEndlessWorld, isEndlessWorldSeed, setEndlessWorld } from './worlds';

const JOHNS_DEVICE = 'J'.repeat(43);

/** A run of the endless dungeon already replayed and written down, in the world named. */
async function keepEndless(sql: Sql, run: { id: string; world: number }): Promise<void> {
  await sql.query(
    `INSERT INTO characters (id, player_id, game, name, finished_at, outcome, world_seed)
     VALUES ($1, 1, 'unforgiven', 'Grond', now(), 'death', $2)`,
    [run.id, run.world],
  );
  await sql.query(
    `INSERT INTO verdicts (character_id, status, actions, time, milestones, play_ms, timed, eligible,
                           game, leaderboard, deepest, level, kills, engine_commits)
     VALUES ($1, 'verified', 100, 30, '[]', 5000, true, true, 'unforgiven', 'endless', 40, 7, 3, '[]')`,
    [run.id],
  );
}

describe('the endless world being rolled into', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES (1, $1)', ['John']);
  });

  afterEach(async () => {
    await sql.close();
  });

  it('starts at the world the site falls back to when the server cannot be reached', async () => {
    expect(await currentEndlessWorld(sql)).toBe(ENDLESS_WORLD_SEED);
  });

  it('is the world the admin set last', async () => {
    await setEndlessWorld(sql, { seed: 77, by: 1 });
    await setEndlessWorld(sql, { seed: 88, by: 1 });

    expect(await currentEndlessWorld(sql)).toBe(88);
  });

  it('keeps every world that was ever set, with when it was set and by whom', async () => {
    await setEndlessWorld(sql, { seed: 77, by: 1 });

    expect(await sql.query('SELECT seed, set_by FROM worlds ORDER BY id')).toEqual([
      { seed: ENDLESS_WORLD_SEED, set_by: null },
      { seed: 77, set_by: 1 },
    ]);
  });

  it('calls the new world current on the boards and offers the old one still', async () => {
    await keepEndless(sql, { id: 'in-the-old-world', world: ENDLESS_WORLD_SEED });
    await setEndlessWorld(sql, { seed: 77, by: 1 });

    expect(await endlessWorlds(sql, 'unforgiven')).toEqual({
      game: 'unforgiven',
      current: 77,
      worlds: [77, ENDLESS_WORLD_SEED],
    });
  });

  it('leaves a character rolled before on the board of the world it was rolled into', async () => {
    await keepEndless(sql, { id: 'in-the-old-world', world: ENDLESS_WORLD_SEED });
    await setEndlessWorld(sql, { seed: 77, by: 1 });

    const older = await sql.query('SELECT world_seed FROM characters WHERE id = $1', ['in-the-old-world']);
    expect(older).toEqual([{ world_seed: ENDLESS_WORLD_SEED }]);
  });

  it('draws a world that is a world', () => {
    expect(isEndlessWorldSeed(drawEndlessWorld())).toBe(true);
  });

  it('is a whole number a 32-bit seed holds, and nothing else', () => {
    expect(isEndlessWorldSeed(1)).toBe(true);
    expect(isEndlessWorldSeed(2 ** 31 - 1)).toBe(true);
    expect(isEndlessWorldSeed(0)).toBe(false);
    expect(isEndlessWorldSeed(-1)).toBe(false);
    expect(isEndlessWorldSeed(2 ** 31)).toBe(false);
    expect(isEndlessWorldSeed(1.5)).toBe(false);
    expect(isEndlessWorldSeed('77')).toBe(false);
  });
});

describe('asking the server which endless world is being played', () => {
  let sql: Sql;
  let server: Server;
  let origin: string;
  let johns: string;

  beforeEach(async () => {
    sql = await openTestDatabase();
    const claimed = await claimPlayerName(sql, JOHNS_DEVICE, 'John');
    if (!claimed.claimed || claimed.passphrase === null) throw new Error('John was not claimed');
    johns = claimed.passphrase;
    await flagAdminPlayer(sql, 'John');
    server = createRunServer({ allowedOrigin: 'https://johnolek.github.io' }, sql);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((thrown) => (thrown ? reject(thrown) : resolve()));
    });
    await sql.close();
  });

  function setWorld(body: object, passphrase = johns): Promise<Response> {
    return fetch(`${origin}/admin/worlds/endless`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${passphrase}` },
      body: JSON.stringify(body),
    });
  }

  it('tells anybody at all which world a character rolled now is rolled into', async () => {
    const response = await fetch(`${origin}/worlds/endless/current`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ world: ENDLESS_WORLD_SEED });
  });

  it('hands out the world the admin set, from then on', async () => {
    expect((await setWorld({ seed: 77 })).status).toBe(200);

    expect(await (await fetch(`${origin}/worlds/endless/current`)).json()).toEqual({ world: 77 });
  });

  it('draws a world for an admin who names none', async () => {
    const response = await setWorld({});

    const { world } = (await response.json()) as { world: number };
    expect(isEndlessWorldSeed(world)).toBe(true);
    expect(await currentEndlessWorld(sql)).toBe(world);
  });

  it('writes down which admin set which world', async () => {
    await setWorld({ seed: 77 });

    expect(await sql.query('SELECT player_id, action, about FROM admin_actions')).toEqual([
      { player_id: 1, action: 'set-endless-world', about: '77' },
    ]);
  });

  it('refuses a world that is not a number a world can be', async () => {
    const response = await setWorld({ seed: -3 });

    expect(response.status).toBe(400);
    expect(await currentEndlessWorld(sql)).toBe(ENDLESS_WORLD_SEED);
  });

  it('lets nobody but an admin set one, and says nothing about the endpoint to anybody else', async () => {
    const response = await setWorld({ seed: 77 }, 'these six words are not anybody');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'No such endpoint: /admin/worlds/endless' });
    expect(await currentEndlessWorld(sql)).toBe(ENDLESS_WORLD_SEED);
  });
});
