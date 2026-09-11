import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../game/port/rng';
import { COLUMNS, ROWS, chuteLanding, townBuilding } from '../../game/revmap.js';
import { revMonsterAttack } from './attack';
import { revFallDownAChute } from './chute';
import { revDie } from './death';
import { RevGameSession, runRevDungeon, startRevGame } from './engine';
import { revCharacterFile, revRecord } from './test-engine';
import { revLeaveTheFight, revMeetMonster } from './fight';
import { revUseAnItem, revWearOffPotions } from './items';
import { revKillMonster } from './kill';
import { REV_KEY } from './keys';
import { revFeatureUnder } from './ladders';
import { REV_MAGIC } from './magic';
import { GRID_STRIDE } from './monsters';
import { REV_ARMOUR_VALUE, REV_VALUE, setRevValue } from './record';
import { revCharacter, revRolls, revTestGame } from './spells.test-support';
import type { RevFight, RevGame } from './state';
import { revStayAtInn, revVisitBank, revVisitTemple, revVisitStore, type RevTownDesk } from './town';
import { revTreasureFromAKill } from './treasure';
import { moraffsRevengeJournal } from './journal';

/**
 * What Moraff's Revenge tells a run's journal, and the words each of those comes out as. Every
 * line of a journal is `moraffsRevengeJournal`, so a test that reads the lines a handler left
 * behind checks the numbers on the event and the sentence together.
 */

/** The events of one kind the game has pushed, oldest first. */
function pushed(game: RevGame, kind: string): unknown[] {
  return game.events.filter((event) => event.kind === kind);
}

