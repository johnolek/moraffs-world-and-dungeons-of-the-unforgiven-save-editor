import { beforeEach, describe, expect, it } from 'vitest';
import { expValue } from './combat';
import { giveHint } from './hints';
import { sectionNumber } from './hints';
import { GARBAGE_CAN, bossReward, checkDeath, drainerBonus, killMonster, playerDies } from './kills';
import type { Rng } from './rng';
import { FAITHFUL_RULES } from './rules';
import type { Game, PlayerCharacter } from './state';
import { MAP_EMPTY, MAP_PLAYER, monsterAt, newGame, setMonsterMap } from './state';

/** An {@link Rng} that answers every roll with the same number. */
function always(value: number): Rng {
  return { random: () => value };
}

/**
 * An {@link Rng} that hands back the numbers it is given, in order, and 0 once they run out.
 * `asked` collects the `n` of each roll, which is how a test checks what a roll was made against.
 */
function rolls(...values: number[]): Rng & { asked: number[] } {
  let at = 0;
  const asked: number[] = [];
  return {
    asked,
    random(n: number): number {
      asked.push(n);
      return at < values.length ? values[at++] : 0;
    },
  };
}

/** One of UH.BIN's messages as {@link Game.say} logs it, with the blanks on the end dropped. */
function saidHint(index: number): string[] {
  const lines = giveHint(index);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Monster kind 23 is Gargalon, one of section 1's ordinary monsters and not a level drainer. */
const REGULAR = 23;
/** Monster kind 22 is whichever Shadow boss the section belongs to. */
const BOSS = 22;

/** get_choice's answer to the two-line menu a dropped weapon or suit of armor puts up. */
const LEAVE = 0x32;

/** How many times the game under test has asked for a key with mgetch_message. */
let keysWaitedFor = 0;

/** The delays the game under test asked for, in milliseconds and in the order it asked. */
let delays: number[] = [];

beforeEach(() => {
  keysWaitedFor = 0;
  delays = [];
});

/**
 * A monk standing over a dead monster. A monk is refused every drop that rolls dice of its own,
 * which leaves the kill itself to be checked without a scripted roll for each drop.
 */
function killing(rng: Rng, pc: Partial<PlayerCharacter> = {}, type = REGULAR): Game {
  const game = newGame({
    rng,
    pc: { cls: 2, hp: 100, maxHp: 100, sp: 0, maxSp: 0, ...pc },
    choice: async () => LEAVE,
    pressAnyKey: () => {
      keysWaitedFor += 1;
    },
    delay: (ms) => {
      delays.push(ms);
    },
  });
  Object.assign(game.monsters[3], { x: 11, y: 12, hp: 0, type, level: 40 });
  setMonsterMap(game, 11, 12, 3);
  setMonsterMap(game, game.pc.x, game.pc.y, MAP_PLAYER);
  game.engaged = 3;
  return game;
}

describe('killMonster', () => {
  it('adds what the monster was worth to the experience', async () => {
    const game = killing(always(0));
    const worth = expValue(game, 3);
    const before = game.pc.exp;
    await killMonster(game);
    expect(worth).toBeGreaterThan(0);
    expect(game.pc.exp).toBe(before + worth);
  });

  it('draws the monster is dead on the line above the box, and wipes it after a second', async () => {
    const game = killing(always(0));
    await killMonster(game);
    expect(game.messages[0]).toBe('YOU KILLED IT!');
    expect(delays).toEqual([1050, 500]);
    expect(game.screen).toEqual([]);
    expect(keysWaitedFor).toBe(0);
  });

  it('shortens that message in high speed mode', async () => {
    const game = killing(always(0));
    game.highSpeed = true;
    await killMonster(game);
    expect(delays).toEqual([400]);
  });

  it('says nothing when the monster was a puffball, which splits rather than dies', async () => {
    const game = killing(always(0));
    game.monsterKinds[REGULAR] = { ...game.monsterKinds[REGULAR], special: 6 };
    await killMonster(game);
    expect(game.messages).toEqual([]);
  });

  it('empties the square and parks the slot in the garbage can', async () => {
    const game = killing(always(0));
    await killMonster(game);
    expect(game.monsterMap[12 * 80 + 11]).toBe(MAP_EMPTY);
    expect(monsterAt(game, 11, 12)).toBe(-1);
    expect(game.monsters[3]).toEqual({ x: GARBAGE_CAN, y: GARBAGE_CAN, hp: 0, type: 0, level: 0 });
    expect(game.redrawView).toBe(true);
    expect(game.engaged).toBe(-1);
  });

  it('leaves the player where they were standing', async () => {
    const game = killing(always(0));
    await killMonster(game);
    expect(game.monsterMap[game.pc.y * 80 + game.pc.x]).toBe(MAP_PLAYER);
  });

  it('hands a section boss its reward', async () => {
    const game = killing(always(0), { module: 0, level: 5 }, BOSS);
    expect(sectionNumber(FAITHFUL_RULES, 0, 5)).toBe(0);
    const before = game.pc.maxHp;
    await killMonster(game);
    expect(game.pc.maxHp).toBe(before + 30);
    expect(game.pc.objective[0]).toBe(1);
  });

  it('nags a level 0 character who is hurt and has earned a level', async () => {
    const game = killing(always(0), { lev: 0, exp: 1000000, hp: 50, maxHp: 100 });
    await killMonster(game);
    expect(game.messages).toContain('SHOULD CAST A CURE SPELL TO');
    expect(game.messages).toContain('GOOD NEWS!');
  });

  it('sends a fighter to the temple for the cure rather than casting it', async () => {
    const game = killing(always(0), { cls: 0, lev: 0, hp: 50, maxHp: 100 });
    // A fighter is offered every drop, so the rolls below are all refusals.
    game.rng = rolls(6, 999, 5, 999, 0, 0, 0, 0, 1, 1, 999, 0, 0);
    await killMonster(game);
    expect(game.messages).toContain('SHOULD GO TO THE TEMPLE IN');
  });

  it('says neither of those once the character is past level 0', async () => {
    const game = killing(always(0), { lev: 1, exp: 1000000, hp: 50, maxHp: 100 });
    await killMonster(game);
    expect(game.messages).not.toContain('GOOD NEWS!');
    // The settle is outside the test on the character's level, so it is taken either way; the
    // high speed option is the one thing that drops it.
    expect(delays).toEqual([1050, 500]);
  });

  it('finds nothing one time in three once the find rolls have landed', async () => {
    const spellbook = Array.from({ length: 180 }, () => 0);
    spellbook[0] = 1;
    const game = killing(always(0), { cls: 3, lev: 10, level: 5, spellbook });
    game.rng = rolls(6, 11, 5, 11, 0, 0, 0, 0, 1, 1, 44, 4, 1, 0, 0, 0, 2, 16);
    await killMonster(game);
    expect(game.messages).toContain('YOU FIND...');
    expect(game.messages).toContain('NOTHING! (HIT ANY KEY)');
    // "YOU KILLED IT!" and "YOU FIND..." are each wiped once their delay is up, so the line the
    // kill leaves behind is the one it waits on, and the one key it asks for is that line's.
    expect(delays).toEqual([1050, 750, 3000, 500]);
    expect(game.screen).toEqual([
      { text: 'NOTHING! (HIT ANY KEY)', x: 0x3a2, y: 0x301, font: 0, colour: 8 },
    ]);
    expect(keysWaitedFor).toBe(1);
  });

  it('finds nothing at all when the gate roll misses the floor plus forty', async () => {
    const spellbook = Array.from({ length: 180 }, () => 0);
    spellbook[0] = 1;
    const game = killing(always(0), { cls: 3, lev: 10, level: 5, spellbook });
    game.rng = rolls(6, 11, 5, 11, 0, 0, 0, 0, 1, 1, 45, 4, 1, 0, 0, 0, 2, 16);
    await killMonster(game);
    expect(game.messages).not.toContain('YOU FIND...');
  });

  it('records which section boss it has killed', async () => {
    const game = killing(always(0), { module: 0, level: 3 }, BOSS);
    await killMonster(game);
    expect(game.events).toContainEqual({ kind: 'bossKilled', boss: 0 });
    expect(game.events).not.toContainEqual({ kind: 'gameWon' });
  });

  it('records the win when the boss was the last section\'s', async () => {
    // The Shadow Ogeroth's orb has to be used on a weapon the character owns, and the menu asks
    // again until it names one, so the second row of the eight is theirs.
    const owned = [0, 1, 0, 0, 0, 0, 0, 0];
    const game = killing(always(0), { module: 4, level: 100, weaponsOwned: owned }, BOSS);
    await killMonster(game);
    expect(game.events).toContainEqual({ kind: 'bossKilled', boss: 19 });
    expect(game.events).toContainEqual({ kind: 'gameWon' });
  });

  it('records nothing for an ordinary monster', async () => {
    const game = killing(always(0), { module: 0, level: 3 });
    await killMonster(game);
    expect(game.events.map((event) => event.kind)).not.toContain('bossKilled');
  });

  it('gives a fighter and a sage a gate four hundred points easier', async () => {
    for (const [cls, gate] of [[0, 550], [5, 550], [3, 950], [1, 950]]) {
      const game = killing(always(0), { cls, lev: 10, level: 5 });
      const scripted = rolls(6, 999, 5, 999, 0, 0, 0, 0, 1, 1, 999, 0, 0);
      game.rng = scripted;
      await killMonster(game);
      expect(scripted.asked[10]).toBe(gate);
    }
  });
});

describe('drainerBonus', () => {
  it('hands over one of the six potions when the roll lands', () => {
    const game = newGame({ rng: rolls(0, 4), pc: { level: 20 } });
    drainerBonus(game);
    expect(game.pc.potions).toEqual([0, 0, 0, 0, 1, 0]);
    expect(game.messages).toEqual(saidHint(51));
  });

  it('hands over the key for this stretch of five floors instead', () => {
    const game = newGame({ rng: rolls(374), pc: { level: 22 } });
    drainerBonus(game);
    expect(game.pc.keys[4]).toBe(1);
    expect(game.messages[1]).toBe('IS LABELED NUMBER 20.');
  });

  it('gives no key twice', () => {
    const keys = Array.from({ length: 36 }, () => 0);
    keys[4] = 1;
    const game = newGame({ rng: rolls(374), pc: { level: 22, keys } });
    drainerBonus(game);
    expect(game.messages).toEqual([]);
  });

  it('gives no key above floor 3', () => {
    const game = newGame({ rng: rolls(374), pc: { level: 3 } });
    drainerBonus(game);
    expect(game.messages).toEqual([]);
    expect(game.pc.keys[0]).toBe(0);
  });
});

describe('bossReward', () => {
  const REWARDS: [number, keyof PlayerCharacter, number][] = [
    [0, 'maxHp', 130],
    [1, 'wis', 32],
    [2, 'str', 32],
    [4, 'bodyArmor', 9],
    [5, 'gauntlet', 12],
    [6, 'protRing', 15],
    [8, 'luck', 30],
    [9, 'con', 30],
    [10, 'iq', 30],
    [11, 'seeingStones', 10],
    [12, 'bodyArmor', 25],
    [13, 'gauntlet', 50],
    [14, 'protRing', 50],
    [16, 'maxHp', 400],
    [17, 'dex', 40],
    [18, 'str', 45],
  ];

  /** A character owning the fifth suit of armor and the seventh weapon, to pick off the menu. */
  const armed = { armorOwned: [1, 0, 0, 0, 1, 0, 0, 0], weaponsOwned: [1, 0, 0, 0, 0, 0, 1, 0] };

  it.each(REWARDS)('section %i sets %s to %i', async (section, field, value) => {
    const game = newGame({ rng: always(0) });
    await bossReward(game, section);
    expect(game.pc[field]).toBe(value);
  });

  it.each([
    [3, 25],
    [15, 50],
  ])('section %i puts a plus %i on the armor it is given', async (section, plus) => {
    const game = newGame({ rng: always(0), pc: armed, choice: async () => 0x35 });
    await bossReward(game, section);
    expect(game.pc.armorPlus).toEqual([0, 0, 0, 0, plus, 0, 0, 0]);
    expect(game.messages).toContain('SELECT THE ARMOR TO ENHANCE:');
  });

  it.each([
    [7, 25],
    [19, 101],
  ])('section %i puts a plus %i on the weapon it is given', async (section, plus) => {
    const game = newGame({ rng: always(0), pc: armed, choice: async () => 0x37 });
    await bossReward(game, section);
    expect(game.pc.weaponPlus).toEqual([0, 0, 0, 0, 0, 0, plus, 0]);
    expect(game.messages).toContain('SELECT A WEAPON TO ENHANCE:');
  });

  it('names what the character owns on the orb menu and dashes the rest', async () => {
    const answers = [0x1b, 0x32, 0x35];
    const game = newGame({
      rng: always(0),
      pc: { ...armed, armorPlus: [0, 0, 0, 0, 3, 0, 0, 0] },
      choice: async () => answers.shift() ?? 0x35,
    });
    await bossReward(game, 3);
    // The snake's eight lines about the orb come first; the menu is asked three times over,
    // since Escape and a row the character does not own are both asked again.
    expect(game.messages.slice(8, 16)).toEqual([
      'SKIN',
      '--------',
      '--------',
      '--------',
      'BREAST PLATE, PLUS 3',
      '--------',
      '--------',
      '--------',
    ]);
    expect(game.pc.armorPlus[4]).toBe(25);
    expect(game.messages.filter((line) => line === 'SELECT THE ARMOR TO ENHANCE:')).toHaveLength(3);
  });

  it('adds the health a section 0 kill gives to the current points as well', async () => {
    const game = newGame({ rng: always(0), pc: { hp: 40, maxHp: 100 } });
    await bossReward(game, 0);
    expect(game.pc.hp).toBe(70);
    expect(game.pc.maxHp).toBe(130);
  });

  it('marks the right bit of the module the character is in', async () => {
    for (const [section, bit] of [
      [0, 1],
      [1, 2],
      [2, 4],
      [3, 8],
    ]) {
      const game = newGame({ rng: always(0), pc: { module: 2, ...armed }, choice: async () => 0x35 });
      await bossReward(game, section);
      expect(game.pc.objective).toEqual([0, 0, bit, 0, 0]);
    }
  });

  it('ends the game when the Shadow Ogeroth falls', async () => {
    const game = newGame({ rng: always(0), pc: armed, choice: async () => 0x37 });
    await bossReward(game, 19);
    expect(game.pc.objective[0]).toBe(8);
    expect(game.messages[0]).toBe('THE GROUND BEGINS TO RUMBLE,');
    expect(game.messages).toContain('AND DIFFERENT CHARACTERS.');
  });
});

describe('playerDies', () => {
  it('takes the hit points to -100 and picks one of five parting shots', () => {
    const game = newGame({ rng: rolls(2), pc: { hp: -3 } });
    playerDies(game);
    expect(game.pc.hp).toBe(-100);
    expect(game.messages[0]).toBe('EVERYTHING GOES BLACK...');
    expect(game.messages).toContain('NICE GOING!!!');
  });
});

describe('checkDeath', () => {
  it('leaves a character on exactly zero hit points alive', () => {
    const game = newGame({ rng: always(0), pc: { hp: 0 } });
    expect(checkDeath(game)).toBe(false);
    expect(game.messages).toEqual([]);
  });

  it('kills one below zero', () => {
    const game = newGame({ rng: always(0), pc: { hp: -1 } });
    expect(checkDeath(game)).toBe(true);
    expect(game.pc.hp).toBe(-100);
  });
});
