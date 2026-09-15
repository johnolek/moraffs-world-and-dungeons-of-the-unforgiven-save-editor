import { describe, expect, it } from 'vitest';
import { bundledDungeon } from '../game/dungeon';
import { spellIndex } from '../game/port/inventory';
import { savePlayer } from '../game/port/record';
import { BorlandRng } from '../game/port/rng';
import { sectionInfo } from '../game/sections';
import { BorlandRand, HEIGHT, WIDTH } from '../game/unfmap.js';
import { MAP_PLAYER, monsterAt, newGame, type Game, type PlayerCharacter } from '../game/port/state';
import { monsterById, MONSTER_SLOTS } from '../map/stocking';
import { newCharacterFile } from '../roller/save-file';
import { GameSession, runMoveControl, startGame, type CharacterFile } from './engine';
import { drawnMonsters, FloorMonsters, loadLevelMap, monsterIdOf, monsterTypeOf } from './floor';
import { KEY } from './keys';
import { floorMonsterKinds } from './panel';

const floorOf = (module: number, level: number) => bundledDungeon.floor(level, module);

/** A game standing on an open square of the floor, the way one arrives on it. */
function gameOn(level: number, module = 0, clock: (() => number) | null = null): Game {
  const game = newGame({
    rng: new BorlandRng(7),
    clock,
    pc: { level, module, x: 40, y: 50 },
    solid: (x, y, floor, dungeon) => bundledDungeon.solid(x, y, floor, dungeon),
    retdwall: (x, y, hv, floor, dungeon) => bundledDungeon.side(x, y, hv as 0 | 1, floor, dungeon),
  });
  const rows = floorOf(module, level);
  while (rows[game.pc.y][game.pc.x].solid) game.pc.x += 1;
  return game;
}

describe('the type a stocked monster is', () => {
  it('is the row of the loaded table its id names', () => {
    expect(monsterTypeOf('builtin-0')).toBe(0);
    expect(monsterTypeOf('builtin-21')).toBe(21);
    expect(monsterTypeOf('section-3-22')).toBe(22);
    expect(monsterTypeOf('section-12-26')).toBe(26);
  });

  it('reads back as the id the stocking knows', () => {
    expect(monsterIdOf(5, 3)).toBe('builtin-5');
    expect(monsterIdOf(26, 3)).toBe('section-3-26');
  });
});

describe('stocking a floor', () => {
  it('fills all 145 slots and puts each one on the occupancy grid', () => {
    const game = gameOn(3);
    const floors = new FloorMonsters();
    loadLevelMap(game, floors, floorOf(0, 3), 3, game.rng);
    expect(game.monsters).toHaveLength(MONSTER_SLOTS);
    for (let slot = 0; slot < MONSTER_SLOTS; slot++) {
      const monster = game.monsters[slot];
      expect(monster.hp).toBeGreaterThan(0);
      expect(monsterAt(game, monster.x, monster.y)).toBe(slot);
    }
  });

  it('never stocks a monster on the square the character stands on', () => {
    for (let level = 1; level <= 6; level++) {
      const game = gameOn(level);
      const floors = new FloorMonsters();
      loadLevelMap(game, floors, floorOf(0, level), level, game.rng);
      expect(monsterAt(game, game.pc.x, game.pc.y)).toBe(MAP_PLAYER);
    }
  });

  it('leaves the town empty', () => {
    const game = gameOn(0);
    const floors = new FloorMonsters();
    loadLevelMap(game, floors, floorOf(0, 0), 0, game.rng);
    expect(drawnMonsters(game, 0)).toEqual([]);
  });

  it('loads the monster descriptions of the floor’s own section', () => {
    const game = gameOn(3);
    const floors = new FloorMonsters();
    loadLevelMap(game, floors, floorOf(0, 3), 3, game.rng);
    expect(game.monsterKinds[22].name).toBe('SHADOW GARGALON');
    loadLevelMap(game, floors, floorOf(0, 8), 8, game.rng);
    expect(game.monsterKinds[22].name).not.toBe('SHADOW GARGALON');
  });
});

