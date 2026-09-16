import { isKeptEndlessState } from '../src/lib/game/endless/state';
import type { Milestone } from '../src/lib/play/run';
import type { BatchClaims, BatchSession, CharacterSave, RunBatch } from '../src/lib/play/stream';
import type { Queries, Sql } from './sql';

/**
 * A run as it arrives: the character, its sittings, and the stretches of keys the site sends
 * while it is being played.
 *
 * The site cannot be trusted about how long a run took, because it is the player's own page. So
 * it sends what has been played every few seconds and the server stamps each stretch as it lands;
 * the stamps are the run's play time, and no clock of the site's is read at all. That is the only
 * reason a run arrives in pieces rather than whole at the end.
 *
 * Nothing here replays anything. `verifying.ts` is what puts the pieces back together into a run
 * log and passes a verdict on it.
 *
 * What a batch holds is `src/lib/play/stream.ts`, the site's half of this, so that the shape the
 * two agree on is written down once.
 */

export type { BatchClaims, BatchSession, CharacterSave, RunBatch };

/** Why a batch was not taken, which is what decides the words and the status the site is sent. */
export type BatchRefusal = 'another-player' | 'no-such-sitting' | 'changed-resend' | 'moved-on' | 'leased' | 'dead';

/**
 * How long a batch leases the character to the device that sent it.
 *
 * A character is played from one device at a time, or two runs would be written over each other
 * and neither would be the character's. Six times the sending interval: long enough that a device
 * playing on holds the lease through a batch or two that never arrived, and short enough that a
 * player who shuts one device and opens another is not kept waiting.
 */
export const LEASE_MS = 30_000;

/** What became of a batch: the sequence the server now has, or why it was refused. */
export type BatchTaken = { taken: true; received: number; ending: boolean } | { taken: false; because: BatchRefusal };

/** Who sent a batch. */
export interface BatchSender {
  /** The player the sending device's secret belongs to. */
  player: number;
  /** The device itself, which is the SHA-256 of that secret. */
  device: string;
}

/** A character's run as the server holds it, which is what `GET /runs/:id` answers with. */
export interface KeptRun {
  id: string;
  game: string;
  mode: string | null;
  name: string;
  createdAt: string;
  finishedAt: string | null;
  outcome: string | null;
  playerId: number;
  /** The name the player who played it claimed on this server. */
  player: string;
}

export interface CharacterRow {
  id: string;
  player_id: number;
  game: string;
  mode: string | null;
  name: string;
  created_at: Date;
  finished_at: Date | null;
  outcome: string | null;
  /** The device playing it, as the SHA-256 of that device's secret, and until when. */
  leased_to: string | null;
  leased_until: Date | null;
}

/**
 * Take a batch, stamped with the moment it arrived.
 *
 * A character is made known by its first batch and belongs to the player whose secret sent it,
 * which is why there is no registration step anywhere: the run is the registration.
 *
 * A batch under a sequence the run already holds is one that arrived before. It is taken again
 * when it holds the same stretch, and refused when it holds another, so that nothing a run was
 * really played with is quietly dropped.
 *
 * A batch that carries its own sitting is a different matter, and {@link keysToAdd} is where that
 * is worked out: such a batch always holds the sitting from its first key, so what is new about it
 * is whatever comes after the keys the server already holds.
 *
 * The stretch of keys and the character the batch carries go in together, in one transaction on
 * one connection. They are two halves of one fact — this is the character, and these are the keys
 * that brought it here — and a device that took one without the other would hand the next device
 * a character its run cannot be followed to.
 */
