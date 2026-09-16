import { describe, expect, it } from 'vitest';
import { readRecolouredId } from '../../bestiary/monsters';
import { monsterById } from '../../map/stocking';
import { expValue } from '../port/combat';
import { FAITHFUL_RULES } from '../port/rules';
import { newGame } from '../port/state';
import { BOTTOM_LEVEL } from '../unfmap.js';
import { endlessRules, ENDLESS_BOTTOM } from './rules';

/** The hundred sections under the bottom of the game, and one far deeper than anybody will
 *  walk. */
const ENDLESS_SECTIONS = [...Array.from({ length: 100 }, (unused, index) => 21 + index), 1200];

const SEED = 20260915;
const MODULE_IV = 3;
const MODULE_V = 4;

const normal = endlessRules({ hard: false, seed: SEED });
const tough = endlessRules({ hard: true, seed: SEED });

/** Every floor the faithful game itself can put a character on. */
const faithfulFloors = (module: number): number[] =>
  Array.from({ length: BOTTOM_LEVEL[module] + 1 }, (unused, floor) => floor);

describe('an endless dungeon', () => {
  it('bottoms out where the record can no longer say which floor you are on', () => {
    expect(normal.bottomLevel(MODULE_IV)).toBe(ENDLESS_BOTTOM);
    expect(tough.bottomLevel(MODULE_V)).toBe(ENDLESS_BOTTOM);
  });

  it('leaves every module the character can still be turned back out of alone', () => {
    for (const module of [0, 1, 2, 4]) expect(normal.bottomLevel(module)).toBe(BOTTOM_LEVEL[module]);
    for (const module of [0, 1, 2, 3]) expect(tough.bottomLevel(module)).toBe(BOTTOM_LEVEL[module]);
  });
});

describe('the endless section numbering', () => {
  it("carries on where the game's own counting stops, 20 floors at a time under Module IV", () => {
    expect(normal.sectionOf(MODULE_IV, 80)).toBe(16);
    expect(normal.sectionOf(MODULE_IV, 81)).toBe(21);
    expect(normal.sectionOf(MODULE_IV, 100)).toBe(21);
    expect(normal.sectionOf(MODULE_IV, 101)).toBe(22);
    expect(normal.sectionOf(MODULE_IV, 120)).toBe(22);
    expect(normal.sectionOf(MODULE_IV, 121)).toBe(23);
  });

  it("counts 25 floors at a time under Module V, which is that module's own stride", () => {
    expect(tough.sectionOf(MODULE_V, 100)).toBe(20);
    expect(tough.sectionOf(MODULE_V, 101)).toBe(21);
    expect(tough.sectionOf(MODULE_V, 125)).toBe(21);
    expect(tough.sectionOf(MODULE_V, 126)).toBe(22);
    expect(tough.sectionOf(MODULE_V, 150)).toBe(22);
    expect(tough.sectionOf(MODULE_V, 151)).toBe(23);
  });

  it('puts every floor above the first new section in the section the game puts it in', () => {
    for (const [endless, firstEndlessFloor] of [
      [normal, 81],
      [tough, 101],
    ] as const) {
      for (const module of [0, 1, 2, 3, 4]) {
        for (const floor of faithfulFloors(module)) {
          if (floor >= firstEndlessFloor) continue;
          expect(endless.sectionOf(module, floor), `module ${module} floor ${floor}`).toBe(
            FAITHFUL_RULES.sectionOf(module, floor),
          );
        }
      }
    }
  });

  it("takes over the handful of floors the module's own last section ran past", () => {
    // Module IV stops counting sections at floor 80 and goes on to 85, and Module V stops at 100
    // and goes on to 105. Those last floors belong to the first new section rather than to the
    // module's fourth, which is what makes the new sections a clean 20 and 25 floors each.
    for (const floor of [81, 85]) {
      expect(FAITHFUL_RULES.sectionOf(MODULE_IV, floor)).toBe(16);
      expect(normal.sectionOf(MODULE_IV, floor), `floor ${floor}`).toBe(21);
    }
    for (const floor of [101, 105]) {
      expect(FAITHFUL_RULES.sectionOf(MODULE_V, floor)).toBe(20);
      expect(tough.sectionOf(MODULE_V, floor), `floor ${floor}`).toBe(21);
    }
  });

  it('stands its Shadow boss on the last floor of the section', () => {
    expect(normal.sectionPlace(21)).toEqual({ module: MODULE_IV, part: 5, bossFloor: 100 });
    expect(normal.sectionPlace(23)).toEqual({ module: MODULE_IV, part: 7, bossFloor: 140 });
    expect(tough.sectionPlace(21)).toEqual({ module: MODULE_V, part: 5, bossFloor: 125 });
  });

  it("leaves the twenty sections of the game where the game's own table has them", () => {
    for (let section = 1; section <= 20; section += 1) {
      expect(tough.sectionPlace(section), `section ${section}`).toEqual(FAITHFUL_RULES.sectionPlace(section));
    }
  });
});

