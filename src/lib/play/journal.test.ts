import { describe, expect, it } from 'vitest';
import { bundledDungeon } from '../game/dungeon';
import { defend } from '../game/port/combat';
import {
  dropMoney,
  dropPaper,
  dropScroll,
  dropSpellbook,
  dropWand,
  dropWeapon,
  findItem,
  loseItem,
  useMagicItem,
} from '../game/port/drops';
import { magicZap, writeScrollOrWand } from '../game/port/magic';
import type { Rng } from '../game/port/rng';
import { BorlandRng } from '../game/port/rng';
import type { Game, MonsterKind, PlayerCharacter } from '../game/port/state';
import { MAP_PLAYER, newGame, setMonsterMap } from '../game/port/state';
import { drainerBonus, killMonster, playerDies } from '../game/port/kills';
import {
  bankDeposit,
  bankWithdraw,
  buyWeapon,
  convertDollars,
  stayTheNight,
  temple,
} from '../game/port/town';
import { castSpell, spellIndex, CAST_SPELLBOOK } from '../game/port/inventory';
import { hintOnFloor } from './arrival';
import {
  characterFile,
  facingAMonster,
  findSquare,
  innSquare,
  inTheTown,
  press,
  settle,
  standingOn,
  startPlaying,
  teleporterSquare,
} from './battle.test-support';
import { unforgivenJournal } from './journal';
import { KEY } from './keys';

/**
 * What Dungeons of the Unforgiven tells a run's journal, and the words each of those comes out
 * as. Every line of a journal is `unforgivenJournal`, so a test that reads the lines a handler
 * left behind checks the numbers on the event and the sentence together.
 */

/** A generator that rolls the lowest number it can, so a key's own answer is the only thing
 *  moving. */
const lowest: Rng = { random: () => 0 };

/** An {@link Rng} that hands back the numbers it is given, in order, and 0 once they run out. */
function rolls(...values: number[]): Rng {
  let at = 0;
  return { random: () => (at < values.length ? values[at++] : 0) };
}

/** The events of one kind the game has pushed, oldest first. */
function pushed(game: Game, kind: string): unknown[] {
  return game.events.filter((event) => event.kind === kind);
}

/** Everything the game has pushed, in the words a journal reads it out in. */
function lines(game: Game): string[] {
  return game.events
    .map((event) => unforgivenJournal(event))
    .filter((line): line is string => line !== null);
}

/** Monster kind 23 is Gargalon, one of section 1's ordinary monsters and not a level drainer. */
const REGULAR = 23;

/** A character with a monster standing beside them, engaged, with nothing else on the floor. */
function fighting(
  rng: Rng,
  pc: Partial<PlayerCharacter> = {},
  kind: Partial<MonsterKind> = {},
): Game {
  const game = newGame({ rng, pc: { hp: 100000, maxHp: 100000, ...pc } });
  Object.assign(game.monsters[0], { x: game.pc.x, y: game.pc.y - 1, hp: 500, type: REGULAR, level: 40 });
  setMonsterMap(game, game.pc.x, game.pc.y, MAP_PLAYER);
  setMonsterMap(game, game.monsters[0].x, game.monsters[0].y, 0);
  game.monsterKinds[REGULAR] = { ...game.monsterKinds[REGULAR], ...kind };
  game.engaged = 0;
  return game;
}

/** The name every battle message calls the monster these tests fight. */
function gargalon(game: Game): string {
  return game.monsterKinds[REGULAR].name;
}

