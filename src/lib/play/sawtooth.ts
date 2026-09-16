import { BorlandRand } from '../game/unfmap.js';

/**
 * The sawtooth a swing's to-hit roll follows in real time, which debug mode draws as a bar.
 *
 * `strike` (exe 2000:7e36) seeds the generator from the tick counter at 2000:7e63 and its to-hit
 * roll is the first number out of it, so the roll a swing will get is settled by the moment it is
 * made rather than by anything the game has rolled before. Borland's generator answers seeds one
 * apart with numbers 346 apart out of the 32768 it can return, so that roll climbs in a straight
 * line and wraps: section 8.3 of `dotu-tools/docs/UNFORGIVEN-RE-NOTES.md`, and "Swing on the beat"
 * in the Tidbits tab.
 *
 * Nothing here touches the game or the run log. It reads the counter and works out what a swing
 * would roll; the swing itself rolls it again out of the game's own generator when it happens.
 */

/** How many times a second the PC's tick counter counts (exe 1000:11b4). */
export const TICKS_A_SECOND = 18.2;

/** How long one tick of the counter lasts, which is how often a display of it is worth redrawing. */
export const TICK_MS = 1000 / TICKS_A_SECOND;

/** The swing's roll is random(80), an integer from 0 to 79 (exe 2000:7e89). */
export const SWING_ROLL_VALUES = 80;

/**
 * The to-hit roll a swing made at this tick would get: `srand(tick)` and then `random(80)`, which
 * is exactly what `strike` does with the reading it takes.
 */
export function swingRoll(tick: number): number {
  return new BorlandRand(tick & 0xffff).random(SWING_ROLL_VALUES);
}

