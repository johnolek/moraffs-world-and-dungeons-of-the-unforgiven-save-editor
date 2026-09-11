import { describe, expect, it } from 'vitest';
import { bundledMwDungeon } from '../../game/mw-dungeon';
import { findMwSquare, mwCharacterFile, playingMw, pressMw } from './test-engine';
import { MW_KEY, mwFacingArrow, mwGameKey, mwStepKey, mwTurn } from './keys';

const press = (key: string, modifiers: Partial<KeyboardEvent> = {}) =>
  mwGameKey({ key, altKey: false, metaKey: false, ctrlKey: false, ...modifiers } as KeyboardEvent);

describe('mwGameKey', () => {
  it('hands a letter over in lower case, which is what movecontrol dispatches on', () => {
    expect(press('L')).toBe(MW_KEY.loseItem);
    expect(press('l')).toBe(MW_KEY.loseItem);
  });

  it('hands over the three palette keys, which type punctuation rather than a letter', () => {
    expect(press('(')).toBe(MW_KEY.paletteGreen);
    expect(press(')')).toBe(MW_KEY.paletteBlue);
    expect(press('*')).toBe(MW_KEY.paletteRed);
  });

  it('names the keys that type nothing', () => {
    expect(press('ArrowUp')).toBe(MW_KEY.arrowUp);
    expect(press('Escape')).toBe(MW_KEY.escape);
    expect(press('F1')).toBe(MW_KEY.f1);
  });

  it('hands over the space bar, so any key answers a box waiting for one', () => {
    expect(press(' ')).toBe(MW_KEY.space);
  });

  it('leaves a key held with a modifier to the browser', () => {
    expect(press('f', { ctrlKey: true })).toBe(null);
    expect(press('Tab')).toBe(null);
  });
});

/** A square of the town with nothing on it and a way out to the north. */
const townWalk = () =>
  findMwSquare(
    0,
    (square, x, y) =>
      square.n === 3 &&
      square.ladder === 0 &&
      bundledMwDungeon.surface(x, y, 0, 0) === 0 &&
      bundledMwDungeon.trapdoor(x, y, 0, 0) === -1,
  );

describe("Dungeons of the Unforgiven's arrows in Moraff's World", () => {
  it('steps the way the character already faces for the up arrow', () => {
    expect(mwFacingArrow(MW_KEY.arrowUp, 0)).toEqual({ dir: 0, step: true });
    expect(mwFacingArrow(MW_KEY.arrowUp, 3)).toEqual({ dir: 3, step: true });
    expect(mwStepKey(0)).toBe(MW_KEY.arrowUp);
    expect(mwStepKey(3)).toBe(MW_KEY.arrowRight);
  });

  it('turns without stepping for the other three', () => {
    // Facing north, the left arrow faces west, the right one east and the down arrow south.
    expect(mwFacingArrow(MW_KEY.arrowLeft, 0)).toEqual({ dir: 2, step: false });
    expect(mwFacingArrow(MW_KEY.arrowRight, 0)).toEqual({ dir: 3, step: false });
    expect(mwFacingArrow(MW_KEY.arrowDown, 0)).toEqual({ dir: 1, step: false });
    // Facing east, the left arrow faces north and the down arrow west.
    expect(mwFacingArrow(MW_KEY.arrowLeft, 3)).toEqual({ dir: 0, step: false });
    expect(mwFacingArrow(MW_KEY.arrowDown, 3)).toEqual({ dir: 2, step: false });
  });

  it('leaves every key that is not one of the four arrows alone', () => {
    expect(mwFacingArrow(MW_KEY.fight, 0)).toBeNull();
    expect(mwFacingArrow(MW_KEY.wait, 0)).toBeNull();
  });

  it('turns a character facing east on the spot and then walks them north', async () => {
    const start = townWalk();
    const session = playingMw(mwCharacterFile({ floor: 0, dir: 3, ...start }));
    const turn = mwFacingArrow(MW_KEY.arrowLeft, session.game.pc.dir)!;
    mwTurn(session, turn.dir);
    expect(session.view().place).toMatchObject({ x: start.x, y: start.y, dir: 0 });
    const step = mwFacingArrow(MW_KEY.arrowUp, session.game.pc.dir)!;
    await pressMw(session, mwStepKey(step.dir));
    expect(session.view().place).toMatchObject({ x: start.x, y: start.y - 1, dir: 0 });
  });
});
