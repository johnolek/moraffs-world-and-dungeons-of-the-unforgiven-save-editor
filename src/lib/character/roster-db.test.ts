import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RosterEntry } from '../app-state.svelte';
import { RunRecorder, runLogOf } from '../play/run';
import { newEntry } from './roster';

/**
 * The store keeps the database it opened, so every test takes a fresh module over a fresh
 * database rather than one test's characters turning up in the next.
 */
let store: typeof import('./roster-db.svelte');

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  store = await import('./roster-db.svelte');
});

const ROLLED_AT = new Date('2026-09-06T12:00:00Z');

function character(id: string, name: string, at = ROLLED_AT): RosterEntry {
  const bytes = Uint8Array.from([1, 2, 3]);
  return newEntry({ game: 'unforgiven', name, slot: 21, bytes, imported: false }, at, id);
}

/** One sitting at the game, with a key or two in it so the inputs are not empty, and a line of
 *  journal to go with it. */
function played(entry: RosterEntry, keys: number[]): void {
  const run = new RunRecorder({ game: 'unforgiven', name: entry.name, record: entry.bytes });
  for (const key of keys) run.input(key);
  entry.run = [...entry.run, run.log()];
  entry.journal = [
    ...entry.journal,
    [{ at: 1, floor: 0, module: 0, text: 'Stepped north', event: { kind: 'stepped', dir: 0 } }],
  ];
}

/**
 * The value behind a Proxy that hands out Proxies for whatever it holds, which is what reading a
 * character out of the site's reactive roster gives: Svelte wraps every array and plain object
 * it reaches through `$state`, and structured clone refuses a Proxy outright.
 */
function reactiveLike<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) return value;
  return new Proxy(value, { get: (target, key) => reactiveLike(Reflect.get(target, key)) });
}

/** Every session of every character, which is what the carry-over and the first write name. */
function allSessions(entries: RosterEntry[]) {
  return entries.flatMap((entry) => entry.run.map((_, at) => ({ entry, at })));
}

describe('the roster in the database', () => {
  it('comes back as it went in, oldest first', async () => {
    const older = character('b', 'SAGEY', new Date('2026-09-01T00:00:00Z'));
    const newer = character('a', 'NEWBIE', new Date('2026-09-08T00:00:00Z'));
    played(older, [0x1b, -0x48]);
    expect(await store.keepPlayed([newer, older], allSessions([newer, older]))).toBe(true);

    const read = await store.readRoster();
    expect(read?.map((entry) => entry.name)).toEqual(['SAGEY', 'NEWBIE']);
    expect(read?.[0]).toEqual(older);
  });

  it('keeps the second a character was rolled in, which is what its roll was made of', async () => {
    const entry = character('a', 'SAGEY');
    entry.rolledAt = 1_757_000_000;
    await store.keepPlayed([entry], []);

    const read = await store.readRoster();
    expect(read?.[0].rolledAt).toBe(1_757_000_000);
  });

  it('keeps the journal of a session beside the session itself', async () => {
    const entry = character('a', 'SAGEY');
    played(entry, [-0x48]);
    await store.keepPlayed([entry], allSessions([entry]));

    const read = await store.readRoster();
    expect(read?.[0].journal).toEqual(entry.journal);
  });

  it('keeps a journal read out of the reactive roster', async () => {
    const entry = character('a', 'SAGEY');
    played(entry, [-0x48]);
    const journal = entry.journal;
    entry.journal = reactiveLike(journal);
    expect(await store.keepPlayed([entry], allSessions([entry]))).toBe(true);

    const read = await store.readRoster();
    expect(read?.[0].journal).toEqual(journal);
  });

  it('is nothing at all before anything has been kept', async () => {
    expect(await store.readRoster()).toEqual([]);
  });

  it('keeps a run as the same log Export run writes', async () => {
    const entry = character('a', 'SAGEY');
    played(entry, [0x1b]);
    played(entry, [-0x50, 0x0d]);
    await store.keepPlayed([entry], allSessions([entry]));

    const read = await store.readRoster();
    expect(runLogOf(read![0].run)).toEqual(runLogOf(entry.run));
  });

  it('reads a run only as far as the sessions go, so a chain with a hole in it is not followed', async () => {
    const entry = character('a', 'SAGEY');
    played(entry, [0x1b]);
    played(entry, [0x1c]);
    played(entry, [0x1d]);
    await store.keepPlayed([entry], [
      { entry, at: 0 },
      { entry, at: 2 },
    ]);

    const read = await store.readRoster();
    expect(read![0].run).toHaveLength(1);
  });
});

describe('the schema', () => {
  it('has the journal in it already, so writing one later is not a version bump', async () => {
    await store.keepPlayed([character('a', 'SAGEY')], []);

    const opened = indexedDB.open('moraff-tools');
    const db = await new Promise<IDBDatabase>((resolve) => {
      opened.onsuccess = () => resolve(opened.result);
    });
    expect([...db.objectStoreNames]).toEqual(['characters', 'journal', 'maps', 'sessions']);
    db.close();
  });

  it('adds the stores a later version wants to a database opened at an earlier one', async () => {
    const first = indexedDB.open('moraff-tools', 1);
    first.onupgradeneeded = () => first.result.createObjectStore('characters', { keyPath: 'id' });
    const old = await new Promise<IDBDatabase>((resolve) => {
      first.onsuccess = () => resolve(first.result);
    });
    old.close();

    expect(await store.keepMaps('a', '{"0:1":"AA"}')).toBe(true);
    expect(await store.readKeptMaps()).toEqual(new Map([['a', '{"0:1":"AA"}']]));
  });
});

