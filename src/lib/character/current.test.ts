import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RevMapMemory } from '../play/rev/memory';
import type { RosterEntry } from '../app-state.svelte';
import { base64FromBytes } from '../bytes';
import type { JournalEntry } from '../play/journal';
import { RunRecorder, type RunSession } from '../play/run';
import { REV_VALUE_COUNT } from '../game/rev-port/record';
import { revPlayerFromValues, saveRevPlayer } from '../play/rev/record';
import { characterStatus } from './record';

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

/** Enough of the browser's History for the one entry that says which tab is showing. */
function fakeHistory(): Pick<History, 'state' | 'replaceState'> {
  let entry: unknown = null;
  return {
    get state() {
      return entry;
    },
    replaceState: (next: unknown) => void (entry = next),
  };
}

/** A Moraff's Revenge character file, which holds no name and so is known by its level. */
function revengeSave(level: number): Uint8Array<ArrayBuffer> {
  const pc = revPlayerFromValues(Array<number>(REV_VALUE_COUNT).fill(0));
  pc.level = level;
  return saveRevPlayer(pc);
}

/** A save file with a name in it and room for the rest of the record. */
function saveFile(name: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(2697);
  for (let i = 0; i < name.length; i++) bytes[i] = name.charCodeAt(i);
  return bytes;
}

/**
 * The app state and the database it is kept in are both read fresh for every test: the store
 * holds on to the database it opened, so one test's characters would otherwise turn up in the
 * next.
 */
type State = typeof import('../app-state.svelte');
type Current = typeof import('./current');
type RevMemory = typeof import('../play/rev/memory');
type Streaming = typeof import('../play/streaming');

let app: State['app'];
let currentEntry: State['currentEntry'];
let entryById: State['entryById'];
let characterEdited: Current['characterEdited'];
let chooseCharacter: Current['chooseCharacter'];
let forgetCharacter: Current['forgetCharacter'];
let importCharacter: Current['importCharacter'];
let importRevExploredMap: Current['importRevExploredMap'];
let keepRolledCharacter: Current['keepRolledCharacter'];
let rememberNow: Current['rememberNow'];
let renameCharacter: Current['renameCharacter'];
let restoreCharacterImport: Current['restoreCharacterImport'];
let restoreGame: Current['restoreGame'];
let restoreRoster: Current['restoreRoster'];
let runSessionPlayed: Current['runSessionPlayed'];
let switchGame: Current['switchGame'];
let catchUpWithTheServer: Current['catchUpWithTheServer'];
let bringRunKeysHere: Current['bringRunKeysHere'];
/** The explored maps are held in the page and written behind it, so the store a test reads them
 *  back through has to be the one the modules under test are writing into. */
let revCharacterMap: RevMemory['revCharacterMap'];
/** Starting a game is what tells the modules under test that the batches of a run are carrying
 *  the character, so the sender has to be the one they are asking. */
let streamRun: Streaming['streamRun'];
let unloadCharacter: Current['unloadCharacter'];
let voidCurrentLeaderboard: Current['voidCurrentLeaderboard'];

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  useStorage(fakeStorage());
  vi.stubGlobal('history', fakeHistory());
  ({ app, currentEntry, entryById } = await import('../app-state.svelte'));
  ({ revCharacterMap } = await import('../play/rev/memory'));
  ({ streamRun } = await import('../play/streaming'));
  ({
    characterEdited,
    chooseCharacter,
    forgetCharacter,
    importCharacter,
    importRevExploredMap,
    keepRolledCharacter,
    rememberNow,
    renameCharacter,
    restoreCharacterImport,
    restoreGame,
    restoreRoster,
    runSessionPlayed,
    switchGame,
    unloadCharacter,
    voidCurrentLeaderboard,
    catchUpWithTheServer,
    bringRunKeysHere,
  } = await import('./current'));
  // Nothing is written before the roster has been read, which is what a visit starts with.
  await restoreRoster();
});

afterEach(() => {
  useStorage(undefined);
  vi.unstubAllGlobals();
});

