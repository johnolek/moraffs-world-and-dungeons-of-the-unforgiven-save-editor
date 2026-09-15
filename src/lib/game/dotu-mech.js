// Dungeons of the Unforgiven game mechanics -- reference implementation for the
// calculators.  Every formula here was read out of the 1993 unf.exe / UNF.CPP and is
// documented in FAQ v2.2 sections [COMT], [TOWN], [LOOT], [MGEN], [SPMC], [EXPT], [HPSP].
// Plain ES module, no dependencies.  Integer math uses Math.trunc where the game does.
//
// Vocabulary (same as the FAQ): `lev` = character level, `depth` = floor number,
// `module` = 0..4, `ml` = monster level, `cls` = class id 0..6
// (0 Fighter 1 Worshipper 2 Monk 3 Wizard 4 Priest 5 Sage 6 Mage), `hard` = ICHA.

const T = Math.trunc;

// ---------------------------------------------------------------- experience & levels
/** exp_needed(l): threshold; you are level L once exp > expNeeded(L-1). */
export function expNeeded(l, hard) {
  return hard ? 250 * Math.pow(2, l - 1) : 250 * Math.pow(1.4, l - 1) - 80;
}
/** Experience required to REACH character level L (the [EXPT] tables). */
export function expToReach(level, hard) { return expNeeded(level - 1, hard); }
/** Level a character with `exp` experience will be after resting at an inn. */
export function levelForExp(exp, hard, current = 0) {
  let l = current;
  while (expNeeded(l, hard) < exp && l < 1000) l++;
  return l;
}
/** Experience awarded for killing a monster of level ml with multiplier m (expMult, 1..16). */
export function expValue(ml, expMult = 1) {
  const lc = Math.min(ml, 130);
  return expMult * (lc + 1 + 5 * Math.pow(1.23, lc));
}

// ---------------------------------------------------------------- monsters
/** Base monster level for a floor before the random nudge. */
export function monsterLevelBase(depth, module) {
  const lm = depth + 15 * module;
  return lm >= 221 ? 1 : lm;
}
/** Probability mass of the final stored level: while (random(3)==0) L += random(3)-1; clamp 1..210. */
export function monsterLevelDistribution(depth, module, maxSteps = 12) {
  const base = monsterLevelBase(depth, module);
  let dist = new Map([[base, 1]]);
  const out = new Map();
  let pStop = 2 / 3, pGo = 1 / 3;
  for (let step = 0; step <= maxSteps; step++) {
    for (const [l, p] of dist) out.set(l, (out.get(l) || 0) + p * (step === maxSteps ? 1 : pStop));
    if (step === maxSteps) break;
    const next = new Map();
    for (const [l, p] of dist) for (const d of [-1, 0, 1]) next.set(l + d, (next.get(l + d) || 0) + p * pGo / 3);
    dist = next;
  }
  const kept = new Map();
  // stock_level puts a nudged level outside 1..210 back to 1 rather than holding it at the edge.
  for (const [l, p] of out) { const c = l >= 1 && l <= 210 ? l : 1; kept.set(c, (kept.get(c) || 0) + p); }
  return [...kept.entries()].sort((a, b) => a[0] - b[0]);
}
/** Expected monster HP: (rand(hp*L+1) + rand(hp*L+1) + 2)/2, boss +20L, sections 18-20 doubled, max 32000. */
export function monsterHpRange(hpPerLevel, ml, isBoss = false, section = 1) {
  const lo = 1, hi = T((2 * hpPerLevel * ml + 2) / 2);
  let elo = lo + (isBoss ? 20 * ml : 0), ehi = hi + (isBoss ? 20 * ml : 0);
  if (isBoss && section >= 18) { elo *= 2; ehi *= 2; }
  return [Math.max(1, Math.min(32000, elo)), Math.max(1, Math.min(32000, ehi))];
}
/** Type roll odds at stocking time (see [GTPS] / [MGEN]). */
export const MONSTER_TYPE_ODDS = {
  puffball: 1 / 20,
  blocker: (19 / 20) * (1 / 7),
  levelDrainer: (19 / 20) * (6 / 7) * (1 / 15),
  poisonDisease: (19 / 20) * (6 / 7) * (14 / 15) * (1 / 12),
  sectionMonster: (19 / 20) * (6 / 7) * (14 / 15) * (11 / 12),   // split evenly over the 3 regulars
};

