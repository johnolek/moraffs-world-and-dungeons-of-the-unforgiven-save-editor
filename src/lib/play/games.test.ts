import { afterEach, describe, expect, it } from 'vitest';
import { app, entryById, type RosterEntry } from '../app-state.svelte';
import { base64FromBytes } from '../bytes';
import { bringRunKeysHere } from '../character/current';
import { newEntry } from '../character/roster';
import { entryFromServer, type ServerCharacter } from '../character/server-roster';
import { endlessRules, ENDLESS_BOTTOM, ENDLESS_WORLD_SEED } from '../game/endless/rules';
import { FAITHFUL_RULES } from '../game/port/rules';
import { UNFORGIVEN_MAP } from '../map/game';
import { characterFile, floorSquare, press, settle, teleporterSquare } from './battle.test-support';
import type { GameSession } from './engine';
import { PLAY_GAMES } from './games';
import { KEY } from './keys';
import { runPlayLoop } from './loop';
import { mwCharacterFile } from './mw/test-engine';
import {
  discoveredMapOnly,
  lockedPlayMode,
  modeIsChosen,
  panelVisible,
  writePlayClockReseed,
  type PlayMode,
} from './mode';
import { runLogOf, type RunRecorder } from './run';
import { verifyRun } from './verify';

/**
 * Playing a character off the roster, which is what the Play tab does: the run the character has
 * already been through is on its roster entry, and the game goes on from there.
 */

/** A character on the roster, being worked on, standing on a floor of its own. */
function rostered(where: Parameters<typeof characterFile>[0] = { level: 3, dir: 0, ...floorSquare(3) }): RosterEntry {
  const bytes = Uint8Array.from(characterFile({ lev: 20, str: 60, ...where }).bytes);
  const entry = newEntry({ game: 'unforgiven', name: 'BRAWLER', slot: 1, bytes, imported: false });
  app.roster = [entry];
  app.characterId = entry.id;
  return entry;
}

/** One sitting at the game, played to the end of the keys and left. */
async function playASession(entry: RosterEntry, keys: number[], mode: PlayMode = 'faithful'): Promise<GameSession> {
  const game = PLAY_GAMES.unforgiven;
  const session = game.start(entry, false, mode);
  // The Play tab tells the session which mode it is being played in, which is how the sitting
  // comes to say so.
  session.mode = mode;
  void runPlayLoop(session, game.loop(session));
  await settle();
  // The snake's stone tablet greets a character standing in the town and takes a key of its own.
  if (session.tablet) await press(session, KEY.escape);
  for (const key of keys) await press(session, key);
  session.finish();
  return session;
}

/** The module a character rolled under the normal difficulty bottoms out in, and so the one
 *  whose floors go on for ever. */
const MODULE_IV = 3;
/** A floor below the bottom of Module IV, which the game itself has no map of. */
const ENDLESS_FLOOR = 120;
/** The floor a trap door is opened with the key labelled 44, which is deeper than the record's
 *  own flags reach. */
const DEEP_FLOOR = 220;

/** A character on the roster locked to the endless dungeon. */
function rosteredEndless(where: Parameters<typeof characterFile>[0] = { level: 3, dir: 0, ...floorSquare(3) }): RosterEntry {
  const bytes = Uint8Array.from(characterFile({ lev: 99, hp: 30000, maxHp: 30000, ...where }).bytes);
  const entry = newEntry({ game: 'unforgiven', name: 'DEEPER', slot: 2, bytes, imported: false, lock: 'endless' });
  app.roster = [entry];
  app.characterId = entry.id;
  return entry;
}

/** An open square of a floor below the bottom of the module, which only the endless rules
 *  generate. */
function endlessSquare(module: number, floor: number): { x: number; y: number } {
  const rules = endlessRules({ hard: false, seed: ENDLESS_WORLD_SEED });
  const rows = UNFORGIVEN_MAP.floor(floor, module, rules.bottomLevel(module), rules.trapdoorReach(module, floor));
  for (let y = 1; y < rows.length; y++) {
    for (let x = 1; x < rows[y].length; x++) if (!rows[y][x].solid) return { x, y };
  }
  throw new Error(`no open square on floor ${floor} of module ${module}`);
}

/** A character standing on a floor the game itself stops short of. */
function standingDeep(): RosterEntry {
  return rosteredEndless({
    module: MODULE_IV,
    level: ENDLESS_FLOOR,
    dir: 0,
    ...endlessSquare(MODULE_IV, ENDLESS_FLOOR),
  });
}

