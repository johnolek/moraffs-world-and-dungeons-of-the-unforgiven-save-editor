import type { GameRules } from '../game/port/rules';
import type { Monster } from './monsters';

/** The game's random(n): an integer 0..n-1. */
const random = (rnd: () => number, n: number) => Math.trunc(rnd() * n);

/**
 * The stocked level: while a 1 in 3 roll keeps succeeding the base level moves by -1, 0 or +1
 * (stock_level, exe 2000:671e, unf.c "stock_level").
 *
 * The level lives in one byte of the monster's six, which is why the game's own jitter counts
 * round at 256. Once it is over, stock_level puts the byte back to 1 if it is 0 (exe 2000:6fdf)
 * and again if it is over the top level read unsigned (exe 2000:7005), so a level nudged past the
 * top comes out as 1 rather than stopping there. Nothing in the game can reach its own top of
 * 210: Module V's deepest base level is 165, and the jitter would have to survive dozens of
 * one-in-three rolls in a row.
 *
 * Rules that stock monsters deeper than the game does keep the level in a number of any width,
 * and answer with no wrap at all (`GameRules.monsterLevelWrap`).
 */
export function nudgeLevel(base: number, rnd: () => number, rules: GameRules): number {
  const wrap = rules.monsterLevelWrap;
  let level = base;
  while (random(rnd, 3) === 0) {
    level += random(rnd, 3) - 1;
    if (wrap !== null) level = ((level % wrap) + wrap) % wrap;
  }
  return level === 0 || level > rules.monsterLevelMax ? 1 : level;
}

/** The number of values each of the two hit point rolls can take on a floor of this base level. */
export function hpSpan(entry: Monster, baseLevel: number): number {
  return entry.type.hpPerLevel * baseLevel + 1;
}

/**
 * The Shadow boss bonus and the rules' cap, applied to the average of the two rolls. The bonus
 * counts the floor's base level, the same number the rolls were drawn from.
 *
 * The game's own cap of 32,000 is what keeps the roll inside the two bytes a monster's record
 * holds its hit points in. Rules whose floors go deeper than the game's answer with a cap of
 * their own.
 */
export function stockedHp(entry: Monster, baseLevel: number, averaged: number, rules: GameRules): number {
  let hp = averaged;
  if (entry.isBoss) {
    hp += 20 * baseLevel;
    // The last three sections give their bosses double hit points.
    if (entry.origin.kind === 'section' && entry.origin.section >= 18) hp *= 2;
  }
  return Math.max(1, Math.min(rules.monsterHpMax, hp));
}

/**
 * Hit points of one stocked monster: the average of two rolls, plus the Shadow boss bonus.
 *
 * Both rolls run off the floor's base level and not off the level the monster is stored with:
 * stock_level (exe 2000:671e, unf.c "stock_level") rolls the hit points first and jitters the
 * stored level afterwards, so the two numbers a player sees need not agree.
 */
export function rollHp(entry: Monster, baseLevel: number, rnd: () => number, rules: GameRules): number {
  const span = hpSpan(entry, baseLevel);
  return stockedHp(entry, baseLevel, Math.trunc((random(rnd, span) + random(rnd, span) + 2) / 2), rules);
}
