import { describe, expect, it } from 'vitest';
import { bytesFromBase64 } from '../bytes';
import { bundledDungeon } from '../game/dungeon';
import { loadPlayer, savePlayer } from '../game/port/record';
import { characterFile, floorSquare, press, settle, teleporterSquare, townSquare } from './battle.test-support';
import { runMoveControl, startGame, type CharacterFile, type GameSession } from './engine';
import { runPlayLoop } from './loop';
import { KEY } from './keys';
import { runMwMoveControl, startMwGame, type MwCharacterFile, type MwGameSession } from './mw/engine';
import { findMwSquare, mwCharacterFile } from './mw/test-engine';
import { REV_CLOCK_TICK, runRevDungeon, startRevGame, type RevCharacterFile, type RevGameSession } from './rev/engine';
import { revCharacterFile, revRecord } from './rev/test-engine';
import { REV_KEY } from './rev/keys';
import { loadMwPlayer, saveMwPlayer } from './mw/record';
import { MW_KEY, mwTurn } from './mw/keys';
import { runFileName } from './export-run';
import type { StoredMaps } from './memory';
import {
  actionWords,
  ENGINE_COMMIT,
  isRunGame,
  lastMilestones,
  MILESTONES_SHOWN,
  milestoneNote,
  milestoneWords,
  replayRun,
  RunRecorder,
  RUN_GAMES,
  RUN_LOG_VERSION,
  runLogOf,
  runTotals,
  TURN_INPUTS,
  type Milestone,
  type RunSession,
  type RunTotals,
} from './run';

/** A game of Dungeons of the Unforgiven being recorded, with a seed of the test's own. `before`
 *  is what the character's run had come to in the sessions before this one. */
function recordedGame(
  overrides: Parameters<typeof characterFile>[0] = {},
  seed = 12345,
  before?: RunTotals,
): { run: RunRecorder; session: GameSession; record: Uint8Array; file: CharacterFile } {
  const file = characterFile(overrides);
  const record = file.bytes.slice();
  const run = new RunRecorder({
    game: 'unforgiven',
    name: 'BRAWLER',
    record: file.bytes,
    seed,
    startedAt: '2026-09-07T00:00:00.000Z',
    before,
  });
  const session = startGame(file, run.rng, run);
  void runMoveControl(session);
  // The snake's stone tablet greets a character arriving in the town and waits for a key of its
  // own, so that key is the first thing the game reads and the first input the run writes down.
  if (session.tablet) session.press(KEY.escape);
  return { run, session, record, file };
}

/** The same in Moraff's World. */
function recordedMwGame(
  seed = 7,
  before?: RunTotals,
  overrides: Parameters<typeof mwCharacterFile>[0] = {},
): { run: RunRecorder; session: MwGameSession; file: MwCharacterFile } {
  const file = mwCharacterFile(overrides);
  const run = new RunRecorder({ game: 'moraffsWorld', name: 'GRIMWALD', record: file.bytes, seed, before });
  const session = startMwGame(file, run.rng, run);
  void runMwMoveControl(session);
  return { run, session, file };
}

/** The same in Moraff's Revenge. */
function recordedRevGame(seed = 9, before?: RunTotals): { run: RunRecorder; session: RevGameSession; file: RevCharacterFile } {
  const file = revCharacterFile();
  const run = new RunRecorder({ game: 'revenge', name: 'FIGHTY', record: file.bytes, seed, before });
  const session = startRevGame(file, run.rng, run);
  void runRevDungeon(session);
  return { run, session, file };
}