describe('moving about', () => {
  it('says which way a step went', async () => {
    const session = inTheTown(lowest);
    await press(session, KEY.arrowUp);
    expect(pushed(session.game, 'stepped')).toEqual([{ kind: 'stepped', dir: 0 }]);
    expect(lines(session.game)).toContain('Stepped north');
  });

  it('says a moment was spent standing still', async () => {
    const session = inTheTown(lowest);
    await press(session, KEY.enter);
    expect(pushed(session.game, 'waited')).toEqual([{ kind: 'waited' }]);
    expect(lines(session.game)).toContain('Waited a moment');
  });

  it('says which floor a ladder reached', async () => {
    const where = findSquare(2, (square) => square.ladder > 0);
    const ladder = bundledDungeon.ladder(where.x, where.y, 2, 0);
    const session = standingOn(2, where);
    await press(session, KEY.down);
    expect(pushed(session.game, 'ladderTaken')).toEqual([{ kind: 'ladderTaken', to: 2 + ladder }]);
    expect(lines(session.game)).toContain(`Took the ladder to floor ${2 + ladder}`);
    expect(lines(session.game)).toContain(`Reached floor ${2 + ladder}`);
  });

  it('says which square a trap door stood on and which floor it led to', async () => {
    const door = findSquare(3, (square) => square.trapdoor >= 0 && square.ladder === 0);
    const to = bundledDungeon.trapdoor(door.x, door.y, 3, 0);
    const keys = Array.from({ length: 36 }, () => 0);
    keys[Math.trunc(to / 5)] = 1;
    const session = standingOn(3, door, { keys });
    await press(session, KEY.trapDoor);
    expect(pushed(session.game, 'trapdoorTaken')).toEqual([
      { kind: 'trapdoorTaken', from: { x: door.x, y: door.y }, to },
    ]);
    expect(lines(session.game)).toContain(`Went down the trap door at ${door.x},${door.y} to floor ${to}`);
  });

  it('says which square a chute stood on and which floor it dropped to', async () => {
    const where = findSquare(
      3,
      (square, x, y) => square.ladder === 0 && bundledDungeon.chute(x, y, 3, 0) !== 3,
    );
    const to = bundledDungeon.chute(where.x, where.y, 3, 0);
    const session = standingOn(3, where);
    await settle();
    expect(pushed(session.game, 'chuteTaken')).toEqual([
      { kind: 'chuteTaken', from: { x: where.x, y: where.y }, to },
    ]);
    expect(lines(session.game)).toContain(`Fell down the chute at ${where.x},${where.y} to floor ${to}`);
  });

  it('says which floor a hole came out on', async () => {
    const where = findSquare(
      3,
      (square) => square.ladder === 0 && square.chute === 0 && square.trapdoor === -1,
    );
    const session = startPlaying(characterFile({ level: 3, dir: 0, ...where, cls: 3 }), new BorlandRng(3));
    await press(session, KEY.dig);
    await press(session, 0x31);
    // A monster that reached the character stops the dig before it has gone anywhere.
    if (pushed(session.game, 'dug').length > 0) {
      expect(pushed(session.game, 'dug')).toEqual([{ kind: 'dug', outcome: 'interrupted' }]);
      expect(lines(session.game)).toContain('A monster interrupted the digging');
      return;
    }
    // print_menu_only waits for a key with the hole already dug under the character's feet.
    await press(session, KEY.escape);
    const floor = session.view().place.floor;
    expect(pushed(session.game, 'dug')).toEqual([{ kind: 'dug', outcome: 'hole', to: floor }]);
    expect(lines(session.game)).toContain(`Dug through the floor to floor ${floor}`);
  });

  it('names the building the town square held', async () => {
    const session = standingOn(0, innSquare(), { money: 100 });
    await press(session, KEY.up);
    expect(pushed(session.game, 'buildingEntered')).toEqual([
      { kind: 'buildingEntered', building: 'HOLE' },
    ]);
    expect(lines(session.game)).toContain('Went into the HOLE');
  });

  it('names the module the teleporter led to', async () => {
    const session = standingOn(0, teleporterSquare());
    await press(session, KEY.arrowUp);
    await press(session, KEY.enter);
    expect(pushed(session.game, 'dungeonReached')).toEqual([
      { kind: 'dungeonReached', dungeon: 1 },
    ]);
    expect(lines(session.game)).toContain('Arrived in Module II');
  });

  it('says which section a floor belonged to when it is a new one', async () => {
    const where = findSquare(6, (square) => square.ladder < 0);
    const session = standingOn(6, where);
    await press(session, KEY.up);
    expect(pushed(session.game, 'sectionReached')).toEqual([{ kind: 'sectionReached', section: 0 }]);
    expect(lines(session.game)).toContain('Reached section 1');
  });
});