export async function takeBatch(
  sql: Sql,
  characterId: string,
  sender: BatchSender,
  batch: RunBatch,
  arrivedAt: number,
): Promise<BatchTaken> {
  return sql.transaction(async (queries) => {
    const character = await lockCharacter(queries, characterId);
    if (character !== null && character.player_id !== sender.player) {
      return { taken: false, because: 'another-player' };
    }
    if (character === null && batch.session === undefined) return { taken: false, because: 'no-such-sitting' };
    if (character !== null && leasedElsewhere(character, sender.device, arrivedAt)) {
      return { taken: false, because: 'leased' };
    }

    const chain = await sittingsHere(queries, characterId);
    const newest = chain[chain.length - 1]?.index ?? null;
    const held = chain.find((sitting) => sitting.index === batch.sessionIndex) ?? null;
    if (batch.session === undefined && held === null) return { taken: false, because: 'no-such-sitting' };

    const already =
      batch.session === undefined
        ? await batchAlreadyHere(queries, characterId, batch.sessionIndex, batch.sequence)
        : null;
    if (already !== null && !sameStretch(already, batch)) return { taken: false, because: 'changed-resend' };

    const adding = await keysToAdd(queries, characterId, batch, held, already !== null);
    if (adding === null) return { taken: false, because: 'moved-on' };
    // Keys for a sitting the run has been played past belong to a run this one is not: another
    // device carried the character on while this one was away.
    if (adding.inputs.length > 0 && newest !== null && batch.sessionIndex < newest) {
      return { taken: false, because: 'moved-on' };
    }
    // A character that died is played no further. The site stops the game at a death, so keys
    // arriving after one come from a page that got past that, and taking them would carry a run
    // on past the point the server has already passed a verdict on. Winning is not an ending of
    // this kind: a character that won is played on. The batch that ended the run arriving again
    // adds no keys and is taken as any other stretch already here is.
    if (character?.outcome === 'death' && adding.append && adding.inputs.length > 0) {
      return { taken: false, because: 'dead' };
    }

    if (character === null) await startBatchCharacter(queries, characterId, sender.player, batch);
    else await describeCharacter(queries, characterId, batch);

    if (batch.session !== undefined) await keepSession(queries, characterId, batch);
    else await updateSessionClaims(queries, characterId, batch);

    if (adding.append) {
      await appendBatch(queries, characterId, { ...batch, sequence: adding.sequence, inputs: adding.inputs }, arrivedAt);
    }
    if (batch.save !== undefined) await keepCharacterSave(queries, characterId, batch.save, arrivedAt);
    await leaseCharacter(queries, characterId, sender.device, arrivedAt);
    return { taken: true, received: batch.sequence, ending: batch.ending };
  });
}

/**
 * Whether another device is playing this character now.
 *
 * The lease is read against the moment the batch arrived rather than the database's own clock, so
 * that a batch is judged by when it landed and not by how long the statements before it took.
 */
export function leasedElsewhere(character: LeasedCharacter, device: string, now: number): boolean {
  if (character.leased_to === null || character.leased_to === device) return false;
  return character.leased_until !== null && character.leased_until.getTime() > now;
}

/** A character's lease, as any row carrying the two columns hands it over. */
export interface LeasedCharacter {
  leased_to: string | null;
  leased_until: Date | null;
}

/** The character is this device's for the next half minute, which every batch renews. */
async function leaseCharacter(sql: Queries, characterId: string, device: string, from: number): Promise<void> {
  await sql.query(
    'UPDATE characters SET leased_to = $1, leased_until = to_timestamp($2::double precision / 1000.0) WHERE id = $3',
    [device, from + LEASE_MS, characterId],
  );
}

/** Which keys of a batch are new, where they go, and whether there is a stretch to write at all. */
interface KeysToAdd {
  sequence: number;
  inputs: number[];
  append: boolean;
}

/**
 * What a batch has to add to the run, or null where it belongs to a run this one is not.
 *
 * A batch that carries its own sitting carries that sitting from its first key: the first batch
 * of a game holds everything played so far, and a sitting the server was never told about goes as
 * one batch of the whole thing. Every new sitting sends the ones before it again that way
 * (`catchUpBatch` in `src/lib/play/stream.ts`), because the device cannot know which of them the
 * server was ever told about. So where the server already holds that sitting, what is new about
 * the batch is only the keys beyond the ones already kept, and they go in as a stretch of their
 * own after them.
 *
 * Anything else about a sitting already here — another seed, another moment, keys that do not go
 * on from the ones here — is a second run of the same character played somewhere else. That is
 * not something to fold in.
 */
