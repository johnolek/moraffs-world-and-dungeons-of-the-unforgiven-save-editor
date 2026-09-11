import { PGlite, type Transaction } from '@electric-sql/pglite';
import { migrateRunDatabase } from './db';
import { SCHEMA, type Queries, type Sql } from './sql';

/**
 * A migrated database, as the files Postgres keeps it in.
 *
 * Starting PGlite with nothing to go on makes those files from scratch, which is nearly all of the
 * second that takes. Starting it from a copy of them is about a tenth of that, so the work is done
 * once for every test in a worker rather than once per test.
 */
let migrated: Promise<Blob> | undefined;

function migratedDataDir(): Promise<Blob> {
  migrated ??= (async () => {
    const pglite = new PGlite();
    await pglite.exec(`SET search_path TO ${SCHEMA}`);
    await migrateRunDatabase(pgliteSql(pglite));
    const files = await pglite.dumpDataDir('none');
    await pglite.close();
    return files;
  })();
  return migrated;
}

/**
 * A database of a test's own: PGlite, which is Postgres compiled to WebAssembly, kept in memory
 * and thrown away with the test that made it.
 *
 * It is the real Postgres, so a test proves what the deployed server does, and nothing has to be
 * running on the machine for `pnpm test` to work here or in GitHub Actions.
 */
export async function openTestDatabase(): Promise<Sql> {
  const pglite = new PGlite({ loadDataDir: await migratedDataDir() });
  // PGlite is one connection, so the search path stays set for as long as the test holds the
  // database. The schema itself was made by the migration the copied files came from, the way it
  // is on John's box; a search path is a setting of the connection and is not among those files.
  await pglite.exec(`SET search_path TO ${SCHEMA}`);
  return pgliteSql(pglite);
}

function pgliteSql(pglite: PGlite): Sql {
  return {
    ...queriesOn(pglite),
    transaction: <T>(work: (queries: Queries) => Promise<T>) =>
      pglite.transaction((inside) => work(queriesOn(inside))),
    close: () => pglite.close(),
  };
}

function queriesOn(on: PGlite | Transaction): Queries {
  return {
    async query<Row extends object>(text: string, params?: readonly unknown[]): Promise<Row[]> {
      const answer = await on.query<Row>(text, params as unknown[]);
      return answer.rows;
    },
    async exec(text: string): Promise<void> {
      await on.exec(text);
    },
  };
}
