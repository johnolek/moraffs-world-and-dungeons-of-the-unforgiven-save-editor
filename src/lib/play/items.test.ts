import { describe, expect, it } from 'vitest';
import { BorlandRng, type Rng } from '../game/port/rng';
import { UNFORGIVEN_MAP } from '../map/game';
import { characterFile, findSquare, floorSquare, inTheTown, press, settle, startPlaying } from './battle.test-support';
import { KEY } from './keys';

/** A generator that rolls the lowest number it can; nothing in these keys rolls for anything. */
const lowest: Rng = { random: () => 0 };

describe('the I key', () => {
  it('drinks a potion of healing off the magic menu', async () => {
    const session = inTheTown(lowest, { healingPotions: 2, hp: 5, maxHp: 300 });
    await settle();
    await press(session, KEY.useItem);
    expect(session.box[0]).toBe('WHICH TYPE OF ITEM?');
    expect(session.view().box.map((line) => line.text)).toContain('USE MAGIC MENU:');
    await press(session, 0x35);
    expect(session.box[0]).toBe('HIT A KEY (1-6):');
    await press(session, 0x32);
    expect(session.game.pc.hp).toBe(300);
    expect(session.game.pc.healingPotions).toBe(1);
    expect(session.view().box.map((line) => line.text)).not.toContain('USE MAGIC MENU:');
  });

  it('fills the floor in with a stone of seeing', async () => {
    const level = 3;
    const rows = UNFORGIVEN_MAP.floor(level, 0);
    // A floor of the dungeon has 145 monsters to place, which needs a generator that gives more
    // than one number.
    const session = startPlaying(
      characterFile({ level, dir: 0, ...floorSquare(level), seeingStones: 1 }),
      new BorlandRng(3),
    );
    await settle();
    // The views drawn on arrival have already marked some of the walls around the character, so
    // the rock the stone must leave alone is the rock nobody has seen yet.
    const open: [number, number][] = [];
    const unseenRock: [number, number][] = [];
    for (let y = 0; y < session.game.rows; y++) {
      for (let x = 0; x < session.game.columns; x++) {
        if (!rows[y][x].solid) open.push([x, y]);
        else if (!session.memory.isKnown(x, y)) unseenRock.push([x, y]);
      }
    }
    expect(open.filter(([x, y]) => session.memory.isKnown(x, y)).length).toBeLessThan(open.length);

    await press(session, KEY.useItem);
    await press(session, 0x35);
    await press(session, 0x34);

    expect(session.game.pc.seeingStones).toBe(0);
    expect(open.filter(([x, y]) => !session.memory.isKnown(x, y))).toEqual([]);
    expect(unseenRock.filter(([x, y]) => session.memory.isKnown(x, y))).toEqual([]);
  });

  it('lands on the floor below when the floor slosher is used', async () => {
    // A square of the town that is rock on the floor below it, so the slosher has to roll another.
    const townRows = UNFORGIVEN_MAP.floor(0, 0);
    const floorBelow = UNFORGIVEN_MAP.floor(1, 0);
    const start = findSquare(0, (square, x, y) => square.town === 0 && square.ladder === 0 && floorBelow[y][x].solid);
    expect(townRows[start.y][start.x].solid).toBe(false);
    // A floor of the dungeon has 145 monsters to place, which needs a generator that gives more
    // than one number.
    const session = startPlaying(characterFile({ level: 0, dir: 0, ...start, slosher: 1 }), new BorlandRng(3));
    await settle();
    await press(session, KEY.useItem);
    await press(session, 0x35);
    await press(session, 0x31);
    const pc = session.game.pc;
    expect(pc.level).toBe(1);
    expect(pc.slosher).toBe(1);
    // use_magic_item reloads the floor around the character, so the screen draws the floor they
    // slipped onto rather than the town, and the square they landed on is open on it.
    expect(session.rows.flat().some((square) => square.town !== 0)).toBe(false);
    expect(session.rows[pc.y][pc.x].solid).toBe(false);
    expect(session.view().monsters.length).toBeGreaterThan(0);
  });

  it('lands in the town when a stone of teleportation is used', async () => {
    const level = 3;
    const session = startPlaying(
      characterFile({ level, dir: 0, ...floorSquare(level), teleportStones: 1 }),
      new BorlandRng(3),
    );
    await settle();
    await press(session, KEY.useItem);
    await press(session, 0x35);
    await press(session, 0x35);
    const pc = session.game.pc;
    expect(pc.level).toBe(0);
    expect(pc.teleportStones).toBe(0);
    expect(session.rows.flat().some((square) => square.town !== 0)).toBe(true);
    expect(session.rows[pc.y][pc.x].solid).toBe(false);
  });

  it('casts out of the scrolls when the first line is picked', async () => {
    const session = inTheTown(lowest);
    await settle();
    await press(session, KEY.useItem);
    await press(session, 0x31);
    expect(session.box.join('\n')).not.toContain('NOT BUILT YET');
  });
});

describe('the L key', () => {
  it('drops one of the suits of armor the character owns', async () => {
    const session = inTheTown(lowest, { armorOwned: [1, 0, 2, 0, 0, 0, 0, 0], armor: 2 });
    await settle();
    await press(session, KEY.loseItem);
    expect(session.box[0]).toBe('WHICH TYPE OF ITEM WOULD YOU');
    await press(session, 0x31);
    expect(session.box).toContain('CHAIN');
    await press(session, 0x33);
    expect(session.game.pc.armorOwned[2]).toBe(1);
    expect(session.game.pc.armor).toBe(2);
  });

  it('will not let the character drop their own skin', async () => {
    const session = inTheTown(lowest);
    await settle();
    await press(session, KEY.loseItem);
    await press(session, 0x31);
    await press(session, 0x31);
    expect(session.box).toContain("OWE! IT JUST WON'T COME OFF!");
    expect(session.game.pc.armorOwned[0]).toBe(1);
  });
});