describe('an endless section', () => {
  it("borrows one of the game's own twenty for its pictures and its words", () => {
    for (const section of ENDLESS_SECTIONS) {
      const source = tough.sectionSource(section);
      expect(source, `section ${section}`).toBeGreaterThanOrEqual(1);
      expect(source, `section ${section}`).toBeLessThanOrEqual(20);
      expect(tough.pictureFiles(section)).toEqual(FAITHFUL_RULES.pictureFiles(source));
    }
  });

  it('borrows the same one for everybody playing the same world', () => {
    const again = endlessRules({ hard: true, seed: SEED });
    for (const section of [21, 37, 433]) expect(again.sectionSource(section)).toBe(tough.sectionSource(section));
  });

  it('borrows a different one in a world seeded differently', () => {
    const elsewhere = endlessRules({ hard: true, seed: SEED + 1 });
    const sections = Array.from({ length: 40 }, (unused, index) => 21 + index);
    expect(sections.map((section) => elsewhere.sectionSource(section))).not.toEqual(
      sections.map((section) => tough.sectionSource(section)),
    );
  });

  it('is its own source for the twenty the game describes itself', () => {
    for (let section = 1; section <= 20; section += 1) expect(tough.sectionSource(section)).toBe(section);
  });
});

describe("an endless section's five monsters", () => {
  /** The rows of the loaded table the five fill, and the two marks the game's own rules go
   *  looking for: special 100 is a Shadow boss, and a level drainer is the one of the five that
   *  takes a level or an armful of experience off the character when it hits. */
  const BOSS_SLOT = 22;
  const REGULAR_SLOTS = [23, 24, 25];
  const DRAINER_SLOT = 26;
  const BOSS_SPECIAL = 100;

  const rowOf = (section: number, slot: number) => tough.monsterKinds(section)[slot];

  it('stand after the 22 the game keeps loaded whatever section you are in', () => {
    for (const section of ENDLESS_SECTIONS) {
      expect(tough.monsterKinds(section), `section ${section}`).toHaveLength(27);
      expect(tough.monsterKinds(section).slice(0, BOSS_SLOT), `section ${section}`).toEqual(
        FAITHFUL_RULES.monsterKinds(1).slice(0, BOSS_SLOT),
      );
    }
  });

  it('are a Shadow boss, three regulars and one level drainer', () => {
    for (const section of ENDLESS_SECTIONS) {
      expect(rowOf(section, BOSS_SLOT).special, `section ${section} boss`).toBe(BOSS_SPECIAL);
      expect(rowOf(section, DRAINER_SLOT).levelDrain, `section ${section} drainer`).not.toBe(0);
      for (const slot of REGULAR_SLOTS) {
        expect(rowOf(section, slot).special, `section ${section} slot ${slot}`).not.toBe(BOSS_SPECIAL);
        expect(rowOf(section, slot).levelDrain, `section ${section} slot ${slot}`).toBe(0);
      }
    }
  });

  it('never stand the same regular in the section twice', () => {
    for (const section of ENDLESS_SECTIONS) {
      const regulars = REGULAR_SLOTS.map((slot) => rowOf(section, slot).id);
      expect(new Set(regulars).size, `section ${section}`).toBe(REGULAR_SLOTS.length);
    }
  });

  it('are the same five for everybody playing the same world', () => {
    const again = endlessRules({ hard: true, seed: SEED });
    for (const section of ENDLESS_SECTIONS) {
      expect(again.monsterKinds(section), `section ${section}`).toEqual(tough.monsterKinds(section));
    }
  });

  it('are other monsters in a world seeded differently', () => {
    const elsewhere = endlessRules({ hard: true, seed: SEED + 1 });
    expect(elsewhere.monsterKinds(22)).not.toEqual(tough.monsterKinds(22));
  });

  it('are painted in a colour set other than the one the game paints them in', () => {
    for (const section of ENDLESS_SECTIONS) {
      for (const slot of [...REGULAR_SLOTS, DRAINER_SLOT]) {
        const id = rowOf(section, slot).id;
        const painted = readRecolouredId(id);
        expect(painted, `section ${section} slot ${slot}`).not.toBeNull();
        expect(monsterById(id).colorSet, id).not.toBe(monsterById(painted!.id).colorSet);
      }
    }
  });

  it('leave the Shadow boss the colours that make him a shadow', () => {
    for (const section of ENDLESS_SECTIONS) {
      expect(readRecolouredId(rowOf(section, BOSS_SLOT).id), `section ${section}`).toBeNull();
    }
  });

  it("are the game's own five, byte for byte, in the twenty sections the game has", () => {
    for (let section = 1; section <= 20; section += 1) {
      expect(tough.monsterKinds(section), `section ${section}`).toEqual(FAITHFUL_RULES.monsterKinds(section));
    }
  });
});

