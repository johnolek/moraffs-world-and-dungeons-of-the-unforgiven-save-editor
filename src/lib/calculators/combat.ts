import { binHp, type HpBin } from '../bestiary/distribution';
import type { Monster } from '../bestiary/monsters';
import data from '../game/dotu-data.json';
import { sectionOf } from '../game/dotu-files.js';
import {
  attackSeconds,
  autokillChance,
  breathDamage,
  drainMonsterKills,
  monsterAttackInterval,
  monsterHpRange,
  monsterLevelBase,
  simulate,
  sleepChance,
} from '../game/dotu-mech.js';
import { defend, strike } from '../game/port/combat';
import { newGame, type Game, type MonsterKind } from '../game/port/state';

export type Weapon = (typeof data.weapons)[number];
export type Armor = (typeof data.armor)[number];

/** Power Weapon I to IV sit in the weapon table as ids 8 to 11, but no character holds one. */
const LAST_HELD_WEAPON = 7;

export const WEAPONS: Weapon[] = data.weapons.filter((weapon) => weapon.id <= LAST_HELD_WEAPON);
export const ARMORS: Armor[] = data.armor;

export interface Fighter {
  lev: number;
  cls: number;
  str: number;
  iq: number;
  wis: number;
  con: number;
  /** Agility, which the save file calls dexterity. */
  dex: number;
  luck: number;
  luckyCharms: number;
  weapon: number;
  weaponPlus: number;
  tempWeaponPlus: number;
  gauntlet: number;
  armor: number;
  /** The permanent plus on the worn armor. The game's defence roll never reads it. */
  armorPlus: number;
  tempArmorPlus: number;
  bodyArmor: number;
  protRing: number;
  /** Protection spell level 0 to 4, from none up to Ultra Protection. */
  protection: number;
  /** Power Weapon spell level 0 to 3. */
  powerWeapon: number;
  hard: boolean;
}

export interface Fight {
  monster: Monster;
  /** The monster's level. The floor sets it, but the stocking nudge can move it. */
  level: number;
  module: number;
  floor: number;
}

export interface Attack {
  hitChance: number;
  meanDamage: number;
  meanDamageOnHit: number;
  /** How the damage fell over the swings that hit, bucketed for a chart. */
  bars: HpBin[];
}

export interface SwingsToKill {
  /** The hit points the monster can be stocked with, and the middle of that range. */
  hp: [number, number];
  middleHp: number;
  /** Null when your swings do no damage at all, so no number of them would do it. */
  least: number | null;
  middle: number | null;
  most: number | null;
}

export interface Breath {
  least: number;
  most: number;
  mean: number;
  resistedLeast: number;
  resistedMost: number;
  resistedMean: number;
}

export interface SpellOdds {
  sleep: number;
  /** Null for a Shadow boss, which both of these refuse to touch. */
  drainMonster: boolean | null;
  autokill: number | null;
}

export interface CombatReport {
  yours: Attack;
  swingsToKill: SwingsToKill;
  secondsPerSwing: number;
  its: Attack;
  /** Null unless the monster breathes; a breather uses it on half its attacks. */
  breath: Breath | null;
  secondsBetweenItsAttacks: number;
  itsAttacksPerSwing: number;
  /** What each of its attacks costs you on average, breath and all. */
  meanDamageTaken: number;
  hpLostPerKill: number | null;
  spells: SpellOdds;
}

export interface CombatOptions {
  trials?: number;
  rnd?: () => number;
}

export function weaponById(id: number): Weapon {
  return WEAPONS.find((weapon) => weapon.id === id) ?? WEAPONS[0];
}

/** The section a fight happens in, which decides whether a boss gets its doubled hit points. */
export function sectionOfFight(fight: Fight): number {
  const { origin } = fight.monster;
  return origin.kind === 'section' ? origin.section : sectionOf(fight.module, fight.floor);
}

/**
 * Breath damage over every roll it can make. A breather uses this instead of striking on half
 * its attacks, and it goes straight through armor, protections and the constitution reduction.
 */
export function breathProfile(ml: number, resisted: boolean): { least: number; most: number; mean: number } {
  let total = 0;
  let least = Infinity;
  let most = 0;
  for (let roll = 0; roll < ml; roll++) {
    const damage = breathDamage(ml, resisted, () => roll / ml);
    total += damage;
    least = Math.min(least, damage);
    most = Math.max(most, damage);
  }
  return { least: Number.isFinite(least) ? least : 0, most, mean: ml > 0 ? total / ml : 0 };
}

/** Swings needed to work through the hit points the monster can be stocked with. */
export function swingsFor(hp: number, meanDamage: number): number | null {
  return meanDamage > 0 ? Math.ceil(hp / meanDamage) : null;
}

/**
 * The monster of the fight, described to the port with its breath, its drains and its ailments
 * taken out. None of those are in the attack roll, so the damage `defend` works out is the
 * same either way, but a breath replaces that damage and a drain would move the character's
 * stats between one sample and the next. The report gives the breath numbers of its own.
 */
function plainKind(monster: Monster): MonsterKind {
  return {
    id: monster.id,
    name: monster.name.toUpperCase(),
    levelDrain: 0,
    statDrain: 0,
    breath: 0,
    special: 0,
    type: monster.type.type,
    expMult: monster.expMult,
  };
}

