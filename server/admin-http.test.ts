import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flagAdminPlayer } from './admins';
import { createRunServer } from './http';
import { claimPlayerName } from './players';
import type { Sql } from './sql';
import { openTestDatabase } from './test-sql';

/** A secret is 32 random bytes written base64url, and a test only needs two that differ. */
const JOHNS_DEVICE = 'J'.repeat(43);
const ANOTHER_DEVICE = 'A'.repeat(43);

async function claim(sql: Sql, secret: string, name: string): Promise<string> {
  const claimed = await claimPlayerName(sql, secret, name);
  if (!claimed.claimed || claimed.passphrase === null) throw new Error(`${name} was not claimed`);
  return claimed.passphrase;
}

/**
 * A character with a run, a verdict, an announcement and a row on the board of the living, which
 * is every table a deletion has to take it out of.
 */
async function keepCharacter(sql: Sql, id: string, player: number): Promise<void> {
  await sql.query(
    `INSERT INTO characters (id, player_id, game, name, leaderboard, outcome, finished_at)
     VALUES ($1, $2, 'unforgiven', 'Grond', 'speedrun', 'death', now())`,
    [id, player],
  );
  await sql.query(
    `INSERT INTO sessions (character_id, session_index, seed, engine, game, name, started_at, record,
                           actions, time, edits, milestones)
     VALUES ($1, 0, 7, 'abc', 'unforgiven', 'Grond', '2026-09-01T00:00:00.000Z', '\\x00', 3, 1, 0, '[]')`,
    [id],
  );
  await sql.query(
    `INSERT INTO batches (character_id, session_index, sequence, inputs, pressed, arrived_at, ending)
     VALUES ($1, 0, 0, '[]', 3, 1, true)`,
    [id],
  );
  await sql.query(
    `INSERT INTO verdicts (character_id, status, actions, time, milestones, play_ms, timed, eligible,
                           game, leaderboard, deepest, level, engine_commits)
     VALUES ($1, 'verified', 3, 1, '[]', 5, true, true, 'unforgiven', 'speedrun', 2, 7, '[]')`,
    [id],
  );
  await sql.query(
    `INSERT INTO living (character_id, status, level, deepest, actions, time, game, leaderboard, replayed_through)
     VALUES ($1, 'verified', 7, 2, 3, 1, 'unforgiven', 'speedrun', 1)`,
    [id],
  );
  await sql.query(
    `INSERT INTO announcements (character_id, kind, which, game, leaderboard, player, name, actions,
                                time, floor, dungeon, level, play_ms)
     VALUES ($1, 'death', 0, 'unforgiven', 'speedrun', 'John', 'Grond', 3, 1, 2, 0, 7, 5)`,
    [id],
  );
}

