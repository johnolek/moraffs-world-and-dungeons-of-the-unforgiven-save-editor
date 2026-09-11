import { describe, expect, it } from 'vitest';
import { bundledMwDungeon } from '../../game/mw-dungeon';
import { attackTiming, monsterKilled, monsterTurn, swing } from '../../game/mw-port/combat';
import {
  armorFind,
  ballOfThought,
  cupOfHealth,
  moneyFind,
  paperFind,
  scrollFind,
  specialFind,
  spellbookFind,
  wandFind,
  weaponFind,
} from '../../game/mw-port/drops';
import { drinkHealingPotion, dropCoins, dropWeapon, takeAPill } from '../../game/mw-port/items';
import { inventoryScreen } from '../../game/mw-port/inventory';
import { die } from '../../game/mw-port/levels';
import { castSpell, explosion, writeScrollOrWand, MW_FROM_SPELLBOOK } from '../../game/mw-port/magic';
import type { MwGame, MwGameOverrides } from '../../game/mw-port/state';
import { newMwGame, mwSetOccupant } from '../../game/mw-port/state';
import type { MwStockedMonster } from '../../game/mw-port/stocking';
import { MONSTER_SLOTS } from '../../game/mw-port/stocking';
import { bank, inn, store, temple } from '../../game/mw-port/town';
import type { Rng } from '../../game/port/rng';
import type { MwGameSession } from './engine';
import { findMwSquare, mwCharacterFile, playingMw, pressMw, settleMw } from './test-engine';
import { moraffsWorldJournal } from './journal';
import { MW_KEY } from './keys';

/**
 * What Moraff's World tells a run's journal, and the words each of those comes out as. Every
 * line of a journal is `moraffsWorldJournal`, so a test that reads the lines a handler left
 * behind checks the numbers on the event and the sentence together.
 */

/** An Rng that hands back the numbers a test names, in order, and then zeroes. */
function scripted(rolls: number[]): Rng {
  let at = 0;
  return { random: () => (at < rolls.length ? rolls[at++] : 0) };
}

/** An Rng whose every roll comes out as high as it can, so a swing lands. */
const highest: Rng = { random: (n) => (n > 1 ? n - 1 : 0) };

/** The events of one kind the game has pushed, oldest first. */
function pushed(game: MwGame, kind: string): unknown[] {
  return game.events.filter((event) => event.kind === kind);
}

/** Everything the game has pushed, in the words a journal reads it out in. */
function lines(game: MwGame): string[] {
  return game.events
    .map((event) => moraffsWorldJournal(event))
    .filter((line): line is string => line !== null);
}

/** A floor with 145 empty slots, `placed` monsters on it and the occupancy grid to match. */
function fightGame(placed: MwStockedMonster[], overrides: MwGameOverrides = {}): MwGame {
  const monsters: MwStockedMonster[] = Array.from({ length: MONSTER_SLOTS }, (unused, slot) => {
    return placed[slot] ?? { x: 100, y: 100, hp: 0, type: 0, depth: 0 };
  });
  const game = newMwGame({ monsters, ...overrides });
  placed.forEach((monster, slot) => mwSetOccupant(game, monster.x, monster.y, slot));
  return game;
}

/** A game with one monster in slot 0 engaged, at the depth the loot rolls read off it. */
function lootGame(depth: number, overrides: MwGameOverrides = {}): MwGame {
  const monster: MwStockedMonster = { x: 5, y: 5, hp: 0, type: 0, depth };
  return newMwGame({ monsters: [monster], engaged: 0, ...overrides });
}

/** A square of the town with nothing on it, so a key is the only thing happening. */
const emptyTown = () =>
  findMwSquare(
    0,
    (square, x, y) =>
      square.n === 3 &&
      square.ladder === 0 &&
      bundledMwDungeon.surface(x, y, 0, 0) === 0 &&
      bundledMwDungeon.trapdoor(x, y, 0, 0) === -1,
  );

/** A character standing on an empty square of the town. */
function inTheTown(overrides: Record<string, unknown> = {}): MwGameSession {
  return playingMw(mwCharacterFile({ floor: 0, dir: 0, ...emptyTown(), ...overrides }));
}

