import { describe, expect, it } from 'vitest';
import { autokillChance, damageSpells, sleepChance } from '../dotu-mech.js';
import {
  antiCold,
  antiFire,
  autokill,
  drainMonster,
  explosion,
  fastBigCure,
  fastCure,
  fastHeal,
  goAway,
  holdMonster,
  lightningBolt,
  magicBolt,
  magicMissile,
  magicZap,
  magicZot,
  majorShock,
  minorShock,
  msgNoMonster,
  passWall,
  powerWeapon,
  priestBattle,
  protection,
  relocateSpell,
  resistDisease,
  resistDrain,
  resistPoison,
  shock,
  sleepMonster,
  spellEffect,
  slowEnemies,
  speed,
  strength,
  strengthAndSpeed,
  wizardBattle,
} from './magic';
import { BorlandRng } from './rng';
import { FAITHFUL_RULES, type GameRules } from './rules';
import type { Game, Monster } from './state';
import { MAP_EMPTY, MAP_PLAYER, monsterAt, newGame, setMonsterMap } from './state';

/** Monster kind 23 is one of section 1's ordinary monsters; kind 22 is its Shadow boss. */
const REGULAR = 23;
const BOSS = 22;

/** Puts a monster on the floor, marks the square it stands on, and engages it. */
function engage(game: Game, monster: Partial<Monster> = {}): Monster {
  const placed = Object.assign(game.monsters[0], {
    x: 10,
    y: 10,
    hp: 5000,
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
  seed = 1,
  monster: Partial<Monster> = {},
  rules: GameRules = FAITHFUL_RULES,
): { game: Game; monster: Monster } {
  const game = newGame({ rng: new BorlandRng(seed), rules });
  setMonsterMap(game, game.pc.x, game.pc.y, MAP_PLAYER);
  return { game, monster: engage(game, monster) };
}

describe('msgNoMonster', () => {
  it('prints the refusal without the blank slots the game pads it with', () => {
    const game = newGame();
    msgNoMonster(game);
    expect(game.messages).toEqual([
      'YOU ARE NOT CURRENTLY',
      '   ENGAGING ANY MONSTER.',
      '',
      'HIT ANY KEY...',
    ]);
  });
});

describe('explosion', () => {
  it('refuses when nothing is engaged', () => {
    const game = newGame();
    expect(explosion(game, 0)).toBe(false);
    expect(game.messages[0]).toBe('YOU ARE NOT CURRENTLY');
  });

  it.each([
    [0, 'minorExplosion' as const, 'A SMALL EXPLOSION OCCURS'],
    [1, 'explosion' as const, 'A LARGE EXPLOSION OCCURS'],
    [2, 'majorExplosion' as const, 'A HUGE EXPLOSION OCCURS'],
  ])('size %i rolls the range dotu-mech gives for %s', (size, name, headline) => {
    const { game, monster } = fighting(20 + size);
    const [low, high] = damageSpells(game.pc.lev)[name];
    const rolled = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      const before = monster.hp;
      game.messages.length = 0;
      expect(explosion(game, size)).toBe(true);
      rolled.add(before - monster.hp);
    }
    expect(Math.min(...rolled)).toBe(low);
    expect(Math.max(...rolled)).toBe(high);
    expect(game.messages[0]).toBe(headline);
  });

  it('says how much damage it did', () => {
    const { game, monster } = fighting(7);
    explosion(game, 0);
    const damage = 5000 - monster.hp;
    expect(game.messages).toEqual([
      'A SMALL EXPLOSION OCCURS',
      '   ON THE GROUND DIRECTLY',
      '   BELOW THE MONSTER.',
      `   THE EXPLOSION DOES ${damage}`,
      '   POINTS OF DAMAGE.',
      '',
      'HIT ANY KEY',
    ]);
  });
});

describe('sleepMonster', () => {
  it('refuses when nothing is engaged', () => {
    const game = newGame();
    expect(sleepMonster(game)).toBe(false);
  });

  it('only refuses an already asleep monster on the last move of its sleep', () => {
    const lastMove = fighting().game;
    lastMove.pc.sleepTimer = 1;
    expect(sleepMonster(lastMove)).toBe(false);
    expect(lastMove.messages).toContain('CASTING THIS SPELL WOULD');

    const stillAsleep = fighting().game;
    stillAsleep.pc.sleepTimer = 24;
    expect(sleepMonster(stillAsleep)).toBe(true);
    expect(stillAsleep.messages).not.toContain('CASTING THIS SPELL WOULD');
  });

  it('sleeps a level 40 monster about as often as the notes say, for 25 moves', () => {
    const { game } = fighting(99, { level: 40 });
    let slept = 0;
    const runs = 20000;
    for (let i = 0; i < runs; i++) {
      game.pc.sleepTimer = 0;
      sleepMonster(game);
      if (game.pc.sleepTimer === 25) slept++;
    }
    expect(slept / runs).toBeCloseTo(sleepChance(40), 1);
  });

  it('always takes on a monster of level 3 or less', () => {
    const { game } = fighting(3, { level: 3 });
    for (let i = 0; i < 100; i++) {
      game.pc.sleepTimer = 0;
      sleepMonster(game);
      expect(game.pc.sleepTimer).toBe(25);
    }
  });

  it('works on a Shadow boss, which no other monster spell does', () => {
    const { game } = fighting(5, { type: BOSS, level: 1 });
    expect(sleepMonster(game)).toBe(true);
    expect(game.pc.sleepTimer).toBe(25);
    expect(game.monsterStatusLine).toBe('MONSTER IS SLEEPING');
  });

  it('writes the monster status line when it lands and prints when it misses', () => {
    const { game } = fighting(99, { level: 40 });
    for (let i = 0; i < 100; i++) {
      game.pc.sleepTimer = 0;
      game.monsterStatusLine = '';
      game.messages.length = 0;
      expect(sleepMonster(game)).toBe(true);
      if (game.pc.sleepTimer === 25) {
        expect(game.monsterStatusLine).toBe('MONSTER IS SLEEPING');
        expect(game.messages).toEqual([]);
      } else {
        expect(game.monsterStatusLine).toBe('');
        expect(game.messages).toEqual(['THE SPELL FAILS.', '', 'HIT ANY KEY']);
      }
    }
  });
});

describe('autokill', () => {
  it('refuses a Shadow boss and prints its taunt', () => {
    const { game, monster } = fighting(1, { type: BOSS });
    expect(autokill(game)).toBe(false);
    expect(monster.hp).toBe(5000);
    expect(game.messages[2]).toBe("AND SAYS, 'NO. THAT SILLY");
  });

  it('lands about as often as the notes roll says', () => {
    const { game, monster } = fighting(4242, { level: 45 });
    game.pc.lev = 20;
    game.pc.iq = 18;
    game.pc.wis = 22;
    game.pc.level = 30;
    const monsterSpeed = game.monsterStats[game.monsterKinds[REGULAR].type].speed;
    let kills = 0;
    const runs = 20000;
    for (let i = 0; i < runs; i++) {
      monster.hp = 5000;
      game.messages.length = 0;
      expect(autokill(game)).toBe(true);
      if (monster.hp === -100) kills++;
    }
    expect(kills / runs).toBeCloseTo(autokillChance(45, monsterSpeed, 20, 18, 22, 30), 1);
  });

  it('sets the monster to minus 100 hit points when it lands', () => {
    const { game, monster } = fighting(1, { level: 1 });
    game.pc.lev = 200;
    expect(autokill(game)).toBe(true);
    expect(monster.hp).toBe(-100);
    expect(game.messages[0]).toBe("THE MONSTER'S BRAIN EXPLODES");
  });

  it('reaches any depth at all under rules that name no deepest floor', () => {
    const rules: GameRules = { ...FAITHFUL_RULES, autokillDeepestFloor: null };
    const { game, monster } = fighting(1, { level: 1 }, rules);
    game.pc.lev = 200;
    game.pc.level = 9000;
    expect(autokill(game)).toBe(true);
    expect(monster.hp).toBe(-100);
  });

  it('still reaches the deepest floor the rules name', () => {
    const rules: GameRules = { ...FAITHFUL_RULES, autokillDeepestFloor: 200 };
    const { game, monster } = fighting(1, { level: 1 }, rules);
    game.pc.lev = 200;
    game.pc.level = 200;
    expect(autokill(game)).toBe(true);
    expect(monster.hp).toBe(-100);
  });

  it('reaches no further, and says so rather than rolling', () => {
    const rules: GameRules = { ...FAITHFUL_RULES, autokillDeepestFloor: 200 };
    const { game, monster } = fighting(1, { level: 1 }, rules);
    game.pc.lev = 200;
    game.pc.level = 201;
    // False is what makes the cast free: cast_a_spell charges nothing for a spell that reports
    // failure.
    expect(autokill(game)).toBe(false);
    expect(monster.hp).toBe(5000);
    expect(game.messages).toEqual([
      'YOUR MIND REACHES DOWN AND',
      '   FINDS NOTHING TO HOLD.',
      'THE DEPTHS ARE TOO GREAT.',
      '',
      'HIT ANY KEY',
    ]);
  });

  it('refuses on depth before it asks whether the monster is a boss', () => {
    const rules: GameRules = { ...FAITHFUL_RULES, autokillDeepestFloor: 200 };
    const { game } = fighting(1, { type: BOSS }, rules);
    game.pc.level = 201;
    expect(autokill(game)).toBe(false);
    expect(game.messages[0]).toBe('YOUR MIND REACHES DOWN AND');
  });
});

describe('drainMonster', () => {
  it('empties a monster whose level is under the caster’s wisdom', () => {
    const { game, monster } = fighting(1, { level: 19 });
    game.pc.wis = 20;
    expect(drainMonster(game)).toBe(true);
    expect(monster.level).toBe(0);
    expect(monster.hp).toBe(0);
    expect(game.messages).toEqual([]);
  });

  it('otherwise takes wisdom off the level and half the type’s hit points per level per point', () => {
    const { game, monster } = fighting(1, { level: 50 });
    game.pc.wis = 20;
    const perLevel = game.monsterStats[game.monsterKinds[REGULAR].type].hpPerLevel;
    expect(drainMonster(game)).toBe(true);
    expect(monster.level).toBe(30);
    expect(monster.hp).toBe(5000 - Math.trunc(perLevel / 2) * 20);
  });

  it('refuses a Shadow boss', () => {
    const { game, monster } = fighting(1, { type: BOSS, level: 50 });
    expect(drainMonster(game)).toBe(false);
    expect(monster.level).toBe(50);
  });
});

describe('goAway', () => {
  it('always moves a monster that is not a boss, and moves it on the occupancy map', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { game, monster } = fighting(seed);
      expect(goAway(game)).toBe(true);
      expect([monster.x, monster.y]).not.toEqual([10, 10]);
      expect(monsterAt(game, 10, 10)).toBe(-1);
      expect(monsterAt(game, monster.x, monster.y)).toBe(0);
    }
  });

  it('lands the monster inside the floor the game lets the player reach', () => {
    const { game, monster } = fighting(11);
    goAway(game);
    expect(monster.x).toBeLessThan(game.columns);
    expect(monster.y).toBeLessThan(game.rows);
  });

  it('drops the monster in rock, because the loop tests the player’s square', () => {
    // Rock everywhere except where the player stands: the search should never end, and only
    // does because it asks about the player's square rather than the monster's.
    const { game, monster } = fighting(1);
    game.solid = (x, y) => !(x === game.pc.x && y === game.pc.y);
    expect(goAway(game)).toBe(true);
    expect([monster.x, monster.y]).not.toEqual([game.pc.x, game.pc.y]);
    expect(game.solid(monster.x, monster.y, game.pc.level, game.pc.module)).toBe(true);
  });

  it('refuses a Shadow boss', () => {
    const { game, monster } = fighting(1, { type: BOSS });
    expect(goAway(game)).toBe(false);
    expect([monster.x, monster.y]).toEqual([10, 10]);
  });
});

