import { describe, expect, it, vi } from 'vitest';
import { MONSTERS } from '../../mw-bestiary/monsters';
import type { MwStockedMonster } from '../../game/mw-port/stocking';
import { mwSetOccupant } from '../../game/mw-port/state';
import { BorlandRng, type Rng } from '../../game/port/rng';
import type { MwGameSession } from './engine';
import { spendTime } from '../../game/mw-port/combat';
import { startMwGame } from './engine';
import { findMwSquare, mwCharacterFile, playingMw, pressMw } from './test-engine';
import { MW_KEY } from './keys';

/** An Rng whose every roll comes out as high as it can, so a swing lands and does damage. */
const highest: Rng = { random: (n) => (n > 1 ? n - 1 : 0) };

/** A square of the town with open air to the north, and the square north of it. */
const facingNorth = () => findMwSquare(0, (square) => square.n === 3 && square.ladder === 0);

/** Put a monster on the square the character faces, which is the town's floor 0, so nothing
 *  else is standing on it. */
function standInFront(monster: Partial<MwStockedMonster> = {}): (session: MwGameSession) => void {
  return (session) => {
    const pc = session.game.pc;
    const placed: MwStockedMonster = { x: pc.x, y: pc.y - 1, hp: 40, type: 1, depth: 3, ...monster };
    Object.assign(session.game.monsters[0], placed);
    mwSetOccupant(session.game, placed.x, placed.y, 0);
  };
}

describe('the F key', () => {
  it('takes hit points off the monster in front of the character', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, dir: 0, weapon: 6, str: 80, luck: 80, lev: 40, ...facingNorth() }),
      highest,
      standInFront({ hp: 4000 }),
    );
    await pressMw(session, MW_KEY.fight);
    expect(session.game.monsters[0].hp).toBeLessThan(4000);
    expect(session.banner.join('\n')).toContain('YOU HIT! THE MONSTER IN THE');
  });

  it('kills the monster once its hit points have run out', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, dir: 0, weapon: 6, str: 80, luck: 80, lev: 40, ...facingNorth() }),
      highest,
      standInFront({ hp: 1 }),
    );
    const worth = MONSTERS[1].expMult;
    expect(worth).toBeGreaterThan(0);
    await pressMw(session, MW_KEY.fight);
    expect(session.game.monsters[0].hp).toBe(0);
    expect(session.game.engaged).toBe(-1);
    expect(session.game.pc.exp).toBeGreaterThan(0);
    expect(session.game.messages).toContain('YOU KILLED IT!');
  });

  it('says nothing at all with nothing to fight', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, dir: 0, ...facingNorth() }));
    await pressMw(session, MW_KEY.fight);
    expect(session.box).toEqual([]);
  });
});

describe('two monsters that both get a turn', () => {
  /** A floor-3 square with open air to the north and to the south, and a monster on each.
   *  The rng is the game's own here rather than {@link highest}, which sends stocking's search
   *  for an empty square round for ever. */
  const between = () => findMwSquare(3, (square) => square.n === 3 && square.s === 3);

  const bothAttack = () => {
    const spot = between();
    const session = startMwGame(mwCharacterFile({ floor: 3, dir: 0, ...spot }), new BorlandRng(3));
    const game = session.game;
    // Every other monster on the floor is pushed out of reach of a turn, so the pass is these
    // two and nothing else.
    game.monsterTimers.fill(1000);
    const sides = [
      { x: spot.x, y: spot.y - 1 },
      { x: spot.x, y: spot.y + 1 },
    ];
    sides.forEach((side, slot) => {
      Object.assign(game.monsters[slot], { ...side, hp: 40, type: 1, depth: 3 });
      mwSetOccupant(game, side.x, side.y, slot);
      game.monsterTimers[slot] = -1;
    });
    session.fighting(() => spendTime(game, 1));
    return session;
  };

  it('opens each attack on a blank strip and holds its message on its own', () => {
    vi.useFakeTimers();
    try {
      const session = bothAttack();
      // Every strip the tab draws in turn, one entry per change, which is the order a player
      // reads them in.
      const shown = [session.view().banner.join('\n')];
      for (let ms = 0; ms < 2000; ms += 10) {
        vi.advanceTimersByTime(10);
        const now = session.view().banner.join('\n');
        if (now !== shown[shown.length - 1]) shown.push(now);
      }
      const live = session.banner.join('\n');
      session.finish();
      expect(shown).toEqual([
        '',
        expect.stringContaining('NORTH'),
        '',
        expect.stringContaining('SOUTH'),
      ]);
      expect(live).toContain('SOUTH');
    } finally {
      vi.useRealTimers();
    }
  });
});
