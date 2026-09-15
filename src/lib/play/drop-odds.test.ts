import { describe, expect, it } from 'vitest';
import { ARMOR_NAMES, WEAPON_NAMES, dropArmor, dropWeapon } from '../game/port/drops';
import { killMonster } from '../game/port/kills';
import { SeededRng, type Rng } from '../game/port/rng';
import { newGame, type Game, type PlayerCharacter } from '../game/port/state';
import { armorDropChance, dropOdds, specialDropChance, weaponDropChance } from './drop-odds';

/** The class byte of a monk, who is offered nothing a kill leaves behind. */
const MONK = 2;
/** The class byte of a fighter, who is one of the two let past the first find gate more easily. */
const FIGHTER = 0;
/** A worshipper, who is not, and so stands for every other class at that gate. */
const WORSHIPPER = 1;

/** get_choice's answer to the menu a dropped weapon or suit of armor puts up: leave it there, so
 *  that a run of kills does not change what the next one can be offered. */
const LEAVE = 0x32;

/** The line every drop opens with, which is how a simulated kill says it made an offer. */
const OFFERED = 'GOOD NEWS...';

/** Monster kind 23 is Gargalon, one of section 1's ordinary monsters and not a level drainer. */
const REGULAR = 23;

/** How many kills a simulated share is counted over. */
const TRIALS = 20000;

/**
 * An {@link Rng} that hands back the numbers it is given, in order, and 0 once they run out,
 * which is how `drops.test.ts` pins one run of a routine down.
 */
function rolls(...values: number[]): Rng {
  let at = 0;
  return { random: () => (at < values.length ? values[at++] : 0) };
}

/** A game with one monster of that level engaged, which is what a drop rolls against. */
function killing(rng: Rng, pc: Partial<PlayerCharacter>, monsterLevel: number): Game {
  const game = newGame({ rng, pc, choice: async () => LEAVE });
  game.monsters[0].level = monsterLevel;
  game.engaged = 0;
  return game;
}

/** The share of `trials` kills that made an offer, run through the routine itself. */
async function observed(
  drop: (game: Game) => Promise<void>,
  pc: Partial<PlayerCharacter>,
  monsterLevel: number,
  trials = 20000,
): Promise<number> {
  const game = killing(new SeededRng(7), pc, monsterLevel);
  for (let trial = 0; trial < trials; trial += 1) await drop(game);
  return game.messages.filter((line) => line === OFFERED).length / trials;
}

/** How far a simulated share may sit from the counted one: far enough out that twenty thousand
 *  trials will not fail by luck, close enough that a wrong formula cannot hide. */
const TOLERANCE = 0.015;

describe('the chance a kill offers a weapon', () => {
  it('matches what drop_weapon itself does over twenty thousand kills', async () => {
    const pc = { cls: FIGHTER, weaponsOwned: [1, 0, 0, 0, 0, 0, 0, 0] };
    const game = killing(rolls(), pc, 300);
    expect(await observed(dropWeapon, pc, 300)).toBeCloseTo(weaponDropChance(game, 300), 2);
  });

  it('matches it on a shallow floor too, where most of the rolls fail', async () => {
    const pc = { cls: FIGHTER, weaponsOwned: [1, 0, 0, 0, 0, 0, 0, 0] };
    const game = killing(rolls(), pc, 5);
    expect(Math.abs((await observed(dropWeapon, pc, 5)) - weaponDropChance(game, 5))).toBeLessThan(TOLERANCE);
  });

  it('leaves out the rows the character already owns', () => {
    // Row 0 is the fist, which a kill never offers, so this owns rows 1, 2 and 3.
    const owned = killing(rolls(), { weaponsOwned: [1, 1, 1, 1, 0, 0, 0, 0] }, 300);
    const bare = killing(rolls(), { weaponsOwned: [1, 0, 0, 0, 0, 0, 0, 0] }, 300);
    // A monster of level 300 passes the roll for each of those three every time, so owning them
    // takes exactly three sevenths off.
    expect(weaponDropChance(bare, 300) - weaponDropChance(owned, 300)).toBeCloseTo(3 / 7, 10);
  });

  it('offers a monk nothing', () => {
    expect(weaponDropChance(killing(rolls(), { cls: MONK }, 300), 300)).toBe(0);
  });

  it('follows the high speed option in leaving out a row already bettered', () => {
    const game = killing(rolls(), { weaponsOwned: [1, 0, 0, 0, 0, 0, 0, 1] }, 300);
    const before = weaponDropChance(game, 300);
    game.highSpeed = true;
    // The Great Sword in row 7 is better than every other row, so nothing at all is offered.
    expect(before).toBeGreaterThan(0);
    expect(weaponDropChance(game, 300)).toBe(0);
  });
});

