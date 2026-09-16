/**
 * What it takes to land a swing, worked out in closed form from the rolls strike() makes.
 *
 * The port's strike() adds random(80) to your to-hit total, subtracts the monster's
 * 2 * level + defense + speed, and rolls one weapon damage die for every full 40 points the
 * result is over 40. Nothing in that is random except the one roll and those dice, so the
 * chances can be counted rather than sampled. The 1-in-30 bonus of +40 that a swing past floor
 * 75 can roll is left out, so these odds are exact down to that floor and a little low past it.
 */

/** The swing's roll is random(80), an integer from 0 to 79. */
const ROLL_VALUES = 80;
/** What the roll plus your net total has to beat before the swing rolls any damage at all. */
const HIT_OVER = 40;

/** The pieces of a character that go into the to-hit total. */
export interface ToHitFighter {
  lev: number;
  str: number;
  luck: number;
  luckyCharms?: number;
  weaponHit?: number;
  gauntlet?: number;
  weaponPlus?: number;
  tempWeaponPlus?: number;
  /** Hard difficulty. Normal counts Strength a second time and adds 25 on top of a high one. */
  hard: boolean;
}

/**
 * The total a swing adds to its roll.
 *
 * @param fighter the character swinging, with the held weapon's to-hit as weaponHit
 */
export function toHitTotal(fighter: ToHitFighter): number {
  let total = 2 * fighter.lev + fighter.str;
  if (!fighter.hard) {
    if (fighter.str > 25) total += 25;
    total += fighter.str;
  }
  return (
    total +
    fighter.luck +
    (fighter.luckyCharms ?? 0) +
    (fighter.weaponHit ?? 0) +
    (fighter.gauntlet ?? 0) +
    (fighter.weaponPlus ?? 0) +
    (fighter.tempWeaponPlus ?? 0)
  );
}

/** What the monster takes off the swing before the roll is judged. */
function monsterDefense(monsterLevel: number, defense: number, speed: number): number {
  return 2 * monsterLevel + defense + speed;
}

/** How many of the 80 roll values get past the defense once the monster's share is taken off. */
function rollsPastDefense(net: number): number {
  return ROLL_VALUES - (HIT_OVER + 1 - net);
}

/**
 * How many damage dice one roll earns: one per full 40 points it is over 40.
 *
 * @param net the to-hit total less what the monster takes off
 * @param roll one of the 80 values random(80) can return
 */
function damageDice(net: number, roll: number): number {
  const over = roll + net - HIT_OVER;
  return over > 0 ? Math.ceil(over / HIT_OVER) : 0;
}

/**
 * The share of swings whose roll gets past the monster's defense, from a certain miss to a
 * certain hit over 80 points of total. Some of those swings roll no damage and read as misses;
 * hitChance is the number to show a player.
 *
 * @param total the swinging character's to-hit total, from toHitTotal
 */
export function defenseBeatenChance(total: number, monsterLevel: number, defense: number, speed: number): number {
  const net = total - monsterDefense(monsterLevel, defense, speed);
  return Math.max(0, Math.min(1, rollsPastDefense(net) / ROLL_VALUES));
}

/**
 * The chance one swing lands, given the value its random(80) came up with: the roll has to get
 * past the monster's defense, and at least one of the damage dice it earns has to come up over
 * zero. The game prints "YOU MISSED THE MONSTER" whenever the damage adds up to nothing, which on
 * a small weapon is often.
 *
 * This is the number to show for a swing whose roll is already settled, which on the clock it is:
 * `strike` seeds its generator from the tick counter and the to-hit roll is the first number out
 * of it, so the roll a swing made at a given moment will get is known before it is made.
 *
 * @param total the swinging character's to-hit total, from toHitTotal
 * @param damageDie the die of the weapon in hand; random(die) runs 0 to die - 1, so each die
 *   comes up 0 one time in die
 * @param roll one of the 80 values random(80) can return
 */
export function hitChanceOfRoll(
  total: number,
  monsterLevel: number,
  defense: number,
  speed: number,
  damageDie: number,
  roll: number,
): number {
  // A 1-sided die always rolls 0, and strike() treats a die of 0 or less the same way.
  if (damageDie < 2) return 0;
  const dice = damageDice(total - monsterDefense(monsterLevel, defense, speed), roll);
  return dice > 0 ? 1 - damageDie ** -dice : 0;
}

/**
 * The share of swings the game itself calls hits, over all eighty values the roll can take. That
 * is the number to show where the roll is not settled, which is a game drawing its own random
 * numbers rather than reseeding from the clock.
 *
 * @param total the swinging character's to-hit total, from toHitTotal
 * @param damageDie the die of the weapon in hand
 */
export function hitChance(
  total: number,
  monsterLevel: number,
  defense: number,
  speed: number,
  damageDie: number,
): number {
  let hitting = 0;
  for (let roll = 0; roll < ROLL_VALUES; roll++) {
    hitting += hitChanceOfRoll(total, monsterLevel, defense, speed, damageDie, roll);
  }
  return hitting / ROLL_VALUES;
}

/**
 * The smallest to-hit total that gets past the monster's defense at least this often.
 *
 * @param chance the share of swings to get past the defense, 0 to 1
 */
export function totalNeededToBeatDefense(
  chance: number,
  monsterLevel: number,
  defense: number,
  speed: number,
): number {
  // Every point of total is one more of the 80 rolls that gets past, counting up from the 39
  // that do when the total exactly covers what the monster takes off.
  const wanted = Math.ceil(chance * ROLL_VALUES);
  const net = wanted - rollsPastDefense(0);
  return net + monsterDefense(monsterLevel, defense, speed);
}
