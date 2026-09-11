import { describe, expect, it } from 'vitest';
import type { Rng } from '../../game/port/rng';
import { findMwSquare, mwCharacterFile, playingMw, pressMw } from './test-engine';
import { MW_KEY } from './keys';

/** An empty square of the town to stand on while a screen is open. */
const standing = () => findMwSquare(0, (square) => square.ladder === 0 && square.surface === 0);

/** The text of every line on the screen, one to a line. */
const screenText = (lines: { text: string }[]) => lines.map((line) => line.text).join('\n');

describe('the V key', () => {
  it('shows the vital statistics until a key arrives', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, ...standing() }));
    await pressMw(session, MW_KEY.viewStats);
    expect(screenText(session.game.screen)).toContain('GRIMWALD');
    await pressMw(session, MW_KEY.escape);
    expect(session.game.screen).toEqual([]);
  });
});

describe('the 1 and 2 keys', () => {
  it('name the preparation spells that are up', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, feather: 1, ...standing() }));
    await pressMw(session, MW_KEY.viewPrepSpells);
    expect(screenText(session.game.screen)).toContain('FEATHER');
    await pressMw(session, MW_KEY.escape);
    expect(session.game.screen).toEqual([]);
  });

  it('name the battle spells that are running', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, antiFireTimer: 20, ...standing() }));
    await pressMw(session, MW_KEY.viewBattleSpells);
    expect(screenText(session.game.screen)).toContain('ANTI-FIRE');
  });
});

describe('the E key', () => {
  it('labels each line with the level after the one it prints the number for', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, lev: 3, ...standing() }));
    await pressMw(session, MW_KEY.expNeeded);
    expect(session.box[0]).toBe('EXPERIENCE NEEDED FOR LEVEL:');
    expect(session.box[1]).toMatch(/^4\) /);
  });
});

describe('the M key', () => {
  it('counts the stones and the jewels', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, money: 12, bank: 34, stones: [1, 2, 3, 4, 5, 6], ...standing() }),
    );
    await pressMw(session, MW_KEY.money);
    expect(session.box).toEqual(['YOUR FINANCIAL STATEMENT:']);
    await pressMw(session, MW_KEY.escape);
    expect(session.box).toContain('JEWELS IN POCKET:12');
    expect(session.box).toContain('JEWELS IN BANK:  34');
  });
});

describe('the W key', () => {
  it('puts a weapon the character owns in hand', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, cls: 0, weaponsOwned: [1, 0, 0, 0, 0, 0, 1, 0], ...standing() }),
    );
    await pressMw(session, MW_KEY.weapon);
    expect(session.box[6]).toBe('7) LONG SWORD');
    await pressMw(session, 0x37);
    expect(session.game.pc.weapon).toBe(6);
  });

  it('turns a monk away from anything but their fists', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, cls: 2, weaponsOwned: [1, 0, 0, 0, 0, 0, 1, 0], ...standing() }),
    );
    await pressMw(session, MW_KEY.weapon);
    await pressMw(session, 0x37);
    expect(session.game.pc.weapon).toBe(0);
    expect(session.box).toContain('  CAN NOT USE THAT WEAPON.');
  });

  it('closes on Escape with the weapon in hand left alone', async () => {
    const session = playingMw(
      mwCharacterFile({
        floor: 0,
        cls: 0,
        weapon: 0,
        weaponsOwned: [1, 0, 0, 0, 0, 0, 1, 0],
        ...standing(),
      }),
    );
    await pressMw(session, MW_KEY.weapon);
    expect(session.box[6]).toBe('7) LONG SWORD');
    await pressMw(session, MW_KEY.escape);
    expect(session.box).toEqual([]);
    expect(session.game.pc.weapon).toBe(0);
  });
});

describe('the A key', () => {
  it('closes on Escape with the armor worn left alone', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, cls: 0, armor: 0, armorOwned: [1, 1, 0, 0, 0, 0, 0], ...standing() }),
    );
    await pressMw(session, MW_KEY.armor);
    expect(session.box[1]).toBe('2) LEATHER');
    await pressMw(session, MW_KEY.escape);
    expect(session.box).toEqual([]);
    expect(session.game.pc.armor).toBe(0);
  });
});

describe('the P key', () => {
  it('opens the four spell listings and the magic items', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, grenades: 2, ...standing() }));
    await pressMw(session, MW_KEY.pockets);
    expect(session.box).toContain('5) MISC. MAGIC ITEMS');
    await pressMw(session, 0x35);
    expect(screenText(session.game.screen)).toContain('HOLY HAND GRENADES');
    await pressMw(session, MW_KEY.escape);
    expect(session.game.screen).toEqual([]);
  });
});

describe('the help menu', () => {
  it('opens a topic and comes back, and Escape closes it', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, ...standing() }));
    await pressMw(session, MW_KEY.f1);
    expect(screenText(session.game.screen)).toContain('HELP MENU-HIT ESC TO RETURN TO GAME');
    await pressMw(session, 0x71);
    expect(screenText(session.game.screen)).not.toContain('HELP MENU-HIT ESC TO RETURN TO GAME');
    await pressMw(session, MW_KEY.escape);
    expect(screenText(session.game.screen)).toContain('HELP MENU-HIT ESC TO RETURN TO GAME');
    await pressMw(session, MW_KEY.escape);
    expect(session.game.screen).toEqual([]);
  });
});

describe("the little mouse's lessons", () => {
  it('teaches one of the fourteen to a character below their third level', async () => {
    // The mouse speaks when the first roll after the key comes out 0, and teaches when the
    // second comes out 1.
    let at = 0;
    const rolls = [0, 1];
    const scripted: Rng = { random: () => (at < rolls.length ? rolls[at++] : 0) };
    const start = findMwSquare(0, (square) => square.n === 3 && square.ladder === 0);
    const session = playingMw(mwCharacterFile({ floor: 0, lev: 0, ...start }), scripted);
    await pressMw(session, MW_KEY.arrowUp);
    // The lesson is drawn on the box's own fifth row rather than said into the box.
    expect(session.game.screen[0]).toEqual({
      text: 'OBJECTIVE: USE ARROW KEYS TO',
      x: 0,
      y: 0xf0,
      font: 0,
      colour: 3,
    });
    expect(session.lessons.next).toBe(1);
  });
});