describe('a fight', () => {
  it('says which weapon swung at which monster and what it hit for', async () => {
    const session = await facingAMonster(lowest, { weapon: 5 });
    const name = session.game.monsterKinds[session.game.monsters[0].type].name;
    await press(session, KEY.fight);
    expect(pushed(session.game, 'swung')).toEqual([
      {
        kind: 'swung',
        weapon: 'SHORTSWORD',
        monster: { type: 0, level: 1, name },
        damage: 0,
      },
    ]);
    expect(lines(session.game)).toContain(`Swung the SHORTSWORD at a Level 1 ${name} and missed`);
  });

  it('says which monster the character came face to face with', async () => {
    const session = await facingAMonster(lowest);
    const name = session.game.monsterKinds[session.game.monsters[0].type].name;
    expect(pushed(session.game, 'met')).toEqual([
      { kind: 'met', monster: { type: 0, level: 1, name }, slot: 0 },
    ]);
    expect(lines(session.game)).toContain(`Came face to face with a Level 1 ${name}`);
  });

  it('says which monster hit the character and for how much', () => {
    const game = fighting(new BorlandRng(2), { lev: 1, dex: 1, luck: 0 });
    let damage = 0;
    while (damage === 0) {
      game.events.length = 0;
      damage = defend(game, 0);
    }
    expect(pushed(game, 'hit')).toEqual([
      { kind: 'hit', monster: { type: REGULAR, level: 40, name: gargalon(game) }, damage, breath: null },
    ]);
    expect(lines(game)).toContain(`The ${gargalon(game)} hit you for ${damage}`);
  });

  it('names the breath a monster used', () => {
    const game = fighting(new BorlandRng(2), { lev: 1, dex: 1, luck: 0 }, { breath: 1 });
    let breathed = game.events.length;
    while (breathed === 0 || pushed(game, 'hit').length === 0) {
      game.events.length = 0;
      defend(game, 0);
      breathed = pushed(game, 'hit').filter((event) => (event as { breath: number | null }).breath === 1).length;
    }
    const hit = pushed(game, 'hit')[0] as { damage: number; breath: number };
    expect(hit.breath).toBe(1);
    expect(lines(game)).toContain(`The ${gargalon(game)} breathed FIRE on you for ${hit.damage}`);
  });

  it('says what a kill was worth', async () => {
    const game = fighting(rolls(), { cls: 2 }, {});
    game.monsters[0].hp = 0;
    const experience = Math.trunc(game.monsterKinds[REGULAR].expMult * 0);
    void experience;
    await killMonster(game);
    const killed = pushed(game, 'killed')[0] as { experience: number };
    expect(killed).toMatchObject({
      kind: 'killed',
      monster: { type: REGULAR, level: 40, name: gargalon(game) },
    });
    expect(killed.experience).toBeGreaterThan(0);
    expect(lines(game)).toContain(
      `Killed a Level 40 ${gargalon(game)} for ${killed.experience} experience`,
    );
  });

  it('says how many levels a life drainer took', () => {
    const game = fighting(new BorlandRng(4), { lev: 20, dex: 1, luck: 0 }, { levelDrain: 2 });
    while (pushed(game, 'levelLost').length === 0) {
      game.events.length = 0;
      game.pc.lev = 20;
      defend(game, 0);
    }
    expect(pushed(game, 'levelLost')).toEqual([
      { kind: 'levelLost', levels: 2, level: 18, monster: { type: REGULAR, level: 40, name: gargalon(game) } },
    ]);
    expect(lines(game)).toContain(`The ${gargalon(game)} drained 2 levels, down to level 18`);
  });

  it('says how much experience a drainer took', () => {
    const game = fighting(new BorlandRng(4), { lev: 20, dex: 1, luck: 0, exp: 1000 }, { levelDrain: -30 });
    while (pushed(game, 'experienceDrained').length === 0) {
      game.events.length = 0;
      defend(game, 0);
    }
    expect(pushed(game, 'experienceDrained')).toEqual([
      { kind: 'experienceDrained', experience: 30, monster: { type: REGULAR, level: 40, name: gargalon(game) } },
    ]);
    expect(lines(game)).toContain(`The ${gargalon(game)} drained 30 experience`);
  });

  it('says what killed the character', () => {
    const game = fighting(rolls());
    playerDies(game);
    expect(pushed(game, 'died')).toEqual([
      {
        kind: 'died',
        monster: { type: REGULAR, level: 40, name: gargalon(game) },
        floor: game.pc.level,
        dungeon: game.pc.module,
      },
    ]);
    expect(lines(game)).toContain(
      `Died to a Level 40 ${gargalon(game)} on floor ${game.pc.level} of Module I`,
    );
  });
});

