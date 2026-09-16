import { describe, expect, it } from 'vitest';
import { UNFORGIVEN_MAP, type MapSquare } from '../../map/game';
import { monsterById } from '../../map/stocking';
import { BOSS_KIND, drawnMonsters, FloorMonsters, loadLevelMap } from '../../play/floor';
import { viewMonsters } from '../../play/view-scene';
import { viewPictures } from '../../play/view3d/browser';
import { bundledDungeon } from '../dungeon';
import { killMonster } from '../port/kills';
import { BorlandRng } from '../port/rng';
import { FAITHFUL_RULES } from '../port/rules';
import { newGame, setMonsterMap, type Game, type PlayerCharacter } from '../port/state';
import { endlessRules } from './rules';
import { shadowLoot, wanderingShadow } from './shadows';
import { endlessStateOf, type EndlessState } from './state';

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

/** A floor of {@link SEED}'s Module V that the world stands a wandering Shadow on, and one of
 *  the hundred floors under it that it does not. */
const WANDERED_FLOOR = 505;
const PLAIN_FLOOR = 506;

/** What an endless character carries before anything has happened to it. */
function carryingNothing(): EndlessState {
  return {
    keys: new Set(),
    bossSquares: new Map(),
    bossesKilled: new Set(),
    wanderer: null,
    shadowKilledOn: 0,
  };
}

describe('the Shadows wandering the floors below the bottom of the game', () => {
  /** Five thousand floors of one world, which is two hundred sections' worth. */
  const floors = Array.from({ length: 5000 }, (unused, index) => 106 + index);
  const drawn = floors.map((floor) => wanderingShadow(carryingNothing(), SEED, floor));

  it('stand on about one floor in a hundred', () => {
    const standing = drawn.filter((shadow) => shadow !== null).length;
    expect(standing).toBeGreaterThan(floors.length / 150);
    expect(standing).toBeLessThan(floors.length / 60);
  });

  it("are the twenty Shadow bosses the game has, and a floor's own is one world's answer for all", () => {
    for (const shadow of drawn) {
      if (shadow === null) continue;
      expect(monsterById(shadow.kind.id).isBoss, shadow.kind.id).toBe(true);
    }
    expect(wanderingShadow(carryingNothing(), SEED, WANDERED_FLOOR)?.kind).toEqual(
      wanderingShadow(carryingNothing(), SEED, WANDERED_FLOOR)?.kind,
    );
    expect(wanderingShadow(carryingNothing(), SEED + 1, WANDERED_FLOOR)?.kind).not.toEqual(
      wanderingShadow(carryingNothing(), SEED, WANDERED_FLOOR)?.kind,
    );
  });

  it('are one at a time: a floor whose own draw stands one keeps it to itself', () => {
    const state = carryingNothing();
    expect(wanderingShadow(state, SEED, WANDERED_FLOOR)).not.toBeNull();

    state.wanderer = { floor: WANDERED_FLOOR - 1, x: 40, y: 50 };

    expect(wanderingShadow(state, SEED, WANDERED_FLOOR)).toBeNull();
  });

  it('are found where they were left while they are alive', () => {
    const state = carryingNothing();
    state.wanderer = { floor: WANDERED_FLOOR, x: 40, y: 50 };

    expect(wanderingShadow(state, SEED, WANDERED_FLOOR)?.lastSeen).toEqual({ x: 40, y: 50 });
  });

  it('stand up again only below the floor the last one was killed on', () => {
    const state = carryingNothing();
    state.shadowKilledOn = WANDERED_FLOOR;

    expect(wanderingShadow(state, SEED, WANDERED_FLOOR)).toBeNull();
    expect(drawn.filter((shadow, index) => shadow !== null && floors[index] > WANDERED_FLOOR).length).toBeGreaterThan(0);
  });

  it('leave the floors the game itself has, and the modules it turns the character back out of, alone', () => {
    const pc = newGame({ rules }).pc;
    for (const floor of [5, 50, 100, 105]) expect(rules.deepShadows?.on(pc, MODULE_V, floor), `floor ${floor}`).toBeNull();
    for (const module of [0, 1, 2, 3]) expect(rules.deepShadows?.on(pc, module, WANDERED_FLOOR), `module ${module}`).toBeNull();
  });

  it("pass over a section's last floor, where its own Shadow boss is standing", () => {
    const pc = newGame({ rules }).pc;
    const bossFloors = Array.from({ length: 200 }, (unused, index) => BOSS_FLOOR + index * 25);
    for (const floor of bossFloors) {
      expect(rules.deepShadows?.on(pc, MODULE_V, floor), `floor ${floor}`).toBeNull();
    }
  });
});