describe('a character written before the board and the lock were two questions', () => {
  /** The row as such a build left it: every field the store writes now but `lock`. */
  async function dropTheLockField(id: string): Promise<void> {
    const opened = indexedDB.open('moraff-tools');
    const db = await new Promise<IDBDatabase>((resolve) => {
      opened.onsuccess = () => resolve(opened.result);
    });
    const characters = db.transaction('characters', 'readwrite').objectStore('characters');
    const got = characters.get(id);
    await new Promise<void>((resolve) => {
      got.onsuccess = () => {
        const { lock: _lock, ...older } = got.result as Record<string, unknown>;
        characters.put(older).onsuccess = () => resolve();
      };
    });
    db.close();
  }

  it('reads as one locked to the board it was rolled for', async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const entry = newEntry(
      { game: 'unforgiven', name: 'RACER', slot: 23, bytes, imported: false, lock: 'faithful', onBoard: true },
      ROLLED_AT,
      'a',
    );
    await store.keepPlayed([entry], []);
    await dropTheLockField('a');

    const read = await store.readRoster();
    expect(read![0].leaderboard).toBe('faithful');
    expect(read![0].lock).toBe('faithful');
  });

  it('reads as one locked to nothing when it was on no board', async () => {
    await store.keepPlayed([character('a', 'SAGEY')], []);
    await dropTheLockField('a');

    const read = await store.readRoster();
    expect(read![0].lock).toBeNull();
  });
});

describe('the explored maps', () => {
  it('come back for the character they were kept under', async () => {
    await store.keepMaps('a', '{"0:1":"AA"}');
    await store.keepMaps('b', '{"0:2":"BB"}');

    expect(await store.readKeptMaps()).toEqual(
      new Map([
        ['a', '{"0:1":"AA"}'],
        ['b', '{"0:2":"BB"}'],
      ]),
    );
  });

  it('are written for one character without touching another', async () => {
    await store.keepMaps('a', '{"0:1":"AA"}');
    await store.keepMaps('b', '{"0:2":"BB"}');

    await store.keepMaps('a', '{"0:1":"CC"}');

    const kept = await store.readKeptMaps();
    expect(kept.get('a')).toBe('{"0:1":"CC"}');
    expect(kept.get('b')).toBe('{"0:2":"BB"}');
  });

  it('are forgotten outright, which is what a death in Moraff’s World does', async () => {
    await store.keepMaps('a', '{"0:1":"AA"}');

    await store.keepMaps('a', null);

    expect(await store.readKeptMaps()).toEqual(new Map());
  });

  it('are nothing at all before a character has explored anything', async () => {
    expect(await store.readKeptMaps()).toEqual(new Map());
  });
});

describe('keeping the session that has just been played', () => {
  it('leaves the other characters exactly where they were', async () => {
    const played1 = character('a', 'SAGEY');
    const other = character('b', 'NEWBIE');
    played(played1, [0x1b]);
    played(other, [0x1c]);
    await store.keepPlayed([played1, other], allSessions([played1, other]));

    // The other character is changed in the page but not written, the way one sitting on the
    // roster is while another is being played.
    other.name = 'NOT WRITTEN';
    other.bytes[0] = 99;
    played(played1, [0x1d, 0x1e]);
    played1.bytes[0] = 7;
    expect(await store.keepPlayed([played1], [{ entry: played1, at: 1 }])).toBe(true);

    const read = await store.readRoster();
    const kept = read!.find((entry) => entry.id === 'b')!;
    expect(kept.name).toBe('NEWBIE');
    expect(kept.bytes[0]).toBe(1);
    expect(read!.find((entry) => entry.id === 'a')!.run).toHaveLength(2);
  });

  it('keeps the record as it stood when the write was asked for', async () => {
    const entry = character('a', 'SAGEY');
    const kept = store.keepPlayed([entry], []);
    entry.bytes[0] = 99;
    await kept;

    const read = await store.readRoster();
    expect(read![0].bytes[0]).toBe(1);
  });
});

describe('a character taken off the roster', () => {
  it('takes its run with it and leaves the rest alone', async () => {
    const going = character('a', 'SAGEY');
    const staying = character('b', 'NEWBIE');
    played(going, [0x1b]);
    played(staying, [0x1c]);
    await store.keepPlayed([going, staying], allSessions([going, staying]));

    expect(await store.dropCharacter('a')).toBe(true);

    const read = await store.readRoster();
    expect(read?.map((entry) => entry.id)).toEqual(['b']);
    expect(read![0].run).toHaveLength(1);
  });

  it('takes its explored maps with it', async () => {
    await store.keepPlayed([character('a', 'SAGEY'), character('b', 'NEWBIE')], []);
    await store.keepMaps('a', '{"0:1":"AA"}');
    await store.keepMaps('b', '{"0:2":"BB"}');

    await store.dropCharacter('a');

    expect(await store.readKeptMaps()).toEqual(new Map([['b', '{"0:2":"BB"}']]));
  });
});

describe('a browser that keeps no database', () => {
  beforeEach(async () => {
    vi.resetModules();
    Reflect.deleteProperty(globalThis, 'indexedDB');
    store = await import('./roster-db.svelte');
  });

  it('says the roster could not be read rather than that there is none', async () => {
    expect(await store.readRoster()).toBeNull();
  });

  it('says a write did not go in', async () => {
    expect(await store.keepPlayed([character('a', 'SAGEY')], [])).toBe(false);
  });

  it('has no explored maps to hand over', async () => {
    expect(await store.readKeptMaps()).toEqual(new Map());
  });
});

describe('the browser being asked to hold on to the store', () => {
  it('is asked once, at the first write', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('navigator', { storage: { persist } });
    const entry = character('a', 'SAGEY');

    await store.keepPlayed([entry], []);
    await store.keepPlayed([entry], []);

    expect(persist).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