describe('spells and what they write', () => {
  it('says what a battle spell hit the monster for', () => {
    const game = fighting(rolls(), { lev: 20 });
    expect(magicZap(game)).toBe(true);
    expect(pushed(game, 'spellDamaged')).toEqual([
      { kind: 'spellDamaged', monster: { type: REGULAR, level: 40, name: gargalon(game) }, damage: 42 },
    ]);
    expect(lines(game)).toContain(`The spell hit a Level 40 ${gargalon(game)} for 42`);
  });

  it('reads the cast out before what the spell did, the way it happened', () => {
    const game = fighting(rolls(), { lev: 20, cls: 3, sp: 20, maxSp: 20 });
    game.pc.spellbook[spellIndex(2, 0, 1)] = 1;
    castSpell(game, CAST_SPELLBOOK, 2, 0, 1);
    expect(lines(game)).toEqual([
      'Cast MAGIC ZAP from spell points',
      `The spell hit a Level 40 ${gargalon(game)} for 42`,
    ]);
  });

  it('names the wand a spell wrote and its charges', () => {
    const game = newGame({ rng: rolls(), chooseSpell: () => ({ type: 2, level: 2, slot: 0 }) });
    expect(writeScrollOrWand(game, 10, 2)).toBe(true);
    expect(pushed(game, 'wandMade')).toEqual([
      { kind: 'wandMade', spell: { type: 2, level: 2, slot: 0 }, charges: 5 },
    ]);
    expect(lines(game)).toContain('Wrote a wand of LIGHTNING with 5 charges');
  });

  it('names the scroll a spell wrote', () => {
    const game = newGame({ rng: rolls(), chooseSpell: () => ({ type: 2, level: 2, slot: 0 }) });
    expect(writeScrollOrWand(game, 10, 1)).toBe(true);
    expect(pushed(game, 'scrollWritten')).toEqual([
      { kind: 'scrollWritten', spell: { type: 2, level: 2, slot: 0 } },
    ]);
    expect(lines(game)).toContain('Wrote a scroll of LIGHTNING');
  });
});

describe('what a kill turns up', () => {
  it('names the spell a spellbook teaches', () => {
    const game = newGame({ rng: rolls(0, 0, 0, 0), pc: { cls: 3, level: 30, spellbook: Array.from({ length: 180 }, () => 0) } });
    expect(dropSpellbook(game)).toBe(true);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'spellbook', spell: { type: 0, level: 0, slot: 0 } } },
    ]);
    expect(lines(game)).toContain('Found a spellbook: ENCHANT WEAPON LEVEL 1');
  });

  it('names the spell a wand holds and how many charges it came with', () => {
    const game = newGame({ rng: rolls(0, 0, 1, 2, 3), pc: { cls: 3, level: 40 } });
    dropWand(game);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'wand', spell: { type: 2, level: 0, slot: 2 }, charges: 5 } },
    ]);
    expect(lines(game)).toContain('Found a wand of MINOR PROTECTION with 5 charges');
  });

  it('names the weapon that was taken', async () => {
    const game = newGame({ rng: rolls(2, 0), pc: { cls: 0, level: 40 }, choice: async () => 0x31 });
    game.monsters[0].level = 40;
    game.engaged = 0;
    await dropWeapon(game);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'weapon', item: 'MACE' } },
    ]);
    expect(lines(game)).toContain('Found a MACE');
  });

  it('names the spell a scroll holds', () => {
    const game = newGame({ rng: rolls(0, 0, 2, 1), pc: { cls: 3, level: 40 } });
    dropScroll(game);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'scroll', spell: { type: 2, level: 0, slot: 1 } } },
    ]);
    expect(lines(game)).toContain('Found a scroll of MAGIC ZAP');
  });

  it('names the spell a sheet of paper holds', () => {
    const game = newGame({ rng: rolls(0, 0, 2, 1), pc: { cls: 3, level: 40 } });
    dropPaper(game);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'paper', spell: { type: 2, level: 0, slot: 1 } } },
    ]);
    expect(lines(game)).toContain('Found a sheet of paper for MAGIC ZAP');
  });

  it('names the magic item that was found', () => {
    const game = newGame({ rng: rolls(0), pc: { cls: 0 } });
    findItem(game);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'item', item: 'NUCLEAR HAND GRENADE' } },
    ]);
    expect(lines(game)).toContain('Found a NUCLEAR HAND GRENADE');
  });

  it('names the potion a level drainer left', () => {
    const game = newGame({ rng: rolls(0, 1), pc: { level: 40 } });
    drainerBonus(game);
    expect(pushed(game, 'found')).toEqual([
      { kind: 'found', find: { what: 'potion', item: 'GREEN POTION' } },
    ]);
    expect(lines(game)).toContain('Found a GREEN POTION');
  });

  it('says which trap door key a level drainer left', () => {
    const keys = Array.from({ length: 36 }, () => 0);
    const game = newGame({ rng: rolls(374), pc: { level: 40, keys } });
    drainerBonus(game);
    expect(pushed(game, 'found')).toEqual([{ kind: 'found', find: { what: 'key', key: 40 } }]);
    expect(lines(game)).toContain('Found the trap door key labelled 40');
  });

  it('says how much money was found', () => {
    const game = newGame({ rng: rolls(3, 3, 3), pc: { level: 10, cls: 0, hard: 1, dollars: 0 } });
    dropMoney(game);
    const found = pushed(game, 'found')[0] as { find: { amount: number } };
    expect(found.find.amount).toBe(game.pc.dollars);
    expect(lines(game)).toContain(`Found ${game.pc.dollars} Greater-American Dollars`);
  });
});

