import { describe, expect, it } from 'vitest';
import { endlessRules } from '../game/endless/rules';
import { FAITHFUL_RULES } from '../game/port/rules';
import { sectionInfo } from '../game/sections';
import { BOTTOM_LEVEL } from '../game/unfmap.js';
import type { MapSquare } from '../map/game';
import { dotuViewScene, sectionDrawn, type ViewSceneInput } from './view-scene';
import type { ViewScene } from './view3d/render';

/** One open square, which is floor enough for a scene to be built over. */
const FLOOR: MapSquare[][] = [[{ n: 3, s: 3, w: 3, e: 3, solid: false, ladder: 0, chute: 0, trapdoor: -1 }]];

function input(overrides: Partial<ViewSceneInput> = {}): ViewSceneInput {
  return {
    rows: FLOOR,
    from: { x: 0, y: 0, floor: 3, module: 0, dir: 0 },
    section: 1,
    monsters: [],
    killed: null,
    viewsDrawn: 7,
    height: 18,
    screen: { width: 512, height: 384 },
    ...overrides,
  };
}

/** The first three flips a scene would make, which is what mirrors the monster ahead. */
const flips = (scene: ViewScene) => [scene.random?.(), scene.random?.(), scene.random?.()];

describe('the scene the 3-D views are drawn from', () => {
  it('draws its coin flips from the number of the drawing rather than from the game', () => {
    expect(flips(dotuViewScene(input()))).toEqual(flips(dotuViewScene(input())));
    expect(flips(dotuViewScene(input({ viewsDrawn: 8 })))).not.toEqual(flips(dotuViewScene(input())));
  });

  it('draws the three water sections under water and every other section dry', () => {
    expect([4, 8, 20].map((section) => dotuViewScene(input({ section })).water)).toEqual([true, true, true]);
    expect(dotuViewScene(input({ section: 5 })).water).toBe(false);
    // The town belongs to no section, and has no water and no monsters either.
    expect(dotuViewScene(input({ section: null })).water).toBe(false);
  });

  it('stands the view where the views were last drawn from, not where the character is now', () => {
    const scene = dotuViewScene(input({ from: { x: 4, y: 9, floor: 12, module: 2, dir: 3 } }));
    expect(scene.at).toEqual({ x: 4, y: 9 });
    expect(scene.floor).toBe(12);
    expect(scene.module).toBe(2);
    expect(scene.dir).toBe(3);
  });
});

describe('the look a floor is drawn in', () => {
  const MODULES = [0, 1, 2, 3, 4];
  /** A world of the endless dungeon, and a floor a hundred below the bottom of Module V. */
  const SEED = 20260915;
  const MODULE_V = 4;
  const ENDLESS_FLOOR = 205;

  it("is the floor's own section, in its own module, everywhere the game itself reaches", () => {
    for (const module of MODULES) {
      for (let floor = 0; floor <= BOTTOM_LEVEL[module]; floor++) {
        const info = sectionInfo(module, floor)!;
        expect(sectionDrawn(FAITHFUL_RULES, module, floor), `module ${module} floor ${floor}`).toEqual({
          section: info.section,
          module,
          part: info.part,
        });
      }
    }
  });

  it("is the module's last section for a floor below the module's bottom, as the game counts", () => {
    const info = sectionInfo(0, 30000)!;
    expect(sectionDrawn(FAITHFUL_RULES, 0, 30000)).toEqual({ section: info.section, module: 0, part: info.part });
  });

  it('is nothing at all above the town, which is in no section', () => {
    expect(sectionDrawn(FAITHFUL_RULES, 0, -5)).toEqual({ section: null, module: 0, part: 1 });
  });

  it('is the borrowed section for a floor below the bottom of the game', () => {
    const rules = endlessRules({ hard: true, seed: SEED });
    const borrowed = rules.sectionSource(rules.sectionOf(MODULE_V, ENDLESS_FLOOR));
    const drawn = sectionDrawn(rules, MODULE_V, ENDLESS_FLOOR);

    expect(rules.sectionOf(MODULE_V, ENDLESS_FLOOR)).toBeGreaterThan(20);
    expect(drawn).toEqual(sectionDrawn(FAITHFUL_RULES, ...floorOfSection(borrowed)));
  });
});

/** The module and a floor of one of the game's own sections, for asking what it is drawn in. */
function floorOfSection(section: number): [number, number] {
  const place = FAITHFUL_RULES.sectionPlace(section)!;
  return [place.module, place.bossFloor];
}