async function keysToAdd(
  sql: Queries,
  characterId: string,
  batch: RunBatch,
  held: SittingHere | null,
  arrivedBefore: boolean,
): Promise<KeysToAdd | null> {
  if (batch.session === undefined || held === null) {
    return { sequence: batch.sequence, inputs: batch.inputs, append: !arrivedBefore };
  }
  if (held.seed !== batch.session.seed || held.startedAt !== batch.session.startedAt) return null;
  const kept = await keysHere(sql, characterId, batch.sessionIndex);
  if (!startsWith(batch.inputs, kept)) return null;
  const inputs = batch.inputs.slice(kept.length);
  return { sequence: await nextSequence(sql, characterId, batch.sessionIndex), inputs, append: inputs.length > 0 };
}

/** Whether the keys begin with the ones already kept, which is what says the two halves are
 *  talking about the same sitting of the same run. */
function startsWith(all: readonly number[], start: readonly number[]): boolean {
  return all.length >= start.length && start.every((key, at) => all[at] === key);
}

/**
 * The character's row, held against the rest of this transaction.
 *
 * One character can be played from two devices at once, and both send batches. The lock is what
 * makes the reading and the writing below one step rather than two racing sets of statements: the
 * second batch waits here until the first has been taken or refused, and then sees what it did.
 */
export async function lockCharacter(sql: Queries, characterId: string): Promise<CharacterRow | null> {
  const rows = await sql.query<CharacterRow>('SELECT * FROM characters WHERE id = $1 FOR UPDATE', [characterId]);
  return rows[0] ?? null;
}

/** One sitting of a run as the server holds it, which is what says whether a batch of it belongs
 *  to the run here or to another one of the same character. */
interface SittingHere {
  index: number;
  seed: number;
  startedAt: string;
}

/** The sittings the run holds, oldest first. */
async function sittingsHere(sql: Queries, characterId: string): Promise<SittingHere[]> {
  const rows = await sql.query<{ session_index: number; seed: number; started_at: string }>(
    'SELECT session_index, seed, started_at FROM sessions WHERE character_id = $1 ORDER BY session_index',
    [characterId],
  );
  return rows.map((row) => ({ index: row.session_index, seed: row.seed, startedAt: row.started_at }));
}

/** Every key the run holds for one sitting, in the order they were played. */
async function keysHere(sql: Queries, characterId: string, sessionIndex: number): Promise<number[]> {
  const rows = await sql.query<{ inputs: number[] }>(
    'SELECT inputs FROM batches WHERE character_id = $1 AND session_index = $2 ORDER BY sequence',
    [characterId, sessionIndex],
  );
  return rows.flatMap((row) => row.inputs);
}

/** The sequence a stretch added to a sitting already here goes under, which is after every
 *  stretch of it the server holds. */
async function nextSequence(sql: Queries, characterId: string, sessionIndex: number): Promise<number> {
  const rows = await sql.query<{ highest: number | null }>(
    'SELECT max(sequence) AS highest FROM batches WHERE character_id = $1 AND session_index = $2',
    [characterId, sessionIndex],
  );
  return (rows[0]?.highest ?? -1) + 1;
}

/**
 * Keep the character as a device holds it: the record as it stands, the maps where they have
 * changed, and the rest of what a roster shows.
 *
 * The maps are much the biggest thing a batch carries and most keys change nothing about them, so
 * a batch whose maps are the ones the batch before it carried leaves them out and the ones here
 * stand.
 */
export async function keepCharacterSave(
  sql: Queries,
  characterId: string,
  save: CharacterSave,
  savedAt: number,
): Promise<void> {
  await sql.query(
    `UPDATE characters
     SET record = $1, maps = CASE WHEN $2::boolean THEN $3::text ELSE maps END, slot = $4, dead = $5,
         leaderboard = $6, play_lock = coalesce($7, play_lock),
         world_seed = coalesce($8, world_seed), endless = coalesce($9::jsonb, endless),
         edited_at = $10, saved_at = to_timestamp($11::double precision / 1000.0)
     WHERE id = $12`,
    [
      Buffer.from(save.record, 'base64'),
      save.maps !== undefined,
      save.maps ?? null,
      save.slot,
      save.dead,
      save.leaderboard,
      // A save that names no lock leaves the one here: a character's lock is decided at the roll
      // and never again, and a device on an older build names none.
      save.lock,
      // The endless world is decided at the roll and never again as well, so a save that names
      // none leaves the one here.
      save.worldSeed,
      // A save carrying no state leaves the one here, so that a device on an older build does not
      // empty a character that has picked something up on another one.
      save.endless === null ? null : JSON.stringify(save.endless),
      save.editedAt,
      savedAt,
      characterId,
    ],
  );
}