describe('stocking a floor on the clock', () => {
  /** What the tick counter reads all through one stocking, which is what it does in a game: the
   *  counter moves 18.2 times a second and a floor is stocked in far less than that. */
  const TICK = 5000;

  /**
   * The square one seed draws: `rand * 80` across and `rand * 110` down, which are stock_level's
   * two rolls (exe 2000:6988 and 2000:69bc) off the srand above them.
   */
  function squareFromSeed(seed: number): { x: number; y: number } {
    const rolls = new BorlandRand(seed & 0xffff);
    return { x: rolls.random(WIDTH), y: rolls.random(HEIGHT) };
  }

  function stocked(clock: (() => number) | null, level = 3): Game {
    const game = gameOn(level, 0, clock);
    loadLevelMap(game, new FloorMonsters(), floorOf(0, level), level, game.rng);
    return game;
  }

  const stockedOnTheClock = (level = 3) => stocked(() => TICK, level);

  /** How far apart two squares are, taking the shorter way round each edge. */
  function apart(from: { x: number; y: number }, to: { x: number; y: number }): number {
    const across = Math.abs(to.x - from.x);
    const down = Math.abs(to.y - from.y);
    return Math.max(Math.min(across, WIDTH - across), Math.min(down, HEIGHT - down));
  }

  it('puts every slot on the square srand(clock + slot + try) draws', () => {
    const game = stockedOnTheClock();
    // stock_level counts the tries the whole floor takes from 10 and raises the count before each
    // of them, so the first try of slot 0 is the eleventh and every later slot goes on from
    // wherever the slot before it stopped.
    let tries = 10;
    for (let slot = 0; slot < MONSTER_SLOTS; slot++) {
      const monster = game.monsters[slot];
      const before = tries;
      while (tries < before + 60) {
        tries += 1;
        const square = squareFromSeed(TICK + slot + tries);
        if (square.x === monster.x && square.y === monster.y) break;
      }
      expect({ slot, ...squareFromSeed(TICK + slot + tries) }).toEqual({ slot, x: monster.x, y: monster.y });
    }
  });

  it('lands the first monster where seed 5011 says, worked out by hand', () => {
    // srand(5011) leaves the generator's state at 5011 * 0x015A4E35 + 1, whose bits 16 to 30 are
    // 31400, and the next state's are 1016. Scaled to 80 across and 110 down those are 76 and 3.
    expect(squareFromSeed(TICK + 0 + 11)).toEqual({ x: 76, y: 3 });
    const game = stockedOnTheClock();
    expect({ x: game.monsters[0].x, y: game.monsters[0].y }).toEqual({ x: 76, y: 3 });
  });

  it("draws each slot's type, level and hit points off the rolls the game draws them off", () => {
    // Random (exe 2000:4156) seeds itself from the running total at DS:c609 plus a reading of the
    // clock and adds another reading to the total afterwards, so the type roll of each slot is
    // seeded one tick further on than the slot before it. newGame starts that total the way main
    // does, off the sitting's own generator scaled to 0..1999.
    expect(new BorlandRand(7).random(2000)).toBe(147);
    const game = stockedOnTheClock();

    // Slot 0 takes the eleventh try, at 76 across and 3 down, and get_mtype's Random(20) then runs
    // off 147 + 5000. It comes up 7 rather than the 1 a puffball takes, and the inline 7, 15 and
    // 12 rolls under it come up 0, 8 and 7, none of them 1 either, so the slot is the section
    // regular rand(3) = 1 names: type 24, ten hit points a level. Its two hit point rolls out of
    // the 31 values level 3 allows are 12 and 0, averaged as (12 + 0 + 2) / 2, and the first level
    // test comes up 1, which leaves the floor's own level 3 alone.
    const regular = new BorlandRand(147 + 5000);
    expect([regular.random(20), regular.random(7), regular.random(15), regular.random(12), regular.random(3)]).toEqual([
      7, 0, 8, 7, 1,
    ]);
    expect([regular.random(31), regular.random(31), regular.random(3)]).toEqual([12, 0, 1]);
    expect(game.monsters[0]).toEqual({ x: 76, y: 3, type: 24, level: 3, hp: 7 });

    // Slot 2 takes the twenty-first try, at 6 across and 104 down, and its Random(20) runs off
    // 147 + 3 * 5000. That one does come up 1, so the type is the puffball rand(12) = 3 names,
    // type 5, whose two hit points a level leave 7 values for each of its rolls: 1 and 6, averaged
    // as (1 + 6 + 2) / 2. Then the level test comes up 0, the nudge under it comes up 0 for a step
    // of -1, and the next test comes up 1 and stops it, so the level is 2 on a level 3 floor.
    const puffball = new BorlandRand(147 + 3 * 5000);
    expect([puffball.random(20), puffball.random(12)]).toEqual([1, 3]);
    expect([puffball.random(7), puffball.random(7)]).toEqual([1, 6]);
    expect([puffball.random(3), puffball.random(3), puffball.random(3)]).toEqual([0, 0, 1]);
    expect(game.monsters[2]).toEqual({ x: 6, y: 104, type: 5, level: 2, hp: 4 });
  });

  it('walks the monsters across the floor in diagonal stripes rather than scattering them', () => {
    const striped = stockedOnTheClock().monsters;
    const scattered = stocked(null).monsters;
    const shortSteps = (monsters: typeof striped) =>
      monsters.filter((monster, slot) => slot > 0 && apart(monsters[slot - 1], monster) <= 6).length;

    expect(shortSteps(striped)).toBeGreaterThan(MONSTER_SLOTS - 30);
    expect(shortSteps(scattered)).toBeLessThan(30);
  });
});

