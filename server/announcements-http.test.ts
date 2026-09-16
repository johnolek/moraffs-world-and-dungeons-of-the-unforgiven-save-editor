import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { announceRun } from './announcing';
import { createRunServer } from './http';
import type { Sql } from './sql';
import { openTestDatabase } from './test-sql';

describe('asking the server what it has announced', () => {
  let sql: Sql;
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES (1, $1)', ['Moraff']);
    await sql.exec("INSERT INTO characters (id, player_id, game, name) VALUES ('grond', 1, 'unforgiven', 'Grond')");
    await announceRun(sql, {
      characterId: 'grond',
      player: 'Moraff',
      name: 'Grond',
      game: 'unforgiven',
      leaderboard: 'speedrun',
      outcome: 'death',
      milestones: [
        { kind: 'level', which: 20, actions: 4, time: 10, floor: 1 },
        { kind: 'level', which: 25, actions: 8, time: 20, floor: 2 },
        { kind: 'death', which: 0, actions: 12, time: 30, floor: 2 },
      ],
      actions: 12,
      time: 30,
      playMs: 5000,
    });
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

  it('answers with the announcements newest first', async () => {
    const response = await fetch(`${origin}/announcements`);

    expect(response.status).toBe(200);
    const history = await response.json();
    expect(history.announcements.map((announcement: { kind: string }) => announcement.kind)).toEqual([
      'death',
      'level',
      'level',
    ]);
    expect(history.announcements[0]).toMatchObject({ player: 'Moraff', name: 'Grond', game: 'unforgiven', floor: 2 });
    expect(history.more).toBe(false);
  });

  it('answers with what is behind the oldest the reader already has', async () => {
    const first = await (await fetch(`${origin}/announcements?limit=1`)).json();

    const next = await (await fetch(`${origin}/announcements?before=${first.announcements[0].id}&limit=1`)).json();

    expect(first.more).toBe(true);
    expect(next.announcements.map((announcement: { which: number }) => announcement.which)).toEqual([25]);
  });

  it('refuses a place in the history that is not one', async () => {
    const response = await fetch(`${origin}/announcements?before=lately`);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('That is not a page of the announcements.');
  });

  it('refuses a request for more announcements than a page holds', async () => {
    expect((await fetch(`${origin}/announcements?limit=500`)).status).toBe(400);
  });
});
