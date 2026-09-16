import { describe, expect, it } from 'vitest';
import { readRecolouredId } from '../../bestiary/monsters';
import { nudgeLevel, rollHp } from '../../bestiary/roll';
import { UNFORGIVEN_MAP } from '../../map/game';
import { monsterById, stockFloor } from '../../map/stocking';
import { expValue } from '../port/combat';
import { FAITHFUL_RULES } from '../port/rules';
import { newGame, type MonsterKind } from '../port/state';
import { BOTTOM_LEVEL } from '../unfmap.js';
import { endlessSection, type SectionTheme } from './monsters';
import { endlessRules, ENDLESS_BOTTOM } from './rules';

/** The hundred sections under the bottom of the game, and one far deeper than anybody will
 *  walk. */
const ENDLESS_SECTIONS = [...Array.from({ length: 100 }, (unused, index) => 21 + index), 1200];

const SEED = 20260915;
const MODULE_IV = 3;
const MODULE_V = 4;

/** One of the 22 monsters every section keeps loaded, which is as good a monster as any to roll
 *  hit points for. */
const BUILT_IN_SLOT = 0;

/** A generator whose every roll lands in the middle, so a roll of the same floor is the same
 *  number every time. */
const half = () => 0.5;

/** A repeatable stand-in for Math.random, so a floor that came out oddly can be rolled again. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const normal = endlessRules({ hard: false, seed: SEED });
const tough = endlessRules({ hard: true, seed: SEED });

/** Every floor the faithful game itself can put a character on. */
const faithfulFloors = (module: number): number[] =>
  Array.from({ length: BOTTOM_LEVEL[module] + 1 }, (unused, floor) => floor);

/** The deepest floor the record's signed word at 0x7b4 can say a character is standing on. */
const RECORD_FLOOR_MAX = 32767;