describe('relocateSpell', () => {
  it('moves the player to an open square with no monster on it', () => {
    const { game } = fighting(31);
    game.solid = (x, y) => x < 5 || y < 5;
    setMonsterMap(game, 20, 20, 0);
    expect(relocateSpell(game)).toBe(true);
    expect(game.solid(game.pc.x, game.pc.y, game.pc.level, game.pc.module)).toBe(false);
    expect([game.pc.x, game.pc.y]).not.toEqual([20, 20]);
    expect(monsterAt(game, game.pc.x, game.pc.y)).toBe(MAP_PLAYER);
    expect(monsterAt(game, 40, 50)).toBe(-1);
    expect(game.recenterMap).toBe(true);
  });
});

describe('powerWeapon', () => {
  it('sets the power weapon level and 60 moves', () => {
    const game = newGame();
    expect(powerWeapon(game, 1)).toBe(true);
    expect(game.pc.powerWeapon).toBe(1);
    expect(game.pc.powerWeaponTime).toBe(60);
    expect(game.messages[0]).toBe('YOUR WEAPON BEGINS TO');
  });

  it('adds 60 moves when the same level is cast again', () => {
    const game = newGame({ pc: { powerWeapon: 2, powerWeaponTime: 15 } });
    expect(powerWeapon(game, 2)).toBe(true);
    expect(game.pc.powerWeaponTime).toBe(75);
    expect(game.messages).toContain('  60 MOVES LONGER.');
  });

  it('restarts the clock at 60 when a stronger one is cast', () => {
    const game = newGame({ pc: { powerWeapon: 1, powerWeaponTime: 55 } });
    expect(powerWeapon(game, 3)).toBe(true);
    expect(game.pc.powerWeaponTime).toBe(60);
  });

  it('refuses a weaker one', () => {
    const game = newGame({ pc: { powerWeapon: 3, powerWeaponTime: 10 } });
    expect(powerWeapon(game, 1)).toBe(false);
    expect(game.pc.powerWeapon).toBe(3);
    expect(game.messages[0]).toBe('CASTING THIS SPELL WOULD');
  });
});

