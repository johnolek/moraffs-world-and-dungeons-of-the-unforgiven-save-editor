import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFor, allCharacters, flagAdminPlayer, logAdminAction } from './admins';
import { configFromEnvironment } from './config';
import { claimPlayerName } from './players';
import type { Sql } from './sql';
import { openTestDatabase } from './test-sql';

/** A secret is 32 random bytes written base64url, and a test only needs two that differ. */
const JOHNS_DEVICE = 'J'.repeat(43);
const ANOTHER_DEVICE = 'A'.repeat(43);

/** Claims a name and hands back the passphrase that claim was answered with. */
async function claim(sql: Sql, secret: string, name: string): Promise<string> {
  const claimed = await claimPlayerName(sql, secret, name);
  if (!claimed.claimed || claimed.passphrase === null) throw new Error(`${name} was not claimed`);
  return claimed.passphrase;
}

describe('who the admin is', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
  });

  afterEach(async () => {
    await sql.close();
  });

  it('flags the player the box names, whatever case the name is written in', async () => {
    await claim(sql, JOHNS_DEVICE, 'John');

    expect(await flagAdminPlayer(sql, 'JOHN')).toMatchObject({ name: 'John' });
    expect(await sql.query('SELECT admin FROM players')).toEqual([{ admin: true }]);
  });

  it('flags nobody when the box names nobody', async () => {
    await claim(sql, JOHNS_DEVICE, 'John');

    expect(await flagAdminPlayer(sql, null)).toBeNull();
    expect(await sql.query('SELECT admin FROM players')).toEqual([{ admin: false }]);
  });

  it('flags nobody when nobody has claimed that name yet', async () => {
    await claim(sql, JOHNS_DEVICE, 'John');

    expect(await flagAdminPlayer(sql, 'Moraff')).toBeNull();
  });

  it('leaves an admin who is already flagged an admin, since every start flags them again', async () => {
    await claim(sql, JOHNS_DEVICE, 'John');

    await flagAdminPlayer(sql, 'John');
    expect(await flagAdminPlayer(sql, 'John')).toMatchObject({ name: 'John' });
    expect(await sql.query('SELECT admin FROM players')).toEqual([{ admin: true }]);
  });

  it('takes the name from the environment, and none from a box that names none', () => {
    const environment = { DATABASE_URL: 'postgres://nowhere' };

    expect(configFromEnvironment({ ...environment, ADMIN_PLAYER: ' John ' }).adminPlayer).toBe('John');
    expect(configFromEnvironment({ ...environment, ADMIN_PLAYER: '  ' }).adminPlayer).toBeNull();
    expect(configFromEnvironment(environment).adminPlayer).toBeNull();
  });
});

describe('recognising an admin by their passphrase', () => {
  let sql: Sql;
  let johns: string;
  let somebodyElses: string;

  beforeEach(async () => {
    sql = await openTestDatabase();
    johns = await claim(sql, JOHNS_DEVICE, 'John');
    somebodyElses = await claim(sql, ANOTHER_DEVICE, 'Moraff');
    await flagAdminPlayer(sql, 'John');
  });

  afterEach(async () => {
    await sql.close();
  });

  it('is the admin whose words those are', async () => {
    expect(await adminFor(sql, johns)).toMatchObject({ name: 'John' });
  });

  it('reads the words however they are typed off a piece of paper', async () => {
    expect(await adminFor(sql, `  ${johns.toUpperCase().replace(/ /g, '   ')}  `)).toMatchObject({ name: 'John' });
  });

  it('is nobody for the passphrase of a player who is not an admin', async () => {
    expect(await adminFor(sql, somebodyElses)).toBeNull();
  });

  it('is nobody for words nobody was given, and for none at all', async () => {
    expect(await adminFor(sql, 'these six words are not anybody')).toBeNull();
    expect(await adminFor(sql, '')).toBeNull();
    expect(await adminFor(sql, null)).toBeNull();
  });
});

describe('every character here', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES (1, $1), (2, $2)', ['John', 'Moraff']);
    await sql.query(
      `INSERT INTO characters (id, player_id, game, name, created_at, leaderboard, play_lock, outcome, finished_at, saved_at)
       VALUES ('won', 1, 'unforgiven', 'Grond', '2026-09-01', 'speedrun', 'speedrun', 'win', '2026-09-02', '2026-09-02'),
              ('dead', 2, 'revenge', 'Nim', '2026-09-02', NULL, 'faithful', 'death', '2026-09-03', '2026-09-03T00:00:00Z'),
              ('alive', 2, 'moraffsWorld', 'Ash', '2026-09-03', 'endless', 'endless', NULL, NULL, NULL)`,
    );
  });

  afterEach(async () => {
    await sql.close();
  });

  it('is every player’s, the newest first, with what became of each', async () => {
    const page = await allCharacters(sql, 1);

    expect(page).toMatchObject({ page: 1, more: false });
    expect(page.rows).toEqual([
      { characterId: 'alive', player: 'Moraff', name: 'Ash', game: 'moraffsWorld', type: 'endless', status: 'alive', lastHeard: null },
      expect.objectContaining({ characterId: 'dead', player: 'Moraff', type: 'faithful', status: 'dead' }),
      expect.objectContaining({ characterId: 'won', player: 'John', type: 'speedrun', status: 'won' }),
    ]);
    expect(page.rows[1].lastHeard).toBe('2026-09-03T00:00:00.000Z');
  });
});

describe('what an admin did', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await openTestDatabase();
    await sql.query('INSERT INTO players (id, name) VALUES (1, $1)', ['John']);
  });

  afterEach(async () => {
    await sql.close();
  });

  it('is written down with who did it and what they did it to', async () => {
    await logAdminAction(sql, { by: 1, did: 'forget-character', about: 'abc-123' });

    expect(await sql.query('SELECT player_id, action, about FROM admin_actions')).toEqual([
      { player_id: 1, action: 'forget-character', about: 'abc-123' },
    ]);
  });
});