afterEach(() => {
  app.roster = [];
  app.characterId = null;
});

describe('a character played again', () => {
  it('goes on counting its actions where the session before it left off', async () => {
    const entry = rostered();
    // Two moments waited, each of which is one action. A step would do as well when the way is
    // clear, but the floor is stocked afresh every session and a monster standing in front of the
    // character stops one.
    const first = await playASession(entry, [KEY.enter, KEY.enter]);
    const spent = first.view().run!.actions;

    const second = await playASession(entry, [KEY.enter]);

    expect(spent).toBe(2);
    expect(second.view().run!.actions).toBe(3);
    expect(entry.run.map((session) => session.actions)).toEqual([2, 3]);
  });

  it('shows the milestones of the whole run and not of this sitting alone', async () => {
    const entry = rostered({ level: 0, dir: 0, ...teleporterSquare() });
    // The teleporter under the town takes the character to another module, which is a milestone;
    // the Escape answers the welcome the crossing puts up and the Enter the box after it.
    await playASession(entry, [KEY.arrowUp, KEY.escape, KEY.enter]);

    const second = await playASession(entry, [KEY.arrowUp]);

    expect(entry.run[0].milestones.map((milestone) => milestone.kind)).toEqual(['dungeon']);
    expect(entry.run[1].milestones).toEqual([]);
    expect(second.view().run!.milestones.map((milestone) => milestone.kind)).toEqual(['dungeon']);
  });

  it('makes a chain of sessions that verifies as one run', async () => {
    const entry = rostered();
    await playASession(entry, [KEY.enter, KEY.arrowLeft, KEY.enter]);
    await playASession(entry, [KEY.enter, KEY.enter]);

    const verdict = await verifyRun(runLogOf(entry.run));

    expect(verdict.reason).toBeNull();
    expect(verdict.status).toBe('verified');
    expect(verdict.sessions).toBe(2);
    // The turn where the character stands costs this game nothing, so four of the five keys count.
    expect(verdict.claimed.actions).toBe(4);
  });
});

