import { describe, expect, it } from 'vitest';
import { BorlandRng } from '../game/port/rng';
import { inTheTown, settle } from './battle.test-support';
import { compassKeys, gameKey, KEY } from './keys';

/** A key event as a browser would hand one over. */
const press = (key: string, modifiers: Partial<KeyboardEvent> = {}) => ({ key, altKey: false, ctrlKey: false, metaKey: false, ...modifiers }) as KeyboardEvent;

describe('the key the game reads', () => {
  it('turns the arrows into the negative scan codes movecontrol dispatches on', () => {
    expect(gameKey(press('ArrowUp'))).toBe(-0x48);
    expect(gameKey(press('ArrowDown'))).toBe(-0x50);
    expect(gameKey(press('ArrowLeft'))).toBe(-0x4b);
    expect(gameKey(press('ArrowRight'))).toBe(-0x4d);
  });

  it('reads Home and Page Up, the two keys that turn without a sound', () => {
    expect(gameKey(press('Home'))).toBe(-0x47);
    expect(gameKey(press('PageUp'))).toBe(-0x49);
  });

  it('reads F1 as the help key', () => {
    expect(gameKey(press('F1'))).toBe(KEY.f1);
  });

  it('reads Enter and Escape', () => {
    expect(gameKey(press('Enter'))).toBe(0x0d);
    expect(gameKey(press('Escape'))).toBe(0x1b);
  });

  it('reads a letter as its lower-case byte whichever case it was typed in', () => {
    expect(gameKey(press('q'))).toBe(0x71);
    expect(gameKey(press('Q'))).toBe(0x71);
    expect(gameKey(press('u'))).toBe(KEY.up);
  });

  it('reads the digits the game’s menus take', () => {
    expect(gameKey(press('1'))).toBe(0x31);
    expect(gameKey(press('9'))).toBe(0x39);
  });

  it('reads Ctrl-F as the repeat-fight key and no other combination as anything', () => {
    expect(gameKey(press('f', { ctrlKey: true }))).toBe(KEY.repeatFight);
    expect(gameKey(press('q', { ctrlKey: true }))).toBeNull();
    expect(gameKey(press('q', { metaKey: true }))).toBeNull();
    expect(gameKey(press('ArrowUp', { altKey: true }))).toBeNull();
  });

  it('reads the space bar and the marks of punctuation as their own bytes', () => {
    expect(gameKey(press(' '))).toBe(0x20);
    expect(gameKey(press('-'))).toBe(0x2d);
    expect(gameKey(press('/'))).toBe(0x2f);
  });

  it('reads nothing for a key that types nothing the game has a byte for', () => {
    expect(gameKey(press('Tab'))).toBeNull();
    expect(gameKey(press('F5'))).toBeNull();
    expect(gameKey(press('Shift'))).toBeNull();
  });

  it('answers a box waiting for any key with the space bar', async () => {
    const session = inTheTown(new BorlandRng(3), { money: 1200 });
    // The town's own tablet is waiting for a key, and the box it comes down for takes the
    // keyboard with it, so the loop is let get back to waiting before anything else is typed.
    await settle();
    session.press(KEY.money);
    await settle();
    expect(session.box).toContain('LIST OF ASSETS:');
    session.press(gameKey(press(' ')) as number);
    await settle();
    expect(session.box).toEqual([]);
  });
});

describe("Moraff's World's arrows in Dungeons of the Unforgiven", () => {
  it('steps without turning when the arrow points the way the character faces', () => {
    expect(compassKeys(KEY.arrowUp, 0)).toEqual([KEY.arrowUp]);
    expect(compassKeys(KEY.arrowLeft, 2)).toEqual([KEY.arrowUp]);
    expect(compassKeys(KEY.arrowDown, 1)).toEqual([KEY.arrowUp]);
  });

  it('takes the fewest turns and then steps', () => {
    // Facing north, west is the turn to the left, east the turn to the right, south the way back.
    expect(compassKeys(KEY.arrowLeft, 0)).toEqual([KEY.arrowLeft, KEY.arrowUp]);
    expect(compassKeys(KEY.arrowRight, 0)).toEqual([KEY.arrowRight, KEY.arrowUp]);
    expect(compassKeys(KEY.arrowDown, 0)).toEqual([KEY.arrowDown, KEY.arrowUp]);
    // Facing east, north is the turn to the left, south the turn to the right, west the way back.
    expect(compassKeys(KEY.arrowUp, 3)).toEqual([KEY.arrowLeft, KEY.arrowUp]);
    expect(compassKeys(KEY.arrowDown, 3)).toEqual([KEY.arrowRight, KEY.arrowUp]);
    expect(compassKeys(KEY.arrowLeft, 3)).toEqual([KEY.arrowDown, KEY.arrowUp]);
  });

  it('leaves every key that is not one of the four arrows alone', () => {
    expect(compassKeys(KEY.fight, 0)).toEqual([KEY.fight]);
    expect(compassKeys(KEY.homeTurnLeft, 0)).toEqual([KEY.homeTurnLeft]);
  });

  it('walks a character north who was facing east, both keys through movecontrol', async () => {
    const session = inTheTown(new BorlandRng(3), { dir: 3 });
    await settle();
    const start = session.view().place;
    for (const key of compassKeys(KEY.arrowUp, session.game.pc.dir)) session.press(key);
    await settle();
    expect(session.view().place).toMatchObject({ x: start.x, y: start.y - 1, dir: 0 });
  });
});
