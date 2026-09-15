import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RosterEntry } from '../app-state.svelte';
import { base64FromBytes } from '../bytes';
import { RunRecorder } from '../play/run';
import { newEntry } from './roster';

/** Where the roster lived before there was a database. */
const ROSTER_KEY = 'moraff-tools.roster';
/** Where the character in hand lives now. */
const CURRENT_KEY = 'moraff-tools.current-character';
/** Where the squares a character had discovered lived before there was a database, one key each. */
const MAPS_KEY = 'moraff-tools.maps.';
const REVENGE_MAP_KEY = 'moraff-tools.revenge-map.';

/** Enough of the browser's Storage to stand in for it. */
function fakeStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => void items.delete(key),
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

function useStorage(storage: Storage | undefined): void {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
}

/** The carry-over and the database it writes into are both read fresh, so one test's characters
 *  do not turn up in the next. */
let carryOver: typeof import('./carry-over');
let store: typeof import('./roster-db.svelte');

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  useStorage(fakeStorage());
  carryOver = await import('./carry-over');
  store = await import('./roster-db.svelte');
});

afterEach(() => useStorage(undefined));

const ROLLED_AT = new Date('2026-09-06T12:00:00Z');

function character(id: string, name: string): RosterEntry {
  const bytes = Uint8Array.from([1, 2, 3]);
  return newEntry({ game: 'unforgiven', name, slot: 21, bytes, imported: true }, ROLLED_AT, id);
}

/** One entry in the shape the roster was written in when it was a string in localStorage. */
function storedEntry(entry: RosterEntry): Record<string, unknown> {
  return {
    id: entry.id,
    game: entry.game,
    name: entry.name,
    slot: entry.slot,
    importedBytes: entry.importedBytes ? base64FromBytes(entry.importedBytes) : null,
    bytes: base64FromBytes(entry.bytes),
    createdAt: entry.createdAt,
    editedAt: entry.editedAt,
    dead: entry.dead,
    leaderboard: entry.leaderboard,
    run: entry.run,
  };
}

function storeRoster(entries: unknown[], currentId: string | null = null): void {
  localStorage.setItem(ROSTER_KEY, JSON.stringify({ currentId, entries }));
}

describe('a roster left in localStorage', () => {
  it('is moved into the database and the old key taken away', async () => {
    const entry = character('a', 'SAGEY');
    storeRoster([storedEntry(entry)], 'a');

    await carryOver.carryOverStoredRoster();

    expect(await store.readRoster()).toEqual([entry]);
    expect(localStorage.getItem(ROSTER_KEY)).toBeNull();
    expect(localStorage.getItem(CURRENT_KEY)).toBe('a');
  });

  it('brings the sessions of a run across with the character', async () => {
    const entry = character('a', 'SAGEY');
    const run = new RunRecorder({ game: 'unforgiven', name: 'SAGEY', record: entry.bytes });
    run.input(0x1b);
    entry.run = [run.log()];
    storeRoster([storedEntry(entry)]);

    await carryOver.carryOverStoredRoster();

    const read = await store.readRoster();
    expect(read![0].run).toEqual(entry.run);
  });

  it('is carried over once: a second start-up finds nothing to carry', async () => {
    storeRoster([storedEntry(character('a', 'SAGEY'))]);
    await carryOver.carryOverStoredRoster();

    await store.dropCharacter('a');
    await carryOver.carryOverStoredRoster();

    expect(await store.readRoster()).toEqual([]);
  });

  it('is left where it is when the database will not take it', async () => {
    vi.resetModules();
    Reflect.deleteProperty(globalThis, 'indexedDB');
    const withoutDatabase = await import('./carry-over');
    storeRoster([storedEntry(character('a', 'SAGEY'))]);

    await withoutDatabase.carryOverStoredRoster();

    expect(localStorage.getItem(ROSTER_KEY)).not.toBeNull();
  });

  it('forgets a character in hand that is not on the roster it was stored with', async () => {
    storeRoster([storedEntry(character('a', 'SAGEY'))], 'gone');
    await carryOver.carryOverStoredRoster();
    expect(localStorage.getItem(CURRENT_KEY)).toBeNull();
  });
});