describe('importing a save file', () => {
  it('puts it on the roster under the name in the record and starts working on it', () => {
    importCharacter('unforgiven', '21', saveFile('SAGEY'));
    expect(app.roster).toHaveLength(1);
    expect(currentEntry()?.name).toBe('SAGEY');
    expect(currentEntry()?.slot).toBe(21);
  });

  it('falls back to the file name for a record with no name in it', () => {
    importCharacter('unforgiven', 'sagey.sav', saveFile(''));
    expect(currentEntry()?.name).toBe('sagey.sav');
    expect(currentEntry()?.slot).toBeNull();
  });

  it('makes a Moraff’s Revenge save the character the site is on', () => {
    importCharacter('revenge', '3.EXE', revengeSave(6));
    expect(app.game).toBe('revenge');
    expect(currentEntry()?.name).toBe('3.EXE');
    // The bottom bar names a character only once the record can be read, which is what left a
    // Moraff's Revenge character showing as no character at all.
    expect(characterStatus(currentEntry()!)?.lev).toBe(6);
  });

  it('keeps the file exactly as it came in', () => {
    importCharacter('unforgiven', '21', saveFile('SAGEY'));
    const entry = currentEntry()!;
    entry.bytes[0x816] = 99;
    expect(entry.importedBytes![0x816]).toBe(0);
  });
});

describe('an explored map dropped beside the character', () => {
  /** A Moraff's Revenge record holds no name, so the roster falls back to the file name. */
  const revenge = () => new Uint8Array(0) as Uint8Array<ArrayBuffer>;

  it('brings the squares the character walked in DOS across to the site', () => {
    importCharacter('revenge', '1.EXE', revenge());
    const walked = new RevMapMemory();
    walked.markStep(5, 7, 3);

    const kept = importRevExploredMap(walked.bytes());

    expect(kept?.name).toBe('1.EXE');
    expect(new RevMapMemory(revCharacterMap(kept!.id)).isKnown(5, 7, 3)).toBe(true);
  });

  it('is refused when the character being worked on belongs to another game', () => {
    importCharacter('unforgiven', '21', saveFile('SAGEY'));
    expect(importRevExploredMap(new RevMapMemory().bytes())).toBeNull();
  });

  it('is still beside the character after a reload', async () => {
    importCharacter('revenge', '1.EXE', revenge());
    const walked = new RevMapMemory();
    walked.markStep(5, 7, 3);
    const kept = importRevExploredMap(walked.bytes())!;

    await rememberNow();
    await restoreRoster();

    expect(new RevMapMemory(revCharacterMap(kept.id)).isKnown(5, 7, 3)).toBe(true);
  });

  it('is carried over from where an earlier visit kept it in localStorage', async () => {
    importCharacter('revenge', '1.EXE', revenge());
    const entry = currentEntry()!;
    const walked = new RevMapMemory();
    walked.markStep(5, 7, 3);
    localStorage.setItem(`moraff-tools.revenge-map.${entry.id}`, base64FromBytes(walked.bytes()));
    await rememberNow();

    await restoreRoster();

    expect(new RevMapMemory(revCharacterMap(entry.id)).isKnown(5, 7, 3)).toBe(true);
    expect(localStorage.getItem(`moraff-tools.revenge-map.${entry.id}`)).toBeNull();
  });

  it('goes with the character when it is taken off the roster', async () => {
    importCharacter('revenge', '1.EXE', revenge());
    const walked = new RevMapMemory();
    walked.markStep(5, 7, 3);
    const kept = importRevExploredMap(walked.bytes())!;
    await rememberNow();

    forgetCharacter(kept.id);
    await rememberNow();
    await restoreRoster();

    expect(new RevMapMemory(revCharacterMap(kept.id)).isKnown(5, 7, 3)).toBe(false);
  });
});

