import { describe, expect, it } from 'vitest';
import { UNFORGIVEN_MAP, type MapSquare } from '../../map/game';
import { monsterById, MONSTER_SLOTS } from '../../map/stocking';
import { BOSS_KIND, drawnMonsters, FloorMonsters, loadLevelMap } from '../../play/floor';
import { manualOpening } from '../../play/manual';
import { explainTrapdoor } from '../../play/trapdoor';
import data from '../dotu-data.json';
import { bundledDungeon } from '../dungeon';
import { drainerBonus } from '../port/kills';
import { BorlandRng } from '../port/rng';
import { monsterAt, newGame, type Game } from '../port/state';
import { endlessRules } from './rules';

/**
 * A floor a hundred below the deepest the game itself has, played by the rules of one endless
 * world: the map generates it, the ways off it lead deeper, and the stocking fills it with the
 * monsters of the section it borrowed.
 */
const SEED = 20260915;
const MODULE_V = 4;
const FLOOR = 120;
/** A floor deep enough that the game's own key odds would never hand out a key for it. */
const DEEP_FLOOR = 300;
const FAITHFUL_BOTTOM = 105;
/** How far apart a section's last floor and the shallowest floor its trap doors lead to are. */
const TRAP_DOOR_FLOORS = 80;
/** The deepest floor the record's own key flags reach. */
const DEEPEST_RECORD_KEY = 179;
/** The fewest and the most trap doors one floor of Module V has as the game itself generates it,
 *  counted over all 105 of them. */
const FEWEST_FAITHFUL_DOORS = 10;
const MOST_FAITHFUL_DOORS = 35;

const rules = endlessRules({ hard: true, seed: SEED });
const bottom = rules.bottomLevel(MODULE_V);

const floorRows = (level: number): MapSquare[][] =>
  UNFORGIVEN_MAP.floor(level, MODULE_V, bottom, rules.trapdoorReach(MODULE_V, level));

/** A game standing on an open square of the floor, the way one arrives on it. */
function gameOn(level: number): Game {
  const game = newGame({
    rules,
    rng: new BorlandRng(7),
    pc: { level, module: MODULE_V, hard: 1, x: 40, y: 50 },
    solid: (x, y, floor, dungeon) => bundledDungeon.solid(x, y, floor, dungeon),
    retdwall: (x, y, hv, floor, dungeon) => bundledDungeon.side(x, y, hv as 0 | 1, floor, dungeon),
  });
  const rows = floorRows(level);
  while (rows[game.pc.y][game.pc.x].solid) game.pc.x += 1;
  return game;
}

describe('a floor below the bottom of the game', () => {
  const squares = floorRows(FLOOR).flat();

  it('has ladders leading down off it, where the game itself offers none', () => {
    expect(squares.some((square) => square.ladder > 0)).toBe(true);
    expect(bundledDungeon.floor(FLOOR, MODULE_V).flat().some((square) => square.ladder > 0)).toBe(false);
  });

  it('has trap doors leading below the floor the game bottoms out at', () => {
    expect(squares.some((square) => square.trapdoor > FAITHFUL_BOTTOM)).toBe(true);
  });

  it('has chutes, which the game will not drop anybody down this deep', () => {
    expect(squares.some((square) => square.chute !== 0)).toBe(true);
    expect(bundledDungeon.floor(FLOOR, MODULE_V).flat().some((square) => square.chute !== 0)).toBe(false);
  });
});

