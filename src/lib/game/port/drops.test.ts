import { describe, expect, it } from 'vitest';
import {
  ARMOR_NAMES,
  DOLLARS_CAP,
  MONEY_FIND_CAP,
  WEAPON_NAMES,
  dropArmor,
  dropMoney,
  dropPaper,
  dropScroll,
  dropSpellbook,
  dropWand,
  dropWeapon,
  findItem,
  loseItem,
  postKillHeal,
  postKillSp,
  spellNameToMenu,
  useMagicItem,
} from './drops';
import { giveHint } from './hints';
import { BorlandRng, type Rng } from './rng';
import type { Game, PlayerCharacter } from './state';
import { newGame } from './state';

/** get_choice's answer to the two-line menu a dropped weapon or suit of armor puts up. */
const LEAVE = 0x32;

/**
 * An {@link Rng} that hands back the numbers it is given, in order, and 0 once they run out.
 * Every roll in these functions is a `Random(n)`, so a list of answers pins a whole routine down.
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

/**
 * A game with one level 40 monster engaged, which is what a drop rolls against. `answer` is the
 * key the two-line menu of a dropped weapon or suit of armor is answered with.
 */
function killing(rng: Rng, pc: Partial<PlayerCharacter> = {}, monsterLevel = 40, answer = 0x31): Game {
  const game = newGame({ rng, pc, choice: async () => answer });
  game.monsters[0].level = monsterLevel;
  game.engaged = 0;
  return game;
}

/** A game whose menus are answered with these keys, in order, and with Escape once they run out. */
function answering(pc: Partial<PlayerCharacter>, ...keys: number[]): Game {
  const answers = [...keys];
  return newGame({ rng: rolls(), pc, choice: async () => answers.shift() ?? 0x1b });
}

describe('dropWeapon', () => {
  it('gives a monk nothing at all', async () => {
    const game = killing(rolls(0, 0), { cls: 2 });
    await dropWeapon(game);
    expect(game.messages).toEqual([]);
    expect(game.pc.weaponsOwned[1]).toBe(0);
  });

  it('offers the weapon the first roll picks, one past the fist', async () => {
    const game = killing(rolls(4, 0), { weaponsOwned: [1, 0, 0, 0, 0, 0, 0, 0] }, 40, LEAVE);
    await dropWeapon(game);
    expect(game.messages[1]).toBe(`YOU FIND A ${WEAPON_NAMES[5]}`);
    expect(game.pc.weaponsOwned[5]).toBe(0);
  });

  it('takes the weapon and works the carried weight out again', async () => {
    const game = killing(rolls(0, 0), { weaponsOwned: [1, 0, 0, 0, 0, 0, 0, 0] });
    await dropWeapon(game);
    expect(game.pc.weaponsOwned[1]).toBe(1);
    expect(game.pc.loadedWeight).toBe(game.pc.weight + 4);
  });

  it('drops nothing when the roll lands above the monster level plus ten', async () => {
    const game = killing(rolls(0, 51));
    await dropWeapon(game);
    expect(game.messages).toEqual([]);
  });

  it('drops one the monster is just deep enough for', async () => {
    const game = killing(rolls(0, 50));
    await dropWeapon(game);
    expect(game.messages[0]).toBe('GOOD NEWS...');
  });

  it('says nothing about a weapon the character already owns', async () => {
    const game = killing(rolls(0, 0), { weaponsOwned: [1, 1, 0, 0, 0, 0, 0, 0] });
    await dropWeapon(game);
    expect(game.messages).toEqual([]);
    expect(game.pc.weaponsOwned[1]).toBe(1);
  });

  it('skips a weapon no better than one already carried in high speed mode', async () => {
    const game = killing(rolls(0, 0), { weaponsOwned: [1, 0, 0, 0, 0, 0, 0, 1] });
    game.highSpeed = true;
    await dropWeapon(game);
    expect(game.messages).toEqual([]);
    expect(game.pc.weaponsOwned[1]).toBe(0);
  });
});