describe('a character rolled here', () => {
  it('joins the roster with no import to go back to', () => {
    keepRolledCharacter('unforgiven', 'NEWBIE', 22, saveFile('NEWBIE'));
    expect(currentEntry()?.importedBytes).toBeNull();
  });

  it('keeps the second the roll was started in, which is what the roll was made of', () => {
    keepRolledCharacter('unforgiven', 'NEWBIE', 22, saveFile('NEWBIE'), null, false, 1_757_000_000);
    expect(currentEntry()?.rolledAt).toBe(1_757_000_000);
  });

  it('has no second for a game whose roller is not seeded from the wall clock', () => {
    keepRolledCharacter('moraffsWorld', 'WANDA', 3, saveFile('WANDA'));
    expect(currentEntry()?.rolledAt).toBeNull();
  });

  it('carries the board the roller was asked to roll it for', () => {
    keepRolledCharacter('unforgiven', 'RACER', 23, saveFile('RACER'), 'speedrun', true);
    expect(currentEntry()?.leaderboard).toBe('speedrun');
    expect(currentEntry()?.lock).toBe('speedrun');
  });

  it('carries the lock without a board when the roller was asked for no board', () => {
    keepRolledCharacter('unforgiven', 'RACER', 23, saveFile('RACER'), 'speedrun', false);
    expect(currentEntry()?.leaderboard).toBeNull();
    expect(currentEntry()?.lock).toBe('speedrun');
  });

  it('is on no board and locked to nothing when the roller was asked for neither', () => {
    keepRolledCharacter('unforgiven', 'NEWBIE', 22, saveFile('NEWBIE'));
    expect(currentEntry()?.leaderboard).toBeNull();
    expect(currentEntry()?.lock).toBeNull();
  });
});

describe('taking the current character off its board', () => {
  it('takes it off the board, keeps its lock, and keeps the roster written that way', async () => {
    keepRolledCharacter('unforgiven', 'RACER', 23, saveFile('RACER'), 'faithful', true);
    expect(voidCurrentLeaderboard()).toBe(true);
    expect(currentEntry()?.leaderboard).toBeNull();
    expect(currentEntry()?.lock).toBe('faithful');

    await rememberNow();
    await restoreRoster();
    expect(currentEntry()?.leaderboard).toBeNull();
    expect(currentEntry()?.lock).toBe('faithful');
  });

  it('says there was nothing to end for a character on no board', () => {
    keepRolledCharacter('unforgiven', 'NEWBIE', 22, saveFile('NEWBIE'));
    expect(voidCurrentLeaderboard()).toBe(false);
  });

  it('says there was nothing to end when no character is being worked on', () => {
    unloadCharacter();
    expect(voidCurrentLeaderboard()).toBe(false);
  });
});

describe('an imported character', () => {
  it('is on no board, since there is no chain of runs from a roll to compare it by', () => {
    importCharacter('unforgiven', '21', saveFile('SAGEY'));
    expect(currentEntry()?.leaderboard).toBeNull();
  });
});

describe('the roster', () => {
  beforeEach(() => {
    importCharacter('unforgiven', '21', saveFile('SAGEY'));
    keepRolledCharacter('unforgiven', 'NEWBIE', 22, saveFile('NEWBIE'));
  });

  it('holds both characters, with the last one made current', () => {
    expect(app.roster.map((entry) => entry.name)).toEqual(['SAGEY', 'NEWBIE']);
    expect(currentEntry()?.name).toBe('NEWBIE');
  });

  it('goes back to the other character when it is picked', () => {
    chooseCharacter(app.roster[0].id);
    expect(currentEntry()?.name).toBe('SAGEY');
  });

  it('finds a character by id, whichever one is being worked on', () => {
    chooseCharacter(app.roster[0].id);
    expect(entryById(app.roster[1].id)?.name).toBe('NEWBIE');
    expect(entryById('nobody')).toBeNull();
    expect(entryById(null)).toBeNull();
  });

  it('renames an entry without touching the record', () => {
    renameCharacter(app.roster[0].id, 'The tank');
    expect(app.roster[0].name).toBe('The tank');
  });

  it('keeps the name it has when the new one is blank', () => {
    renameCharacter(app.roster[0].id, '   ');
    expect(app.roster[0].name).toBe('SAGEY');
  });

  it('drops a character that is removed, and stops working on it', () => {
    forgetCharacter(app.roster[1].id);
    expect(app.roster.map((entry) => entry.name)).toEqual(['SAGEY']);
    expect(currentEntry()).toBeNull();
  });

  it('keeps the character on the roster when the editor is put down', () => {
    unloadCharacter();
    expect(app.roster).toHaveLength(2);
    expect(currentEntry()).toBeNull();
  });

  it('comes back after a reload, still on the same character', async () => {
    const id = currentEntry()!.id;
    await rememberNow();
    app.roster = [];
    app.characterId = null;
    await restoreRoster();
    // Both were made in the same millisecond, so the order they come back in is their ids'.
    expect(app.roster.map((entry) => entry.name).sort()).toEqual(['NEWBIE', 'SAGEY']);
    expect(currentEntry()?.id).toBe(id);
  });

  it('leaves a character that was removed off it after a reload', async () => {
    forgetCharacter(app.roster[1].id);
    await rememberNow();
    await restoreRoster();
    expect(app.roster.map((entry) => entry.name)).toEqual(['SAGEY']);
  });
});

