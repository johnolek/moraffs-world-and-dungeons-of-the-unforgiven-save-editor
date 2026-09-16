import type { RosterEntry } from '../app-state.svelte';
import { offTheBoards, playerSecret } from '../player';
import type { RunSession } from '../play/run';
import { characterSave } from '../play/streaming';
import { isRunSession } from '../play/verify';
import { runServerUrl } from '../run-server';
import { isLeaderboard } from './leaderboard';
import { fromBase64 } from './storage';

/**
 * The characters the run server is keeping for this player.
 *
 * A character belongs to the player rather than to the browser it was rolled in: it is sent with
 * the run as it is played, and signing in on a second device with the name and the passphrase is
 * what brings the roster there. Nothing here writes anything down — reading the answer and
 * deciding which copy of a character stands is what this is; putting one in the store is
 * `current.ts`.
 *
 * A device with no name gets nothing back, and a build with no server address asks nobody, so
 * both work exactly as the site always has, on the store in the browser.
 */

/**
 * One sitting as the roster answer carries it: everything a run log says about it but the keys,
 * and how many of them the server holds in their place.
 *
 * A chain of Moraff's Revenge, whose monsters' clock ticks are inputs of the log, is megabytes,
 * and the roster carries every character's on every page load. So the keys are asked for one
 * character at a time, through `readServerRun`, and only where they are needed.
 */
export interface ServerSession extends RunSession {
  inputCount: number;
}

/** One character as the server hands it over. */
export interface ServerCharacter {
  id: string;
  game: string;
  name: string;
  slot: number | null;
  dead: boolean;
  leaderboard: string | null;
  /** The mode the character is locked to for life. A server that has not been told about a
   *  character's lock names none, and the board it names is that character's lock. */
  lock: string | null;
  /** The number the endless world it plays in is built from, for a character locked to the
   *  endless dungeon, and null for every other character. */
  worldSeed: number | null;
  createdAt: string;
  editedAt: string | null;
  /** The newest record any device of this player's sent, base64. */
  record: string | null;
  /** The explored maps as the device that played it keeps them. */
  maps: string | null;
  savedAt: string | null;
  run: ServerSession[];
  /** Whether another device of this player's is playing it now. */
  leasedElsewhere: boolean;
}

/**
 * Every character the server is keeping for this player, or null when there is nothing to be had:
 * a build with no server, a device that has claimed no name, or a server that did not answer.
 *
 * Null is the answer that changes nothing. The roster in the browser is what stands then, and the
 * next visit asks again.
 */
export async function readServerRoster(): Promise<ServerCharacter[] | null> {
  const answer = await askTheServer('/players/me/characters');
  if (answer === null) return null;
  const characters = (answer as { characters?: unknown }).characters;
  return Array.isArray(characters)
    ? characters.map(serverCharacter).filter((character): character is ServerCharacter => character !== null)
    : null;
}

/**
 * Put a character on the server as this device holds it now, which is what an edit made with no
 * game running is.
 *
 * A character's record otherwise travels with the batches of a run, so an edit made in the Save
 * Editor would wait for the next sitting and be lost if another device played the character
 * first. The server makes the character known where it has never been told about it, so a
 * character rolled and edited here is on the player's other devices before it is ever played.
 *
 * Nothing is done about a refusal. A device that has claimed no name has no roster on the server
 * to keep, and a character another device is playing at this moment is being written by that
 * device after every key; either way the edit stands on the roster here and goes up with the next
 * batch of the next sitting.
 */
export async function keepCharacterOnServer(entry: RosterEntry): Promise<void> {
  const server = runServerUrl();
  if (server === null || offTheBoards()) return;
  try {
    await fetch(`${server}/players/me/characters/${encodeURIComponent(entry.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerSecret()}` },
      body: JSON.stringify({ game: entry.game, name: entry.name, save: characterSave(entry) }),
    });
  } catch {
    // A server that was not reached holds whatever it held before, and the character here is
    // unchanged by the attempt.
  }
}