describe('dropArmor', () => {
  it('gives a monk nothing at all', async () => {
    const game = killing(rolls(0, 0), { cls: 2 });
    await dropArmor(game);
    expect(game.messages).toEqual([]);
  });

  it('counts armor the character already has, which drop_weapon never does', async () => {
    const game = killing(rolls(2, 0), { armorOwned: [1, 0, 0, 2, 0, 0, 0, 0] });
    await dropArmor(game);
    expect(game.messages[1]).toBe(`YOU FIND ${ARMOR_NAMES[3]} ARMOR.`);
    expect(game.messages[2]).toBe('(YOU ALREADY HAVE 2 OF THESE)');
    expect(game.pc.armorOwned[3]).toBe(3);
  });

  it('leaves the armor where it is when the answer is no', async () => {
    const game = killing(rolls(0, 0), {}, 40, LEAVE);
    await dropArmor(game);
    expect(game.pc.armorOwned[1]).toBe(0);
  });

  it('says GOOD NEWS before high speed mode throws the offer away', async () => {
    const game = killing(rolls(0, 0), { armorOwned: [1, 0, 0, 0, 0, 1, 0, 0] });
    game.highSpeed = true;
    await dropArmor(game);
    expect(game.messages).toEqual(['GOOD NEWS...']);
  });
});

describe('spellNameToMenu', () => {
  it('prints the level one higher than the index and names the list', () => {
    expect(spellNameToMenu(0, 0)).toEqual(['  THE SPELL IS A LEVEL 1', '  PERMANENT SPELL.']);
    expect(spellNameToMenu(9, 3)).toEqual(['  THE SPELL IS A LEVEL 10', '  PRIESTLY SPELL']);
  });
});

describe('dropSpellbook', () => {
  it('teaches a wizard the spell the rolls land on', () => {
    // level 3, list 2 (wizard), slot 1
    const game = killing(rolls(3, 2, 1), { cls: 3, level: 30 });
    expect(dropSpellbook(game)).toBe(true);
    expect(game.pc.spellbook[2 * 45 + 3 * 3 + 1]).toBe(1);
    expect(game.messages).toEqual([
      'GOOD NEWS...',
      'YOU HAVE FOUND A SPELLBOOK.',
      '  THE SPELL IS A LEVEL 4',
      '  WIZARD SPELL.',
      'HIT ANY KEY FOR A DESCRIPTION',
      '  OF THE SPELL.',
    ]);
  });

  it('teaches a fighter and a monk nothing', () => {
    for (const cls of [0, 2]) {
      const game = killing(rolls(0, 0, 0), { cls, level: 30 });
      expect(dropSpellbook(game)).toBe(false);
    }
  });

  it('never hands a priest a wizard spell', () => {
    const game = killing(rolls(0, 2, 0), { cls: 4, level: 30 });
    expect(dropSpellbook(game)).toBe(false);
    expect(game.pc.spellbook.every((known) => known === 0)).toBe(true);
  });

  it('never hands a mage a priestly one', () => {
    const game = killing(rolls(0, 3, 0), { cls: 6, level: 30 });
    expect(dropSpellbook(game)).toBe(false);
  });

  it('throws away a spell the character already knows', () => {
    const spellbook = Array.from({ length: 180 }, () => 0);
    spellbook[0] = 1;
    const game = killing(rolls(0, 0, 0), { cls: 3, level: 30, spellbook });
    expect(dropSpellbook(game)).toBe(false);
    expect(game.messages).toEqual([]);
  });

  it('makes a sage pass two extra rolls', () => {
    const passes = killing(rolls(175, 140, 0, 0, 0), { cls: 5, level: 30 });
    expect(dropSpellbook(passes)).toBe(true);
    const failsFirst = killing(rolls(176, 140, 0, 0, 0), { cls: 5, level: 30 });
    expect(dropSpellbook(failsFirst)).toBe(false);
    const failsSecond = killing(rolls(175, 141, 0, 0, 0), { cls: 5, level: 30 });
    expect(dropSpellbook(failsSecond)).toBe(false);
  });

  it('rolls the level again when the floor puts it past ten', () => {
    const game = killing(rolls(10, 6, 0, 0), { cls: 3, level: 60 });
    expect(dropSpellbook(game)).toBe(true);
    expect(game.pc.spellbook[6 * 3]).toBe(1);
  });
});