describe('moving about', () => {
  it('says which way a step went', async () => {
    const session = inTheTown();
    await pressMw(session, MW_KEY.arrowUp);
    expect(pushed(session.game, 'stepped')).toEqual([{ kind: 'stepped', dir: 0 }]);
    expect(lines(session.game)).toContain('Stepped north');
  });

  it('says a moment was spent standing still', async () => {
    const session = inTheTown();
    await pressMw(session, MW_KEY.wait);
    expect(pushed(session.game, 'waited')).toEqual([{ kind: 'waited' }]);
    expect(lines(session.game)).toContain('Waited a moment');
  });

  it('says which floor a ladder reached', async () => {
    const where = findMwSquare(3, (square) => square.ladder > 0);
    const ladder = bundledMwDungeon.ladder(where.x, where.y, 3, 0);
    const session = playingMw(mwCharacterFile({ floor: 3, dir: 0, ...where }));
    await pressMw(session, MW_KEY.down);
    expect(pushed(session.game, 'ladderTaken')).toEqual([{ kind: 'ladderTaken', to: 3 + ladder }]);
    expect(lines(session.game)).toContain(`Took the ladder to floor ${3 + ladder}`);
    expect(lines(session.game)).toContain(`Reached floor ${3 + ladder}`);
  });

  it('says which square a trap door stood on and which floor it led to', async () => {
    const door = findMwSquare(
      3,
      (square, x, y) => bundledMwDungeon.trapdoor(x, y, 3, 0) !== -1 && square.ladder === 0,
    );
    const to = bundledMwDungeon.trapdoor(door.x, door.y, 3, 0);
    const trapdoorKeys = Array.from({ length: 20 }, () => 0);
    trapdoorKeys[Math.trunc(to / 10) - 1] = 1;
    const session = playingMw(mwCharacterFile({ floor: 3, dir: 0, ...door, trapdoorKeys }));
    await settleMw();
    await pressMw(session, MW_KEY.trapDoor);
    expect(pushed(session.game, 'trapdoorTaken')).toEqual([
      { kind: 'trapdoorTaken', from: { x: door.x, y: door.y }, to },
    ]);
    expect(lines(session.game)).toContain(
      `Went down the trap door at ${door.x},${door.y} to floor ${to}`,
    );
  });

  it('says which floor a hole came out on', async () => {
    const start = findMwSquare(3, (square) => square.ladder === 0);
    const session = playingMw(mwCharacterFile({ floor: 3, dir: 0, ...start }));
    await pressMw(session, MW_KEY.down);
    await pressMw(session, 0x31);
    if (session.game.screen.some((line) => line.text === 'A MONSTER WANTS TO HELP')) {
      expect(lines(session.game)).toContain('A monster interrupted the digging');
      return;
    }
    await pressMw(session, MW_KEY.escape);
    const landing = session.view().place.floor;
    expect(pushed(session.game, 'dug')).toEqual([{ kind: 'dug', outcome: 'hole', to: landing }]);
    expect(lines(session.game)).toContain(`Dug through the floor to floor ${landing}`);
  });

  it('names the building the town square held', async () => {
    const inn = findMwSquare(
      0,
      (square, x, y) => bundledMwDungeon.surface(x, y, 0, 0) === 4 && square.ladder === 0,
    );
    const session = playingMw(mwCharacterFile({ floor: 0, dir: 0, ...inn }));
    await pressMw(session, MW_KEY.up);
    expect(pushed(session.game, 'buildingEntered')).toEqual([
      { kind: 'buildingEntered', building: 'FLEA BAG INN' },
    ]);
    expect(lines(session.game)).toContain('Went into the FLEA BAG INN');
  });

  it('names the dungeon the gate walked into', async () => {
    const gate = findMwSquare(
      0,
      (square, x, y) => bundledMwDungeon.surface(x, y, 0, 0) === 5 && square.ladder === 0,
    );
    const session = playingMw(mwCharacterFile({ floor: 0, dir: 0, ...gate }));
    await pressMw(session, MW_KEY.up);
    await pressMw(session, 0x31);
    await pressMw(session, 0x35);
    await pressMw(session, 0x0d);
    expect(pushed(session.game, 'dungeonReached')).toEqual([
      { kind: 'dungeonReached', dungeon: 5 },
    ]);
    expect(lines(session.game)).toContain('Walked into Dungeon 5');
    expect(lines(session.game)).toContain('Reached the town');
  });
});

