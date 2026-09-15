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

/** How often a kill leaves one thing behind. */
export interface DropChance {
  /** The share of kills that leave one, between 0 and 1. */
  chance: number;
  /** The rule that rules the drop out altogether, in the few words a debug line prints, or null
   *  when a kill can still leave one. */
  never: string | null;
}

/** What a kill may leave behind. */
export interface DropOdds {
  /** A weapon offered, which is an offer the player can still refuse. */
  weapon: DropChance;
  /** A suit of armor offered. */
  armor: DropChance;
  /** One of the twelve things `find_item` turns up — a ring of regeneration, a stone, a book. */
  special: DropChance;
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

/**
 * The monster level `drop_weapon` and `drop_armor` roll against, which is always zero.
 *
 * `kill_monster` (exe 3000:b12d) empties the killed monster's slot — its level along with the
 * rest of the record — before it calls either of them, and both read the level out of that slot,
 * so neither ever sees the level of the monster that was just killed. Every kill in the game
 * therefore rolls for a weapon and for armor on the same odds, deep or shallow.
 */
const LEVEL_A_DROP_ROLLS_AGAINST = 0;

/** Why a weapon is never offered, or null when one still can be. */
function weaponNever(game: Game, chance: number): string | null {
  if (chance > 0) return null;
  if (game.pc.cls === MONK) return 'MONK';
  const owned = game.pc.weaponsOwned;
  const everyRow = owned.slice(1, WEAPON_ROWS + 1).every((count) => count > 0);
  return everyRow ? 'OWNS THEM ALL' : 'HIGH SPEED';
}

/** Why armor is never offered. Armor the character owns is offered again, so the high speed
 *  option finding a better suit is the only thing besides being a monk that can rule it out. */
function armorNever(game: Game, chance: number): string | null {
  if (chance > 0) return null;
  return game.pc.cls === MONK ? 'MONK' : 'HIGH SPEED';
}

/** Why a special item is never found. The second gate is the floor out of twenty, so the town
 *  turns up nothing at all. */
function specialNever(game: Game, chance: number): string | null {
  if (chance > 0) return null;
  return game.pc.cls === MONK ? 'MONK' : 'TOWN FLOOR';
}

/** All three, for a kill made where the character is standing. */
export function dropOdds(game: Game): DropOdds {
  const weapon = weaponDropChance(game, LEVEL_A_DROP_ROLLS_AGAINST);
  const armor = armorDropChance(game, LEVEL_A_DROP_ROLLS_AGAINST);
  const special = specialDropChance(game);
  return {
    weapon: { chance: weapon, never: weaponNever(game, weapon) },
    armor: { chance: armor, never: armorNever(game, armor) },
    special: { chance: special, never: specialNever(game, special) },
  };
}