/**
 * The whole chain of one character, with the keys of every sitting, which the roster answer leaves
 * out. Null when there was nothing to be had, which leaves the chain in hand as it was.
 */
export async function readServerRun(id: string): Promise<RunSession[] | null> {
  const answer = await askTheServer(`/players/me/characters/${encodeURIComponent(id)}/run`);
  if (answer === null) return null;
  const run = (answer as { run?: unknown }).run;
  return Array.isArray(run) ? run.filter(isRunSession) : null;
}

/** Take a character off the server for good, which is what forgetting one here means for a player
 *  who has a name: it is gone from every device of theirs and not only this one. */
export async function forgetOnServer(id: string): Promise<void> {
  const server = runServerUrl();
  if (server === null) return;
  try {
    await fetch(`${server}/players/me/characters/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${playerSecret()}` },
    });
  } catch {
    // The character is off this device either way. A server that was not reached still holds it,
    // and it comes back on the next roster read: forgetting it again is all there is to do.
  }
}

/** Whether another device of this player's is playing the character now, which is what the Play
 *  tab asks before it starts a game. A server that says nothing is not a reason to refuse. */
export async function beingPlayedElsewhere(id: string): Promise<boolean> {
  const answer = await askTheServer(`/runs/${encodeURIComponent(id)}`);
  return answer !== null && (answer as { leasedElsewhere?: unknown }).leasedElsewhere === true;
}

/** One GET carrying this browser's secret, or null where there was no answer to be had. */
async function askTheServer(path: string): Promise<object | null> {
  const server = runServerUrl();
  if (server === null) return null;
  try {
    const response = await fetch(`${server}${path}`, { headers: { Authorization: `Bearer ${playerSecret()}` } });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null ? body : null;
  } catch {
    return null;
  }
}

function serverCharacter(value: unknown): ServerCharacter | null {
  if (typeof value !== 'object' || value === null) return null;
  const character = value as Record<string, unknown>;
  const { id, game, name, createdAt } = character;
  if (typeof id !== 'string' || typeof game !== 'string' || typeof name !== 'string') return null;
  if (typeof createdAt !== 'string') return null;
  return {
    id,
    game,
    name,
    slot: Number.isInteger(character.slot) ? (character.slot as number) : null,
    dead: character.dead === true,
    leaderboard: isLeaderboard(character.leaderboard) ? character.leaderboard : null,
    lock: isLeaderboard(character.lock) ? character.lock : null,
    worldSeed: typeof character.worldSeed === 'number' ? character.worldSeed : null,
    createdAt,
    editedAt: typeof character.editedAt === 'string' ? character.editedAt : null,
    record: typeof character.record === 'string' ? character.record : null,
    maps: typeof character.maps === 'string' ? character.maps : null,
    savedAt: typeof character.savedAt === 'string' ? character.savedAt : null,
    run: Array.isArray(character.run)
      ? character.run.map(serverSession).filter((session): session is ServerSession => session !== null)
      : [],
    leasedElsewhere: character.leasedElsewhere === true,
  };
}

/**
 * One sitting the server sent, or null when it is not one this build can read.
 *
 * The roster answer leaves the keys out and the run endpoint carries them, so a sitting with none
 * is read as a sitting with no keys here yet; `inputCount` is how many the server holds.
 */
function serverSession(value: unknown): ServerSession | null {
  if (typeof value !== 'object' || value === null) return null;
  const session = value as Record<string, unknown>;
  const inputs: unknown[] = Array.isArray(session.inputs) ? session.inputs : [];
  const log = { ...session, inputs };
  if (!isRunSession(log)) return null;
  return { ...log, inputCount: typeof session.inputCount === 'number' ? session.inputCount : inputs.length };
}

