import { describe, expect, it } from 'vitest';
import data from '../dotu-data.json';
import { bossIndex, sectionOf } from '../dotu-files.js';
import { monsterLevelBase } from '../dotu-mech.js';
import { sectionInfo } from '../sections';
import { BOTTOM_LEVEL } from '../unfmap.js';
import { wallPictureFile } from './pictures';
import { FAITHFUL_RULES, faithfulRules } from './rules';
import { newGame } from './state';

/**
 * The faithful rules answer what the tables they were lifted out of answer, everywhere the game
 * can ask. The floors run a little past the bottom of each module because the map can be pointed
 * at any floor the game's 16-bit floor variable holds, and a spell or a chute can leave the
 * character standing on one.
 */
const MODULES = [0, 1, 2, 3, 4];
const FLOORS_PAST_THE_BOTTOM = 5;
const SECTIONS = Array.from({ length: 20 }, (_, index) => index + 1);

const floorsOf = (module: number): number[] =>
  Array.from({ length: BOTTOM_LEVEL[module] + FLOORS_PAST_THE_BOTTOM + 1 }, (_, floor) => floor);

describe('the faithful rules', () => {
  const rules = faithfulRules(data);

  it('is what a game is played by unless it is handed other rules', () => {
    const game = newGame();
    expect(game.rules).toBe(FAITHFUL_RULES);
    expect(game.monsterKinds).toEqual(FAITHFUL_RULES.monsterKinds(1));
  });

  it('puts the bottom of every module where the map generator does', () => {
    for (const module of MODULES) expect(rules.bottomLevel(module)).toBe(BOTTOM_LEVEL[module]);
  });

  it('puts every floor in the section sectionOf puts it in', () => {
    for (const module of MODULES) {
      for (const floor of floorsOf(module)) {
        expect(rules.sectionOf(module, floor), `module ${module} floor ${floor}`).toBe(sectionOf(module, floor));
      }
    }
  });

  it('gives a floor the part and the boss floor sectionInfo gives it', () => {
    for (const module of MODULES) {
      for (const floor of floorsOf(module)) {
        const info = sectionInfo(module, floor);
        const place = rules.sectionPlace(rules.sectionOf(module, floor));
        expect(place && { part: place.part, bossFloor: place.bossFloor }, `module ${module} floor ${floor}`).toEqual(
          info && { part: info.part, bossFloor: info.bossFloor },
        );
        expect(place?.module, `module ${module} floor ${floor}`).toBe(module);
      }
    }
  });

  it("draws every section from its own five monsters rather than another section's", () => {
    for (const section of SECTIONS) expect(rules.sectionSource(section)).toBe(section);
  });

  it('has no section either side of the twenty', () => {
    expect(rules.sectionPlace(0)).toBeNull();
    expect(rules.sectionPlace(21)).toBeNull();
  });

  it("loads the 22 built-in monsters and the section's five for every section", () => {
    for (const section of SECTIONS) {
      const kinds = rules.monsterKinds(section);
      expect(kinds, `section ${section}`).toHaveLength(27);
      expect(kinds.map((kind) => kind.name)).toEqual(
        [...data.builtinMonsters, ...data.sections[section - 1].monsters].map((kind) => kind.name.toUpperCase()),
      );
      expect(kinds[22].expMult).toBe(data.sections[section - 1].monsters[0].expMult);
    }
  });

  it('keeps the trap door keys in the record, one flag per five floors', () => {
    const pc = newGame().pc;
    expect(rules.keys.flag(pc, 20)).toBe(0);
    rules.keys.take(pc, 23);
    expect(pc.keys[4]).toBe(1);
    expect(rules.keys.flag(pc, 20)).toBe(1);
  });

  it('has a drainer carry a key on the floors kill_monster hands one out on', () => {
    for (const floor of [0, 1, 2, 3, 179, 180, 300]) {
      expect(rules.keys.foundOn(floor), `floor ${floor}`).toBe(false);
    }
    for (const floor of [4, 5, 100, 178]) expect(rules.keys.foundOn(floor), `floor ${floor}`).toBe(true);
  });

  it("keeps a Shadow boss's square in the record, where bossIndex puts it", () => {
    const pc = newGame({ pc: { module: 2 } }).pc;
    const section = 11;
    expect(rules.bossSquares.of(pc, section)).toEqual({ x: 0, y: 0 });
    rules.bossSquares.remember(pc, section, { x: 31, y: 44 });
    const index = bossIndex(pc.module, (section - 1) % 4);
    expect([pc.bossX[index], pc.bossY[index]]).toEqual([31, 44]);
    expect(rules.bossSquares.of(pc, section)).toEqual({ x: 31, y: 44 });
  });

  it('stops paying for a monster where exp_value stops', () => {
    expect(rules.experienceCap).toBe(130);
  });

  it('tops a nudged monster level off where stock_level tops it off', () => {
    expect(rules.monsterLevelMax).toBe(210);
  });

  it("rolls every floor's monsters around the level dotu-mech works out", () => {
    for (const module of MODULES) {
      for (const floor of floorsOf(module)) {
        expect(rules.monsterLevel(module, floor), `module ${module} floor ${floor}`).toBe(
          monsterLevelBase(floor, module),
        );
      }
    }
  });

  it('draws every section from its own wall file and its own monster file', () => {
    for (const section of SECTIONS) {
      expect(rules.pictureFiles(section)).toEqual({
        wall: wallPictureFile(section),
        monsters: `ufmon${section}.pic`,
      });
    }
  });
});
