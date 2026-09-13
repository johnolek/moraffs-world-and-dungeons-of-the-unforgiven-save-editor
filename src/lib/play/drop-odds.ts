import type { Game, PlayerCharacter } from '../game/port/state';

/**
 * How often a kill leaves something behind, counted out of the rolls `kill_monster` makes rather
 * than sampled.
 *
 * Nothing here is a port: the game works these out a die at a time and never prints them. What it
 * is instead is the same arithmetic read off `drop_weapon`, `drop_armor` and the find gates of
 * `kill_monster` in `src/lib/game/port/drops.ts` and `src/lib/game/port/kills.ts`, so a change to
 * either of those is a change this file has to follow.
 *
 * Debug mode prints all three over the monster being faced (`debug-screen.ts`).
 */

/** The class the game gives no weapon, no armor and no find at all: class byte 2. */
const MONK = 2;

/** The two classes `kill_monster` lets past the first find gate more easily. */
const FIGHTER = 0;
const SAGE = 5;

/** How many weapons and suits of armor past the fist and bare skin a kill can turn up. */
const WEAPON_ROWS = 7;
const ARMOR_ROWS = 6;

/** Where the weapon table ends, which is how far the high speed option looks for a better one. */
const PAST_THE_LAST_ROW = 8;

/** The one thing `find_item` refuses to hand over twice, out of the twelve it rolls between. */
const FOUND_ITEMS = 12;

/** What a kill may leave behind, each as a share of kills between 0 and 1. */
export interface DropOdds {
  /** A weapon offered, which is an offer the player can still refuse. */
  weapon: number;
  /** A suit of armor offered. */
  armor: number;
  /** One of the twelve things `find_item` turns up — a ring of regeneration, a stone, a book. */
  special: number;
}

/**
 * The share of `Random(n)` rolls that come out below `m`.
 *
 * `Random(n)` hands back an integer in 0..n-1 (`src/lib/game/port/rng.ts`), so `m` at or above
 * `n` is every roll and `m` at or below zero is none.
 */
function chanceBelow(m: number, n: number): number {
  if (n < 1) return 0;
  return Math.min(Math.max(m, 0), n) / n;
}

/** The same for `Random(n) <= m`, which is one more roll passing. */
function chanceAtMost(m: number, n: number): number {
  return chanceBelow(m + 1, n);
}

/**
 * Whether the character owns a row at or past this one, which is what the high speed option
 * looks for before it decides an offer is not worth making.
 *
 * Both loops in `drops.ts` run to row 8 though the armor table has seven rows, so the last turn
 * reads past the end; the port leaves that empty, and an empty row is owned by nobody.
 */
function ownsFromHere(owned: number[], from: number): boolean {
  for (let row = from; row < PAST_THE_LAST_ROW; row += 1) {
    if ((owned[row] ?? 0) > 0) return true;
  }
  return false;
}

/**
 * `drop_weapon` (exe 3000:a1fc): the share of kills that offer a weapon.
 *
 * The roll is made against the row that came up, and the deeper into the table that row is the
 * harder it is to pass, so each of the seven is worth a seventh of its own chance. A row the
 * character already owns is never offered, and with the high speed option on neither is a row
 * they have already bettered.
 */
export function weaponDropChance(game: Game, monsterLevel: number): number {
  const pc = game.pc;
  if (pc.cls === MONK) return 0;
  let total = 0;
  for (let row = 1; row <= WEAPON_ROWS; row += 1) {
    if (pc.weaponsOwned[row] > 0) continue;
    if (game.highSpeed && ownsFromHere(pc.weaponsOwned, row)) continue;
    total += chanceAtMost(monsterLevel + 10, row * 100);
  }
  return total / WEAPON_ROWS;
}

/**
 * `drop_armor` (exe 3000:a3d7): the same for armor, out of the six suits past bare skin.
 *
 * Armor the character already owns is offered again, and counted in the message, so the only
 * thing that takes a row off the list is the high speed option finding a better one owned.
 */
export function armorDropChance(game: Game, monsterLevel: number): number {
  const pc = game.pc;
  if (pc.cls === MONK) return 0;
  let total = 0;
  for (let row = 1; row <= ARMOR_ROWS; row += 1) {
    if (game.highSpeed && ownsFromHere(pc.armorOwned, row)) continue;
    total += chanceAtMost(monsterLevel + 10, row * 100);
  }
  return total / ARMOR_ROWS;
}

/**
 * `kill_monster` (exe 3000:b12d) and `find_item` (exe 3000:ae27): the share of kills that turn up
 * one of the twelve special items.
 *
 * Two gates stand in front of it and neither has anything to do with the monster: both are the
 * floor. The first is easier for a fighter and a sage, and the second is the floor out of twenty,
 * so nothing at all is found above the town until floor 1 and every find is certain from floor 20
 * down. Past both gates one roll in three prints "NOTHING!" instead.
 *
 * The floor slosher is the one item handed over only once, so a character carrying one loses the
 * twelfth of finds that rolls it again.
 */
export function specialDropChance(game: Game): number {
  const pc: PlayerCharacter = game.pc;
  if (pc.cls === MONK) return 0;
  const easier = pc.cls === FIGHTER || pc.cls === SAGE ? 400 : 0;
  const gates = chanceBelow(pc.level + 40, 950 - easier) * chanceBelow(pc.level, 20);
  const notNothing = 2 / 3;
  const alreadyHasTheSlosher = pc.slosher > 0 ? (FOUND_ITEMS - 1) / FOUND_ITEMS : 1;
  return gates * notNothing * alreadyHasTheSlosher;
}

/** All three, for the monster being faced. */
export function dropOdds(game: Game, monsterLevel: number): DropOdds {
  return {
    weapon: weaponDropChance(game, monsterLevel),
    armor: armorDropChance(game, monsterLevel),
    special: specialDropChance(game),
  };
}