describe('protection', () => {
  it('sets the protection level and 60 moves', () => {
    const game = newGame();
    expect(protection(game, 2)).toBe(true);
    expect(game.pc.protection).toBe(2);
    expect(game.pc.protectionTime).toBe(60);
    expect(game.messages).toEqual([
      'YOUR BODY BEGINS TO SHIMMER',
      '   WITH SHIFTING COLORS OF',
      '   LIGHT. THIS PROTECTION',
      '   WILL LAST FOR 60 MOVES',
      '   OR STEPS.',
      '',
      'HIT ANY KEY',
    ]);
  });

  it('refuses a weaker one and extends an equal one', () => {
    const weaker = newGame({ pc: { protection: 4, protectionTime: 5 } });
    expect(protection(weaker, 1)).toBe(false);

    const same = newGame({ pc: { protection: 4, protectionTime: 5 } });
    expect(protection(same, 4)).toBe(true);
    expect(same.pc.protectionTime).toBe(65);
  });
});

describe('strength, speed and both together', () => {
  it('give 7 points and 60 moves, once', () => {
    const game = newGame();
    expect(strength(game)).toBe(true);
    expect([game.pc.str, game.pc.strengthTimer]).toEqual([27, 60]);
    expect(strength(game)).toBe(false);
    expect([game.pc.str, game.pc.strengthTimer]).toEqual([27, 60]);

    expect(speed(game)).toBe(true);
    expect([game.pc.dex, game.pc.speedTimer]).toEqual([27, 60]);
    expect(speed(game)).toBe(false);
  });

  it('refuse Strength And Speed only when both are already running', () => {
    const both = newGame({ pc: { strengthTimer: 10, speedTimer: 10 } });
    expect(strengthAndSpeed(both)).toBe(false);
    expect(both.pc.str).toBe(20);

    // With only Strength up, Strength And Speed extends it without a second +7 and grants the
    // agility properly.
    const half = newGame({ pc: { strengthTimer: 10 } });
    expect(strengthAndSpeed(half)).toBe(true);
    expect([half.pc.str, half.pc.strengthTimer]).toEqual([20, 70]);
    expect([half.pc.dex, half.pc.speedTimer]).toEqual([27, 60]);
  });
});

