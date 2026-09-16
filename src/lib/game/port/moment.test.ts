import { describe, expect, it } from 'vitest';
import { relocate } from './magic';
import { arriveSquare, leaveSquare, passMoment, tickSpellTimers } from './moment';
import { MAP_EMPTY, MAP_PLAYER, monsterAt, newGame, setMonsterMap, type Game } from './state';

/** A generator that always hands back the same number, so a moment can be checked step by step. */
const always = (value: number) => ({ random: () => value });

/** A generator that hands back a written-down run of numbers, whatever range it is asked for. */
function scripted(values: number[]) {
  let next = 0;
  return { random: () => values[next++ % values.length] };
}

/** A game with one monster on the floor and the other 144 slots left where they start. */
function gameWithMonster(x: number, y: number, overrides: Parameters<typeof newGame>[0] = {}): Game {
  const game = newGame({ rng: always(0), pc: { x: 40, y: 50, level: 5 }, ...overrides });
  game.monsters[0] = { x, y, hp: 10, type: 0, level: 5 };
  setMonsterMap(game, x, y, 0);
  setMonsterMap(game, game.pc.x, game.pc.y, MAP_PLAYER);
  return game;
}

describe('the spell timers', () => {
  it('takes the seven points back when strength and speed run out', () => {
    const game = newGame({ pc: { strengthTimer: 1, speedTimer: 4, str: 27, dex: 27 } });
    tickSpellTimers(game, 1);
    expect([game.pc.strengthTimer, game.pc.str]).toEqual([0, 20]);
    expect([game.pc.speedTimer, game.pc.dex]).toEqual([3, 27]);
  });

  it('clears the level beside a power weapon or protection timer that runs out', () => {
    const game = newGame({ pc: { powerWeapon: 3, powerWeaponTime: 1, protection: 2, protectionTime: 2 } });
    tickSpellTimers(game, 1);
    expect([game.pc.powerWeapon, game.pc.powerWeaponTime]).toEqual([0, 0]);
    expect([game.pc.protection, game.pc.protectionTime]).toEqual([2, 1]);
  });

  it('wipes the monster line when sleep or hold runs out', () => {
    const game = newGame({ pc: { sleepTimer: 1 }, monsterStatusLine: 'THE MONSTER IS ASLEEP' });
    tickSpellTimers(game, 1);
    expect(game.monsterStatusLine).toBe('');
  });
});

describe('a moment', () => {
  it('walks a monster one square towards the character along the x axis first', () => {
    const game = gameWithMonster(43, 53);
    passMoment(game);
    expect([game.monsters[0].x, game.monsters[0].y]).toEqual([42, 53]);
    expect(monsterAt(game, 42, 53)).toBe(0);
    expect(monsterAt(game, 43, 53)).toBe(-1);
  });

  it('walks it north when there is nothing to do on the x axis', () => {
    const game = gameWithMonster(40, 53);
    passMoment(game);
    expect([game.monsters[0].x, game.monsters[0].y]).toEqual([40, 52]);
  });

  it('leaves a monster with a wall in the way where it stands', () => {
    const game = gameWithMonster(43, 50, { retdwall: () => 0 });
    passMoment(game);
    expect([game.monsters[0].x, game.monsters[0].y]).toEqual([43, 50]);
  });

  it('leaves a monster too far away alone and stops its attacks banking up', () => {
    const game = gameWithMonster(70, 50);
    game.monsterTimers[0] = -40;
    passMoment(game);
    expect([game.monsters[0].x, game.monsters[0].y]).toEqual([70, 50]);
    expect(game.monsterTimers[0]).toBe(1);
  });

  it('stands a monster still one moment in five', () => {
    const game = gameWithMonster(43, 50, { rng: always(1) });
    passMoment(game);
    expect(game.monsters[0].x).toBe(43);
  });

  it('bites with a disease, taking a point of constitution for good', () => {
    const game = gameWithMonster(70, 50, { pc: { x: 40, y: 50, level: 5, disease: 2, con: 20 } });
    passMoment(game);
    expect(game.pc.con).toBe(19);
    expect(game.pc.disease).toBe(450);
    expect(game.messages[0]).toBe("  OH NO! YOU'VE PERMANENTLY");
    expect(game.events).toEqual([{ kind: 'playerSaved' }]);
  });

  it('bites with a poison, taking a point of strength', () => {
    const game = gameWithMonster(70, 50, { pc: { x: 40, y: 50, level: 5, poison: 2, str: 20 } });
    passMoment(game);
    expect(game.pc.str).toBe(19);
    expect(game.pc.poison).toBe(450);
  });

  it('leaves a disease alone while Resist Disease runs', () => {
    const game = gameWithMonster(70, 50, { pc: { x: 40, y: 50, level: 5, disease: 2, resistDiseaseTimer: 5 } });
    passMoment(game);
    expect(game.pc.disease).toBe(2);
  });

  it('is skipped one time in four by the preparation Fast Move', () => {
    const game = gameWithMonster(43, 50, { rng: always(1), pc: { x: 40, y: 50, level: 5, fastMove: 1, strengthTimer: 4, str: 27 } });
    passMoment(game);
    // The timers tick before the spell can end the moment, so only the monsters are skipped.
    expect(game.pc.strengthTimer).toBe(3);
    expect(game.monsters[0].x).toBe(43);
  });
});

describe('a step', () => {
  it('takes the character off one square and puts them on the next', () => {
    const game = gameWithMonster(70, 50);
    leaveSquare(game);
    expect(game.monsterMap[50 * 80 + 40]).toBe(MAP_EMPTY);
    game.pc.x = 41;
    arriveSquare(game);
    expect(game.monsterMap[50 * 80 + 41]).toBe(MAP_PLAYER);
  });

  it('gives a hit point back for every Ring of Regeneration', () => {
    const game = gameWithMonster(70, 50, { pc: { x: 40, y: 50, level: 5, hp: 30, regenRings: 3 } });
    arriveSquare(game);
    expect(game.pc.hp).toBe(33);
  });

  it('spends a step of seconds half the time', () => {
    const spends = gameWithMonster(70, 50, { rng: always(1) });
    arriveSquare(spends);
    expect(spends.secondsElapsed).toBeGreaterThan(0);
    const free = gameWithMonster(70, 50, { rng: always(0) });
    arriveSquare(free);
    expect(free.secondsElapsed).toBe(0);
  });
});

describe('being relocated', () => {
  it('rolls again when the square it picked has a monster on it', () => {
    const game = gameWithMonster(20, 20, { rng: scripted([20, 20, 21, 21]) });
    relocate(game);
    expect([game.pc.x, game.pc.y]).toEqual([21, 21]);
    expect(monsterAt(game, 21, 21)).toBe(MAP_PLAYER);
    expect(game.monsterMap[50 * 80 + 40]).toBe(MAP_EMPTY);
    expect(game.recenterMap).toBe(true);
  });
});