describe('editing the character', () => {
  beforeEach(() => {
    // Only the timer an edit waits on is faked: the store's own work is scheduled elsewhere and
    // would never come back if it were.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    importCharacter('unforgiven', '21', saveFile('SAGEY'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('is what a reload comes back to, once the typing has stopped', async () => {
    currentEntry()!.bytes[0x816] = 99;
    characterEdited();
    vi.runAllTimers();
    await rememberNow();
    app.roster = [];
    await restoreRoster();
    expect(currentEntry()!.bytes[0x816]).toBe(99);
  });

  it('is written once for a burst of keystrokes', async () => {
    const written = vi.spyOn(IDBObjectStore.prototype, 'put');
    for (const digit of [1, 2, 3, 4, 5]) {
      currentEntry()!.bytes[0x816] = digit;
      characterEdited();
    }
    expect(written).not.toHaveBeenCalled();
    vi.runAllTimers();
    await rememberNow();
    expect(written).toHaveBeenCalledTimes(1);
  });

  it('is written at once for a page on its way out', async () => {
    currentEntry()!.bytes[0x816] = 99;
    characterEdited();
    await rememberNow();
    app.roster = [];
    await restoreRoster();
    expect(currentEntry()!.bytes[0x816]).toBe(99);
  });

  it('stops saying the roster is not being kept once a write goes through', async () => {
    app.rosterKept = false;
    characterEdited();
    vi.runAllTimers();
    await rememberNow();
    expect(app.rosterKept).toBe(true);
  });

  it('is undone by restoring the import, in bytes the editor will notice', () => {
    const before = currentEntry()!.bytes;
    currentEntry()!.bytes[0x816] = 99;
    characterEdited();
    restoreCharacterImport(currentEntry()!.id);
    expect(currentEntry()!.bytes[0x816]).toBe(0);
    expect(currentEntry()!.bytes).not.toBe(before);
  });
});

describe('a session played into a character', () => {
  it('writes that session, its journal and that character, and nothing else', async () => {
    importCharacter('unforgiven', '21', saveFile('SAGEY'));
    keepRolledCharacter('unforgiven', 'NEWBIE', 22, saveFile('NEWBIE'));
    await rememberNow();
    const entry = currentEntry()!;
    const run = new RunRecorder({ game: 'unforgiven', name: entry.name, record: entry.bytes });
    run.input(0x1b);
    const written = vi.spyOn(IDBObjectStore.prototype, 'put');

    runSessionPlayed(entry, 0, run.log());
    await rememberNow();

    expect(written).toHaveBeenCalledTimes(3);
  });

  it('is what the character comes back with after a reload', async () => {
    keepRolledCharacter('unforgiven', 'NEWBIE', 22, saveFile('NEWBIE'));
    const entry = currentEntry()!;
    const run = new RunRecorder({ game: 'unforgiven', name: entry.name, record: entry.bytes });
    run.input(0x1b);
    runSessionPlayed(entry, 0, run.log());
    await rememberNow();

    await restoreRoster();
    expect(currentEntry()!.run).toEqual(entry.run);
  });

  it('leaves the journal of the sittings before it where it is', async () => {
    keepRolledCharacter('unforgiven', 'NEWBIE', 22, saveFile('NEWBIE'));
    const entry = currentEntry()!;
    sitting(entry, 0, 'Stepped north');
    sitting(entry, 1, 'Stepped east');
    await rememberNow();

    await restoreRoster();
    // The Play tab's timeline is the sittings run together, so a character played twice reads as
    // one run rather than as the sitting it is being played in now.
    expect(currentEntry()!.journal.flat().map((line) => line.text)).toEqual([
      'Stepped north',
      'Stepped east',
    ]);
  });
});

/** One sitting at the game, with a key in it and a line of journal to go with it, kept as the
 *  session at that place in the character's run. */
