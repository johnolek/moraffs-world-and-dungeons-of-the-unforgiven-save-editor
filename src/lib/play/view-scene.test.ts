import { describe, expect, it } from 'vitest';
import type { MapSquare } from '../map/game';
import { dotuViewScene, type ViewSceneInput } from './view-scene';
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