describe('the run log', () => {
  it('keeps the seed, the record and the keys the game was given', async () => {
    const { run, session, record } = recordedGame();
    await press(session, KEY.arrowUp);
    await press(session, KEY.arrowLeft);
    await press(session, KEY.viewStats);
    session.finish();

    const log = run.log();
    expect(runLogOf([log]).version).toBe(RUN_LOG_VERSION);
    expect(log.game).toBe('unforgiven');
    expect(log.name).toBe('BRAWLER');
    expect(log.mode).toBeNull();
    expect(log.seed).toBe(12345);
    expect(log.startedAt).toBe('2026-09-07T00:00:00.000Z');
    expect(log.engine).toBe(ENGINE_COMMIT);
    expect(log.inputs).toEqual([KEY.arrowUp, KEY.arrowLeft, KEY.viewStats]);
    expect(bytesFromBase64(log.record)).toEqual(record);
  });

  it('keeps the mode the game was being shown in, which the tab moves as it is played', async () => {
    const { run, session } = recordedGame();
    session.mode = 'speedrun';
    await press(session, KEY.arrowUp);
    session.finish();

    expect(run.log().mode).toBe('speedrun');
  });

  it('keeps the sound the game was set up with, and nothing for a game with no such flag', () => {
    const record = new Uint8Array(8);
    expect(new RunRecorder({ game: 'revenge', name: 'FIGHTY', record, sound: false }).log().sound).toBe(false);
    expect(new RunRecorder({ game: 'revenge', name: 'FIGHTY', record, sound: true }).log().sound).toBe(true);
    expect(new RunRecorder({ game: 'unforgiven', name: 'BRAWLER', record }).log().sound).toBeNull();
  });

  it('keeps the board the character is locked to, and nothing for a free character', () => {
    const record = new Uint8Array(8);
    expect(new RunRecorder({ game: 'unforgiven', name: 'RACER', record, leaderboard: 'speedrun' }).log().leaderboard).toBe('speedrun');
    expect(new RunRecorder({ game: 'unforgiven', name: 'RACER', record, leaderboard: 'faithful' }).log().leaderboard).toBe('faithful');
    expect(new RunRecorder({ game: 'unforgiven', name: 'BRAWLER', record }).log().leaderboard).toBeNull();
  });

  it("keeps the game's own clock where the run had got to", async () => {
    const { run, session } = recordedGame();
    await press(session, KEY.arrowUp);
    await press(session, KEY.enter);
    session.finish();

    expect(run.log().time).toBe(session.game.secondsElapsed);
  });

  it('keeps the record the game began with, whatever the game saves over it', async () => {
    const { run, session, record } = recordedGame();
    await press(session, KEY.arrowUp);
    session.save();
    session.finish();

    expect(bytesFromBase64(run.log().record)).toEqual(record);
  });

  it('draws a seed of its own for every run', () => {
    const record = new Uint8Array(8);
    const seeds = new Set(
      Array.from({ length: 20 }, () => new RunRecorder({ game: 'unforgiven', name: 'A', record }).seed),
    );
    expect(seeds.size).toBeGreaterThan(15);
  });

  it('writes down the swings Ctrl-F takes without a key of its own', async () => {
    const start = townSquare();
    const { run, session } = recordedGame({ level: 0, dir: 0, ...start, lev: 10, str: 60, cls: 2 });
    const planted = session.game.monsters[0];
    planted.x = start.x;
    planted.y = start.y - 1;
    planted.hp = 100000;
    planted.level = 1;
    planted.type = 0;
    session.game.monsterMap[planted.y * 80 + planted.x] = 0;
    // A pass round the loop with a key nothing is bound to, which is where attack_timing meets
    // the monster and takes it up.
    await press(session, KEY.escape);

    await press(session, KEY.repeatFight);
    for (let waited = 0; waited < 5; waited++) await settle();
    // A key typed while the character is swinging is thrown away by the flush at the end of the
    // swing, so the game never reads it and the log never holds it.
    session.press(KEY.viewStats);
    for (let waited = 0; waited < 3; waited++) await settle();
    session.finish();

    const inputs = run.log().inputs;
    // The town's stone tablet takes the first key and the pass that meets the monster the second.
    expect(inputs.slice(0, 3)).toEqual([KEY.escape, KEY.escape, KEY.repeatFight]);
    expect(inputs.slice(3).every((key) => key === KEY.fight)).toBe(true);
    expect(inputs.length).toBeGreaterThan(3);
    expect(inputs).not.toContain(KEY.viewStats);
    // The three keys the game read are the three the player pressed; the swings after them are
    // the game's own, and the run server holds a run to a human speed by this count.
    expect(run.presses).toBe(3);
  });

  it("counts Moraff's Revenge's clock ticks as inputs nobody pressed", async () => {
    const { run, session } = recordedRevGame();
    await settle();
    // The town skips the clock outright, so the character goes down a level first.
    session.enterLevel(2);
    session.tick();
    session.tick();
    session.press(REV_KEY.arrowLeft);
    await settle();
    session.finish();

    expect(run.log().inputs.filter((input) => input === REV_CLOCK_TICK)).toHaveLength(2);
    expect(run.presses).toBe(1);
  });

  it("writes down Moraff's World's turn where the character stands", async () => {
    const { run, session } = recordedMwGame();
    session.press(MW_KEY.arrowUp);
    await settle();
    mwTurn(session, 2);
    session.press(MW_KEY.viewStats);
    await settle();
    session.finish();

    expect(run.log().inputs).toEqual([MW_KEY.arrowUp, TURN_INPUTS[2], MW_KEY.viewStats]);
  });
});