describe('a fight', () => {
  /** Monster type 1 is a WEREWOLF, which neither drains nor breathes nor moves a
   *  characteristic. */
  const WEREWOLF = 1;

  it('says which weapon swung at which monster and what it hit for', () => {
    const game = fightGame([{ x: 5, y: 4, hp: 4000, type: WEREWOLF, depth: 3 }], {
      rng: highest,
      engaged: 0,
      pc: { x: 5, y: 5, floor: 3, weapon: 6, str: 80, luck: 80, lev: 40 },
    });
    swing(game);
    const swung = pushed(game, 'swung') as { damage: number }[];
    expect(swung).toHaveLength(1);
    expect(swung[0]).toMatchObject({
      kind: 'swung',
      weapon: 'LONG SWORD',
      monster: { type: WEREWOLF, level: 3, name: 'WEREWOLF' },
    });
    expect(lines(game)).toContain(
      `Swung the LONG SWORD at a Level 3 WEREWOLF and hit for ${swung[0].damage}`,
    );
  });

  it('says which monster the character came face to face with', () => {
    const game = fightGame([{ x: 5, y: 4, hp: 40, type: WEREWOLF, depth: 7 }], {
      rng: scripted([0, 0]),
      pc: { x: 5, y: 5, floor: 7, dir: 0 },
      wallSide: () => 3,
    });
    attackTiming(game);
    expect(pushed(game, 'met')).toEqual([
      { kind: 'met', monster: { type: WEREWOLF, level: 7, name: 'WEREWOLF' }, slot: 0 },
    ]);
    expect(lines(game)).toContain('Came face to face with a Level 7 WEREWOLF');
  });

  it('says which monster hit the character and for how much', () => {
    const game = fightGame([{ x: 5, y: 4, hp: 40, type: WEREWOLF, depth: 40 }], {
      rng: highest,
      engaged: 0,
      pc: { x: 5, y: 5, floor: 40, hp: 10000, maxHp: 10000, lev: 1 },
    });
    const damage = monsterTurn(game, 0);
    expect(pushed(game, 'hit')).toEqual([
      { kind: 'hit', monster: { type: WEREWOLF, level: 40, name: 'WEREWOLF' }, damage, breath: null },
    ]);
    expect(lines(game)).toContain(`The WEREWOLF hit you for ${damage}`);
  });

  it('names the breath a monster used', () => {
    // Monster 84 is an ORANGE DRAGONFLY, whose row names fire.
    const game = fightGame([{ x: 5, y: 4, hp: 40, type: 84, depth: 30 }], {
      rng: highest,
      engaged: 0,
      pc: { x: 5, y: 5, floor: 30, hp: 10000, maxHp: 10000, lev: 1 },
    });
    const damage = monsterTurn(game, 0);
    expect(pushed(game, 'hit')).toEqual([
      {
        kind: 'hit',
        monster: { type: 84, level: 30, name: 'ORANGE DRAGONFLY' },
        damage,
        breath: 1,
      },
    ]);
    expect(lines(game)).toContain(`The ORANGE DRAGONFLY breathed FIRE on you for ${damage}`);
  });

  it('says what a kill was worth', () => {
    const game = fightGame([{ x: 5, y: 4, hp: 0, type: WEREWOLF, depth: 20 }], {
      rng: scripted([]),
      engaged: 0,
      pc: { x: 5, y: 5, floor: 20, lev: 30, cls: 0 },
    });
    monsterKilled(game, {
      takeWeapon: () => false,
      takeArmor: () => false,
      takeStones: () => 'L',
      enhanceWeapon: () => 0,
    });
    const killed = pushed(game, 'killed') as { experience: number }[];
    expect(killed).toHaveLength(1);
    expect(killed[0]).toMatchObject({
      kind: 'killed',
      monster: { type: WEREWOLF, level: 20, name: 'WEREWOLF' },
    });
    expect(lines(game)).toContain(
      `Killed a Level 20 WEREWOLF for ${killed[0].experience} experience`,
    );
  });

  it('says how many levels a life drainer took', () => {
    // Monster 29 is a WRAITH, whose row takes a level a hit.
    const game = fightGame([{ x: 5, y: 4, hp: 40, type: 29, depth: 60 }], {
      rng: highest,
      engaged: 0,
      pc: { x: 5, y: 5, floor: 60, hp: 10000, maxHp: 10000, lev: 12 },
    });
    monsterTurn(game, 0);
    expect(pushed(game, 'levelLost')).toEqual([
      {
        kind: 'levelLost',
        levels: 1,
        level: 11,
        monster: { type: 29, level: 60, name: 'WRAITH' },
      },
    ]);
    expect(lines(game)).toContain('The WRAITH drained a level, down to level 11');
  });

  it('says which characteristic a puffball moved', () => {
    // Monster 82 is a BLACK PUFFBALL, which drains a point of agility and disappears.
    const game = fightGame([{ x: 5, y: 4, hp: 40, type: 82, depth: 8 }], {
      rng: highest,
      engaged: 0,
      pc: { x: 5, y: 5, floor: 8, str: 30, hp: 100, maxHp: 100 },
    });
    monsterTurn(game, 0);
    const changed = pushed(game, 'statChanged') as { stat: string; by: number }[];
    expect(changed).toHaveLength(1);
    expect(changed[0].by).toBe(-1);
    expect(lines(game)).toContain(
      `The BLACK PUFFBALL drained a point of ${changed[0].stat.toLowerCase()}`,
    );
  });

  it('says which affliction a blow brought with it', () => {
    // Monster 43 is a GIANT BLACK BAT, whose kind byte poisons.
    const game = fightGame([{ x: 5, y: 4, hp: 40, type: 43, depth: 40 }], {
      rng: highest,
      engaged: 0,
      pc: { x: 5, y: 5, floor: 40, hp: 10000, maxHp: 10000, lev: 1 },
    });
    monsterTurn(game, 0);
    expect(pushed(game, 'afflicted')).toEqual([
      {
        kind: 'afflicted',
        what: 'poison',
        monster: { type: 43, level: 40, name: 'GIANT BLACK BAT' },
      },
    ]);
    expect(lines(game)).toContain('The GIANT BLACK BAT poisoned you');
  });

  it('says what killed the character and where', () => {
    const game = fightGame([{ x: 5, y: 4, hp: 40, type: WEREWOLF, depth: 20 }], {
      engaged: 0,
      pc: { x: 5, y: 5, floor: 20, dungeon: 7, hp: -3, returnX: -1 },
    });
    die(game);
    expect(pushed(game, 'died')).toEqual([
      {
        kind: 'died',
        monster: { type: WEREWOLF, level: 20, name: 'WEREWOLF' },
        floor: 20,
        dungeon: 7,
      },
    ]);
    expect(lines(game)).toContain('Died to a Level 20 WEREWOLF on floor 20 of Dungeon 7');
  });

  it('says which town the raise-dead contract woke the character in', () => {
    const game = newMwGame({
      pc: { floor: 30, dungeon: 7, hp: -3, returnX: 4, returnY: 9, returnDungeon: 7 },
    });
    die(game);
    expect(pushed(game, 'raised')).toEqual([{ kind: 'raised', dungeon: 7 }]);
    expect(lines(game)).toContain('Raised from the dead in the town of Dungeon 7');
  });
});