// ---------------------------------------------------------------- town economics
export const stockPrice = lev => T(((T(lev / 3) + 1) * lev * lev + 10) / 3);
export const crystalPrice = (lev, hard) => T(((T(lev / 2) + 1) * lev * lev + 10) / (hard ? 2 : 3));
/** Store refund on culture stock / magic crystal purchases (rubles back). */
export const storeRefund = (spent, children) => Math.min(children * spent / 100, spent / 2);
export function innCost(lev, children) {
  const full = Math.pow(lev, 4) + 10;
  return Math.max(full - lev * children, T(full / 2));
}
export const innStockNeeded = lev => lev * lev;
/** Rubles needed per rest: room + stock (after refund) + crystals for missing SP (after refund). */
export function upkeepPerRest(lev, children, spMissing, hard) {
  const stock = innStockNeeded(lev) * stockPrice(lev);
  const cryst = spMissing * crystalPrice(lev, hard);
  return { room: innCost(lev, children),
           stock: stock - storeRefund(stock, children),
           crystals: cryst - storeRefund(cryst, children) };
}
export const TEMPLE = [["Cure wounds", 10], ["Cure serious wounds", 100], ["Heal all wounds", 500],
                       ["Cure poison", 300], ["Cure disease", 500], ["Help a needy child", 100]];

// ---------------------------------------------------------------- level-up rolls ([HPSP])
/** [min, max] max-HP gain and the SP gain for one level (random(n) is 0..n-1). */
export function levelGain(cls, con, luck, wis, iq) {
  const R = n => [0, Math.max(0, n - 1)];
  switch (cls) {
    case 0: { const [a, b] = R(2 * con + T(luck / 2) + 10); return { hp: [35 + a, 35 + b], sp: 0 }; }
    case 1: { const [a, b] = R(T(con / 2) + T(luck / 2) + 10); return { hp: [15 + a, 15 + b], sp: T((2 * wis + iq) / 3) }; }
    case 2: { const [a, b] = R(T(con / 2) + T(luck / 3) + 5);  return { hp: [14 + a, 14 + b], sp: T((wis + iq) / 13) }; }
    case 3: { const [a, b] = R(T(con / 3) + T(luck / 5) + 4);  return { hp: [13 + a, 13 + b], sp: T((wis + 2 * iq) / 5) }; }
    case 4: { const [a, b] = R(T(con / 2) + T(luck / 3) + 4);  return { hp: [14 + a, 14 + b], sp: T((2 * wis + iq) / 5) }; }
    case 5: { const [a, b] = R(3 * con + luck + 17);           return { hp: [55 + a, 55 + b], sp: T((wis + iq) / 14) }; }
    case 6: { const [a, b] = R(T(con / 2) + T(luck / 3) + 7);  return { hp: [14 + a, 14 + b], sp: T((wis + 2 * iq) / 8) }; }
  }
}