describe('the run kept beside the record', () => {
  it('is written again every time the record is, so a tab closed mid-game loses nothing', async () => {
    const kept: RunSession[] = [];
    const file: CharacterFile = { ...characterFile(), keepRun: (session) => void kept.push(session) };
    const run = new RunRecorder({ game: 'unforgiven', name: 'BRAWLER', record: file.bytes, seed: 12345 });
    const session = startGame(file, run.rng, run);
    void runPlayLoop(session, runMoveControl(session));
    await settle();
    if (session.tablet) await press(session, KEY.escape);
    await press(session, KEY.arrowUp);
    await press(session, KEY.arrowLeft);

    expect(kept.length).toBeGreaterThanOrEqual(2);
    expect(kept[kept.length - 1].inputs).toEqual(run.log().inputs);
    expect(kept[kept.length - 1].actions).toBe(run.log().actions);
  });

  it("is written the same way in Moraff's World", async () => {
    const kept: RunSession[] = [];
    const file: MwCharacterFile = { ...mwCharacterFile(), keepRun: (session) => void kept.push(session) };
    const run = new RunRecorder({ game: 'moraffsWorld', name: 'GRIMWALD', record: file.bytes, seed: 7 });
    const session = startMwGame(file, run.rng, run);
    void runPlayLoop(session, runMwMoveControl(session));
    await settle();
    session.press(MW_KEY.arrowUp);
    await settle();

    expect(kept[kept.length - 1].inputs).toEqual([MW_KEY.arrowUp]);
  });

  it("is written the same way in Moraff's Revenge", async () => {
    const kept: RunSession[] = [];
    const file: RevCharacterFile = { ...revCharacterFile(), keepRun: (session) => void kept.push(session) };
    const run = new RunRecorder({ game: 'revenge', name: 'FIGHTY', record: file.bytes, seed: 9 });
    const session = startRevGame(file, run.rng, run);
    void runPlayLoop(session, runRevDungeon(session));
    await settle();
    session.press(REV_KEY.arrowUp);
    await settle();

    expect(kept[kept.length - 1].inputs).toContain(REV_KEY.arrowUp);
  });

  it('is written once more where the loop comes back, so a death is in it', async () => {
    const kept: RunSession[] = [];
    const file: CharacterFile = {
      ...characterFile({ level: 0, dir: 0, ...townSquare() }),
      keepRun: (session) => void kept.push(session),
    };
    const run = new RunRecorder({ game: 'unforgiven', name: 'BRAWLER', record: file.bytes, seed: 12345 });
    const session = startGame(file, run.rng, run);
    const loop = runPlayLoop(session, runMoveControl(session));
    await press(session, KEY.escape);
    await press(session, KEY.arrowUp);
    session.game.pc.hp = -1;
    await press(session, KEY.escape);
    // FUN_2000_9232 prints two of UH.BIN's messages and waits for a key after each.
    await press(session, KEY.enter);
    await press(session, KEY.enter);
    await loop;

    expect(session.dead).toBe(true);
    expect(kept[kept.length - 1].milestones.some((milestone) => milestone.kind === 'death')).toBe(true);
  });
});

describe('a run the save editor wrote a record into', () => {
  it('says how many records reached the character', async () => {
    const { run, session, file } = recordedGame({ level: 0, dir: 0, ...townSquare(), str: 20 });
    await press(session, KEY.arrowUp);
    session.recordEdited(savePlayer({ ...loadPlayer(file.bytes), str: 99 }, file.bytes));
    await settle();
    session.finish();

    expect(session.game.pc.str).toBe(99);
    expect(run.log().edits).toBe(1);
  });

  it("says the same in Moraff's World", async () => {
    const { run, session, file } = recordedMwGame();
    session.press(MW_KEY.arrowUp);
    await settle();
    session.recordEdited(saveMwPlayer({ ...loadMwPlayer(file.bytes), str: 99 }, file.bytes));
    await settle();
    session.finish();

    expect(session.game.pc.str).toBe(99);
    expect(run.log().edits).toBe(1);
  });

  it("says the same in Moraff's Revenge", async () => {
    const { run, session } = recordedRevGame();
    await settle();
    session.press(REV_KEY.arrowUp);
    await settle();
    // The strength a record stores is `3 * the characteristic + 237` (1000:B6BF).
    session.recordEdited(revRecord({ 1: 3 * 18 + 237 }));
    await settle();
    session.finish();

    expect(session.game.pc.stats[0]).toBe(18);
    expect(run.log().edits).toBe(1);
  });

  it('counts none for a run nobody wrote a record into', async () => {
    const { run, session } = recordedGame();
    await press(session, KEY.arrowUp);
    session.finish();

    expect(run.log().edits).toBe(0);
  });
});