describe('a character rolled for the endless dungeon', () => {
  it('is played in the world it was rolled into, where a faithful character is not', () => {
    const endless = PLAY_GAMES.unforgiven.start(rosteredEndless(), false, 'faithful');
    expect(endless.game.rules.bottomLevel(MODULE_IV)).toBe(ENDLESS_BOTTOM);
    endless.finish();

    const faithful = PLAY_GAMES.unforgiven.start(rostered(), false, 'faithful');
    expect(faithful.game.rules.bottomLevel(MODULE_IV)).toBe(FAITHFUL_RULES.bottomLevel(MODULE_IV));
    faithful.finish();
  });

  it('keeps what it carries beside its record on its roster entry', () => {
    const entry = rosteredEndless();
    const session = PLAY_GAMES.unforgiven.start(entry, false, 'faithful');
    session.game.rules.keys.take(session.game.pc, DEEP_FLOOR);

    session.save();
    session.finish();

    expect(entry.endless?.keys).toEqual([DEEP_FLOOR / 5]);
  });

  it('starts again with what the sitting before it left behind', () => {
    const entry = rosteredEndless();
    entry.endless = { keys: [DEEP_FLOOR / 5], bossSquares: [] };

    const session = PLAY_GAMES.unforgiven.start(entry, false, 'faithful');

    expect(session.game.rules.keys.flag(session.game.pc, DEEP_FLOOR)).toBe(1);
    session.finish();
  });

  it('plays on below the bottom of its module and picks up where it left off', async () => {
    const entry = standingDeep();

    const first = await playASession(entry, [KEY.enter], 'faithful');
    // The key a level drainer killed this deep carries, which is labelled for a floor the
    // record has no flag for.
    first.game.rules.keys.take(first.game.pc, DEEP_FLOOR);
    first.save();

    const second = await playASession(entry, [KEY.enter], 'faithful');

    expect(first.game.rules.sectionOf(MODULE_IV, ENDLESS_FLOOR)).toBeGreaterThan(20);
    expect(second.view().place.floor).toBe(ENDLESS_FLOOR);
    expect(entry.run.map((sitting) => sitting.mode)).toEqual(['faithful', 'faithful']);
    expect(entry.endless?.keys).toEqual([DEEP_FLOOR / 5]);
    expect(second.game.rules.keys.flag(second.game.pc, DEEP_FLOOR)).toBe(1);
  });

  it('replays a sitting played on a floor the game itself has no map of', async () => {
    const entry = standingDeep();
    await playASession(entry, [KEY.enter, KEY.arrowLeft, KEY.enter], 'faithful');

    const verdict = await verifyRun(runLogOf(entry.run));

    expect(verdict.reason).toBeNull();
    expect(verdict.status).toBe('verified');
    expect(verdict.mode).toBe('faithful');
  });

  it('writes the world it was rolled into into its run log, for a replay to read', async () => {
    const entry = standingDeep();

    await playASession(entry, [KEY.enter], 'faithful');

    expect(entry.run[0].worldSeed).toBe(ENDLESS_WORLD_SEED);
  });

  it('is offered the mode radios while it is on no board, and shows what debug shows', async () => {
    const entry = standingDeep();

    const session = await playASession(entry, [KEY.enter], 'debug');

    expect(entry.leaderboard).toBeNull();
    expect(modeIsChosen(entry.lock, entry.leaderboard !== null)).toBe(true);
    expect(panelVisible(session.mode)).toBe(true);
    expect(discoveredMapOnly(session.mode)).toBe(false);
  });

  it('plays the endless dungeon in debug all the same, and writes the mode down', async () => {
    const entry = standingDeep();

    const session = await playASession(entry, [KEY.enter], 'debug');
    const section = session.game.rules.sectionOf(MODULE_IV, ENDLESS_FLOOR);

    expect(session.game.rules.bottomLevel(MODULE_IV)).toBe(ENDLESS_BOTTOM);
    expect(section).toBeGreaterThan(20);
    expect(session.game.monsterKinds).toEqual(session.game.rules.monsterKinds(section));
    expect(entry.run.map((sitting) => sitting.mode)).toEqual(['debug']);
  });

  it('keeps the faithful presentation and no radios while it is on a board', () => {
    const bytes = Uint8Array.from(characterFile({ level: 3, dir: 0, ...floorSquare(3) }).bytes);
    const onBoard = newEntry({
      game: 'unforgiven',
      name: 'RANKED',
      slot: 3,
      bytes,
      imported: false,
      lock: 'endless',
      onBoard: true,
    });

    expect(onBoard.leaderboard).toBe('endless');
    expect(modeIsChosen(onBoard.lock, onBoard.leaderboard !== null)).toBe(false);
    expect(lockedPlayMode('endless')).toBe('faithful');
  });

  it('replays a debug sitting in the endless dungeon, which its log names the world of', async () => {
    const entry = standingDeep();
    await playASession(entry, [KEY.enter, KEY.arrowLeft, KEY.enter], 'debug');

    const verdict = await verifyRun(runLogOf(entry.run));

    expect(verdict.reason).toBeNull();
    expect(verdict.status).toBe('verified');
    expect(verdict.mode).toBe('debug');
  });

  it('leaves a character rolled to play the game as it shipped where it was', async () => {
    const entry = rostered();

    const session = await playASession(entry, [KEY.enter]);

    expect(session.game.rules).toBe(FAITHFUL_RULES);
    expect(entry.worldSeed).toBeUndefined();
    expect(entry.endless).toBeUndefined();
    expect(entry.run[0].worldSeed).toBeNull();
    expect(entry.run[0].mode).toBe('faithful');
  });
});

describe('which games are played on the clock', () => {
  /** A store the tab's memory can be pointed at, so a test's choice is not the browser's. */
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

  afterEach(() => useStorage(undefined));

  /** Whether the run this session is writing down reseeds from the machine's tick counter, which
   *  is what puts the readings in its log. */
  function playedOnTheClock(session: { run: RunRecorder | null }): boolean {
    return session.run!.gameClock() !== null;
  }

  it('plays Dungeons of the Unforgiven on the clock in the two modes a run is played in', () => {
    const entry = rostered();
    for (const mode of ['faithful', 'speedrun'] as const) {
      const session = PLAY_GAMES.unforgiven.start(entry, false, mode);
      expect(playedOnTheClock(session)).toBe(true);
      expect(session.game.clock).not.toBeNull();
      expect(session.game.seconds).not.toBeNull();
      session.finish();
    }
  });

  it('leaves debug mode the switch, which starts on', () => {
    const entry = rostered();
    useStorage(fakeStorage());
    const on = PLAY_GAMES.unforgiven.start(entry, false, 'debug');
    expect(playedOnTheClock(on)).toBe(true);
    on.finish();

    writePlayClockReseed('unforgiven', false);
    const off = PLAY_GAMES.unforgiven.start(entry, false, 'debug');
    expect(playedOnTheClock(off)).toBe(false);
    expect(off.game.clock).toBeNull();
    off.finish();
  });

  it("plays Moraff's World off the clock, since none of its reseeds is ported", () => {
    const entry = newEntry({
      game: 'moraffsWorld',
      name: 'GRIMWALD',
      slot: 1,
      bytes: Uint8Array.from(mwCharacterFile().bytes),
      imported: false,
    });
    const session = PLAY_GAMES.moraffsWorld.start(entry, false);
    expect(playedOnTheClock(session)).toBe(false);
    session.finish();
  });
});

