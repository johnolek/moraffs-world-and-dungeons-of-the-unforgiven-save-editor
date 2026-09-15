import type { Leaderboard, RosterEntry } from '../app-state.svelte';
import { base64FromBytes } from '../bytes';
import type { JournalEntry } from '../play/journal';
import type { Milestone, RunGame, RunSession } from '../play/run';
import { oldestFirst } from './roster';
import { fromBase64 } from './storage';

/**
 * Where the browser keeps a player's characters: the record of each, the squares each has
 * discovered, the chain of sessions its run has been played in, and the journal those sessions
 * are written up in.
 *
 * IndexedDB rather than localStorage, which is where all of this used to live as one string.
 * localStorage holds about five megabytes for the whole site and only text, so every record had
 * to be base64 and a long run's inputs alone could fill a good part of it; and one string means
 * the whole roster is rewritten to keep one key of one game. Here a record is bytes, a session's
 * inputs are a typed array, and a character or a session is written on its own.
 */

const DATABASE = 'moraff-tools';

/** The schema. */
const VERSION = 2;
const CHARACTERS = 'characters';
const SESSIONS = 'sessions';
const JOURNAL = 'journal';
const MAPS = 'maps';

/** A character as a row, which is the roster entry with the records as bytes. */
interface CharacterRow {
  id: string;
  game: string;
  name: string;
  slot: number | null;
  importedBytes: Uint8Array<ArrayBuffer> | null;
  bytes: Uint8Array<ArrayBuffer>;
  createdAt: string;
  editedAt: string;
  dead: boolean;
  leaderboard: Leaderboard | null;
  /** Rows written before the board and the lock were two questions have no lock; the board they
   *  name is the mode that character was locked to. */
  lock?: Leaderboard | null;
}

/**
 * One sitting at a game as a row, under the character whose run it belongs to and the place it
 * comes in that run, which together are its key.
 *
 * The inputs are an Int16Array: a key is a byte or a negated scan code, and the four turns
 * Moraff's World writes down are -0x101 to -0x104, so the lot fits in a signed short.
 */
interface SessionRow {
  character: string;
  index: number;
  engine: string;
  game: RunGame;
  mode: string | null;
  leaderboard: Leaderboard | null;
  sound: boolean | null;
  name: string;
  startedAt: string;
  seed: number;
  record: Uint8Array<ArrayBuffer>;
  inputs: Int16Array;
  actions: number;
  time: number;
  milestones: Milestone[];
  edits: number;
}

/**
 * What one session of a run is written up as, under the character and the place in the run its
 * session is under.
 *
 * The journal is not part of the log and is not exported with it: a replay of the session writes
 * the same lines again. It is kept here so that a character's timeline is there to read without
 * one.
 */
interface JournalRow {
  character: string;
  index: number;
  entries: JournalEntry[];
}

/**
 * The squares one character has discovered, as the one string the game's own store holds.
 *
 * Two games keep a bitmap per floor and Moraff's Revenge keeps one array for the whole character,
 * so the two strings are not the same shape; nothing here reads either of them. They are a store
 * of their own rather than a field on the character because the record is written after every key
 * and the maps only when the character explores.
 */
interface MapsRow {
  character: string;
  maps: string;
}

/** One session of a character's run, named by where it comes in the run, counting from zero. */
export interface PlayedSession {
  entry: RosterEntry;
  at: number;
}

/**
 * Every character the browser is keeping, oldest first, each with its run, or null when there is
 * no database to be had: a browser set to block site data, or a private window that will not
 * open one.
 */
export async function readRoster(): Promise<RosterEntry[] | null> {
  try {
    const db = await database();
    const transaction = db.transaction([CHARACTERS, SESSIONS, JOURNAL], 'readonly');
    const [characters, sessions, journals] = await Promise.all([
      settled<CharacterRow[]>(transaction.objectStore(CHARACTERS).getAll()),
      settled<SessionRow[]>(transaction.objectStore(SESSIONS).getAll()),
      settled<JournalRow[]>(transaction.objectStore(JOURNAL).getAll()),
    ]);
    return rosterOf(characters, sessions, journals);
  } catch (thrown) {
    console.warn('The characters could not be read', thrown);
    return null;
  }
}

/** The explored maps of every character the browser is keeping, by character id. A browser with
 *  no database to be had has none of them. */
export async function readKeptMaps(): Promise<Map<string, string>> {
  try {
    const db = await database();
    const rows = await settled<MapsRow[]>(db.transaction([MAPS], 'readonly').objectStore(MAPS).getAll());
    return new Map(rows.map((row) => [row.character, row.maps]));
  } catch {
    return new Map();
  }
}

/** Put one character's explored maps in the database, or take away the ones it had. Says whether
 *  the database now holds them. */
