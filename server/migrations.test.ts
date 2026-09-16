import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { migrateRunDatabase } from './db';
import { applyMigrations, BUNDLED_MIGRATIONS, type Migration } from './migrations';
import { playerNameFor } from './players';
import { SCHEMA, type Sql } from './sql';
import { openTestDatabase } from './test-sql';

/** The migration that made the table of devices, so a test can run everything before it. */
const PASSPHRASES = '007_passphrases.sql';

const bookkeeping: Migration = {
  name: '001_schema_migrations.sql',
  sql: 'CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz)',
};

/** A database with this server's schema made but nothing migrated into it, which is where a
 *  migration runner starts. */
async function emptySchema(): Promise<Sql> {
  const sql = await openTestDatabase();
  await sql.exec(`DROP SCHEMA ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA};`);
  return sql;
}

function tableNames(sql: Sql): Promise<{ tablename: string }[]> {
  return sql.query<{ tablename: string }>('SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', [
    SCHEMA,
  ]);
}

describe('applyMigrations', () => {
  it('runs each migration once', async () => {
    const sql = await emptySchema();
    const migrations = [bookkeeping, { name: '002_runs.sql', sql: 'CREATE TABLE runs (id text PRIMARY KEY)' }];

    expect(await applyMigrations(sql, migrations)).toEqual(['001_schema_migrations.sql', '002_runs.sql']);
    expect(await applyMigrations(sql, migrations)).toEqual([]);

    const names = await sql.query('SELECT name FROM schema_migrations ORDER BY name');
    expect(names).toEqual([{ name: '001_schema_migrations.sql' }, { name: '002_runs.sql' }]);
    await sql.close();
  });

  it('applies a migration added after the others have run', async () => {
    const sql = await emptySchema();
    await applyMigrations(sql, [bookkeeping]);

    const added = { name: '002_runs.sql', sql: 'CREATE TABLE runs (id text PRIMARY KEY)' };
    expect(await applyMigrations(sql, [bookkeeping, added])).toEqual(['002_runs.sql']);
    await sql.close();
  });

  it('leaves the database as it was when a migration fails', async () => {
    const sql = await emptySchema();
    await applyMigrations(sql, [bookkeeping]);

    const broken = { name: '002_broken.sql', sql: 'CREATE TABLE runs (id text PRIMARY KEY); NOT SQL' };
    await expect(applyMigrations(sql, [bookkeeping, broken])).rejects.toThrow(/002_broken\.sql/);

    expect(await tableNames(sql)).toEqual([{ tablename: 'schema_migrations' }]);
    await sql.close();
  });

  it("puts everything in this server's own schema and nothing in public", async () => {
    const sql = await openTestDatabase();

    const mine = await tableNames(sql);
    expect(mine.map((row) => row.tablename)).toEqual([
      'admin_actions',
      'announcements',
      'batches',
      'characters',
      'engines',
      'living',
      'player_secrets',
      'players',
      'schema_migrations',
      'sessions',
      'verdicts',
    ]);
    const elsewhere = await sql.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    expect(elsewhere).toEqual([]);
    await sql.close();
  });

  it('carries a secret claimed before player_secrets into it', async () => {
    const sql = await emptySchema();
    const secret = 'A'.repeat(43);
    await applyMigrations(sql, BUNDLED_MIGRATIONS.filter((migration) => migration.name < PASSPHRASES));
    await sql.query('INSERT INTO players (secret_hash, name) VALUES ($1, $2)', [
      createHash('sha256').update(secret).digest('hex'),
      'Moraff',
    ]);

    await applyMigrations(sql, BUNDLED_MIGRATIONS);

    expect(await playerNameFor(sql, secret)).toBe('Moraff');
    await sql.close();
  });

  it('brings a fresh database up to date, and leaves an up to date one alone', async () => {
    const sql = await openTestDatabase();

    const applied = await sql.query('SELECT name FROM schema_migrations ORDER BY name');
    expect(applied).toEqual(BUNDLED_MIGRATIONS.map((migration) => ({ name: migration.name })));

    expect(await migrateRunDatabase(sql)).toEqual([]);
    await sql.close();
  });
});