describe('an endless character picked up on a second device', () => {
  /**
   * The character as the run server hands it back to another device of the same player: the
   * newest record any device sent, what it carries beside that record, and the sittings of its
   * run with their keys.
   */
  function asTheServerHoldsIt(entry: RosterEntry): ServerCharacter {
    return {
      id: entry.id,
      game: entry.game,
      name: entry.name,
      slot: entry.slot,
      dead: entry.dead,
      leaderboard: entry.leaderboard,
      lock: entry.lock,
      worldSeed: entry.worldSeed ?? null,
      endless: entry.endless ?? null,
      createdAt: entry.createdAt,
      editedAt: entry.editedAt,
      record: base64FromBytes(entry.bytes),
      maps: null,
      savedAt: entry.editedAt,
      run: entry.run.map((sitting) => ({ ...sitting, inputCount: sitting.inputs.length })),
      leasedElsewhere: false,
    };
  }

  /** The character as the one being worked on here, which is where playing it on starts. */
  function nowOnThisDevice(entry: RosterEntry): RosterEntry {
    app.roster = [entry];
    app.characterId = entry.id;
    return entryById(entry.id)!;
  }

  /** The character on the roster of a device that has never played it, which is what signing in
   *  somewhere else leaves. */
  function onTheOtherDevice(entry: RosterEntry): RosterEntry {
    return nowOnThisDevice(entryFromServer(asTheServerHoldsIt(entry), null)!);
  }

  it('starts holding what the server sent and plays on, and the run verifies', async () => {
    const played = standingDeep();
    const first = await playASession(played, [KEY.enter], 'faithful');
    first.save();
    // The Shadow boss of a section past the twentieth is put down where the record has no square
    // for him, so this is a sitting with something to carry.
    expect(played.endless?.bossSquares).toHaveLength(1);

    const elsewhere = onTheOtherDevice(played);

    expect(elsewhere.endless).toEqual(played.endless);

    await playASession(elsewhere, [KEY.enter], 'faithful');
    const verdict = await verifyRun(runLogOf(elsewhere.run));

    expect(verdict.reason).toBeNull();
    expect(verdict.status).toBe('verified');
  });

  it('leaves a character playing the game as it shipped carrying nothing', async () => {
    const played = rostered();
    await playASession(played, [KEY.enter]);

    const elsewhere = onTheOtherDevice(played);

    expect(elsewhere.endless).toBeUndefined();
  });

  it('takes the server\u2019s state back from the device that played on, and the run verifies', async () => {
    const deviceA = standingDeep();
    (await playASession(deviceA, [KEY.enter], 'faithful')).save();
    const carriedByA = deviceA.endless;

    const deviceB = onTheOtherDevice(deviceA);
    const second = await playASession(deviceB, [KEY.enter], 'faithful');
    // The key a level drainer killed this deep carries, which is labelled for a floor the record
    // has no flag for, so the sitting on the second device leaves something the first never held.
    second.game.rules.keys.take(second.game.pc, DEEP_FLOOR);
    second.save();

    // The first device signs back in. The server's copy is the one the second device wrote, and
    // what it carries was written beside the very record standing here now.
    const backOnA = nowOnThisDevice(entryFromServer(asTheServerHoldsIt(deviceB), deviceA)!);

    expect(backOnA.endless).toEqual(deviceB.endless);
    expect(backOnA.endless).not.toEqual(carriedByA);

    await playASession(backOnA, [KEY.enter], 'faithful');
    const verdict = await verifyRun(runLogOf(backOnA.run));

    expect(verdict.reason).toBeNull();
    expect(verdict.status).toBe('verified');
  });
});
