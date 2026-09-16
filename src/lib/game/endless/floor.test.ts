import { describe, expect, it } from 'vitest';
import { UNFORGIVEN_MAP, type MapSquare } from '../../map/game';
import { monsterById, MONSTER_SLOTS } from '../../map/stocking';
import { drawnMonsters, FloorMonsters, loadLevelMap } from '../../play/floor';
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
const FAITHFUL_BOTTOM = 105;

const rules = endlessRules({ hard: true, seed: SEED });
const bottom = rules.bottomLevel(MODULE_V);

const floorRows = (level: number): MapSquare[][] => UNFORGIVEN_MAP.floor(level, MODULE_V, bottom);

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

describe('arriving on a floor below the bottom of the game', () => {
  it('loads the monsters of the section the endless section borrowed', () => {
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

  it('stocks monsters the bestiary knows, named for the section they came from', () => {
    const game = gameOn(FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(FLOOR), FLOOR, game.rng);
    const source = rules.sectionSource(rules.sectionOf(MODULE_V, FLOOR));
    const drawn = drawnMonsters(game, FLOOR);
    expect(drawn.length).toBeGreaterThan(0);
    for (const monster of drawn) {
      expect(() => monsterById(monster.monsterId)).not.toThrow();
      const origin = monsterById(monster.monsterId).origin;
      if (origin.kind === 'section') expect(origin.section).toBe(source);
    }
  });

  it('rolls its monsters around the level the floor is deep rather than back round to 1', () => {
    const game = gameOn(FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(FLOOR), FLOOR, game.rng);
    expect(rules.monsterLevel(MODULE_V, FLOOR)).toBe(FLOOR + 60);
    expect(game.monsters.some((monster) => monster.level > 130)).toBe(true);
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
  const deepDoor = (): number => {
    const found = floorRows(FLOOR)
      .flat()
      .find((square) => square.trapdoor > FAITHFUL_BOTTOM);
    if (!found) throw new Error('no trap door leading below the bottom of the game');
    return found.trapdoor;
  };

  it('is shut until the character has the key labelled with the floor it leads to', () => {
    const game = gameOn(FLOOR);
    const destination = deepDoor();
    expect(explainTrapdoor(game, destination)).toBe(false);
    rules.keys.take(game.pc, destination);
    expect(explainTrapdoor(game, destination)).toBe(true);
  });

  it('leaves the record alone for a key the record has no flag for', () => {
    const game = gameOn(FLOOR);
    const destination = deepDoor();
    rules.keys.take(game.pc, destination);
    expect(game.pc.keys.every((flag) => flag === 0)).toBe(true);
  });

  it('has its key handed over by a level drainer killed on the floor it leads to', () => {
    const game = gameOn(FLOOR);
    // drainerBonus hands over a potion while the roll comes in under the floor plus 175, and the
    // key the floor is labelled with otherwise.
    game.rng = { random: () => FLOOR + 175 };
    drainerBonus(game);
    expect(game.events).toContainEqual({ kind: 'found', find: { what: 'key', key: FLOOR } });
    expect(explainTrapdoor(game, FLOOR)).toBe(true);
  });
});