describe('the actions a run counts', () => {
  it('counts the step and the moment waited, and not the keys that only draw', async () => {
    const { run, session } = recordedGame({ level: 0, dir: 0, ...townSquare() });
    for (const key of [KEY.arrowUp, KEY.enter, KEY.viewStats, KEY.expNeeded, KEY.pockets, KEY.expandMap]) {
      await press(session, key);
    }
    session.finish();

    expect(run.log().actions).toBe(2);
  });

  it('counts nothing for a turn, which costs the character nothing in either game', async () => {
    const { run, session } = recordedGame({ level: 0, dir: 0, ...townSquare() });
    for (const key of [KEY.arrowLeft, KEY.arrowRight, KEY.arrowDown]) await press(session, key);
    session.finish();
    expect(run.log().actions).toBe(0);

    const mw = recordedMwGame();
    mwTurn(mw.session, 2);
    mwTurn(mw.session, 0);
    await settle();
    mw.session.finish();
    expect(mw.run.log().actions).toBe(0);
  });

  it('counts nothing for a key the game did nothing with', async () => {
    const { run, session } = recordedGame({ level: 0, dir: 0, ...townSquare() });
    // Each of the three puts up a box that waits for a key of its own, which the Escape answers.
    for (const key of [KEY.trapDoor, KEY.escape, KEY.fight, KEY.escape, KEY.up, KEY.escape]) {
      await press(session, key);
    }
    session.finish();

    expect(run.log().actions).toBe(0);
  });

  it('counts nothing for a menu opened and left, and one for the thing done through it', async () => {
    const { run, session } = recordedGame({ level: 0, dir: 0, ...townSquare(), armorOwned: [1, 1, 0, 0, 0, 0, 0, 0], armor: 0 });
    await press(session, KEY.armor);
    await press(session, KEY.escape);
    session.finish();
    expect(run.log().actions).toBe(0);

    await press(session, KEY.armor);
    await press(session, 0x32);
    session.finish();
    expect(session.game.pc.armor).toBe(1);
    expect(run.log().actions).toBe(1);
  });

  it('counts each of the swings Ctrl-F takes, and not Ctrl-F itself', async () => {
    const start = townSquare();
    const { run, session } = recordedGame({ level: 0, dir: 0, ...start, lev: 10, str: 60, cls: 2 });
    plantAMonster(session, start, { hp: 100000, type: 0 });
    // A pass round the loop with a key nothing is bound to, which is where attack_timing meets
    // the monster and takes it up.
    await press(session, KEY.escape);
    await press(session, KEY.repeatFight);
    for (let waited = 0; waited < 5; waited++) await settle();
    session.press(KEY.escape);
    for (let waited = 0; waited < 3; waited++) await settle();
    session.finish();

    const log = run.log();
    const swings = log.inputs.filter((key) => key === KEY.fight).length;
    expect(swings).toBeGreaterThan(1);
    expect(log.actions).toBe(swings);
  });

  it("counts Moraff's World's arrows only where the step went through", async () => {
    const walled = findMwSquare(0, (square) => square.n === 0 && square.s === 3 && square.ladder === 0);
    const { run, session } = recordedMwGame(7, undefined, { floor: 0, dir: 0, ...walled });
    await settle();
    // The first arrow faces north into the wall and goes nowhere; the second steps south.
    session.press(MW_KEY.arrowUp);
    await settle();
    session.press(MW_KEY.arrowDown);
    await settle();
    session.finish();

    expect(run.log().actions).toBe(1);
  });
});

/** Put a monster on the square in front of a character standing in the town facing north. */
function plantAMonster(session: GameSession, start: { x: number; y: number }, monster: { hp: number; type: number }) {
  const planted = session.game.monsters[0];
  planted.x = start.x;
  planted.y = start.y - 1;
  planted.hp = monster.hp;
  planted.level = 1;
  planted.type = monster.type;
  session.game.monsterMap[planted.y * 80 + planted.x] = 0;
}