describe('the resistances', () => {
  it.each([
    [resistPoison, 'resistPoisonTimer' as const, 'YOU FEEL A WARMTH IN YOUR'],
    [resistDisease, 'resistDiseaseTimer' as const, 'YOU FEEL A TINGLING IN YOUR'],
    [antiCold, 'antiColdTimer' as const, 'YOU FEEL A WARM FEELING AS'],
    [antiFire, 'antiFireTimer' as const, 'YOU FEEL A COOL FEELING AS'],
    [resistDrain, 'resistDrainTimer' as const, 'YOU FEEL A HEAVENLY'],
  ])('add 60 moves every time they are cast', (cast, timer, opening) => {
    const game = newGame();
    expect(cast(game)).toBe(true);
    expect(game.pc[timer]).toBe(60);
    expect(cast(game)).toBe(true);
    expect(game.pc[timer]).toBe(120);
    expect(game.messages[0]).toBe(opening);
  });
});

describe('passWall', () => {
  it('does nothing when the spell is cancelled', () => {
    const { game } = fighting();
    expect(passWall(game, 5)).toBe(false);
    expect([game.pc.x, game.pc.y]).toEqual([40, 50]);
  });

  it('walks to the first open square 2 away, never to the one next door', () => {
    const { game } = fighting();
    expect(passWall(game, 3)).toBe(true);
    expect([game.pc.x, game.pc.y]).toEqual([42, 50]);
    expect(monsterAt(game, 40, 50)).toBe(-1);
    expect(monsterAt(game, 42, 50)).toBe(MAP_PLAYER);
  });

  it.each([
    [1, [40, 48]],
    [2, [40, 52]],
    [3, [42, 50]],
    [4, [38, 50]],
  ])('sends choice %i the way the menu says', (choice, expected) => {
    const { game } = fighting();
    expect(passWall(game, choice)).toBe(true);
    expect([game.pc.x, game.pc.y]).toEqual(expected);
  });

  it('walks past rock and past a monster to the first square that is neither', () => {
    const { game } = fighting();
    game.solid = (x) => x >= 42 && x <= 45;
    setMonsterMap(game, 46, 50, 0);
    expect(passWall(game, 3)).toBe(true);
    expect(game.pc.x).toBe(47);
  });

  it('gives up after 19 squares and leaves the player where they were', () => {
    const { game } = fighting();
    game.solid = (x) => x > 40;
    expect(passWall(game, 3)).toBe(false);
    expect([game.pc.x, game.pc.y]).toEqual([40, 50]);
    expect(monsterAt(game, 40, 50)).toBe(MAP_PLAYER);
  });

  it('reaches 19 squares but no further', () => {
    const near = fighting().game;
    near.solid = (x) => x < 59;
    expect(passWall(near, 3)).toBe(true);
    expect(near.pc.x).toBe(59);

    const far = fighting().game;
    far.solid = (x) => x < 60;
    expect(passWall(far, 3)).toBe(false);
  });

  it('will not step off the part of the floor the game lets the player reach', () => {
    const { game } = fighting();
    game.pc.x = game.columns - 2;
    game.solid = () => false;
    setMonsterMap(game, game.pc.x, game.pc.y, MAP_PLAYER);
    expect(passWall(game, 3)).toBe(false);
    expect(game.pc.x).toBe(game.columns - 2);
  });

  it('asks for the view to be re-centred and redrawn', () => {
    const { game } = fighting();
    expect(passWall(game, 3)).toBe(true);
    expect([game.recenterMap, game.redrawView]).toEqual([true, true]);
    expect(game.pc.mapCursorX).toBe(42);
  });
});