describe('the admin endpoints', () => {
  let sql: Sql;
  let server: Server;
  let origin: string;
  let johns: string;
  let somebodyElses: string;

  beforeEach(async () => {
    sql = await openTestDatabase();
    johns = await claim(sql, JOHNS_DEVICE, 'John');
    somebodyElses = await claim(sql, ANOTHER_DEVICE, 'Moraff');
    await flagAdminPlayer(sql, 'John');
    await keepCharacter(sql, 'moraffs-own', 2);
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

  /** One call as an admin makes it: the passphrase and nothing else. */
  function asAdmin(path: string, passphrase: string, method = 'GET', body?: object): Promise<Response> {
    return fetch(`${origin}${path}`, {
      method,
      headers: { Authorization: `Bearer ${passphrase}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it('answers a caller who is not an admin what an endpoint that is not there answers', async () => {
    for (const asked of [
      fetch(`${origin}/admin/characters`),
      asAdmin('/admin/characters', somebodyElses),
      asAdmin('/admin/characters', 'these six words are not anybody'),
      asAdmin('/admin/characters', JOHNS_DEVICE),
    ]) {
      const response = await asked;
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'No such endpoint: /admin/characters' });
    }
  });

  it('tells a stranger nothing about a character they asked to delete', async () => {
    const response = await asAdmin('/admin/characters/moraffs-own', somebodyElses, 'DELETE');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'No such endpoint: /admin/characters/moraffs-own' });
    expect(await sql.query('SELECT id FROM characters')).toEqual([{ id: 'moraffs-own' }]);
  });

  it('tells an admin that they are one, and what they are called', async () => {
    const response = await asAdmin('/admin/me', johns);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ admin: true, name: 'John' });
  });

  it('tells everybody else nothing about being an admin', async () => {
    for (const asked of [fetch(`${origin}/admin/me`), asAdmin('/admin/me', somebodyElses)]) {
      const response = await asked;
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'No such endpoint: /admin/me' });
    }
  });

  it('hands the admin every character here, whoever’s it is', async () => {
    const response = await asAdmin('/admin/characters', johns);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      page: 1,
      more: false,
      rows: [
        {
          characterId: 'moraffs-own',
          player: 'Moraff',
          name: 'Grond',
          game: 'unforgiven',
          type: 'speedrun',
          status: 'dead',
          lastHeard: null,
        },
      ],
    });
  });

  it('refuses a page of the characters that is not a page', async () => {
    const response = await asAdmin('/admin/characters?page=soon', johns);

    expect(response.status).toBe(400);
  });

  it('deletes another player’s character with everything that points at it', async () => {
    const response = await asAdmin('/admin/characters/moraffs-own', johns, 'DELETE');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ forgotten: 'moraffs-own' });
    for (const table of ['characters', 'sessions', 'batches', 'verdicts', 'living', 'announcements']) {
      expect(await sql.query(`SELECT * FROM ${table}`)).toEqual([]);
    }
  });

  it('writes down who deleted it and which character it was', async () => {
    await asAdmin('/admin/characters/moraffs-own', johns, 'DELETE');

    expect(await sql.query('SELECT player_id, action, about FROM admin_actions')).toEqual([
      { player_id: 1, action: 'forget-character', about: 'moraffs-own' },
    ]);
  });

  it('says there is no such character when the admin names one that is not here', async () => {
    const response = await asAdmin('/admin/characters/nobody', johns, 'DELETE');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'No character here has that name.' });
    expect(await sql.query('SELECT * FROM admin_actions')).toEqual([]);
  });

  it('makes another player an admin, and writes that down too', async () => {
    const response = await asAdmin('/admin/admins', johns, 'POST', { name: 'moraff' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ admin: 'Moraff' });
    expect(await sql.query('SELECT name FROM players WHERE admin ORDER BY id')).toEqual([
      { name: 'John' },
      { name: 'Moraff' },
    ]);
    expect(await sql.query('SELECT player_id, action, about FROM admin_actions')).toEqual([
      { player_id: 1, action: 'flag-admin', about: 'Moraff' },
    ]);
  });

  it('flags nobody when the name is nobody’s', async () => {
    const response = await asAdmin('/admin/admins', johns, 'POST', { name: 'Nobody At All' });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Nobody here has that name.' });
  });

  it('lets a newly flagged admin in, and nobody else', async () => {
    await asAdmin('/admin/admins', johns, 'POST', { name: 'Moraff' });

    expect((await asAdmin('/admin/characters', somebodyElses)).status).toBe(200);
  });

  /** One call as a caller at a named address makes it. The proxy in front of the deployed server
   *  writes the caller's address into this header, and the server reads it back. */
  function asAdminFrom(path: string, passphrase: string, from: string): Promise<Response> {
    return fetch(`${origin}${path}`, {
      headers: { Authorization: `Bearer ${passphrase}`, 'X-Forwarded-For': from },
    });
  }

  it('turns the address that guessed away and lets every other address in', async () => {
    const guessing = '198.51.100.7';
    for (let guess = 0; guess < 5; guess += 1) {
      await asAdminFrom('/admin/me', `six words nobody here has ${guess}`, guessing);
    }

    expect((await asAdminFrom('/admin/me', johns, guessing)).status).toBe(404);
    expect((await asAdminFrom('/admin/me', johns, '203.0.113.4')).status).toBe(200);
  });

  it('is not there for an admin path this server does not know', async () => {
    const response = await asAdmin('/admin/everything', johns);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'No such endpoint: /admin/everything' });
  });
});