// ---------------------------------------------------------------- loot ([LOOT])
/** Per-kill drop probabilities.  depth = floor, cls = class id. */
export function dropOdds(depth, cls) {
  const monk = cls === 2, fighter = cls === 0, sage = cls === 5;
  const weapons = {}, armors = {};
  const WN = ["Stick", "Club", "Mace", "Knife", "Short Sword", "Long Sword", "Great Sword"];
  const AN = ["Leather", "Chain", "Scale", "Breast Plate", "Field Plate", "Titanium"];
  // kill_monster empties the killed monster's record before it calls drop_weapon and drop_armor,
  // and both of those read the monster's level out of that record, so every kill in the game
  // rolls for a weapon and for armor against a level of zero.
  const ml = 0;
  WN.forEach((n, i) => weapons[n] = monk ? 0 : (1 / 7) * Math.min(1, (ml + 11) / (100 * (i + 1))));
  AN.forEach((n, i) => armors[n] = monk ? 0 : (1 / 6) * Math.min(1, (ml + 11) / (100 * (i + 1))));
  const findGate = monk ? 0 : Math.min(1, (depth + 40) / (fighter || sage ? 550 : 950)) * Math.min(1, depth / 20);
  const perItem = findGate * (2 / 3) / 12;
  const items = {};
  ["Nuclear hand grenade", "Stone of teleportation", "Stone of seeing", "Floor slosher", "Potion of healing",
   "Ring of regeneration", "Book of Strength", "Book of Intelligence", "Book of Wisdom", "Book of Constitution",
   "Book of Agility", "Book of Luck"].forEach(n => items[n] = perItem);
  const drainerPotion = Math.min(1, (depth + 175) / 375);
  const bookRoll = (fighter || monk) ? 0 : sage
      ? Math.min(1, 176 / (300 - depth)) * Math.min(1, 141 / (400 - depth)) : 1;
  const consumable = Math.min(1, 16 / (350 - depth));
  return {
    weapons, armors, items, anyItem: findGate * 2 / 3,
    drainerPotion, drainerKey: 1 - drainerPotion,          // key only if 3 < depth < 179 and not owned
    spellbookRoll: bookRoll,                                // then a random (type, level<=2*depth/3, slot); learned if unknown & allowed
    scroll: (fighter || monk) ? 0 : (1 / 3) * Math.min(1, (sage ? 46 : 16) / (350 - depth)),
    wand:   (fighter || monk) ? 0 : (1 / 3) * consumable,
    paper:  monk ? 0 : (1 / 3) * consumable,
    // highest spell level each source can produce on this floor (level index = random(N), so max = N)
    maxBookLevel: Math.max(1, Math.min(10, T(2 * depth / 3))),
    maxScrollLevel: Math.max(1, Math.min(10, T((depth + 4) / 2))),
    maxWandLevel: Math.max(1, Math.min(10, T(depth / (sage ? 2 : 4)))),
    maxPaperLevel: Math.max(1, Math.min(10, T(depth / (fighter || sage ? 2 : 6)))),
    healChance: 1 / 4, spChance: fighter ? 0 : 1 / 6,
  };
}
/** Note: the scroll/wand/paper rolls only happen when no spell book was learned on that kill. */

/** Expected Greater American Dollars per kill (exact expectation of the product; ignores the
 *  small "product was 0" rebate and the 107M cap, which only matter below floor 5 / past ~65). */
export function expectedMoney(depth, cls, hard) {
  const n = depth + 1;
  const E = k => (k - 1) / 2;                      // E[rand(k)]
  let a = depth > 4 ? E(n * n) * E(n) * E(n * n) : 0;
  if (depth <= 4) a = (1 / 4) * E(200 * n);         // product is 0 -> 1/4 chance of rand(200n)
  if (cls === 1 || cls === 3) a += E(200 * depth);
  if (depth < 5) a += E(200 * depth);
  else if (depth < 15) a += a / 3;
  else if (depth > 16) a -= a / 3;
  if (!hard) a += E(7000);
  if (cls === 5) a *= 3;
  return Math.min(a, 107000000);
}
/** One random money roll, exactly as the game does it (for histograms). */
export function rollMoney(depth, cls, hard, rnd = Math.random) {
  const R = k => T(rnd() * k);
  const n = depth + 1;
  let a = 0;
  if (depth > 4) a = R(n * n) * R(n) * R(n * n);
  if (a === 0 && R(4) === 1) a = R(200 * n);
  if (a !== 0) {
    if (cls === 1 || cls === 3) a += R(200 * depth);
    if (depth < 5) a += R(200 * depth);
    else if (depth < 15) a += T(a / 3);
    else if (depth > 16) a -= T(a / 3);
    if (!hard) a += R(7000);
    if (cls === 5) a *= 3;
  }
  if (a > 107000000) a = 107000000 - R(32000) * R(1000);
  return a;
}