describe('what the character carries', () => {
  it('names the magic item that was used', async () => {
    const game = newGame({ rng: rolls(), pc: { healingPotions: 1, hp: 1, maxHp: 100 }, choice: async () => 0x32 });
    await useMagicItem(game);
    expect(pushed(game, 'itemUsed')).toEqual([{ kind: 'itemUsed', item: 'POTION OF HEALING' }]);
    expect(lines(game)).toContain('Used the POTION OF HEALING');
  });

  it('names the potion that was drunk', async () => {
    const potions = Array.from({ length: 6 }, () => 0);
    potions[1] = 1;
    const session = inTheTown(lowest, { potions });
    await press(session, KEY.useItem);
    await press(session, 0x34);
    await press(session, 0x31);
    expect(pushed(session.game, 'itemUsed')).toEqual([
      { kind: 'itemUsed', item: 'GREEN POTION' },
    ]);
    expect(lines(session.game)).toContain('Used the GREEN POTION');
  });

  it('says how much money was thrown away', async () => {
    const answers = [0x33, 0x31];
    const game = newGame({ rng: rolls(), pc: { money: 1200 }, choice: async () => answers.shift() ?? 0x1b });
    await loseItem(game);
    expect(pushed(game, 'dropped')).toEqual([{ kind: 'dropped', what: 'money', amount: 1200 }]);
    expect(lines(game)).toContain('Threw away 1200 rubles');
  });

  it('names what was thrown away', async () => {
    const owned = Array.from({ length: 8 }, () => 0);
    owned[3] = 1;
    const answers = [0x32, 0x34];
    const game = newGame({ rng: rolls(), pc: { weaponsOwned: owned }, choice: async () => answers.shift() ?? 0x1b });
    await loseItem(game);
    expect(pushed(game, 'dropped')).toEqual([{ kind: 'dropped', what: 'weapon', item: 'MACE' }]);
    expect(lines(game)).toContain('Dropped the MACE');
  });

  it('names the weapon taken up', async () => {
    const owned = Array.from({ length: 8 }, () => 0);
    owned[6] = 1;
    const session = inTheTown(lowest, { cls: 0, weaponsOwned: owned });
    await press(session, KEY.weapon);
    await press(session, 0x37);
    expect(pushed(session.game, 'gearSwitched')).toEqual([
      { kind: 'gearSwitched', what: 'weapon', item: 'LONG SWORD' },
    ]);
    expect(lines(session.game)).toContain('Took up the LONG SWORD');
  });

  it('names the armour put on', async () => {
    const owned = Array.from({ length: 8 }, () => 0);
    owned[2] = 1;
    const session = inTheTown(lowest, { cls: 0, armorOwned: owned });
    await press(session, KEY.armor);
    await press(session, 0x33);
    expect(pushed(session.game, 'gearSwitched')).toEqual([
      { kind: 'gearSwitched', what: 'armour', item: 'CHAIN' },
    ]);
    expect(lines(session.game)).toContain('Put on CHAIN armour');
  });
});