/** The town square the Flea Bag Inn stands on. */
function innSquare(): { x: number; y: number } {
  for (let y = 1; y < 100; y++) {
    for (let x = 1; x < 76; x++) {
      if (bundledDungeon.townFeature(x, y, 0) === 4 && bundledDungeon.ladder(x, y, 0, 0) === 0) return { x, y };
    }
  }
  throw new Error('no inn in the town');
}

describe('the milestones a run records', () => {
  it('records the death, with the actions and the game time it happened at', async () => {
    const { run, session } = recordedGame({ level: 0, dir: 0, ...townSquare() });
    await press(session, KEY.arrowUp);
    session.game.pc.hp = -1;
    await press(session, KEY.escape);
    // FUN_2000_9232 prints two of UH.BIN's messages and waits for a key after each.
    await press(session, KEY.enter);
    await press(session, KEY.enter);
    session.finish();

    expect(session.dead).toBe(true);
    const milestones = run.log().milestones;
    expect(milestones).toEqual([{ kind: 'death', which: 0, actions: 1, time: session.game.secondsElapsed, floor: 0 }]);
  });

  it('records the section boss a swing killed', async () => {
    const start = townSquare();
    const { run, session } = recordedGame({ level: 0, dir: 0, ...start, lev: 20, str: 90, cls: 2 });
    plantAMonster(session, start, { hp: 1, type: 22 });
    await press(session, KEY.escape);
    await press(session, KEY.fight);
    for (let key = 0; key < 6; key++) await press(session, KEY.enter);
    session.finish();

    const boss = run.log().milestones.filter((milestone) => milestone.kind === 'boss');
    expect(boss.length).toBe(1);
    expect(boss[0].which).toBe(0);
    expect(boss[0].actions).toBeGreaterThan(0);
  });

  it('records the level a night at the inn handed over', async () => {
    const { run, session } = recordedGame({
      level: 0,
      ...innSquare(),
      lev: 1,
      money: 100,
      exp: 100000,
      cultureStock: 10,
      crystals: 10,
      sp: 0,
      maxSp: 5,
    });
    await press(session, KEY.up);
    await press(session, KEY.escape);
    await press(session, KEY.escape);
    await press(session, KEY.escape);
    await press(session, 0x31);
    await press(session, KEY.viewStats);
    session.finish();

    const levels = run.log().milestones.filter((milestone) => milestone.kind === 'level');
    expect(levels.length).toBe(1);
    expect(levels[0].which).toBe(session.game.pc.lev);
    expect(levels[0].which).toBeGreaterThan(1);
  });

  it('records the module the teleporter led to', async () => {
    const start = teleporterSquare();
    const { run, session } = recordedGame({ level: 0, dir: 0, ...start });
    await press(session, KEY.arrowUp);
    await press(session, KEY.enter);
    await press(session, KEY.viewStats);
    session.finish();

    expect(session.game.pc.module).toBe(1);
    const modules = run.log().milestones.filter((milestone) => milestone.kind === 'dungeon');
    expect(modules.length).toBe(1);
    expect(modules[0].which).toBe(1);
  });
});

/** What a character's run had come to in the sessions before the one being played. */
function runSoFar(actions: number, time: number, milestones: Milestone[] = []): RunTotals {
  return { actions, time, milestones };
}

/** A session's log with nothing in it but the numbers a chain is added up from. */
function sessionLog(totals: RunTotals): RunSession {
  const empty = new RunRecorder({ game: 'unforgiven', name: 'BRAWLER', record: new Uint8Array(8) }).log();
  return { ...empty, ...totals };
}