describe('arriving on a floor a Shadow is wandering', () => {
  it('stands it in slot 0 in the Shadow row, in the middle of the floor', () => {
    const game = gameOn(WANDERED_FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(WANDERED_FLOOR), WANDERED_FLOOR, game.rng);

    const shadow = game.monsters[0];
    expect(shadow.type).toBe(BOSS_KIND);
    expect(standingOn(game)).toBe(true);
    expect(shadow.x).toBeGreaterThanOrEqual(25);
    expect(shadow.x).toBeLessThanOrEqual(74);
    // The hit points carry a Shadow boss's bonus of twenty times the level the floor rolls its
    // monsters around, and the level is that level, nudged a step or two.
    const baseLevel = rules.monsterLevel(MODULE_V, WANDERED_FLOOR);
    expect(shadow.hp).toBeGreaterThan(20 * baseLevel);
    expect(Math.abs(shadow.level - baseLevel)).toBeLessThan(50);
  });

  it('leaves the floor under it to its own monsters', () => {
    const game = gameOn(PLAIN_FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(PLAIN_FLOOR), PLAIN_FLOOR, game.rng);

    expect(standingOn(game)).toBe(false);
  });

  it('remembers where it was put down, and puts it back within seven squares next time', () => {
    const game = gameOn(WANDERED_FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(WANDERED_FLOOR), WANDERED_FLOOR, game.rng);
    const first = { x: game.monsters[0].x, y: game.monsters[0].y };
    expect(endlessStateOf(game.pc).wanderer).toEqual({ floor: WANDERED_FLOOR, ...first });

    loadLevelMap(game, new FloorMonsters(), floorRows(WANDERED_FLOOR), WANDERED_FLOOR, game.rng);

    const again = game.monsters[0];
    expect(again.type).toBe(BOSS_KIND);
    expect(Math.abs(again.x - first.x)).toBeLessThanOrEqual(7);
    expect(Math.abs(again.y - first.y)).toBeLessThanOrEqual(7);
  });

  it('has a picture for it, which lives in the file of the section it was borrowed from', () => {
    const game = gameOn(WANDERED_FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(WANDERED_FLOOR), WANDERED_FLOOR, game.rng);
    const pictures = viewPictures(rules.pictureFiles(rules.sectionOf(MODULE_V, WANDERED_FLOOR)));

    for (const monster of viewMonsters(drawnMonsters(game))) {
      const where = `picture ${monster.picnum} of section ${monster.section}`;
      expect(pictures.monster(monster.picnum, monster.builtin, monster.section), where).not.toBeNull();
    }
  });

  it('leaves the record itself carrying nothing about it', () => {
    const game = gameOn(WANDERED_FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(WANDERED_FLOOR), WANDERED_FLOOR, game.rng);

    expect(game.pc.bossX.every((x) => x === 0)).toBe(true);
    expect(game.pc.bossY.every((y) => y === 0)).toBe(true);
  });
});

describe('killing the Shadow wandering a floor', () => {
  /** A monk standing over the Shadow wandering its floor, the floor rolled around him. */
  function facingTheWanderer(): Game {
    const game = gameOn(WANDERED_FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(WANDERED_FLOOR), WANDERED_FLOOR, game.rng);
    expect(game.monsters[0].type).toBe(BOSS_KIND);
    game.engaged = 0;
    return game;
  }

  it('writes down the floor it fell on and lets the next one stand up below that', async () => {
    const game = facingTheWanderer();

    await killMonster(game);

    const state = endlessStateOf(game.pc);
    expect(state.wanderer).toBeNull();
    expect(state.shadowKilledOn).toBe(WANDERED_FLOOR);
    expect(rules.deepShadows?.on(game.pc, MODULE_V, WANDERED_FLOOR)).toBeNull();
  });

  it('leaves the section it was standing in with its own Shadow boss still to kill', async () => {
    const game = facingTheWanderer();

    await killMonster(game);

    expect([...endlessStateOf(game.pc).bossesKilled]).toEqual([]);
    expect(rules.bossBeaten(game.pc, rules.sectionOf(MODULE_V, WANDERED_FLOOR))).toBe(false);
  });

  it('tells the journal a Shadow was killed, which is what the deepest-Shadow board reads', async () => {
    const game = facingTheWanderer();

    await killMonster(game);

    const killed = game.events.find((event) => event.kind === 'killed');
    expect(killed).toMatchObject({ kind: 'killed', monster: { type: BOSS_KIND } });
  });

  it('hands over the pile that floor was worth', async () => {
    const game = facingTheWanderer();
    const loot = shadowLoot(SEED, WANDERED_FLOOR);

    await killMonster(game);

    expect(potionsFound(game)).toBe(counted(loot.potions));
    expect(game.messages).toContain('  THE SHADOW LEAVES BEHIND:');
  });
});
