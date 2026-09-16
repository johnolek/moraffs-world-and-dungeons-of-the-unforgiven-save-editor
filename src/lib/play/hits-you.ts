/**
 * The chance the monster in front of you takes hit points off you on its next turn, counted out
 * rather than sampled.
 *
 * `defend` (UNF.EXE 2000:82b7) and `monster_turn` (WORLD.EXE 2000:615c) are the same routine three
 * years apart, so one calculation serves both: a d80 added to what the monster brings and less
 * everything the character wears, carries and is, one damage die per full 40 points the result is
 * over 32, a bonus point drawn against the floor, and one attack in four that throws the whole
 * thing away for a small roll of its own. A monk's Intelligence is rolled into the total as
 * well, which each game does in a direction of its own.
 *
 * Nothing in any of that is random except those rolls, and each of them is a flat die, so the
 * chance is the mean over the eighty values of the d80 — and over the Intelligence roll's values
 * where there is one — of the chance the dice, the bonus and the small roll leave anything
 * behind. Moraff's Revenge is a different game with a different fight and has {@link
 * revAnswerChance} of its own.
 */

/** The roll both attacks open with is Random(80), an integer from 0 to 79. */
const ROLL_VALUES = 80;

/** What the total has to clear before the attack rolls any damage at all. */
const HIT_OVER = 32;

/** What comes off the total for each damage die it earns. */
const PER_DIE = 40;

/** The bonus point is rolled `Random(500) < the floor`. */
const BONUS_OVER = 500;

/** One attack in four throws everything above away and rolls a small number instead. */
const SMALL_ROLL_IN = 4;

/** What the small roll's own die is, over half the floor. */
const SMALL_ROLL_BASE = 3;

/** How much of a breather's turns are the breath rather than the swing: `Random(2) != 0`. */
const BREATHES_IN = 2;

/** Everything the monster's attack rolls against, worked out by each game from its own record. */
export interface MonsterAttackOdds {
  /** Whether the monster attacks at all. A puffball never does, and nothing does while Sleep or
   *  Hold Monster is still running. */
  attacks: boolean;
  /** What the d80 is added to: everything the monster brings, less everything the character
   *  wears, carries and is, and plus whatever the floor's own depth is worth. */
  total: number;
  /** The Intelligence a monk has rolled into that total, signed the way the game applies it —
   *  Dungeons of the Unforgiven takes it off, Moraff's World puts it on — and 0 for every other
   *  class. It is the monk who dodges on Intelligence in both games, not the wizard. */
  monkIq: number;
  /** The die the monster's kind does its damage with. */
  damageDie: number;
  /** The floor the character stands on, which the bonus point and the small roll are both drawn
   *  against. */
  floor: number;
  /** The chance the monster's breath weapon leaves damage behind, or null for a monster with
   *  none: half a breather's turns are the breath instead of the swing. */
  breath: number | null;
}

export function monsterHitsYouChance(odds: MonsterAttackOdds): number {
  if (!odds.attacks) return 0;
  const swing = swingChance(odds);
  if (odds.breath === null) return swing;
  return (odds.breath + (BREATHES_IN - 1) * swing) / BREATHES_IN;
}

/** The mean over the d80, and over a monk's Intelligence roll where there is one. */
function swingChance(odds: MonsterAttackOdds): number {
  const intelligence = Math.max(1, Math.abs(odds.monkIq));
  const direction = Math.sign(odds.monkIq);
  let hitting = 0;
  for (let roll = 0; roll < ROLL_VALUES; roll++) {
    for (let iq = 0; iq < intelligence; iq++) {
      hitting += damageChance(odds.total + roll + direction * iq, odds);
    }
  }
  return hitting / (ROLL_VALUES * intelligence);
}

/**
 * The chance one settled total leaves damage behind.
 *
 * The dice are all or nothing together: each comes up zero one time in its own die, so the whole
 * handful comes up zero one time in the die to the power of how many there are. The bonus point
 * saves a handful that did, and the small roll, when it happens, replaces the lot with a die of
 * its own that has one losing face.
 */
function damageChance(total: number, odds: MonsterAttackOdds): number {
  const dice = total > HIT_OVER ? Math.ceil((total - HIT_OVER) / PER_DIE) : 0;
  // Random(1) and Random(0) both always come out 0, so such a die never does any damage.
  const noneFromDice = odds.damageDie < 2 ? 1 : odds.damageDie ** -dice;
  const bonus = Math.min(Math.max(odds.floor, 0), BONUS_OVER) / BONUS_OVER;
  const small = 1 - 1 / (Math.trunc(Math.max(odds.floor, 0) / 2) + SMALL_ROLL_BASE);
  const swung = 1 - noneFromDice * (1 - bonus);
  return ((SMALL_ROLL_IN - 1) * swung + small) / SMALL_ROLL_IN;
}

/**
 * The chance a breath weapon leaves damage behind.
 *
 * Both games roll `strength + Random(strength)` — the monster's level in Dungeons of the
 * Unforgiven and its depth in Moraff's World — and halve it under the matching resistance. The
 * roll is at least the strength itself, so the only breath that does nothing is one from a
 * monster of strength 1 against a character carrying the resistance, whose 1 halves down to
 * nothing, and one from a monster of no strength at all.
 */
export function breathDamageChance(strength: number, resisted: boolean): number {
  if (strength < 1) return 0;
  if (resisted && strength < 2) return 0;
  return 1;
}

/** The die Moraff's Revenge rolls the monster's answer on (1000:8E6E). */
const REV_ROLL_VALUES = 50;

/**
 * 1000:8E44: the chance the monster swings back at all, which is the whole of what it takes to be
 * hit in this game. `Random(50) + the kind's bonus + 1 >= the character's agility`, and the
 * branch is `jae`, so a roll that ties is enough.
 */
export function revAnswerChance(attackBonus: number, agility: number): number {
  const losing = Math.min(Math.max(agility - attackBonus - 1, 0), REV_ROLL_VALUES);
  return (REV_ROLL_VALUES - losing) / REV_ROLL_VALUES;
}

/** The four timers a breath weapon can be halved by, whichever game they are read out of. */
export interface BreathResistances {
  antiFireTimer: number;
  antiColdTimer: number;
  resistDiseaseTimer: number;
  resistPoisonTimer: number;
}

/**
 * Whether the character is carrying the resistance that halves this breath. Fire, ice, green
 * phlegm and black slime each have one; acid has none, and does something worse instead, which is
 * to dissolve the armor being worn.
 */
export function breathResisted(breath: number, timers: BreathResistances): boolean {
  if (breath === 1) return timers.antiFireTimer > 0;
  if (breath === 2) return timers.antiColdTimer > 0;
  if (breath === 4) return timers.resistDiseaseTimer > 0;
  if (breath === 5) return timers.resistPoisonTimer > 0;
  return false;
}