describe('an endless dungeon', () => {
  it("bottoms out at 30,000, which is inside the floor the record can hold", () => {
    expect(ENDLESS_BOTTOM).toBe(30000);
    expect(ENDLESS_BOTTOM).toBeLessThanOrEqual(RECORD_FLOOR_MAX);
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
      const regulars = REGULAR_SLOTS.map((slot) => rowOf(section, slot));
      for (const row of regulars) expect(row.special, `section ${section} ${row.name}`).not.toBe(BOSS_SPECIAL);
      // A drainers section is the one that stands a second drainer among its three regulars.
      const draining = regulars.filter((row) => row.levelDrain !== 0).length;
      expect(draining, `section ${section}`).toBe(endlessSection(SEED, section).theme === 'drainers' ? 1 : 0);
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

describe("an endless section's theme", () => {
  /** Enough sections of enough worlds for every theme to have come up a few dozen times. */
  const SWEEP_WORLDS = [SEED, SEED + 1, SEED + 2];
  const SWEEP_SECTIONS = Array.from({ length: 200 }, (unused, index) => 21 + index);

  const themesOf = (seed: number, sections: number[]): SectionTheme[] =>
    sections.map((section) => endlessSection(seed, section).theme);

  const sweep = (): SectionTheme[] => SWEEP_WORLDS.flatMap((seed) => themesOf(seed, SWEEP_SECTIONS));

  /** The shallowest section of the sweep that drew this theme. */
  const sectionWith = (theme: SectionTheme): number => {
    const found = SWEEP_SECTIONS.find((section) => endlessSection(SEED, section).theme === theme);
    if (found === undefined) throw new Error(`no ${theme} section in ${SWEEP_SECTIONS.length} of world ${SEED}`);
    return found;
  };

  /** The section's own five rows, which are the last five of the 27 it keeps loaded. */
  const fiveOf = (section: number) => tough.monsterKinds(section).slice(-5);

  /** The breath byte of a monster's row: 1 fire, 2 ice. */
  const FIRE = 1;
  const ICE = 2;

  /** The eight poison and disease monsters of the game's own table, which every section keeps
   *  loaded as rows 14 to 21. */
  const AFFLICTED = new Set(Array.from({ length: 8 }, (unused, index) => `builtin-${14 + index}`));

  /** A floor of the section with no Shadow boss standing on it, which is its second last. */
  const floorOf = (section: number): number => (tough.sectionPlace(section)?.bossFloor ?? 0) - 1;

  /** The level a floor of Module V rolls its monsters around before any theme: the floor, and the
   *  15 levels stock_level adds for each of the four modules above it. */
  const baseLevelOf = (floor: number): number => floor + 15 * MODULE_V;

  /** What share of a stocked floor of this section counts. */
  const shareOf = (section: number, counts: (row: MonsterKind) => boolean): number => {
    const rows = new Map(tough.monsterKinds(section).map((kind) => [kind.id, kind]));
    const floor = floorOf(section);
    const map = UNFORGIVEN_MAP.floor(floor, MODULE_V, tough.bottomLevel(MODULE_V), tough.trapdoorReach(MODULE_V, floor));
    const monsters = stockFloor(tough, map, MODULE_V, floor, seeded(11));
    const counted = monsters.filter((monster) => {
      const row = rows.get(monster.monsterId);
      return row !== undefined && counts(row);
    });
    return counted.length / monsters.length;
  };

  const drainerShareOf = (section: number): number => shareOf(section, (row) => row.levelDrain !== 0);
  const afflictedShareOf = (section: number): number => shareOf(section, (row) => AFFLICTED.has(row.id));

  it('is the same theme for everybody playing the same world', () => {
    expect(themesOf(SEED, ENDLESS_SECTIONS)).toEqual(themesOf(SEED, ENDLESS_SECTIONS));
  });

  it('is drawn again in a world seeded differently', () => {
    expect(themesOf(SEED + 1, SWEEP_SECTIONS)).not.toEqual(themesOf(SEED, SWEEP_SECTIONS));
  });

  it('leaves about one section in three with no theme at all', () => {
    const drawn = sweep();
    const plain = drawn.filter((theme) => theme === 'plain').length / drawn.length;
    expect(plain).toBeGreaterThan(0.25);
    expect(plain).toBeLessThan(0.5);
  });

  it('has every monster of a fire section breathe fire', () => {
    for (const row of fiveOf(sectionWith('fire'))) expect(row.breath, row.name).toBe(FIRE);
  });

  it('has every monster of an ice section breathe ice', () => {
    for (const row of fiveOf(sectionWith('ice'))) expect(row.breath, row.name).toBe(ICE);
  });

  it('leaves the breath of a plain section to the monsters it borrowed', () => {
    const plain = sectionWith('plain');
    expect(fiveOf(plain).every((row) => row.breath === FIRE)).toBe(false);
    expect(fiveOf(plain).every((row) => row.breath === ICE)).toBe(false);
  });

  it('stands far more level drainers in a drainers section than in a plain one', () => {
    expect(drainerShareOf(sectionWith('drainers'))).toBeGreaterThan(3 * drainerShareOf(sectionWith('plain')));
  });

  it('stands far more poison and disease in an afflictions section than in a plain one', () => {
    expect(afflictedShareOf(sectionWith('afflictions'))).toBeGreaterThan(2 * afflictedShareOf(sectionWith('plain')));
  });

  it('rolls the monsters of an elites section two levels above the floor', () => {
    const elite = floorOf(sectionWith('elites'));
    const plain = floorOf(sectionWith('plain'));
    expect(tough.monsterLevel(MODULE_V, elite)).toBe(baseLevelOf(elite) + 2);
    expect(tough.monsterLevel(MODULE_V, plain)).toBe(baseLevelOf(plain));
  });

  it('draws every theme there is', () => {
    const drawn = new Set(sweep());
    for (const theme of ['plain', 'fire', 'ice', 'drainers', 'afflictions', 'elites'] as const) {
      expect(drawn.has(theme), theme).toBe(true);
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

  it("keeps a monster's level past the byte the game's own nudge counts round", () => {
    // Three steps up from 255, which the game's jitter takes round the byte to 2.
    const stepsUp = () => {
      const rolls = [0, 0.9, 0, 0.9, 0, 0.9, 0.9];
      let at = 0;
      return () => rolls[at++];
    };
    expect(nudgeLevel(255, stepsUp(), tough)).toBe(258);
    expect(nudgeLevel(255, stepsUp(), FAITHFUL_RULES)).toBe(2);
  });

  it('stands a monster of a deep floor at the level the floor calls for', () => {
    const noJitter = () => 0.9;
    expect(nudgeLevel(300, noJitter, tough)).toBe(300);
    expect(nudgeLevel(300, noJitter, FAITHFUL_RULES)).toBe(1);
  });

  it("rolls its monsters more hit points than the game's own two bytes hold", () => {
    const entry = monsterById(FAITHFUL_RULES.monsterKinds(1)[BUILT_IN_SLOT].id);
    const baseLevel = tough.monsterLevel(MODULE_V, 4000);
    expect(rollHp(entry, baseLevel, half, tough)).toBeGreaterThan(FAITHFUL_RULES.monsterHpMax);
    expect(rollHp(entry, baseLevel, half, FAITHFUL_RULES)).toBe(FAITHFUL_RULES.monsterHpMax);
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
