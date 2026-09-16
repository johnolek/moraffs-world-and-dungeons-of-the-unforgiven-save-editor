import { shortCommit } from '../src/lib/commit';
import { flagAdminPlayer } from './admins';
import { configFromEnvironment } from './config';
import { openRunDatabase } from './db';
import { ENGINE_COMMIT, publishBuiltEngine } from './engines';
import { openFeed } from './feed';
import { createRunServer } from './http';
import { readBuiltPage } from './site';

/**
 * The run server: one process, one port, and a Postgres it keeps everything in.
 *
 * `vite.server.config.ts` builds it into `dist-server/main.mjs`; `server/README.md` says how it
 * is deployed and what to back up.
 */

const config = configFromEnvironment();
const sql = await openRunDatabase(config.databaseUrl);
await publishOwnEngine();
await flagTheAdmin();
const feed = openFeed();
const page = readBuiltPage();
const server = createRunServer(config, sql, feed, page);

server.listen(config.port, () => {
  console.log(`Run server listening on port ${config.port}`);
  console.log(`  engine: ${shortCommit(ENGINE_COMMIT)}`);
  console.log(`  allowed origin: ${config.allowedOrigin}`);
  // Whether the image was built with the site in it is the thing a deploy gets wrong, and a
  // server missing it looks perfectly well from every endpoint.
  console.log(`  page: ${page === null ? 'none beside the server' : `${page.html.byteLength} bytes`}`);
});

/**
 * The image carries a build of the engine for its own commit, so a start puts it in the database
 * if it is not there yet and a deploy is one step. Nothing is ever taken out, and a build already
 * published is left exactly as it is.
 */
async function publishOwnEngine(): Promise<void> {
  const published = await publishBuiltEngine(sql, ENGINE_COMMIT);
  if (published === null) {
    console.log(`No engine build for ${shortCommit(ENGINE_COMMIT)} beside the server; nothing published.`);
    return;
  }
  if (!published.kept) {
    console.log(`The engine build beside the server was not published: ${published.reason}`);
    return;
  }
  console.log(
    published.wasAlreadyThere
      ? `The engine build ${shortCommit(ENGINE_COMMIT)} was already published.`
      : `Published the engine build ${shortCommit(ENGINE_COMMIT)}.`,
  );
}

/**
 * Who the admin is comes from the box rather than from the database, so that John is recognised
 * on a database nobody has opened by hand and on one restored from a backup.
 *
 * The player has to have claimed the name already. A start that finds nobody by that name says so
 * and flags nobody: claim the name and restart, and the flag is there.
 */
async function flagTheAdmin(): Promise<void> {
  if (config.adminPlayer === null) {
    console.log('ADMIN_PLAYER names nobody, so this server has no admin.');
    return;
  }
  const admin = await flagAdminPlayer(sql, config.adminPlayer);
  console.log(
    admin === null
      ? `No player here is called ${config.adminPlayer}, so nobody was made an admin.`
      : `${admin.name} is an admin.`,
  );
}

/**
 * A stop has to let go of the database, so the process stops taking requests, waits for the ones
 * in hand and closes the pool before it exits.
 *
 * Two kinds of connection would otherwise never end on their own. A page listening to the feed
 * holds its answer open for as long as somebody leaves the page up, so those answers are ended
 * first; and a browser keeps its connection after any answer, so every connection with no request
 * in hand is then dropped. That order matters: a feed whose answer has ended but whose connection
 * is still there is one the page asks for the feed down again, and the server would take it.
 */
function stop(signal: NodeJS.Signals): void {
  console.log(`${signal}: stopping`);
  server.close(() => {
    void sql.close().then(() => process.exit(0));
  });
  feed.close();
  server.closeIdleConnections();
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