describe('dropScroll', () => {
  it('adds one scroll of the spell the rolls land on', () => {
    const game = killing(rolls(15, 4, 1, 2), { cls: 3, level: 30 });
    dropScroll(game);
    expect(game.pc.scrolls[1 * 45 + 4 * 3 + 2]).toBe(1);
    expect(game.messages).toContain('YOU HAVE FOUND A SCROLL.');
  });

  it('shuts the gate one point above fifteen', () => {
    const game = killing(rolls(16, 0, 0, 0), { cls: 3, level: 30 });
    dropScroll(game);
    expect(game.messages).toEqual([]);
  });

  it('lets a sage through thirty points later', () => {
    const game = killing(rolls(45, 0, 0, 0), { cls: 5, level: 30 });
    dropScroll(game);
    expect(game.messages).toContain('YOU HAVE FOUND A SCROLL.');
    const shut = killing(rolls(46, 0, 0, 0), { cls: 5, level: 30 });
    dropScroll(shut);
    expect(shut.messages).toEqual([]);
  });

  it('gives a fighter and a monk none', () => {
    for (const cls of [0, 2]) {
      const game = killing(rolls(0, 0, 0, 0), { cls, level: 30 });
      dropScroll(game);
      expect(game.messages).toEqual([]);
    }
  });
});

describe('dropWand', () => {
  it('rolls two to six charges onto a wand that is never a permanent spell', () => {
    // gate 15, level 2, list 0 -> 1, slot 2, charges 3 + 2
    const game = killing(rolls(15, 2, 0, 2, 3), { cls: 3, level: 40 });
    dropWand(game);
    expect(game.pc.wands[1 * 45 + 2 * 3 + 2]).toBe(5);
    expect(game.messages).toContain('YOU FOUND A WAND WITH 5 CHARGES.');
  });

  it('rolls a sage a level out of half the floor and everyone else a quarter of it', () => {
    const sageRolls = rolls(0, 0, 0, 0, 0);
    dropWand(killing(sageRolls, { cls: 5, level: 40 }));
    expect(sageRolls.asked[1]).toBe(20);
    const wizardRolls = rolls(0, 0, 0, 0, 0);
    dropWand(killing(wizardRolls, { cls: 3, level: 40 }));
    expect(wizardRolls.asked[1]).toBe(10);
  });

  it('hands a wizard a priestly wand, which the spellbook and the scroll never do', () => {
    const game = killing(rolls(0, 0, 2, 0, 0), { cls: 3, level: 40 });
    dropWand(game);
    expect(game.messages).toContain('  PRIESTLY SPELL');
  });
});

describe('dropPaper', () => {
  it('adds one paper of the spell the rolls land on', () => {
    const game = killing(rolls(15, 1, 3, 0), { cls: 3, level: 60 });
    dropPaper(game);
    expect(game.pc.papers[3 * 45 + 1 * 3]).toBe(1);
    expect(game.messages).toContain('YOU FIND A SPELL PAPER.');
  });

  it('rolls a fighter the level a sage gets and everyone else a third of it', () => {
    const fighterRolls = rolls(0, 0, 0, 0);
    dropPaper(killing(fighterRolls, { cls: 0, level: 60 }));
    expect(fighterRolls.asked[1]).toBe(30);
    const sageRolls = rolls(0, 0, 0, 0);
    dropPaper(killing(sageRolls, { cls: 5, level: 60 }));
    expect(sageRolls.asked[1]).toBe(30);
    const wizardRolls = rolls(0, 0, 0, 0);
    dropPaper(killing(wizardRolls, { cls: 3, level: 60 }));
    expect(wizardRolls.asked[1]).toBe(10);
  });

  it('gives a monk none', () => {
    const game = killing(rolls(0, 0, 0, 0), { cls: 2, level: 60 });
    dropPaper(game);
    expect(game.messages).toEqual([]);
  });
});