describe('the trap doors of a floor below the bottom of the game', () => {
  const doorsOn = (level: number): number[] =>
    floorRows(level)
      .flat()
      .map((square) => square.trapdoor)
      .filter((destination) => destination >= 0);

  const lastFloorOf = (level: number): number => rules.sectionPlace(rules.sectionOf(MODULE_V, level))?.bossFloor ?? 0;

  it.each([FLOOR, DEEP_FLOOR])('are as few on floor %i as on a floor the game has itself', (level) => {
    expect(doorsOn(level).length).toBeGreaterThanOrEqual(FEWEST_FAITHFUL_DOORS);
    expect(doorsOn(level).length).toBeLessThanOrEqual(MOST_FAITHFUL_DOORS);
  });

  it.each([FLOOR, DEEP_FLOOR])('lead off floor %i into the eighty floors ending its section', (level) => {
    const lastFloor = lastFloorOf(level);
    for (const destination of doorsOn(level)) {
      expect(destination % 5, `door to ${destination}`).toBe(0);
      expect(destination, `door to ${destination}`).toBeGreaterThan(lastFloor - TRAP_DOOR_FLOORS);
      expect(destination, `door to ${destination}`).toBeLessThanOrEqual(lastFloor);
      expect(Math.trunc(destination / 5), `door to ${destination}`).not.toBe(Math.trunc(level / 5));
    }
  });

  it('leads some of them up from the floor and some of them further down', () => {
    expect(doorsOn(FLOOR).some((destination) => destination < FLOOR)).toBe(true);
    expect(doorsOn(FLOOR).some((destination) => destination > FLOOR)).toBe(true);
  });

  it('leaves a floor of a module the endless world has nothing to do with alone', () => {
    const MODULE_I = 0;
    const level = 20;
    expect(
      UNFORGIVEN_MAP.floor(level, MODULE_I, rules.bottomLevel(MODULE_I), rules.trapdoorReach(MODULE_I, level)),
    ).toEqual(bundledDungeon.floor(level, MODULE_I));
  });
});

describe('arriving on a floor below the bottom of the game', () => {
  it('loads the 27 rows the rules keep for the section', () => {
    const game = gameOn(FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(FLOOR), FLOOR, game.rng);
    const section = rules.sectionOf(MODULE_V, FLOOR);
    expect(section).toBe(21);
    expect(game.monsterKinds).toEqual(rules.monsterKinds(section));
    expect(game.monsterKinds).toHaveLength(27);
  });

  it('fills all 145 slots and puts each one on the occupancy grid', () => {
    const game = gameOn(FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(FLOOR), FLOOR, game.rng);
    expect(game.monsters).toHaveLength(MONSTER_SLOTS);
    for (let slot = 0; slot < MONSTER_SLOTS; slot += 1) {
      const monster = game.monsters[slot];
      expect(monster.hp, `slot ${slot}`).toBeGreaterThan(0);
      expect(monsterAt(game, monster.x, monster.y), `slot ${slot}`).toBe(slot);
    }
  });

  it("stocks nothing but the monsters the section has loaded, all of them the bestiary's", () => {
    const game = gameOn(FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(FLOOR), FLOOR, game.rng);
    const loaded = new Set(rules.monsterKinds(rules.sectionOf(MODULE_V, FLOOR)).map((kind) => kind.id));
    const drawn = drawnMonsters(game);
    expect(drawn.length).toBeGreaterThan(0);
    for (const monster of drawn) {
      expect(loaded.has(monster.monsterId), monster.monsterId).toBe(true);
      expect(() => monsterById(monster.monsterId), monster.monsterId).not.toThrow();
    }
  });

  it('stands monsters gathered from more than the one section it is drawn as', () => {
    const five = rules.monsterKinds(rules.sectionOf(MODULE_V, FLOOR)).slice(BOSS_KIND);
    const came = five.map((kind) => monsterById(kind.id).origin).map((origin) => (origin.kind === 'section' ? origin.section : 0));
    expect(new Set(came).size).toBeGreaterThan(1);
  });

  it('rolls its monsters around the level the floor is deep rather than back round to 1', () => {
    const game = gameOn(FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(FLOOR), FLOOR, game.rng);
    expect(rules.monsterLevel(MODULE_V, FLOOR)).toBe(FLOOR + 60);
    expect(game.monsters.some((monster) => monster.level > 130)).toBe(true);
  });
});

describe('the Shadow boss of a section below the bottom of the game', () => {
  const BOSS_FLOOR = 125;

  it('stands on the last floor of his section', () => {
    expect(rules.sectionPlace(21)?.bossFloor).toBe(BOSS_FLOOR);
    const game = gameOn(BOSS_FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(BOSS_FLOOR), BOSS_FLOOR, game.rng);
    expect(game.monsters[0].type).toBe(BOSS_KIND);
  });

  it('has the square he was put down on remembered beside the record', () => {
    const game = gameOn(BOSS_FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(BOSS_FLOOR), BOSS_FLOOR, game.rng);
    const boss = game.monsters[0];
    expect(rules.bossSquares.of(game.pc, 21)).toEqual({ x: boss.x, y: boss.y });
    expect(game.pc.bossX.every((x) => x === 0)).toBe(true);
    expect(game.pc.bossY.every((y) => y === 0)).toBe(true);
  });
});

