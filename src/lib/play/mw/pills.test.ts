import { describe, expect, it } from 'vitest';
import { findMwSquare, mwCharacterFile, playingMw, pressMw } from './test-engine';
import { MW_KEY } from './keys';

/** A square of the town with nothing on it, so the I key is the only thing happening. */
const townSquare = () => findMwSquare(0, (square) => square.ladder === 0);

/** The I key, and then the fourth line of its menu. */
const USE_ITEM_PILLS = [MW_KEY.useItem, 0x34];

describe("the I key's fourth line", () => {
  it('swallows a pill and moves the two characteristics it trades', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, pills: [0, 0, 0, 2, 0, 0], con: 20, wis: 20, ...townSquare() }),
    );
    for (const key of USE_ITEM_PILLS) await pressMw(session, key);
    expect(session.box).toContain('4) RED PILL');
    await pressMw(session, 0x34);
    expect(session.game.pc.con).toBe(24);
    expect(session.game.pc.wis).toBe(18);
    expect(session.game.pc.pills[3]).toBe(1);
    expect(session.box).toContain('YOUR CONSTITUTION HAS BEEN');
  });

  it('says to go and find one for a pill the character has none of', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, pills: [0, 0, 0, 0, 0, 0], ...townSquare() }),
    );
    for (const key of USE_ITEM_PILLS) await pressMw(session, key);
    await pressMw(session, 0x31);
    expect(session.box).toContain("DON'T YOU THINK YOU'D BETTER");
  });

  it('takes nothing when the menu is escaped', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, pills: [1, 1, 1, 1, 1, 1], ...townSquare() }),
    );
    for (const key of USE_ITEM_PILLS) await pressMw(session, key);
    await pressMw(session, MW_KEY.escape);
    expect(session.game.pc.pills).toEqual([1, 1, 1, 1, 1, 1]);
    expect(session.box).toEqual([]);
  });
});