describe('findItem', () => {
  const FINDS: [number, keyof PlayerCharacter, number, number][] = [
    [0, 'grenades', 1, 31],
    [1, 'teleportStones', 1, 32],
    [2, 'seeingStones', 1, 33],
    [3, 'slosher', 1, 35],
    [4, 'healingPotions', 1, 36],
    [5, 'regenRings', 1, 37],
    [6, 'str', 22, 38],
    [7, 'iq', 22, 39],
    [8, 'wis', 22, 40],
    [9, 'con', 22, 41],
    [10, 'dex', 22, 43],
    [11, 'luck', 22, 44],
  ];

  it.each(FINDS)('roll %i gives %s and hint %i', (roll, field, value, hint) => {
    const game = killing(rolls(roll));
    findItem(game);
    expect(game.pc[field]).toBe(value);
    expect(game.messages).toEqual(saidHint(hint));
  });

  it('hands over a second floor slosher and says so instead', () => {
    const game = killing(rolls(3), { slosher: 1 });
    findItem(game);
    expect(game.pc.slosher).toBe(1);
    expect(game.messages[0]).toBe('OH WELL! YOU ALREADY HAVE');
  });

  it('finds a monk nothing', () => {
    const game = killing(rolls(0), { cls: 2 });
    findItem(game);
    expect(game.pc.grenades).toBe(0);
  });
});

describe('postKillHeal', () => {
  it('gives four to fourteen points one time in four', () => {
    const game = killing(rolls(0, 6), { hp: 50, maxHp: 100, level: 5 });
    postKillHeal(game);
    expect(game.pc.hp).toBe(60);
  });

  it('adds up to three more from floor 7 down', () => {
    const game = killing(rolls(0, 6, 3), { hp: 50, maxHp: 100, level: 7 });
    postKillHeal(game);
    expect(game.pc.hp).toBe(63);
  });

  it('never goes past the maximum', () => {
    const game = killing(rolls(0, 10), { hp: 98, maxHp: 100, level: 5 });
    postKillHeal(game);
    expect(game.pc.hp).toBe(100);
  });

  it('leaves a character at full health alone', () => {
    const game = killing(rolls(0, 10), { hp: 100, maxHp: 100 });
    postKillHeal(game);
    expect(game.messages).toEqual([]);
  });

  it('does nothing three times in four', () => {
    const game = killing(rolls(1, 10), { hp: 50, maxHp: 100 });
    postKillHeal(game);
    expect(game.pc.hp).toBe(50);
  });
});

describe('postKillSp', () => {
  it('gives one spell point one time in six', () => {
    const game = killing(rolls(0), { cls: 3, sp: 4, maxSp: 20 });
    postKillSp(game);
    expect(game.pc.sp).toBe(5);
  });

  it('gives a fighter none', () => {
    const game = killing(rolls(0), { cls: 0, sp: 4, maxSp: 20 });
    postKillSp(game);
    expect(game.pc.sp).toBe(4);
  });

  it('leaves a character at full spell points alone', () => {
    const game = killing(rolls(0), { cls: 3, sp: 20, maxSp: 20 });
    postKillSp(game);
    expect(game.pc.sp).toBe(20);
  });
});

