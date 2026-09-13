import { describe, expect, it } from 'vitest';
import type { Rng } from '../port/rng';
import {
  armorFind,
  ballOfThought,
  cupOfHealth,
  moneyFind,
  paperFind,
  scrollFind,
  spellbookFind,
  spellDescription,
  specialFind,
  wandFind,
  weaponFind,
} from './drops';
import { recomputeWeight } from './magic';
import { mwSpellHelp, mwSpellRecord } from './spells';
import { bank } from './town';
import type { MwGameOverrides } from './state';
import { newMwGame } from './state';
import type { MwStockedMonster } from './stocking';

/** An Rng that hands back the numbers a test names, in order, and then zeroes. */
function scripted(rolls: number[]): Rng {
  let at = 0;
  return { random: () => (at < rolls.length ? rolls[at++] : 0) };
}

/** A game with one monster in slot 0 engaged, at the depth the loot rolls read off it. */
function lootGame(depth: number, overrides: MwGameOverrides = {}) {
  const monster: MwStockedMonster = { x: 5, y: 5, hp: 0, type: 0, depth };
  return newMwGame({ monsters: [monster], engaged: 0, ...overrides });
}

describe('spellDescription', () => {
  it('counts the level from one and names the list', () => {
    expect(spellDescription(0, 0)).toEqual(['  THE SPELL IS A LEVEL 1', '  PERMANENT SPELL.']);
    expect(spellDescription(9, 3)).toEqual(['  THE SPELL IS A LEVEL 10', '  PRIESTLY SPELL']);
  });
});

describe('weaponFind', () => {
  it('offers a stick when the roll is under the depth plus ten', () => {
    const game = lootGame(40, { rng: scripted([0, 49]) });
    weaponFind(game, () => true);
    expect(game.messages).toContain('YOU FIND A STICK');
    expect(game.pc.weaponsOwned[1]).toBe(1);
    // "GOOD NEWS..." heads the offer on the strip above the box rather than filling a box of
    // its own, so it is on the screen and not among the eight lines.
    expect(game.screen).toEqual([{ text: 'GOOD NEWS...', x: 0, y: 0, font: 0, colour: 15 }]);
  });

  it('pauses either side of the heading it draws', () => {
    const delays: number[] = [];
    const game = lootGame(40, {
      rng: scripted([0, 49]),
      delay: (ms) => {
        delays.push(ms);
      },
    });
    weaponFind(game, () => true);
    expect(delays).toEqual([1000, 1300]);
  });

  it('leaves the weapon behind when the menu says so', () => {
    const game = lootGame(40, { rng: scripted([0, 0]) });
    weaponFind(game, () => false);
    expect(game.pc.weaponsOwned[1]).toBe(0);
  });

  it('says nothing when the roll beats the depth plus ten', () => {
    const game = lootGame(0, { rng: scripted([0, 11]) });
    weaponFind(game, () => true);
    expect(game.messages).toEqual([]);
  });

  it('offers nothing the character already owns', () => {
    const game = lootGame(40, { rng: scripted([0, 0]), pc: { weaponsOwned: [0, 1, 0, 0, 0, 0, 0, 0] } });
    weaponFind(game, () => true);
    expect(game.messages).toEqual([]);
  });

  it('offers a monk nothing at all', () => {
    const game = lootGame(200, { rng: scripted([0, 0]), pc: { cls: 2 } });
    weaponFind(game, () => true);
    expect(game.messages).toEqual([]);
  });
});

describe('armorFind', () => {
  it('offers a suit the character already owns', () => {
    const game = lootGame(40, { rng: scripted([0, 0]), pc: { armorOwned: [0, 3, 0, 0, 0, 0, 0, 0] } });
    armorFind(game, () => true);
    expect(game.messages).toContain('YOU FIND A SUIT OF LEATHER');
    expect(game.pc.armorOwned[1]).toBe(4);
  });

  it('reaches titanium, which the store does not sell', () => {
    const game = lootGame(2000, { rng: scripted([5, 0]) });
    armorFind(game, () => true);
    expect(game.messages).toContain('YOU FIND A SUIT OF TITANIUM');
    expect(game.pc.armorOwned[6]).toBe(1);
  });

  it('never offers bare skin, which is armor 0', () => {
    for (let roll = 0; roll < 6; roll++) {
      const game = lootGame(2000, { rng: scripted([roll, 0]) });
      armorFind(game, () => false);
      expect(game.messages[1]).not.toBe('YOU FIND A SUIT OF SKIN');
    }
  });
});