describe('the chance a kill offers armor', () => {
  it('matches what drop_armor itself does over twenty thousand kills', async () => {
    const pc = { cls: FIGHTER, armorOwned: [1, 0, 0, 0, 0, 0, 0] };
    const game = killing(rolls(), pc, 120);
    expect(Math.abs((await observed(dropArmor, pc, 120)) - armorDropChance(game, 120))).toBeLessThan(TOLERANCE);
  });

  it('counts a suit the character already owns, which a weapon never is', () => {
    const owned = killing(rolls(), { armorOwned: [1, 1, 1, 0, 0, 0, 0] }, 300);
    const bare = killing(rolls(), { armorOwned: [1, 0, 0, 0, 0, 0, 0] }, 300);
    expect(armorDropChance(owned, 300)).toBe(armorDropChance(bare, 300));
  });

  it('offers a monk nothing', () => {
    expect(armorDropChance(killing(rolls(), { cls: MONK }, 300), 300)).toBe(0);
  });
});

describe('the chance a kill turns up a special item', () => {
  it('turns up nothing in the town, where the second gate is the floor out of twenty', () => {
    expect(specialDropChance(killing(rolls(), { cls: WORSHIPPER, level: 0 }, 40))).toBe(0);
  });

  it('opens the second gate the whole way from floor twenty down', () => {
    const deep = killing(rolls(), { cls: WORSHIPPER, level: 20 }, 40);
    // 60 in 950 past the first gate, every roll past the second, then two rolls in three.
    expect(specialDropChance(deep)).toBeCloseTo((60 / 950) * (2 / 3), 10);
  });

  it('lets a fighter past the first gate more easily than a worshipper', () => {
    const fighter = killing(rolls(), { cls: FIGHTER, level: 20 }, 40);
    expect(specialDropChance(fighter)).toBeCloseTo((60 / 550) * (2 / 3), 10);
  });

  it('takes off the twelfth that rolls a floor slosher the character already carries', () => {
    const empty = killing(rolls(), { cls: WORSHIPPER, level: 20 }, 40);
    const carrying = killing(rolls(), { cls: WORSHIPPER, level: 20, slosher: 1 }, 40);
    expect(specialDropChance(carrying)).toBeCloseTo(specialDropChance(empty) * (11 / 12), 10);
  });

  it('turns up nothing for a monk', () => {
    expect(specialDropChance(killing(rolls(), { cls: MONK, level: 40 }, 40))).toBe(0);
  });

  it('does not depend on the monster, only on the floor it stands on', () => {
    const near = killing(rolls(), { cls: WORSHIPPER, level: 30 }, 1);
    const far = killing(rolls(), { cls: WORSHIPPER, level: 30 }, 900);
    expect(dropOdds(near).special).toBe(dropOdds(far).special);
  });
});

describe('the odds a kill is really made on', () => {
  /** The weapon and armor offers made over `trials` kills, run through kill_monster itself,
   *  which is the only thing that calls drop_weapon and drop_armor. */
  async function offeredByKills(pc: Partial<PlayerCharacter>, monsterLevel: number, trials: number) {
    const game = newGame({
      rng: new SeededRng(7),
      pc: { hp: 100, maxHp: 100, ...pc },
      choice: async () => LEAVE,
      pressAnyKey: () => {},
      delay: () => {},
    });
    let weapons = 0;
    let armors = 0;
    for (let trial = 0; trial < trials; trial += 1) {
      Object.assign(game.monsters[3], { x: 11, y: 12, hp: 0, type: REGULAR, level: monsterLevel });
      game.engaged = 3;
      game.messages.length = 0;
      await killMonster(game);
      // A spell paper's line opens the same way a weapon's does, so both are matched whole.
      const said = (offer: string) => game.messages.some((line) => line === offer);
      if (WEAPON_NAMES.some((name) => said(`YOU FIND A ${name}`))) weapons += 1;
      if (ARMOR_NAMES.some((name) => said(`YOU FIND ${name} ARMOR.`))) armors += 1;
    }
    return { weapon: weapons / trials, armor: armors / trials };
  }

  it('rolls both offers against the emptied slot, whatever the monster was worth', async () => {
    const pc = { cls: FIGHTER, level: 10, weaponsOwned: [1, 0, 0, 0, 0, 0, 0, 0] };
    const game = killing(rolls(), pc, 300);
    const odds = dropOdds(game);
    const observed = await offeredByKills(pc, 300, TRIALS);

    expect(Math.abs(observed.weapon - odds.weapon)).toBeLessThan(TOLERANCE);
    expect(Math.abs(observed.armor - odds.armor)).toBeLessThan(TOLERANCE);
    // A level 300 monster would pass every one of those rolls if its level were still there.
    expect(odds.weapon).toBeLessThan(weaponDropChance(game, 300));
  });
});