describe('dropMoney', () => {
  it('finds a small amount below floor 5 one time in four', () => {
    const game = killing(rolls(1, 500, 0, 0), { cls: 3, level: 4, hard: 1 });
    dropMoney(game);
    // Random(deep * 200) = 500, then the worshipper-and-wizard bonus and the shallow bonus.
    expect(game.pc.dollars).toBe(500);
    expect(game.messages).toContain('  YOU HAVE FOUND A TOTAL OF');
    expect(game.messages).toContain('500 DOLLARS.');
  });

  it('multiplies three rolls together above floor 4', () => {
    const game = killing(rolls(2, 3, 5, 0), { cls: 2, level: 10, hard: 1 });
    dropMoney(game);
    // 2 * 3 * 5 = 30, and floors 5 to 14 add a third of it.
    expect(game.pc.dollars).toBe(40);
  });

  it('takes a third off from floor 17 down', () => {
    const game = killing(rolls(2, 3, 5, 0), { cls: 2, level: 20, hard: 1 });
    dropMoney(game);
    expect(game.pc.dollars).toBe(20);
  });

  it('gives a sage three times the money', () => {
    const game = killing(rolls(2, 3, 5, 0), { cls: 5, level: 20, hard: 1 });
    dropMoney(game);
    expect(game.pc.dollars).toBe(60);
  });

  it('adds up to seven thousand on normal difficulty', () => {
    const game = killing(rolls(2, 3, 5, 1000, 0), { cls: 2, level: 20, hard: 0 });
    dropMoney(game);
    // 2 * 3 * 5 = 30, a third off for floor 20, then the normal difficulty bonus on top.
    expect(game.pc.dollars).toBe(1020);
  });

  it('rolls a smaller find when one comes out over the cap', () => {
    const game = killing(rolls(3000, 3000, 3000, 100, 7, 0), {
      cls: 2,
      level: 20,
      hard: 1,
    });
    dropMoney(game);
    expect(game.pc.dollars).toBe(MONEY_FIND_CAP - 700);
  });

  it('cuts the find down to what the character can still carry', () => {
    const game = killing(rolls(1, 500, 0), { cls: 2, level: 4, hard: 1, dollars: DOLLARS_CAP - 20 });
    dropMoney(game);
    expect(game.pc.dollars).toBe(DOLLARS_CAP);
  });

  it('says once that the character can carry no more', () => {
    const game = killing(rolls(0), { dollars: DOLLARS_CAP });
    dropMoney(game);
    expect(game.messages[0]).toBe('SORRY, PAL! YOU CAN\'T CARRY');
    game.messages.length = 0;
    dropMoney(game);
    expect(game.messages).toEqual([]);
  });

  it('says nothing about money in high speed mode', () => {
    const game = killing(rolls(1, 500, 0), { cls: 2, level: 4, hard: 1 });
    game.highSpeed = true;
    dropMoney(game);
    expect(game.pc.dollars).toBe(500);
    expect(game.messages).toEqual([]);
  });
});

describe('dropMoney on the clock', () => {
  /** A game rolling on Borland's generator with a seconds clock the test moves by hand, which is
   *  what a run played on the clock hands in. */
  function killingAtSecond(seconds: () => number): Game {
    const game = newGame({
      rng: new BorlandRng(1),
      pc: { cls: 2, level: 10, hard: 1 },
      clock: () => 0,
      seconds,
      choice: async () => 0x31,
    });
    game.monsters[0].level = 40;
    game.engaged = 0;
    game.highSpeed = true;
    return game;
  }

  /** What one kill pays, with the character's purse emptied again afterwards. */
  function paid(game: Game): number {
    dropMoney(game);
    const amount = game.pc.dollars;
    game.pc.dollars = 0;
    return amount;
  }

  it('pays two kills in the same second exactly the same', () => {
    let second = 1_757_000_000;
    const game = killingAtSecond(() => second);

    const first = paid(game);
    expect(first).toBeGreaterThan(0);
    expect(paid(game)).toBe(first);

    second += 1;
    expect(paid(game)).not.toBe(first);
  });

  it('leaves a game with no seconds clock rolling on from where it was', () => {
    const game = killingAtSecond(() => 1_757_000_000);
    game.seconds = null;

    const first = paid(game);
    expect(paid(game)).not.toBe(first);
  });
});

