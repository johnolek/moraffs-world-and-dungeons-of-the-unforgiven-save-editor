import { describe, expect, it } from 'vitest';
import { UNFORGIVEN_MAP, type MapSquare } from '../../map/game';
import { monsterById } from '../../map/stocking';
import { BOSS_KIND, FloorMonsters, loadLevelMap } from '../../play/floor';
import { bundledDungeon } from '../dungeon';
import { killMonster } from '../port/kills';
import { BorlandRng } from '../port/rng';
import { FAITHFUL_RULES } from '../port/rules';
import { newGame, setMonsterMap, type Game } from '../port/state';
import { endlessRules } from './rules';

/** The Shadow boss of section 21, the first section below the bottom of the game, and the floor
 *  he stands on. */
const SEED = 20260915;
const MODULE_V = 4;
const SECTION = 21;
const BOSS_FLOOR = 125;

/** get_choice's answer to the two-line menu a dropped weapon or suit of armor puts up. */
const LEAVE = 0x32;

const rules = endlessRules({ hard: true, seed: SEED });

const floorRows = (level: number): MapSquare[][] =>
  UNFORGIVEN_MAP.floor(level, MODULE_V, rules.bottomLevel(MODULE_V), rules.trapdoorReach(MODULE_V, level));

/** A monk standing over the dead Shadow boss of his section: a monk is refused every drop that
 *  rolls dice of its own, which leaves the kill itself to be read without scripting one. */
function standingOverTheShadow(): Game {
  const game = newGame({
    rules,
    rng: { random: () => 0 },
    pc: { cls: 2, module: MODULE_V, level: BOSS_FLOOR, hp: 100, maxHp: 100, x: 40, y: 50 },
    choice: async () => LEAVE,
    pressAnyKey: () => {},
    delay: () => {},
  });
  Object.assign(game.monsters[3], { x: 11, y: 12, hp: 0, type: BOSS_KIND, level: 40 });
  setMonsterMap(game, 11, 12, 3);
  game.engaged = 3;
  return game;
}

/** A monk standing on an open square of a floor, the way one arrives on it. */
function gameOn(level: number): Game {
  const game = newGame({
    rules,
    rng: new BorlandRng(7),
    pc: { cls: 2, level, module: MODULE_V, hard: 1, x: 40, y: 50 },
    choice: async () => LEAVE,
    pressAnyKey: () => {},
    delay: () => {},
    solid: (x, y, floor, dungeon) => bundledDungeon.solid(x, y, floor, dungeon),
    retdwall: (x, y, hv, floor, dungeon) => bundledDungeon.side(x, y, hv as 0 | 1, floor, dungeon),
  });
  const rows = floorRows(level);
  while (rows[game.pc.y][game.pc.x].solid) game.pc.x += 1;
  return game;
}

/** Whether the section's Shadow boss is standing on the floor the game has stocked, which is
 *  slot 0 of its table. */
function standingOn(game: Game): boolean {
  return monsterById(game.monsterKinds[game.monsters[0].type].id).isBoss;
}

describe('killing the Shadow boss of a section below the bottom of the game', () => {
  it('writes the kill down beside the record, where the record has no bit for it', async () => {
    const game = standingOverTheShadow();
    expect(rules.bossBeaten(game.pc, SECTION)).toBe(false);

    await killMonster(game);

    expect(rules.bossBeaten(game.pc, SECTION)).toBe(true);
    expect(game.pc.objective).toEqual([0, 0, 0, 0, 0]);
    expect(FAITHFUL_RULES.bossBeaten(game.pc, SECTION)).toBe(false);
  });

  it('leaves him off his floor from then on, where he used to stand again every time', async () => {
    const game = gameOn(BOSS_FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(BOSS_FLOOR), BOSS_FLOOR, game.rng);
    expect(standingOn(game)).toBe(true);

    game.engaged = 0;
    await killMonster(game);
    loadLevelMap(game, new FloorMonsters(), floorRows(BOSS_FLOOR), BOSS_FLOOR, game.rng);

    expect(standingOn(game)).toBe(false);
  });

  it('leaves the twenty sections the game has to the reward kill_monster has for them', async () => {
    const game = newGame({
      rules,
      rng: { random: () => 0 },
      pc: { cls: 2, module: 0, level: 5, hp: 100, maxHp: 100 },
      choice: async () => LEAVE,
      pressAnyKey: () => {},
      delay: () => {},
    });
    Object.assign(game.monsters[3], { x: 11, y: 12, hp: 0, type: BOSS_KIND, level: 40 });
    setMonsterMap(game, 11, 12, 3);
    game.engaged = 3;

    await killMonster(game);

    expect(game.pc.objective[0]).toBe(1);
    expect(game.pc.maxHp).toBe(130);
  });
});
