import type { KeptEndlessState } from '../src/lib/game/endless/state';
import type { RunSession } from '../src/lib/play/run';
import type { CharacterSave } from '../src/lib/play/stream';
import {
  batchesOf,
  keepCharacterSave,
  leasedElsewhere,
  lockCharacter,
  readCharacterSave,
  sessionsOf,
  startCharacter,
  type BatchSender,
  type LeasedCharacter,
} from './runs';
import type { Queries, Sql } from './sql';
import { runLogFrom, sessionWithoutKeys } from './verifying';

/**
 * A player's characters, as another device of theirs picks them up.
 *
 * A character belongs to the player rather than to the browser it was rolled in: sign in with the
 * name and the passphrase on a second device and this is what puts the roster there, each
 * character where its last sitting left it. The record and the maps are the newest a device sent,
 * on a batch or on an edit of its own, and the chain is the sittings the server was told about;
 * asked for whole, it is put back together out of them and the stretches of keys that arrived,
 * which is the same log the device wrote.
 *
 * A character reaches this list by being played, or by being sent on its own with an edit made
 * while no game was running.
 *
 * The chain goes out without the keys of its sittings. Moraff's Revenge writes an input for every
 * tick of its monsters' clock, so a chain of it is megabytes, and a device asks for the keys of
 * one character at a time and only when it needs them: to play the character on, or to export the
 * run. What stands in their place is how many of them the server holds, which is all the device's
 * merge compares.
 */

/** One sitting as the roster carries it: everything a run log says about it but the keys, and how
 *  many of those the server holds in their place. */
export type RosterSession = Omit<RunSession, 'inputs'> & { inputCount: number };

/** One character as a device takes it up. */
export interface RosterCharacter {
  id: string;
  game: string;
  name: string;
  slot: number | null;
  dead: boolean;
  /** The board its runs go on, or null for one whose runs go on no board. */
  leaderboard: string | null;
  /** The mode it is played in for the rest of its life, or null for one that can be played any
   *  way. A character kept here before this was a question of its own has none, and the board it
   *  names is what it was locked to. */
  lock: string | null;
  /** The number the endless world it plays in is built from, for a character locked to the
   *  endless dungeon, and null for every other character. */
  worldSeed: number | null;
  /** What it carries in that world beside its record, and null for a character carrying
   *  nothing. */
  endless: KeptEndlessState | null;
  createdAt: string;
  /** When the device last changed it, and null for a character whose device has sent none. */
  editedAt: string | null;
  /** The newest record a device sent, base64, and null for a character sent before the server
   *  kept records. */
  record: string | null;
  /** The squares it has discovered, as the device keeps them. */
  maps: string | null;
  /** When that record and those maps arrived, by this server's clock. */
  savedAt: string | null;
  /** Every sitting it has been played in, oldest first, each with how many keys it holds rather
   *  than the keys themselves. */
  run: RosterSession[];
  /** Whether another device of this player's is playing it now, so that two devices never play
   *  one character at once. */
  leasedElsewhere: boolean;
}

interface RosterRow extends LeasedCharacter {
  id: string;
  game: string;
  name: string;
  slot: number | null;
  dead: boolean;
  leaderboard: string | null;
  play_lock: string | null;
  world_seed: number | null;
  endless: KeptEndlessState | null;
  created_at: Date;
  edited_at: string | null;
  record: Uint8Array | null;
  maps: string | null;
  saved_at: Date | null;
}

/**
 * Every character of one player, oldest first.
 *
 * The chain is read a character at a time rather than in one query over the lot: a roster is a
 * handful of characters, and a run's keys are the biggest thing here by far, so nothing is gained
 * by joining them all together.
 */
export async function rosterOf(
  sql: Queries,
  playerId: number,
  device: string,
  now: number,
): Promise<RosterCharacter[]> {
  const rows = await sql.query<RosterRow>(
    `SELECT id, game, name, slot, dead, leaderboard, play_lock, world_seed, endless, created_at,
            edited_at, record, maps, saved_at, leased_to, leased_until
     FROM characters WHERE player_id = $1 ORDER BY created_at, id`,
    [playerId],
  );
  const roster: RosterCharacter[] = [];
  for (const row of rows) roster.push(await characterOf(sql, row, device, now));
  return roster;
}

async function characterOf(sql: Queries, row: RosterRow, device: string, now: number): Promise<RosterCharacter> {
  const sessions = await sessionsOf(sql, row.id);
  const counted = await inputsPerSitting(sql, row.id);
  return {
    id: row.id,
    game: row.game,
    name: row.name,
    slot: row.slot,
    dead: row.dead,
    leaderboard: row.leaderboard,
    lock: row.play_lock ?? row.leaderboard,
    worldSeed: row.world_seed,
    endless: row.endless,
    createdAt: row.created_at.toISOString(),
    editedAt: row.edited_at,
    record: row.record === null ? null : Buffer.from(row.record).toString('base64'),
    maps: row.maps,
    savedAt: row.saved_at === null ? null : row.saved_at.toISOString(),
    run: sessions.map((session) => ({
      ...sessionWithoutKeys(session),
      inputCount: counted.get(session.sessionIndex) ?? 0,
    })),
    leasedElsewhere: leasedElsewhere(row, device, now),
  };
}

/**
 * How many inputs the server holds for each sitting of one character, by the place that sitting
 * comes in the run. The inputs themselves are never read: counting them is the whole point.
 *
 * It is the length of the log and not the number of keys a person pressed. The device compares
 * this against the length of its own copy of that sitting to work out which copy of the character
 * stands (`deviceIsAhead` in `src/lib/character/server-roster.ts`), and the log is the only thing
 * the device has to count. A run played on the clock writes a tick reading into the log ahead of
 * every key, and Moraff's Revenge writes an input for every tick of its monsters' clock, so those
 * runs count well above the keys that were pressed — on both sides, which is what matters here.
 * The number of keys is `sum(pressed)` over the same rows, for anything that wants it.
 */
