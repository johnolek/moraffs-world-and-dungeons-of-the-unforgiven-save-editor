import { describe, expect, it } from 'vitest';
import { DESIGN_STAT_KEYS, rollerKey, type RollerMenus } from './keys';

const MENUS: RollerMenus = { races: 8, classes: 7 };

const key = (screen: Parameters<typeof rollerKey>[0], pressed: string, typed = '') =>
  rollerKey(screen, pressed, typed, MENUS);

describe('the menus', () => {
  it('takes the number of the line, which the game counts from one', () => {
    expect(key('difficulty', '1')).toEqual({ kind: 'answer', value: 0 });
    expect(key('difficulty', '2')).toEqual({ kind: 'answer', value: 1 });
    expect(key('race', '8')).toEqual({ kind: 'answer', value: 7 });
    expect(key('class', '7')).toEqual({ kind: 'answer', value: 6 });
  });

  it('ignores a number no line has', () => {
    expect(key('difficulty', '3')).toBeNull();
    expect(key('race', '9')).toBeNull();
    expect(key('class', '8')).toBeNull();
    expect(key('race', '0')).toBeNull();
  });

  it('ignores anything that is not a number', () => {
    expect(key('race', 'a')).toBeNull();
    expect(key('class', 'Enter')).toBeNull();
  });
});

describe('the keep, reroll and design menu', () => {
  it('takes Y, N and D whichever case they are typed in', () => {
    expect(key('keepRerollDesign', 'y')).toEqual({ kind: 'answer', value: 0 });
    expect(key('keepRerollDesign', 'N')).toEqual({ kind: 'answer', value: 1 });
    expect(key('keepRerollDesign', 'd')).toEqual({ kind: 'answer', value: 2 });
    expect(key('keepRerollDesign', 'k')).toBeNull();
  });
});

describe('the design screen', () => {
  it('puts a point on the characteristic whose letter was pressed', () => {
    expect(DESIGN_STAT_KEYS.map((letter) => key('designStat', letter))).toEqual(
      DESIGN_STAT_KEYS.map((_, value) => ({ kind: 'answer', value })),
    );
  });

  it('reads A for agility, so the D its own prompt asks for does nothing', () => {
    expect(key('designStat', 'a')).toEqual({ kind: 'answer', value: 4 });
    expect(key('designStat', 'd')).toBeNull();
  });

  it('throws the character away on Escape', () => {
    expect(key('designStat', 'Escape')).toEqual({ kind: 'answer', value: 6 });
  });
});

describe('the pauses', () => {
  it('carries on whatever key was hit', () => {
    expect(key('continue', 'q')).toEqual({ kind: 'answer', value: 0 });
    expect(key('continue', ' ')).toEqual({ kind: 'answer', value: 0 });
    expect(key('continue', 'Enter')).toEqual({ kind: 'answer', value: 0 });
    expect(key('continue', 'Escape')).toEqual({ kind: 'answer', value: 0 });
  });

  it('waits on through a modifier held on its own, and leaves Tab to the browser', () => {
    expect(key('continue', 'Shift')).toBeNull();
    expect(key('continue', 'Tab')).toBeNull();
  });
});

describe('the name', () => {
  it('keeps the letters, digits and spaces the game keeps, in upper case', () => {
    expect(key('name', 'b', 'BO')).toEqual({ kind: 'typing', typed: 'BOB' });
    expect(key('name', '2', 'BOB')).toEqual({ kind: 'typing', typed: 'BOB2' });
    expect(key('name', ' ', 'BOB')).toEqual({ kind: 'typing', typed: 'BOB ' });
    expect(key('name', '-', 'BOB')).toBeNull();
  });

  it('stops at the eighteen characters the record holds', () => {
    const full = 'ABCDEFGHIJKLMNOPQR';
    expect(key('name', 'S', full)).toEqual({ kind: 'typing', typed: full });
  });

  it('erases the last character on Backspace', () => {
    expect(key('name', 'Backspace', 'BOB')).toEqual({ kind: 'typing', typed: 'BO' });
    expect(key('name', 'Backspace', '')).toEqual({ kind: 'typing', typed: '' });
  });

  it('takes the name on Enter', () => {
    expect(key('name', 'Enter', 'BOB')).toEqual({ kind: 'accept' });
  });
});

describe('the page the tab opens on', () => {
  it('rolls on Enter', () => {
    expect(key('start', 'Enter')).toEqual({ kind: 'accept' });
  });

  it('ignores anything else', () => {
    expect(key('start', '0')).toBeNull();
    expect(key('start', 'a')).toBeNull();
    expect(key('start', 'Escape')).toBeNull();
  });
});

describe('the Moraff’s Revenge screens', () => {
  it('moves the race menu with the arrows and takes it on Return', () => {
    expect(key('revRace', 'ArrowRight')).toEqual({ kind: 'move', step: 1 });
    expect(key('revRace', 'ArrowLeft')).toEqual({ kind: 'move', step: -1 });
    expect(key('revRace', 'Enter')).toEqual({ kind: 'accept' });
  });

  it('also takes the race a number names, since the menu has four', () => {
    expect(key('revRace', '1')).toEqual({ kind: 'answer', value: 1 });
    expect(key('revRace', '4')).toEqual({ kind: 'answer', value: 4 });
    expect(key('revRace', '5')).toBeNull();
    expect(key('revRace', '0')).toBeNull();
  });

  it('reads the keep prompt as the two letters it offers', () => {
    expect(key('revKeep', 'y')).toEqual({ kind: 'answer', value: 0 });
    expect(key('revKeep', 'N')).toEqual({ kind: 'answer', value: 1 });
    expect(key('revKeep', 'd')).toBeNull();
  });

  it('reads the class menu as the number typed, which is what VAL gives it', () => {
    expect(key('revClass', '1')).toEqual({ kind: 'answer', value: 1 });
    expect(key('revClass', '2')).toEqual({ kind: 'answer', value: 2 });
    expect(key('revClass', '3')).toBeNull();
  });
});
