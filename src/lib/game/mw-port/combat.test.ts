import { describe, expect, it } from 'vitest';
import { defenseBeatenChance } from '../../bestiary/to-hit';
import { monsterDefence, toHitTotal } from '../../mw-bestiary/to-hit';
import { MONSTERS } from '../../mw-bestiary/monsters';
import type { Rng } from '../port/rng';
import type { MwKillChoices } from './combat';
import {
  attackTiming,
  checkEngagement,
  experienceForKill,
  monsterKilled,
  monsterTurn,
  monstersMove,
  puffballStat,
  spendTime,
  startEngagementTimer,
  strike,
  swing,
  tickSpellTimers,
} from './combat';
import type { MwCharacter, MwGameOverrides } from './state';
import { MW_SQUARE_EMPTY, MW_FLOOR_COLUMNS, newMwGame, mwOccupantAt, mwSetOccupant } from './state';
import { MONSTER_SLOTS } from './stocking';
import type { MwStockedMonster } from './stocking';

/** An Rng that hands back the numbers a test names, in order, and then zeroes. */
function scripted(rolls: number[]): Rng {
  let at = 0;
  return { random: () => (at < rolls.length ? rolls[at++] : 0) };
}

/**
 * An Rng that rolls as near `value` as the call allows.
 *
 * `Random(n)` hands back 0 to n-1 and nothing in the game is written to survive more, so a stub
 * that answers above the range is not a generator the port could ever meet. Clamping keeps
 * `always(9999)` meaning "the highest this roll can go" without inventing indexes off the end of
 * the spell tables.
 */
function always(value: number): Rng {
  return { random: (n) => Math.max(0, Math.min(value, n - 1)) };
}

/** A floor with 145 empty slots, `placed` monsters on it and the occupancy grid to match. */
function fightGame(placed: MwStockedMonster[], overrides: MwGameOverrides = {}) {
  const monsters: MwStockedMonster[] = Array.from({ length: MONSTER_SLOTS }, (_, slot) => {
    return placed[slot] ?? { x: 100, y: 100, hp: 0, type: 0, depth: 0 };
  });
  const game = newMwGame({ monsters, ...overrides });
  placed.forEach((monster, slot) => mwSetOccupant(game, monster.x, monster.y, slot));
  return game;
}

describe('puffballStat', () => {
  it("moves the characteristic its number names by exactly one point, either way", () => {
    const stats: (keyof MwCharacter)[] = ['str', 'iq', 'wis', 'con', 'dex', 'luck'];
    const names = ['STRENGTH', 'INTELLIGENCE', 'WISDOM', 'CONSTITUTION', 'DEXTERITY', 'LUCK'];
    for (let which = 1; which <= 6; which++) {
      const up = newMwGame({ pc: { str: 10, iq: 10, wis: 10, con: 10, dex: 10, luck: 10 } });
      expect(puffballStat(up, which)).toBe(names[which - 1]);
      expect(up.pc[stats[which - 1]]).toBe(11);

      const down = newMwGame({ pc: { str: 10, iq: 10, wis: 10, con: 10, dex: 10, luck: 10 } });
      expect(puffballStat(down, -which)).toBe(names[which - 1]);
      expect(down.pc[stats[which - 1]]).toBe(9);
    }
  });

  it("does nothing at all for a number outside the twelve", () => {
    const game = newMwGame({ pc: { str: 10 } });
    expect(puffballStat(game, 7)).toBe('');
    expect(game.pc.str).toBe(10);
  });
});