async function inputsPerSitting(sql: Queries, characterId: string): Promise<Map<number, number>> {
  const rows = await sql.query<{ session_index: number; inputs: string }>(
    `SELECT session_index, coalesce(sum(jsonb_array_length(inputs)), 0) AS inputs
     FROM batches WHERE character_id = $1 GROUP BY session_index`,
    [characterId],
  );
  return new Map(rows.map((row) => [row.session_index, Number(row.inputs)]));
}

/**
 * The whole chain of one character of this player, with the keys of every sitting: what the
 * roster answer leaves out.
 *
 * Null when no character of theirs has that id, which is also what a character of somebody
 * else's comes to, so a player is told the same thing either way.
 */
export async function keptRunOf(sql: Queries, characterId: string, playerId: number): Promise<RunSession[] | null> {
  const mine = await sql.query('SELECT id FROM characters WHERE id = $1 AND player_id = $2', [characterId, playerId]);
  if (mine.length === 0) return null;
  const sessions = await sessionsOf(sql, characterId);
  const batches = await batchesOf(sql, characterId);
  return runLogFrom(sessions, batches).sessions;
}

/**
 * A character as an edit made outside a game hands it over.
 *
 * The save is the one the batches of a run carry, since it is the same character either way. The
 * game and the name come with it because a character edited before it has ever been played is one
 * the server has never been told about, and its row has to be made from something.
 */
export interface CharacterEdit {
  game: string;
  name: string;
  save: CharacterSave;
}

/** What became of an edit: it is here, or the reason it was not taken. */
export type EditTaken = 'kept' | 'leased' | 'another-player';

/**
 * Keep a character a device edited with no game running.
 *
 * A character's record otherwise reaches this server only on the batches of a run, so an edit
 * made in the Save Editor would sit on the device until the next sitting and be lost if another
 * device played the character first. This is that edit arriving on its own.
 *
 * The lease is respected the way a batch's is: the device playing the character is writing the
 * record after every key, and an edit from elsewhere landing in the middle of that would be
 * written over by the next batch anyway. Nothing here takes the lease, since nobody is playing.
 */
export async function keepEditedCharacter(
  sql: Sql,
  characterId: string,
  sender: BatchSender,
  edit: CharacterEdit,
  savedAt: number,
): Promise<EditTaken> {
  return sql.transaction(async (queries) => {
    const character = await lockCharacter(queries, characterId);
    if (character !== null && character.player_id !== sender.player) return 'another-player';
    if (character !== null && leasedElsewhere(character, sender.device, savedAt)) return 'leased';
    if (character === null) {
      await startCharacter(queries, {
        id: characterId,
        playerId: sender.player,
        game: edit.game,
        mode: null,
        name: edit.name,
        createdAt: edit.save.createdAt,
      });
    } else {
      await queries.query('UPDATE characters SET name = $1 WHERE id = $2', [edit.name, characterId]);
    }
    await keepCharacterSave(queries, characterId, edit.save, savedAt);
    return 'kept';
  });
}

/** A character out of a request body, or null when the body is not one. Everything that reaches
 *  the database is checked first: the body comes off the open internet. */
export function readCharacterEdit(body: unknown): CharacterEdit | null {
  if (typeof body !== 'object' || body === null) return null;
  const edit = body as Record<string, unknown>;
  if (typeof edit.game !== 'string' || typeof edit.name !== 'string') return null;
  const save = readCharacterSave(edit.save);
  return save === undefined ? null : { game: edit.game, name: edit.name, save };
}

/**
 * Take a character off this player's roster for good: the run, the verdict on it, whatever was
 * announced about it and the character itself.
 *
 * Says whether there was one to forget. A character of another player's is not one, so a player
 * cannot delete what is not theirs and is told the same thing either way.
 */
export async function forgetKeptCharacter(sql: Sql, characterId: string, playerId: number): Promise<boolean> {
  return sql.transaction(async (queries) => {
    const mine = await queries.query('SELECT id FROM characters WHERE id = $1 AND player_id = $2', [
      characterId,
      playerId,
    ]);
    if (mine.length === 0) return false;
    await deleteCharacterRows(queries, characterId);
    return true;
  });
}

/**
 * The same, for an admin, whoever the character belongs to.
 *
 * Says whether there was one to forget, so that a character that is not here and a character an
 * admin has just deleted are one answer.
 */
export async function forgetAnyCharacter(sql: Sql, characterId: string): Promise<boolean> {
  return sql.transaction(async (queries) => {
    const here = await queries.query('SELECT id FROM characters WHERE id = $1', [characterId]);
    if (here.length === 0) return false;
    await deleteCharacterRows(queries, characterId);
    return true;
  });
}

/** Every table that points at the character, and then the character itself. */
async function deleteCharacterRows(queries: Queries, characterId: string): Promise<void> {
  await queries.query('DELETE FROM announcements WHERE character_id = $1', [characterId]);
  await queries.query('DELETE FROM living WHERE character_id = $1', [characterId]);
  await queries.query('DELETE FROM verdicts WHERE character_id = $1', [characterId]);
  await queries.query('DELETE FROM batches WHERE character_id = $1', [characterId]);
  await queries.query('DELETE FROM sessions WHERE character_id = $1', [characterId]);
  await queries.query('DELETE FROM characters WHERE id = $1', [characterId]);
}
