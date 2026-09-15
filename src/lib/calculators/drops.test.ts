import { describe, expect, it } from 'vitest';
import { dropOdds } from '../game/dotu-mech.js';
import { drainerShare, dropTables, expectedKills, type DropRow } from './drops';

const FIGHTER = 0;
const MONK = 2;
const MAGE = 6;
const SAGE = 5;

const hunt = (over: Partial<Parameters<typeof dropTables>[0]> = {}) => ({
  module: 0,
  floor: 20,
  cls: MAGE,
  ownedWeapons: [],
  ...over,
});

const chanceOf = (rows: DropRow[], name: string) => rows.find((row) => row.name.startsWith(name))!.chance;

describe('dropTables', () => {
  it('offers the same weapons and armor on every floor, since the roll never sees the monster', () => {
    const shallow = dropTables(hunt({ floor: 2 }));
    const deep = dropTables(hunt({ floor: 100 }));
    expect(deep.weapons).toEqual(shallow.weapons);
    expect(deep.armors).toEqual(shallow.armors);
  });

  it('rolls the weapons against a level of zero', () => {
    const greatSword = chanceOf(dropTables(hunt()).weapons, 'Great Sword');
    expect(greatSword).toBeCloseTo((1 / 7) * (11 / 700), 12);
  });

  it('leaves out the weapons the character already owns', () => {
    const tables = dropTables(hunt({ ownedWeapons: [1, 7] }));
    expect(tables.weapons.map((row) => row.name)).toEqual(['Club', 'Mace', 'Knife', 'Short Sword', 'Long Sword']);
  });

  it('gives a monk no gear and no items at all', () => {
    const tables = dropTables(hunt({ cls: MONK }));
    expect(tables.weapons.every((row) => row.chance === 0)).toBe(true);
    expect(tables.armors.every((row) => row.chance === 0)).toBe(true);
    expect(tables.items.every((row) => row.chance === 0)).toBe(true);
    expect(tables.findGate).toBe(0);
  });

  it('leaves a fighter papers as the only spell source', () => {
    const spells = dropTables(hunt({ cls: FIGHTER })).spells;
    expect(chanceOf(spells, 'Spell book roll')).toBe(0);
    expect(chanceOf(spells, 'Scroll')).toBe(0);
    expect(chanceOf(spells, 'Wand')).toBe(0);
    expect(chanceOf(spells, 'Spell paper')).toBeGreaterThan(0);
  });

  it('gates a sage’s spell books and pays it better scrolls', () => {
    const sage = dropTables(hunt({ cls: SAGE })).spells;
    const mage = dropTables(hunt()).spells;
    expect(chanceOf(sage, 'Spell book roll')).toBeLessThan(chanceOf(mage, 'Spell book roll'));
    expect(chanceOf(sage, 'Scroll')).toBeGreaterThan(chanceOf(mage, 'Scroll'));
  });

  it('names the highest spell level each source reaches', () => {
    const spells = dropTables(hunt({ floor: 20 })).spells;
    expect(spells.map((row) => row.name)).toEqual([
      'Spell book rolled (a random spell up to level 10)',
      'Scroll (up to level 10)',
      'Wand (up to level 5)',
      'Spell paper (up to level 3)',
      'Cup of health (heals you)',
      'Ball of thought (+1 spell point)',
    ]);
  });

  it('is the "YOU FIND" gate that the twelve items are shared out from', () => {
    const tables = dropTables(hunt());
    expect(tables.items).toHaveLength(12);
    expect(tables.items[0].chance).toBeCloseTo((tables.findGate * 2) / 3 / 12, 12);
  });

  it('only offers a trap door key on the floors that have one', () => {
    expect(chanceOf(dropTables(hunt({ floor: 20 })).drainer, 'Trap door key')).toBeGreaterThan(0);
    expect(chanceOf(dropTables(hunt({ floor: 3 })).drainer, 'Trap door key')).toBe(0);
  });

  it('counts the drainer rewards against every kill, not just the drainer ones', () => {
    const tables = dropTables(hunt({ floor: 20 }));
    expect(chanceOf(tables.drainer, 'Stat potion')).toBeCloseTo(tables.drainerShare * dropOdds(20, MAGE).drainerPotion, 12);
  });

  it('pays nothing for a section whose drainer only takes experience', () => {
    // Sustrontima, on floors 1-5 of module I, drains 30 experience rather than a level.
    const tables = dropTables(hunt({ floor: 4 }));
    expect(tables.drainerShare).toBe(0);
    expect(tables.drainer.every((row) => row.chance === 0)).toBe(true);
  });
});

describe('drainerShare', () => {
  it('is how often a floor is stocked with a whole-level drainer', () => {
    expect(drainerShare(0, 20)).toBeCloseTo(0.0543, 4);
  });

  it('is nothing where the section drainer only takes experience', () => {
    expect(drainerShare(0, 5)).toBe(0);
  });
});

describe('expectedKills', () => {
  it('is one over the chance', () => {
    expect(expectedKills(0.25)).toBe(4);
  });

  it('is unreachable when the item cannot drop', () => {
    expect(expectedKills(0)).toBeNull();
  });
});