describe('strike', () => {
  const werewolf = MONSTERS[1];

  /** A swinging character whose to-hit total the bestiary can work out too. */
  const fighter = { lev: 4, str: 22, luck: 11, weapon: 6, weaponPlus: 2, gauntlet: 3 };

  function swinger(depth: number, roll: number) {
    const monster: MwStockedMonster = { x: 5, y: 4, hp: 500, type: 1, depth };
    const weaponPlus = [0, 0, 0, 0, 0, 0, 0, 0];
    weaponPlus[fighter.weapon] = fighter.weaponPlus;
    // The first roll is the d80; every roll after it is 1, so a damage die that gets rolled at
    // all lands and the swing reads as a hit exactly when the roll got past the defence.
    return fightGame([monster], {
      rng: scripted([roll]),
      engaged: 0,
      pc: {
        lev: fighter.lev,
        str: fighter.str,
        luck: fighter.luck,
        weapon: fighter.weapon,
        weaponPlus,
        gauntlet: fighter.gauntlet,
        floor: 12,
        x: 5,
        y: 5,
      },
    });
  }

  it("reproduces the odds src/lib/mw-bestiary/to-hit.ts works out in closed form", () => {
    for (const depth of [3, 12, 20]) {
      let landed = 0;
      for (let roll = 0; roll < 80; roll++) {
        const game = swinger(depth, roll);
        game.rng = { random: (n) => (n === 80 ? roll : 1) };
        if (strike(game) > 0) landed += 1;
      }
      const total = toHitTotal(fighter);
      const expected = defenseBeatenChance(
        total,
        depth,
        werewolf.defence + werewolf.extraDefence,
        werewolf.defenceAndAttack,
      );
      expect(landed / 80).toBeCloseTo(expected, 10);
    }
  });

  it("takes twice the depth and the monster row's three defence bytes off the roll", () => {
    const total = toHitTotal(fighter);
    const off = monsterDefence(werewolf, 12);
    // The swing lands when roll + total - off > 40, so this is the first roll that does.
    const first = 41 - (total - off);
    const missed = swinger(12, first - 1);
    missed.rng = { random: (n) => (n === 80 ? first - 1 : 1) };
    expect(strike(missed)).toBe(0);
    expect(missed.messages).toContain('YOU MISSED THE MONSTER');

    const landed = swinger(12, first);
    landed.rng = { random: (n) => (n === 80 ? first : 1) };
    expect(strike(landed)).toBeGreaterThan(0);
  });

  it("swings the die one row past the power weapon the spell asked for", () => {
    // Every roll is zero but the d80 and one on the 129-sided die, so a swing that comes out
    // 100 is a swing that rolled POWER WEAPON 2's die.
    const rig = { random: (n: number) => (n === 80 ? 30 : n === 129 ? 100 : 0) };
    const powered = swinger(1, 30);
    powered.rng = rig;
    powered.pc.powerWeaponLevel = 1;
    expect(strike(powered)).toBe(100);

    const plain = swinger(1, 30);
    plain.rng = rig;
    expect(strike(plain)).toBe(0);
  });

  it("announces the hit on its own line only on floors 1 to 4", () => {
    const shallow = swinger(1, 79);
    shallow.rng = { random: (n) => (n === 80 ? 79 : 1) };
    shallow.pc.floor = 4;
    strike(shallow);
    expect(shallow.messages[0]).toBe('YOU HIT! THE MONSTER IN THE');
    expect(shallow.messages[1]).toMatch(/^NORTH TAKES \d+ POINTS DAMAGE$/);

    const deep = swinger(1, 79);
    deep.rng = { random: (n) => (n === 80 ? 79 : 1) };
    deep.pc.floor = 5;
    strike(deep);
    expect(deep.messages[0]).toMatch(/^NORTH \d+ POINTS DAMAGE$/);
  });

  it("takes the damage off the monster it is engaging", () => {
    const game = swinger(1, 79);
    game.rng = { random: (n) => (n === 80 ? 79 : 1) };
    const done = strike(game);
    expect(game.monsters[0].hp).toBe(500 - done);
  });

  it("blanks the strip for a tenth of a second before it says what the swing did", () => {
    const game = swinger(1, 79);
    game.rng = { random: (n) => (n === 80 ? 79 : 1) };
    const delays: number[] = [];
    game.delay = (ms) => void delays.push(ms);
    strike(game);
    expect(delays).toEqual([100]);
  });
});

