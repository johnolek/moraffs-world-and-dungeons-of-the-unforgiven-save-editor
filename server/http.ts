import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { shortCommit } from '../src/lib/commit';
import type { JournalEntry } from '../src/lib/play/journal';
import type { ServerConfig } from './config';
import { adminFor, allCharacters, flagAdminPlayer, logAdminAction, type AdminPlayer } from './admins';
import { announcementsBefore, ANNOUNCEMENTS_PER_PAGE } from './announcing';
import { openSignInAttempts, type SignInAttempts } from './attempts';
import {
  boardPage,
  boardWorld,
  endlessWorlds,
  hasBoard,
  isBoardGame,
  isBoardLeaderboard,
  isBoardName,
  isLivingSort,
  livingPage,
} from './boards';
import { writeCorsHeaders } from './cors';
import { ENGINE_COMMIT, openEngineStore, type EngineStore } from './engines';
import { everyoneOf } from './everyone';
import { openFeed, type Feed } from './feed';
import {
  claimPlayerName,
  isPlayerSecret,
  issuePassphrase,
  playerFor,
  playerNameFor,
  secretHash,
  signInWithPassphrase,
  validPlayerName,
} from './players';
import {
  forgetAnyCharacter,
  forgetKeptCharacter,
  keepEditedCharacter,
  keptRunOf,
  readCharacterEdit,
  rosterOf,
} from './roster';
import {
  endRun,
  leaseOn,
  leasedElsewhere,
  readRunBatch,
  runFor,
  sessionsOf,
  takeBatch,
  type BatchClaims,
  type BatchRefusal,
} from './runs';
import type { BuiltPage } from './site';
import type { Queries, Sql } from './sql';
import {
  createRunVerifier,
  livingSnapshotFor,
  verdictFor,
  type KeptVerdict,
  type LivingSnapshot,
  type RunVerifier,
} from './verifying';
import { currentEndlessWorld, drawEndlessWorld, isEndlessWorldSeed, setEndlessWorld } from './worlds';

/** What a refused request says. The site shows these words as they are. */
const NOT_A_SECRET = 'That is not a player secret.';
const NOT_A_NAME = "A name is 2 to 24 letters, digits, spaces or . _ - '";
const NAME_TAKEN = 'That name is taken.';
const NO_NAME_YET = 'This device has no name yet.';
const SIGN_IN_REFUSED = 'That name and passphrase do not go together.';
const ANOTHER_NAME_HERE = 'This device already has a name of its own.';
const TOO_MANY_TRIES = 'Too many tries. Wait a quarter of an hour and try again.';
const NOT_A_BATCH = 'That is not a batch of a run.';
const NOT_A_CHARACTER = 'That is not a character.';
const ANOTHER_PLAYER = 'That character belongs to another player.';
const NO_SUCH_SITTING = 'That run has no such sitting.';
const CHANGED_RESEND = 'That stretch of the run arrived before, holding something else.';
const MOVED_ON = 'That character has been played on another device since.';
const BEING_PLAYED = 'That character is being played on another device.';
const NO_SUCH_RUN = 'No such run.';
const NO_SUCH_CHARACTER = 'No character of yours has that name here.';
const NOT_YOUR_RUN = 'That run is not yours to read.';
const NOT_A_PAGE = 'That is not a page of a board.';
const NOT_A_PAGE_OF_CHARACTERS = 'That is not a page of the characters.';
const NO_SUCH_CHARACTER_HERE = 'No character here has that name.';
const NO_SUCH_PLAYER = 'Nobody here has that name.';
const NOT_A_LIVING_SORT = 'That is not an order the living are ranked in.';
const NOT_A_WORLD = 'That is not an endless world.';
const NOT_A_HISTORY_PAGE = 'That is not a page of the announcements.';

/** A players request carries a field or two, so anything longer than this is not one. */
const MOST_BODY_BYTES = 1024;

/**
 * How much a batch of a run, or a character sent on its own, may be.
 *
 * A few seconds of keys is nothing. The big one is the batch that carries a whole sitting the
 * server was never told about: Moraff's Revenge writes an input for every tick of its monsters'
 * clock, five a second while the game is open, so a day at that game is hundreds of thousands of
 * them. This leaves room for such a sitting and still refuses a body worth reading off a
 * stranger.
 */
const MOST_BATCH_BYTES = 8 * 1024 * 1024;

/** What a character is called in a path: the id of a roster entry in somebody's browser. */
const CHARACTER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The one thing about the box that reaches an answer: which origin a browser is told may read
 *  one. Everything else in the configuration is `main.ts`'s. */
export type ServerOrigin = Pick<ServerConfig, 'allowedOrigin'>;

/**
 * The server.
 *
 * `feed` is the one thing here that outlives a request: a page listening to it holds its answer
 * open until somebody closes the tab. `main.ts` makes its own so that a stopping process can let
 * those pages go rather than wait for them; anything that does not care about stopping gets one
 * of its own.
 */