export async function runFor(sql: Queries, characterId: string): Promise<KeptRun | null> {
  const rows = await sql.query<CharacterRow & { player: string }>(
    `SELECT c.*, p.name AS player FROM characters c
     JOIN players p ON p.id = c.player_id WHERE c.id = $1`,
    [characterId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    game: row.game,
    mode: row.mode,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    finishedAt: row.finished_at === null ? null : row.finished_at.toISOString(),
    outcome: row.outcome,
    playerId: row.player_id,
    player: row.player,
  };
}

/**
 * The newest record a device sent for a character, and null for one the server has never been
 * sent a record of. A run's page reads the character out of it.
 */
export async function recordOf(sql: Queries, characterId: string): Promise<Uint8Array | null> {
  const rows = await sql.query<{ record: Uint8Array | null }>('SELECT record FROM characters WHERE id = $1', [
    characterId,
  ]);
  return rows[0]?.record ?? null;
}

/** The lease on a character, for a reader that wants to know whether it is being played
 *  elsewhere. A character nobody has ever played here has none. */
export async function leaseOn(sql: Queries, characterId: string): Promise<LeasedCharacter> {
  const rows = await sql.query<LeasedCharacter>('SELECT leased_to, leased_until FROM characters WHERE id = $1', [
    characterId,
  ]);
  return rows[0] ?? { leased_to: null, leased_until: null };
}

/** The character has ended its run, which is a death or a win and nothing else: leaving the game
 *  is not an ending, since the character is played again from where it stood. */
export async function endRun(sql: Queries, characterId: string, outcome: 'death' | 'win'): Promise<void> {
  await sql.query('UPDATE characters SET finished_at = now(), outcome = $1 WHERE id = $2', [outcome, characterId]);
}

/** What a character's row holds the moment the server is first told about it. */
export interface NewCharacter {
  id: string;
  playerId: number;
  game: string;
  mode: string | null;
  name: string;
  /** When the device rolled or imported it, or null for one whose device did not say. */
  createdAt: string | null;
}

/**
 * A character the server has never been told about, made known by whatever named it: the first
 * batch of a sitting, or an edit sent with no game running.
 *
 * `created_at` is when the device rolled or imported the character, where the device says so, and
 * not when this row was written: the roster is in that order, and a player who signs in elsewhere
 * should find their characters in the order they have always been in.
 */
export async function startCharacter(sql: Queries, character: NewCharacter): Promise<void> {
  await sql.query(
    `INSERT INTO characters (id, player_id, game, mode, name, created_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))`,
    [character.id, character.playerId, character.game, character.mode, character.name, character.createdAt],
  );
}

/** The character a first batch names, which carries its game and its name in that batch's
 *  sitting. */
async function startBatchCharacter(
  sql: Queries,
  characterId: string,
  playerId: number,
  batch: RunBatch,
): Promise<void> {
  const session = batch.session;
  if (session === undefined) return;
  await startCharacter(sql, {
    id: characterId,
    playerId,
    game: session.game,
    mode: batch.claims.mode,
    name: session.name,
    createdAt: batch.save?.createdAt ?? null,
  });
}

/** The name and the mode a character shows by are the newest sitting's, since a character is
 *  renamed on the roster and a run not locked to a board can be played another way tomorrow. */
async function describeCharacter(sql: Queries, characterId: string, batch: RunBatch): Promise<void> {
  const name = batch.session?.name;
  if (name === undefined) {
    await sql.query('UPDATE characters SET mode = $1 WHERE id = $2', [batch.claims.mode, characterId]);
  } else {
    await sql.query('UPDATE characters SET mode = $1, name = $2 WHERE id = $3', [batch.claims.mode, name, characterId]);
  }
}

async function keepSession(sql: Queries, characterId: string, batch: RunBatch): Promise<void> {
  const session = batch.session;
  if (session === undefined) return;
  const claims = batch.claims;
  await sql.query(
    `INSERT INTO sessions (character_id, session_index, seed, engine, game, leaderboard, sound, name,
                           started_at, record, mode, actions, time, edits, milestones)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (character_id, session_index) DO UPDATE SET
       mode = excluded.mode, actions = excluded.actions, time = excluded.time,
       edits = excluded.edits, milestones = excluded.milestones`,
    [
      characterId,
      batch.sessionIndex,
      session.seed,
      session.engine,
      session.game,
      session.leaderboard,
      session.sound,
      session.name,
      session.startedAt,
      Buffer.from(session.record, 'base64'),
      claims.mode,
      claims.actions,
      claims.time,
      claims.edits,
      JSON.stringify(claims.milestones),
    ],
  );
}

/** What a sitting already known now claims to have come to. */
async function updateSessionClaims(sql: Queries, characterId: string, batch: RunBatch): Promise<void> {
  const claims = batch.claims;
  await sql.query(
    `UPDATE sessions SET mode = $1, actions = $2, time = $3, edits = $4, milestones = $5
     WHERE character_id = $6 AND session_index = $7`,
    [claims.mode, claims.actions, claims.time, claims.edits, JSON.stringify(claims.milestones), characterId, batch.sessionIndex],
  );
}

/**
 * The batch already kept under a sitting's sequence, or null when that stretch has not arrived.
 *
 * The batch has to be looked at before anything is written, because a batch that is refused
 * leaves the run exactly as it was.
 */
async function batchAlreadyHere(
  sql: Queries,
  characterId: string,
  sessionIndex: number,
  sequence: number,
): Promise<KeptBatch | null> {
  const rows = await sql.query<BatchRow>(
    `SELECT id, session_index, sequence, inputs, pressed, arrived_at, ending FROM batches
     WHERE character_id = $1 AND session_index = $2 AND sequence = $3`,
    [characterId, sessionIndex, sequence],
  );
  return rows.length === 0 ? null : keptBatchOf(rows[0]);
}

/**
 * Whether a batch that has arrived again holds the stretch already kept under its sequence.
 *
 * A sequence is how the two halves name one stretch of a sitting, and the server keeps the first
 * one it is sent under that name. So a batch sent again after its answer was lost has to hold
 * what the first one held; one holding anything else means the two have lost track of the run
 * between them, and taking it would quietly drop whatever the difference is.
 *
 * What the sitting claims to have come to is not part of this: those claims belong to the
 * sitting rather than to one stretch of it, and the newest of them always stands.
 */
function sameStretch(kept: KeptBatch, sent: RunBatch): boolean {
  return (
    kept.pressed === sent.pressed &&
    kept.ending === sent.ending &&
    kept.inputs.length === sent.inputs.length &&
    kept.inputs.every((input, at) => input === sent.inputs[at])
  );
}

/** A batch under a sequence already here arrived before, so nothing is written and the sitting
 *  keeps the stamp of when that stretch really landed. */
async function appendBatch(sql: Queries, characterId: string, batch: RunBatch, arrivedAt: number): Promise<void> {
  await sql.query(
    `INSERT INTO batches (character_id, session_index, sequence, inputs, pressed, arrived_at, ending)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (character_id, session_index, sequence) DO NOTHING`,
    [
      characterId,
      batch.sessionIndex,
      batch.sequence,
      JSON.stringify(batch.inputs),
      batch.pressed,
      arrivedAt,
      batch.ending,
    ],
  );
}

/** One batch as it was kept, which is what a run is assembled and timed from. */
export interface KeptBatch {
  /** The row's own id, which counts up across every character as batches arrive. It is how a
   *  reader says which batches it has already taken in. */
  id: number;
  sessionIndex: number;
  sequence: number;
  inputs: number[];
  pressed: number;
  arrivedAt: number;
  ending: boolean;
}

/** A row of the batches table. It is a type rather than an interface so that a bag of columns can
 *  be read as one. */
type BatchRow = {
  id: number;
  session_index: number;
  sequence: number;
  inputs: number[];
  pressed: number;
  arrived_at: number;
  ending: boolean;
};

function keptBatchOf(row: BatchRow): KeptBatch {
  return {
    id: row.id,
    sessionIndex: row.session_index,
    sequence: row.sequence,
    inputs: row.inputs,
    pressed: row.pressed,
    arrivedAt: row.arrived_at,
    ending: row.ending,
  };
}

/** Every batch of a character's run, oldest sitting first and in the order the site sent them. */
export async function batchesOf(sql: Queries, characterId: string): Promise<KeptBatch[]> {
  const rows = await sql.query<BatchRow>(
    `SELECT id, session_index, sequence, inputs, pressed, arrived_at, ending FROM batches
     WHERE character_id = $1 ORDER BY session_index, sequence`,
    [characterId],
  );
  return rows.map(keptBatchOf);
}

/** One sitting as it was kept, without the keys, which the batches carry. */
export interface KeptSession {
  sessionIndex: number;
  seed: number;
  /** The endless world the character was rolled into, which every sitting of its chain was
   *  played in, and null for a character that plays the game as it shipped. */
  worldSeed: number | null;
  engine: string;
  game: string;
  leaderboard: string | null;
  sound: boolean | null;
  name: string;
  startedAt: string;
  record: string;
  mode: string | null;
  actions: number;
  time: number;
  edits: number;
  milestones: Milestone[];
}

/**
 * Every sitting of a character's run, oldest first.
 *
 * The endless world comes off the character rather than the sitting: it is decided at the roll
 * and never again, so every sitting of one character's chain was played in the same world.
 */
export async function sessionsOf(sql: Queries, characterId: string): Promise<KeptSession[]> {
  const rows = await sql.query<{
    session_index: number;
    seed: number;
    world_seed: number | null;
    engine: string;
    game: string;
    leaderboard: string | null;
    sound: boolean | null;
    name: string;
    started_at: string;
    record: Uint8Array;
    mode: string | null;
    actions: number;
    time: number;
    edits: number;
    milestones: Milestone[];
  }>(
    `SELECT s.*, c.world_seed FROM sessions s
     JOIN characters c ON c.id = s.character_id
     WHERE s.character_id = $1 ORDER BY s.session_index`,
    [characterId],
  );
  return rows.map((row) => ({
    sessionIndex: row.session_index,
    seed: row.seed,
    worldSeed: row.world_seed,
    engine: row.engine,
    game: row.game,
    leaderboard: row.leaderboard,
    sound: row.sound,
    name: row.name,
    startedAt: row.started_at,
    record: Buffer.from(row.record).toString('base64'),
    mode: row.mode,
    actions: row.actions,
    time: row.time,
    edits: row.edits,
    milestones: row.milestones,
  }));
}

/**
 * A batch out of a request body, or null when the body is not one.
 *
 * Everything that reaches the database is checked here first: the body comes off the open
 * internet, and a run log built out of unchecked fields would be handed straight to the engine.
 */
export function readRunBatch(body: unknown): RunBatch | null {
  if (typeof body !== 'object' || body === null) return null;
  const batch = body as Record<string, unknown>;
  const claims = readClaims(batch.claims);
  if (claims === null) return null;
  if (!isCount(batch.sessionIndex) || !isCount(batch.sequence) || !isCount(batch.pressed)) return null;
  if (typeof batch.ending !== 'boolean') return null;
  if (!Array.isArray(batch.inputs) || !batch.inputs.every((input) => Number.isInteger(input))) return null;
  const session = batch.session === undefined ? undefined : readBatchSession(batch.session);
  if (batch.session !== undefined && session === undefined) return null;
  const save = batch.save === undefined ? undefined : readCharacterSave(batch.save);
  if (batch.save !== undefined && save === undefined) return null;
  return {
    sessionIndex: batch.sessionIndex,
    sequence: batch.sequence,
    inputs: batch.inputs as number[],
    pressed: batch.pressed,
    ending: batch.ending,
    claims,
    session,
    save,
  };
}

/**
 * The character a batch carries, or undefined when what it carries is not one.
 *
 * `maps` left out and `maps` null are two different things: the first says the maps are the ones
 * the batch before it carried, and the second says the character has discovered none.
 */
export function readCharacterSave(value: unknown): CharacterSave | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const save = value as Record<string, unknown>;
  if (typeof save.record !== 'string') return undefined;
  if (save.maps !== undefined && save.maps !== null && typeof save.maps !== 'string') return undefined;
  if (save.slot !== null && !Number.isInteger(save.slot)) return undefined;
  if (typeof save.dead !== 'boolean') return undefined;
  if (save.leaderboard !== null && typeof save.leaderboard !== 'string') return undefined;
  // A device running a build from before the lock was a question of its own names none, which is
  // not a reason to turn the batch away.
  if (save.lock !== undefined && save.lock !== null && typeof save.lock !== 'string') return undefined;
  // A device on a build from before the endless world was recorded names none, which is not a
  // reason to turn the batch away either.
  if (save.worldSeed !== undefined && save.worldSeed !== null && !Number.isInteger(save.worldSeed)) return undefined;
  // What an endless character carries beside its record, which a device on an older build sends
  // none of. Anything else in its place is a batch the server will not take.
  if (save.endless !== undefined && save.endless !== null && !isKeptEndlessState(save.endless)) return undefined;
  // The moments are the device's own, and `created_at` is kept as a timestamp rather than as the
  // text it arrived as, so one that is not a moment at all would stop the whole batch.
  if (!isInstant(save.createdAt) || !isInstant(save.editedAt)) return undefined;
  return {
    record: save.record,
    maps: save.maps as string | null | undefined,
    slot: save.slot as number | null,
    dead: save.dead,
    leaderboard: save.leaderboard,
    lock: typeof save.lock === 'string' ? save.lock : null,
    worldSeed: typeof save.worldSeed === 'number' ? save.worldSeed : null,
    endless: isKeptEndlessState(save.endless) ? save.endless : null,
    createdAt: save.createdAt,
    editedAt: save.editedAt,
  };
}

