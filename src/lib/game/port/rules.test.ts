import { describe, expect, it } from 'vitest';
import data from '../dotu-data.json';
import { sectionOf } from '../dotu-files.js';
import { monsterLevelBase } from '../dotu-mech.js';
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

  it('stops paying for a monster where exp_value stops', () => {
    expect(rules.experienceCap).toBe(130);
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