describe('spells and what they do', () => {
  it('names the wand a spell wrote and its charges', () => {
    const game = newMwGame({ chooseSpellToWrite: () => ({ category: 2, level: 4, slot: 1 }) });
    writeScrollOrWand(game, 8, 2);
    expect(pushed(game, 'wandMade')).toEqual([
      { kind: 'wandMade', spell: { type: 2, level: 4, slot: 1 }, charges: 5 },
    ]);
    expect(lines(game)).toContain('Wrote a wand of PROTECTION with 5 charges');
  });

  it('names the scroll a spell wrote', () => {
    const game = newMwGame({ chooseSpellToWrite: () => ({ category: 1, level: 0, slot: 2 }) });
    writeScrollOrWand(game, 3, 1);
    expect(pushed(game, 'scrollWritten')).toEqual([
      { kind: 'scrollWritten', spell: { type: 1, level: 0, slot: 2 } },
    ]);
    expect(lines(game)).toContain('Wrote a scroll of LITTLE CURE');
  });

  it('says what a battle spell hit the monster for', () => {
    const game = fightGame([{ x: 5, y: 4, hp: 4000, type: 1, depth: 12 }], {
      rng: scripted([40]),
      engaged: 0,
      pc: { x: 5, y: 5, floor: 12 },
    });
    explosion(game, 0);
    expect(pushed(game, 'spellDamaged')).toEqual([
      { kind: 'spellDamaged', monster: { type: 1, level: 12, name: 'WEREWOLF' }, damage: 115 },
    ]);
    expect(lines(game)).toContain('The spell hit a Level 12 WEREWOLF for 115');
  });

  it('reads the cast out before what the spell did, the way it happened', () => {
    const game = fightGame([{ x: 5, y: 4, hp: 4000, type: 1, depth: 12 }], {
      rng: scripted([40]),
      engaged: 0,
      pc: { x: 5, y: 5, floor: 12, cls: 3, sp: 20, maxSp: 20 },
    });
    // Minor Explosion, the first slot of the wizard list's fifth line.
    castSpell(game, MW_FROM_SPELLBOOK, 2, 4, 0);
    expect(lines(game)).toEqual([
      'Cast MINOR EXPLOSION from spell points',
      'The spell hit a Level 12 WEREWOLF for 115',
    ]);
  });
});