describe('going back to a floor', () => {
  it('finds the monsters where they were left, minus the ones that died', () => {
    const game = gameOn(3);
    const floors = new FloorMonsters();
    loadLevelMap(game, floors, floorOf(0, 3), 3, game.rng);
    const before = game.monsters.map((monster) => ({ ...monster }));
    game.monsters[4].hp = 0;
    loadLevelMap(game, floors, floorOf(0, 4), 4, game.rng);
    loadLevelMap(game, floors, floorOf(0, 3), 3, game.rng);
    expect(game.monsters[0]).toEqual(before[0]);
    expect(monsterAt(game, before[0].x, before[0].y)).toBe(0);
    expect(monsterAt(game, before[4].x, before[4].y)).toBe(-1);
  });

  it('remembers three floors and rolls the fourth again', () => {
    const game = gameOn(3);
    const floors = new FloorMonsters();
    for (const level of [3, 4, 5]) loadLevelMap(game, floors, floorOf(0, level), level, game.rng);
    expect(floors.remembered).toEqual([5, 4, 3]);
    const before = game.monsters.map((monster) => ({ ...monster }));
    loadLevelMap(game, floors, floorOf(0, 6), 6, game.rng);
    expect(floors.remembered).toEqual([6, 5, 4]);
    loadLevelMap(game, floors, floorOf(0, 3), 3, game.rng);
    expect(game.monsters[0]).not.toEqual(before[0]);
  });
});