describe('monsterTurn', () => {
  it("pops a puffball and leaves the slot holding an ogre at (100, 100)", () => {
    const puff: MwStockedMonster = { x: 5, y: 4, hp: 30, type: 72, depth: 10 };
    const game = fightGame([puff], { pc: { str: 20, x: 5, y: 5, floor: 10 } });
    expect(monsterTurn(game, 0)).toBe(0);
    expect(game.pc.str).toBe(21);
    expect(game.messages).toContain('STRENGTH RAISED BY PUFFBALL!');
    // The strip, in the menu column's own colour rather than the 15 the rest of a fight uses.
    expect(game.screen).toEqual([
      { text: 'STRENGTH RAISED BY PUFFBALL!', x: 0, y: 0, font: 0, colour: 6 },
    ]);
    expect(mwOccupantAt(game, 5, 4)).toBe(-1);
    expect(game.monsters[0]).toEqual({ x: 100, y: 100, hp: 0, type: 0, depth: 0 });
    expect(game.redrawView).toBe(true);
  });

  it("counts sleep down in the monster's turns and lets the floor break it", () => {
    const asleep = fightGame([{ x: 5, y: 4, hp: 30, type: 1, depth: 10 }], {
      rng: always(499),
      pc: { sleepTimer: 4, floor: 10, x: 5, y: 5 },
    });
    expect(monsterTurn(asleep, 0)).toBe(0);
    expect(asleep.pc.sleepTimer).toBe(3);

    const waking = fightGame([{ x: 5, y: 4, hp: 30, type: 1, depth: 10 }], {
      rng: always(0),
      pc: { sleepTimer: 4, floor: 10, x: 5, y: 5 },
    });
    monsterTurn(waking, 0);
    expect(waking.pc.sleepTimer).toBe(0);
  });

  it("holds the same way sleep does", () => {
    const game = fightGame([{ x: 5, y: 4, hp: 30, type: 1, depth: 10 }], {
      rng: always(499),
      pc: { holdMonsterTimer: 2, floor: 10, x: 5, y: 5 },
    });
    expect(monsterTurn(game, 0)).toBe(0);
    expect(game.pc.holdMonsterTimer).toBe(1);
  });

  it("adds a monk's own intelligence roll to the monster's chance of hitting them", () => {
    const rolls = [40, 30, 499, 0, 0, 0];
    const monk = fightGame([{ x: 5, y: 4, hp: 30, type: 1, depth: 10 }], {
      rng: scripted(rolls),
      pc: { cls: 2, iq: 40, con: 100, lev: 30, floor: 10, hp: 100, x: 5, y: 5 },
    });
    const fighter = fightGame([{ x: 5, y: 4, hp: 30, type: 1, depth: 10 }], {
      rng: scripted([40, 499, 0, 0, 0]),
      pc: { cls: 0, iq: 40, con: 100, lev: 30, floor: 10, hp: 100, x: 5, y: 5 },
    });
    expect(monsterTurn(monk, 0)).toBeGreaterThan(monsterTurn(fighter, 0));
  });

  it("breathes instead of striking, and the resistance halves it", () => {
    const plain = fightGame([{ x: 5, y: 4, hp: 30, type: 84, depth: 20 }], {
      rng: always(0),
      pc: { floor: 10, hp: 100, x: 5, y: 5 },
    });
    // Every roll is 0 but the breath test wants a non-zero, so rig only that one.
    plain.rng = { random: (n) => (n === 2 ? 1 : 0) };
    expect(monsterTurn(plain, 0)).toBe(20);
    expect(plain.messages[0]).toBe('THE MONSTER BREATHES FIRE');
    expect(plain.messages).toContain('YOU FEEL TOASTED.');

    const warded = fightGame([{ x: 5, y: 4, hp: 30, type: 84, depth: 20 }], {
      pc: { floor: 10, hp: 100, antiFireTimer: 50, x: 5, y: 5 },
    });
    warded.rng = { random: (n) => (n === 2 ? 1 : 0) };
    expect(monsterTurn(warded, 0)).toBe(10);
    expect(warded.messages).not.toContain('YOU FEEL TOASTED.');
  });

  it("takes the levels a level drainer earns and the experience with them", () => {
    const game = fightGame([{ x: 5, y: 4, hp: 30, type: 26, depth: 40 }], {
      rng: always(1),
      pc: { cls: 0, lev: 5, exp: 5000, con: 10, luck: 10, hp: 200, maxHp: 200, floor: 40, x: 5, y: 5 },
    });
    monsterTurn(game, 0);
    expect(game.pc.lev).toBe(4);
    expect(game.pc.exp).toBeCloseTo(250 * 1.36 ** 2 - 130, 6);
    expect(game.messages).toContain('OH NO! HIT BY LEVEL DRAINER!');
    expect(game.messages).toContain('  YOU LOSE 1 LEVEL!');
  });

  it("leaves a level 0 character's levels alone", () => {
    const game = fightGame([{ x: 5, y: 4, hp: 30, type: 26, depth: 40 }], {
      rng: always(1),
      pc: { lev: 0, exp: 30, hp: 200, floor: 40, x: 5, y: 5 },
    });
    monsterTurn(game, 0);
    expect(game.pc.lev).toBe(0);
    expect(game.pc.exp).toBe(30);
  });

  it("poisons for 450 moves, once", () => {
    const game = fightGame([{ x: 5, y: 4, hp: 30, type: 43, depth: 40 }], {
      rng: always(1),
      pc: { lev: 0, hp: 200, floor: 40, x: 5, y: 5 },
    });
    monsterTurn(game, 0);
    expect(game.pc.poisonTimer).toBe(450);
    expect(game.messages).toContain('OH NO! YOU HAVE BEEN');

    game.pc.poisonTimer = 3;
    monsterTurn(game, 0);
    expect(game.pc.poisonTimer).toBe(3);
  });

  it("opens on a blank strip and holds a beat between each thing it says", () => {
    /** The attack an ordinary werewolf makes, and every delay it asked for. */
    const beats = (type: number, roll: number): number[] => {
      const game = fightGame([{ x: 5, y: 4, hp: 30, type, depth: 40 }], {
        rng: always(roll),
        pc: { lev: 5, con: 10, exp: 5000, hp: 2000, maxHp: 2000, floor: 40, x: 5, y: 5 },
      });
      const delays: number[] = [];
      game.delay = (ms) => void delays.push(ms);
      monsterTurn(game, 0);
      return delays;
    };
    // A werewolf's kind byte is 99, which takes the beat before the box about a poisoning even
    // though it never prints one.
    expect(beats(1, 1)).toEqual([110, 250, 350]);
    // A vampire drains a level and a characteristic on top of the blow.
    expect(beats(33, 1)).toEqual([110, 250, 500, 250, 350]);
  });

  it("settles a shorter beat on a miss, which brings nothing with it", () => {
    // Every roll is zero but the one that hands out a bonus point on a deep floor, which is
    // rolled high enough to miss.
    const game = fightGame([{ x: 5, y: 4, hp: 30, type: 1, depth: 1 }], {
      rng: { random: (n) => (n === 500 ? 499 : 0) },
      pc: { lev: 60, dex: 90, luck: 90, hp: 200, floor: 1, x: 5, y: 5 },
    });
    const delays: number[] = [];
    game.delay = (ms) => void delays.push(ms);
    expect(monsterTurn(game, 0)).toBe(0);
    expect(delays).toEqual([110, 100]);
  });

  it("takes the damage off the character", () => {
    const game = fightGame([{ x: 5, y: 4, hp: 30, type: 1, depth: 40 }], {
      rng: always(1),
      pc: { lev: 3, con: 10, hp: 200, floor: 40, x: 5, y: 5 },
    });
    const done = monsterTurn(game, 0);
    expect(done).toBeGreaterThan(0);
    expect(game.pc.hp).toBe(200 - done);
  });
});