describe('what a kill turns up', () => {
  it('names the weapon that was taken', () => {
    const game = lootGame(40, { rng: scripted([0, 49]) });
    weaponFind(game, () => true);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'weapon', item: 'STICK' } },
    ]);
    expect(lines(game)).toContain('Found a STICK');
  });

  it('names the suit of armor that was taken', () => {
    const game = lootGame(40, { rng: scripted([0, 0]) });
    armorFind(game, () => true);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'armour', item: 'LEATHER' } },
    ]);
    expect(lines(game)).toContain('Found a suit of LEATHER armor');
  });

  it('says what the pile of stones came to in jewels', () => {
    // One copper pile of 4 * 100 + 0, and nothing else.
    const rolls = [0, 0, 100, 4, 0, 1, 1, 1, 1, 1, 1249];
    const game = lootGame(10, {
      rng: scripted(rolls),
      pc: { floor: 20, weight: 100, loadedWeight: 100 },
    });
    moneyFind(game, () => 'A');
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'money', amount: 2 } },
    ]);
    expect(lines(game)).toContain('Found a pile of stones worth 2 jewels');
  });

  it('names the spell a spellbook teaches', () => {
    const game = newMwGame({ rng: scripted([4, 2, 1]), pc: { cls: 3, floor: 30 } });
    spellbookFind(game);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'spellbook', spell: { type: 2, level: 4, slot: 1 } } },
    ]);
    expect(lines(game)).toContain('Found a spellbook: PROTECTION');
  });

  it('names the spell a scroll holds', () => {
    const game = newMwGame({ rng: scripted([15, 2, 1, 0]), pc: { cls: 3, floor: 30 } });
    scrollFind(game);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'scroll', spell: { type: 1, level: 2, slot: 0 } } },
    ]);
    expect(lines(game)).toContain('Found a scroll of CURE');
  });

  it('names the spell a wand holds and how many charges it came with', () => {
    const game = newMwGame({ rng: scripted([0, 0, 0, 0, 4]), pc: { cls: 1, floor: 120 } });
    wandFind(game);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'wand', spell: { type: 1, level: 0, slot: 0 }, charges: 6 } },
    ]);
    expect(lines(game)).toContain('Found a wand of ENCHANT ARMOR LEVEL 1 with 6 charges');
  });

  it('names the spell a sheet of paper holds', () => {
    const game = newMwGame({ rng: scripted([0, 0, 3, 2]), pc: { cls: 0, floor: 80 } });
    paperFind(game);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'paper', spell: { type: 3, level: 0, slot: 2 } } },
    ]);
    expect(lines(game)).toContain('Found a sheet of spell paper for STRENGTH');
  });

  it('names the special item that was found', () => {
    const game = newMwGame({ rng: scripted([5]), pc: { cls: 0 } });
    specialFind(game);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'item', item: 'RING OF REGENERATION' } },
    ]);
    expect(lines(game)).toContain('Found a RING OF REGENERATION');
  });

  it('says what the cup of health gave back', () => {
    const game = newMwGame({ rng: scripted([0, 5]), pc: { hp: 10, maxHp: 100 } });
    cupOfHealth(game);
    expect(pushed(game, 'cupOfHealth')).toEqual([{ kind: 'cupOfHealth', healed: 8 }]);
    expect(lines(game)).toContain('Drank a cup of health and got 8 hit points back');
  });

  it('reports the shimmering ball of thought', () => {
    const game = newMwGame({ rng: scripted([0]), pc: { cls: 3, sp: 4, maxSp: 12 } });
    ballOfThought(game);
    expect(pushed(game, 'ballOfThought')).toEqual([{ kind: 'ballOfThought' }]);
    expect(lines(game)).toContain('Found a shimmering ball of thought, and a spell point back');
  });

  it('names the pill and the trap door key a level drainer left', () => {
    // Monster 29 is a WRAITH, which is a level drainer; the rolls hand over a green pill.
    const game = fightGame([{ x: 5, y: 4, hp: 0, type: 29, depth: 20 }], {
      rng: scripted([0, 1]),
      engaged: 0,
      pc: { x: 5, y: 5, floor: 20, lev: 30, cls: 0 },
    });
    monsterKilled(game, {
      takeWeapon: () => false,
      takeArmor: () => false,
      takeStones: () => 'L',
      enhanceWeapon: () => 0,
    });
    expect(pushed(game, 'pillFound')).toEqual([{ kind: 'pillFound', colour: 'GREEN' }]);
    expect(lines(game)).toContain('Found a green pill');
    expect(lines(game)).toContain('Found the trap door key labelled 20');
  });

  it('says which quest boss was beaten and what its item put a plus on', () => {
    // Monster 104 is the SHADOW DRAGONFLY, the first of the eight, which gives body armor.
    const game = fightGame([{ x: 5, y: 4, hp: 0, type: 104, depth: 4 }], {
      rng: scripted([]),
      engaged: 0,
      pc: { x: 5, y: 5, floor: 4, lev: 30, cls: 0 },
    });
    monsterKilled(game, {
      takeWeapon: () => false,
      takeArmor: () => false,
      takeStones: () => 'L',
      enhanceWeapon: () => 0,
    });
    expect(pushed(game, 'gearEnhanced')).toEqual([
      { kind: 'gearEnhanced', what: 'bodyArmor', item: null, plus: 9 },
    ]);
    expect(lines(game)).toContain('Beat the quest boss SHADOW DRAGONFLY');
    expect(lines(game)).toContain('Put on plus 9 body armor');
  });
});

