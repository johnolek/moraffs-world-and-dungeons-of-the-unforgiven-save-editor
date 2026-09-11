import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as speaker from '../../speaker';
import type { MwStockedMonster } from '../../game/mw-port/stocking';
import { mwSetOccupant } from '../../game/mw-port/state';
import type { Rng } from '../../game/port/rng';
import type { MwGameSession } from './engine';
import { findMwSquare, mwCharacterFile, playingMw, pressMw } from './test-engine';
import { MW_KEY } from './keys';

/**
 * The speaker is the one thing these tests watch. It is watched rather than stood in for: nothing
 * has opened one under Node, so playing a sequence already does nothing, and a spy on the module
 * every caller shares counts the calls wherever the caller was loaded from.
 */
const playTones = vi.spyOn(speaker, 'playTones');
afterAll(() => playTones.mockRestore());

/** An Rng whose every roll comes out as high as it can, so a swing lands and does damage. */
const highest: Rng = { random: (n) => (n > 1 ? n - 1 : 0) };

/** A square of the town with open air to the north, and the square north of it. */
const facingNorth = () => findMwSquare(0, (square) => square.n === 3 && square.ladder === 0);

/** Put a monster on the square the character faces, on the town's own floor so that nothing else
 *  is standing there. */
function standInFront(hp: number): (session: MwGameSession) => void {
  return (session) => {
    const pc = session.game.pc;
    const placed: MwStockedMonster = { x: pc.x, y: pc.y - 1, hp, type: 1, depth: 3 };
    Object.assign(session.game.monsters[0], placed);
    mwSetOccupant(session.game, placed.x, placed.y, 0);
  };
}

/** A character strong enough that one swing lands, facing a monster with `hp` hit points. */
function fighting(hp: number): MwGameSession {
  return playingMw(
    mwCharacterFile({ floor: 0, dir: 0, weapon: 6, str: 80, luck: 80, lev: 40, ...facingNorth() }),
    highest,
    standInFront(hp),
  );
}

beforeEach(() => playTones.mockClear());

describe('the sound switch', () => {
  it('silences the blow that lands', async () => {
    const session = fighting(4000);
    await pressMw(session, MW_KEY.sound);
    playTones.mockClear();
    await pressMw(session, MW_KEY.fight);
    expect(session.game.monsters[0].hp).toBeLessThan(4000);
    expect(playTones).not.toHaveBeenCalled();
  });

  it('silences the kill, which the port runs twice over for its menus', async () => {
    const session = fighting(1);
    await pressMw(session, MW_KEY.sound);
    playTones.mockClear();
    await pressMw(session, MW_KEY.fight);
    expect(session.game.monsters[0].hp).toBe(0);
    expect(playTones).not.toHaveBeenCalled();
  });

  it('plays the kill once with the sound left on', async () => {
    const session = fighting(1);
    await pressMw(session, MW_KEY.fight);
    expect(session.game.monsters[0].hp).toBe(0);
    // The blow that landed and the chime for the kill, and neither of them twice.
    expect(playTones).toHaveBeenCalledTimes(2);
  });
});
