import { describe, expect, it } from 'vitest';
import {
  attackSeconds as mechAttackSeconds,
  defend as mechDefend,
  expValue as mechExpValue,
  monsterAttackInterval,
  moveSeconds as mechMoveSeconds,
  strike as mechStrike,
} from '../dotu-mech.js';
import { BorlandRand } from '../unfmap.js';
import {
  attackTiming,
  callCheckEng,
  checkEngagement,
  defend,
  engagementTiming,
  expNeeded,
  expValue,
  gainOrDrain,
  moveSeconds,
  spendAttackTime,
  strike,
} from './combat';
import type { Rng } from './rng';
import { BorlandRng } from './rng';
import {
  BATTLE_BANNER_Y,
  BATTLE_HP_Y,
  BATTLE_TEXT_COLOUR,
  MENU_X,
  MESSAGE_LINE_Y,
} from './screens';
import type { Game, Monster, MonsterKind, PlayerCharacter } from './state';
import { MAP_PLAYER, monsterAt, newGame, setMonsterMap } from './state';

/** Monster kind 23 is Gargalon, one of section 1's ordinary monsters. */
const REGULAR = 23;

/**
 * The same Borland sequence the port's {@link BorlandRng} runs, in the shape `dotu-mech.js`
 * wants: `Math.trunc(rnd() * n)` over it is `Random(n)` to the bit.
 */
function mechRng(seed: number): () => number {
  const borland = new BorlandRand(seed);
  return () => borland.rand() / 0x8000;
}

/** Puts a monster on the floor, marks the square it stands on, and engages it. */
function engage(game: Game, monster: Partial<Monster> = {}): Monster {
  const placed = Object.assign(game.monsters[0], {
    x: 10,
    y: 10,
    hp: 50000,
    type: REGULAR,
    level: 40,
    ...monster,
  });
  setMonsterMap(game, placed.x, placed.y, 0);
  game.engaged = 0;
  return placed;
}

/** A game with the player at (40, 50) on an open floor and one monster engaged. */
function fighting(
  seed: number,
  pc: Partial<PlayerCharacter> = {},
  monster: Partial<Monster> = {},
): { game: Game; monster: Monster } {
  const game = newGame({ rng: new BorlandRng(seed), pc });
  setMonsterMap(game, game.pc.x, game.pc.y, MAP_PLAYER);
  return { game, monster: engage(game, monster) };
}

/** Four characters that exercise the branches of the two rolls, each with a monster to match. */
const FIGHTERS: [string, Partial<PlayerCharacter>, number][] = [
  [
    'a new fighter',
    { cls: 0, lev: 1, level: 3, str: 14, dex: 11, con: 12, luck: 9, weapon: 1 },
    3,
  ],
  [
    'a mid fighter',
    {
      cls: 0,
      lev: 22,
      level: 40,
      str: 60,
      dex: 45,
      con: 40,
      luck: 30,
      luckyCharms: 3,
      weapon: 7,
      weaponPlus: [0, 0, 0, 0, 0, 0, 0, 3],
      tempWeaponPlus: 2,
      gauntlet: 2,
      armor: 5,
      tempArmorPlus: 2,
      bodyArmor: 2,
      protRing: 2,
      protection: 3,
    },
    40,
  ],
  [
    'a monk deep down',
    { cls: 2, lev: 40, level: 90, str: 80, iq: 70, dex: 90, con: 70, luck: 50, weapon: 0 },
    90,
  ],
  [
    'a hard-mode sage',
    { cls: 5, hard: 1, lev: 30, level: 60, str: 95, dex: 60, con: 55, luck: 40, weapon: 4 },
    60,
  ],
];

/** What `dotu-mech.js`'s `strike` wants, read off the same game the port's `strike` reads. */
function striker(game: Game, monster: Monster) {
  const pc = game.pc;
  const stats = game.monsterStats[game.monsterKinds[monster.type].type];
  return {
    p: {
      lev: pc.lev,
      str: pc.str,
      luck: pc.luck,
      luckyCharms: pc.luckyCharms,
      weaponHit: game.weaponHit[pc.weapon],
      gauntlet: pc.gauntlet,
      weaponPlus: pc.weaponPlus[pc.weapon],
      tempWeaponPlus: pc.tempWeaponPlus,
      hard: pc.hard === 1,
      depth: pc.level,
      damageDie: game.weaponDamage[pc.weapon],
    },
    m: { level: monster.level, defense: stats.defense, speed: stats.speed },
  };
}