describe('moneyFind', () => {
  it('says nothing two kills in three', () => {
    const game = lootGame(10, { rng: scripted([1]) });
    moneyFind(game, () => 'A');
    expect(game.messages).toEqual([]);
  });

  it('throws away a find that is only jewel stones', () => {
    // The find roll, then the five piles refused, then the jewel pile taken, then the deep roll.
    const game = lootGame(10, { rng: scripted([0, 1, 1, 1, 1, 1, 0, 4, 3, 2, 5, 1249]), pc: { floor: 20 } });
    moneyFind(game, () => 'A');
    expect(game.messages).toEqual([]);
    expect(game.pc.stones[5]).toBe(0);
  });

  it('takes only the piles the key names', () => {
    // The find, then each pile's chance, its size, the floor's multiplier and its flat roll;
    // the platinum has no flat roll and the jewel pile has two multipliers. The last roll is the
    // deep-floor bonus, which 1249 misses.
    const rolls = [0, 0, 3, 2, 400, 0, 3, 2, 60, 0, 3, 2, 20, 0, 3, 2, 10, 0, 3, 2, 0, 2, 3, 4, 5, 1249];
    const all = lootGame(10, { rng: scripted(rolls), pc: { floor: 20, weight: 100, loadedWeight: 100 } });
    moneyFind(all, () => 'A');
    expect(all.pc.stones.every((count) => count > 0)).toBe(true);

    const jewelsOnly = lootGame(10, {
      rng: scripted(rolls),
      pc: { floor: 20, weight: 100, loadedWeight: 100 },
    });
    moneyFind(jewelsOnly, () => 'J');
    expect(jewelsOnly.pc.stones.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(jewelsOnly.pc.stones[5]).toBe(all.pc.stones[5]);

    const gold = lootGame(10, { rng: scripted(rolls), pc: { floor: 20, weight: 100, loadedWeight: 100 } });
    moneyFind(gold, () => 'G');
    expect(gold.pc.stones.slice(0, 3)).toEqual([0, 0, 0]);
    expect(gold.pc.stones[3]).toBe(all.pc.stones[3]);
  });

  it('offers nothing to carry when the load is over three times the naked weight', () => {
    const rolls = [0, 0, 3, 2, 400, 1, 1, 1, 1, 1, 1249];
    const game = lootGame(10, { rng: scripted(rolls), pc: { floor: 20, weight: 100, loadedWeight: 301 } });
    moneyFind(game, () => 'A');
    expect(game.messages).toContain('IT IS TOO HEAVY FOR YOU');
    expect(game.pc.stones[0]).toBe(0);
  });

  it('values the pile at the rate the bank pays', () => {
    // One copper pile of 4 * 100 + 0, and nothing else.
    const rolls = [0, 0, 100, 4, 0, 1, 1, 1, 1, 1, 1249];
    const game = lootGame(10, { rng: scripted(rolls), pc: { floor: 20, weight: 100, loadedWeight: 100 } });
    moneyFind(game, () => 'A');
    expect(game.pc.stones[0]).toBe(400);
    expect(game.messages[0]).toBe('YOU FIND 2 STONES. THE');
    expect(game.messages[1]).toBe('  PILE WEIGHS ABOUT 25');
    expect(game.messages[3]).toBe('  COPPER STONES.');
  });
});

describe('cupOfHealth', () => {
  it('heals three plus a roll one kill in five', () => {
    const game = newMwGame({ rng: scripted([0, 5]), pc: { hp: 10, maxHp: 100 } });
    cupOfHealth(game);
    expect(game.pc.hp).toBe(18);
  });

  it('adds another roll below floor 6', () => {
    const game = newMwGame({ rng: scripted([0, 0, 3]), pc: { hp: 10, maxHp: 100, floor: 7 } });
    cupOfHealth(game);
    expect(game.pc.hp).toBe(16);
  });

  it('does nothing for a character at full health', () => {
    const game = newMwGame({ rng: scripted([0]), pc: { hp: 50, maxHp: 50 } });
    cupOfHealth(game);
    expect(game.messages).toEqual([]);
  });

  it('never heals past the maximum', () => {
    const game = newMwGame({ rng: scripted([0, 10]), pc: { hp: 49, maxHp: 50 } });
    cupOfHealth(game);
    expect(game.pc.hp).toBe(50);
  });
});

describe('ballOfThought', () => {
  it('gives one spell point back one kill in seven', () => {
    const game = newMwGame({ rng: scripted([0]), pc: { cls: 3, sp: 4, maxSp: 12 } });
    ballOfThought(game);
    expect(game.pc.sp).toBe(5);
  });

  it('has nothing for a fighter', () => {
    const game = newMwGame({ rng: scripted([0]), pc: { cls: 0, sp: 0, maxSp: 0 } });
    ballOfThought(game);
    expect(game.messages).toEqual([]);
  });
});

describe('the carried weight', () => {
  it('is worked out again when a weapon is taken, since the load has changed', () => {
    const game = lootGame(40, { rng: scripted([0, 49]), pc: { cls: 3, weight: 150 } });
    game.pc.loadedWeight = 0;
    weaponFind(game, () => true);

    expect(game.pc.weaponsOwned.some((owned) => owned > 0)).toBe(true);
    expect(game.pc.loadedWeight).toBeGreaterThan(0);
  });

  it('is worked out again when the bank turns the stones into jewels', () => {
    const game = newMwGame({ pc: { cls: 3, floor: 0, weight: 150 } });
    game.pc.stones = [1600, 0, 0, 0, 0, 0];
    recomputeWeight(game);
    const carryingStones = game.pc.loadedWeight;

    bank(game, 1, 0);

    expect(game.pc.stones[0]).toBe(0);
    expect(game.pc.loadedWeight).toBeLessThan(carryingStones);
  });
});

describe('spellbookFind', () => {
  it('gives a wizard a spell out of two thirds of the floor', () => {
    // level 4, list 2, slot 1.
    const game = newMwGame({ rng: scripted([4, 2, 1]), pc: { cls: 3, floor: 30 } });
    spellbookFind(game);
    expect(game.pc.spellbook[2 * 45 + 4 * 3 + 1]).toBe(1);
    expect(game.messages).toContain('  THE SPELL IS A LEVEL 5');
    expect(game.messages).toContain('  WIZARD SPELL.');
  });

  it("reads the spell's own description out after the box that promises one", () => {
    // level 4, list 2, slot 1 — the same spell as above, whose record is 2 * 30 + 4 * 3 + 1.
    const game = newMwGame({ rng: scripted([4, 2, 1]), pc: { cls: 3, floor: 30 } });
    spellbookFind(game);
    expect(game.messages).toContain('HIT ANY KEY FOR A DESCRIPTION');
    // load_spell_lines (WORLD.EXE 3000:b7fd) reads the record and the box after it prints it.
    for (const line of mwSpellHelp(mwSpellRecord(2, 5, 1))) {
      if (line !== '') expect(game.messages).toContain(line);
    }
  });

  it('rolls the level again over ten when the first roll runs too deep', () => {
    const game = newMwGame({ rng: scripted([10, 7, 0, 0]), pc: { cls: 3, floor: 60 } });
    spellbookFind(game);
    expect(game.pc.spellbook[7 * 3]).toBe(1);
  });

  it('turns down the list the class will not learn', () => {
    const priest = newMwGame({ rng: scripted([0, 2, 0]), pc: { cls: 4, floor: 30 } });
    spellbookFind(priest);
    expect(priest.messages).toEqual([]);

    const mage = newMwGame({ rng: scripted([0, 3, 0]), pc: { cls: 6, floor: 30 } });
    spellbookFind(mage);
    expect(mage.messages).toEqual([]);
  });

  it('gives fighters and monks nothing', () => {
    for (const cls of [0, 2]) {
      const game = newMwGame({ rng: scripted([0, 0, 0]), pc: { cls, floor: 30 } });
      spellbookFind(game);
      expect(game.messages).toEqual([]);
    }
  });

  it('makes a sage clear two rolls nobody else has to', () => {
    const rejected = newMwGame({ rng: scripted([176]), pc: { cls: 5, floor: 30 } });
    spellbookFind(rejected);
    expect(rejected.messages).toEqual([]);

    const second = newMwGame({ rng: scripted([175, 141]), pc: { cls: 5, floor: 30 } });
    spellbookFind(second);
    expect(second.messages).toEqual([]);

    const found = newMwGame({ rng: scripted([175, 140, 0, 0, 0]), pc: { cls: 5, floor: 30 } });
    spellbookFind(found);
    expect(found.pc.spellbook[0]).toBe(1);
  });

  it('offers nothing the character already knows', () => {
    const known = Array.from({ length: 180 }, () => 0);
    known[0] = 1;
    const game = newMwGame({ rng: scripted([0, 0, 0]), pc: { cls: 3, floor: 30, spellbook: known } });
    spellbookFind(game);
    expect(game.messages).toEqual([]);
  });
});

describe('scrollFind', () => {
  it('needs a roll of fifteen or less over 350 less the floor', () => {
    const missed = newMwGame({ rng: scripted([16]), pc: { cls: 3, floor: 30 } });
    scrollFind(missed);
    expect(missed.messages).toEqual([]);

    const found = newMwGame({ rng: scripted([15, 2, 1, 0]), pc: { cls: 3, floor: 30 } });
    scrollFind(found);
    expect(found.pc.scrolls[45 + 2 * 3]).toBe(1);
  });

  it('stacks a second copy of the same scroll', () => {
    const scrolls = Array.from({ length: 180 }, () => 0);
    scrolls[0] = 2;
    const game = newMwGame({ rng: scripted([0, 0, 0, 0]), pc: { cls: 3, floor: 30, scrolls } });
    scrollFind(game);
    expect(game.pc.scrolls[0]).toBe(3);
  });
});

describe('wandFind', () => {
  it('holds two to six charges and never comes from the permanent list', () => {
    const game = newMwGame({ rng: scripted([0, 0, 0, 0, 4]), pc: { cls: 1, floor: 120 } });
    wandFind(game);
    expect(game.pc.wands[45]).toBe(6);
    expect(game.messages).toContain('YOU FOUND A WAND WITH 6 CHARGES.');
  });

  it('hands a worshipper a wizard wand they could not learn as a spell', () => {
    const game = newMwGame({ rng: scripted([0, 0, 1, 0, 0]), pc: { cls: 1, floor: 120 } });
    wandFind(game);
    expect(game.pc.wands[2 * 45]).toBe(2);
  });
});

describe('paperFind', () => {
  it('is the only writing a fighter can find', () => {
    const game = newMwGame({ rng: scripted([0, 0, 0, 0]), pc: { cls: 0, floor: 80 } });
    paperFind(game);
    expect(game.pc.paper[0]).toBe(1);
  });

  it('gives a monk nothing', () => {
    const game = newMwGame({ rng: scripted([0, 0, 0, 0]), pc: { cls: 2, floor: 80 } });
    paperFind(game);
    expect(game.messages).toEqual([]);
  });
});

describe('specialFind', () => {
  it('draws one of twelve items flat', () => {
    const grenade = newMwGame({ rng: scripted([0]) });
    specialFind(grenade);
    expect(grenade.pc.grenades).toBe(1);

    const luck = newMwGame({ rng: scripted([11]), pc: { luck: 12 } });
    specialFind(luck);
    expect(luck.pc.luck).toBe(13);
  });

  it('refuses a second floor slosher', () => {
    const game = newMwGame({ rng: scripted([3]), pc: { floorSloshers: 1 } });
    specialFind(game);
    expect(game.pc.floorSloshers).toBe(1);
    expect(game.messages).toContain('OH WELL! YOU ALREADY HAVE');
  });

  it('gives a monk nothing', () => {
    const game = newMwGame({ rng: scripted([0]) });
    game.pc.cls = 2;
    specialFind(game);
    expect(game.pc.grenades).toBe(0);
  });
});
