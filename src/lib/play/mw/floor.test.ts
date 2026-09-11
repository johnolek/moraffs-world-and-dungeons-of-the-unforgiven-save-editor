import { describe, expect, it } from 'vitest';
import { MORAFFS_WORLD_MAP } from '../../map/game';
import { mwEnterLevel } from './floor';
import { findMwSquare, mwCharacterFile, playingMw, pressMw } from './test-engine';
import { MW_KEY } from './keys';

/** A square of the town with a ladder that goes down. */
const ladderDown = () => findMwSquare(0, (square) => square.ladder > 0);

/** Every monster on the floor, as the map draws them, sorted so two rolls can be compared. */
const drawn = (monsters: { slot: number; x: number; y: number; hp: number }[]) =>
  monsters.map((monster) => `${monster.slot}:${monster.x},${monster.y},${monster.hp}`).sort();

describe('the ladders', () => {
  it('takes the character down and stocks the floor they arrive on', async () => {
    const start = ladderDown();
    const session = playingMw(mwCharacterFile({ floor: 0, ...start }));
    expect(session.view().monsters).toEqual([]);
    await pressMw(session, MW_KEY.down);
    const place = session.view().place;
    expect(place.floor).toBeGreaterThan(0);
    expect(place).toMatchObject({ x: start.x, y: start.y });
    expect(session.view().monsters.length).toBeGreaterThan(0);
    expect(session.rows).toEqual(MORAFFS_WORLD_MAP.floor(place.floor, 0));
  });

  it('says nothing at all for a D on a square with no ladder', async () => {
    const start = findMwSquare(0, (square) => square.ladder === 0 && square.surface === 0);
    const session = playingMw(mwCharacterFile({ floor: 0, ...start }));
    await pressMw(session, MW_KEY.down);
    // Floor 0 has no ladder here, so D digs a hole instead and asks whether to.
    expect(session.box).toContain('1) DIG A HOLE IN THE FLOOR');
  });
});

describe('the three floors the game remembers', () => {
  it('finds the monsters where they were left on going back to a floor', async () => {
    const start = ladderDown();
    const session = playingMw(mwCharacterFile({ floor: 0, ...start }));
    await pressMw(session, MW_KEY.down);
    const below = session.view().place.floor;
    const first = drawn(session.view().monsters);
    await pressMw(session, MW_KEY.up);
    expect(session.view().place.floor).toBe(0);
    expect(session.floors.remembered).toEqual([0, below, null]);
    await pressMw(session, MW_KEY.down);
    expect(drawn(session.view().monsters)).toEqual(first);
    expect(session.floors.remembered).toEqual([below, 0, null]);
  });
});

describe('the hit points a monster was stocked with', () => {
  it('is the roll, whatever the monster has left', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, ...ladderDown() }));
    await pressMw(session, MW_KEY.down);
    const rolled = session.game.monsters[7].hp;
    expect(rolled).toBeGreaterThan(1);
    session.game.monsters[7].hp = 1;
    expect(session.floors.fullHp(7, 1)).toBe(rolled);
  });

  it('is the hit points first seen for a monster the floor was not stocked with', () => {
    // The surface is emptied and never stocked, so a monster standing on it has no roll behind
    // it, which is the case a floor read back from a save would be in.
    const session = playingMw(mwCharacterFile({ floor: 0, ...ladderDown() }));
    expect(session.floors.fullHp(0, 30)).toBe(30);
    expect(session.floors.fullHp(0, 12)).toBe(30);
  });

  it('is the fresh roll on a floor rolled again', () => {
    const session = playingMw(mwCharacterFile({ floor: 0, ...ladderDown() }));
    const { game, floors } = session;
    const enter = (level: number) =>
      mwEnterLevel(game, floors, MORAFFS_WORLD_MAP.floor(level, game.pc.dungeon), level, game.rng);
    enter(3);
    const first = floors.fullHp(7, game.monsters[7].hp);
    for (const level of [4, 5, 6, 3]) enter(level);
    expect(game.monsters[7].hp).not.toBe(first);
    expect(floors.fullHp(7, 1)).toBe(game.monsters[7].hp);
  });
});