describe('the occupancy map', () => {
  it('reads an empty square back as -1 and the player as 0xfe', () => {
    const game = newGame();
    expect(monsterAt(game, 3, 4)).toBe(-1);
    setMonsterMap(game, 3, 4, MAP_PLAYER);
    expect(monsterAt(game, 3, 4)).toBe(MAP_PLAYER);
    setMonsterMap(game, 3, 4, MAP_EMPTY);
    expect(monsterAt(game, 3, 4)).toBe(-1);
  });
});

describe('the wizard list’s damage spells', () => {
  it.each([
    [magicZap, 'magicZap' as const, 'WISPS OF COLORFUL LIGHT'],
    [lightningBolt, 'lightning' as const, 'YOU FORM A BALL WITH YOUR'],
    [minorShock, 'minorShock' as const, 'YOU TOUCH THE MONSTER'],
    [magicMissile, 'magicMissile' as const, 'A MISSLE BOLTS FORWARD'],
    [shock, 'shock' as const, 'YOU TOUCH THE MONSTER'],
    [majorShock, 'majorShock' as const, 'YOU TOUCH THE MONSTER'],
  ])('do the damage dotu-mech gives for %s', (cast, name, opening) => {
    const { game, monster } = fighting();
    expect(cast(game)).toBe(true);
    expect(5000 - monster.hp).toBe(damageSpells(game.pc.lev)[name]);
    expect(game.messages[0]).toBe(opening);
  });

  it.each([
    [magicZap, '   THE MONSTER FOR 22'],
    [lightningBolt, '   THE MONSTER FOR 44'],
  ])('write the number into the line the way itoa does', (cast, line) => {
    const { game } = fighting();
    cast(game);
    expect(game.messages).toContain(line);
  });

  it.each([
    [magicZot, 'magicZot' as const],
    [magicBolt, 'magicBolt' as const],
  ])('roll %s over one missile per level, plus one', (cast, name) => {
    const single = fighting(55);
    single.game.pc.lev = 0;
    const [low, high] = damageSpells(0)[name];
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const before = single.monster.hp;
      single.game.messages.length = 0;
      expect(cast(single.game)).toBe(true);
      seen.add(before - single.monster.hp);
    }
    expect(Math.min(...seen)).toBe(low);
    expect(Math.max(...seen)).toBe(high);

    const ten = fighting(56);
    const [tenLow, tenHigh] = damageSpells(ten.game.pc.lev)[name];
    for (let i = 0; i < 500; i++) {
      const before = ten.monster.hp;
      ten.game.messages.length = 0;
      cast(ten.game);
      const rolled = before - ten.monster.hp;
      expect(rolled).toBeGreaterThanOrEqual(tenLow);
      expect(rolled).toBeLessThanOrEqual(tenHigh);
    }
  });

  it('refuse when nothing is engaged', () => {
    for (const cast of [magicZap, lightningBolt, minorShock, magicMissile, shock, majorShock, magicZot, magicBolt]) {
      const game = newGame();
      expect(cast(game)).toBe(false);
      expect(game.messages[0]).toBe('YOU ARE NOT CURRENTLY');
    }
  });

  it('say how many points Magic Zot did', () => {
    const { game, monster } = fighting(8);
    magicZot(game);
    expect(game.messages).toEqual([
      'A GROUP OF MISSLES SPRING',
      '   FORTH FROM YOUR FINGERTIPS',
      '   AND PLUNGE DIRECTLY INTO',
      "   THE ENEMY'S BODY.",
      `   THE MISSLES DO ${5000 - monster.hp}`,
      '   POINTS OF DAMAGE.',
      '',
      'HIT ANY KEY',
    ]);
  });
});