describe('what the character carries', () => {
  it('names the pill that was swallowed', () => {
    const game = newMwGame({ pc: { pills: [0, 0, 0, 2, 0, 0], con: 20, wis: 20 } });
    takeAPill(game, 4);
    expect(pushed(game, 'itemUsed')).toEqual([{ kind: 'itemUsed', item: 'RED PILL' }]);
    expect(lines(game)).toContain('Used the RED PILL');
  });

  it('names the magic item that was used', () => {
    const game = newMwGame({ pc: { healingPotions: 1, hp: 10, maxHp: 60 } });
    drinkHealingPotion(game);
    expect(pushed(game, 'itemUsed')).toEqual([
      { kind: 'itemUsed', item: 'POTION OF HEALING' },
    ]);
    expect(lines(game)).toContain('Used the POTION OF HEALING');
  });

  it('names what was thrown away', () => {
    const game = newMwGame({ pc: { weaponsOwned: [1, 0, 2, 0, 0, 0, 0, 0] } });
    dropWeapon(game, 3);
    expect(pushed(game, 'dropped')).toEqual([
      { kind: 'dropped', what: 'weapon', item: 'CLUB' },
    ]);
    expect(lines(game)).toContain('Dropped the CLUB');
  });

  it('says how many stones went on the floor', () => {
    const game = newMwGame({ pc: { stones: [1200, 0, 0, 0, 0, 0] } });
    dropCoins(game, 1);
    expect(pushed(game, 'dropped')).toEqual([
      { kind: 'dropped', what: 'money', amount: 1200 },
    ]);
    expect(lines(game)).toContain('Threw away 1200 stones');
  });

  it('names the weapon taken up and the armor put on', async () => {
    const session = inTheTown({
      cls: 0,
      weaponsOwned: [1, 1, 0, 0, 0, 0, 0, 0],
      armorOwned: [1, 1, 0, 0, 0, 0, 0, 0],
    });
    await pressMw(session, MW_KEY.weapon);
    await pressMw(session, 0x32);
    await pressMw(session, MW_KEY.armor);
    await pressMw(session, 0x32);
    expect(pushed(session.game, 'gearSwitched')).toEqual([
      { kind: 'gearSwitched', what: 'weapon', item: 'STICK' },
      { kind: 'gearSwitched', what: 'armour', item: 'LEATHER' },
    ]);
    expect(lines(session.game)).toContain('Took up the STICK');
    expect(lines(session.game)).toContain('Put on LEATHER armor');
  });

  it('says which page of the pockets was read', () => {
    const game = newMwGame();
    inventoryScreen(game, 0x33);
    expect(pushed(game, 'pocketsRead')).toEqual([{ kind: 'pocketsRead', page: 3 }]);
    expect(lines(game)).toContain('Looked through the wands in the pockets');
  });
});