describe('a session of a run the character has played before', () => {
  it('counts its actions on from where the run stood', async () => {
    const { run, session } = recordedGame({ level: 0, dir: 0, ...townSquare() }, 12345, runSoFar(7, 30));
    await press(session, KEY.arrowUp);
    session.finish();

    expect(run.log().actions).toBe(8);
  });

  it("adds the game's own clock to the one the run had already spent", async () => {
    const { run, session } = recordedGame({ level: 0, dir: 0, ...townSquare() }, 12345, runSoFar(7, 30));
    await press(session, KEY.arrowUp);
    await press(session, KEY.enter);
    session.finish();

    expect(session.game.secondsElapsed).toBeGreaterThan(0);
    expect(run.log().time).toBe(30 + session.game.secondsElapsed);
  });

  it('stamps a milestone with what the whole run has spent', async () => {
    const { run, session } = recordedGame({ level: 0, dir: 0, ...teleporterSquare() }, 12345, runSoFar(7, 30));
    await press(session, KEY.arrowUp);
    await press(session, KEY.enter);
    await press(session, KEY.viewStats);
    session.finish();

    const modules = run.log().milestones.filter((milestone) => milestone.kind === 'dungeon');
    expect(modules.length).toBe(1);
    expect(modules[0].actions).toBe(8);
    expect(modules[0].time).toBe(30);
  });

  it("counts on the same way in Moraff's World", async () => {
    const open = findMwSquare(0, (square) => square.n === 3 && square.ladder === 0);
    const { run, session } = recordedMwGame(7, runSoFar(7, 30), { floor: 0, dir: 0, ...open });
    session.press(MW_KEY.arrowUp);
    await settle();
    session.finish();

    expect(run.log().actions).toBe(8);
    expect(run.log().time).toBe(30 + session.game.movesTaken);
  });

  it("counts on the same way in Moraff's Revenge", async () => {
    const { run, session } = recordedRevGame(9, runSoFar(7, 30));
    await settle();
    session.press(REV_KEY.arrowUp);
    await settle();
    session.finish();

    expect(run.log().actions).toBe(8);
    expect(run.log().time).toBe(30 + session.ticks);
  });

  it('draws the whole run in the line the Play tab shows and writes this session alone down', async () => {
    const earlier: Milestone = { kind: 'level', which: 2, actions: 3, time: 12, floor: 0 };
    const { run, session } = recordedGame({ level: 0, dir: 0, ...teleporterSquare() }, 12345, runSoFar(7, 30, [earlier]));
    await press(session, KEY.arrowUp);
    await press(session, KEY.enter);
    session.finish();

    expect(run.summary().milestones).toEqual([earlier, { kind: 'dungeon', which: 1, actions: 8, time: 30, floor: 0 }]);
    expect(run.log().milestones).toEqual([{ kind: 'dungeon', which: 1, actions: 8, time: 30, floor: 0 }]);
    expect(run.summary().actions).toBe(run.log().actions);
    expect(run.summary().time).toBe(run.log().time);
  });
});

describe('what a run comes to over the sessions it was played in', () => {
  it('comes to nothing for a character that has never been played', () => {
    expect(runTotals([])).toEqual({ actions: 0, time: 0, milestones: [] });
  });

  it('takes the count from the last session and the milestones from all of them', () => {
    const won: Milestone = { kind: 'win', which: 0, actions: 9, time: 30, floor: 2 };
    const gained: Milestone = { kind: 'level', which: 2, actions: 3, time: 12, floor: 0 };
    const first = sessionLog(runSoFar(4, 12, [gained]));
    const second = sessionLog(runSoFar(9, 30, [won]));

    expect(runTotals([first, second])).toEqual({ actions: 9, time: 30, milestones: [gained, won] });
  });
});