describe('slowEnemies', () => {
  it('sets the clock to 60 rather than adding to it', () => {
    const game = newGame({ pc: { slowEnemiesTimer: 50 } });
    expect(slowEnemies(game)).toBe(true);
    expect(game.pc.slowEnemiesTimer).toBe(60);
    expect(game.messages[2]).toBe('   HALF SPEED.');
  });
});

describe('holdMonster', () => {
  it('holds for 15 moves and writes the monster’s status line', () => {
    const { game } = fighting();
    expect(holdMonster(game)).toBe(true);
    expect(game.pc.holdMonsterTimer).toBe(15);
    expect(game.monsterStatusLine).toBe('MONSTER IS HELD');
  });

  it('refuses a Shadow boss, and refuses when nothing is engaged', () => {
    const { game } = fighting(1, { type: BOSS });
    expect(holdMonster(game)).toBe(false);
    expect(game.pc.holdMonsterTimer).toBe(0);

    const empty = newGame();
    expect(holdMonster(empty)).toBe(false);
    expect(empty.messages[0]).toBe('YOU ARE NOT CURRENTLY');
  });
});

describe('wizardBattle', () => {
  it('gives the three protections and the three power weapons their levels', () => {
    const cells: [number, number, 'protection' | 'powerWeapon', number][] = [
      [0, 2, 'protection', 1],
      [4, 1, 'protection', 2],
      [3, 2, 'powerWeapon', 1],
      [7, 2, 'powerWeapon', 2],
      [9, 2, 'powerWeapon', 3],
    ];
    for (const [levelIndex, slot, field, expected] of cells) {
      const game = newGame();
      expect(wizardBattle(game, levelIndex, slot)).toBe(true);
      expect(game.pc[field]).toBe(expected);
    }
  });

  it('gives the three explosions their sizes', () => {
    const sizes: [number, 'minorExplosion' | 'explosion' | 'majorExplosion'][] = [
      [4, 'minorExplosion'],
      [6, 'explosion'],
      [9, 'majorExplosion'],
    ];
    for (const [levelIndex, name] of sizes) {
      const { game, monster } = fighting(levelIndex + 60);
      const [low, high] = damageSpells(game.pc.lev)[name];
      expect(wizardBattle(game, levelIndex, 0)).toBe(true);
      expect(5000 - monster.hp).toBeGreaterThanOrEqual(low);
      expect(5000 - monster.hp).toBeLessThanOrEqual(high);
    }
  });

  it('says Go Away and Relocate worked even when Go Away refused a boss', () => {
    const { game, monster } = fighting(1, { type: BOSS });
    expect(wizardBattle(game, 3, 0)).toBe(true);
    expect([monster.x, monster.y]).toEqual([10, 10]);
  });

  it('hands Pass Wall the direction the player picked', () => {
    const { game } = fighting();
    game.chooseDirection = () => 4;
    expect(wizardBattle(game, 6, 1)).toBe(true);
    expect([game.pc.x, game.pc.y]).toEqual([38, 50]);
  });

  it('runs every cell of the list', () => {
    for (let levelIndex = 0; levelIndex < 10; levelIndex++) {
      for (let slot = 0; slot < 3; slot++) {
        const { game } = fighting(200 + levelIndex * 3 + slot);
        expect(() => wizardBattle(game, levelIndex, slot)).not.toThrow();
      }
    }
  });

  it('reports nothing for a slot the list does not have', () => {
    const { game } = fighting();
    expect(wizardBattle(game, 0, 3)).toBe(false);
    expect(wizardBattle(game, 10, 0)).toBe(false);
  });
});

