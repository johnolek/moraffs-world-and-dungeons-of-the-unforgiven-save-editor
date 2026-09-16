import { describe, expect, it } from 'vitest';
import { UNFORGIVEN_MAP, type MapSquare } from '../../map/game';
import { monsterById } from '../../map/stocking';
import { BOSS_KIND, FloorMonsters, loadLevelMap } from '../../play/floor';
import { bundledDungeon } from '../dungeon';
import { killMonster } from '../port/kills';
import { BorlandRng } from '../port/rng';
import { FAITHFUL_RULES } from '../port/rules';
import { newGame, setMonsterMap, type Game, type PlayerCharacter } from '../port/state';
import { endlessRules } from './rules';
import { shadowLoot } from './shadows';

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
function standingOverTheShadow(pc: Partial<PlayerCharacter> = {}): Game {
  const game = newGame({
    rules,
    rng: { random: () => 0 },
    pc: { cls: 2, module: MODULE_V, level: BOSS_FLOOR, hp: 100, maxHp: 100, x: 40, y: 50, ...pc },
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

/** How many potions a pile holds. */
const counted = (potions: number[]): number => potions.reduce((all, one) => all + one, 0);

/** How many potions the run journal was told about, which is one event for each of them. */
function potionsFound(game: Game): number {
  return game.events.filter((event) => event.kind === 'found' && event.find.what === 'potion').length;
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

  it("hands over the potions that floor's Shadow was carrying, and says what they were", async () => {
    const game = standingOverTheShadow();
    const loot = shadowLoot(SEED, BOSS_FLOOR);
    expect(game.pc.potions).toEqual([0, 0, 0, 0, 0, 0]);

    await killMonster(game);

    expect(game.pc.potions).toEqual(loot.potions);
    expect(potionsFound(game)).toBe(counted(loot.potions));
    expect(game.messages).toContain('  THE SHADOW LEAVES BEHIND:');
    expect(game.messages).toContain('  3 ORANGE POTIONS');
  });

  it('puts the orb it was carrying on the weapon in hand', async () => {
    const game = standingOverTheShadow({ weapon: 6, weaponsOwned: [1, 0, 0, 0, 0, 0, 1, 0] });
    expect(shadowLoot(SEED, BOSS_FLOOR).weaponPlus).toBe(200);

    await killMonster(game);

    expect(game.pc.weaponPlus).toEqual([0, 0, 0, 0, 0, 0, 200, 0]);
    expect(game.messages).toContain('  YOUR LONG SWORD IS NOW');
    expect(game.messages).toContain('PLUS 200.');
  });

  it('leaves a weapon that already carries a better plus alone', async () => {
    const plus = [0, 0, 0, 0, 0, 0, 900, 0];
    const game = standingOverTheShadow({ weapon: 6, weaponsOwned: [1, 0, 0, 0, 0, 0, 1, 0], weaponPlus: plus });

    await killMonster(game);

    expect(game.pc.weaponPlus[6]).toBe(900);
    expect(game.messages).toContain('PLUS 900.');
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

describe('what a Shadow of the endless dungeon is carrying', () => {
  /** A thousand floors of one world, which is ten sections' worth of Shadows and enough to see
   *  the shape of the draw. */
  const piles = Array.from({ length: 1000 }, (unused, index) => shadowLoot(SEED, 200 + index));

  it('is the same pile for everybody who kills the Shadow of that floor', () => {
    expect(shadowLoot(SEED, 433)).toEqual(shadowLoot(SEED, 433));
    expect(shadowLoot(SEED, 433)).not.toEqual(shadowLoot(SEED, 434));
    expect(shadowLoot(SEED, 433)).not.toEqual(shadowLoot(SEED + 1, 433));
  });

  it('is between one and twenty potions', () => {
    for (const pile of piles) {
      expect(counted(pile.potions)).toBeGreaterThanOrEqual(1);
      expect(counted(pile.potions)).toBeLessThanOrEqual(20);
    }
  });

  it('is in one colour or spread over several', () => {
    const colours = piles.map((pile) => pile.potions.filter((count) => count > 0).length);
    expect(colours.filter((count) => count === 1).length).toBeGreaterThan(0);
    expect(colours.filter((count) => count > 1).length).toBeGreaterThan(0);
    expect(Math.max(...colours)).toBeLessThanOrEqual(6);
  });

  it('carries an orb about one Shadow in three', () => {
    const orbs = piles.filter((pile) => pile.weaponPlus > 0);
    expect(orbs.length).toBeGreaterThan(piles.length / 5);
    expect(orbs.length).toBeLessThan(piles.length / 2);
    expect(new Set(orbs.map((pile) => pile.weaponPlus))).toEqual(new Set([200, 300, 500]));
  });
});
