import { describe, expect, it } from 'vitest';
import { mwSpellBookSlot } from '../../game/mw-port/spells';
import { findMwSquare, mwCharacterFile, playingMw, pressMw } from './test-engine';
import { MW_KEY } from './keys';

/** The character record's index for one spell, by the category, level and place on its line. */
const at = (category: number, level: number, slot: number) => mwSpellBookSlot(category, level, slot);

/** A priest standing on an empty square of the town, with one spell in their book. */
function priest(overrides: Record<string, unknown> = {}) {
  const spellbook = Array.from({ length: 180 }, () => 0);
  // Priestly, level 1, the second of the three: MINOR PROTECTION.
  spellbook[at(3, 1, 1)] = 1;
  return mwCharacterFile({
    floor: 0,
    cls: 4,
    sp: 10,
    maxSp: 10,
    spellbook,
    ...findMwSquare(0, (square) => square.ladder === 0 && square.n === 3),
    ...overrides,
  });
}

describe('the C key', () => {
  it('casts a spell out of the spellbook and charges its level in spell points', async () => {
    const session = playingMw(priest());
    await pressMw(session, MW_KEY.cast);
    expect(session.box).toContain('4) PRIEST BATTLE SPELLS');
    await pressMw(session, 0x34);
    expect(session.game.screen.map((line) => line.text).join('\n')).toContain('MINOR PROTECTION');
    await pressMw(session, 0x62);
    expect(session.game.pc.protectionLevel).toBe(1);
    // The spell sets sixty moves and the monsters' step after the cast counts one of them off.
    expect(session.game.pc.protectionTimer).toBe(59);
    expect(session.game.pc.sp).toBe(9);
  });

  it('leaves the grid on Escape without casting anything', async () => {
    const session = playingMw(priest());
    await pressMw(session, MW_KEY.cast);
    await pressMw(session, 0x34);
    await pressMw(session, MW_KEY.escape);
    expect(session.game.screen).toEqual([]);
    expect(session.game.pc.sp).toBe(10);
  });

  it('closes the type menu on Escape without opening a grid', async () => {
    const session = playingMw(priest());
    await pressMw(session, MW_KEY.cast);
    expect(session.box).toContain('4) PRIEST BATTLE SPELLS');
    await pressMw(session, MW_KEY.escape);
    expect(session.game.screen).toEqual([]);
    expect(session.game.pc.sp).toBe(10);
    // The loop is waiting for the next key rather than still on the menu, which is what the
    // E key's box proves.
    await pressMw(session, MW_KEY.expNeeded);
    expect(session.box[0]).toBe('EXPERIENCE NEEDED FOR LEVEL:');
  });

  it('turns a fighter away from everything but magic paper', async () => {
    const session = playingMw(priest({ cls: 0 }));
    await pressMw(session, MW_KEY.cast);
    expect(session.box).toEqual([
      'FIGHTERS CAN ONLY CAST',
      '  SPELLS BY USING MAGIC',
      '  PAPER. KEEP LOOKING.',
      '',
      'HIT ANY KEY...',
    ]);
  });
});

describe('the I key', () => {
  it('takes a charge off the wand it casts from', async () => {
    const wands = Array.from({ length: 180 }, () => 0);
    wands[at(3, 1, 1)] = 4;
    const session = playingMw(priest({ wands, sp: 0, maxSp: 0 }));
    await pressMw(session, MW_KEY.useItem);
    expect(session.box).toContain('2) WAND');
    await pressMw(session, 0x32);
    await pressMw(session, 0x34);
    await pressMw(session, 0x62);
    expect(session.game.pc.wands[at(3, 1, 1)]).toBe(3);
    expect(session.game.pc.protectionLevel).toBe(1);
  });
});

