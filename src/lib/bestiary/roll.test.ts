import { describe, expect, it } from 'vitest';
import { monsterHpRange } from '../game/dotu-mech.js';
import { allMonsters, type Monster } from './monsters';
import { FAITHFUL_RULES } from '../game/port/rules';
import { nudgeLevel, rollHp } from './roll';

/** A repeatable stand-in for Math.random, so a failing roll can be reproduced. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Hands out the given values in order, then zero. */
function scripted(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0;
}

const named = (name: string): Monster => allMonsters().find((m) => m.name === name)!;

describe('nudgeLevel', () => {
  it('leaves the level alone while the 1 in 3 roll fails', () => {
    expect(nudgeLevel(40, () => 0.9, FAITHFUL_RULES.monsterLevelMax)).toBe(40);
  });

  it('sends a level nudged outside 1..210 back to 1', () => {
    // Four steps down from level 3, then a roll that ends the loop.
    expect(nudgeLevel(3, scripted([0, 0, 0, 0, 0, 0, 0, 0, 0.9]), FAITHFUL_RULES.monsterLevelMax)).toBe(1);
    // 210 is the last level that stands: one step up from 209 keeps it, three steps do not.
    expect(nudgeLevel(209, scripted([0, 0.9, 0.9]), FAITHFUL_RULES.monsterLevelMax)).toBe(210);
    expect(nudgeLevel(209, scripted([0, 0.9, 0, 0.9, 0, 0.9, 0.9]), FAITHFUL_RULES.monsterLevelMax)).toBe(1);
  });

  it('stays within a step of the base for most rolls', () => {
    const rnd = seeded(7);
    const levels = Array.from({ length: 5000 }, () => nudgeLevel(60, rnd, FAITHFUL_RULES.monsterLevelMax));
    expect(Math.min(...levels)).toBeGreaterThan(45);
    expect(Math.max(...levels)).toBeLessThan(75);
  });
});

describe('rollHp', () => {
  it('always lands inside monsterHpRange', () => {
    const rnd = seeded(11);
    for (const entry of allMonsters()) {
      const section = entry.origin.kind === 'section' ? entry.origin.section : 1;
      for (const level of [1, 7, 61, 210]) {
        const [lo, hi] = monsterHpRange(entry.type.hpPerLevel, level, entry.isBoss, section);
        for (let i = 0; i < 40; i++) {
          const hp = rollHp(entry, level, rnd, FAITHFUL_RULES);
          expect(hp).toBeGreaterThanOrEqual(lo);
          expect(hp).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it('gives a Shadow boss 20 per level on top, doubled in the last three sections', () => {
    const lowest = () => 0;
    expect(rollHp(named('Shadow Vulture'), 10, lowest, FAITHFUL_RULES)).toBe(1 + 200);
    expect(rollHp(named('Shadow Stone Giant'), 10, lowest, FAITHFUL_RULES)).toBe((1 + 200) * 2);
  });
});
