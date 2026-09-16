import { passphraseHash, samePassphraseHash } from './passphrases';
import type { Queries } from './sql';

/**
 * The admin: the player who may look at every character here and delete anybody's.
 *
 * Nobody signs up and nobody is given anything, so being an admin is a flag on a player's row and
 * nothing else. The box says who has it — `ADMIN_PLAYER` names the player, and the row is flagged
 * every time the server starts — which is what makes John an admin on a database nobody has
 * opened by hand. An admin may flag another player, and that is the only way a second one appears.
 *
 * An admin endpoint is reached with a passphrase and nothing else. The passphrase is six words
 * John can read off a piece of paper into curl from any machine, where the secret a player is
 * otherwise recognised by lives in one browser's storage and is nothing anybody can type; and it
 * is already the thing that proves who a player is (`server/passphrases.ts`), so this proves it
 * the same way rather than inventing a second kind of credential. Drawing a new passphrase
 * retires the admin's as well as their sign-in's.
 *
 * Every action an admin takes is written into `admin_actions` as it is done, because an admin
 * deletes other people's characters for good and the row is all that is left to say so.
 */

/** An admin, as the endpoints know one: which player they are and what they are called. */
export interface AdminPlayer {
  id: number;
  name: string;
}

/**
 * Flags the named player as an admin, and says which player that was.
 *
 * It runs at every start and sets a flag that is already true most of those times, which costs
 * one statement and means a database restored from a backup has its admin back as soon as the
 * server is up. The name is folded the way every other lookup of a name is. A name nobody holds
 * flags nobody: `null` comes back and the start says so, since the player may simply not have
 * claimed the name yet.
 */
export async function flagAdminPlayer(sql: Queries, name: string | null): Promise<AdminPlayer | null> {
  if (name === null) return null;
  const flagged = await sql.query<AdminPlayer>(
    'UPDATE players SET admin = true WHERE lower(name) = lower($1) RETURNING id, name',
    [name],
  );
  return flagged[0] ?? null;
}

/** An admin as a passphrase is checked against: their hash and the salt it was made under. */
interface AdminPassphrase extends AdminPlayer {
  passphrase_hash: string;
  passphrase_salt: Uint8Array;
}

/**
 * The admin these words belong to, or null when they are nobody's.
 *
 * The words have to say which player is asking as well as prove it, so every admin's hash is
 * tried in turn. There are one or two admins on this server and scrypt is slow on purpose, so
 * that is a few hundredths of a second; a server with a hundred admins would want the name
 * alongside the words, and this one does not.
 */
export async function adminFor(sql: Queries, passphrase: string | null): Promise<AdminPlayer | null> {
  if (passphrase === null || passphrase.trim() === '') return null;
  const admins = await sql.query<AdminPassphrase>(
    `SELECT id, name, passphrase_hash, passphrase_salt FROM players
     WHERE admin AND passphrase_hash IS NOT NULL AND passphrase_salt IS NOT NULL`,
  );
  for (const admin of admins) {
    const said = await passphraseHash(passphrase, admin.passphrase_salt);
    if (samePassphraseHash(admin.passphrase_hash, said)) return { id: admin.id, name: admin.name };
  }
  return null;
}

/** What an admin did: who did it, what they did, and what they did it to, named the way the
 *  action names it — a character's id, a player's name. */
export async function logAdminAction(
  sql: Queries,
  action: { by: number; did: string; about: string },
): Promise<void> {
  await sql.query('INSERT INTO admin_actions (player_id, action, about) VALUES ($1, $2, $3)', [
    action.by,
    action.did,
    action.about,
  ]);
}

/** How many characters a page of the admin's list holds. */
export const ADMIN_CHARACTERS_PER_PAGE = 50;

/** One character as the admin's list shows it. */
export interface AdminCharacterRow {
  characterId: string;
  /** The name the player claimed on this server, and the character's own. */
  player: string;
  name: string;
  game: string;
  /** The board the character's runs go on, the mode it is locked to where it is on no board, and
   *  null for one rolled for neither. */
  type: string | null;
  /** What has become of the character: still being played, dead, or the game won. */
  status: 'alive' | 'dead' | 'won';
  /** When the newest batch or save carrying the character landed, and null for one the server has
   *  been told nothing about since it was made known. */
  lastHeard: string | null;
}

export interface AdminCharacters {
  page: number;
  rows: AdminCharacterRow[];
  /** Whether there is a page after this one. */
  more: boolean;
}

/**
 * One page of every character here, whoever's it is, the newest first.
 *
 * The boards show only what a replay has passed and a player's roster shows only their own, so
 * this is the one list with everything in it: it is what an admin picks the character to delete
 * out of. Pages count from one.
 */
export async function allCharacters(sql: Queries, page: number): Promise<AdminCharacters> {
  // One row more than a page is asked for, and it is not shown: that is the whole answer to
  // whether there is a page after this one, without counting the table twice.
  const rows = await sql.query<AdminCharacterShape>(
    `SELECT c.id, p.name AS player, c.name AS name, c.game, c.leaderboard, c.play_lock,
            c.outcome, c.saved_at
     FROM characters c
     JOIN players p ON p.id = c.player_id
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT $1 OFFSET $2`,
    [ADMIN_CHARACTERS_PER_PAGE + 1, (page - 1) * ADMIN_CHARACTERS_PER_PAGE],
  );
  return {
    page,
    rows: rows.slice(0, ADMIN_CHARACTERS_PER_PAGE).map(adminCharacterRow),
    more: rows.length > ADMIN_CHARACTERS_PER_PAGE,
  };
}

/** A character's row as the query hands it over. */
interface AdminCharacterShape {
  id: string;
  player: string;
  name: string;
  game: string;
  leaderboard: string | null;
  play_lock: string | null;
  outcome: string | null;
  saved_at: Date | null;
}

function adminCharacterRow(row: AdminCharacterShape): AdminCharacterRow {
  return {
    characterId: row.id,
    player: row.player,
    name: row.name,
    game: row.game,
    type: row.leaderboard ?? row.play_lock,
    status: row.outcome === 'win' ? 'won' : row.outcome === null ? 'alive' : 'dead',
    lastHeard: row.saved_at === null ? null : row.saved_at.toISOString(),
  };
}