describe('the priest list’s cures', () => {
  it('Fast Cure heals half the caster’s wisdom, with no roll and no overheal', () => {
    const game = newGame({ pc: { hp: 40, maxHp: 100, wis: 21 } });
    expect(fastCure(game)).toBe(true);
    expect(game.pc.hp).toBe(50);
    expect(game.messages).toEqual(['YOU FEEL GOOD - HIT ANY KEY']);

    const nearlyFull = newGame({ pc: { hp: 99, maxHp: 100, wis: 21 } });
    fastCure(nearlyFull);
    expect(nearlyFull.pc.hp).toBe(100);
  });

  it('Fast Big Cure heals 20 to 90', () => {
    const game = newGame({ rng: new BorlandRng(3), pc: { hp: 0, maxHp: 100000, wis: 20 } });
    const healed = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      game.pc.hp = 0;
      game.messages.length = 0;
      expect(fastBigCure(game)).toBe(true);
      healed.add(game.pc.hp);
    }
    expect(Math.min(...healed)).toBe(20);
    expect(Math.max(...healed)).toBe(90);
  });

  it('Fast Big Cure will not push past the maximum', () => {
    const game = newGame({ rng: new BorlandRng(3), pc: { hp: 95, maxHp: 100, wis: 20 } });
    expect(fastBigCure(game)).toBe(true);
    expect(game.pc.hp).toBe(100);
  });

  it('Fast Heal fills the bar and says nothing', () => {
    const game = newGame({ pc: { hp: 1, maxHp: 250 } });
    expect(fastHeal(game)).toBe(true);
    expect(game.pc.hp).toBe(250);
    expect(game.messages).toEqual([]);
  });
});