describe('a spell that stops for a menu', () => {
  it('asks Pass Wall which way, and walks the character through the wall', async () => {
    const spellbook = Array.from({ length: 180 }, () => 0);
    // Priestly, level 5, the third of the three: PASS WALL.
    spellbook[at(3, 5, 2)] = 1;
    const start = findMwSquare(0, (square, x, y) => square.ladder === 0 && y > 30 && x > 5);
    const session = playingMw(priest({ spellbook, sp: 20, maxSp: 20, ...start }));
    await pressMw(session, MW_KEY.cast);
    await pressMw(session, 0x34);
    await pressMw(session, 0x6f);
    expect(session.box).toContain('1) NORTH (UP)');
    await pressMw(session, 0x31);
    expect(session.view().place.y).toBeLessThan(start.y);
    expect(session.game.pc.sp).toBe(15);
  });

  it('asks Enchant Weapon which of the eight slots to put the plus on', async () => {
    const spellbook = Array.from({ length: 180 }, () => 0);
    // Permanent, level 3, the first of the three: ENCHANT WEAPON LEVEL 2.
    spellbook[at(0, 3, 0)] = 1;
    const weaponsOwned = [1, 0, 0, 0, 1, 0, 0, 0];
    const session = playingMw(priest({ spellbook, weaponsOwned, sp: 20, maxSp: 20 }));
    await pressMw(session, MW_KEY.cast);
    await pressMw(session, 0x31);
    // Level 3, the first of the three, is G.
    await pressMw(session, 0x67);
    expect(session.box).toContain('5) KNIFE');
    await pressMw(session, 0x35);
    expect(session.game.pc.weaponPlus[4]).toBe(2);
    // A permanent spell costs its level off the spell points and off the maximum as well.
    expect(session.game.pc.sp).toBe(17);
    expect(session.game.pc.maxSp).toBe(17);
  });

  it('gives Enchant Weapon up when its slot menu is escaped', async () => {
    const spellbook = Array.from({ length: 180 }, () => 0);
    spellbook[at(0, 3, 0)] = 1;
    const weaponsOwned = [1, 0, 0, 0, 1, 0, 0, 0];
    const session = playingMw(priest({ spellbook, weaponsOwned, sp: 20, maxSp: 20 }));
    await pressMw(session, MW_KEY.cast);
    await pressMw(session, 0x31);
    await pressMw(session, 0x67);
    expect(session.box).toContain('5) KNIFE');
    await pressMw(session, MW_KEY.escape);
    expect(session.game.pc.weaponPlus[4]).toBe(0);
    await pressMw(session, MW_KEY.expNeeded);
    expect(session.box[0]).toBe('EXPERIENCE NEEDED FOR LEVEL:');
  });

  it('sends Write Scroll back to the level menu when its slot menu is escaped', async () => {
    const spellbook = Array.from({ length: 180 }, () => 0);
    // Permanent, level 1, the third of the three: WRITE SCROLL TO LEVEL 3.
    spellbook[at(0, 1, 2)] = 1;
    const session = playingMw(priest({ spellbook, sp: 20, maxSp: 20 }));
    await pressMw(session, MW_KEY.cast);
    await pressMw(session, 0x31);
    // Level 1, the third of the three, is C.
    await pressMw(session, 0x63);
    await pressMw(session, 0x31);
    await pressMw(session, 0x31);
    expect(session.box).toContain('4) PREVIOUS MENU');
    await pressMw(session, MW_KEY.escape);
    expect(session.box).toContain('HIT ESC FOR PREVIOUS MENU');
    expect(session.game.pc.scrolls.every((count) => count === 0)).toBe(true);
  });

  it('gives Enchant Armor up when its slot menu is escaped', async () => {
    const spellbook = Array.from({ length: 180 }, () => 0);
    // Permanent, level 2, the first of the three: ENCHANT ARMOR LEVEL 1.
    spellbook[at(0, 2, 0)] = 1;
    const armorOwned = [1, 1, 0, 0, 0, 0, 0];
    const session = playingMw(priest({ spellbook, armorOwned, sp: 20, maxSp: 20 }));
    await pressMw(session, MW_KEY.cast);
    await pressMw(session, 0x31);
    // Level 2, the first of the three, is D.
    await pressMw(session, 0x64);
    expect(session.box).toContain('2) LEATHER');
    await pressMw(session, MW_KEY.escape);
    expect(session.game.pc.armorPlus[1]).toBe(0);
    await pressMw(session, MW_KEY.expNeeded);
    expect(session.box[0]).toBe('EXPERIENCE NEEDED FOR LEVEL:');
  });
});