/**
 * The game the port's `strike` and `defend` are sampled on: the character from the form,
 * standing on the floor the fight is on, engaging the monster in slot 0.
 *
 * Both functions take the damage off the hit points of whoever they hit. Neither reads those
 * hit points back, so the sampling lets them run down rather than resetting them each trial.
 */
function fightingGame(fighter: Fighter, fight: Fight, rnd: () => number): Game {
  const weaponPlus = Array.from({ length: 8 }, () => 0);
  weaponPlus[fighter.weapon] = fighter.weaponPlus;
  const game = newGame({
    // Random(n) hands back an integer in 0..n-1, which is this fraction times n truncated.
    rng: { random: (n: number) => Math.trunc(rnd() * n) },
    monsterKinds: [plainKind(fight.monster)],
    pc: {
      cls: fighter.cls,
      lev: fighter.lev,
      level: fight.floor,
      str: fighter.str,
      iq: fighter.iq,
      wis: fighter.wis,
      con: fighter.con,
      dex: fighter.dex,
      luck: fighter.luck,
      luckyCharms: fighter.luckyCharms,
      weapon: fighter.weapon,
      weaponPlus,
      tempWeaponPlus: fighter.tempWeaponPlus,
      gauntlet: fighter.gauntlet,
      armor: fighter.armor,
      tempArmorPlus: fighter.tempArmorPlus,
      bodyArmor: fighter.bodyArmor,
      protRing: fighter.protRing,
      protection: fighter.protection,
      powerWeapon: fighter.powerWeapon,
      hard: fighter.hard ? 1 : 0,
    },
  });
  Object.assign(game.monsters[0], { type: 0, level: fight.level });
  game.engaged = 0;
  return game;
}

export function combatReport(fighter: Fighter, fight: Fight, { trials = 20000, rnd = Math.random }: CombatOptions = {}): CombatReport {
  const weapon = weaponById(fighter.weapon);
  const monster = fight.monster;

  const game = fightingGame(fighter, fight, rnd);
  const yours = sampled(game, () => strike(game), trials);
  const its = sampled(game, () => defend(game, 0), trials);

  // Hit points are rolled before the level is nudged, so they follow the floor even when the
  // level control has been moved off it.
  const baseLevel = monsterLevelBase(fight.floor, fight.module);
  const hp = monsterHpRange(monster.type.hpPerLevel, baseLevel, monster.isBoss, sectionOfFight(fight));
  const middleHp = Math.trunc((hp[0] + hp[1]) / 2);
  const swingsToKill: SwingsToKill = {
    hp,
    middleHp,
    least: swingsFor(hp[0], yours.meanDamage),
    middle: swingsFor(middleHp, yours.meanDamage),
    most: swingsFor(hp[1], yours.meanDamage),
  };

  const breath = breathOf(monster, fight.level);
  // A breather breathes on half its attacks; the resist is left off, so this is the worst case.
  const meanDamageTaken = breath ? (its.meanDamage + breath.mean) / 2 : its.meanDamage;
  const secondsPerSwing = attackSeconds(weapon.speed, fighter.dex);
  const secondsBetweenItsAttacks = monsterAttackInterval(monster.type.speed);
  const itsAttacksPerSwing = secondsPerSwing / secondsBetweenItsAttacks;

  return {
    yours,
    swingsToKill,
    secondsPerSwing,
    its,
    breath,
    secondsBetweenItsAttacks,
    itsAttacksPerSwing,
    meanDamageTaken,
    hpLostPerKill: swingsToKill.middle === null ? null : swingsToKill.middle * itsAttacksPerSwing * meanDamageTaken,
    spells: spellOdds(fighter, fight, { trials, rnd }),
  };
}

export function spellOdds(fighter: Fighter, fight: Fight, { trials = 20000, rnd = Math.random }: CombatOptions = {}): SpellOdds {
  const boss = fight.monster.isBoss;
  return {
    // Sleep is the one spell aimed at a monster that never asks whether it is a Shadow boss.
    sleep: sleepChance(fight.level),
    drainMonster: boss ? null : drainMonsterKills(fight.level, fighter.wis),
    autokill: boss
      ? null
      : autokillChance(
          fight.level,
          fight.monster.type.speed,
          fighter.lev,
          fighter.iq,
          fighter.wis,
          fight.floor,
          trials,
          rnd,
        ),
  };
}

function breathOf(monster: Monster, ml: number): Breath | null {
  if (monster.breath <= 0) return null;
  const plain = breathProfile(ml, false);
  const resisted = breathProfile(ml, true);
  return {
    least: plain.least,
    most: plain.most,
    mean: plain.mean,
    resistedLeast: resisted.least,
    resistedMost: resisted.most,
    resistedMean: resisted.mean,
  };
}

/** Runs one of the game's rolls over and over, keeping the damage each hit did for the chart. */
function sampled(game: Game, roll: () => number, trials: number): Attack {
  const hits = new Map<number, number>();
  let hitCount = 0;
  const summary = simulate(() => {
    // Every roll prints what it did, and there is nobody here to read a battle message.
    game.messages.length = 0;
    const damage = roll();
    if (damage > 0) {
      hits.set(damage, (hits.get(damage) ?? 0) + 1);
      hitCount++;
    }
    return damage;
  }, trials);
  // binHp buckets a spread of integer rolls; damage is bucketed the same way hit points are.
  const bars = binHp(
    [...hits.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([damage, count]) => ({ hp: damage, p: count / hitCount })),
  );
  return { ...summary, bars };
}