describe('the town', () => {
  it('says what was bought at the store and what it cost', () => {
    const game = newMwGame({ pc: { money: 400 } });
    store(game, 1, 3);
    expect(pushed(game, 'coinsSpent')).toEqual([
      { kind: 'coinsSpent', amount: 300, on: 'MACE', where: 'STORE' },
    ]);
    expect(lines(game)).toContain("Bought MACE at the STORE for 300 jewels");
  });

  it('names the temple cure that was paid for', () => {
    const game = newMwGame({ pc: { money: 400, hp: 10, maxHp: 60 } });
    temple(game, 1);
    expect(pushed(game, 'coinsSpent')).toEqual([
      { kind: 'coinsSpent', amount: 30, on: 'CURE WOUNDS', where: 'TEMPLE' },
    ]);
    expect(lines(game)).toContain('Bought CURE WOUNDS at the TEMPLE for 30 jewels');
  });

  it('reports the raise-dead contract, which is free', () => {
    const game = newMwGame({ pc: { money: 400, x: 12, y: 34, dungeon: 9 } });
    temple(game, 6);
    expect(pushed(game, 'coinsSpent')).toEqual([]);
    expect(pushed(game, 'contractSigned')).toEqual([
      { kind: 'contractSigned', dungeon: 9, x: 12, y: 34 },
    ]);
    expect(lines(game)).toContain('Signed a raise-dead contract for 12,34 in Dungeon 9');
  });

  it('says what a night at the inn cost and the levels it handed over', () => {
    const game = newMwGame({
      rng: { random: () => 0 },
      pc: { cls: 0, money: 20, lev: 0, exp: 250, hp: 10, maxHp: 10 },
    });
    inn(game, true);
    expect(pushed(game, 'coinsSpent')).toEqual([
      { kind: 'coinsSpent', amount: 10, on: 'A NIGHT', where: 'FLEA BAG INN' },
    ]);
    expect(lines(game)).toContain('Bought A NIGHT at the FLEA BAG INN for 10 jewels');
    expect(lines(game)).toContain('Gained 3 levels at the inn: now level 3');
  });

  it('says what went into and came out of the bank', () => {
    const game = newMwGame({ pc: { money: 500, bank: 0 } });
    bank(game, 2, 300);
    bank(game, 3, 100);
    expect(pushed(game, 'deposited')).toEqual([{ kind: 'deposited', amount: 300 }]);
    expect(pushed(game, 'withdrew')).toEqual([{ kind: 'withdrew', amount: 100 }]);
    expect(lines(game)).toContain('Put 300 jewels in the bank');
    expect(lines(game)).toContain('Took 100 jewels out of the bank');
  });

  it('says what the bank turned the stones into', () => {
    const game = newMwGame({ pc: { stones: [400, 0, 0, 0, 2, 3] } });
    bank(game, 1);
    expect(pushed(game, 'stonesConverted')).toEqual([{ kind: 'stonesConverted', jewels: 15 }]);
    expect(lines(game)).toContain('Changed the stones into 15 jewels at the bank');
  });
});