export function createRunServer(
  config: ServerOrigin,
  sql: Sql,
  feed: Feed = openFeed(),
  page: BuiltPage | null = null,
): Server {
  const engines = openEngineStore(sql);
  const verifier = createRunVerifier(sql, engines, (announcements) => feed.announce(announcements));
  const attempts = openSignInAttempts();

  return createServer((request, response) => {
    writeCorsHeaders(response, request.headers.origin, config.allowedOrigin);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    // A request line carries only the path, so parsing it needs a base; this one goes nowhere.
    const asked = new URL(request.url ?? '/', 'http://run-server');
    const path = asked.pathname;

    if (request.method === 'GET' && path === '/health') {
      // The engines kept are what a run older than this build is replayed with, so a deploy is
      // read here: its own commit, and every commit it kept a build for.
      void sendHealth(response, engines);
      return;
    }

    if (request.method === 'GET' && path === '/players/me/characters') {
      void sendMyCharacters(response, sql, bearerSecret(request));
      return;
    }

    const character = path.match(/^\/players\/me\/characters\/([^/]+)$/);
    if (request.method === 'DELETE' && character !== null) {
      void forgetMyCharacter(response, sql, bearerSecret(request), decodeURIComponent(character[1]));
      return;
    }

    if (request.method === 'PUT' && character !== null) {
      void keepMyCharacter(request, response, sql, bearerSecret(request), decodeURIComponent(character[1]));
      return;
    }

    const myRun = path.match(/^\/players\/me\/characters\/([^/]+)\/run$/);
    if (request.method === 'GET' && myRun !== null) {
      void sendMyCharactersRun(response, sql, bearerSecret(request), decodeURIComponent(myRun[1]));
      return;
    }

    if (request.method === 'GET' && path === '/players/me') {
      void sendMyName(response, sql, bearerSecret(request));
      return;
    }

    if (request.method === 'POST' && path === '/players') {
      void claimName(request, response, sql);
      return;
    }

    if (request.method === 'POST' && path === '/players/sign-in') {
      void signInHere(request, response, sql, attempts);
      return;
    }

    if (request.method === 'POST' && path === '/players/passphrase') {
      void drawNewPassphrase(request, response, sql);
      return;
    }

    if (path.startsWith('/admin/')) {
      void serveAdmin(request, response, sql, attempts, asked);
      return;
    }

    if (request.method === 'GET' && path === '/worlds/endless/current') {
      void sendCurrentEndlessWorld(response, sql);
      return;
    }

    const batches = path.match(/^\/runs\/([^/]+)\/batches$/);
    if (request.method === 'POST' && batches !== null) {
      void takeRunBatch(request, response, sql, verifier, decodeURIComponent(batches[1]));
      return;
    }

    if (request.method === 'GET' && path === '/feed') {
      feed.listen(response);
      return;
    }

    if (request.method === 'GET' && path === '/announcements') {
      void sendAnnouncements(response, sql, asked.searchParams.get('before'), asked.searchParams.get('limit'));
      return;
    }

    const everyone = path.match(/^\/boards\/([^/]+)\/everyone$/);
    if (request.method === 'GET' && everyone !== null) {
      void sendEveryone(response, sql, decodeURIComponent(everyone[1]));
      return;
    }

    const worlds = path.match(/^\/boards\/([^/]+)\/endless\/worlds$/);
    if (request.method === 'GET' && worlds !== null) {
      void sendEndlessWorlds(response, sql, decodeURIComponent(worlds[1]));
      return;
    }

    const living = path.match(/^\/boards\/([^/]+)\/([^/]+)\/living$/);
    if (request.method === 'GET' && living !== null) {
      void sendLivingBoard(
        response,
        sql,
        decodeURIComponent(living[1]),
        decodeURIComponent(living[2]),
        asked.searchParams.get('sort'),
        asked.searchParams.get('page'),
        asked.searchParams.get('world'),
      );
      return;
    }

    const board = path.match(/^\/boards\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (request.method === 'GET' && board !== null) {
      void sendBoard(
        response,
        sql,
        decodeURIComponent(board[1]),
        decodeURIComponent(board[2]),
        decodeURIComponent(board[3]),
        asked.searchParams.get('page'),
        asked.searchParams.get('world'),
      );
      return;
    }

    const run = path.match(/^\/runs\/([^/]+)$/);
    if (request.method === 'GET' && run !== null) {
      void sendRun(request, response, sql, decodeURIComponent(run[1]));
      return;
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && path === '/' && page !== null) {
      sendPage(request, response, page);
      return;
    }

    sendNoSuchEndpoint(response, path);
  });
}

/** What a path this server does not know is answered with, and what everything under `/admin/`
 *  is answered with for anybody who is not an admin. */
function sendNoSuchEndpoint(response: ServerResponse, path: string): void {
  sendJson(response, 404, { error: `No such endpoint: ${path}` });
}

/**
 * The admin's own endpoints: every character here, deleting anybody's, and flagging another
 * player as an admin.
 *
 * They are all behind one check rather than three, so that there is one place where the rule
 * holds: a caller who is not an admin is answered exactly what a path this server does not know
 * is answered with. Nothing here tells a stranger that these endpoints exist, that a character
 * exists, or that the words they said were nearly right.
 */
async function serveAdmin(
  request: IncomingMessage,
  response: ServerResponse,
  sql: Sql,
  attempts: SignInAttempts,
  asked: URL,
): Promise<void> {
  const path = asked.pathname;
  const admin = await adminAsking(request, sql, attempts);
  if (admin === null) {
    sendNoSuchEndpoint(response, path);
    return;
  }

  if (request.method === 'GET' && path === '/admin/characters') {
    await sendAdminCharacters(response, sql, asked.searchParams.get('page'));
    return;
  }

  const character = path.match(/^\/admin\/characters\/([^/]+)$/);
  if (request.method === 'DELETE' && character !== null) {
    await forgetAnybodysCharacter(response, sql, admin, decodeURIComponent(character[1]));
    return;
  }

  if (request.method === 'POST' && path === '/admin/admins') {
    await flagAnotherAdmin(request, response, sql, admin);
    return;
  }

  if (request.method === 'POST' && path === '/admin/worlds/endless') {
    await openANewEndlessWorld(request, response, sql, admin);
    return;
  }

  sendNoSuchEndpoint(response, path);
}

/**
 * The admin asking, or null for everybody else.
 *
 * An admin says their passphrase in the `Authorization` header and nothing else: the six words
 * are something John can read off a piece of paper into curl on any machine, where the secret a
 * player is otherwise recognised by lives in one browser's storage. Which admin is asking is
 * worked out from the words themselves (`server/admins.ts`).
 *
 * Guesses are slowed down the way guesses at a sign-in are, and by the same count, since both are
 * guesses at a passphrase; the admin endpoints share one name to be counted against, so five
 * wrong tries from anywhere leave them unreachable for a quarter of an hour, John's own tries
 * included.
 */
async function adminAsking(request: IncomingMessage, sql: Queries, attempts: SignInAttempts): Promise<AdminPlayer | null> {
  const said = bearerValue(request);
  const from = whereFrom(request);
  if (said === null || attempts.tooMany(ADMIN_TRIES, from)) return null;
  const admin = await adminFor(sql, said);
  if (admin === null) attempts.failed(ADMIN_TRIES, from);
  return admin;
}

/** The name wrong tries at an admin endpoint are counted against, which stands for all of them:
 *  there is no name in an admin request to count against instead. */
const ADMIN_TRIES = 'admin';

/** One page of every character here, whoever's it is, which is what an admin picks the character
 *  to delete out of. */
async function sendAdminCharacters(response: ServerResponse, sql: Queries, asked: string | null): Promise<void> {
  const page = pageAsked(asked);
  if (page === null) {
    sendJson(response, 400, { error: NOT_A_PAGE_OF_CHARACTERS });
    return;
  }
  sendJson(response, 200, await allCharacters(sql, page));
}

/** One character forgotten for good, whoever it belongs to. The row in `admin_actions` is what is
 *  left to say it was an admin who did it. */
async function forgetAnybodysCharacter(
  response: ServerResponse,
  sql: Sql,
  admin: AdminPlayer,
  characterId: string,
): Promise<void> {
  if (!CHARACTER_ID.test(characterId) || !(await forgetAnyCharacter(sql, characterId))) {
    sendJson(response, 404, { error: NO_SUCH_CHARACTER_HERE });
    return;
  }
  await logAdminAction(sql, { by: admin.id, did: 'forget-character', about: characterId });
  sendJson(response, 200, { forgotten: characterId });
}

/**
 * Another player made an admin.
 *
 * They are named rather than picked by id because the name is the only thing anybody knows about
 * a player here. The player has to have claimed the name already: this flags a row and does not
 * make one.
 */
async function flagAnotherAdmin(
  request: IncomingMessage,
  response: ServerResponse,
  sql: Queries,
  admin: AdminPlayer,
): Promise<void> {
  const body = (await readJsonBody(request)) as { name?: unknown } | null;
  const flagged = await flagAdminPlayer(sql, validPlayerName(body?.name));
  if (flagged === null) {
    sendJson(response, 404, { error: NO_SUCH_PLAYER });
    return;
  }
  await logAdminAction(sql, { by: admin.id, did: 'flag-admin', about: flagged.name });
  sendJson(response, 200, { admin: flagged.name });
}

/**
 * A new endless world, which every endless character rolled from now on is rolled into.
 *
 * The seed is the admin's own number where they name one, since a world worth going back to is a
 * number worth choosing; a request that names none is asking for a world nobody has to think of,
 * and the server draws it. Either way the worlds already played are left exactly as they are.
 */
async function openANewEndlessWorld(
  request: IncomingMessage,
  response: ServerResponse,
  sql: Queries,
  admin: AdminPlayer,
): Promise<void> {
  const body = (await readJsonBody(request)) as { seed?: unknown } | null;
  const asked = body?.seed;
  if (asked !== undefined && !isEndlessWorldSeed(asked)) {
    sendJson(response, 400, { error: NOT_A_WORLD });
    return;
  }
  const seed = asked ?? drawEndlessWorld();
  await setEndlessWorld(sql, { seed, by: admin.id });
  await logAdminAction(sql, { by: admin.id, did: 'set-endless-world', about: String(seed) });
  sendJson(response, 200, { world: seed });
}

/** The endless world a character rolled now is rolled into, which the roller asks for before it
 *  writes the world on a new endless character. */
async function sendCurrentEndlessWorld(response: ServerResponse, sql: Queries): Promise<void> {
  sendJson(response, 200, { world: await currentEndlessWorld(sql) });
}

/**
 * One page of one board.
 *
 * The three parts of the path are a board there is: a game the site plays, one of the ways of
 * playing it, and one of that way's own boards — the endless dungeon has boards of its own and
 * none of the boards of wins. Anything else is not a board that exists rather than a board with
 * nothing on it, so it is a 404 and not an empty page. An endless board is read for one world,
 * which `world` names and which is the world being played now where the query names none. The
 * rules about which runs stand on a board and in what order are `server/boards.ts`.
 */
async function sendHealth(response: ServerResponse, engines: EngineStore): Promise<void> {
  const kept = await engines.keptCommits();
  sendJson(response, 200, { ok: true, engineCommit: ENGINE_COMMIT, engines: kept.map(shortCommit) });
}

async function sendBoard(
  response: ServerResponse,
  sql: Queries,
  game: string,
  leaderboard: string,
  board: string,
  asked: string | null,
  askedWorld: string | null,
): Promise<void> {
  if (!isBoardGame(game) || !isBoardLeaderboard(leaderboard) || !isBoardName(board) || !hasBoard(leaderboard, board)) {
    sendJson(response, 404, { error: `No such board: ${game}/${leaderboard}/${board}` });
    return;
  }
  const page = pageAsked(asked);
  if (page === null) {
    sendJson(response, 400, { error: NOT_A_PAGE });
    return;
  }
  const world = worldAsked(askedWorld);
  if (world === false) {
    sendJson(response, 400, { error: NOT_A_WORLD });
    return;
  }
  const inWorld = await boardWorld(sql, leaderboard, world);
  sendJson(response, 200, await boardPage(sql, { game, leaderboard, board, page, world: inWorld }));
}

/**
 * One page of a board of the living: the characters of that game and board still being played,
 * ranked by what a replay of the chain each has played so far reached.
 *
 * `sort` is which of the two orders, and a request that names none is asking for the level. Only
 * a character whose replay came out verified is here, and only while its run has not ended, which
 * is what `server/boards.ts` decides.
 */
async function sendLivingBoard(
  response: ServerResponse,
  sql: Queries,
  game: string,
  leaderboard: string,
  sort: string | null,
  asked: string | null,
  askedWorld: string | null,
): Promise<void> {
  if (!isBoardGame(game) || !isBoardLeaderboard(leaderboard)) {
    sendJson(response, 404, { error: `No such board: ${game}/${leaderboard}/living` });
    return;
  }
  const order = sort ?? 'level';
  if (!isLivingSort(order)) {
    sendJson(response, 400, { error: NOT_A_LIVING_SORT });
    return;
  }
  const page = pageAsked(asked);
  if (page === null) {
    sendJson(response, 400, { error: NOT_A_PAGE });
    return;
  }
  const world = worldAsked(askedWorld);
  if (world === false) {
    sendJson(response, 400, { error: NOT_A_WORLD });
    return;
  }
  const read = { game, leaderboard, sort: order, page, world: await boardWorld(sql, leaderboard, world) };
  sendJson(response, 200, await livingPage(sql, read, Date.now()));
}

/**
 * The endless worlds of one game there are boards for, and which of them is being played now.
 *
 * A board of the endless dungeon is one world's own, so a page of them has to know which worlds
 * there are before it can offer one. Who is in the list is `server/boards.ts`.
 */
async function sendEndlessWorlds(response: ServerResponse, sql: Queries, game: string): Promise<void> {
  if (!isBoardGame(game)) {
    sendJson(response, 404, { error: `No such board: ${game}/endless/worlds` });
    return;
  }
  sendJson(response, 200, await endlessWorlds(sql, game));
}

/**
 * Everyone of one game: every character the server has checked, on either board and living or
 * ended, in one answer with no paging.
 *
 * A game the site does not play is a board there is not rather than a board with nobody on it, so
 * it is the same 404 the boards above give. Who is in the table is `server/everyone.ts`.
 */
async function sendEveryone(response: ServerResponse, sql: Queries, game: string): Promise<void> {
  if (!isBoardGame(game)) {
    sendJson(response, 404, { error: `No such board: ${game}/everyone` });
    return;
  }
  sendJson(response, 200, await everyoneOf(sql, game, Date.now()));
}

/**
 * Which endless world was asked for, and null where the query names none, which leaves the board
 * to answer for the world being played now.
 *
 * False is a query that is not a world at all, which is a request to refuse rather than one to
 * answer with another world's board.
 */
function worldAsked(asked: string | null): number | null | false {
  if (asked === null) return null;
  return /^[0-9]{1,15}$/.test(asked) ? Number(asked) : false;
}

/** Which page of a board was asked for, counting from one, or null when the query names
 *  something that is not a page. A request that names none is asking for the first. */
function pageAsked(asked: string | null): number | null {
  if (asked === null) return 1;
  if (!/^[0-9]{1,6}$/.test(asked)) return null;
  const page = Number(asked);
  return page >= 1 ? page : null;
}

/**
 * The announcements already made, newest first.
 *
 * The history is paged by id rather than by a page number: announcements are made while somebody
 * is reading, and a page number would show one twice or skip one as they arrive. `before` is the
 * oldest id the reader already has, and a request that names none is asking for the newest.
 */
async function sendAnnouncements(
  response: ServerResponse,
  sql: Queries,
  before: string | null,
  limit: string | null,
): Promise<void> {
  const from = idAsked(before);
  const most = limitAsked(limit);
  if (from === undefined || most === null) {
    sendJson(response, 400, { error: NOT_A_HISTORY_PAGE });
    return;
  }
  sendJson(response, 200, await announcementsBefore(sql, from, most));
}

/** The id to read back from, null for a request that names none, and undefined for a query that
 *  names something that is not an id. */
function idAsked(asked: string | null): number | null | undefined {
  if (asked === null) return null;
  return /^[0-9]{1,15}$/.test(asked) ? Number(asked) : undefined;
}

/** How many announcements were asked for, or null when the query names something that is not a
 *  number of them. A page holds fifty and nobody may ask for more in one request. */
function limitAsked(asked: string | null): number | null {
  if (asked === null) return ANNOUNCEMENTS_PER_PAGE;
  if (!/^[0-9]{1,3}$/.test(asked)) return null;
  const limit = Number(asked);
  return limit >= 1 && limit <= ANNOUNCEMENTS_PER_PAGE ? limit : null;
}

async function sendMyName(response: ServerResponse, sql: Queries, secret: string | null): Promise<void> {
  if (secret === null) {
    sendJson(response, 400, { error: NOT_A_SECRET });
    return;
  }
  const name = await playerNameFor(sql, secret);
  if (name === null) {
    sendJson(response, 404, { error: NO_NAME_YET });
    return;
  }
  sendJson(response, 200, { name });
}

/**
 * The player's whole roster, as a device that has just signed in takes it up.
 *
 * A character belongs to the player and not to the browser it was rolled in, so this is what puts
 * a roster on a second device: every character with its record, its explored maps and the chain
 * of sittings it has been played in. The keys of those sittings are left out and their count goes
 * instead; `/players/me/characters/:id/run` is where a device asks for one character's keys.
 */
async function sendMyCharacters(response: ServerResponse, sql: Queries, secret: string | null): Promise<void> {
  if (secret === null) {
    sendJson(response, 400, { error: NOT_A_SECRET });
    return;
  }
  const player = await playerFor(sql, secret);
  if (player === null) {
    sendJson(response, 403, { error: NO_NAME_YET });
    return;
  }
  sendJson(response, 200, { characters: await rosterOf(sql, player, secretHash(secret), Date.now()) });
}

/**
 * The whole chain of one of this player's characters, with the keys of every sitting.
 *
 * The roster above leaves the keys out, because a chain of Moraff's Revenge is megabytes and
 * every page load would carry every character's. A device asks for one character's here, and only
 * when it needs them: to play that character on, or to export its run.
 */
async function sendMyCharactersRun(
  response: ServerResponse,
  sql: Queries,
  secret: string | null,
  characterId: string,
): Promise<void> {
  if (secret === null || !CHARACTER_ID.test(characterId)) {
    sendJson(response, 400, { error: NOT_A_SECRET });
    return;
  }
  const player = await playerFor(sql, secret);
  if (player === null) {
    sendJson(response, 403, { error: NO_NAME_YET });
    return;
  }
  const run = await keptRunOf(sql, characterId, player);
  if (run === null) {
    sendJson(response, 404, { error: NO_SUCH_CHARACTER });
    return;
  }
  sendJson(response, 200, { run });
}

/**
 * One character as the device holds it now, sent with no game running.
 *
 * A record otherwise reaches this server only on the batches of a run, so an edit made in the
 * Save Editor would wait for the next sitting and be lost if another device played the character
 * first. The device sends it here as soon as the edit is kept, and a character the server has
 * never been told about is made known by it, with no sittings under it.
 */
async function keepMyCharacter(
  request: IncomingMessage,
  response: ServerResponse,
  sql: Sql,
  secret: string | null,
  characterId: string,
): Promise<void> {
  if (secret === null || !CHARACTER_ID.test(characterId)) {
    sendJson(response, 400, { error: NOT_A_SECRET });
    return;
  }
  const player = await playerFor(sql, secret);
  if (player === null) {
    sendJson(response, 403, { error: NO_NAME_YET });
    return;
  }
  const edit = readCharacterEdit(await readJsonBody(request, MOST_BATCH_BYTES));
  if (edit === null) {
    sendJson(response, 400, { error: NOT_A_CHARACTER });
    return;
  }
  const sender = { player, device: secretHash(secret) };
  const taken = await keepEditedCharacter(sql, characterId, sender, edit, Date.now());
  if (taken === 'leased') {
    sendJson(response, 409, { error: BEING_PLAYED });
    return;
  }
  if (taken === 'another-player') {
    sendJson(response, 409, { error: ANOTHER_PLAYER });
    return;
  }
  sendJson(response, 200, { kept: characterId });
}

/** One character forgotten here: its run, the verdict on it and whatever was announced about it
 *  go with it, and nothing is left to hand another device. */
async function forgetMyCharacter(
  response: ServerResponse,
  sql: Sql,
  secret: string | null,
  characterId: string,
): Promise<void> {
  if (secret === null || !CHARACTER_ID.test(characterId)) {
    sendJson(response, 400, { error: NOT_A_SECRET });
    return;
  }
  const player = await playerFor(sql, secret);
  if (player === null) {
    sendJson(response, 403, { error: NO_NAME_YET });
    return;
  }
  if (!(await forgetKeptCharacter(sql, characterId, player))) {
    sendJson(response, 404, { error: NO_SUCH_CHARACTER });
    return;
  }
  sendJson(response, 200, { forgotten: characterId });
}

async function claimName(request: IncomingMessage, response: ServerResponse, sql: Queries): Promise<void> {
  const secret = bearerSecret(request);
  if (secret === null) {
    sendJson(response, 400, { error: NOT_A_SECRET });
    return;
  }
  const body = await readJsonBody(request);
  const claim = await claimPlayerName(sql, secret, (body as { name?: unknown } | null)?.name);
  if (!claim.claimed) {
    sendJson(response, claim.because === 'taken' ? 409 : 400, {
      error: claim.because === 'taken' ? NAME_TAKEN : NOT_A_NAME,
    });
    return;
  }
  if (claim.passphrase !== null) {
    // A claim that made a player hands back the words with the name. This is the one moment
    // anybody can read them: what the server keeps is their hash.
    sendJson(response, 200, { name: claim.name, passphrase: claim.passphrase });
    return;
  }
  sendJson(response, 200, { name: claim.name });
}

/**
 * Letting this device play as a name claimed on another one.
 *
 * The device says the name and the passphrase that name was given, and its secret joins that
 * player: the device the name was claimed on keeps it as well, and both are the same player from
 * then on. A wrong name and a wrong passphrase are one answer, because saying which of the two was
 * wrong tells whoever is guessing which half to keep guessing at.
 */
async function signInHere(
  request: IncomingMessage,
  response: ServerResponse,
  sql: Queries,
  attempts: SignInAttempts,
): Promise<void> {
  const secret = bearerSecret(request);
  if (secret === null) {
    sendJson(response, 400, { error: NOT_A_SECRET });
    return;
  }
  const body = (await readJsonBody(request)) as { name?: unknown; passphrase?: unknown } | null;
  const name = typeof body?.name === 'string' ? body.name : '';
  const from = whereFrom(request);
  if (attempts.tooMany(name, from)) {
    sendJson(response, 429, { error: TOO_MANY_TRIES });
    return;
  }
  const signedIn = await signInWithPassphrase(sql, secret, body?.name, body?.passphrase);
  if (!signedIn.signedIn) {
    if (signedIn.because === 'another-player') {
      sendJson(response, 409, { error: ANOTHER_NAME_HERE });
      return;
    }
    attempts.failed(name, from);
    sendJson(response, 401, { error: SIGN_IN_REFUSED });
    return;
  }
  sendJson(response, 200, { name: signedIn.name });
}

/**
 * A new passphrase for the player this device belongs to.
 *
 * The words go out here and nowhere else, and asking retires the passphrase this player had: one
 * that has been written on a whiteboard or sent to the wrong person stops letting anybody in the
 * moment a new one is drawn.
 */
async function drawNewPassphrase(request: IncomingMessage, response: ServerResponse, sql: Queries): Promise<void> {
  const secret = bearerSecret(request);
  if (secret === null) {
    sendJson(response, 400, { error: NOT_A_SECRET });
    return;
  }
  const player = await playerFor(sql, secret);
  if (player === null) {
    sendJson(response, 403, { error: NO_NAME_YET });
    return;
  }
  sendJson(response, 200, { passphrase: await issuePassphrase(sql, player) });
}

/**
 * Where a request came from, as far as this server can tell.
 *
 * The socket is the proxy's: Coolify puts Traefik in front and every request arrives from it, so
 * the address that means anything is the first hop of `X-Forwarded-For`, which is what the proxy
 * writes the caller's address into. A server reached with nothing in front of it is handed that
 * header by whoever asked and could be told anything, which is why nothing but the slowing down
 * of guesses is decided by it.
 */
function whereFrom(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  const said = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  if (said !== undefined && said !== '') return said;
  return request.socket.remoteAddress ?? 'nowhere';
}

/**
 * A stretch of a run as it is played.
 *
 * The character is made known by its first batch and belongs to the player whose secret sent it,
 * so there is no registering a character anywhere: a player with a name on the boards starts
 * playing and the run arrives. The answer names the sequence the server now has, which is what
 * lets the site move on to the next one; a batch it has already been sent is answered the same
 * way rather than being played twice.
 */
async function takeRunBatch(
  request: IncomingMessage,
  response: ServerResponse,
  sql: Sql,
  verifier: RunVerifier,
  characterId: string,
): Promise<void> {
  const secret = bearerSecret(request);
  if (secret === null || !CHARACTER_ID.test(characterId)) {
    sendJson(response, 400, { error: NOT_A_SECRET });
    return;
  }
  const player = await playerFor(sql, secret);
  if (player === null) {
    sendJson(response, 403, { error: NO_NAME_YET });
    return;
  }
  const batch = readRunBatch(await readJsonBody(request, MOST_BATCH_BYTES));
  if (batch === null) {
    sendJson(response, 400, { error: NOT_A_BATCH });
    return;
  }
  // The arrival is stamped here, by this server's clock, because it is the one thing about a run
  // that the page it was played in cannot be asked for.
  const taken = await takeBatch(sql, characterId, { player, device: secretHash(secret) }, batch, Date.now());
  if (!taken.taken) {
    const refused = whyTheBatchWasRefused(taken.because);
    // The words are for the player to read and `because` is for the site to act on: a run refused
    // because the character has been played elsewhere is the one the site takes the server's copy
    // of the character over.
    sendJson(response, refused.status, { error: refused.error, because: taken.because });
    return;
  }
  if (taken.ending) {
    await endRun(sql, characterId, wonOrDied(batch.claims));
    // Replaying a long run takes seconds and the browser is waiting on this answer, so the run
    // goes in line and the site asks for the verdict afterwards.
    verifier.verifySoon(characterId);
  } else {
    // The boards of the living show what a replay of the chain so far reached, so every batch is
    // a reason to look at the character again. The line decides whether enough has changed to be
    // worth another replay; this only says that something arrived.
    verifier.snapshotSoon(characterId);
  }
  sendJson(response, 200, { received: taken.received });
}

/**
 * What a refused batch is answered with.
 *
 * A batch of a sitting nobody ever sent is the site asking for something that is not there, which
 * is a 400. The rest are about a run the server already holds and will not have written over,
 * which is what 409 says.
 */
function whyTheBatchWasRefused(because: BatchRefusal): { status: number; error: string } {
  if (because === 'another-player') return { status: 409, error: ANOTHER_PLAYER };
  if (because === 'changed-resend') return { status: 409, error: CHANGED_RESEND };
  if (because === 'moved-on') return { status: 409, error: MOVED_ON };
  if (because === 'leased') return { status: 409, error: BEING_PLAYED };
  return { status: 400, error: NO_SUCH_SITTING };
}

/** How a run ended, which the last batch's milestones say. */
function wonOrDied(claims: BatchClaims): 'death' | 'win' {
  return claims.milestones.some((milestone) => milestone.kind === 'win') ? 'win' : 'death';
}

/** One sitting as a run's page shows it. The keys and the record a sitting was replayed from are
 *  no part of a page about the run, so what goes out is when it was played, what it came to and
 *  the build that played it. */
export interface RunSittingAnswer {
  index: number;
  engine: string;
  startedAt: string;
  actions: number;
  time: number;
}

/**
 * The verdict as a run's page is handed it: everything written down about the replay but the
 * journal, which goes out once, on its own, since a long run's is thousands of lines.
 */
export type JudgedRun = Omit<KeptVerdict, 'journal'>;

/**
 * A run written up in words by the replay that judged it, and how far the run had got by the end
 * of it, which is what the summary is folded against.
 *
 * It is the verdict's for a run that has ended and the last snapshot's for a character still
 * being played. The site folds the summary itself, so that the words a run is described in are
 * the site's own wherever it is read.
 */
export interface RunJournalAnswer {
  entries: JournalEntry[];
  actions: number;
  time: number;
}

/** What `GET /runs/:id` answers with, which is what the site draws a run's page from. */
export interface RunAnswer {
  id: string;
  game: string;
  mode: string | null;
  name: string;
  player: string;
  createdAt: string;
  finishedAt: string | null;
  outcome: string | null;
  sessions: RunSittingAnswer[];
  /** Null while the run has not been replayed. */
  verdict: JudgedRun | null;
  /** The timeline of the run, and null while nothing has been replayed for it. */
  journal: RunJournalAnswer | null;
  /**
   * Whether another device of the player's own is playing this character now, which is what the
   * Play tab asks before it starts a game: one character is played from one device at a time.
   * A reader who is not the player is told nothing, so it is false for them.
   */
  leasedElsewhere: boolean;
}

/**
 * A run and the verdict on it, which is what a run's page is drawn from: who played it, the
 * sittings it was played in and the engine build each of them names, and the verdict with the
 * milestones the replay reached.
 *
 * A run a replay has passed is anybody's to read: it is what a board is made of and what an
 * announcement points at. That is a verified verdict for a run that has ended, and a verified
 * snapshot for a character still being played, which is what a board of the living is made of and
 * what a row there opens. A run nothing has been checked about, and one that failed or could not
 * be checked, is the player's own business and takes their secret.
 */
async function sendRun(
  request: IncomingMessage,
  response: ServerResponse,
  sql: Queries,
  characterId: string,
): Promise<void> {
  const run = CHARACTER_ID.test(characterId) ? await runFor(sql, characterId) : null;
  if (run === null) {
    sendJson(response, 404, { error: NO_SUCH_RUN });
    return;
  }
  const verdict = await verdictFor(sql, characterId);
  const secret = bearerSecret(request);
  const player = secret === null ? null : await playerFor(sql, secret);
  const theirs = player !== null && player === run.playerId;
  const living = await livingSnapshotFor(sql, characterId);
  const checked = verdict?.status === 'verified' || living?.status === 'verified';
  if (!checked && !theirs) {
    sendJson(response, 403, { error: NOT_YOUR_RUN });
    return;
  }
  const lease = theirs && secret !== null ? await leaseOn(sql, characterId) : null;
  const answer: RunAnswer = {
    id: run.id,
    game: run.game,
    mode: run.mode,
    name: run.name,
    player: run.player,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    outcome: run.outcome,
    sessions: (await sessionsOf(sql, characterId)).map((session) => ({
      index: session.sessionIndex,
      engine: session.engine,
      startedAt: session.startedAt,
      actions: session.actions,
      time: session.time,
    })),
    verdict: verdict === null ? null : judgedRun(verdict),
    journal: runJournal(verdict, living),
    leasedElsewhere: lease !== null && secret !== null && leasedElsewhere(lease, secretHash(secret), Date.now()),
  };
  sendJson(response, 200, answer);
}

function judgedRun(verdict: KeptVerdict): JudgedRun {
  const { journal, ...judged } = verdict;
  return judged;
}

/**
 * The journal a run's page shows, or null when there is none to show.
 *
 * A run that has ended has its verdict's and a character still being played has the one the last
 * replay of the chain so far wrote, so the verdict is what stands wherever there is one: a
 * snapshot beside it is from before the run ended and says less than the verdict does.
 */
function runJournal(verdict: KeptVerdict | null, living: LivingSnapshot | null): RunJournalAnswer | null {
  const replayed = verdict ?? living;
  if (replayed === null) return null;
  return { entries: replayed.journal, actions: replayed.actions, time: replayed.time };
}

/** The secret from `Authorization: Bearer <secret>`, or null when the header carries anything
 *  else. Nothing is looked up until it is shaped like a secret. */
function bearerSecret(request: IncomingMessage): string | null {
  const value = bearerValue(request);
  return value !== null && isPlayerSecret(value) ? value : null;
}

/** Everything after `Bearer ` in the `Authorization` header: a device's secret at the player
 *  endpoints, and an admin's six words at the admin ones, which is why the spaces are kept. */
function bearerValue(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (header === undefined) return null;
  const space = header.indexOf(' ');
  if (space < 0 || header.slice(0, space).toLowerCase() !== 'bearer') return null;
  const value = header.slice(space + 1).trim();
  return value === '' ? null : value;
}

/** The body parsed as JSON, or null when it is not JSON, is not an object, or is longer than a
 *  request here has any business being. */
async function readJsonBody(request: IncomingMessage, mostBytes = MOST_BODY_BYTES): Promise<object | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = chunk as Buffer;
    size += bytes.length;
    if (size > mostBytes) {
      request.destroy();
      return null;
    }
    chunks.push(bytes);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The tools themselves, or the word that the browser asking already has them.
 *
 * The page is a megabyte or so however it is sent, so the tag is worth the round trip it costs:
 * `no-cache` is what makes a browser ask after every deploy rather than showing yesterday's page,
 * and the tag is what makes almost every one of those asks cost nothing to answer.
 *
 * A HEAD is answered here as readily as a GET, unlike at the endpoints: a page is something
 * monitors and link checkers ask after without wanting the thing itself. Node leaves the body off
 * the answer to a HEAD on its own, so there is nothing to do about it here.
 */
function sendPage(request: IncomingMessage, response: ServerResponse, page: BuiltPage): void {
  if (request.headers['if-none-match'] === page.tag) {
    response.writeHead(304, { ETag: page.tag, 'Cache-Control': 'no-cache' });
    response.end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': page.html.byteLength,
    ETag: page.tag,
    'Cache-Control': 'no-cache',
  });
  response.end(page.html);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}