// ---------------------------------------------------------------- combat ([COMT])
/** One player strike, exactly like strike() in UNF.CPP.  Returns damage (0 = miss).
 *  p = {lev, str, luck, luckyCharms, weaponHit, gauntlet, weaponPlus, tempWeaponPlus, hard,
 *       depth, damageDie (power weapon die if active, else the weapon's)}
 *  m = {level, defense, speed}  (type's defense/speed from monsterTypes) */
export function strike(p, m, rnd = Math.random) {
  const R = k => (k <= 0 ? 0 : T(rnd() * k));
  let c = R(80) + 2 * p.lev + p.str;
  if (!p.hard) { if (p.str > 25) c += 25; c += p.str; }
  c += p.luck + (p.luckyCharms || 0) + p.weaponHit + (p.gauntlet || 0) + (p.weaponPlus || 0) + (p.tempWeaponPlus || 0);
  if (p.depth > 75 && R(30) === 1) c += 40;
  c -= 2 * m.level + m.defense + m.speed;
  let d = 0;
  while (c > 40) { d += R(p.damageDie); c -= 40; }
  if (d > 0) {
    d += R(20) < p.lev ? R(p.str) : R(T(p.str / 3));
    if (d > 0 && p.lev < 5) d += R(5 - p.lev);
    d += R(p.lev);
  }
  return d;
}
/** One monster attack on the player, exactly like defend() in UNF.CPP (breath not included).
 *  p = {lev, cls, iq, dex, luck, luckyCharms, armor (AC), tempArmorPlus, bodyArmor, protRing,
 *       protection (0-4), con, depth}
 *  m = {level, damageDie} */
export function defend(p, m, rnd = Math.random) {
  const R = k => (k <= 0 ? 0 : T(rnd() * k));
  let c = R(80) + 20 + 2 * m.level;
  if (p.cls === 2) c -= R(p.iq);
  c -= 2 * p.lev + p.dex + p.luck + T(p.dex / 2) + (p.luckyCharms || 0) + p.armor + (p.tempArmorPlus || 0)
     + (p.bodyArmor || 0) + (p.protRing || 0) + 2 * (p.protection || 0) * (p.protection || 0);
  if (p.depth > 75) c += T((p.depth - 75) / 2);
  let d = 0;
  while (c > 32) { d += R(m.damageDie); c -= 40; }
  if (R(500) < p.depth) d++;
  if (R(4) === 1) d = R(T(p.depth / 2) + 3);
  if (d > 0 && p.depth > p.lev) {
    d += R(p.depth - p.lev);
    if (p.depth > 25) d += R(p.depth * 4);
    if (p.depth > 100) d += R(p.depth * 5);
    d += R(m.level);
    const n = Math.max(1, 100 - p.con);
    d = T((n + 50) * d / 150);
    if (d < 1) d = 1;
    if (d > p.depth * 4) d = p.depth;
  }
  if (p.lev === 0 && d > 3) d = R(3) + 1;
  if (p.lev < 3 && d > 6) d = T(d / 2);
  return d;
}
/** Breath damage: ml + rand(ml), halved by the matching resist. */
export const breathDamage = (ml, resisted, rnd = Math.random) => { let d = ml + T(rnd() * ml); return resisted ? T(d / 2) : d; };
/** Monte Carlo helper: {hitChance, meanDamage, meanDamageOnHit} over n trials. */
export function simulate(fn, n = 20000) {
  let hits = 0, total = 0;
  for (let i = 0; i < n; i++) { const d = fn(); if (d > 0) { hits++; total += d; } }
  return { hitChance: hits / n, meanDamage: total / n, meanDamageOnHit: hits ? total / hits : 0 };
}

