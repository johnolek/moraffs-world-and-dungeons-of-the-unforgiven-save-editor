import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MW_SQUARE_EMPTY, mwSetOccupant } from '../../game/mw-port/state';
import { BorlandRng } from '../../game/port/rng';
import { monstersDrawn, panelVisible, zoomMapMonsters } from '../mode';
import { newFrame, pixelAt } from '../view3d/frame';
import { drawZoomMonsters, ZOOM_MONSTER_COLOUR } from '../zoom-monsters';
import { MW_SCREEN_PIXELS } from './view3d/screen';
import { MORAFFS_WORLD_ZOOM_MAP } from './map';
import type { MwGameSession } from './engine';
import { findMwSquare, mwCharacterFile, playingMw, pressMw } from './test-engine';
import { MW_KEY } from './keys';

/**
 * What each mode shows of Moraff's World, against a real view of a stocked floor. The tab has no
 * props to render it with — it plays whichever character is on the roster — so what is checked
 * here is what it asks of `mode.ts` and the view it asks with.
 */

const source = readFileSync('src/lib/play/mw/MwPlay.svelte', 'utf8');

/** Move the floor's first monster onto the square the character is facing. */
function standInFront(session: MwGameSession): void {
  const pc = session.game.pc;
  const planted = session.game.monsters[0];
  mwSetOccupant(session.game, planted.x, planted.y, MW_SQUARE_EMPTY);
  planted.x = pc.x;
  planted.y = pc.y - 1;
  mwSetOccupant(session.game, planted.x, planted.y, 0);
}

/** A character on a stocked floor fighting one of its monsters: attack_timing takes the monster
 *  up on the pass a key starts, and Escape runs no handler of its own. */
async function facingOneOfMany() {
  const start = findMwSquare(3, (square) => square.n === 3 && square.ladder === 0);
  const session = playingMw(
    mwCharacterFile({ floor: 3, dir: 0, ...start }),
    new BorlandRng(7),
    standInFront,
  );
  await pressMw(session, MW_KEY.escape);
  const view = session.view();
  expect(view.engaged).not.toBeNull();
  expect(view.monsters.length).toBeGreaterThan(1);
  return view;
}

describe('the monsters the map draws', () => {
  it('is the ones in sight in faithful and in speedrun, and the whole floor in debug', async () => {
    const view = await facingOneOfMany();
    const faithful = monstersDrawn('faithful', view);
    expect(faithful).toContain(view.engaged);
    expect(faithful).toEqual(view.visible);
    expect(faithful.length).toBeLessThan(view.monsters.length);
    expect(monstersDrawn('speedrun', view)).toEqual(faithful);
    expect(monstersDrawn('debug', view)).toEqual(view.monsters);
  });

  it('is every monster standing where the views reach, and no other', async () => {
    const view = await facingOneOfMany();
    for (const monster of view.monsters) {
      const inSight = view.visible.some((seen) => seen.slot === monster.slot);
      expect(monstersDrawn('faithful', view).includes(monster)).toBe(inSight);
    }
  });

  it("is what the tab hands the game's own map in the corner in debug", () => {
    expect(source).toContain('mapMonsters={zoomMapMonsters(stage.mode, view)}');
  });

  it('is what the tab hands the map, along with the map itself', () => {
    expect(source).toContain('{@const monsters = monstersDrawn(stage.mode, view)}');
    expect(source).toContain('{@const discovered = mapDrawn(stage.mode, stage.session.memory)}');
  });
});

describe("the numbers debug mode prints over the game's own screen", () => {
  it("is what the tab adds to the game's own lines", () => {
    expect(source).toContain('mwDebugMonsterLines(game, monsterCorner(stage))');
    expect(source).toContain('debugDrawn(stage.mode) && view.engaged != null');
  });
});

describe('the panel of numbers the game never prints', () => {
  it('is absent in faithful and in speedrun, and present in debug', () => {
    expect(panelVisible('faithful')).toBe(false);
    expect(panelVisible('speedrun')).toBe(false);
    expect(panelVisible('debug')).toBe(true);
  });

  it('is what the tab puts the panel behind', () => {
    expect(source).toContain('{#if panelVisible(stage.mode)}');
  });
});

describe("the monsters debug mode marks on the map in the screen's corner", () => {
  const at = { x: 40, y: 50 };
  /** Two monsters standing where no view of the character's reaches them. */
  const outOfSight = [
    { slot: 0, x: 43, y: 47, monsterId: '1', level: 3, hp: 20 },
    { slot: 1, x: 38, y: 54, monsterId: '1', level: 4, hp: 25 },
  ];

  function marks(mode: 'faithful' | 'speedrun' | 'debug'): number[] {
    const frame = newFrame(MW_SCREEN_PIXELS.width, MW_SCREEN_PIXELS.height);
    const map = MORAFFS_WORLD_ZOOM_MAP.window(MW_SCREEN_PIXELS);
    drawZoomMonsters(frame, map, at, zoomMapMonsters(mode, { monsters: outOfSight }));
    return outOfSight.map((monster) => {
      const column = monster.x - at.x + (map.columns >> 1);
      const row = monster.y - at.y + (map.rows >> 1);
      const x = map.left + column * map.cell + 3;
      const y = map.top + row * map.cell + 3;
      return pixelAt(frame, x, y);
    });
  }

  it('marks both of them in debug', () => {
    expect(marks('debug')).toEqual([ZOOM_MONSTER_COLOUR, ZOOM_MONSTER_COLOUR]);
  });

  it('marks neither in faithful or in speedrun', () => {
    expect(marks('faithful')).toEqual([0, 0]);
    expect(marks('speedrun')).toEqual([0, 0]);
  });
});

describe("the details a click on a monster's picture opens", () => {
  it('is asked for by the tab and answered with the monster clicked', () => {
    expect(source).toContain('onmonster={(monster) => (openMonsterId = monster.monsterId)}');
    expect(source).toContain('<MonsterCard');
  });

  it('keeps the keyboard off the game while it is up', () => {
    expect(source).toContain('if (openMonsterId === null) return false;');
    expect(source).toContain("if (event.key !== 'Escape') return true;");
    expect(source).toContain('openMonsterId = null;');
  });
});