describe('gainOrDrain', () => {
  it.each([
    [1, 'STRENGTH', 'str'],
    [2, 'INTELLIGENCE', 'iq'],
    [3, 'WISDOM', 'wis'],
    [4, 'CONSTITUTION', 'con'],
    [5, 'DEXTERITY', 'dex'],
    [6, 'LUCK', 'luck'],
  ] as [number, string, keyof PlayerCharacter][])(
    '%i raises %s by one and -%i drains it by one',
    (amount, name, field) => {
      const raised = newGame();
      expect(gainOrDrain(raised, amount)).toBe(name);
      expect(raised.pc[field]).toBe(21);
      const drained = newGame();
      expect(gainOrDrain(drained, -amount)).toBe(name);
      expect(drained.pc[field]).toBe(19);
    },
  );

  it('changes nothing outside -6..-1 and 1..6', () => {
    const game = newGame();
    expect(gainOrDrain(game, 0)).toBe('');
    expect(gainOrDrain(game, 7)).toBe('');
    expect(game.pc).toEqual(newGame().pc);
  });
});

describe('strike', () => {
  it.each(FIGHTERS)('agrees with dotu-mech for %s', (_name, pc, level) => {
    let hits = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { game, monster } = fighting(seed, pc, { level });
      const { p, m } = striker(game, monster);
      const mech = mechRng(seed);
      for (let swing = 0; swing < 25; swing++) {
        const damage = strike(game);
        expect(damage).toBe(mechStrike(p, m, mech));
        if (damage > 0) hits++;
      }
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('takes the damage off the engaged monster', () => {
    const { game, monster } = fighting(3, FIGHTERS[1][1]);
    const before = monster.hp;
    const damage = strike(game);
    expect(damage).toBeGreaterThan(0);
    expect(monster.hp).toBe(before - damage);
  });

  it('prints the hit over two lines and the miss over one', () => {
    const { game } = fighting(3, FIGHTERS[1][1]);
    const damage = strike(game);
    expect(game.messages).toEqual([
      'YOU HIT THE MONSTER!!!',
      `IT TAKES ${damage} POINTS OF DAMAGE!`,
    ]);

    const missing = fighting(1, { lev: 1, str: 1, luck: 0, weapon: 0 }, { level: 200 });
    expect(strike(missing.game)).toBe(0);
    expect(missing.game.messages).toEqual(['YOU MISSED THE MONSTER']);
  });

  // The exe indexes the weapon table with the power weapon level plus eight, and row 8 is the
  // one labelled POWER WEAPON 1, so every level swings the row after the one it is named for.
  it.each([1, 2, 3])('rolls weapon table row %i + 8 for that power weapon level', (level) => {
    // Only one row of the table carries a die; every other row rolls Random(0), which is 0.
    // With a level 1 character whose strength is 3, nothing but that die can do any damage.
    const onlyRow = (row: number) => {
      const dice = new Array(12).fill(0);
      dice[row] = 100;
      const { game } = fighting(
        9,
        { lev: 1, str: 3, luck: 60, level: 5, weapon: 0, powerWeapon: level },
        { level: 1 },
      );
      game.weaponDamage = dice;
      let hits = 0;
      for (let swing = 0; swing < 500; swing++) if (strike(game) > 0) hits++;
      return hits;
    };
    expect(onlyRow(level + 8)).toBeGreaterThan(0);
    expect(onlyRow(level + 7)).toBe(0);
  });
});

describe('strike on the clock', () => {
  /**
   * Borland's generator worked out by hand: srand (exe 1000:18a5) puts the low sixteen bits of
   * the seed in the state, rand (exe 1000:18b6) advances it by `state * 0x015A4E35 + 1` and
   * hands back `(state >> 16) & 0x7fff`, and a roll is that scaled by `n / 0x8000`.
   */
  function byHand(tick: number, n: number): number {
    const state = (Math.imul(tick & 0xffff, 0x015a4e35) + 1) >>> 0;
    return Math.trunc((((state >>> 16) & 0x7fff) * n) / 0x8000);
  }

  /** The to-hit roll of one swing, which is the first roll strike asks its generator for. */
  function toHitRoll(clock: (() => number) | null): number {
    const borland = new BorlandRng(12345);
    const asked: number[] = [];
    const rng: Rng = {
      random: (n) => {
        const roll = borland.random(n);
        asked.push(roll);
        return roll;
      },
      reseed: (seed) => borland.reseed(seed),
    };
    const game = newGame({ rng, clock, pc: { lev: 1, str: 1, luck: 0, weapon: 0 } });
    setMonsterMap(game, game.pc.x, game.pc.y, MAP_PLAYER);
    engage(game, { level: 200 });
    // A game given a clock draws one roll as it is built, to start the running total Random
    // calls carry (`Game.randomTotal`). What this is after is the first roll of the swing.
    asked.length = 0;
    strike(game);
    return asked[0];
  }

  it('takes its to-hit roll from the tick the clock reads', () => {
    expect(toHitRoll(() => 1234)).toBe(byHand(1234, 80));
    expect(toHitRoll(() => 40000)).toBe(byHand(40000, 80));
  });

  it('walks the roll up from 0 to 79 and starts again every 95 ticks', () => {
    const rolls = Array.from({ length: 200 }, (_, tick) => toHitRoll(() => tick));
    expect(rolls.slice(0, 10)).toEqual([0, 0, 1, 2, 3, 4, 5, 5, 6, 7]);
    expect((rolls[94] - rolls[0]) / 94).toBeCloseTo(0.84, 2);
    expect(rolls[94]).toBe(79);
    expect(rolls[95]).toBe(0);
    expect(rolls.filter((roll, at) => at > 0 && roll < rolls[at - 1])).toHaveLength(2);
  });

  it('reseeds nothing without a clock, so the roll is the next number the generator had', () => {
    expect(toHitRoll(null)).toBe(new BorlandRng(12345).random(80));
  });
});

/** What `dotu-mech.js`'s `defend` wants, read off the same game the port's `defend` reads. */
function defender(game: Game, monster: Monster) {
  const pc = game.pc;
  const stats = game.monsterStats[game.monsterKinds[monster.type].type];
  return {
    p: {
      lev: pc.lev,
      cls: pc.cls,
      iq: pc.iq,
      dex: pc.dex,
      luck: pc.luck,
      luckyCharms: pc.luckyCharms,
      armor: game.armorHitChance[pc.armor],
      tempArmorPlus: pc.tempArmorPlus,
      bodyArmor: pc.bodyArmor,
      protRing: pc.protRing,
      protection: pc.protection,
      con: pc.con,
      depth: pc.level,
    },
    m: { level: monster.level, damageDie: stats.damageDie },
  };
}

/** Rewrites the description of the monster kind the fixtures fight, in place. */
function describeMonster(game: Game, overrides: Partial<MonsterKind>): void {
  game.monsterKinds[REGULAR] = { ...game.monsterKinds[REGULAR], ...overrides };
}

/** Attacks until one lands, clearing the messages and events before each attempt. */
function attackUntilItLands(game: Game, limit = 500): number {
  for (let attempt = 0; attempt < limit; attempt++) {
    game.messages.length = 0;
    game.events.length = 0;
    const damage = defend(game, 0);
    if (damage > 0) return damage;
  }
  throw new Error('the monster never landed a hit');
}

/** Attacks until one of the messages starts with `start`, clearing between attempts. */
function attackUntilItSays(game: Game, start: string, limit = 500): string[] {
  for (let attempt = 0; attempt < limit; attempt++) {
    game.messages.length = 0;
    game.events.length = 0;
    defend(game, 0);
    if (game.messages.some((line) => line.startsWith(start))) return [...game.messages];
  }
  throw new Error(`the monster never said ${start}`);
}

describe('defend', () => {
  it.each(FIGHTERS)('agrees with dotu-mech for %s', (_name, pc, level) => {
    // Monster kind 23 has no breath, no drains and no poison, so nothing beyond the roll
    // dotu-mech models takes a turn of the sequence.
    let hits = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { game, monster } = fighting(seed, pc, { level });
      const { p, m } = defender(game, monster);
      const mech = mechRng(seed);
      for (let attack = 0; attack < 25; attack++) {
        game.pc.hp = 100000;
        const damage = defend(game, 0);
        expect(damage).toBe(mechDefend(p, m, mech));
        if (damage > 0) hits++;
      }
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('takes the damage off the player and says how much', () => {
    const { game } = fighting(2, FIGHTERS[1][1]);
    game.pc.hp = 5000;
    const damage = attackUntilItLands(game);
    expect(game.pc.hp).toBe(5000 - damage);
    const points = damage === 1 ? 'POINT' : 'POINTS';
    expect(game.messages).toEqual([`THE GARGALON DOES ${damage} ${points}`]);
  });

  it("draws its line on the strip above the message box, where defend's pfont puts it", () => {
    const { game } = fighting(2, FIGHTERS[1][1]);
    game.pc.hp = 5000;
    attackUntilItLands(game);
    expect(game.screen).toEqual([
      { text: game.messages[0], x: MENU_X, y: MESSAGE_LINE_Y, font: 0, colour: 15 },
    ]);
  });

  it('spreads a line of 28 characters or more out to the right edge, as psfont does', () => {
    const { game } = fighting(2, FIGHTERS[1][1]);
    describeMonster(game, { name: 'MONSTER WITH A VERY LONG NAME' });
    game.pc.hp = 5000;
    attackUntilItLands(game);
    expect(game.screen[0].spreadTo).toBe(0x638);
    const short = fighting(2, FIGHTERS[1][1]);
    short.game.pc.hp = 5000;
    attackUntilItLands(short.game);
    expect(short.game.screen[0].text.length).toBeLessThan(0x1c);
    expect(short.game.screen[0].spreadTo).toBeUndefined();
  });

  it('says the monster missed and leaves the player alone', () => {
    const { game } = fighting(1, { lev: 60, dex: 90, luck: 90, con: 60, level: 4, armor: 6 });
    game.pc.hp = 500;
    for (let attempt = 0; attempt < 40; attempt++) {
      game.messages.length = 0;
      if (defend(game, 0) === 0) {
        expect(game.messages).toEqual(['THE GARGALON MISSES!']);
        expect(game.pc.hp).toBe(500);
        return;
      }
    }
    throw new Error('the monster never missed');
  });

  it('ignores the permanent plus on the armor being worn', () => {
    const bare = fighting(11, { ...FIGHTERS[1][1], armorPlus: [0, 0, 0, 0, 0, 0, 0, 0] });
    const enchanted = fighting(11, { ...FIGHTERS[1][1], armorPlus: [0, 0, 0, 0, 0, 9, 0, 0] });
    for (let attack = 0; attack < 200; attack++) {
      expect(defend(enchanted.game, 0)).toBe(defend(bare.game, 0));
    }
  });

  it('takes the shield byte off the roll the same way the temporary plus comes off', () => {
    const shielded = fighting(12, { ...FIGHTERS[1][1], shield: 7, tempArmorPlus: 2 });
    const enchanted = fighting(12, { ...FIGHTERS[1][1], shield: 0, tempArmorPlus: 9 });
    for (let attack = 0; attack < 400; attack++) {
      expect(defend(shielded.game, 0)).toBe(defend(enchanted.game, 0));
    }
  });
});

describe('defend, the puffball', () => {
  it('moves the stat, empties the slot and leaves the record on the floor', () => {
    const { game, monster } = fighting(4, {});
    describeMonster(game, { special: 6, statDrain: -4 });
    expect(defend(game, 0)).toBe(0);
    expect(game.pc.con).toBe(19);
    expect(game.messages).toEqual(['CONSTITUTION DRAINED BY PUFFBALL!']);
    // The strip above the message box, in the menu column's own colour rather than the fight's.
    expect(game.screen).toEqual([
      { text: 'CONSTITUTION DRAINED BY PUFFBALL!', x: MENU_X, y: MESSAGE_LINE_Y, font: 0, colour: 6 },
    ]);
    expect(monsterAt(game, 10, 10)).toBe(-1);
    expect(monster).toEqual({ x: 100, y: 100, hp: 0, type: 0, level: 0 });
    expect(game.redrawView).toBe(true);
    expect(game.events).toContainEqual({
      kind: 'statChanged',
      stat: 'CONSTITUTION',
      by: -1,
      monster: { type: 23, level: 40, name: 'GARGALON' },
    });
  });

  it('holds its line the way the game holds it, however fast the game is set to run', () => {
    const { game } = fighting(4, { });
    const delays: number[] = [];
    game.delay = (ms) => void delays.push(ms);
    game.highSpeed = true;
    describeMonster(game, { special: 6, statDrain: -4 });
    defend(game, 0);
    expect(delays).toEqual([1260]);
  });

  it('raises the stat when the description says to', () => {
    const { game } = fighting(4, {});
    describeMonster(game, { special: 6, statDrain: 5 });
    defend(game, 0);
    expect(game.pc.dex).toBe(21);
    expect(game.messages).toEqual(['DEXTERITY RAISED BY PUFFBALL!']);
  });
});

describe('defend, the beats a swing is read out over', () => {
  /**
   * A mid fighter deep enough to be hit hard, with a monster whose description says nothing
   * beyond the blow, and the delays whatever that monster does next asks for.
   */
  function swinging(overrides: Partial<MonsterKind> = {}): {
    game: Game;
    delays: number[];
    swing: (until: 'a hit' | 'a miss') => number[];
  } {
    const { game } = fighting(2, FIGHTERS[1][1]);
    game.pc.hp = 500000;
    describeMonster(game, { breath: 0, levelDrain: 0, statDrain: 0, special: 0, ...overrides });
    const delays: number[] = [];
    game.delay = (ms) => void delays.push(ms);
    return {
      game,
      delays,
      swing: (until) => {
        for (let attempt = 0; attempt < 500; attempt++) {
          delays.length = 0;
          const damage = defend(game, 0);
          if (until === 'a hit' ? damage > 0 : damage === 0) return delays;
        }
        throw new Error(`the monster never landed ${until}`);
      },
    };
  }

  it('blanks the strip before a blow and settles once the blow is up', () => {
    expect(swinging().swing('a hit')).toEqual([110, 150]);
  });

  it('settles a little longer on a miss, which it prints with no blank first', () => {
    expect(swinging().swing('a miss')).toEqual([100]);
  });

  it('reads a drainer out one thing at a time', () => {
    const { swing } = swinging({ levelDrain: -30, statDrain: -4, special: 1 });
    expect(swing('a hit')).toEqual([110, 500, 500, 250, 150]);
  });

  it('stops for a key at each thing the drains put on the screen', () => {
    const { game, swing } = swinging({ levelDrain: -30, statDrain: -4, special: 1 });
    let asked = 0;
    game.pressAnyKey = () => void (asked += 1);

    swing('a hit');

    expect(asked).toBe(3);
  });

  it('stops for a key behind the disease box', () => {
    const { game, swing } = swinging({ special: 2 });
    let asked = 0;
    game.pressAnyKey = () => void (asked += 1);

    swing('a hit');

    expect(asked).toBe(1);
  });

  it('keeps the drains apart even for a special with no box behind it', () => {
    const { swing } = swinging({ special: 3 });
    expect(swing('a hit')).toEqual([110, 250, 150]);
  });

  it.each([
    ['the high speed option', 'highSpeed' as const],
    ['the repeat-fight flag', 'repeatFight' as const],
  ])('drops the blank and the settle under %s', (_name, flag) => {
    const { game, swing } = swinging({ statDrain: -4 });
    game[flag] = true;
    // The 500 the stat drain takes is not gated on either: the game holds that one whatever the
    // player has set.
    expect(swing('a hit')).toEqual([500]);
  });

  it('takes no beat in the town, where nothing can attack anyway', () => {
    const { game, swing } = swinging();
    game.pc.level = 0;
    expect(swing('a hit')).toEqual([110]);
  });
});

describe('defend, asleep and held', () => {
  it.each([
    ['sleepTimer' as const],
    ['holdMonsterTimer' as const],
  ])('runs %s down a move at a time and does nothing else', (field) => {
    const { game } = fighting(5, { [field]: 25, level: 1 });
    expect(defend(game, 0)).toBe(0);
    expect(game.pc[field]).toBe(24);
    expect(game.messages).toEqual([]);
    expect(game.pc.hp).toBe(100);
  });

  it('wakes the monster early on a deep floor', () => {
    // The wake-up roll is random(500) < the floor number, so floor 499 all but always wakes it.
    const { game } = fighting(5, { sleepTimer: 25, level: 499 });
    defend(game, 0);
    expect(game.pc.sleepTimer).toBe(0);
  });
});

describe('defend, the drains', () => {
  it('takes levels, rewrites the experience and takes the hit points back', () => {
    const { game } = fighting(6, { ...FIGHTERS[1][1], cls: 0, lev: 22, hp: 100000, maxHp: 100000 });
    describeMonster(game, { levelDrain: 2 });
    attackUntilItLands(game);
    expect(game.pc.lev).toBe(20);
    expect(game.pc.exp).toBe(expNeeded(game, 19));
    expect(game.pc.maxHp).toBeLessThan(100000);
    expect(game.messages).toContain('OH NO! HIT BY LIFE DRAINER!');
    expect(game.messages).toContain('  YOU LOSE 2 LEVELS!');
    expect(game.events).toContainEqual({ kind: 'playerSaved' });
  });

  it('says LEVEL rather than LEVELS for one', () => {
    const { game } = fighting(6, { ...FIGHTERS[1][1], hp: 100000, maxHp: 100000 });
    describeMonster(game, { levelDrain: 1 });
    attackUntilItLands(game);
    expect(game.messages).toContain('  YOU LOSE 1 LEVEL!');
  });

  it('always takes 30 experience however much the message says', () => {
    // The subtraction is the constant 30.0 at DS:14df; only the message reads the monster's
    // own number, and every experience drainer in the game happens to hold -30.
    const { game } = fighting(6, { ...FIGHTERS[1][1], exp: 100000, hp: 100000 });
    describeMonster(game, { levelDrain: -5 });
    attackUntilItLands(game);
    expect(game.pc.exp).toBe(99970);
    expect(game.messages).toContain('  YOU LOSE 5 EXP. POINTS!');
  });

  it('leaves the experience at zero rather than below it', () => {
    const { game } = fighting(6, { ...FIGHTERS[1][1], exp: 30, hp: 100000 });
    describeMonster(game, { levelDrain: -30 });
    attackUntilItLands(game);
    expect(game.pc.exp).toBe(0);
  });

  it('does nothing while Resist Level Drain is up', () => {
    const { game } = fighting(6, { ...FIGHTERS[1][1], exp: 100000, hp: 100000, resistDrainTimer: 5 });
    describeMonster(game, { levelDrain: -30 });
    attackUntilItLands(game);
    expect(game.pc.exp).toBe(100000);
    expect(game.messages).not.toContain('OH NO! HIT BY LIFE DRAINER!');
  });

  it('moves a stat and says so', () => {
    const { game } = fighting(7, { ...FIGHTERS[1][1], hp: 100000 });
    describeMonster(game, { statDrain: -1 });
    const before = game.pc.str;
    attackUntilItLands(game);
    expect(game.pc.str).toBe(before - 1);
    expect(game.messages).toContain('STRENGTH HAS BEEN DRAINED!');
    expect(game.events).toContainEqual({
      kind: 'statChanged',
      stat: 'STRENGTH',
      by: -1,
      monster: { type: 23, level: 40, name: 'GARGALON' },
    });
  });
});

describe('defend, poison and disease', () => {
  it('poisons the player for 450 moves', () => {
    const { game } = fighting(8, { ...FIGHTERS[1][1], hp: 100000 });
    describeMonster(game, { special: 1 });
    attackUntilItLands(game);
    expect(game.pc.poison).toBe(450);
    expect(game.messages).toContain('OH NO! YOU HAVE BEEN');
    expect(game.messages).toContain('  POISONED!');
    expect(game.messages).toContain('HIT ANY KEY');
    expect(game.reprintBattleInfo).toBe(true);
    expect(game.events).toContainEqual({ kind: 'afflicted', what: 'poison', monster: { type: 23, level: 40, name: 'GARGALON' } });
  });

  it('diseases the player for 450 moves', () => {
    const { game } = fighting(8, { ...FIGHTERS[1][1], hp: 100000 });
    describeMonster(game, { special: 2 });
    attackUntilItLands(game);
    expect(game.pc.disease).toBe(450);
    expect(game.messages).toContain('OH NO! YOU HAVE CAUGHT A');
    expect(game.messages).toContain('  DISEASE!');
    expect(game.events).toContainEqual({ kind: 'afflicted', what: 'disease', monster: { type: 23, level: 40, name: 'GARGALON' } });
  });

  it('leaves a poison already running alone', () => {
    const { game } = fighting(8, { ...FIGHTERS[1][1], hp: 100000, poison: 12 });
    describeMonster(game, { special: 1 });
    attackUntilItLands(game);
    expect(game.pc.poison).toBe(12);
  });

  it('says nothing while Resist Poison is up', () => {
    const { game } = fighting(8, { ...FIGHTERS[1][1], hp: 100000, resistPoisonTimer: 9 });
    describeMonster(game, { special: 1 });
    attackUntilItLands(game);
    expect(game.pc.poison).toBe(0);
    expect(game.messages).not.toContain('OH NO! YOU HAVE BEEN');
  });
});

describe('defend, the breath weapons', () => {
  it.each([
    [1, 'FIRE', 'YOU FEEL TOASTED.'],
    [2, 'ICE', 'YOU FEEL CHILLED.'],
  ] as [number, string, string][])('breathes %s and does level + Random(level)', (
    breath,
    name,
    feeling,
  ) => {
    const { game } = fighting(13, { ...FIGHTERS[1][1], hp: 100000 }, { level: 40 });
    describeMonster(game, { breath });
    const messages = attackUntilItSays(game, 'THE MONSTER BREATHES');
    expect(messages[0]).toBe(`THE MONSTER BREATHES ${name}`);
    expect(messages[2]).toBe('  OF DAMAGE TO YOU.');
    expect(messages[3]).toBe(feeling);
    const damage = Number(messages[1].replace('  ON YOU. IT DOES ', '').replace(' POINTS', ''));
    expect(damage).toBeGreaterThanOrEqual(40);
    expect(damage).toBeLessThan(80);
  });

  it('halves the damage when the matching resistance is up', () => {
    const { game } = fighting(13, { ...FIGHTERS[1][1], hp: 100000, antiFireTimer: 20 }, { level: 40 });
    describeMonster(game, { breath: 1 });
    const messages = attackUntilItSays(game, 'THE MONSTER BREATHES');
    const damage = Number(messages[1].replace('  ON YOU. IT DOES ', '').replace(' POINTS', ''));
    expect(damage).toBeGreaterThanOrEqual(20);
    expect(damage).toBeLessThan(40);
    expect(messages).not.toContain('YOU FEEL TOASTED.');
  });

  it('has acid destroy the armor being worn, plus and all', () => {
    const pc = { ...FIGHTERS[1][1], hp: 100000, armor: 5, armorPlus: [0, 0, 0, 0, 0, 4, 0, 0] };
    const { game } = fighting(13, pc, { level: 40 });
    describeMonster(game, { breath: 3 });
    const messages = attackUntilItSays(game, 'THE MONSTER BREATHES');
    expect(messages[3]).toBe('THE ACID DISOLVES YOUR ARMOR');
    expect(game.pc.armor).toBe(0);
    expect(game.pc.armorPlus[5]).toBe(0);
    expect(game.pc.armorOwned[5]).toBe(-1);
  });

  it('has green phlegm bring the disease with two lines of its own', () => {
    const { game } = fighting(13, { ...FIGHTERS[1][1], hp: 100000 }, { level: 40 });
    describeMonster(game, { breath: 4 });
    const messages = attackUntilItSays(game, 'THE MONSTER BREATHES');
    expect(messages[3]).toBe('YOU FEEL VERY SICK. YOU NEED');
    expect(messages[4]).toBe('  A CURE DISEASE SPELL.');
    expect(game.pc.disease).toBe(450);
    expect(game.events).toContainEqual({ kind: 'afflicted', what: 'disease', monster: { type: 23, level: 40, name: 'GARGALON' } });
  });

  it('has black slime bring the poison', () => {
    const { game } = fighting(13, { ...FIGHTERS[1][1], hp: 100000 }, { level: 40 });
    describeMonster(game, { breath: 5 });
    const messages = attackUntilItSays(game, 'THE MONSTER BREATHES');
    expect(messages[3]).toBe('YOU FEEL KIND OF WEAK. YOU');
    expect(messages[4]).toBe('  MIGHT GET A CURE POISON.');
    expect(game.pc.poison).toBe(450);
    expect(game.events).toContainEqual({ kind: 'afflicted', what: 'poison', monster: { type: 23, level: 40, name: 'GARGALON' } });
  });

  it('swings normally about half the time', () => {
    const { game } = fighting(14, { ...FIGHTERS[1][1], hp: 1000000 }, { level: 40 });
    describeMonster(game, { breath: 1 });
    let breaths = 0;
    for (let attack = 0; attack < 400; attack++) {
      game.messages.length = 0;
      defend(game, 0);
      if (game.messages[0].startsWith('THE MONSTER BREATHES')) breaths++;
    }
    expect(breaths).toBeGreaterThan(150);
    expect(breaths).toBeLessThan(250);
  });
});

/** A game with one monster standing on the square east of the player and its timer at zero. */
function standingBeside(
  seed: number,
  pc: Partial<PlayerCharacter> = {},
  kind: Partial<MonsterKind> = {},
): { game: Game; monster: Monster } {
  const fight = fighting(seed, { hp: 1000000, dex: 20, ...pc }, { x: 41, y: 50 });
  // Monster type 5 is the one the Shadow bosses fight with: speed 55, so 20 seconds a strike.
  describeMonster(fight.game, { type: 5, ...kind });
  fight.game.monsterTimers[0] = 0;
  fight.game.messages.length = 0;
  return fight;
}

describe('checkEngagement', () => {
  it.each([
    [0, 40, 49],
    [1, 40, 51],
    [2, 39, 50],
    [3, 41, 50],
  ])('finds the monster on the square facing %i', (dir, x, y) => {
    const { game } = fighting(1, { dir }, { x, y });
    expect(checkEngagement(game)).toBe(0);
  });

  it('finds nothing through a wall', () => {
    const { game } = fighting(1, { dir: 3 }, { x: 41, y: 50 });
    game.retdwall = () => 0;
    expect(checkEngagement(game)).toBe(-1);
  });

  it('finds nothing on an empty square', () => {
    const { game } = fighting(1, { dir: 0 }, { x: 41, y: 50 });
    expect(checkEngagement(game)).toBe(-1);
  });
});

describe('callCheckEng', () => {
  it('gives a speed 55 monster one strike every 20 seconds', () => {
    const { game } = standingBeside(21);
    callCheckEng(game, 1);
    expect(game.messages).toHaveLength(1);
    expect(game.monsterTimers[0] + 1).toBe(monsterAttackInterval(55));
  });

  it('gives a ten second action one strike', () => {
    const { game } = standingBeside(22);
    callCheckEng(game, 10);
    expect(game.messages).toHaveLength(1);
    expect(game.monsterTimers[0]).toBe(10);
  });

  it.each([60, 100, 600])('never gives more than three strikes, here for %i seconds', (seconds) => {
    const { game } = standingBeside(23);
    callCheckEng(game, seconds);
    expect(game.messages).toHaveLength(3);
    // The third strike throws the timer up to the whole of the character's agility first.
    expect(game.monsterTimers[0]).toBe(game.pc.dex + 20);
  });

  it('leaves a monster that is not next to the player alone', () => {
    const { game, monster } = standingBeside(24);
    monster.x = 43;
    callCheckEng(game, 600);
    expect(game.messages).toEqual([]);
    expect(game.monsterTimers[0]).toBe(-600);
  });

  it('leaves a monster with a wall between alone', () => {
    const { game } = standingBeside(25);
    game.retdwall = () => 0;
    callCheckEng(game, 600);
    expect(game.messages).toEqual([]);
  });

  it('does nothing but move the clock in the town', () => {
    const { game } = standingBeside(26, { level: 0 });
    callCheckEng(game, 600);
    expect(game.messages).toEqual([]);
    expect(game.monsterTimers[0]).toBe(0);
    expect(game.secondsElapsed).toBe(600);
  });

  it('gives Slow Enemies a quarter of its checks back to the timer', () => {
    const { game } = standingBeside(27, { slowEnemiesTimer: 40, dex: 60 });
    game.monsterTimers[0] = 400;
    for (let check = 0; check < 400; check++) callCheckEng(game, 1);
    // Without the spell the timer would be 0; a third of 60 back one check in four is +5 a check.
    expect(game.monsterTimers[0]).toBeGreaterThan(400);
  });
});

describe('attackTiming', () => {
  it('engages the monster the player faces and leaves them facing that way', () => {
    const { game } = fighting(31, { dir: 0 }, { x: 40, y: 49 });
    expect(attackTiming(game)).toBe(0);
    expect(game.engaged).toBe(0);
    expect(game.enemyDir).toBe(0);
    expect(game.pc.dir).toBe(0);
    expect(game.engagedAhead).toBe(0);
  });

  it('turns right round to find a monster beside the player and turns back', () => {
    const { game } = fighting(31, { dir: 1 }, { x: 40, y: 49 });
    expect(attackTiming(game)).toBe(0);
    expect(game.enemyDir).toBe(0);
    expect(game.pc.dir).toBe(1);
    expect(game.engagedAhead).toBe(-1);
  });

  it('turns one more time when there is nothing on any side', () => {
    const { game } = fighting(31, { dir: 2 }, { x: 10, y: 10 });
    expect(attackTiming(game)).toBe(-1);
    expect(game.enemyDir).toBe(2);
    expect(game.pc.dir).toBe(2);
  });

  it('starts a new engagement at a roll on the agility about two times in three', () => {
    const { game } = fighting(31, { dir: 0, dex: 40, invisible: 0 }, { x: 40, y: 49 });
    let started = 0;
    for (let meeting = 0; meeting < 600; meeting++) {
      game.engaged = -1;
      game.monsterTimers[0] = 9999;
      attackTiming(game);
      if (game.monsterTimers[0] === 9999) continue;
      started++;
      expect(game.monsterTimers[0]).toBeGreaterThanOrEqual(0);
      expect(game.monsterTimers[0]).toBeLessThan(40);
    }
    expect(started).toBeGreaterThan(350);
    expect(started).toBeLessThan(450);
  });

  it('leaves the timers alone when the player walks away from the last monster', () => {
    const { game } = fighting(31, { dir: 0 }, { x: 10, y: 10 });
    game.engaged = 0;
    game.monsterTimers[0] = 7;
    expect(attackTiming(game)).toBe(-1);
    expect(game.engaged).toBe(-1);
    expect(game.monsterTimers[0]).toBe(7);
  });
});

describe('the battle banner', () => {
  it('draws the level, the name, the experience and the hit points', () => {
    const { game } = fighting(41, { dir: 3, level: 5 }, { x: 41, y: 50, level: 40, hp: 1234 });
    engagementTiming(game);
    expect(game.battleInfoOn).toBe(true);
    // pfont is given the string, its place and a colour and nothing else: none of the five is
    // spread out to the right edge the way a long menu line is.
    expect(game.screen).toEqual(
      [
        ['YOU ARE FIGHTING A LEVEL 40', BATTLE_BANNER_Y[0]],
        ['GARGALON', BATTLE_BANNER_Y[1]],
        ['EXP. VALUE: ' + expValue(game, 0).toFixed(0).padEnd(20), BATTLE_BANNER_Y[2]],
        ['THIS IS AN AVERAGE JOE (JILL)', BATTLE_BANNER_Y[3]],
        ['IT HAS 1234 HEALTH POINTS LEFT', BATTLE_HP_Y],
      ].map(([text, y]) => ({ text, x: MENU_X, y, font: 0, colour: BATTLE_TEXT_COLOUR })),
    );
  });

  it('wipes the eight lines a box left on the block before it draws', () => {
    const { game } = fighting(41, { dir: 3, level: 5 }, { x: 41, y: 50, level: 40 });
    game.say('SOMETHING SAID EARLIER');
    engagementTiming(game);
    expect(game.menuBox).toEqual([]);
  });

  it.each([
    [5, 'EXP. VALUE: '],
    [20, 'EXP: '],
    [60, 'EX:'],
    [90, ''],
  ])('shortens the label to %s on floor %i', (floor, label) => {
    const { game } = fighting(41, { dir: 3, level: floor }, { x: 41, y: 50, level: 40 });
    engagementTiming(game);
    expect(game.screen[2].text).toBe(label + expValue(game, 0).toFixed(0).padEnd(20));
  });

  it('agrees with dotu-mech on what a kill is worth', () => {
    const { game } = fighting(41, { dir: 3 }, { x: 41, y: 50, level: 61 });
    expect(expValue(game, 0)).toBeCloseTo(mechExpValue(61, 1), 6);
  });

  it('is worth nothing at all when the description says so', () => {
    const { game } = fighting(41, { dir: 3 }, { x: 41, y: 50, level: 40 });
    describeMonster(game, { expMult: 0 });
    expect(expValue(game, 0)).toBe(0);
  });
});

describe('the seconds an action costs', () => {
  it('agrees with dotu-mech on a step', () => {
    for (const [weight, agility] of [
      [400, 0],
      [150, 20],
      [0, 90],
      [900, 5],
    ]) {
      const game = newGame({ pc: { loadedWeight: weight, dex: agility } });
      expect(moveSeconds(game)).toBe(mechMoveSeconds(weight, agility));
    }
  });

  it('spends a swing as the weapon time and then a fifth of the missing agility', () => {
    const { game } = standingBeside(51, { dex: 20, weapon: 7 });
    spendAttackTime(game);
    expect(game.secondsElapsed).toBe(mechAttackSeconds(game.weaponTime[7], 20));
    expect(game.secondsElapsed).toBe(25 + 13);
  });

  it('skips the second check for a character quick enough', () => {
    const { game } = standingBeside(52, { dex: 84, weapon: 1 });
    spendAttackTime(game);
    expect(game.secondsElapsed).toBe(game.weaponTime[1]);
  });
});