describe('replaying a run', () => {
  it('arrives at the state the run itself ended in', async () => {
    const { run, session, file } = recordedGame({ level: 3, dir: 0, ...floorSquare(3), lev: 20, str: 60 });
    for (const key of [KEY.arrowUp, KEY.arrowLeft, KEY.arrowUp, KEY.enter, KEY.fight, KEY.arrowUp]) {
      await press(session, key);
    }
    session.save();
    session.finish();
    const log = run.log();

    const again = await replayRun(log);
    expect(again.record).toEqual(file.bytes);
    expect(again.place).toEqual({
      x: session.game.pc.x,
      y: session.game.pc.y,
      floor: session.game.pc.level,
      dungeon: session.game.pc.module,
      dir: session.game.pc.dir,
    });
    expect(again.time).toBe(session.game.secondsElapsed);
    expect(again.time).toBe(log.time);
    expect(again.time).toBeGreaterThan(0);
    expect(again.actions).toBe(log.actions);
    // The turn costs the character nothing, and a key spent clearing a box the floor put up is
    // not an action either, so the count is under the six keys.
    expect(log.actions).toBeGreaterThan(2);
    expect(again.milestones).toEqual(log.milestones);
    expect(again.dead).toBe(false);
  });

  it('arrives there just the same for a character whose map is kept beside them', async () => {
    // The map a character discovers is written and read like a .DUN file, and nothing about it
    // touches the game: it draws no random number and changes no state, so a run played with one
    // replays into a session that has none.
    const kept: StoredMaps = {};
    const file = characterFile({ level: 3, dir: 0, ...floorSquare(3), lev: 20, str: 60 });
    file.maps = {
      read: () => kept,
      write: (maps) => void Object.assign(kept, maps),
      clear: () => void Object.keys(kept).forEach((key) => delete kept[key]),
    };
    const run = new RunRecorder({ game: 'unforgiven', name: 'BRAWLER', record: file.bytes, seed: 12345, startedAt: '2026-09-07T00:00:00.000Z' });
    const session = startGame(file, run.rng, run);
    void runMoveControl(session);
    await settle();
    for (const key of [KEY.arrowUp, KEY.arrowLeft, KEY.arrowUp, KEY.enter, KEY.fight, KEY.arrowUp]) {
      await press(session, key);
    }
    session.memory.save();
    session.save();
    session.finish();
    const log = run.log();
    expect(Object.keys(kept)).not.toHaveLength(0);

    const again = await replayRun(log);
    expect(again.record).toEqual(file.bytes);
    expect(again.time).toBe(session.game.secondsElapsed);
    expect(again.actions).toBe(log.actions);
    expect(again.milestones).toEqual(log.milestones);
    expect(again.place).toEqual({
      x: session.game.pc.x,
      y: session.game.pc.y,
      floor: session.game.pc.level,
      dungeon: session.game.pc.module,
      dir: session.game.pc.dir,
    });
  });

  it('reaches the same milestones, at the same actions and the same game time', async () => {
    const { run, session } = recordedGame({
      level: 0,
      ...innSquare(),
      lev: 1,
      money: 100,
      exp: 100000,
      cultureStock: 10,
      crystals: 10,
      sp: 0,
      maxSp: 5,
    });
    for (const key of [KEY.up, KEY.escape, KEY.escape, KEY.escape, 0x31, KEY.enter]) await press(session, key);
    session.finish();
    const log = run.log();

    expect(log.milestones.some((milestone) => milestone.kind === 'level')).toBe(true);
    expect((await replayRun(log)).milestones).toEqual(log.milestones);
  });

  it('ends with the record the game itself last wrote, and a game that wrote none ends with the one it started from', async () => {
    // The roster is left holding the last record the game wrote when a player walks away, so a
    // replay that saved for itself at the end would end somewhere the character never was.
    const file = characterFile({ level: 3, dir: 0, ...floorSquare(3) });
    const record = file.bytes.slice();
    const run = new RunRecorder({ game: 'unforgiven', name: 'BRAWLER', record: file.bytes, seed: 12345 });
    const session = startGame(file, run.rng, run);
    void runMoveControl(session);
    await settle();
    session.finish();
    const log = run.log();
    expect(log.inputs).toEqual([]);

    expect((await replayRun(log)).record).toEqual(record);
  });

  it('replays a session of a run the character had played before, counting on from it', async () => {
    const before = runSoFar(7, 30);
    const { run, session } = recordedGame({ level: 0, dir: 0, ...teleporterSquare() }, 12345, before);
    for (const key of [KEY.arrowUp, KEY.enter, KEY.arrowUp]) await press(session, key);
    session.finish();
    const log = run.log();

    const again = await replayRun(log, before);
    expect(again.actions).toBe(log.actions);
    expect(again.actions).toBeGreaterThan(7);
    expect(again.time).toBe(log.time);
    expect(again.milestones).toEqual(log.milestones);
  });

  it('ends somewhere else when the keys have been tampered with', async () => {
    const start = townSquare();
    const { run, session, file } = recordedGame({ level: 0, dir: 0, ...start });
    for (const key of [KEY.arrowUp, KEY.arrowUp, KEY.arrowLeft, KEY.arrowUp]) await press(session, key);
    session.save();
    session.finish();
    const log = run.log();

    const tampered = { ...log, inputs: [...log.inputs, KEY.arrowUp, KEY.arrowUp] };
    const again = await replayRun(tampered);
    expect(again.record).not.toEqual(file.bytes);
    expect(again.place).not.toEqual({
      x: session.game.pc.x,
      y: session.game.pc.y,
      floor: session.game.pc.level,
      dungeon: session.game.pc.module,
      dir: session.game.pc.dir,
    });
  });

  it("replays Moraff's World, turns where the character stands and all", async () => {
    const { run, session, file } = recordedMwGame();
    session.press(MW_KEY.arrowUp);
    await settle();
    mwTurn(session, 2);
    session.press(MW_KEY.arrowLeft);
    await settle();
    session.press(MW_KEY.wait);
    await settle();
    session.save();
    session.finish();
    const log = run.log();

    const again = await replayRun(log);
    expect(again.record).toEqual(file.bytes);
    expect(again.place).toEqual({
      x: session.game.pc.x,
      y: session.game.pc.y,
      floor: session.game.pc.floor,
      dungeon: session.game.pc.dungeon,
      dir: session.game.pc.dir,
    });
    expect(again.time).toBe(session.game.movesTaken);
    expect(again.actions).toBe(log.actions);
  });
});

