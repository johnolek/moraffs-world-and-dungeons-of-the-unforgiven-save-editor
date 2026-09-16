import { describe, expect, it } from 'vitest';
import {
  breathDamageChance,
  breathResisted,
  monsterHitsYouChance,
  revAnswerChance,
  type MonsterAttackOdds,
} from './hits-you';

/**
 * The same attack run out over every combination its rolls can take, counted rather than reasoned
 * about: the d80, a monk's Intelligence, every face of every damage die the roll earns, the
 * five hundred values the bonus point is drawn from, the four the small roll is chosen by and the
 * faces of the small roll's own die.
 *
 * Each value of the d80 earns a different number of dice, so the combinations are not one flat
 * space: every roll is counted on its own and the shares are averaged.
 */
function countedOut(odds: Omit<MonsterAttackOdds, 'attacks' | 'breath'>): number {
  const intelligence = Math.max(1, Math.abs(odds.monkIq));
  const direction = Math.sign(odds.monkIq);
  const smallDie = Math.trunc(odds.floor / 2) + 3;
  let shares = 0;
  let rolls = 0;
  for (let roll = 0; roll < 80; roll++) {
    for (let iq = 0; iq < intelligence; iq++) {
      let dice = 0;
      for (let left = odds.total + roll + direction * iq; left > 32; left -= 40) dice++;
      const combinations = odds.damageDie < 2 ? 1 : odds.damageDie ** dice;
      let hits = 0;
      let cases = 0;
      for (let combination = 0; combination < combinations; combination++) {
        let damage = 0;
        let left = combination;
        for (let die = 0; die < dice && odds.damageDie >= 2; die++) {
          damage += left % odds.damageDie;
          left = Math.trunc(left / odds.damageDie);
        }
        for (let bonus = 0; bonus < 500; bonus++) {
          const swung = damage + (bonus < odds.floor ? 1 : 0);
          for (let quarter = 0; quarter < 4; quarter++) {
            for (let value = 0; value < smallDie; value++) {
              cases++;
              if ((quarter === 1 ? value : swung) > 0) hits++;
            }
          }
        }
      }
      shares += hits / cases;
      rolls++;
    }
  }
  return shares / rolls;
}

const attacking = (odds: Omit<MonsterAttackOdds, 'attacks' | 'breath'>): MonsterAttackOdds => ({
  ...odds,
  attacks: true,
  breath: null,
});

describe("the chance the monster's attack takes hit points off you", () => {
  const cases: Omit<MonsterAttackOdds, 'attacks' | 'breath'>[] = [
    // A fighter deep enough that most rolls earn one die.
    { total: 20, monkIq: 0, damageDie: 2, floor: 4 },
    // A monk, whose Intelligence is another roll in the total.
    { total: 20, monkIq: -3, damageDie: 2, floor: 4 },
    // High enough up that some rolls earn a second die.
    { total: 60, monkIq: 0, damageDie: 3, floor: 4 },
    // Moraff's World's monk, whose Intelligence goes on rather than off.
    { total: 10, monkIq: 3, damageDie: 3, floor: 4 },
  ];

  for (const odds of cases) {
    it(`agrees with every roll counted out, at ${odds.total} against a d${odds.damageDie}`, () => {
      expect(monsterHitsYouChance(attacking(odds))).toBeCloseTo(countedOut(odds), 12);
    });
  }

  it('is nothing at all for a monster that never attacks', () => {
    expect(monsterHitsYouChance({ ...attacking(cases[0]), attacks: false })).toBe(0);
  });

  it('never leaves the small roll out, so even a hopeless attack lands sometimes', () => {
    // A total nothing can carry past 32 earns no dice at all, so the whole chance is the bonus
    // point and the one attack in four.
    const hopeless = attacking({ total: -400, monkIq: 0, damageDie: 6, floor: 4 });
    expect(monsterHitsYouChance(hopeless)).toBeCloseTo(countedOut({ total: -400, monkIq: 0, damageDie: 6, floor: 4 }), 12);
    expect(monsterHitsYouChance(hopeless)).toBeGreaterThan(0);
  });

  it('splits a breather half and half between the breath and the swing', () => {
    const odds = attacking(cases[0]);
    const swing = monsterHitsYouChance(odds);
    expect(monsterHitsYouChance({ ...odds, breath: 1 })).toBeCloseTo((1 + swing) / 2, 12);
    expect(monsterHitsYouChance({ ...odds, breath: 0 })).toBeCloseTo(swing / 2, 12);
  });
});

describe('a breath weapon', () => {
  /** `strength + Random(strength)`, halved under the resistance, counted over the die. */
  const counted = (strength: number, resisted: boolean) => {
    // Random(0) is 0, so a monster of no depth rolls no damage at all.
    if (strength < 1) return 0;
    let hits = 0;
    for (let roll = 0; roll < strength; roll++) {
      const damage = strength + roll;
      if ((resisted ? Math.trunc(damage / 2) : damage) > 0) hits++;
    }
    return hits / strength;
  };

  it('always leaves damage behind when nothing resists it', () => {
    for (const strength of [1, 2, 9]) expect(breathDamageChance(strength, false)).toBe(counted(strength, false));
  });

  it('is halved to nothing only when the monster is as shallow as it gets', () => {
    expect(breathDamageChance(1, true)).toBe(counted(1, true));
    expect(breathDamageChance(2, true)).toBe(counted(2, true));
    expect(breathDamageChance(9, true)).toBe(counted(9, true));
  });

  it('does nothing at all from a monster of no depth', () => {
    expect(breathDamageChance(0, false)).toBe(0);
  });

  it('is halved by the timer that matches it, and acid by none of them', () => {
    const none = { antiFireTimer: 0, antiColdTimer: 0, resistDiseaseTimer: 0, resistPoisonTimer: 0 };
    expect(breathResisted(1, { ...none, antiFireTimer: 5 })).toBe(true);
    expect(breathResisted(2, { ...none, antiColdTimer: 5 })).toBe(true);
    expect(breathResisted(4, { ...none, resistDiseaseTimer: 5 })).toBe(true);
    expect(breathResisted(5, { ...none, resistPoisonTimer: 5 })).toBe(true);
    expect(breathResisted(3, { antiFireTimer: 5, antiColdTimer: 5, resistDiseaseTimer: 5, resistPoisonTimer: 5 })).toBe(false);
    expect(breathResisted(1, none)).toBe(false);
  });
});

describe("the chance Moraff's Revenge's monster swings back", () => {
  /** Random(50) + the bonus + 1 >= agility, counted over the fifty faces. */
  const counted = (bonus: number, agility: number) => {
    let hits = 0;
    for (let roll = 0; roll < 50; roll++) if (roll + bonus + 1 >= agility) hits++;
    return hits / 50;
  };

  for (const [bonus, agility] of [
    [0, 12],
    [0, 1],
    [0, 51],
    [0, 90],
    [20, 30],
    [40, 12],
  ]) {
    it(`agrees with every roll counted out, at a bonus of ${bonus} against agility ${agility}`, () => {
      expect(revAnswerChance(bonus, agility)).toBeCloseTo(counted(bonus, agility), 12);
    });
  }
});