function sitting(entry: RosterEntry, at: number, said: string): void {
  const run = new RunRecorder({ game: 'unforgiven', name: entry.name, record: entry.bytes });
  run.input(0x1b);
  const written: JournalEntry = { at: 1, floor: 0, module: 0, text: said, event: null };
  runSessionPlayed(entry, at, run.log(), [written]);
}

describe('a browser that keeps no database', () => {
  /** The store opens the database once and keeps it, so a visit with none is its own module. */
  async function visitWithoutADatabase() {
    vi.resetModules();
    Reflect.deleteProperty(globalThis, 'indexedDB');
    const state = await import('../app-state.svelte');
    const current = await import('./current');
    await current.restoreRoster();
    return { state, current };
  }

  it('says the characters are not being kept as soon as the roster is read', async () => {
    const { state } = await visitWithoutADatabase();
    expect(state.app.roster).toEqual([]);
    expect(state.app.rosterKept).toBe(false);
  });

  it('goes on working on a character that cannot be written', async () => {
    const { state, current } = await visitWithoutADatabase();
    state.app.rosterKept = true;

    current.importCharacter('unforgiven', '21', saveFile('SAGEY'));
    await current.rememberNow();

    expect(state.app.roster).toHaveLength(1);
    expect(state.app.rosterKept).toBe(false);
  });
});

describe('switching games', () => {
  beforeEach(() => {
    importCharacter('unforgiven', '21', saveFile('SAGEY'));
    keepRolledCharacter('moraffsWorld', 'WANDA', 3, saveFile('WANDA'));
  });

  it('keeps the whole roster and works on the other game’s character', () => {
    switchGame('unforgiven');
    expect(app.game).toBe('unforgiven');
    expect(app.roster).toHaveLength(2);
    expect(currentEntry()?.name).toBe('SAGEY');
  });

  it('goes back to the character last worked on under each game', () => {
    keepRolledCharacter('unforgiven', 'BRUISER', 22, saveFile('BRUISER'));
    chooseCharacter(app.roster[0].id);
    switchGame('moraffsWorld');
    switchGame('unforgiven');
    expect(currentEntry()?.name).toBe('SAGEY');
  });

  it('works on the newest of a game’s characters when none was worked on before', () => {
    keepRolledCharacter('unforgiven', 'BRUISER', 22, saveFile('BRUISER'));
    switchGame('moraffsWorld');
    useStorage(fakeStorage());
    switchGame('unforgiven');
    expect(currentEntry()?.name).toBe('BRUISER');
  });

  it('leaves no character to work on when the game has none', () => {
    forgetCharacter(app.roster[0].id);
    switchGame('unforgiven');
    expect(currentEntry()).toBeNull();
  });

  it('moves off a tab the other game does not have', () => {
    switchGame('unforgiven');
    app.tab = 'calculators';
    switchGame('moraffsWorld');
    expect(app.tab).toBe('editor');
  });

  it('stays on a tab both games have', () => {
    switchGame('unforgiven');
    app.tab = 'map';
    switchGame('moraffsWorld');
    expect(app.tab).toBe('map');
  });

  it('follows the game of a save file that is opened', () => {
    switchGame('unforgiven');
    importCharacter('moraffsWorld', '3', saveFile('WANDA II'));
    expect(app.game).toBe('moraffsWorld');
  });

  it('is the game a reload comes back to', () => {
    switchGame('unforgiven');
    app.game = 'moraffsWorld';
    restoreGame();
    expect(app.game).toBe('unforgiven');
    expect(currentEntry()?.name).toBe('SAGEY');
  });

  it('takes the game from the character in hand when no game was stored', () => {
    useStorage(fakeStorage());
    app.game = 'unforgiven';
    restoreGame();
    expect(app.game).toBe('moraffsWorld');
    expect(currentEntry()?.name).toBe('WANDA');
  });
});