describe('tickSpellTimers', () => {
  it("gives back the seven points the two battle spells lent when they run out", () => {
    const game = newMwGame({ pc: { str: 27, dex: 24, strengthTimer: 3, speedTimer: 30 } });
    tickSpellTimers(game, 5);
    expect(game.pc.strengthTimer).toBe(0);
    expect(game.pc.str).toBe(20);
    expect(game.pc.speedTimer).toBe(25);
    expect(game.pc.dex).toBe(24);
  });

  it("wipes the monster's line when sleep and hold run out", () => {
    const game = newMwGame({ pc: { sleepTimer: 1, holdMonsterTimer: 1 } });
    game.monsterStatusLine = 'IT IS ASLEEP';
    tickSpellTimers(game, 1);
    expect(game.monsterStatusLine).toBe('');
  });

  it("clears the level beside the timer for Power Weapon and Protection", () => {
    const game = newMwGame({
      pc: { powerWeaponLevel: 3, powerWeaponTimer: 2, protectionLevel: 4, protectionTimer: 60 },
    });
    tickSpellTimers(game, 2);
    expect(game.pc.powerWeaponLevel).toBe(0);
    expect(game.pc.protectionLevel).toBe(4);
    expect(game.pc.protectionTimer).toBe(58);
  });
});