describe('the end of the game', () => {
  it('says which section boss was beaten and that the game was won', async () => {
    const owned = Array.from({ length: 8 }, () => 1);
    const game = fighting(rolls(), { cls: 2, level: 100, module: 4, weaponsOwned: owned });
    Object.assign(game.monsters[0], { type: 22, hp: 0 });
    // The Shadow Ogeroth's orb asks which weapon to put its plus on, off a menu of what the
    // character owns.
    game.choice = async () => 0x31;
    await killMonster(game);
    expect(pushed(game, 'bossKilled')).toEqual([{ kind: 'bossKilled', boss: 19 }]);
    expect(pushed(game, 'gameWon')).toEqual([{ kind: 'gameWon' }]);
    expect(lines(game)).toContain('Beat the Shadow boss of section 20');
    expect(lines(game)).toContain('Beat the Shadow Ogeroth and won the game');
  });
});

describe('the town', () => {
  it('says what was bought at the store and what it cost', () => {
    const game = newGame({ rng: rolls(), pc: { money: 1000, level: 0 } });
    buyWeapon(game, 3);
    expect(pushed(game, 'coinsSpent')).toEqual([
      { kind: 'coinsSpent', amount: 300, on: 'MACE', where: 'STORE' },
    ]);
    expect(lines(game)).toContain('Bought MACE at the STORE for 300 rubles');
  });

  it('names the temple spell that was paid for', () => {
    const game = newGame({ rng: rolls(), pc: { money: 1000, level: 0, hp: 1, maxHp: 100 } });
    temple(game, 4);
    expect(pushed(game, 'coinsSpent')).toEqual([
      { kind: 'coinsSpent', amount: 300, on: 'CURE POISON', where: 'TEMPLE' },
    ]);
    expect(lines(game)).toContain('Bought CURE POISON at the TEMPLE for 300 rubles');
  });

  it('says what a night at the inn cost and the levels it handed over', () => {
    const game = newGame({
      rng: rolls(),
      pc: { cls: 0, lev: 1, level: 0, money: 100000, cultureStock: 100, crystals: 100, exp: 250 * 1.4 ** 3 - 80, hp: 100, maxHp: 100 },
    });
    stayTheNight(game);
    expect(pushed(game, 'coinsSpent')).toEqual([
      { kind: 'coinsSpent', amount: 11, on: 'A ROOM', where: 'HOLE' },
    ]);
    expect(lines(game)).toContain('Bought A ROOM at the HOLE for 11 rubles');
    expect(lines(game)).toContain('Gained 4 levels at the inn: now level 5');
  });

  it('says what went into and came out of the bank', () => {
    const game = newGame({ rng: rolls(), pc: { money: 500, bank: 0, level: 0 } });
    bankDeposit(game, 400);
    bankWithdraw(game, 150);
    expect(pushed(game, 'deposited')).toEqual([{ kind: 'deposited', amount: 400 }]);
    expect(pushed(game, 'withdrew')).toEqual([{ kind: 'withdrew', amount: 150 }]);
    expect(lines(game)).toContain('Put 400 rubles in the bank');
    expect(lines(game)).toContain('Took 150 rubles out of the bank');
  });

  it('says what the money changer gave for the dollars', () => {
    const game = newGame({ rng: rolls(), pc: { dollars: 1250, money: 0, level: 0 } });
    convertDollars(game);
    expect(pushed(game, 'dollarsChanged')).toEqual([
      { kind: 'dollarsChanged', dollars: 1200, rubles: 12 },
    ]);
    expect(lines(game)).toContain('Changed 1200 Greater-American Dollars into 12 rubles');
  });
});

describe('what the snake says', () => {
  it('reports the stone tablet the town greets a character with', () => {
    const session = inTheTown(lowest);
    expect(pushed(session.game, 'tabletRead')).toEqual([
      { kind: 'tabletRead', entry: 0, section: null },
    ]);
    expect(lines(session.game)).toContain("Read the snake's stone tablet in the town");
  });

  it('reports the word the snake has on arriving on a floor', () => {
    const game = newGame({ rng: rolls(), pc: { level: 5, module: 0 } });
    hintOnFloor(game);
    expect(pushed(game, 'hintRead')).toEqual([{ kind: 'hintRead', hint: 0 }]);
    expect(lines(game)[0]).toContain('The snake said: HERE ON THIS LEVEL');
  });
});
