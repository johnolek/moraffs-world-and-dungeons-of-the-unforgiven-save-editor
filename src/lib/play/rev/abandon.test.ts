import { describe, expect, it } from 'vitest';
import { REV_DROP_ALL_COINS, REV_NO_TREASURE, revDropAllTheCoins } from './abandon';
import { REV_FOUR_SECONDS } from './held';
import { REV_WORN } from './magic';
import { REV_ARMOUR_VALUE, setRevValue, type RevPc } from './record';
import { revCharacter, revTestGame } from './spells.test-support';
import type { RevGame } from './state';

const KEY = (character: string) => character.charCodeAt(0);

/** A character in the third suit the store sells, carrying a pile of coins. */
function loaded(fields: Partial<RevPc> = {}): RevPc {
  const pc = revCharacter({ treasure: 900, weight: 400, ...fields });
  setRevValue(pc, REV_ARMOUR_VALUE, 3);
  return pc;
}

/** The screens the game asked to be left up, and how long each was asked for. */
function holding(game: RevGame): { ms: number; said: string[] }[] {
  const held: { ms: number; said: string[] }[] = [];
  game.delay = (ms) => held.push({ ms, said: [...game.said] });
  return held;
}

describe('the A key', () => {
  it('drops the coins and weighs the character as their armour and themselves', async () => {
    const pc = loaded();
    const { game, desk, keys } = revTestGame(pc);
    keys.push(KEY('Y'));
    await revDropAllTheCoins(game, desk);
    expect(pc.treasure).toBe(0);
    // 1000:1963 and 1000:19B5: twenty-five pounds a suit and a hundred and fifty of character.
    expect(pc.weight).toBe(25 * 3 + 150);
  });

  it('leaves the armour out of the sum for a character in magic armour', async () => {
    const pc = loaded({ rings: REV_WORN.magicArmour });
    const { game, desk, keys } = revTestGame(pc);
    keys.push(KEY('y'));
    await revDropAllTheCoins(game, desk);
    expect(pc.weight).toBe(150);
  });

  it('shows the statistics screen once the coins are gone', async () => {
    const pc = loaded();
    const out = revTestGame(pc);
    out.keys.push(KEY('Y'));
    await revDropAllTheCoins(out.game, out.desk);
    // 1000:19C7.
    expect(out.statsShown).toBe(1);
  });

  it('keeps the coins on a no, and says nothing more about them', async () => {
    const pc = loaded();
    const { game, desk, keys } = revTestGame(pc);
    keys.push(KEY('N'));
    await revDropAllTheCoins(game, desk);
    expect(pc.treasure).toBe(900);
    expect(pc.weight).toBe(400);
    // 1000:19F1 rubs the question out on the way back to the loop.
    expect(game.said).toEqual([]);
  });

  it('asks again after a key that is neither', async () => {
    const pc = loaded();
    const { game, desk, keys } = revTestGame(pc);
    keys.push(KEY('X'), KEY('Y'));
    await revDropAllTheCoins(game, desk);
    expect(pc.treasure).toBe(0);
  });

  it('gives up where a monster arrives on the square, with the question still up', async () => {
    const pc = loaded();
    const { game, desk } = revTestGame(pc);
    await revDropAllTheCoins(game, desk);
    expect(pc.treasure).toBe(900);
    // 1000:1959 goes straight back to the loop without the wipe at 1000:3029.
    expect(game.said).toEqual([REV_DROP_ALL_COINS]);
  });

  it('holds the refusal on the screen for four seconds where there is nothing to drop', async () => {
    const pc = revCharacter({ treasure: 0, weight: 150 });
    const { game, desk } = revTestGame(pc);
    const held = holding(game);
    await revDropAllTheCoins(game, desk);
    // 1000:1941: the doubled wait at 1000:2F35.
    expect(held).toEqual([{ ms: REV_FOUR_SECONDS, said: [REV_NO_TREASURE] }]);
    // 1000:1944 takes the line down before the next key.
    expect(game.said).toEqual([]);
  });

  it('tells the journal what was thrown away', async () => {
    const pc = loaded();
    const { game, desk, keys } = revTestGame(pc);
    keys.push(KEY('Y'));
    await revDropAllTheCoins(game, desk);
    expect(game.events).toContainEqual({ kind: 'treasureDropped', amount: 900 });
  });
});