describe('an endless floor', () => {
  it('goes on rolling its monsters deeper rather than round to level 1 at 221', () => {
    expect(tough.monsterLevel(MODULE_V, 160)).toBe(220);
    expect(FAITHFUL_RULES.monsterLevel(MODULE_V, 161)).toBe(1);
    expect(tough.monsterLevel(MODULE_V, 161)).toBe(221);
    expect(tough.monsterLevel(MODULE_V, 1000)).toBe(1060);
  });

  it('never puts a monster back to level 1 for standing too deep', () => {
    expect(tough.monsterLevelMax).toBeGreaterThanOrEqual(tough.monsterLevel(MODULE_V, ENDLESS_BOTTOM));
  });

  it('answers for the floors of a module it has nothing to do with the way the game does', () => {
    for (const floor of faithfulFloors(1)) expect(tough.monsterLevel(1, floor)).toBe(FAITHFUL_RULES.monsterLevel(1, floor));
  });
});

describe('the experience an endless kill is worth', () => {
  const killOf = (level: number, rules = tough) => {
    const game = newGame({ rules });
    game.monsters[0] = { x: 0, y: 0, hp: 1, type: 22, level };
    return expValue(game, 0);
  };

  it('goes on growing past the level the game stops counting at', () => {
    expect(killOf(200)).toBeGreaterThan(killOf(130));
    expect(killOf(1000)).toBeGreaterThan(killOf(200));
  });

  it('is still a number at the deepest level the arithmetic reaches', () => {
    expect(Number.isFinite(killOf(tough.experienceCap))).toBe(true);
    expect(Number.isFinite(killOf(tough.experienceCap + 1000))).toBe(true);
  });

  it('pays a faithful game exactly what the game pays', () => {
    expect(killOf(200, FAITHFUL_RULES)).toBe(killOf(130, FAITHFUL_RULES));
  });
});

describe('a trap door key past the floors the record has flags for', () => {
  it('is kept beside the record rather than in it', () => {
    const pc = newGame({ rules: tough }).pc;
    const deep = 4000;
    expect(tough.keys.foundOn(deep)).toBe(true);
    expect(tough.keys.flag(pc, deep)).toBe(0);
    tough.keys.take(pc, deep);
    expect(tough.keys.flag(pc, deep)).toBe(1);
    expect(pc.keys).toHaveLength(36);
    expect(pc.keys.every((flag) => flag === 0)).toBe(true);
  });

  it('goes in the record where the record still has room', () => {
    const pc = newGame({ rules: tough }).pc;
    tough.keys.take(pc, 120);
    expect(pc.keys[24]).toBe(1);
  });

  it('opens every trap door to the same five floors, the way the record does', () => {
    const pc = newGame({ rules: tough }).pc;
    tough.keys.take(pc, 4001);
    expect(tough.keys.flag(pc, 4000)).toBe(1);
    expect(tough.keys.flag(pc, 4005)).toBe(0);
  });

  it("is rolled for on the odds of the deepest floor the character's own module has", () => {
    for (const floor of [0, 50, 105]) expect(tough.keys.oddsFloor(floor), `floor ${floor}`).toBe(floor);
    for (const floor of [106, 250, 4000]) expect(tough.keys.oddsFloor(floor), `floor ${floor}`).toBe(105);
    for (const floor of [0, 50, 85]) expect(normal.keys.oddsFloor(floor), `floor ${floor}`).toBe(floor);
    for (const floor of [86, 250, 4000]) expect(normal.keys.oddsFloor(floor), `floor ${floor}`).toBe(85);
  });

  it('is still refused on the floors whose key would be labelled 0', () => {
    for (const floor of [0, 1, 2, 3]) expect(tough.keys.foundOn(floor), `floor ${floor}`).toBe(false);
  });
});

describe("an endless section's Shadow boss", () => {
  it('has his square remembered beside the record', () => {
    const pc = newGame({ rules: tough, pc: { module: MODULE_V } }).pc;
    expect(tough.bossSquares.of(pc, 21)).toEqual({ x: 0, y: 0 });
    tough.bossSquares.remember(pc, 21, { x: 12, y: 34 });
    expect(tough.bossSquares.of(pc, 21)).toEqual({ x: 12, y: 34 });
    expect(pc.bossX.every((x) => x === 0)).toBe(true);
    expect(pc.bossY.every((y) => y === 0)).toBe(true);
  });

  it('does not share a square with the section the record keeps four apart', () => {
    const pc = newGame({ rules: tough, pc: { module: MODULE_V } }).pc;
    tough.bossSquares.remember(pc, 17, { x: 1, y: 2 });
    tough.bossSquares.remember(pc, 21, { x: 3, y: 4 });
    expect(tough.bossSquares.of(pc, 17)).toEqual({ x: 1, y: 2 });
    expect(tough.bossSquares.of(pc, 21)).toEqual({ x: 3, y: 4 });
  });

  it('keeps the twenty the record was written for in the record', () => {
    const pc = newGame({ rules: tough, pc: { module: MODULE_V } }).pc;
    tough.bossSquares.remember(pc, 18, { x: 7, y: 8 });
    expect(FAITHFUL_RULES.bossSquares.of(pc, 18)).toEqual({ x: 7, y: 8 });
  });
});