describe('the hit points a monster was stocked with', () => {
  it('is the roll, whatever the monster has left', () => {
    const game = gameOn(3);
    const floors = new FloorMonsters();
    loadLevelMap(game, floors, floorOf(0, 3), 3, game.rng);
    const rolled = game.monsters[7].hp;
    expect(rolled).toBeGreaterThan(1);
    game.monsters[7].hp = 1;
    expect(floors.fullHp(7, 1)).toBe(rolled);
  });

  it('is the hit points first seen for a monster the floor was not stocked with', () => {
    const game = gameOn(0);
    const floors = new FloorMonsters();
    loadLevelMap(game, floors, floorOf(0, 0), 0, game.rng);
    Object.assign(game.monsters[0], { x: 40, y: 50, hp: 30, type: 3, level: 2 });
    expect(floors.fullHp(0, 30)).toBe(30);
    expect(floors.fullHp(0, 12)).toBe(30);
  });

  it('is the fresh roll on a floor rolled again', () => {
    const game = gameOn(3);
    const floors = new FloorMonsters();
    loadLevelMap(game, floors, floorOf(0, 3), 3, game.rng);
    const first = floors.fullHp(7, game.monsters[7].hp);
    for (const level of [4, 5, 6, 3]) loadLevelMap(game, floors, floorOf(0, level), level, game.rng);
    expect(game.monsters[7].hp).not.toBe(first);
    expect(floors.fullHp(7, 1)).toBe(game.monsters[7].hp);
  });
});

describe('the monsters the map draws', () => {
  it('is every slot standing on its own square', () => {
    const game = gameOn(3);
    const floors = new FloorMonsters();
    loadLevelMap(game, floors, floorOf(0, 3), 3, game.rng);
    expect(drawnMonsters(game, 3)).toHaveLength(MONSTER_SLOTS);
    const drawn = drawnMonsters(game, 3)[0];
    expect(drawn.monsterId.startsWith('builtin-') || drawn.monsterId.startsWith('section-1-')).toBe(true);
  });
});

/**
 * The Shadow Ogeroth, section 20's boss, who stands on floor 100 of module V. He is the one boss
 * whose floor is not the bottom of its module, so a character can arrive on it every way there
 * is: down a ladder, down a chute or a trap door, by a spell, or by starting there.
 */
const OGEROTH_FLOOR = 100;
const MODULE_V = 4;

/** MAJOR DESCEND, the twenty-fourth preparation spell, which is the eighth line's third slot,
 *  and the letter it sits under in the thirty-spell table. */
const MAJOR_DESCEND = spellIndex(1, 7, 2);
const SPELL_X = 0x78;

/** The menu line cast_a_spell puts the preparation spells on. */
const PREPARATION_SPELLS = 0x32;

/** A character file that lives in the test rather than in the roster. The hit points are a
 *  wall, because floor 100's monsters would kill anything less before it could look around. */
function characterFile(overrides: Partial<PlayerCharacter> = {}): CharacterFile {
  const pc = { ...newGame().pc, name: 'BOSSHUNT', hp: 30000, maxHp: 30000, ...overrides };
  return { bytes: savePlayer(pc, newCharacterFile(pc)), write() {}, died() {} };
}

/** A session with the loop running, waiting for its first key. */
function playing(file: CharacterFile): GameSession {
  const session = startGame(file, new BorlandRng(7));
  void runMoveControl(session);
  return session;
}

async function press(session: GameSession, ...keys: number[]): Promise<void> {
  for (const key of keys) {
    session.press(key);
    await new Promise((resolve) => setTimeout(resolve));
  }
}

/** The first open square of a floor of module V, for a character to be put down on. */
function openSquare(level: number): { x: number; y: number } {
  const rows = floorOf(MODULE_V, level);
  for (let y = 1; y < 109; y++) {
    for (let x = 1; x < 79; x++) {
      if (!rows[y][x].solid) return { x, y };
    }
  }
  throw new Error(`floor ${level} of module V has no open square`);
}

/** A square of floor 99 with a ladder that goes down to the Shadow Ogeroth's floor. */
function ladderDownToTheBoss(): { x: number; y: number } {
  const level = OGEROTH_FLOOR - 1;
  const rows = floorOf(MODULE_V, level);
  for (let y = 1; y < 109; y++) {
    for (let x = 1; x < 79; x++) {
      if (rows[y][x].solid) continue;
      if (bundledDungeon.ladder(x, y, level, MODULE_V) === 1) return { x, y };
    }
  }
  throw new Error('floor 99 of module V has no ladder down');
}

