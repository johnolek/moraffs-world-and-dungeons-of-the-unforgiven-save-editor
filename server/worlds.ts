import { randomInt } from 'node:crypto';
import type { Queries } from './sql';

/**
 * The endless world every endless character rolled now is rolled into.
 *
 * A world is one number. Two characters rolled into the same one meet the same monsters on the
 * same floor and see the same sections, so a board of the endless dungeon is one world's own.
 *
 * The number is the newest row of `worlds`, and it changes when the admin says so and at no other
 * time: there is no schedule and nothing rolls a new world over anybody's head. A character takes
 * the world at the roll and keeps it for life, so the worlds before are still played, still
 * replayed by the server, and still have boards of their own.
 */

/** The world being rolled into now, which is the newest row: the ids count up, so two worlds set
 *  in the same moment still have an order. The table is never empty — the migration puts world 1
 *  in it and nothing is ever taken out. */
export async function currentEndlessWorld(sql: Queries): Promise<number> {
  const newest = await sql.query<{ seed: number }>('SELECT seed FROM worlds ORDER BY id DESC LIMIT 1');
  return newest[0].seed;
}

/** Sets a new endless world, which every endless character rolled from now on is rolled into and
 *  which every character already rolled is left out of. */
export async function setEndlessWorld(sql: Queries, world: { seed: number; by: number }): Promise<void> {
  await sql.query('INSERT INTO worlds (seed, set_by) VALUES ($1, $2)', [world.seed, world.by]);
}

/**
 * How large a world's number may be.
 *
 * The seed is mixed into a 32-bit value to draw a section (`endlessSection` in
 * `src/lib/game/endless/monsters.ts`), so a number past what a signed 32-bit integer holds names
 * the same dungeon as some number below it and is only a longer thing to type.
 */
const MOST_WORLD_SEED = 2 ** 31 - 1;

/** Whether this is a number a world can be. */
export function isEndlessWorldSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MOST_WORLD_SEED;
}

/** A world drawn at random, for an admin who wants a fresh dungeon and does not mind which. */
export function drawEndlessWorld(): number {
  return randomInt(1, MOST_WORLD_SEED + 1);
}
