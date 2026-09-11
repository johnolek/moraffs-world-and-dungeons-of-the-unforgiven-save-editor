import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BorlandRng } from '../game/port/rng';
import { onAFloorFacingAMonster, press } from './battle.test-support';
import { KEY } from './keys';
import { monstersDrawn, panelVisible } from './mode';

/**
 * What each mode shows of Dungeons of the Unforgiven, against a real view of a stocked floor.
 * The tab has no props to render it with — it plays whichever character is on the roster — so
 * what is checked here is what it asks of `mode.ts` and the view it asks with.
 */

const source = readFileSync('src/lib/play/Play.svelte', 'utf8');

/** A character on a stocked floor with a monster in front of them, engaged: the loop meets it in
 *  attack_timing on the pass a key starts, and Escape runs no handler of its own. */
async function facingOneOfMany() {
  const session = onAFloorFacingAMonster(new BorlandRng(7), 3);
  await press(session, KEY.escape);
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

  it("is what the tab hands the game's own zoom map in debug", () => {
    expect(source).toContain('mapMonsters={zoomMapMonsters(stage.mode, view.screenFloor)}');
  });

  it('is what the tab hands the map, along with the map itself', () => {
    expect(source).toContain('{@const monsters = monstersDrawn(stage.mode, view)}');
    expect(source).toContain('discovered={discoveredMap(stage)}');
    expect(source).toContain('mapDrawn(stage.mode, stage.session.memory)');
  });
});

describe("the numbers debug mode prints over the game's own screen", () => {
  it('is what the tab puts behind the mode', () => {
    expect(source).toContain('debug={debugDrawn(stage.mode)}');
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

