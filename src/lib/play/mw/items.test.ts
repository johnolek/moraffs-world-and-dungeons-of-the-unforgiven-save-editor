import { describe, expect, it } from 'vitest';
import data from '../../game/mw-data.json';
import type { MwStockedMonster } from '../../game/mw-port/stocking';
import { mwSetOccupant } from '../../game/mw-port/state';
import type { Rng } from '../../game/port/rng';
import type { MwGameSession } from './engine';
import { findMwSquare, mwCharacterFile, playingMw, pressMw } from './test-engine';
import { MW_KEY } from './keys';

/** An Rng whose every roll comes out as high as it can, so the kill runs the same way twice. */
const highest: Rng = { random: (n) => (n > 1 ? n - 1 : 0) };

/** ZEUS, the first of the ten monsters whose kind byte is 100. */
const ZEUS = data.monsters.findIndex((monster) => monster.kind === 100);

/** A square of the town with open air to the north, and nothing else on it. */
const facingNorth = () => findMwSquare(0, (square) => square.n === 3 && square.ladder === 0);

/** Put a monster on the square the character faces. */
function standInFront(monster: Partial<MwStockedMonster> = {}): (session: MwGameSession) => void {
  return (session) => {
    const pc = session.game.pc;
    const placed: MwStockedMonster = { x: pc.x, y: pc.y - 1, hp: 40, type: 1, depth: 3, ...monster };
    Object.assign(session.game.monsters[0], placed);
    mwSetOccupant(session.game, placed.x, placed.y, 0);
  };
}

/** The I key, and then the fifth line of its menu. */
const USE_ITEM_OTHER = [MW_KEY.useItem, 0x35];

describe("the I key's fifth line", () => {
  it('kills the monster being fought with a hand grenade', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, dir: 0, grenades: 2, lev: 40, ...facingNorth() }),
      highest,
      standInFront(),
    );
    for (const key of USE_ITEM_OTHER) await pressMw(session, key);
    expect(session.box).toContain('6) HOLY HAND GRENADE');
    await pressMw(session, 0x36);
    expect(session.box).toContain('A MASSIVE EXPLOSION KILLS');
    expect(session.game.pc.grenades).toBe(1);
    // The kill itself happens where movecontrol makes every kill happen, after the key.
    await pressMw(session, MW_KEY.escape);
    expect(session.game.engaged).toBe(-1);
    expect(session.game.pc.exp).toBeGreaterThan(0);
    expect(session.game.messages).toContain('YOU KILLED IT!');
  });

  it('is caught by a monster no spell touches, and the grenade comes back', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, dir: 0, grenades: 2, ...facingNorth() }),
      highest,
      standInFront({ type: ZEUS, hp: 900 }),
    );
    for (const key of USE_ITEM_OTHER) await pressMw(session, key);
    await pressMw(session, 0x36);
    expect(session.box).toContain('   THE MONSTER CATCHES THE');
    await pressMw(session, MW_KEY.escape);
    expect(session.box).toContain('  HE THEN LAUGHS HYSTERICALLY');
    expect(session.game.pc.grenades).toBe(2);
    expect(session.game.monsters[0].hp).toBe(900);
  });

  it('only asks about the empty floor with nothing being fought', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, dir: 0, grenades: 1, ...facingNorth() }),
    );
    for (const key of USE_ITEM_OTHER) await pressMw(session, key);
    await pressMw(session, 0x36);
    expect(session.box).toContain('ARE YOU SURE THAT YOU WANT');
    expect(session.game.pc.grenades).toBe(1);
  });

  it('fills the hit points back up out of a potion of healing', async () => {
    const session = playingMw(
      mwCharacterFile({ floor: 0, healingPotions: 1, hp: 12, maxHp: 200, ...facingNorth() }),
    );
    for (const key of USE_ITEM_OTHER) await pressMw(session, key);
    await pressMw(session, 0x32);
    expect(session.game.pc.hp).toBe(200);
    expect(session.game.pc.healingPotions).toBe(0);
  });

  it('teleports back to the town, and the town is the floor drawn', async () => {
    const start = findMwSquare(30, (square) => square.ladder === 0);
    const session = playingMw(
      mwCharacterFile({ floor: 30, teleportStones: 1, ...start }),
    );
    for (const key of USE_ITEM_OTHER) await pressMw(session, key);
    await pressMw(session, 0x35);
    expect(session.box).toContain('YOU ARE FLOATING THROUGH');
    expect(session.view().place.floor).toBe(0);
    expect(session.rows[session.game.pc.y][session.game.pc.x].solid).toBe(false);
  });

  it('sloshes through the floor onto the one below it', async () => {
    const start = findMwSquare(10, (square) => square.ladder === 0);
    const session = playingMw(mwCharacterFile({ floor: 10, floorSloshers: 1, ...start }));
    for (const key of USE_ITEM_OTHER) await pressMw(session, key);
    await pressMw(session, 0x31);
    expect(session.box).toContain('YOU ARE SLIPPING THROUGH THE');
    expect(session.view().place.floor).toBe(11);
    expect(session.rows[session.game.pc.y][session.game.pc.x].solid).toBe(false);
  });

  it('answers a wish with the million zillion dollar club', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, ...facingNorth() }));
    for (const key of USE_ITEM_OTHER) await pressMw(session, key);
    await pressMw(session, 0x33);
    expect(session.box).toContain('3) RULE THE WORLD');
    await pressMw(session, 0x33);
    expect(session.box).toContain('THE MILLION ZILLION DOLLAR CLUB');
    await pressMw(session, MW_KEY.escape);
    expect(session.box).toContain('BY THE WAY, A FIRST CLASS STAMP');
  });

  it('says the character has none of an item they have none of', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, ...facingNorth() }));
    for (const key of USE_ITEM_OTHER) await pressMw(session, key);
    await pressMw(session, 0x34);
    expect(session.box).toContain('MAGIC ITEMS ARE MUCH MORE');
  });
});