describe('what an older stored roster left out', () => {
  it('reads a character stored before the site had leaderboards as free play', async () => {
    const entry = character('a', 'SAGEY');
    const { leaderboard, ...older } = storedEntry(entry);
    expect(leaderboard).toBeNull();
    storeRoster([older]);

    await carryOver.carryOverStoredRoster();

    const read = await store.readRoster();
    expect(read![0].leaderboard).toBeNull();
  });

  it('reads a character stored before the lock was asked for as locked to its board', async () => {
    // The stored shape has no lock in it at all: it is older than the question.
    storeRoster([{ ...storedEntry(character('a', 'SAGEY')), leaderboard: 'faithful' }]);

    await carryOver.carryOverStoredRoster();

    const read = await store.readRoster();
    expect(read![0].leaderboard).toBe('faithful');
    expect(read![0].lock).toBe('faithful');
  });

  it('reads a board this build does not know as free play', async () => {
    storeRoster([{ ...storedEntry(character('a', 'SAGEY')), leaderboard: 'cheating' }]);

    await carryOver.carryOverStoredRoster();

    const read = await store.readRoster();
    expect(read![0].leaderboard).toBeNull();
  });

  it('reads a character stored before runs were kept as one that has never been played', async () => {
    const { run, ...older } = storedEntry(character('a', 'SAGEY'));
    expect(run).toEqual([]);
    storeRoster([older]);

    await carryOver.carryOverStoredRoster();

    const read = await store.readRoster();
    expect(read![0].run).toEqual([]);
  });

  it('leaves out anything under a run that is not a session at all', async () => {
    const entry = character('a', 'SAGEY');
    const run = new RunRecorder({ game: 'unforgiven', name: 'SAGEY', record: entry.bytes });
    storeRoster([{ ...storedEntry(entry), run: [run.log(), { seed: 'not a seed' }] }]);

    await carryOver.carryOverStoredRoster();

    const read = await store.readRoster();
    expect(read![0].run).toHaveLength(1);
  });

  it('leaves out an entry this build cannot read', async () => {
    storeRoster([{ id: 'a' }, storedEntry(character('b', 'SAGEY'))]);

    await carryOver.carryOverStoredRoster();

    const read = await store.readRoster();
    expect(read?.map((entry) => entry.id)).toEqual(['b']);
  });

  it('takes the key away when what was stored is not a roster at all', async () => {
    localStorage.setItem(ROSTER_KEY, 'not json');

    await carryOver.carryOverStoredRoster();

    expect(await store.readRoster()).toEqual([]);
    expect(localStorage.getItem(ROSTER_KEY)).toBeNull();
  });
});

describe('the explored maps an earlier visit left in localStorage', () => {
  it('go into the database beside the character, whichever game keeps them', async () => {
    localStorage.setItem(`${MAPS_KEY}a`, '{"0:1":"AA"}');
    localStorage.setItem(`${REVENGE_MAP_KEY}b`, 'AQID');

    await carryOver.carryOverStoredMaps();

    expect(await store.readKeptMaps()).toEqual(
      new Map([
        ['a', '{"0:1":"AA"}'],
        ['b', 'AQID'],
      ]),
    );
  });

  it('take their keys with them, so the next visit carries nothing over', async () => {
    localStorage.setItem(`${MAPS_KEY}a`, '{"0:1":"AA"}');

    await carryOver.carryOverStoredMaps();

    expect(localStorage.getItem(`${MAPS_KEY}a`)).toBeNull();
  });

  it('leave every other key where it is', async () => {
    localStorage.setItem(CURRENT_KEY, 'a');
    localStorage.setItem(`${MAPS_KEY}a`, '{"0:1":"AA"}');

    await carryOver.carryOverStoredMaps();

    expect(localStorage.getItem(CURRENT_KEY)).toBe('a');
  });

  it('take away a key a death emptied without keeping maps for it', async () => {
    localStorage.setItem(`${REVENGE_MAP_KEY}b`, '');

    await carryOver.carryOverStoredMaps();

    expect(await store.readKeptMaps()).toEqual(new Map());
    expect(localStorage.getItem(`${REVENGE_MAP_KEY}b`)).toBeNull();
  });

  it('stay where they are when the database will not take them', async () => {
    vi.resetModules();
    Reflect.deleteProperty(globalThis, 'indexedDB');
    const withoutDatabase = await import('./carry-over');
    localStorage.setItem(`${MAPS_KEY}a`, '{"0:1":"AA"}');

    await withoutDatabase.carryOverStoredMaps();

    expect(localStorage.getItem(`${MAPS_KEY}a`)).toBe('{"0:1":"AA"}');
  });
});
