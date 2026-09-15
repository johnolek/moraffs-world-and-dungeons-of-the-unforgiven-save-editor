import { BorlandRand } from '../unfmap.js';

/**
 * Where a ported function gets its random numbers.
 *
 * A roll in the game is `rand() * n / 0x8000` — `rand` is exe 1000:18b6 — worked out in 32-bit
 * signed arithmetic and truncated toward zero, so it hands back an integer in 0..n-1.
 * `random(0)` is 0, and a negative n gives a value between n + 1 and 0 rather than 0, because
 * nothing clamps the multiply.
 *
 * The game writes that arithmetic inline at most of its rolls and wraps it in `Random(n)` (exe
 * 2000:4156, unf.c "Random") at the rest. The two differ only in that `Random` reseeds from the
 * PC's tick counter before it rolls, which this port does not model; section 8 of
 * `dotu-tools/docs/UNFORGIVEN-RE-NOTES.md` is every reseed in the game and the README's third
 * departure is where the port stands on them.
 */
export interface Rng {
  /** A roll of `rand() * n / 0x8000`: an integer in 0..n-1. */
  random(n: number): number;
  /**
   * srand (exe 1000:18a5, unf.c "srand"): start the generator again from this seed. The
   * original takes sixteen bits of it, puts them in the low word of the generator's state and
   * zeroes the high word.
   *
   * Optional, because most of the generators a game is handed have no seed to put back — a
   * scripted one in a test, or the browser's own. Only a game played on the clock reseeds at
   * all, which is what `Game.clock` decides, and such a game is handed a {@link BorlandRng}.
   */
  reseed?(seed: number): void;
}

/**
 * Borland's generator, which is the one the original runs.
 *
 * A test that has to match the game's own numbers rolls with this, and so does a game played on
 * the clock: the tick counter supplies the seeds and this turns them into rolls. Given no seeds
 * it runs as one continuous sequence from the one it was built with, which is what makes a test
 * repeatable.
 */
export class BorlandRng implements Rng {
  private borland: BorlandRand;

  constructor(seed: number) {
    this.borland = new BorlandRand(seed);
  }

  random(n: number): number {
    return this.borland.random(n);
  }

  /** A generator built on the low sixteen bits is the state srand leaves behind. */
  reseed(seed: number): void {
    this.borland = new BorlandRand(seed & 0xffff);
  }
}

/**
 * A roll of `rand() * n / 0x8000` over mulberry32, which is what a game being played uses.
 *
 * The README's third departure: the original reseeds from the clock before nearly every roll,
 * which is why its numbers fall into patterns a player can feel. This is one continuous sequence
 * from a seed drawn once at the start of a run, so the numbers are as good as a small generator
 * gets and the run can be played again from the seed alone. `src/lib/play/run.ts` is what draws
 * the seed and keeps it.
 *
 * mulberry32 is a well-known 32-bit generator, given here exactly as it is published: one addition
 * to the state and three multiply-and-mix steps, all in 32-bit arithmetic. `rand()` in the game is
 * fifteen bits, so only the top fifteen of each word are used.
 */
export class SeededRng implements Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** The fifteen bits rand (exe 1000:18b6) hands a roll, out of mulberry32's word. */
  rand(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let word = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    word = (word + Math.imul(word ^ (word >>> 7), 61 | word)) ^ word;
    return ((word ^ (word >>> 14)) >>> 0) >>> 17;
  }

  random(n: number): number {
    return Math.trunc((this.rand() * n) / 0x8000);
  }

  reseed(seed: number): void {
    this.state = seed >>> 0;
  }
}