/** Everything the game has pushed, in the words a journal reads it out in. */
function lines(game: RevGame): string[] {
  return game.events
    .map((event) => moraffsRevengeJournal(event))
    .filter((line): line is string => line !== null);
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

/** The record values the tests write: where the character stands, and what they carry. */
const COLUMN = 23;
const ROW = 24;
const LEVEL = 25;
const SWORD = 142;
const FOUNTAIN_COLUMN = 150;
const FOUNTAIN_ROW = 151;
const FIRE_UNTIL = 152;

/** A town desk that answers with the keys a test names, and then leaves. */
function townDesk(...keys: string[]): RevTownDesk {
  let at = 0;
  return {
    key: async () => (keys[at] === undefined ? 'L'.charCodeAt(0) : keys[at++].charCodeAt(0)),
  };
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

/**
 * The first square of a level a chute opens under whose landing square is plain ground, which is
 * what leaves a false floor there: a landing that is itself a chute or a ladder is that instead.
 */
function chuteSquare(level: number): { column: number; row: number } {
  for (let row = 2; row < ROWS; row++) {
    for (let column = 2; column < COLUMNS; column++) {
      if (revFeatureUnder(column, row, level) !== 0) continue;
      const landing = chuteLanding(column, row, level);
      if (revFeatureUnder(column, row, landing) > 3) return { column, row };
    }
  }
  throw new Error(`no chute on level ${level} that lands on open ground`);
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

/** A game with a monster in front of the character, dead but for the kill (1000:A335). */
function aboutToDie(fields: Partial<RevFight> = {}): RevGame {
  const pc = revCharacter({ column: 7, row: 3, dungeonLevel: 10 });
  const { game } = revTestGame(pc, revRolls([]));
  game.monsters.grid[GRID_STRIDE * pc.row + pc.column] = 4;
  game.fight = {
    slot: 4,
    name: 6,
    monsterLevel: 10,
    hitPoints: 0,
    kind: 1,
    kindAdjust: 0,
    attackBonus: 0,
    experience: 100,
    ...fields,
  };
  return game;
}

describe('moving about', () => {
  it('says which way a step went', async () => {
    const session = await playing();
    // 1000:0AD8: the up arrow in the compass mode faces the character north and steps them.
    session.game.arrowMode = 1;
    session.game.pc.column = 10;
    session.game.pc.row = 10;
    await press(session, REV_KEY.arrowUp);
    expect(pushed(session.game, 'stepped')).toEqual([{ kind: 'stepped', dir: 0 }]);
    expect(lines(session.game)).toContain('Stepped north');
    session.finish();
  });

  it('says which way a turn left the character facing', async () => {
    const session = await playing();
    await press(session, REV_KEY.arrowRight);
    expect(pushed(session.game, 'turned')).toEqual([{ kind: 'turned', facing: 3 }]);
    expect(lines(session.game)).toContain('Turned to face east');
    session.finish();
  });

  it('says which floor a ladder reached', async () => {
    const ladder = ladderSquare();
    const session = await playing({ [COLUMN]: ladder.column, [ROW]: ladder.row });
    await press(session, REV_KEY.down);
    const to = session.view().place.level;
    expect(pushed(session.game, 'ladderTaken')).toEqual([
      { kind: 'ladderTaken', to, falseFloor: false },
    ]);
    expect(lines(session.game)).toContain(`Took the ladder to floor ${to}`);
    expect(lines(session.game)).toContain(`Reached floor ${to}`);
    session.finish();
  });

  it('says which square a chute opened under and which floor it landed on', () => {
    const pc = revCharacter({ column: 7, row: 3, dungeonLevel: 5 });
    const { game } = revTestGame(pc, revRolls([]));
    expect(revFallDownAChute(game, () => {})).toBe(true);
    const to = pc.dungeonLevel;
    expect(pushed(game, 'chuteTaken')).toEqual([
      { kind: 'chuteTaken', from: { column: 7, row: 3 }, to },
    ]);
    expect(lines(game)).toContain(`Fell down the chute at 7,3 to floor ${to}`);
  });

  it('says the false floor gave way where a chute last landed the character', async () => {
    const chute = chuteSquare(5);
    const session = await playing({ [COLUMN]: chute.column, [ROW]: chute.row, [LEVEL]: 5 });
    const landed = session.game.pc.dungeonLevel;
    // The fall can land the character on a monster, and the fight prompt takes the D key for
    // itself; the square is cleared so that the dungeon's own D is what answers.
    session.game.monsters.grid[GRID_STRIDE * session.game.pc.row + session.game.pc.column] = 0;
    revLeaveTheFight(session.game);
    session.game.events.length = 0;
    await press(session, REV_KEY.down);
    expect(pushed(session.game, 'ladderTaken')).toEqual([
      { kind: 'ladderTaken', to: landed + 1, falseFloor: true },
    ]);
    expect(lines(session.game)).toContain(`The false floor gave way down to floor ${landed + 1}`);
    session.finish();
  });

  it('says which generation the fountain of youth started', async () => {
    const session = await playing({ [LEVEL]: 70, [COLUMN]: 6, [ROW]: 9, [FOUNTAIN_COLUMN]: 6, [FOUNTAIN_ROW]: 9 });
    await press(session, REV_KEY.down);
    const drunk = pushed(session.game, 'fountainDrunk') as { generation: number }[];
    expect(drunk).toHaveLength(1);
    expect(lines(session.game)).toContain(
      `Drank from the fountain of youth: generation ${drunk[0].generation}`,
    );
    session.finish();
  });

  it('names the building the town square held', async () => {
    const building = buildingSquare();
    const session = await playing({ [COLUMN]: building.column, [ROW]: building.row });
    await press(session, REV_KEY.up);
    const entered = pushed(session.game, 'buildingEntered') as { building: string }[];
    expect(entered).toHaveLength(1);
    expect(lines(session.game)).toContain(`Went into the ${entered[0].building}`);
    session.finish();
  });
});

/** A character on a dungeon level with a monster on their own square, in a fight with it. */
async function inAFight(fields: Record<number, number> = {}): Promise<RevGameSession> {
  const session = await playing({ [LEVEL]: 2, [SWORD]: 1, ...fields });
  session.enterLevel(2);
  session.game.monsters.grid[22 * 10 + 10] = 41;
  session.game.monsters.positions[41] = 32 * 10 + 10;
  // A key of no consequence takes the loop round to the top, where the fight opens.
  await press(session, REV_KEY.stats);
  await press(session, ' '.charCodeAt(0));
  session.game.events.length = 0;
  return session;
}

describe('a fight', () => {
  it('says which monster the character came face to face with', () => {
    const pc = revCharacter({ column: 7, row: 3, dungeonLevel: 10 });
    const { game } = revTestGame(pc, revRolls([]));
    const fight = revMeetMonster(game, 4);
    const met = pushed(game, 'met') as { monster: { name: string } }[];
    expect(met).toHaveLength(1);
    expect(met[0]).toMatchObject({ kind: 'met', slot: 4 });
    expect(lines(game)).toContain(
      `Came face to face with a Level ${fight.monsterLevel} ${met[0].monster.name}`,
    );
  });

  it('says which weapon swung at which monster and what it hit for', async () => {
    const session = await inAFight();
    await press(session, REV_KEY.sword);
    const swung = pushed(session.game, 'swung') as {
      damage: number;
      monster: { name: string; level: number };
    }[];
    expect(swung).toHaveLength(1);
    expect(swung[0]).toMatchObject({ kind: 'swung', weapon: 'sword' });
    const monster = `a Level ${swung[0].monster.level} ${swung[0].monster.name}`;
    expect(lines(session.game)).toContain(
      swung[0].damage === 0
        ? `Swung the sword at ${monster} and missed`
        : `Swung the sword at ${monster} and hit for ${swung[0].damage}`,
    );
    session.finish();
  });

  it('says which monster hit the character and for how much', () => {
    const pc = revCharacter({ column: 7, row: 3, dungeonLevel: 10, hp: 10000, maxHp: 10000 });
    const { game } = revTestGame(pc, revRolls([19, 19, 19, 19, 19, 19, 19, 19]));
    revMeetMonster(game, 4);
    game.events.length = 0;
    revMonsterAttack(game, () => {});
    const hits = pushed(game, 'hit') as { damage: number; monster: { name: string } }[];
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({ breath: null });
    expect(lines(game)).toContain(
      hits[0].damage === 0
        ? `The ${hits[0].monster.name} missed`
        : `The ${hits[0].monster.name} hit you for ${hits[0].damage}`,
    );
  });

  it('says what a breath of fire hit the monster for', async () => {
    const session = await inAFight({ [FIRE_UNTIL]: 60000 });
    await press(session, REV_KEY.breathe);
    const breathed = pushed(session.game, 'breathed') as {
      damage: number;
      monster: { name: string; level: number };
    }[];
    expect(breathed).toHaveLength(1);
    expect(lines(session.game)).toContain(
      `Breathed fire on a Level ${breathed[0].monster.level} ${breathed[0].monster.name} for ${breathed[0].damage}`,
    );
    session.finish();
  });

  it('says what a kill was worth', () => {
    const game = aboutToDie();
    revKillMonster(game);
    const killed = pushed(game, 'killed') as { monster: { name: string } }[];
    expect(killed).toHaveLength(1);
    expect(killed[0]).toMatchObject({ kind: 'killed', experience: 100 });
    expect(lines(game)).toContain(
      `Killed a Level 10 ${killed[0].monster.name} for 100 experience`,
    );
  });

  it("reports no kill where `Go Away!' sent the monster off", () => {
    const game = aboutToDie();
    game.monsterLeft = true;
    revKillMonster(game);
    expect(pushed(game, 'killed')).toEqual([]);
  });

  it('says what killed the character and where', async () => {
    const pc = revCharacter({ column: 7, row: 3, dungeonLevel: 10, generation: 3, hp: -1 });
    const { game } = revTestGame(pc, revRolls([3]));
    revMeetMonster(game, 4);
    game.events.length = 0;
    await revDie(game, townDesk());
    const died = pushed(game, 'died') as { monster: { name: string; level: number } }[];
    expect(died).toHaveLength(1);
    expect(died[0]).toMatchObject({ kind: 'died', floor: 10, dungeon: 3 });
    const monster = `a Level ${died[0].monster.level} ${died[0].monster.name}`;
    expect(lines(game)).toContain(`Died to ${monster} on floor 10 of Generation 3`);
  });
});

describe('what the character carries', () => {
  it('names the item that was used', async () => {
    const pc = revCharacter();
    const { game, desk, keys } = revTestGame(pc, revRolls([]));
    // Item 3 is the scroll of healing, whose count is the third of the nine item values.
    setRevValue(pc, 49, 2);
    keys.push('3'.charCodeAt(0));
    await revUseAnItem(game, desk);
    expect(pushed(game, 'itemUsed')).toEqual([
      { kind: 'itemUsed', item: 'SCROLL OF HEALING' },
    ]);
    expect(lines(game)).toContain('Used the SCROLL OF HEALING');
  });

  it('names the potion that wore off', () => {
    const pc = revCharacter();
    const { game } = revTestGame(pc, revRolls([]));
    setRevValue(pc, REV_MAGIC.shieldingUntil, 1);
    game.seconds = 500;
    expect(revWearOffPotions(game)).toBe(true);
    expect(pushed(game, 'potionWoreOff')).toEqual([
      { kind: 'potionWoreOff', potion: 'POTION OF SHIELDING' },
    ]);
    expect(lines(game)).toContain('The POTION OF SHIELDING wore off');
  });
});

describe('what a kill turns up', () => {
  it('names the wand, the pill and the spellbook a kill left', async () => {
    const pc = revCharacter({ dungeonLevel: 30 });
    // The rolls, in the order the kill makes them: no coins, a spellbook of the first level's
    // first dungeon spell, no starting kit, a wand of the third colour with two charges, a pill
    // of the second colour, and a depth roll too low for the deep table.
    const { game, desk, keys } = revTestGame(pc, revRolls([0, 1, 0, 0, 1, 0, 0, 2, 1, 0, 1, 0, 0]));
    game.dropsAWand = true;
    game.dropsAPill = true;
    keys.push(REV_KEY.enter, ' '.charCodeAt(0));
    await revTreasureFromAKill(game, desk);
    const wands = pushed(game, 'wandFound') as { colour: string; charges: number }[];
    expect(wands).toHaveLength(1);
    expect(lines(game)).toContain(
      `Found a ${wands[0].colour.toLowerCase()} wand with ${wands[0].charges} charges`,
    );
    const pills = pushed(game, 'pillFound') as { colour: string }[];
    expect(pills).toHaveLength(1);
    expect(lines(game)).toContain(`Found a ${pills[0].colour.toLowerCase()} pill`);
    const learned = pushed(game, 'spellLearned') as { level: number; name: string }[];
    expect(learned).toHaveLength(1);
    expect(lines(game).join('\n')).toContain(learned[0].name);
  });
});

describe('the town', () => {
  it('says what a night at an inn cost', async () => {
    const pc = revCharacter({ money: 500, hp: 10, maxHp: 40 });
    const { game } = revTestGame(pc, revRolls([]));
    await revStayAtInn(game, 0, townDesk('Y'));
    expect(pushed(game, 'coinsSpent')).toEqual([
      { kind: 'coinsSpent', amount: 10, on: 'a night', where: 'Flea Bag Inn' },
    ]);
    expect(lines(game)).toContain('Bought a night at the Flea Bag Inn for 10 jewel pieces');
  });

  it('names the temple spell that was paid for', async () => {
    const pc = revCharacter({ money: 500, hp: 10, maxHp: 40 });
    const { game } = revTestGame(pc, revRolls([]));
    await revVisitTemple(game, townDesk('1', 'L'));
    expect(pushed(game, 'coinsSpent')).toEqual([
      { kind: 'coinsSpent', amount: 75, on: 'Cure wounds', where: 'Temple' },
    ]);
    expect(lines(game)).toContain('Bought Cure wounds at the Temple for 75 jewel pieces');
  });

  it('says what was bought at the store', async () => {
    const pc = revCharacter({ money: 500, cls: 1 });
    const { game } = revTestGame(pc, revRolls([]));
    setRevValue(pc, REV_ARMOUR_VALUE, 0);
    await revVisitStore(game, townDesk('4', 'L'));
    expect(pushed(game, 'coinsSpent')).toEqual([
      { kind: 'coinsSpent', amount: 200, on: 'Leather armor', where: 'Store' },
    ]);
    expect(lines(game)).toContain('Bought Leather armor at the Store for 200 jewel pieces');
  });

  it('says what went into and came out of the bank, and what it bought the treasure for', async () => {
    const pc = revCharacter({ money: 100, bank: 0, treasure: 40 });
    const { game } = revTestGame(pc, revRolls([]));
    setRevValue(pc, REV_VALUE.town, 0);
    await revVisitBank(game, townDesk('D', '5', '0', '\r', 'W', '2', '0', '\r', 'L'));
    expect(pushed(game, 'treasureSold')).toEqual([{ kind: 'treasureSold', amount: 40 }]);
    expect(pushed(game, 'deposited')).toEqual([{ kind: 'deposited', amount: 50 }]);
    expect(pushed(game, 'withdrew')).toEqual([{ kind: 'withdrew', amount: 20 }]);
    expect(lines(game)).toContain('The bank turned 40 of treasure into jewel pieces');
    expect(lines(game)).toContain('Put 50 jewel pieces in the bank');
    expect(lines(game)).toContain('Took 20 jewel pieces out of the bank');
  });
});
