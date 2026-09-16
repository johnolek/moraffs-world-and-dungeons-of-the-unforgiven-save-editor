import { describe, expect, it } from 'vitest';
import { SWING_ROLL_VALUES, swingRoll, TICK_MS } from './sawtooth';

/**
 * Borland's generator worked out by hand: srand (exe 1000:18a5) puts the low sixteen bits of the
 * seed in the state, rand (exe 1000:18b6) advances it by `state * 0x015A4E35 + 1` and hands back
 * `(state >> 16) & 0x7fff`, and a roll is that scaled by `n / 0x8000`.
 */
function byHand(seed: number, n: number): number {
  const state = (Math.imul(seed & 0xffff, 0x015a4e35) + 1) >>> 0;
  return Math.trunc((((state >>> 16) & 0x7fff) * n) / 0x8000);
}

describe('the roll a swing made at a given tick would get', () => {
  it('is srand(tick) and then random(80), which is what strike does', () => {
    expect(swingRoll(0)).toBe(byHand(0, SWING_ROLL_VALUES));
    expect(swingRoll(1234)).toBe(byHand(1234, SWING_ROLL_VALUES));
    // The counter is counted from the page and a long session runs past the sixteen bits srand
    // keeps, so a reading above them is the reading with the top bits thrown away.
    expect(swingRoll(0x10000 + 1234)).toBe(swingRoll(1234));
  });

  it('climbs about 0.85 a tick and drops back every 95 of them', () => {
    const rolls = Array.from({ length: 200 }, (_, tick) => swingRoll(tick));
    expect(rolls.slice(0, 10)).toEqual([0, 0, 1, 2, 3, 4, 5, 5, 6, 7]);
    expect(rolls[94]).toBe(SWING_ROLL_VALUES - 1);
    expect(rolls[95]).toBe(0);
  });

  it('is worth redrawing once a tick', () => {
    expect(TICK_MS).toBeCloseTo(54.9, 1);
  });
});