describe('monstersMove', () => {
  /** A floor whose every side is open, with the character at (10, 10). */
  function walking(placed: MwStockedMonster[], overrides: MwGameOverrides = {}) {
    return fightGame(placed, { pc: { x: 10, y: 10, floor: 10, ...overrides.pc }, ...overrides });
  }

  it("steps a nearby monster towards the character, west before north", () => {
    const game = walking([{ x: 14, y: 12, hp: 5, type: 1, depth: 10 }], { rng: always(0) });
    monstersMove(game);
    expect([game.monsters[0].x, game.monsters[0].y]).toEqual([13, 12]);
    expect(mwOccupantAt(game, 13, 12)).toBe(0);
    expect(mwOccupantAt(game, 14, 12)).toBe(-1);
  });

  it("goes north when it is already in the character's column", () => {
    const game = walking([{ x: 10, y: 14, hp: 5, type: 1, depth: 10 }], { rng: always(0) });
    monstersMove(game);
    expect([game.monsters[0].x, game.monsters[0].y]).toEqual([10, 13]);
  });

  it("will not step onto a square another monster holds", () => {
    const game = walking([
      { x: 12, y: 10, hp: 5, type: 1, depth: 10 },
      { x: 11, y: 10, hp: 5, type: 1, depth: 10 },
    ], { rng: always(0) });
    monstersMove(game);
    expect(game.monsters[0].x).toBe(12);
    expect(game.monsters[1].x).toBe(10);
  });

  it("leaves a monster too far off where it is", () => {
    const game = walking([{ x: 40, y: 40, hp: 5, type: 1, depth: 10 }], { rng: always(0) });
    game.monsterTimers[0] = -30;
    monstersMove(game);
    expect(game.monsters[0].x).toBe(40);
    expect(game.monsterTimers[0]).toBe(1);
  });

  it("holds the whole pass one move in four while Fast Move runs", () => {
    const game = walking([{ x: 12, y: 10, hp: 5, type: 1, depth: 10 }], {
      rng: always(1),
      pc: { fastMove: 1 },
    });
    monstersMove(game);
    expect(game.monsters[0].x).toBe(12);
  });

  it("bites with the poison every 450 moves and takes a point of strength", () => {
    const game = walking([], { rng: always(2), pc: { poisonTimer: 2, str: 18 } });
    monstersMove(game);
    expect(game.pc.str).toBe(17);
    expect(game.pc.poisonTimer).toBe(450);
    expect(game.messages[1]).toBe('  LOST A POINT OF STRENGTH');
  });

  it("bites with the disease the same way, and stops at a constitution of 1", () => {
    const game = walking([], { rng: always(2), pc: { diseaseTimer: 2, con: 1 } });
    monstersMove(game);
    expect(game.pc.con).toBe(1);
    expect(game.pc.diseaseTimer).toBe(450);
  });

  it("walks through a door, which the character cannot fight through", () => {
    const game = walking([{ x: 12, y: 10, hp: 5, type: 1, depth: 10 }], {
      rng: always(0),
      wallSide: () => 1,
    });
    monstersMove(game);
    expect(game.monsters[0].x).toBe(11);
  });

  it("stays put where every side is a wall", () => {
    const game = walking([{ x: 12, y: 10, hp: 5, type: 1, depth: 10 }], {
      rng: always(0),
      wallSide: () => 0,
    });
    monstersMove(game);
    expect(game.monsters[0].x).toBe(12);
  });
});

describe('checkEngagement', () => {
  it("finds the monster on the square the character faces", () => {
    const game = fightGame([{ x: 5, y: 4, hp: 9, type: 1, depth: 3 }], {
      pc: { x: 5, y: 5, dir: 0 },
    });
    expect(checkEngagement(game)).toBe(0);
    game.pc.dir = 1;
    expect(checkEngagement(game)).toBe(-1);
  });

  it("refuses to reach through anything but open air", () => {
    const game = fightGame([{ x: 5, y: 4, hp: 9, type: 1, depth: 3 }], {
      pc: { x: 5, y: 5, dir: 0 },
      wallSide: () => 2,
    });
    expect(checkEngagement(game)).toBe(-1);
  });

  it("will not engage the character's own square", () => {
    const game = fightGame([], { pc: { x: 5, y: 5, dir: 0 } });
    mwSetOccupant(game, 5, 4, 0xfe);
    expect(checkEngagement(game)).toBe(-1);
  });
});

describe('attackTiming', () => {
  it("turns the character towards a monster beside them and keeps them there", () => {
    const game = fightGame([{ x: 6, y: 5, hp: 9, type: 1, depth: 3 }], {
      rng: always(0),
      pc: { x: 5, y: 5, dir: 0, dex: 30 },
    });
    expect(attackTiming(game)).toBe(0);
    expect(game.pc.dir).toBe(3);
    expect(game.engaged).toBe(0);
    expect(game.messages).toContain('YOU ARE FIGHTING THE MONSTER');
    expect(game.messages).toContain('IN THE EAST VIEW.');
    expect(game.messages).toContain('MONSTER TYPE: WEREWOLF');
  });

  it("starts the new monster's timer at a roll on the character's agility", () => {
    const game = fightGame([{ x: 6, y: 5, hp: 9, type: 1, depth: 3 }], {
      rng: scripted([1, 17]),
      pc: { x: 5, y: 5, dir: 3, dex: 30 },
    });
    attackTiming(game);
    expect(game.monsterTimers[0]).toBe(17);
  });

  it("gives one new engagement in three no head start at all", () => {
    const game = fightGame([{ x: 6, y: 5, hp: 9, type: 1, depth: 3 }], {
      rng: scripted([0]),
      pc: { x: 5, y: 5, dir: 3, dex: 30, invisibility: 0 },
    });
    game.monsterTimers[0] = -5;
    attackTiming(game);
    expect(game.monsterTimers[0]).toBe(-5);
  });

  it("hands back -1 and turns the character once more when nothing is beside them", () => {
    const game = fightGame([], { rng: always(0), pc: { x: 5, y: 5, dir: 0, dex: 30 } });
    expect(attackTiming(game)).toBe(-1);
    expect(game.pc.dir).toBe(0);
    expect(game.engaged).toBe(-1);
  });
});