describe('the S screen on a floor below the bottom of the game', () => {
  it('says which section it is and whose monsters are standing on it', () => {
    const game = gameOn(FLOOR);
    const opening = manualOpening(game);
    const source = rules.sectionSource(21);
    expect(opening.source).toBe(source);
    expect(opening.intro[0]).toBe('SECTION 21');
    expect(opening.intro.join(' ')).toContain(`section ${source}`);
  });

  it('opens on MD.BIN itself for a floor of a section the game describes', () => {
    const game = gameOn(50);
    expect(manualOpening(game)).toEqual({ source: 18, part: 2, intro: data.sections[17].intro });
  });
});

describe('a trap door on a floor below the bottom of the game', () => {
  const doorBelow = (level: number, shallowest: number): number => {
    const found = floorRows(level)
      .flat()
      .find((square) => square.trapdoor > shallowest);
    if (!found) throw new Error(`floor ${level} has no trap door leading below floor ${shallowest}`);
    return found.trapdoor;
  };

  it('is shut until the character has the key labelled with the floor it leads to', () => {
    const game = gameOn(FLOOR);
    const destination = doorBelow(FLOOR, FAITHFUL_BOTTOM);
    expect(explainTrapdoor(game, destination)).toBe(false);
    rules.keys.take(game.pc, destination);
    expect(explainTrapdoor(game, destination)).toBe(true);
  });

  it('leaves the record alone for a key the record has no flag for', () => {
    const game = gameOn(DEEP_FLOOR);
    const destination = doorBelow(DEEP_FLOOR, DEEPEST_RECORD_KEY);
    rules.keys.take(game.pc, destination);
    expect(game.pc.keys.every((flag) => flag === 0)).toBe(true);
  });

  it('has its key handed over by a level drainer killed on the floor it leads to', () => {
    const game = gameOn(FLOOR);
    game.rng = { random: () => KEY_ROLL };
    drainerBonus(game);
    expect(game.events).toContainEqual({ kind: 'found', find: { what: 'key', key: FLOOR } });
    expect(explainTrapdoor(game, FLOOR)).toBe(true);
  });
});

/**
 * drainerBonus hands over a potion while the roll comes in under the floor it counts plus 175,
 * and the key the floor is labelled with otherwise. The floor it counts on an endless floor is
 * the deepest one Module V has itself, so the key is as likely on floor 250 as on floor 105 —
 * where the game's own arithmetic would have counted floor 250, put the roll out of reach, and
 * handed over a potion every time.
 */
const KEY_ROLL = FAITHFUL_BOTTOM + 175;
const POTION_ROLL = KEY_ROLL - 1;

describe('a level drainer killed far below the bottom of the game', () => {
  const drainerKilledOn = (level: number, roll: number): Game => {
    const game = gameOn(level);
    game.rng = { random: (range) => (range === 375 ? roll : 0) };
    drainerBonus(game);
    return game;
  };

  it('still carries the key labelled for the floor it was killed on', () => {
    const game = drainerKilledOn(DEEP_FLOOR, KEY_ROLL);
    expect(game.events).toContainEqual({ kind: 'found', find: { what: 'key', key: DEEP_FLOOR } });
    expect(explainTrapdoor(game, DEEP_FLOOR)).toBe(true);
  });

  it('carries a potion on the roll just under the odds the bottom floor has', () => {
    const game = drainerKilledOn(DEEP_FLOOR, POTION_ROLL);
    expect(game.events.map((event) => (event.kind === 'found' ? event.find.what : event.kind))).toEqual(['potion']);
  });

  it('carries a potion every time under the rules of the game itself', () => {
    const game = newGame({ pc: { level: DEEP_FLOOR, module: MODULE_V } });
    game.rng = { random: (range) => (range === 375 ? 374 : 0) };
    drainerBonus(game);
    expect(game.events.map((event) => (event.kind === 'found' ? event.find.what : event.kind))).toEqual(['potion']);
  });
});
