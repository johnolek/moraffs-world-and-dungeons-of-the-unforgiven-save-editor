import { describe, expect, it } from 'vitest';
import { monsterLevelDistribution } from '../game/dotu-mech.js';
import { binHp, hpDistribution, levelDistribution, type HpChance } from './distribution';
import { allMonsters, type Monster } from './monsters';
import { FAITHFUL_RULES } from '../game/port/rules';
import { hpSpan, nudgeLevel, rollHp } from './roll';

/** A repeatable stand-in for Math.random, so a failing run can be reproduced. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const named = (name: string): Monster => allMonsters().find((m) => m.name === name)!;

const total = (distribution: { p: number }[]) => distribution.reduce((sum, { p }) => sum + p, 0);

/** Every hit point total rollHp can return, by walking both rolls over all their values. */
function everyRoll(entry: Monster, baseLevel: number): Map<number, number> {
  const out = new Map<number, number>();
  const span = hpSpan(entry, baseLevel);
  for (let a = 0; a < span; a++) {
    for (let b = 0; b < span; b++) {
      // random(rnd, span) truncates rnd() * span, so the midpoint of a slice picks that value.
      const rolls = [(a + 0.5) / span, (b + 0.5) / span];
      let i = 0;
      const hp = rollHp(entry, baseLevel, () => rolls[i++], FAITHFUL_RULES);
      out.set(hp, (out.get(hp) ?? 0) + 1 / (span * span));
    }
  }
  return out;
}

describe('levelDistribution', () => {
  it('is the game distribution as records', () => {
    const pairs = monsterLevelDistribution(30, 0);
    expect(levelDistribution(30)).toEqual(pairs.map(([level, p]) => ({ level, p })));
  });

  it('adds up to one', () => {
    expect(total(levelDistribution(30))).toBeCloseTo(1, 12);
  });
});

describe('hpDistribution', () => {
  it('adds up to one', () => {
    for (const entry of [named('White Puffball'), named('Shadow Stone Giant'), named('Walking Sword')]) {
      for (const baseLevel of [1, 12, 61, 210]) {
        expect(Math.abs(total(hpDistribution(entry, baseLevel)) - 1)).toBeLessThan(1e-9);
      }
    }
  });

  it('matches every hit point total rollHp can return', () => {
    const entry = named('White Puffball');
    const rolled = everyRoll(entry, 3);
    const computed = hpDistribution(entry, 3);
    expect(computed.map(({ hp }) => hp)).toEqual([...rolled.keys()].sort((a, b) => a - b));
    for (const { hp, p } of computed) expect(p).toBeCloseTo(rolled.get(hp)!, 12);
  });

  it('ends where rollHp does for a boss that gets the bonus and the doubling', () => {
    const entry = named('Shadow Stone Giant');
    const computed = hpDistribution(entry, 3);
    // Both rolls at their lowest, then both at their highest.
    expect(computed[0].hp).toBe(rollHp(entry, 3, () => 0, FAITHFUL_RULES));
    expect(computed[computed.length - 1].hp).toBe(rollHp(entry, 3, () => 0.999999, FAITHFUL_RULES));
  });

  it('matches what rolling monsters actually produces', () => {
    const entry = named('White Puffball');
    const baseLevel = 3;
    const rnd = seeded(42);
    const rounds = 200_000;
    const seen = new Map<number, number>();
    for (let i = 0; i < rounds; i++) {
      // The nudge is rolled and thrown away, so that this walks the generator the way a floor
      // being stocked does.
      const hp = rollHp(entry, baseLevel, rnd, FAITHFUL_RULES);
      nudgeLevel(baseLevel, rnd, FAITHFUL_RULES.monsterLevelMax);
      seen.set(hp, (seen.get(hp) ?? 0) + 1);
    }
    for (const { hp, p } of hpDistribution(entry, baseLevel)) {
      expect(Math.abs((seen.get(hp) ?? 0) / rounds - p)).toBeLessThan(0.01);
    }
  });
});

describe('binHp', () => {
  const flat = (from: number, to: number): HpChance[] =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ hp: from + i, p: 1 / (to - from + 1) }));

  it('gives every hit point total its own bar while they fit', () => {
    expect(binHp(flat(1, 4), 60)).toEqual([
      { from: 1, to: 1, p: 0.25 },
      { from: 2, to: 2, p: 0.25 },
      { from: 3, to: 3, p: 0.25 },
      { from: 4, to: 4, p: 0.25 },
    ]);
  });

  it('buckets a wider range into equal-width bars ending at the highest total', () => {
    const bins = binHp(flat(1, 100), 10);
    expect(bins.map(({ from, to }) => [from, to])).toEqual([
      [1, 10],
      [11, 20],
      [21, 30],
      [31, 40],
      [41, 50],
      [51, 60],
      [61, 70],
      [71, 80],
      [81, 90],
      [91, 100],
    ]);
    for (const bin of bins) expect(bin.p).toBeCloseTo(0.1, 12);
  });

  it('keeps the last bar inside the range when the width does not divide it', () => {
    const bins = binHp(flat(1, 95), 10);
    expect(bins.length).toBe(10);
    expect(bins[9].from).toBe(91);
    expect(bins[9].to).toBe(95);
    expect(bins[9].p).toBeCloseTo(5 / 95, 12);
    expect(total(bins)).toBeCloseTo(1, 12);
  });

  it('has nothing to draw for an empty distribution', () => {
    expect(binHp([])).toEqual([]);
  });
});