describe('loseItem', () => {
  it('will not let the character drop their own skin', async () => {
    const game = answering({ armorOwned: [1, 0, 0, 0, 0, 0, 0, 0] }, 0x31, 0x31);
    await loseItem(game);
    expect(game.pc.armorOwned[0]).toBe(1);
    expect(game.messages).toContain("OWE! IT JUST WON'T COME OFF!");
  });

  it('drops one suit of armor and takes off the last of what is worn', async () => {
    const game = answering({ armorOwned: [1, 0, 2, 0, 0, 0, 0, 0], armor: 2 }, 0x31, 0x33, 0x31, 0x33);
    await loseItem(game);
    expect(game.pc.armorOwned[2]).toBe(1);
    expect(game.pc.armor).toBe(2);
    await loseItem(game);
    expect(game.pc.armorOwned[2]).toBe(0);
    expect(game.pc.armor).toBe(0);
  });

  it('drops a weapon the same way', async () => {
    const game = answering({ weaponsOwned: [1, 1, 0, 0, 0, 0, 0, 0], weapon: 1 }, 0x32, 0x32);
    await loseItem(game);
    expect(game.pc.weaponsOwned[1]).toBe(0);
    expect(game.pc.weapon).toBe(0);
  });

  it('throws all the money away, or keeps it', async () => {
    const thrown = answering({ money: 5000 }, 0x33, 0x31);
    await loseItem(thrown);
    expect(thrown.pc.money).toBe(0);
    const kept = answering({ money: 5000 }, 0x33, 0x32);
    await loseItem(kept);
    expect(kept.pc.money).toBe(5000);
  });

  it('tells a character who stands on their head to get out more', async () => {
    const game = answering({ money: 5000 }, 0x33, 0x33);
    await loseItem(game);
    expect(game.pc.money).toBe(5000);
    expect(game.messages).toContain('  YOU NEED TO GET OUT MORE!');
  });

  it('names what the character owns and dashes the rest, with the plus and the count', async () => {
    const game = answering(
      { armorOwned: [1, 0, 3, 0, 0, 0, 0, 0], armorPlus: [0, 0, 7, 0, 0, 0, 0, 0] },
      0x31,
      0x33,
    );
    await loseItem(game);
    expect(game.messages.slice(6, 14)).toEqual([
      'SKIN',
      '--------',
      'CHAIN, PLUS 7 (3)',
      '--------',
      '--------',
      '--------',
      '--------',
      '--------',
    ]);
  });

  it('changes nothing when the second menu is escaped', async () => {
    const game = answering({ armorOwned: [1, 0, 3, 0, 0, 0, 0, 0] }, 0x31);
    await loseItem(game);
    expect(game.pc.armorOwned).toEqual([1, 0, 3, 0, 0, 0, 0, 0]);
  });

  it('works the carried weight out again', async () => {
    const game = answering({ weaponsOwned: [1, 1, 0, 0, 0, 0, 0, 0], loadedWeight: 0 }, 0x32, 0x32);
    await loseItem(game);
    expect(game.pc.loadedWeight).toBe(game.pc.weight);
  });
});

