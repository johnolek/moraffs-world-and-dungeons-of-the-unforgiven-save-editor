import { describe, expect, it } from 'vitest';
import { isActionKind, type CastEvent } from '../../game/action';
import { SeededRng } from '../../game/port/rng';
import { COLUMNS, ROWS, blocked, townBuilding } from '../../game/revmap.js';
import { RevGameSession, runRevDungeon, startRevGame } from './engine';
import { revCharacterFile, revRecord } from './test-engine';
import { REV_KEY } from './keys';
import { revFeatureUnder } from './ladders';
import type { RevGame } from './state';

/**
 * What Moraff's Revenge counts as one of a run's actions. This game is not turn based, so there
 * is no moment to weigh: what counts is simply whether the thing happened. `../run.ts` is what
 * adds them up.
 */

/** The actions the game has pushed, oldest first. */
function actionsPushed(game: RevGame): string[] {
  return game.events.filter((event) => isActionKind(event.kind)).map((event) => event.kind);
}

/** The spell each cast on the list was of. */
function spellsCast(game: RevGame): CastEvent['spell'][] {
  return game.events.filter((event): event is CastEvent => event.kind === 'cast').map((event) => event.spell);
}

/** Let the loop take what it has been given and come back to waiting. */
function settled(): Promise<unknown> {
  return new Promise((resolve) => setTimeout(resolve));
}

async function playing(fields: Record<number, number> = {}, seed = 9): Promise<RevGameSession> {
  const session = startRevGame(revCharacterFile(revRecord(fields)), new SeededRng(seed));
  void runRevDungeon(session);
  await settled();
  return session;
}

async function press(session: RevGameSession, key: number): Promise<void> {
  session.press(key);
  await settled();
}

/**
 * The sides of the character's own square, as the wall rule is asked about each: north and west
 * ask for the square's own side, east and south for the one beyond it.
 */
function sidesOf(game: RevGame): { facing: number; walled: boolean }[] {
  const pc = game.pc;
  const asked = [
    { facing: 1, kind: 1, column: pc.column, row: pc.row },
    { facing: 2, kind: 2, column: pc.column + 1, row: pc.row },
    { facing: 3, kind: 1, column: pc.column, row: pc.row + 1 },
    { facing: 4, kind: 2, column: pc.column, row: pc.row },
  ];
  return asked.map((side) => ({
    facing: side.facing,
    walled: blocked(side.kind, side.column, side.row, pc.dungeonLevel, pc.generation),
  }));
}

/** Face the character a way the level lets them walk, or a way it does not. */
function face(game: RevGame, walled: boolean): void {
  const side = sidesOf(game).find((each) => each.walled === walled);
  if (side === undefined) throw new Error(`no ${walled ? 'walled' : 'open'} side to face`);
  game.pc.facing = side.facing;
}

/** The first square of the town one of the seven building routines stands on. */
function buildingSquare(): { column: number; row: number } {
  for (let row = 1; row <= ROWS; row++) {
    for (let column = 1; column <= COLUMNS; column++) {
      const building = townBuilding(column, row);
      if (building >= 1 && building <= 7) return { column, row };
    }
  }
  throw new Error('the town has no buildings');
}

/** The first square of the town a ladder leads down from. */
function ladderSquare(): { column: number; row: number } {
  for (let row = 1; row <= ROWS; row++) {
    for (let column = 1; column <= COLUMNS; column++) {
      const under = revFeatureUnder(column, row, 0);
      if (under >= 1 && under <= 3 && townBuilding(column, row) === 0) return { column, row };
    }
  }
  throw new Error('the town has no ladder down');
}

/** The record values the tests write: where the character stands, and what they carry. */
const COLUMN = 23;
const ROW = 24;
const LEVEL = 25;
const SWORD = 142;
const SPELL_POINTS = 22;
/** Which of the two dungeon spells of level 1 the character was taught, as a bitfield. */
const PREP_LEVEL_1 = 118;
const FIRST_PILL = 162;
const FIRST_WAND = 168;

/** The digits the pill and wand menus are answered with. */
const ONE = '1'.charCodeAt(0);
const NINE = '9'.charCodeAt(0);

describe('the step', () => {
  it('counts one that moved the character', async () => {
    const session = await playing();
    face(session.game, false);
    await press(session, REV_KEY.arrowUp);
    expect(actionsPushed(session.game)).toEqual(['stepped']);
    session.finish();
  });

  it('counts nothing for one a wall refused', async () => {
    const session = await playing();
    face(session.game, true);
    const { column, row } = session.game.pc;
    await press(session, REV_KEY.arrowUp);
    expect(session.game.pc).toMatchObject({ column, row });
    expect(actionsPushed(session.game)).toEqual([]);
    session.finish();
  });

  it('counts nothing for the arrows that only turn', async () => {
    const session = await playing();
    await press(session, REV_KEY.arrowLeft);
    await press(session, REV_KEY.arrowRight);
    await press(session, REV_KEY.arrowDown);
    expect(actionsPushed(session.game)).toEqual([]);
    session.finish();
  });
});

