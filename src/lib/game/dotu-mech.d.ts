/** Types for the exports the app uses; dotu-mech.js exports more. */

/** The threshold for level l: a character is level l once its experience passes this. */
export function expNeeded(l: number, hard: boolean): number;
/** Experience a character needs to reach `level`; the numbers the game's own tables print. */
export function expToReach(level: number, hard: boolean): number;
/** The level a character with this much experience is given the next time it rests at an inn. */
export function levelForExp(exp: number, hard: boolean, current?: number): number;
/** Experience awarded for killing a monster of level ml with multiplier expMult. */
export function expValue(ml: number, expMult?: number): number;

export interface LevelGain {
  /** [min, max] maximum hit points one level adds; the same roll is taken back by a drain. */
  hp: [number, number];
  sp: number;
}
/** What one level costs or gains a character of this class with these stats. */
export function levelGain(cls: number, con: number, luck: number, wis: number, iq: number): LevelGain;
/** Monster level for a floor before the random nudge: depth + 15 * module (module 0..4). */
export function monsterLevelBase(depth: number, module: number): number;
/** [level, probability] pairs for the stored monster level after the nudge, sorted by level. */
export function monsterLevelDistribution(depth: number, module: number, maxSteps?: number): [number, number][];
/** [min, max] hit points a stocked monster of level ml can have. */
export function monsterHpRange(hpPerLevel: number, ml: number, isBoss?: boolean, section?: number): [number, number];
/** Chance each monster type is picked when a floor is stocked. */
export const MONSTER_TYPE_ODDS: {
  puffball: number;
  blocker: number;
  levelDrainer: number;
  poisonDisease: number;
  sectionMonster: number;
};
/** Seconds between a monster's strikes, from its type's speed. */
export function monsterAttackInterval(speed: number): number;
/** Seconds of game time one step takes, from the carried weight and the agility. */
export function moveSeconds(weight: number, agi: number): number;
/** Breath damage: ml + rand(ml), halved by the matching resist. */
export function breathDamage(ml: number, resisted: boolean, rnd?: () => number): number;

export interface DropOdds {
  /** Chance per kill of each of the seven weapons Stick to Great Sword, by name. */
  weapons: Record<string, number>;
  /** Chance per kill of each of the six armors Leather to Titanium, by name. */
  armors: Record<string, number>;
  /** Chance per kill of each of the twelve "YOU FIND" items, by name. */
  items: Record<string, number>;
  /** Chance a kill finds any of the twelve items at all. */
  anyItem: number;
  /** Chance a level drainer's corpse leaves a stat potion rather than a trap door key. */
  drainerPotion: number;
  /** The other side of that roll; a key only drops on floors 4 to 178 and only once. */
  drainerKey: number;
  /** Chance a kill offers a spell book; the spell is only learned if it is not known yet. */
  spellbookRoll: number;
  /** Chance of a scroll, wand or spell paper, each only rolled when no book was learned. */
  scroll: number;
  wand: number;
  paper: number;
  /** The highest spell level each source can produce on this floor. */
  maxBookLevel: number;
  maxScrollLevel: number;
  maxWandLevel: number;
  maxPaperLevel: number;
  /** Chance a kill heals the character (cup of health) or gives a spell point (ball of thought). */
  healChance: number;
  spChance: number;
}
/** Per-kill drop probabilities. Every roll reads the floor: kill_monster wipes the killed
 *  monster's record before the weapon and armor rolls, so those read a level of zero. */
export function dropOdds(depth: number, cls: number): DropOdds;

/** Rubles one unit of culture stock costs at this character level. */
export function stockPrice(lev: number): number;
/** Rubles one magic crystal costs; "I can handle anything!" charges half again as much. */
export function crystalPrice(lev: number, hard: boolean): number;
/** Rubles the store hands back: one percent per child helped, never more than half. */
export function storeRefund(spent: number, children: number): number;
/** The inn's room price. Children knock it down, but never below half the full price. */
export function innCost(lev: number, children: number): number;
/** Units of culture stock one stay at the inn uses up. */
export function innStockNeeded(lev: number): number;