/** Whether the section's Shadow boss is standing on the floor the character is on. */
function bossIsOnTheFloor(session: GameSession): boolean {
  const name = sectionInfo(session.game.pc.module, session.game.pc.level)?.bossName;
  return drawnMonsters(session.game, session.game.pc.level).some(
    (monster) => monsterById(monster.monsterId).name === name,
  );
}

describe('the section boss on his floor', () => {
  it('is the Shadow Ogeroth on floor 100 of module V', () => {
    expect(sectionInfo(MODULE_V, OGEROTH_FLOOR)).toMatchObject({
      section: 20,
      bossFloor: OGEROTH_FLOOR,
      bossName: 'Shadow Ogeroth',
    });
  });

  it('stands there for a character who starts the game on it', () => {
    const session = playing(characterFile({ module: MODULE_V, level: OGEROTH_FLOOR, ...openSquare(OGEROTH_FLOOR) }));
    expect(bossIsOnTheFloor(session)).toBe(true);
  });

  it('stands there after a ladder down onto it', async () => {
    const session = playing(characterFile({ module: MODULE_V, level: OGEROTH_FLOOR - 1, ...ladderDownToTheBoss() }));
    expect(bossIsOnTheFloor(session)).toBe(false);
    await press(session, KEY.down);
    expect(session.game.pc.level).toBe(OGEROTH_FLOOR);
    expect(bossIsOnTheFloor(session)).toBe(true);
  });

  it('stands there after Major Descend has dropped the character onto it', async () => {
    const spellbook = Array.from({ length: 180 }, () => 0);
    spellbook[MAJOR_DESCEND] = 1;
    const session = playing(
      characterFile({
        module: MODULE_V,
        level: OGEROTH_FLOOR - 10,
        cls: 3,
        sp: 300,
        maxSp: 300,
        spellbook,
        ...openSquare(OGEROTH_FLOOR - 10),
      }),
    );
    await press(session, KEY.cast, PREPARATION_SPELLS, SPELL_X);
    expect(session.game.pc.level).toBe(OGEROTH_FLOOR);
    expect(bossIsOnTheFloor(session)).toBe(true);
    // The panel is where a player looks for him, and he is too far off to be one of the nearest.
    const listed = floorMonsterKinds(session.game, session.view().monsters);
    expect(listed.map((kind) => kind.name)).toContain('SHADOW OGEROTH');
  });

  it('is put back within seven squares of where he was last seen', () => {
    const session = playing(characterFile({ module: MODULE_V, level: OGEROTH_FLOOR, ...openSquare(OGEROTH_FLOOR) }));
    const pc = session.game.pc;
    // bossIndex(4, 3): module V's fourth section.
    const index = 4 * 8 + 3;
    let last = { x: pc.bossX[index], y: pc.bossY[index] };
    expect(last).toEqual({ x: session.game.monsters[0].x, y: session.game.monsters[0].y });

    for (let visit = 0; visit < 4; visit++) {
      // Three other floors push floor 100 out of the three the game remembers, so coming back to
      // it rolls it again.
      for (const level of [99, 98, 97, OGEROTH_FLOOR]) session.enterFloor(level);
      const again = session.game.monsters[0];
      expect(Math.abs(again.x - last.x)).toBeLessThanOrEqual(7);
      expect(Math.abs(again.y - last.y)).toBeLessThanOrEqual(7);
      last = { x: pc.bossX[index], y: pc.bossY[index] };
      expect(last).toEqual({ x: again.x, y: again.y });
    }
  });

  it('is gone for good once that section has been beaten', () => {
    const beaten = [0, 0, 0, 0, 8];
    const session = playing(
      characterFile({ module: MODULE_V, level: OGEROTH_FLOOR, objective: beaten, ...openSquare(OGEROTH_FLOOR) }),
    );
    expect(bossIsOnTheFloor(session)).toBe(false);
    expect(drawnMonsters(session.game, OGEROTH_FLOOR)).toHaveLength(MONSTER_SLOTS);
  });
});