describe('spendTime', () => {
  it("gives a monster beside the character one turn per interval of its own", () => {
    const game = fightGame([{ x: 5, y: 4, hp: 40, type: 1, depth: 10 }], {
      rng: always(0),
      pc: { x: 5, y: 5, floor: 10, hp: 200, dex: 30, lev: 30, con: 100 },
    });
    spendTime(game, 30);
    // The werewolf's byte at 0x16 is 9, so it goes back up by (85 - 9) / 3 + 10 = 35.
    expect(game.monsterTimers[0]).toBe(5);
    expect(game.movesTaken).toBe(30);
  });

  it("gives no monster more than three turns for one action", () => {
    const game = fightGame([{ x: 5, y: 4, hp: 4000, type: 1, depth: 10 }], {
      rng: always(0),
      pc: { x: 5, y: 5, floor: 10, hp: 20000, dex: 30, lev: 30, con: 100 },
    });
    spendTime(game, 500);
    // The third turn throws the timer up to the whole agility before the interval goes on top.
    expect(game.monsterTimers[0]).toBe(30 + 35);
  });

  it("gives a monster a wall away nothing", () => {
    const game = fightGame([{ x: 5, y: 4, hp: 40, type: 1, depth: 10 }], {
      rng: always(0),
      wallSide: () => 0,
      pc: { x: 5, y: 5, floor: 10, hp: 200, dex: 30 },
    });
    spendTime(game, 500);
    expect(game.pc.hp).toBe(200);
  });

  it("moves nothing but the clock in the town", () => {
    const game = fightGame([{ x: 5, y: 4, hp: 40, type: 1, depth: 10 }], {
      rng: always(0),
      pc: { x: 5, y: 5, floor: 0, hp: 200 },
    });
    game.monsterTimers[0] = -100;
    spendTime(game, 12);
    expect(game.movesTaken).toBe(12);
    expect(game.monsterTimers[0]).toBe(-100);
    expect(game.pc.hp).toBe(200);
  });
});

describe('swing', () => {
  it("pays the weapon's time and then a fifth of the agility it is short of 85", () => {
    const game = fightGame([{ x: 5, y: 4, hp: 500, type: 1, depth: 3 }], {
      rng: always(0),
      engaged: 0,
      pc: { x: 5, y: 5, floor: 3, weapon: 7, dex: 60 },
    });
    swing(game);
    // A great sword costs 25, and 85 - 60 is 25, a fifth of which is 5.
    expect(game.movesTaken).toBe(30);
  });

  it("pays only the weapon's time for a character quick enough", () => {
    const game = fightGame([{ x: 5, y: 4, hp: 500, type: 1, depth: 3 }], {
      rng: always(0),
      engaged: 0,
      pc: { x: 5, y: 5, floor: 3, weapon: 0, dex: 84 },
    });
    swing(game);
    expect(game.movesTaken).toBe(6);
  });

  it("does nothing at all with nothing engaged", () => {
    const game = fightGame([], { rng: always(0), engaged: -1, pc: { floor: 3 } });
    swing(game);
    expect(game.movesTaken).toBe(0);
  });
});

describe('startEngagementTimer', () => {
  it("pushes the fought monster's timer back up over agility plus twenty", () => {
    const game = fightGame([{ x: 6, y: 5, hp: 9, type: 1, depth: 3 }], {
      rng: scripted([1, 43]),
      engaged: 0,
      pc: { dex: 30 },
    });
    game.monsterTimers[0] = -20;
    startEngagementTimer(game);
    expect(game.monsterTimers[0]).toBe(43);
  });

  it("leaves the timer where it is one step in three", () => {
    const game = fightGame([{ x: 6, y: 5, hp: 9, type: 1, depth: 3 }], {
      rng: scripted([0]),
      engaged: 0,
      pc: { dex: 30, invisibility: 0 },
    });
    game.monsterTimers[0] = -20;
    startEngagementTimer(game);
    expect(game.monsterTimers[0]).toBe(-20);
  });
});

describe('the occupancy grid', () => {
  it("is indexed as y * 80 + x, which is why (100, 100) lands on (20, 101)", () => {
    const game = newMwGame();
    mwSetOccupant(game, 100, 100, 7);
    expect(game.monsterMap[100 * MW_FLOOR_COLUMNS + 100]).toBe(7);
    expect(mwOccupantAt(game, 20, 101)).toBe(7);
    mwSetOccupant(game, 20, 101, MW_SQUARE_EMPTY);
    expect(mwOccupantAt(game, 100, 100)).toBe(-1);
  });
});