export interface Upkeep {
  room: number;
  /** The stay's culture stock, with the children refund already taken off. */
  stock: number;
  /** One crystal per missing spell point, with the children refund already taken off. */
  crystals: number;
}
/** What one stay at the inn costs in rubles, split into its three purchases. */
export function upkeepPerRest(lev: number, children: number, spMissing: number, hard: boolean): Upkeep;
/** The temple's services, as [name, price in rubles]. */
export const TEMPLE: [string, number][];
/** Expected Greater American Dollars from one kill on this floor. */
export function expectedMoney(depth: number, cls: number, hard: boolean): number;
/** One money roll for one kill, exactly as the game rolls it. */
export function rollMoney(depth: number, cls: number, hard: boolean, rnd?: () => number): number;

export interface Striker {
  lev: number;
  str: number;
  luck: number;
  luckyCharms: number;
  /** The held weapon's to-hit bonus. */
  weaponHit: number;
  gauntlet: number;
  weaponPlus: number;
  tempWeaponPlus: number;
  hard: boolean;
  depth: number;
  /** The power weapon's die while one is up, otherwise the held weapon's. */
  damageDie: number;
}
export interface StrikeTarget {
  level: number;
  defense: number;
  speed: number;
}
/** One swing at a monster; the damage it does, or 0 for a miss. */
export function strike(p: Striker, m: StrikeTarget, rnd?: () => number): number;

export interface Defender {
  lev: number;
  cls: number;
  iq: number;
  dex: number;
  luck: number;
  luckyCharms: number;
  /** The worn armor's rating together with its permanent plus. */
  armor: number;
  tempArmorPlus: number;
  bodyArmor: number;
  protRing: number;
  /** 0..4; the spell takes 2 * level^2 off the monster's attack roll. */
  protection: number;
  con: number;
  depth: number;
}
export interface DefendingAgainst {
  level: number;
  damageDie: number;
}
/** One monster attack on the character, breath aside; the damage it does, or 0 for a miss. */
export function defend(p: Defender, m: DefendingAgainst, rnd?: () => number): number;

export interface Simulation {
  hitChance: number;
  meanDamage: number;
  meanDamageOnHit: number;
}
/** Runs a strike or defend roll n times and averages it. */
export function simulate(fn: () => number, n?: number): Simulation;

/** Seconds of game time one of your swings takes. */
export function attackSeconds(weaponSpeed: number, agi: number): number;
/** Chance Sleep takes hold on a monster of this level. */
export function sleepChance(ml: number): number;
/** Whether Drain Monster kills a monster of this level outright. */
export function drainMonsterKills(ml: number, wis: number): boolean;
/** Chance Autokill works, by Monte Carlo over n trials. */
export function autokillChance(
  ml: number,
  speed: number,
  lev: number,
  iq: number,
  wis: number,
  depth: number,
  n?: number,
  rnd?: () => number,
): number;
/** How much each cure heals at this wisdom; a pair is the lowest and the highest roll. */
export function cureAmounts(wis: number): {
  littleCure: number;
  fastCure: number;
  cure: [number, number];
  bigCure: [number, number];
  fastBigCure: [number, number];
};
/** What each damage spell of the two battle lists does at this character level. */
export function damageSpells(lev: number): {
  magicZap: number;
  lightning: number;
  minorShock: number;
  magicMissile: number;
  shock: number;
  majorShock: number;
  magicZot: [number, number];
  magicBolt: [number, number];
  minorExplosion: [number, number];
  explosion: [number, number];
  majorExplosion: [number, number];
};
/** Taken off a monster's attack roll, indexed by protection level 0..4. */
export const PROTECTION_BONUS: [number, number, number, number, number];
/** The die a Power Weapon I, II or III swaps in for the held weapon's own. */
export const POWER_WEAPON_DIE: [null, number, number, number];