describe('the characters the server is keeping for this player', () => {
  /** What a character looks like coming back from `GET /players/me/characters`. */
  function served(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'server-1',
      game: 'unforgiven',
      name: 'GRIM',
      slot: 7,
      dead: false,
      leaderboard: 'faithful',
      createdAt: '2026-09-08T09:00:00.000Z',
      editedAt: '2026-09-08T10:00:00.000Z',
      record: 'AAECAw==',
      maps: null,
      savedAt: '2026-09-08T10:00:01.000Z',
      run: [],
      leasedElsewhere: false,
      ...over,
    };
  }

  /** One sitting of a run, as the server hands it over and as this device writes it down. */
  function sitting(at: number, keys: number): RunSession {
    return {
      engine: 'a'.repeat(40),
      game: 'unforgiven',
      mode: 'faithful',
      leaderboard: 'faithful',
      sound: null,
      name: 'GRIM',
      startedAt: `2026-09-09T1${at}:00:00.000Z`,
      seed: 1000 + at,
      worldSeed: null,
      record: 'AAEC',
      inputs: Array.from({ length: keys }, (_, key) => key),
      actions: keys,
      time: keys,
      milestones: [],
      edits: 0,
    };
  }

  /** The same sitting as the roster answer carries it: the keys left out and their count in
   *  their place, which is what a chain played on another device comes back as. */
  function counted(at: number, keys: number): Record<string, unknown> {
    return { ...sitting(at, keys), inputs: [], inputCount: keys };
  }

  /**
   * A run server that answers with these characters, and every call it was made.
   *
   * `run` is what it hands back when a character's keys are asked for, which is the one thing
   * the roster answer leaves out.
   */
  function serverHolding(
    characters: Record<string, unknown>[],
    status = 200,
    run: RunSession[] = [],
  ): { calls: string[] } {
    const calls: string[] = [];
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    vi.stubGlobal('fetch', (url: string, options?: { method?: string }) => {
      calls.push(`${options?.method ?? 'GET'} ${url}`);
      const body = url.endsWith('/run') ? { run } : { characters };
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    });
    return { calls };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('puts a character this device has never seen on the roster', async () => {
    serverHolding([served({ run: [sitting(0, 4)] })]);

    await catchUpWithTheServer();

    expect(app.roster.map((entry) => entry.name)).toEqual(['GRIM']);
    expect(app.roster[0].run).toHaveLength(1);
    // And it is in the browser's own store from then on, so the next visit has it with no server.
    await restoreRoster();
    expect(app.roster.map((entry) => entry.name)).toEqual(['GRIM']);
  });

  it('takes the server’s copy of a character this device is behind on', async () => {
    keepRolledCharacter('unforgiven', 'SAGEY', 21, saveFile('SAGEY'));
    const id = app.roster[0].id;
    await rememberNow();
    serverHolding([served({ id, name: 'SAGEY', record: 'CQkJ', run: [sitting(0, 4)] })]);

    await catchUpWithTheServer();

    expect(app.roster).toHaveLength(1);
    expect(Array.from(app.roster[0].bytes)).toEqual([9, 9, 9]);
    expect(app.roster[0].run).toHaveLength(1);
  });

  it('keeps this device’s copy while it holds keys the server has not been sent', async () => {
    keepRolledCharacter('unforgiven', 'SAGEY', 21, saveFile('SAGEY'));
    const entry = app.roster[0];
    runSessionPlayed(entry, 0, sitting(0, 9));
    await rememberNow();
    serverHolding([served({ id: entry.id, name: 'SAGEY', record: 'CQkJ', run: [sitting(0, 4)] })]);

    await catchUpWithTheServer();

    expect(app.roster[0].bytes).toHaveLength(2697);
    expect(app.roster[0].run[0].inputs).toHaveLength(9);
  });

  it('gives this device’s copy up where a sitting the server has played past has grown here', async () => {
    keepRolledCharacter('unforgiven', 'SAGEY', 21, saveFile('SAGEY'));
    const entry = app.roster[0];
    // Keys of an earlier sitting that never reached the server before a later one did. The
    // server refuses such keys for ever, so a device that held on to them would be refused every
    // time the character was played; taking the server's copy is what puts it back in step.
    runSessionPlayed(entry, 0, sitting(0, 9));
    runSessionPlayed(entry, 1, sitting(1, 3));
    await rememberNow();
    serverHolding([
      served({ id: entry.id, name: 'SAGEY', record: 'CQkJ', run: [sitting(0, 4), sitting(1, 3)] }),
    ]);

    await catchUpWithTheServer();

    expect(Array.from(app.roster[0].bytes)).toEqual([9, 9, 9]);
    expect(app.roster[0].run[0].inputs).toHaveLength(4);
  });

  it('leaves the roster alone when the server has nothing to say', async () => {
    keepRolledCharacter('unforgiven', 'SAGEY', 21, saveFile('SAGEY'));
    serverHolding([], 403);

    await catchUpWithTheServer();

    expect(app.roster.map((entry) => entry.name)).toEqual(['SAGEY']);
  });

  it('asks nobody at all in a build with no run server', async () => {
    const server = serverHolding([served()]);
    vi.stubEnv('VITE_RUN_SERVER', '');

    await catchUpWithTheServer();

    expect(server.calls).toEqual([]);
    expect(app.roster).toEqual([]);
  });

  it('sends a character changed with no game running to the server at once', async () => {
    keepRolledCharacter('unforgiven', 'SAGEY', 21, saveFile('SAGEY'));
    const entry = app.roster[0];
    await rememberNow();
    const server = serverHolding([]);

    characterEdited();
    await rememberNow();

    expect(server.calls).toEqual([`PUT https://runs.example.com/players/me/characters/${entry.id}`]);
  });

  it('leaves a character being played to the batches of its run', async () => {
    keepRolledCharacter('unforgiven', 'SAGEY', 21, saveFile('SAGEY'));
    const entry = app.roster[0];
    await rememberNow();
    const server = serverHolding([]);
    // The sender hangs a listener on the window, and these tests run under Node.
    vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined });
    const streamer = streamRun({
      characterId: entry.id,
      session: {
        index: 0,
        log: () => sitting(0, 2),
        presses: () => 2,
        save: () => ({
          record: 'AAEC',
          maps: null,
          slot: entry.slot,
          dead: false,
          leaderboard: null,
          lock: null,
          worldSeed: null,
          endless: null,
          createdAt: entry.createdAt,
          editedAt: entry.editedAt,
        }),
      },
      earlier: [],
      mode: () => 'faithful',
      onMark: () => undefined,
      writeTheGameDown: () => undefined,
      outOfStep: () => undefined,
    })!;

    characterEdited();
    await rememberNow();
    streamer.stop();

    expect(server.calls.filter((call) => call.startsWith('PUT'))).toEqual([]);
  });

  it('takes a chain the server sent without its keys and asks for them to play the character on', async () => {
    const server = serverHolding([served({ run: [counted(0, 4)] })], 200, [sitting(0, 4)]);
    await catchUpWithTheServer();
    const id = app.roster[0].id;
    expect(app.roster[0].run[0].inputs).toEqual([]);

    expect(await bringRunKeysHere(id)).toBe(true);

    expect(app.roster[0].run[0].inputs).toHaveLength(4);
    expect(server.calls).toContain(`GET https://runs.example.com/players/me/characters/${id}/run`);
  });

  it('asks for a character’s keys once', async () => {
    const server = serverHolding([served({ run: [counted(0, 4)] })], 200, [sitting(0, 4)]);
    await catchUpWithTheServer();
    const id = app.roster[0].id;

    await bringRunKeysHere(id);
    await bringRunKeysHere(id);

    expect(server.calls.filter((call) => call.endsWith('/run'))).toHaveLength(1);
  });

  it('asks for nothing for a chain whose keys are here already', async () => {
    keepRolledCharacter('unforgiven', 'SAGEY', 21, saveFile('SAGEY'));
    const entry = app.roster[0];
    runSessionPlayed(entry, 0, sitting(0, 9));
    await rememberNow();
    const server = serverHolding([]);

    expect(await bringRunKeysHere(entry.id)).toBe(true);

    expect(server.calls).toEqual([]);
  });

  it('leaves the chain where it is when the server does not answer', async () => {
    serverHolding([served({ run: [counted(0, 4)] })], 200, [sitting(0, 4)]);
    await catchUpWithTheServer();
    const id = app.roster[0].id;
    serverHolding([], 500);

    expect(await bringRunKeysHere(id)).toBe(false);

    expect(app.roster[0].run[0].inputs).toEqual([]);
  });

  it('forgets a character on the server as well as here', async () => {
    keepRolledCharacter('unforgiven', 'SAGEY', 21, saveFile('SAGEY'));
    const id = app.roster[0].id;
    const server = serverHolding([]);

    forgetCharacter(id);
    await rememberNow();

    expect(server.calls).toEqual([`DELETE https://runs.example.com/players/me/characters/${id}`]);
  });
});