export function keepMaps(id: string, maps: string | null): Promise<boolean> {
  return write([MAPS], (transaction) => {
    const store = transaction.objectStore(MAPS);
    if (maps === null) store.delete(id);
    else store.put({ character: id, maps } satisfies MapsRow);
  });
}

/**
 * Keep these characters' records and fields, and these sessions of their runs. Says whether they
 * went in.
 *
 * The two go in one transaction because the record and the run have to agree about how far the
 * game got: the next session of a chain starts from the record left behind by the one before it,
 * so a browser that took the record and dropped the session would leave a chain that cannot be
 * replayed.
 */
export async function keepPlayed(
  entries: readonly RosterEntry[],
  sessions: readonly PlayedSession[],
): Promise<boolean> {
  // The rows are built here rather than inside the write because the write waits its turn: the
  // game and the save editor both change a record in place, and the row has to hold the record
  // as it stood when the write was asked for.
  const characterRows = entries.map(characterRow);
  const sessionRows = sessions.map(sessionRow).filter((row): row is SessionRow => row !== null);
  const journalRows = sessions.map(journalRow).filter((row): row is JournalRow => row !== null);
  return write([CHARACTERS, SESSIONS, JOURNAL], (transaction) => {
    const characters = transaction.objectStore(CHARACTERS);
    for (const row of characterRows) characters.put(row);
    const played = transaction.objectStore(SESSIONS);
    for (const row of sessionRows) played.put(row);
    const journal = transaction.objectStore(JOURNAL);
    for (const row of journalRows) journal.put(row);
  });
}

/** Take a character off the roster for good: its record, its explored maps, its run and its
 *  journal. */
export function dropCharacter(id: string): Promise<boolean> {
  return write([CHARACTERS, SESSIONS, JOURNAL, MAPS], (transaction) => {
    transaction.objectStore(CHARACTERS).delete(id);
    transaction.objectStore(SESSIONS).delete(everythingOf(id));
    transaction.objectStore(JOURNAL).delete(everythingOf(id));
    transaction.objectStore(MAPS).delete(id);
  });
}

/** Every row of a store keyed by a character and a place in its run, for one character. */
function everythingOf(id: string): IDBKeyRange {
  return IDBKeyRange.bound([id, -Infinity], [id, Infinity]);
}

function characterRow(entry: RosterEntry): CharacterRow {
  return {
    id: entry.id,
    game: entry.game,
    name: entry.name,
    slot: entry.slot,
    importedBytes: entry.importedBytes ? entry.importedBytes.slice() : null,
    bytes: entry.bytes.slice(),
    createdAt: entry.createdAt,
    editedAt: entry.editedAt,
    dead: entry.dead,
    leaderboard: entry.leaderboard,
    lock: entry.lock,
  };
}

/** A session of a run as its row, or null where the run has none at that place. */
function sessionRow({ entry, at }: PlayedSession): SessionRow | null {
  const session = entry.run[at];
  if (!session) return null;
  const record = fromBase64(session.record);
  if (!record) return null;
  return {
    character: entry.id,
    index: at,
    engine: session.engine,
    game: session.game,
    mode: session.mode,
    leaderboard: session.leaderboard,
    sound: session.sound,
    name: session.name,
    startedAt: session.startedAt,
    seed: session.seed,
    record,
    inputs: Int16Array.from(session.inputs),
    milestones: session.milestones.map((milestone) => ({ ...milestone })),
    actions: session.actions,
    time: session.time,
    edits: session.edits,
  };
}

/** A session's journal as its row, or null where the run has no session at that place. */
function journalRow({ entry, at }: PlayedSession): JournalRow | null {
  if (!entry.run[at]) return null;
  // A character read out of the site's roster is reactive, so its journal is a Proxy, and the
  // database refuses to clone a Proxy. The snapshot is the same lines as plain arrays and objects.
  return { character: entry.id, index: at, entries: $state.snapshot(entry.journal[at] ?? []) };
}

/**
 * The rows as the roster, oldest first.
 *
 * A row holds when its character was made, and the roster has always been in that order, so that
 * is what it is sorted by; the rows themselves come back in whatever order their keys happen to
 * be in.
 */
function rosterOf(
  characters: CharacterRow[],
  sessions: SessionRow[],
  journals: JournalRow[],
): RosterEntry[] {
  const runs = new Map<string, Map<number, RunSession>>();
  for (const row of sessions) {
    const theirs = runs.get(row.character) ?? new Map<number, RunSession>();
    theirs.set(row.index, sessionOf(row));
    runs.set(row.character, theirs);
  }
  const written = new Map<string, Map<number, JournalEntry[]>>();
  for (const row of journals) {
    const theirs = written.get(row.character) ?? new Map<number, JournalEntry[]>();
    theirs.set(row.index, row.entries);
    written.set(row.character, theirs);
  }
  return characters
    .map((row) => {
      const run = runOf(runs.get(row.id));
      const theirs = written.get(row.id);
      return entryOf(row, run, run.map((session, at) => theirs?.get(at) ?? []));
    })
    .sort(oldestFirst);
}

