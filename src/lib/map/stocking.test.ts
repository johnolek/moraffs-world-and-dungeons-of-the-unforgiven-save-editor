import { describe, expect, it } from 'vitest';
import { isPuffball, recolouredId } from '../bestiary/monsters';
import { sectionOf } from '../game/dotu-files.js';
import { MONSTER_TYPE_ODDS, monsterHpRange, monsterLevelBase } from '../game/dotu-mech.js';
import { bundledDungeon } from '../game/dungeon';
import { FAITHFUL_RULES } from '../game/port/rules';
import { sectionInfo } from '../game/sections';
import { UNFORGIVEN_AREA } from './area';
import {
  MONSTER_SLOTS,
  beyondMapCount,
  groupedMonsterCounts,
  monsterAt,
  monsterById,
  monsterCounts,
  stockFloor,
  stockingSection,
  UNFORGIVEN_STOCKING,
  type StockedMonster,
} from './stocking';

/** A repeatable stand-in for Math.random, so a failing floor can be reproduced. Math.imul
 *  keeps the multiplication exact, which the full period of the generator depends on. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const floorOf = (module: number, level: number) => bundledDungeon.floor(level, module);

describe('stockFloor', () => {
  it('puts one monster on each of 145 distinct open squares', () => {
    const rows = floorOf(2, 31);
    const monsters = stockFloor(FAITHFUL_RULES, rows, 2, 31, seeded(5));
    expect(monsters).toHaveLength(MONSTER_SLOTS);
    for (const monster of monsters) expect(rows[monster.y][monster.x].solid).toBe(false);
    const squares = new Set(monsters.map((monster) => `${monster.x},${monster.y}`));
    expect(squares.size).toBe(MONSTER_SLOTS);
  });

  it('numbers the slots in order', () => {
    const monsters = stockFloor(FAITHFUL_RULES, floorOf(0, 3), 0, 3, seeded(9));
    expect(monsters.map((monster) => monster.slot)).toEqual(monsters.map((_, i) => i));
  });

  it('gives slot 0 to the Shadow boss on a boss floor and to nothing else elsewhere', () => {
    const boss = stockFloor(FAITHFUL_RULES, floorOf(0, 5), 0, 5, seeded(13));
    expect(monsterById(boss[0].monsterId).name).toBe(sectionInfo(0, 5)!.bossName);
    expect(boss.slice(1).some((monster) => monsterById(monster.monsterId).isBoss)).toBe(false);

    const plain = stockFloor(FAITHFUL_RULES, floorOf(0, 4), 0, 4, seeded(13));
    expect(plain.some((monster) => monsterById(monster.monsterId).isBoss)).toBe(false);
  });

  it('leaves a Shadow boss who has been killed off his floor', () => {
    const section = sectionInfo(0, 5)!;
    const beaten = stockFloor(FAITHFUL_RULES, floorOf(0, 5), 0, 5, seeded(13), [], true);
    expect(beaten.some((monster) => monsterById(monster.monsterId).isBoss)).toBe(false);

    const anotherSectionsBoss = stockFloor(FAITHFUL_RULES, floorOf(0, 5), 0, 5, seeded(13), [], false);
    expect(monsterById(anotherSectionsBoss[0].monsterId).name).toBe(section.bossName);
  });

  it('places the Shadow boss in the middle 50 squares of both axes', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const [boss] = stockFloor(FAITHFUL_RULES, floorOf(1, 20), 1, 20, seeded(seed));
      expect(boss.x).toBeGreaterThanOrEqual(25);
      expect(boss.x).toBeLessThanOrEqual(74);
      expect(boss.y).toBeGreaterThanOrEqual(25);
      expect(boss.y).toBeLessThanOrEqual(74);
    }
  });

  it('rolls a level near the floor base and hit points that fit the monster', () => {
    const base = monsterLevelBase(41, 4);
    for (const monster of stockFloor(FAITHFUL_RULES, floorOf(4, 41), 4, 41, seeded(17))) {
      expect(Math.abs(monster.level - base)).toBeLessThanOrEqual(15);
      const entry = monsterById(monster.monsterId);
      const section = entry.origin.kind === 'section' ? entry.origin.section : 1;
      const [lo, hi] = monsterHpRange(entry.type.hpPerLevel, base, entry.isBoss, section);
      expect(monster.hp).toBeGreaterThanOrEqual(lo);
      expect(monster.hp).toBeLessThanOrEqual(hi);
    }
  });

  it('rolls the hit points from the floor base and not from the nudged level', () => {
    const base = monsterLevelBase(12, 0);
    const monsters = stockFloor(FAITHFUL_RULES, floorOf(0, 12), 0, 12, seeded(8));
    // On this seed slot 1 is a Striker stocked at level 9 on a level 12 floor, holding more hit
    // points than level 9 could ever roll.
    const nudgedDown = monsters[1];
    const entry = monsterById(nudgedDown.monsterId);
    expect(nudgedDown.level).toBeLessThan(base);
    const [, hiForItsLevel] = monsterHpRange(entry.type.hpPerLevel, nudgedDown.level);
    const [, hiForTheFloor] = monsterHpRange(entry.type.hpPerLevel, base);
    expect(nudgedDown.hp).toBeGreaterThan(hiForItsLevel);
    expect(nudgedDown.hp).toBeLessThanOrEqual(hiForTheFloor);
  });

  it('leaves a floor the game could not stock empty', () => {
    expect(stockFloor(FAITHFUL_RULES, floorOf(0, -5), 0, -5, seeded(3))).toEqual([]);
  });

  it('picks the monster kinds about as often as the game does', () => {
    const rnd = seeded(23);
    const monsters: StockedMonster[] = [];
    for (let i = 0; i < 50; i++) monsters.push(...stockFloor(FAITHFUL_RULES, floorOf(0, 12), 0, 12, rnd));
    for (const [kind, odds] of Object.entries(MONSTER_TYPE_ODDS)) {
      const share = monsters.filter((monster) => kindOf(monster.monsterId) === kind).length / monsters.length;
      expect(Math.abs(share - odds)).toBeLessThan(0.02);
    }
  });
});

function kindOf(id: string): keyof typeof MONSTER_TYPE_ODDS {
  const entry = monsterById(id);
  if (entry.origin.kind === 'section') return entry.origin.slot === 26 ? 'levelDrainer' : 'sectionMonster';
  if (isPuffball(entry)) return 'puffball';
  return entry.special === 0 ? 'blocker' : 'poisonDisease';
}

describe('a monster asked for by a repainted id', () => {
  it('is the monster it was painted from, in the colour set the id names', () => {
    const own = monsterById('section-7-24');
    const repainted = monsterById(recolouredId('section-7-24', 2));
    expect(repainted.colorSet).toBe(2);
    expect(own.colorSet).not.toBe(2);
    expect({ ...repainted, id: own.id, colorSet: own.colorSet }).toEqual(own);
  });

  it('is refused when the monster it names is nobody', () => {
    expect(() => monsterById(recolouredId('section-99-24', 1))).toThrow();
  });
});

describe('stockingSection', () => {
  it('names the section a floor of the module draws its monsters from', () => {
    expect(stockingSection(FAITHFUL_RULES, 0, 3)).toMatchObject({ section: 1 });
    expect(stockingSection(FAITHFUL_RULES, 0, 30000)).toMatchObject({ section: 4 });
  });

  it('has no section for a floor below the sections of the module', () => {
    expect(stockingSection(FAITHFUL_RULES, 0, -5)).toBeNull();
    // Section 16 is the fourth of Module IV, so Module V cannot load it.
    expect(sectionOf(4, -24)).toBe(16);
    expect(stockingSection(FAITHFUL_RULES, 4, -24)).toBeNull();
  });

  it('has no section where the monsters would come out below level 1', () => {
    expect(sectionOf(0, -1)).toBe(1);
    expect(monsterLevelBase(-1, 0)).toBe(-1);
    expect(stockingSection(FAITHFUL_RULES, 0, -1)).toBeNull();
    expect(stockingSection(FAITHFUL_RULES, 0, 0)).toBeNull();
  });
});

describe('monsterCounts', () => {
  it('counts each type, commonest first, with the Shadow boss at the top', () => {
    const monsters = stockFloor(FAITHFUL_RULES, floorOf(0, 5), 0, 5, seeded(31));
    const counts = monsterCounts(monsters);
    expect(counts[0].name).toBe(sectionInfo(0, 5)!.bossName);
    expect(counts[0].count).toBe(1);
    expect(counts.reduce((total, entry) => total + entry.count, 0)).toBe(MONSTER_SLOTS);
    for (const entry of counts) {
      expect(entry.count).toBe(monsters.filter((monster) => monster.monsterId === entry.monsterId).length);
    }
    const withoutBoss = counts.slice(1).map((entry) => entry.count);
    expect(withoutBoss).toEqual([...withoutBoss].sort((a, b) => b - a));
  });
});

describe('groupedMonsterCounts', () => {
  const listOf = (ids: string[]): StockedMonster[] => ids.map((monsterId, slot) => ({ slot, x: slot, y: 0, monsterId, level: 5, hp: 20 }));

  it('groups the types in a fixed order, commonest first within each group', () => {
    const groups = groupedMonsterCounts(
      listOf([
        'section-1-22',
        'section-1-23',
        'section-1-23',
        'section-1-26',
        'builtin-0',
        'builtin-2',
        'builtin-14',
        'builtin-18',
        'builtin-18',
      ]),
    );
    expect(groups.map((group) => group.label)).toEqual(['Shadow boss', 'This section', 'Everywhere', 'Puffballs', 'Poison and disease']);
    expect(groups.map((group) => group.counts.map((entry) => [entry.monsterId, entry.count]))).toEqual([
      [['section-1-22', 1]],
      [
        ['section-1-23', 2],
        ['section-1-26', 1],
      ],
      [['builtin-0', 1]],
      [['builtin-2', 1]],
      [
        ['builtin-18', 2],
        ['builtin-14', 1],
      ],
    ]);
  });

  it('leaves out the groups the floor holds none of', () => {
    expect(groupedMonsterCounts(listOf(['builtin-2', 'builtin-0'])).map((group) => group.label)).toEqual(['Everywhere', 'Puffballs']);
    expect(groupedMonsterCounts([])).toEqual([]);
  });

  it('holds every type a stocked floor has, and counts them as the flat list does', () => {
    const monsters = stockFloor(FAITHFUL_RULES, floorOf(0, 5), 0, 5, seeded(31));
    const grouped = groupedMonsterCounts(monsters).flatMap((group) => group.counts);
    expect(grouped).toHaveLength(monsterCounts(monsters).length);
    expect(grouped.reduce((total, entry) => total + entry.count, 0)).toBe(MONSTER_SLOTS);
  });
});

describe('beyondMapCount', () => {
  it('counts the monsters standing outside the area the game shows', () => {
    const monsters: StockedMonster[] = [
      { slot: 0, x: 78, y: 103, monsterId: 'builtin-0', level: 5, hp: 20 },
      { slot: 1, x: 79, y: 10, monsterId: 'builtin-0', level: 5, hp: 20 },
      { slot: 2, x: 10, y: 104, monsterId: 'builtin-0', level: 5, hp: 20 },
      { slot: 3, x: 10, y: 109, monsterId: 'builtin-0', level: 5, hp: 20 },
    ];
    expect(beyondMapCount(monsters, UNFORGIVEN_AREA)).toBe(3);
    expect(beyondMapCount([], UNFORGIVEN_AREA)).toBe(0);
  });

  it('finds about one monster in twenty beyond it on a stocked floor', () => {
    const monsters = stockFloor(FAITHFUL_RULES, floorOf(0, 12), 0, 12, seeded(41));
    expect(beyondMapCount(monsters, UNFORGIVEN_AREA)).toBeGreaterThan(0);
    expect(beyondMapCount(monsters, UNFORGIVEN_AREA)).toBeLessThan(monsters.length / 4);
  });
});

describe('monsterAt', () => {
  it('finds the monster standing on a square, if any', () => {
    const monsters = stockFloor(FAITHFUL_RULES, floorOf(0, 7), 0, 7, seeded(29));
    const [first] = monsters;
    expect(monsterAt(monsters, first.x, first.y)).toBe(first);
    const free = monsters.reduce((x, monster) => Math.max(x, monster.x), 0) + 1;
    expect(monsterAt(monsters, free, first.y)).toBeNull();
  });
});

describe('UNFORGIVEN_STOCKING', () => {
  it('names a monster with the level and hit points it was stocked with', () => {
    const monster: StockedMonster = { slot: 3, x: 12, y: 40, monsterId: 'builtin-0', level: 7, hp: 43 };
    expect(UNFORGIVEN_STOCKING.describe(monster)).toBe('Giant Garbage Can · level 7 · 43 HP');
  });

  it('stocks the floors the game stocks and no others', () => {
    expect(UNFORGIVEN_STOCKING.stocks(0, 12)).toBe(true);
    expect(UNFORGIVEN_STOCKING.stocks(0, 0)).toBe(false);
  });
});
