import { describe, expect, it } from 'vitest';
import { BorlandRng, SeededRng } from './rng';

/**
 * The vector below is mulberry32 as it is published, run against this implementation and against
 * a second one written from the same published code, which agree. The first word the generator
 * makes from seed 1 is 2,693,262,067, which as a fraction is the 0.6270739405881613 every copy of
 * mulberry32 on the web starts with.
 */
const SEED_ONE = [20547, 89, 17283, 32147, 31731, 9211, 20081, 23617];
const SEED_439041101 = [8256, 19592, 4285, 23458, 30632, 2095, 6137, 17503];

describe('SeededRng', () => {
  it('makes the fifteen bits mulberry32 is known to make', () => {
    const generator = new SeededRng(1);
    expect(Array.from({ length: SEED_ONE.length }, () => generator.rand())).toEqual(SEED_ONE);
  });

  it('makes them for another seed too', () => {
    const generator = new SeededRng(0x1a2b3c4d);
    expect(Array.from({ length: SEED_439041101.length }, () => generator.rand())).toEqual(SEED_439041101);
  });

  it('starts again from the same seed', () => {
    const first = new SeededRng(7);
    const second = new SeededRng(7);
    const drawn = Array.from({ length: 50 }, () => first.random(100));
    expect(Array.from({ length: 50 }, () => second.random(100))).toEqual(drawn);
  });

  it('divides the fifteen bits up the way Random does', () => {
    const bits = new SeededRng(0x1a2b3c4d);
    const values = new SeededRng(0x1a2b3c4d);
    for (const bit of SEED_439041101) {
      void bits.rand();
      expect(values.random(100)).toBe(Math.trunc((bit * 100) / 0x8000));
    }
  });

  it('answers 0 for Random(0), as the game does', () => {
    expect(new SeededRng(3).random(0)).toBe(0);
  });

  it('is not the generator the original had', () => {
    const seeded = new SeededRng(1);
    const borland = new BorlandRng(1);
    expect(Array.from({ length: 8 }, () => seeded.random(1000))).not.toEqual(
      Array.from({ length: 8 }, () => borland.random(1000)),
    );
  });
});

/**
 * Borland's generator worked out by hand: srand (exe 1000:18a5) puts the low sixteen bits of the
 * seed in the state, rand (exe 1000:18b6) advances it by `state * 0x015A4E35 + 1` and hands back
 * `(state >> 16) & 0x7fff`, and a roll is that scaled by `n / 0x8000`.
 */
function byHand(seed: number, n: number): number {
  const state = (Math.imul(seed & 0xffff, 0x015a4e35) + 1) >>> 0;
  return Math.trunc((((state >>> 16) & 0x7fff) * n) / 0x8000);
}

describe('BorlandRng', () => {
  it('rolls what the generator rolls, worked out by hand', () => {
    expect(new BorlandRng(1).random(80)).toBe(byHand(1, 80));
    expect(new BorlandRng(4321).random(1000)).toBe(byHand(4321, 1000));
  });

  it('starts again from the seed it is reseeded with', () => {
    const generator = new BorlandRng(1);
    for (let roll = 0; roll < 10; roll++) void generator.random(100);
    generator.reseed(4321);
    expect(generator.random(1000)).toBe(byHand(4321, 1000));
  });

  it('keeps only the sixteen bits srand keeps', () => {
    const wide = new BorlandRng(1);
    wide.reseed(0x10000 + 4321);
    expect(wide.random(1000)).toBe(byHand(4321, 1000));
  });

  it('answers consecutive seeds with numbers that climb, which is the sawtooth', () => {
    const rolls = Array.from({ length: 200 }, (_, tick) => {
      const generator = new BorlandRng(0);
      generator.reseed(tick);
      return generator.random(80);
    });
    expect(rolls.slice(0, 10)).toEqual([0, 0, 1, 2, 3, 4, 5, 5, 6, 7]);
    expect(rolls[94]).toBe(79);
    expect(rolls[95]).toBe(0);
    expect(rolls.filter((roll, at) => at > 0 && roll < rolls[at - 1])).toHaveLength(2);
  });
});