/**
 * The character as it goes on the roster here, or null for one with no record to play from.
 *
 * `kept` is the copy this device already had, and two things are taken from it: the file the
 * character was imported from, which never leaves the device it was dropped on, and the journal,
 * which the server does not keep -- it replays a run's log for one. A session of the chain this
 * device has not played has no journal here until something replays it. What an endless character
 * carries in its world is taken from it as well: the server is not told, and a device that has
 * never played the character works it out by replaying the chain.
 */
export function entryFromServer(character: ServerCharacter, kept: RosterEntry | null): RosterEntry | null {
  const bytes = character.record === null ? null : fromBase64(character.record);
  if (bytes === null || bytes.length === 0) return null;
  return {
    id: character.id,
    game: character.game,
    name: character.name,
    slot: character.slot,
    importedBytes: kept?.importedBytes ?? null,
    bytes,
    createdAt: character.createdAt,
    editedAt: character.editedAt ?? character.createdAt,
    dead: character.dead,
    leaderboard: isLeaderboard(character.leaderboard) ? character.leaderboard : null,
    lock: isLeaderboard(character.lock) ? character.lock : isLeaderboard(character.leaderboard) ? character.leaderboard : null,
    // The second a roll was started in stays on the device that rolled it: the server keeps the
    // record and the run, and a roll is neither.
    rolledAt: kept?.rolledAt ?? null,
    // The endless world does travel, so that a character rolled on one device plays in the same
    // dungeon on the next. A server that has not been told which world it was rolled into leaves
    // the one this device holds.
    worldSeed: character.worldSeed ?? kept?.worldSeed,
    endless: kept?.endless,
    run: character.run.map((session, at) => sittingWithKeys(session, kept?.run[at])),
    journal: kept?.journal ?? [],
  };
}

/**
 * One sitting of the chain, with the keys this device already holds for it.
 *
 * The roster answer carries how many keys the server has rather than the keys themselves, so a
 * sitting this device played is recognised by its seed, its moment and that count, and the keys
 * here are those keys. A sitting this device has not played comes with none until
 * {@link readServerRun} is asked for them.
 */
function sittingWithKeys(session: ServerSession, here: RunSession | undefined): RunSession {
  const { inputCount, ...log } = session;
  const same = here !== undefined && here.seed === session.seed && here.startedAt === session.startedAt;
  return { ...log, inputs: same && here.inputs.length === inputCount ? here.inputs : log.inputs };
}

/**
 * Whether this device knows something about the character that the server does not.
 *
 * The server's copy is the newest one anybody sent it, so it is the one to take — except while
 * this device is holding keys it has not managed to send, which is what playing offline leaves
 * behind. Those keys are only here, and taking the server's copy over them would lose the stretch
 * of play they are.
 *
 * Being ahead means going on from where the server stands: the same sittings, each starting the
 * same way, with the server's keys the first of this device's. Anything else is two runs of the
 * same character that have parted company — another device played it on while this one was
 * away — and then the server's copy is the character and this one is not.
 *
 * The roster answer carries how many keys the server holds rather than the keys themselves, so
 * this is a comparison of counts. That is all it ever was: a sitting is recognised by its seed
 * and its moment, and how far it has been played is how many keys it holds.
 */
export function deviceIsAhead(device: readonly RunSession[], server: readonly ServerSession[]): boolean {
  if (device.length < server.length) return false;
  for (const [at, sitting] of server.entries()) {
    const here = device[at];
    if (here.seed !== sitting.seed || here.startedAt !== sitting.startedAt) return false;
    if (here.inputs.length < sitting.inputCount) return false;
    // A sitting the server has been played past cannot have grown here: the keys of it that
    // reached the server are all there ever were.
    if (at < server.length - 1 && here.inputs.length > sitting.inputCount) return false;
  }
  return device.length > server.length || moreKeysThan(device, server);
}

/** Whether the newest sitting here holds keys the server's copy of it does not. */
function moreKeysThan(device: readonly RunSession[], server: readonly ServerSession[]): boolean {
  const newest = server.length - 1;
  return newest >= 0 && device[newest].inputs.length > server[newest].inputCount;
}