describe('useMagicItem', () => {
  it('says so when the character has none of what they picked', async () => {
    const game = killing(rolls(), { slosher: 0 }, 40, 0x31);
    game.engaged = -1;
    await useMagicItem(game);
    expect(game.messages).toContain('MAGIC ITEMS ARE MUCH MORE');
  });

  it('slips one floor down and keeps the slosher', async () => {
    const game = killing(rolls(), { slosher: 1, level: 5, module: 0 }, 40, 0x31);
    await useMagicItem(game);
    expect(game.pc.level).toBe(6);
    expect(game.pc.slosher).toBe(1);
    expect(game.events).toEqual([
      { kind: 'levelChanged', from: 5, to: 6 },
      { kind: 'itemUsed', item: 'FLOOR SLOSHER' },
    ]);
  });

  it('refuses to slosh past two thirds of the way down the module', async () => {
    // Module I's deepest floor is 25, so the slosher stops working at floor 16.
    const game = killing(rolls(), { slosher: 1, level: 16, module: 0 }, 40, 0x31);
    await useMagicItem(game);
    expect(game.pc.level).toBe(16);
    expect(game.messages).toContain("DOESN'T WORK THIS DEEP!");
  });

  it('drinks a potion of healing', async () => {
    const game = killing(rolls(), { healingPotions: 2, hp: 5, maxHp: 300 }, 40, 0x32);
    await useMagicItem(game);
    expect(game.pc.hp).toBe(300);
    expect(game.pc.healingPotions).toBe(1);
  });

  it('turns down the job of God', async () => {
    const game = killing(rolls(), {}, 40, 0x33);
    await useMagicItem(game);
    expect(game.messages).toContain('  SORRY, THAT JOB IS ALREADY');
  });

  it('spends a stone of seeing', async () => {
    const game = killing(rolls(), { seeingStones: 3 }, 40, 0x34);
    await useMagicItem(game);
    expect(game.pc.seeingStones).toBe(2);
    expect(game.recenterMap).toBe(true);
  });

  it('marks every square of the floor the stone of seeing shines on but the rock', async () => {
    const marked: string[] = [];
    const game = newGame({
      rng: rolls(),
      pc: { seeingStones: 1 },
      choice: async () => 0x34,
      solid: (x, y) => x === 3 && y === 4,
      markKnown: (x, y) => marked.push(`${x},${y}`),
    });
    game.monsters[0].level = 40;
    game.engaged = 0;
    await useMagicItem(game);
    expect(marked).toContain('0,0');
    expect(marked).toContain(`${game.columns - 1},${game.rows - 1}`);
    expect(marked).not.toContain('3,4');
    // The loops stop one short on each axis, which costs the floor nothing.
    expect(marked).not.toContain(`${game.columns},0`);
    expect(marked).not.toContain(`0,${game.rows}`);
    expect(marked.length).toBe(game.columns * game.rows - 1);
  });

  it('teleports to the town on a stone of teleportation', async () => {
    const game = killing(rolls(), { teleportStones: 1, level: 40 }, 40, 0x35);
    await useMagicItem(game);
    expect(game.pc.teleportStones).toBe(0);
    expect(game.pc.level).toBe(0);
    expect(game.events).toEqual([
      { kind: 'levelChanged', from: 40, to: 0 },
      { kind: 'itemUsed', item: 'STONE OF TELEPORTATION' },
    ]);
    expect(game.engaged).toBe(-1);
  });

  it('kills the engaged monster with a grenade', async () => {
    const game = killing(rolls(), { grenades: 1 }, 40, 0x36);
    game.monsters[0].hp = 90000;
    await useMagicItem(game);
    expect(game.monsters[0].hp).toBe(-100);
    expect(game.pc.grenades).toBe(0);
    expect(game.messages).toContain('A MASSIVE EXPLOSION KILLS');
  });

  it('has a Shadow boss catch the grenade and hand it back', async () => {
    const game = killing(rolls(), { grenades: 1 }, 40, 0x36);
    game.monsters[0].type = 22;
    game.monsters[0].hp = 90000;
    await useMagicItem(game);
    expect(game.monsters[0].hp).toBe(90000);
    expect(game.pc.grenades).toBe(1);
    expect(game.messages).toContain('GRADADE.');
  });

  it('wastes a grenade on an empty floor', async () => {
    const game = killing(rolls(), { grenades: 1 }, 40, 0x36);
    game.engaged = -1;
    await useMagicItem(game);
    expect(game.pc.grenades).toBe(1);
    expect(game.messages).toContain("  YOU'VE COME UP WITH A VERY");
  });
});