function readBatchSession(value: unknown): BatchSession | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const session = value as Record<string, unknown>;
  if (!Number.isFinite(session.seed)) return undefined;
  if (typeof session.engine !== 'string' || typeof session.game !== 'string') return undefined;
  if (typeof session.name !== 'string' || typeof session.startedAt !== 'string') return undefined;
  if (typeof session.record !== 'string') return undefined;
  if (session.leaderboard !== null && typeof session.leaderboard !== 'string') return undefined;
  if (session.sound !== null && typeof session.sound !== 'boolean') return undefined;
  return {
    seed: session.seed as number,
    engine: session.engine,
    game: session.game,
    leaderboard: session.leaderboard,
    sound: session.sound,
    name: session.name,
    startedAt: session.startedAt,
    record: session.record,
  };
}

function readClaims(value: unknown): BatchClaims | null {
  if (typeof value !== 'object' || value === null) return null;
  const claims = value as Record<string, unknown>;
  if (!isCount(claims.actions) || !isCount(claims.edits)) return null;
  if (!Number.isFinite(claims.time)) return null;
  if (claims.mode !== null && typeof claims.mode !== 'string') return null;
  if (!Array.isArray(claims.milestones) || !claims.milestones.every(isMilestone)) return null;
  return {
    mode: claims.mode,
    actions: claims.actions,
    time: claims.time as number,
    edits: claims.edits,
    milestones: claims.milestones as Milestone[],
  };
}

function isMilestone(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const milestone = value as Record<string, unknown>;
  return (
    typeof milestone.kind === 'string' &&
    Number.isFinite(milestone.which) &&
    Number.isFinite(milestone.actions) &&
    Number.isFinite(milestone.time) &&
    Number.isFinite(milestone.floor)
  );
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
