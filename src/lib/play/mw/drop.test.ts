import { describe, expect, it } from 'vitest';
import { findMwSquare, mwCharacterFile, playingMw, pressMw } from './test-engine';
import { MW_KEY } from './keys';

/** A square of the town with nothing on it, so the L key is the only thing happening. */
const townSquare = () => findMwSquare(0, (square) => square.ladder === 0);

describe('the L key', () => {
  it('drops one of the weapons in the slot picked', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, weaponsOwned: [1, 0, 2, 0, 0, 0, 0, 0], ...townSquare() }),
    );
    await pressMw(session, MW_KEY.loseItem);
    expect(session.box).toContain('2) WEAPON');
    await pressMw(session, 0x32);
    expect(session.box).toContain('3) CLUB');
    await pressMw(session, 0x33);
    expect(session.game.pc.weaponsOwned[2]).toBe(1);
  });

  it('refuses the fists a character can never put down', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, weaponsOwned: [1, 0, 0, 0, 0, 0, 0, 0], ...townSquare() }),
    );
    await pressMw(session, MW_KEY.loseItem);
    await pressMw(session, 0x32);
    await pressMw(session, 0x31);
    expect(session.box).toEqual(["OWE! IT JUST WON'T COME OFF!", 'HIT ANY KEY...']);
    expect(session.game.pc.weaponsOwned[0]).toBe(1);
  });

  it('leaves an empty slot empty', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, weaponsOwned: [1, 0, 0, 0, 0, 0, 0, 0], ...townSquare() }),
    );
    await pressMw(session, MW_KEY.loseItem);
    await pressMw(session, 0x32);
    expect(session.box).toContain('4) --------');
    await pressMw(session, 0x34);
    expect(session.game.pc.weaponsOwned[3]).toBe(0);
    expect(session.box).toEqual([]);
  });

  it('drops a suit of armor and takes it off the character wearing it', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, armorOwned: [1, 1, 0, 0, 0, 0, 0, 0], armor: 1, ...townSquare() }),
    );
    await pressMw(session, MW_KEY.loseItem);
    await pressMw(session, 0x31);
    expect(session.box).toContain('2) LEATHER');
    await pressMw(session, 0x32);
    expect(session.game.pc.armorOwned[1]).toBe(0);
    expect(session.game.pc.armor).toBe(0);
  });

  it('empties one pile of coins', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, stones: [10, 20, 30, 40, 50, 60], ...townSquare() }),
    );
    await pressMw(session, MW_KEY.loseItem);
    await pressMw(session, 0x33);
    expect(session.box).toContain('4) GOLD COINS');
    await pressMw(session, 0x34);
    expect(session.game.pc.stones).toEqual([10, 20, 30, 0, 50, 60]);
  });

  it('closes the weapon slot menu on Escape and drops nothing', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, weaponsOwned: [1, 3, 0, 0, 0, 0, 0, 0], ...townSquare() }),
    );
    await pressMw(session, MW_KEY.loseItem);
    await pressMw(session, 0x32);
    expect(session.box).toContain('2) STICK');
    await pressMw(session, MW_KEY.escape);
    expect(session.box).toEqual([]);
    expect(session.game.pc.weaponsOwned[1]).toBe(3);
  });

  it('closes the armor slot menu on Escape and drops nothing', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, armorOwned: [1, 1, 0, 0, 0, 0, 0, 0], armor: 1, ...townSquare() }),
    );
    await pressMw(session, MW_KEY.loseItem);
    await pressMw(session, 0x31);
    expect(session.box).toContain('2) LEATHER');
    await pressMw(session, MW_KEY.escape);
    expect(session.box).toEqual([]);
    expect(session.game.pc.armorOwned[1]).toBe(1);
    expect(session.game.pc.armor).toBe(1);
  });
});