// ---------------------------------------------------------------- timing
export const moveSeconds = (weight, agi) => T(Math.max(0, 100 + weight - 10 * agi) / 100) + 1;   // weight = body (0 with Feather) + gear, which Feather never touches
export const attackSeconds = (weaponSpeed, agi) => weaponSpeed + (85 - agi > 1 ? T((85 - agi) / 5) : 0);
export const monsterAttackInterval = speed => T((85 - speed) / 3) + 10;                           // seconds between a monster's strikes

// ---------------------------------------------------------------- spells ([SPMC])
export const sleepChance = ml => ml <= 3 ? 1 : 3 / ml;
export const drainMonsterKills = (ml, wis) => ml < wis;
/** Autokill success probability by Monte Carlo (rand(ml + rand(speed)) < rand(lev + rand(iq+wis)) + rand(depth)). */
export function autokillChance(ml, speed, lev, iq, wis, depth, n = 50000, rnd = Math.random) {
  const R = k => (k <= 0 ? 0 : T(rnd() * k));
  let ok = 0;
  for (let i = 0; i < n; i++) if (R(ml + R(speed)) < R(lev + R(iq + wis)) + R(depth)) ok++;
  return ok / n;
}
export const cureAmounts = wis => ({
  littleCure: T(wis / 2), fastCure: T(wis / 2),
  cure: [20, Math.min(60, 20 + 2 * (wis - 1))],
  bigCure: [50, Math.min(150, 50 + 4 * wis - 1)],
  fastBigCure: [20, Math.min(90, 20 + 4 * wis - 1)],
});
export const damageSpells = lev => ({
  magicZap: 2 * lev + 2, lightning: 4 * lev + 4, minorShock: 25, magicMissile: 50, shock: 125, majorShock: 300,
  magicZot: [(lev + 1) * 4, (lev + 1) * 8], magicBolt: [(lev + 1) * 7, (lev + 1) * 11],
  minorExplosion: [75, 175], explosion: [125, 225], majorExplosion: [200, 500],
});
export const PROTECTION_BONUS = [0, 2, 8, 18, 32];      // subtracted from monster attack roll, by protection level
// strike() indexes the weapon table with the power weapon level plus 8, and row 8 is the one
// labelled POWER WEAPON 1, so each level swings the row after the one it is named for.
export const POWER_WEAPON_DIE = [null, 129, 199, 399];

// ---------------------------------------------------------------- self-test (node dotu-mech.js)
if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("dotu-mech.js")) {
  const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
  const checks = [
    ["expToReach 7 normal", near(expToReach(7, false), 1265, 1)],
    ["expToReach 30 normal", near(expToReach(30, false), 3086837, 2)],
    ["expToReach 20 hard", expToReach(20, true) === 65536000],
    ["expValue 61", near(expValue(61), 1524753, 2)],
    ["stockPrice 20", stockPrice(20) === 936],
    ["crystalPrice 25 hard", crystalPrice(25, true) === 4067],
    ["innCost 10, 0 children", innCost(10, 0) === 10010],
    ["innCost 10, 600 children (floor)", innCost(10, 600) === 5005],
    ["levelGain sage", JSON.stringify(levelGain(5, 20, 10, 15, 15)) === JSON.stringify({ hp: [55, 55 + 86], sp: 2 })],
    ["ring odds floor 20", near(1 / dropOdds(20, 6).items["Ring of regeneration"], 285, 1)],
    ["sleep 20", near(sleepChance(20), 0.15, 1e-9)],
    ["monster interval speed 55", monsterAttackInterval(55) === 20],
    ["move seconds giant", moveSeconds(400, 0) === 6],
    ["power weapon dice", POWER_WEAPON_DIE.join() === [null, 129, 199, 399].join()],
  ];
  let bad = 0;
  for (const [name, ok] of checks) { console.log((ok ? "ok   " : "FAIL ") + name); if (!ok) bad++; }
  console.log(bad ? bad + " failures" : "all checks passed");
}