describe('priestBattle', () => {
  it('gives Protection level 1, the same as Minor Protection', () => {
    const game = newGame();
    expect(priestBattle(game, 4, 0)).toBe(true);
    expect(game.pc.protection).toBe(1);

    // And so a priest who already has Minor Protection is told Protection would be redundant.
    const minor = newGame();
    expect(priestBattle(minor, 0, 1)).toBe(true);
    expect(priestBattle(minor, 4, 0)).toBe(true);
    expect(minor.pc.protection).toBe(1);
    expect(minor.pc.protectionTime).toBe(120);
  });

  it('gives Major and Ultra Protection their own levels', () => {
    const major = newGame();
    expect(priestBattle(major, 7, 0)).toBe(true);
    expect(major.pc.protection).toBe(3);

    const ultra = newGame();
    expect(priestBattle(ultra, 9, 0)).toBe(true);
    expect(ultra.pc.protection).toBe(4);
  });

  it('gives the three power weapons their levels', () => {
    const cells: [number, number, number][] = [
      [3, 2, 1],
      [6, 1, 2],
      [8, 1, 3],
    ];
    for (const [levelIndex, slot, expected] of cells) {
      const game = newGame();
      expect(priestBattle(game, levelIndex, slot)).toBe(true);
      expect(game.pc.powerWeapon).toBe(expected);
    }
  });

  it('throws the ordinary explosion, not the small or the huge one', () => {
    const { game, monster } = fighting(77);
    const [low, high] = damageSpells(game.pc.lev).explosion;
    expect(priestBattle(game, 7, 1)).toBe(true);
    expect(5000 - monster.hp).toBeGreaterThanOrEqual(low);
    expect(5000 - monster.hp).toBeLessThanOrEqual(high);
    expect(game.messages[0]).toBe('A LARGE EXPLOSION OCCURS');
  });

  it('runs every cell of the list', () => {
    for (let levelIndex = 0; levelIndex < 10; levelIndex++) {
      for (let slot = 0; slot < 3; slot++) {
        const { game } = fighting(300 + levelIndex * 3 + slot);
        expect(() => priestBattle(game, levelIndex, slot)).not.toThrow();
      }
    }
  });
});

describe('spellEffect', () => {
  it('sends type 2 to the wizard list and type 3 to the priest list', () => {
    const wizard = newGame();
    expect(spellEffect(wizard, 2, 4, 1)).toBe(true);
    expect(wizard.pc.protection).toBe(2);

    const priest = newGame();
    expect(spellEffect(priest, 3, 4, 0)).toBe(true);
    expect(priest.pc.protection).toBe(1);
  });

  it('sends type 0 to the permanent list and type 1 to the preparation list', () => {
    const permanent = newGame();
    expect(spellEffect(permanent, 0, 2, 1)).toBe(true);
    expect(permanent.pc.maxHp).toBe(105);

    const preparation = newGame();
    expect(spellEffect(preparation, 1, 6, 2)).toBe(true);
    expect(preparation.pc.fastMove).toBe(1);
  });

  it('reports nothing for a type the game does not have', () => {
    expect(spellEffect(newGame(), 4, 0, 0)).toBe(false);
  });
});