describe('the games a run can be played in', () => {
  it('names the games a log can name', () => {
    expect(isRunGame('unforgiven')).toBe(true);
    expect(isRunGame('moraffsWorld')).toBe(true);
    expect(isRunGame('revenge')).toBe(true);
    expect(isRunGame('moraffsDungeonOfTheUnforgiven')).toBe(false);
    expect(isRunGame(2)).toBe(false);
  });

  it("says each game's clock in that game's own words", () => {
    expect(RUN_GAMES.unforgiven.clockWords(1)).toBe('1 second');
    expect(RUN_GAMES.unforgiven.clockWords(12)).toBe('12 seconds');
    expect(RUN_GAMES.moraffsWorld.clockWords(1.4)).toBe('1 move');
    expect(RUN_GAMES.moraffsWorld.clockWords(12.5)).toBe('13 moves');
    expect(RUN_GAMES.revenge.clockWords(1)).toBe('1 tick');
    expect(RUN_GAMES.revenge.clockWords(12)).toBe('12 ticks');
  });
});

describe('the words a run is shown with', () => {
  it('says one action rather than one actions', () => {
    expect(actionWords(0)).toBe('0 actions');
    expect(actionWords(1)).toBe('1 action');
    expect(actionWords(12)).toBe('12 actions');
  });

  it('names each kind of milestone', () => {
    const at = { actions: 4, time: 12, floor: 3 };
    const dungeonName = (dungeon: number) => `Module ${dungeon}`;
    expect(milestoneWords({ kind: 'boss', which: 0, ...at }, dungeonName)).toBe('Boss 1 beaten');
    expect(milestoneWords({ kind: 'level', which: 5, ...at }, dungeonName)).toBe('Level 5');
    expect(milestoneWords({ kind: 'dungeon', which: 2, ...at }, dungeonName)).toBe('Module 2');
    expect(milestoneWords({ kind: 'death', which: 0, ...at }, dungeonName)).toBe('Died');
    expect(milestoneWords({ kind: 'win', which: 0, ...at }, dungeonName)).toBe('Won');
  });

  it('says where in the run a milestone happened', () => {
    expect(milestoneNote({ kind: 'level', which: 5, actions: 1, time: 12, floor: 3 }, '12 seconds')).toBe(
      'After 1 action and 12 seconds, on floor 3.',
    );
    expect(milestoneNote({ kind: 'level', which: 5, actions: 4, time: 12, floor: 0 }, '12 moves')).toBe(
      'After 4 actions and 12 moves, in the town.',
    );
  });

  it('keeps the last few milestones on the line and folds the rest away', () => {
    const at = { actions: 4, time: 12, floor: 3 };
    const levels: Milestone[] = [1, 2, 3, 4, 5, 6].map((level) => ({ kind: 'level', which: level, ...at }));

    const line = lastMilestones(levels);

    expect(line.shown.map((milestone) => milestone.which)).toEqual([3, 4, 5, 6]);
    expect(line.earlier.map((milestone) => milestone.which)).toEqual([1, 2]);
  });

  it('folds nothing away while the milestones still fit', () => {
    const at = { actions: 4, time: 12, floor: 3 };
    const levels: Milestone[] = [1, 2, 3, 4].map((level) => ({ kind: 'level', which: level, ...at }));

    expect(levels).toHaveLength(MILESTONES_SHOWN);
    expect(lastMilestones(levels).shown).toEqual(levels);
    expect(lastMilestones(levels).earlier).toEqual([]);
    expect(lastMilestones([]).shown).toEqual([]);
  });

  it('names the file a run downloads as after the character', () => {
    const session = new RunRecorder({ game: 'unforgiven', name: "GRIM WALD'S", record: new Uint8Array(4) }).log();
    expect(runFileName(runLogOf([session]))).toBe('grim-wald-s-run.json');
    expect(runFileName(runLogOf([{ ...session, name: '   ' }]))).toBe('character-run.json');
  });
});