/**
 * A character's sessions in the order they were played, stopping at the first one that is not
 * there. A chain is only worth anything unbroken from the roll: every session starts from the
 * record the one before it left behind, so a session with the one before it missing has nothing
 * to be replayed from.
 */
function runOf(theirs: Map<number, RunSession> | undefined): RunSession[] {
  const run: RunSession[] = [];
  for (let at = 0; theirs?.has(at); at++) run.push(theirs.get(at)!);
  return run;
}

function entryOf(row: CharacterRow, run: RunSession[], journal: JournalEntry[][]): RosterEntry {
  return {
    id: row.id,
    game: row.game,
    name: row.name,
    slot: row.slot,
    importedBytes: row.importedBytes ? new Uint8Array(row.importedBytes) : null,
    bytes: new Uint8Array(row.bytes),
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    dead: row.dead,
    leaderboard: row.leaderboard,
    lock: row.lock ?? row.leaderboard,
    run,
    journal,
  };
}

function sessionOf(row: SessionRow): RunSession {
  return {
    engine: row.engine,
    game: row.game,
    mode: row.mode,
    leaderboard: row.leaderboard,
    sound: row.sound,
    name: row.name,
    startedAt: row.startedAt,
    seed: row.seed,
    record: base64FromBytes(row.record),
    inputs: Array.from(row.inputs),
    milestones: row.milestones,
    actions: row.actions,
    time: row.time,
    edits: row.edits,
  };
}

/**
 * The writes, one after another.
 *
 * A key writes the record and the session it belongs to, and the next key writes them again a
 * moment later. Two such writes running at once would leave which of them landed last up to the
 * browser, so each one waits for the one before it to be finished with.
 */
let writing: Promise<unknown> = Promise.resolve();

async function write(stores: string[], work: (transaction: IDBTransaction) => void): Promise<boolean> {
  const done = writing.then(async () => {
    try {
      const db = await database();
      askToKeepTheStore();
      const transaction = db.transaction(stores, 'readwrite');
      const committed = finished(transaction);
      work(transaction);
      return await committed;
    } catch (thrown) {
      console.warn('The characters could not be kept', thrown);
      return false;
    }
  });
  writing = done;
  return done;
}

/** The database, opened once and shared by everything that reads or writes it. */
let opening: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  opening ??= open();
  return opening;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // A browser set to block site data has no indexedDB at all, and reaching for it can throw
    // outright rather than answering undefined.
    const store = globalThis.indexedDB as IDBFactory | undefined;
    if (!store) {
      reject(new Error('this browser keeps no database'));
      return;
    }
    const request = store.open(DATABASE, VERSION);
    request.onupgradeneeded = () => makeStores(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('the database would not open'));
  });
}

/** The stores this version wants, made where they are not there already: a database opened at an
 *  earlier version keeps the stores it had then, and making one that exists throws. */
function makeStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(CHARACTERS)) db.createObjectStore(CHARACTERS, { keyPath: 'id' });
  if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS, { keyPath: ['character', 'index'] });
  if (!db.objectStoreNames.contains(JOURNAL)) db.createObjectStore(JOURNAL, { keyPath: ['character', 'index'] });
  if (!db.objectStoreNames.contains(MAPS)) db.createObjectStore(MAPS, { keyPath: 'character' });
}

/**
 * Ask the browser to hold on to the store rather than throwing it away when it wants the room,
 * which is asked for once, at the first write.
 *
 * Safari drops a site's storage after seven days without a visit unless it has been granted, and
 * a character with a run behind it is not something to lose over a fortnight's holiday. The
 * answer is the browser's own — some grant it outright, some ask, some refuse — and nothing here
 * turns on it: a refusal leaves the store exactly as it would have been.
 */
let asked = false;

function askToKeepTheStore(): void {
  if (asked) return;
  asked = true;
  try {
    void globalThis.navigator?.storage?.persist?.().catch(() => undefined);
  } catch {
    // A browser with no such question to ask.
  }
}

/** One request as a promise. */
function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('the request failed'));
  });
}

/** Whether the transaction's writes are in the store. A store that is full aborts the whole
 *  transaction, so nothing of a failed write is left behind. */
function finished(transaction: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => resolve(false);
    transaction.onabort = () => resolve(false);
  });
}