describe('the ways off a level', () => {
  it('counts the ladder gone down', async () => {
    const ladder = ladderSquare();
    const session = await playing({ [COLUMN]: ladder.column, [ROW]: ladder.row });
    await press(session, REV_KEY.down);
    expect(session.view().place.level).toBeGreaterThan(0);
    expect(actionsPushed(session.game)).toEqual(['ladderTaken']);
    session.finish();
  });

  it('counts nothing for D where there is no ladder', async () => {
    const session = await playing();
    await press(session, REV_KEY.down);
    expect(session.view().place.level).toBe(0);
    expect(actionsPushed(session.game)).toEqual([]);
    session.finish();
  });

  it('counts the building the rope leads into', async () => {
    const building = buildingSquare();
    const session = await playing({ [COLUMN]: building.column, [ROW]: building.row });
    await press(session, REV_KEY.up);
    expect(actionsPushed(session.game)).toEqual(['buildingEntered']);
    session.finish();
  });

  it('counts nothing for U on open ground', async () => {
    const session = await playing();
    await press(session, REV_KEY.up);
    expect(actionsPushed(session.game)).toEqual([]);
    session.finish();
  });
});

describe('the fight prompt', () => {
  /** Stand the character on a dungeon level with a monster on their own square. */
  async function beside(): Promise<RevGameSession> {
    const session = await playing({ [LEVEL]: 2, [SWORD]: 1 });
    session.enterLevel(2);
    session.game.monsters.grid[22 * 10 + 10] = 41;
    session.game.monsters.positions[41] = 32 * 10 + 10;
    // A key of no consequence takes the loop round to the top, where the fight opens.
    await press(session, REV_KEY.stats);
    await press(session, ' '.charCodeAt(0));
    session.game.events.length = 0;
    return session;
  }

  it('counts the swing taken with a weapon the character owns', async () => {
    const session = await beside();
    expect(session.view().fight).not.toBeNull();
    await press(session, REV_KEY.sword);
    expect(actionsPushed(session.game)).toEqual(['swung']);
    session.finish();
  });

  it('counts nothing for a weapon the character does not own', async () => {
    const session = await beside();
    await press(session, REV_KEY.mace);
    expect(session.view().box.join(' ')).toContain('YOU DO NOT HAVE THAT');
    expect(actionsPushed(session.game)).toEqual([]);
    session.finish();
  });
});

describe('the spell menu', () => {
  it('counts the spell the menu picked and names it', async () => {
    const session = await playing({ [SPELL_POINTS]: 5, [PREP_LEVEL_1]: 1 });
    await press(session, REV_KEY.cast);
    await press(session, ONE);
    await press(session, ONE);
    expect(actionsPushed(session.game)).toEqual(['cast']);
    expect(spellsCast(session.game)).toEqual([{ game: 'revenge', set: 'prep', level: 1, number: 1, name: 'CURE' }]);
    session.finish();
  });

  it('counts nothing for a level the character cannot pay for', async () => {
    const session = await playing({ [SPELL_POINTS]: 0, [PREP_LEVEL_1]: 1 });
    await press(session, REV_KEY.cast);
    await press(session, ONE);
    expect(session.view().box.join(' ')).toContain('NOT ENOUGH SPELL POINTS');
    expect(actionsPushed(session.game)).toEqual([]);
    session.finish();
  });
});

describe('the pills and the wands', () => {
  it('counts the pill swallowed', async () => {
    const session = await playing({ [FIRST_PILL]: 2 });
    await press(session, REV_KEY.pill);
    await press(session, ONE);
    expect(actionsPushed(session.game)).toEqual(['itemUsed']);
    session.finish();
  });

  it('counts nothing for the pill menu opened and left', async () => {
    const session = await playing({ [FIRST_PILL]: 2 });
    await press(session, REV_KEY.pill);
    await press(session, REV_KEY.escape);
    expect(actionsPushed(session.game)).toEqual([]);
    session.finish();
  });

  it('counts nothing for a colour the character has none of', async () => {
    const session = await playing();
    await press(session, REV_KEY.pill);
    await press(session, ONE);
    expect(actionsPushed(session.game)).toEqual([]);
    session.finish();
  });

  it('counts the charge a wand spent', async () => {
    const session = await playing({ [FIRST_WAND + 8]: 2 });
    await press(session, REV_KEY.wand);
    await press(session, NINE);
    expect(actionsPushed(session.game)).toEqual(['itemUsed']);
    session.finish();
  });

  it('counts nothing for a wand the character has no charges of', async () => {
    const session = await playing();
    await press(session, REV_KEY.wand);
    await press(session, NINE);
    expect(actionsPushed(session.game)).toEqual([]);
    session.finish();
  });
});

describe('the keys that do nothing to the character or the world', () => {
  it('counts nothing for A, whose coins this port does not drop', async () => {
    const session = await playing();
    await press(session, REV_KEY.abandon);
    expect(actionsPushed(session.game)).toEqual([]);
    session.finish();
  });

  it('counts nothing for the screens and the settings', async () => {
    const session = await playing();
    for (const key of [REV_KEY.magic, REV_KEY.escape, REV_KEY.background, REV_KEY.palette, REV_KEY.sound]) {
      await press(session, key);
      await press(session, ' '.charCodeAt(0));
    }
    expect(actionsPushed(session.game)).toEqual([]);
    session.finish();
  });
});