describe('experienceForKill', () => {
  it('is the row\'s multiplier times 5 * 1.23 ^ depth + depth + 1', () => {
    const game = fightGame([{ x: 5, y: 4, hp: 1, type: 1, depth: 20 }]);
    expect(experienceForKill(game, 0)).toBeCloseTo(1 * (5 * 1.23 ** 20 + 21), 6);
  });

  it('pays no more past depth 130', () => {
    const deep = fightGame([{ x: 5, y: 4, hp: 1, type: 1, depth: 200 }]);
    const capped = fightGame([{ x: 5, y: 4, hp: 1, type: 1, depth: 130 }]);
    expect(experienceForKill(deep, 0)).toBe(experienceForKill(capped, 0));
  });

  it('pays a multiple of the row\'s own word', () => {
    const ogre = fightGame([{ x: 5, y: 4, hp: 1, type: 0, depth: 10 }]);
    const werewolf = fightGame([{ x: 5, y: 4, hp: 1, type: 1, depth: 10 }]);
    expect(experienceForKill(ogre, 0)).toBeCloseTo(2 * experienceForKill(werewolf, 0), 6);
  });
});

describe('monsterKilled', () => {
  const nothing: MwKillChoices = {
    takeWeapon: () => false,
    takeArmor: () => false,
    takeStones: () => 'L',
    enhanceWeapon: () => 0,
  };

  /** A kill where every roll comes out big enough that no drop routine fires. */
  function killing(overrides: MwGameOverrides = {}) {
    const monster: MwStockedMonster = { x: 5, y: 4, hp: 0, type: 1, depth: 30 };
    return fightGame([monster], {
      rng: always(9999),
      engaged: 0,
      pc: { lev: 5, floor: 30, x: 5, y: 5, hp: 100, maxHp: 100, ...overrides.pc },
      ...overrides,
    });
  }

  it('pays the experience before it empties the slot', () => {
    const game = killing();
    const worth = experienceForKill(game, 0);
    monsterKilled(game, nothing);
    expect(game.pc.exp).toBeCloseTo(worth, 6);
    expect(worth).toBeGreaterThan(0);
  });

  it('records which quest boss it has killed', () => {
    const game = killing();
    game.monsters[0].type = 0x6a;
    monsterKilled(game, nothing);
    expect(game.events).toContainEqual({ kind: 'bossKilled', boss: 2 });
    expect(game.events).not.toContainEqual({ kind: 'gameWon' });
  });

  it('records the win when the boss was the eighth', () => {
    const game = killing();
    game.monsters[0].type = 0x6f;
    monsterKilled(game, nothing);
    expect(game.events).toContainEqual({ kind: 'bossKilled', boss: 7 });
    expect(game.events).toContainEqual({ kind: 'gameWon' });
  });

  it('records nothing for an ordinary monster', () => {
    const game = killing();
    monsterKilled(game, nothing);
    expect(game.events.map((event) => event.kind)).not.toContain('bossKilled');
  });

  it('rewrites the slot as an ogre at (100, 100) and frees the square', () => {
    const game = killing();
    monsterKilled(game, nothing);
    expect(game.monsters[0]).toEqual({ x: 100, y: 100, hp: 0, type: 0, depth: 0 });
    expect(mwOccupantAt(game, 5, 4)).toBe(-1);
    expect(game.engaged).toBe(-1);
    expect(game.redrawView).toBe(true);
  });

  it('leaves the loot rolls reading a depth of zero', () => {
    const game = killing({ rng: always(0), pc: { cls: 3, floor: 30, lev: 5, hp: 100, maxHp: 100 } });
    monsterKilled(game, { ...nothing, takeWeapon: () => true });
    // The weapon roll needs random(100) to come in under the depth plus ten; the blanked slot
    // makes that ten, and a roll of zero clears it.
    expect(game.messages).toContain('YOU FIND A STICK');
  });

  it('draws "YOU KILLED IT!" above the box for anything but a puffball', () => {
    const game = killing();
    monsterKilled(game, nothing);
    expect(game.messages[0]).toBe('YOU KILLED IT!');
    expect(game.screen).toEqual([{ text: 'YOU KILLED IT!', x: 0, y: 0, font: 0, colour: 8 }]);

    const puff = killing();
    puff.monsters[0].type = 72;
    monsterKilled(puff, nothing);
    expect(puff.messages[0]).not.toBe('YOU KILLED IT!');
    expect(puff.screen).toEqual([]);
  });

  it('draws the find above the box and asks one key when it comes to nothing', () => {
    // Every gate is refused but the find's own two, and the coin toss after them comes down on
    // the half that finds nothing.
    const findsNothing: Rng = { random: (n) => (n === 950 || n === 20 ? 0 : n === 2 ? 1 : 9999) };
    let keysWaitedFor = 0;
    const delays: number[] = [];
    const game = killing({
      rng: findsNothing,
      pc: { cls: 0, lev: 5, floor: 30, x: 5, y: 5, hp: 100, maxHp: 100 },
      pressAnyKey: () => {
        keysWaitedFor += 1;
      },
      delay: (ms) => {
        delays.push(ms);
      },
    });
    monsterKilled(game, nothing);
    expect(game.messages).toContain('YOU FIND...');
    expect(game.messages).toContain('NOTHING! (HIT ANY KEY)');
    // The kill's three messages share the strip above the box, so the last is all that stands,
    // and each of the first two is held on the screen by the delay drawn behind it. The half
    // second at the end is the beat the kill settles for before it says anything else.
    expect(delays).toEqual([1050, 750, 3000, 500]);
    expect(game.screen).toEqual([
      { text: 'NOTHING! (HIT ANY KEY)', x: 0, y: 0, font: 0, colour: 8 },
    ]);
    expect(keysWaitedFor).toBe(1);
  });

  it('hands a level drainer\'s trap door key over once, for the floor\'s own ten', () => {
    const game = killing({ rng: always(0), pc: { lev: 5, floor: 30, hp: 100, maxHp: 100 } });
    game.monsters[0].type = 26;
    monsterKilled(game, nothing);
    expect(game.pc.trapdoorKeys[2]).toBe(1);
    expect(game.messages).toContain('IS LABELED NUMBER 30.');
    expect(game.pc.pills[0]).toBe(1);
  });

  it('never finds the keys for floors 180, 190 and 200', () => {
    for (const floor of [180, 190, 200]) {
      const game = killing({ rng: always(0), pc: { lev: 5, floor, hp: 100, maxHp: 100 } });
      game.monsters[0].type = 26;
      monsterKilled(game, nothing);
      expect(game.pc.trapdoorKeys[floor / 10 - 1]).toBe(0);
    }
  });

  it('sets a quest boss\'s kill flag and gives its one item', () => {
    const game = killing({ pc: { lev: 5, floor: 4, hp: 100, maxHp: 100 } });
    game.monsters[0].type = 0x68;
    monsterKilled(game, nothing);
    expect(game.pc.killedBosses).toBe(1);
    expect(game.pc.bodyArmorLevel).toBe(9);
    expect(game.messages).toContain('MINI-DRAGON ON LEVEL 8.');
  });

  it('lets the orb enhance a weapon the character owns, and nothing else', () => {
    const owned = killing({ pc: { lev: 5, floor: 16, hp: 100, maxHp: 100 } });
    owned.monsters[0].type = 0x6b;
    owned.pc.weaponsOwned[3] = 1;
    monsterKilled(owned, { ...nothing, enhanceWeapon: () => 4 });
    expect(owned.pc.weaponPlus[3]).toBe(25);
    expect(owned.pc.killedBosses).toBe(0b1000);

    const unowned = killing({ pc: { lev: 5, floor: 16, hp: 100, maxHp: 100 } });
    unowned.monsters[0].type = 0x6b;
    monsterKilled(unowned, { ...nothing, enhanceWeapon: () => 4 });
    expect(unowned.pc.weaponPlus[3]).toBe(0);
  });

  it('gives the last boss the plus 100 orb and the closing message', () => {
    const game = killing({ pc: { lev: 5, floor: 200, hp: 100, maxHp: 100 } });
    game.monsters[0].type = 0x6f;
    game.pc.weaponsOwned[7] = 1;
    monsterKilled(game, { ...nothing, enhanceWeapon: () => 8 });
    expect(game.pc.weaponPlus[7]).toBe(100);
    expect(game.pc.killedBosses).toBe(0x80);
    expect(game.messages).toContain('  YOU HAVE BEATEN THE GREAT');
  });

  it('tells a wounded level 0 character where the cure is, by class', () => {
    const fighter = killing({ pc: { cls: 0, lev: 0, floor: 5, hp: 40, maxHp: 100 } });
    monsterKilled(fighter, nothing);
    expect(fighter.messages).toContain('SHOULD GO TO THE TEMPLE IN');

    const priest = killing({ pc: { cls: 4, lev: 0, floor: 5, hp: 40, maxHp: 100 } });
    monsterKilled(priest, nothing);
    expect(priest.messages).toContain('SHOULD CAST A CURE SPELL TO');
  });

  it('points a level 0 character at the inn once they are ready', () => {
    const game = killing({ pc: { lev: 0, floor: 5, hp: 100, maxHp: 100, exp: 1000 } });
    monsterKilled(game, nothing);
    expect(game.messages).toContain('GOOD NEWS!');
  });
});
