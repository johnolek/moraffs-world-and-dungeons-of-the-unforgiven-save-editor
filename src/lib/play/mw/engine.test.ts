import { describe, expect, it } from 'vitest';
import { bundledMwDungeon } from '../../game/mw-dungeon';
import { blankMwCharacter, MW_SQUARE_PLAYER, mwMessageLine, mwOccupantAt, mwSetOccupant, type MwCharacter } from '../../game/mw-port/state';
import { BorlandRng, type Rng } from '../../game/port/rng';
import { EXPLORED_STRIDE } from '../../map/explored';
import { MORAFFS_WORLD_MAP, type MapSquare } from '../../map/game';
import { MwGameSession, startMwGame, type MwCharacterFile } from './engine';
import { MW_KEY } from './keys';
import { findMwSquare, mwCharacterFile, playingMw, pressMw, settleMw } from './test-engine';
import { VIEW_DEPTH } from '../memory';
import { loadMwPlayer, saveMwPlayer } from './record';

/** A square of the town with nothing on it and a way out to the north. */
const townWalk = () =>
  findMwSquare(
    0,
    (square, x, y) =>
      square.n === 3 &&
      square.ladder === 0 &&
      bundledMwDungeon.surface(x, y, 0, 0) === 0 &&
      bundledMwDungeon.trapdoor(x, y, 0, 0) === -1,
  );

describe('walking', () => {
  it('takes the trap door’s box down with the first step off the square', async () => {
    const door = findMwSquare(
      3,
      (square, x, y) => bundledMwDungeon.trapdoor(x, y, 3, 0) !== -1 && square.n === 3 && square.ladder === 0,
    );
    const session = playingMw(mwCharacterFile({ floor: 3, dir: 0, ...door }));
    await new Promise((resolve) => setTimeout(resolve));
    expect(session.box[0]).toContain('TRAP DOOR');
    // FUN_2000_a57e wipes a box flagged at DS:45c7 as it takes the character off the square.
    await pressMw(session, MW_KEY.arrowUp);
    expect(session.view().place).toMatchObject({ x: door.x, y: door.y - 1 });
    expect(session.box).toEqual([]);
  });

  it('faces the way the arrow points and steps that way', async () => {
    const start = townWalk();
    const session = playingMw(mwCharacterFile({ floor: 0, dir: 1, ...start }));
    await pressMw(session, MW_KEY.arrowUp);
    expect(session.view().place).toMatchObject({ x: start.x, y: start.y - 1, dir: 0 });
  });

  it('says so when the way ahead is a wall', async () => {
    const start = findMwSquare(0, (square) => square.n === 0 && square.s === 3);
    const session = playingMw(mwCharacterFile({ floor: 0, dir: 1, ...start }));
    await pressMw(session, MW_KEY.arrowUp);
    // The line goes where the game draws it, over the top left of the map rather than in the box.
    expect(session.banner).toEqual(['THE WALL REFUSES TO MOVE']);
    expect(session.view().place).toMatchObject({ x: start.x, y: start.y });
  });

  it('says a door is jammed when something stands behind it, and holds the line', async () => {
    const start = findMwSquare(
      0,
      (square, x, y) => square.n === 1 && square.ladder === 0 && square.surface === 0
        && bundledMwDungeon.trapdoor(x, y, 0, 0) === -1,
    );
    const delays: number[] = [];
    const session = playingMw(
      mwCharacterFile({ floor: 0, dir: 1, ...start }),
      new BorlandRng(3),
      (ready) => {
        const hold = ready.game.delay;
        ready.game.delay = (ms) => {
          delays.push(ms);
          hold(ms);
        };
        mwSetOccupant(ready.game, start.x, start.y - 1, 0);
      },
    );
    await pressMw(session, MW_KEY.arrowUp);
    expect(session.banner).toEqual(['THE DOOR IS JAMMED']);
    expect(delays).toEqual([350]);
    expect(session.view().place).toMatchObject({ x: start.x, y: start.y });
  });

  it('spends the moment a step costs', async () => {
    const start = townWalk();
    // The session recomputes the weight carried on the way in, so the naked weight is what
    // makes the step expensive.
    const session = playingMw(mwCharacterFile({ floor: 0, dir: 0, dex: 5, weight: 250, ...start }));
    const before = session.view().moves;
    await pressMw(session, MW_KEY.arrowUp);
    // A step costs (250 + 100 - 50) / 100 + 1 = 4 moves, and half the time nothing at all.
    expect([before, before + 4]).toContain(session.view().moves);
  });

  it('spends a moment where it stands for the wait key', async () => {
    const start = townWalk();
    const session = playingMw(mwCharacterFile({ floor: 0, dir: 0, dex: 5, ...start }));
    await pressMw(session, MW_KEY.wait);
    expect(session.view().place).toMatchObject({ x: start.x, y: start.y });
  });

  it('hands a ring of regeneration a hit point a step', async () => {
    const start = townWalk();
    const session = playingMw(
      mwCharacterFile({ floor: 0, dir: 0, hp: 100, maxHp: 200, regenRings: 3, ...start }),
    );
    await pressMw(session, MW_KEY.arrowUp);
    expect(session.game.pc.hp).toBe(103);
  });
});

describe('the message box', () => {
  it('is cleared by the next key', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, ...townWalk() }));
    await pressMw(session, MW_KEY.zoomView);
    expect(session.box.length).toBeGreaterThan(0);
    await pressMw(session, MW_KEY.escape);
    expect(session.box).toEqual([]);
  });

  it('takes the strip above the box off with it', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, ...townWalk() }));
    const game = session.game;
    game.draw(mwMessageLine('NOTHING! (HIT ANY KEY)', 8));
    await pressMw(session, MW_KEY.escape);
    expect(game.screen).toEqual([]);
  });
});

describe('an edit in the save editor', () => {
  /** The record as the editor leaves it: the character the file holds, with fields changed. */
  function edited(file: MwCharacterFile, overrides: Partial<MwCharacter>): Uint8Array<ArrayBuffer> {
    return saveMwPlayer({ ...loadMwPlayer(file.bytes), ...overrides }, file.bytes);
  }

  /** Let the loop take an edit without pressing anything. */
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it('plays on with the character the editor wrote', async () => {
    const file = mwCharacterFile({ floor: 0, dir: 0, ...townWalk(), str: 20 });
    const session = playingMw(file);
    await settle();
    session.recordEdited(edited(file, { str: 99 }));
    await settle();
    expect(session.game.pc.str).toBe(99);
  });

  it('moves the character about the floor they are on', async () => {
    const start = townWalk();
    const file = mwCharacterFile({ floor: 0, dir: 0, ...start });
    const session = playingMw(file);
    await settle();
    const moved = findMwSquare(0, (square, x, y) => square.ladder === 0 && (x !== start.x || y !== start.y));
    session.recordEdited(edited(file, moved));
    await settle();
    expect(session.view().place).toMatchObject(moved);
    expect(mwOccupantAt(session.game, start.x, start.y)).toBe(-1);
    expect(mwOccupantAt(session.game, moved.x, moved.y)).toBe(MW_SQUARE_PLAYER);
  });

  it('enters the floor the record puts the character on', async () => {
    const file = mwCharacterFile({ floor: 0, dir: 0, ...townWalk() });
    const session = playingMw(file);
    await settle();
    const landing = findMwSquare(
      3,
      (square, x, y) =>
        square.ladder === 0 &&
        bundledMwDungeon.chute(x, y, 3, 0) === 3 &&
        bundledMwDungeon.trapdoor(x, y, 3, 0) === -1,
    );
    session.recordEdited(edited(file, { floor: 3, ...landing }));
    await settle();
    expect(session.view().place).toMatchObject({ floor: 3, ...landing });
    expect(session.floors.remembered[0]).toBe(3);
  });

  it('leaves the game alone when the record the game saved comes back', async () => {
    const file = mwCharacterFile({ floor: 0, dir: 0, ...townWalk(), str: 20 });
    const session = playingMw(file);
    await settle();
    session.save();
    // Everything the game has done since its own save would be undone by reading the record
    // again, which is what this asks about.
    session.game.pc.str = 99;
    session.recordEdited(file.bytes);
    await settle();
    expect(session.game.pc.str).toBe(99);
  });

  it('waits for the screen the game is showing to come down', async () => {
    const file = mwCharacterFile({ floor: 0, dir: 0, ...townWalk(), str: 20 });
    const session = playingMw(file);
    await pressMw(session, MW_KEY.viewPrepSpells);
    session.recordEdited(edited(file, { str: 99 }));
    await settle();
    expect(session.game.pc.str).toBe(20);
    await pressMw(session, MW_KEY.escape);
    expect(session.game.pc.str).toBe(99);
  });
});

describe('the map the character discovers', () => {
  it('knows the square underfoot and what the four compass views reach, and no further', async () => {
    const start = townWalk();
    const session = playingMw(mwCharacterFile({ floor: 0, dir: 0, ...start }));
    await settleMw();
    expect(session.memory.isKnown(start.x, start.y)).toBe(true);
    const known = [...session.memory.knownSquares()];
    expect(known.length).toBeGreaterThan(1);
    for (const index of known) {
      const x = index % EXPLORED_STRIDE;
      const y = (index - x) / EXPLORED_STRIDE;
      expect(Math.max(Math.abs(x - start.x), Math.abs(y - start.y))).toBeLessThanOrEqual(VIEW_DEPTH);
    }
  });

  it('knows the town a game starts in before the loop has taken a pass', () => {
    const start = townWalk();
    const session = startMwGame(mwCharacterFile({ floor: 0, dir: 0, ...start }), new BorlandRng(3));
    expect(session.memory.isKnown(start.x, start.y)).toBe(true);
    expect(session.memory.knownSquares().size).toBeGreaterThan(1);
  });

  it('knows where a chute has dropped the character, behind its own message', async () => {
    const chute = findMwSquare(
      3,
      (square, x, y) =>
        square.ladder === 0 &&
        bundledMwDungeon.chute(x, y, 3, 0) !== 3 &&
        bundledMwDungeon.trapdoor(x, y, 3, 0) === -1,
    );
    const session = playingMw(mwCharacterFile({ floor: 3, ...chute }));
    await settleMw();
    expect(session.view().place.floor).toBe(bundledMwDungeon.chute(chute.x, chute.y, 3, 0));
    expect(session.memory.isKnown(chute.x, chute.y)).toBe(true);
    expect(session.memory.knownSquares().size).toBeGreaterThan(1);
  });

  it('keeps every square it has learned as the character walks', async () => {
    const start = townWalk();
    const session = playingMw(mwCharacterFile({ floor: 0, dir: 0, ...start }));
    await settleMw();
    const before = [...session.memory.knownSquares()];
    await pressMw(session, MW_KEY.arrowUp);
    expect(session.view().place.y).toBe(start.y - 1);
    const after = session.memory.knownSquares();
    for (const square of before) expect(after.has(square)).toBe(true);
  });
});

describe('falling down a chute', () => {
  it("leaves the first line standing on its own before it says what happened", async () => {
    const chute = findMwSquare(
      3,
      (square, x, y) =>
        square.ladder === 0 &&
        bundledMwDungeon.chute(x, y, 3, 0) !== 3 &&
        bundledMwDungeon.trapdoor(x, y, 3, 0) === -1,
    );
    const session = playingMw(mwCharacterFile({ floor: 3, ...chute }));
    await settleMw();
    // The three lines are print_text calls down the strip at the top left, not a box of eight.
    expect(session.game.screen.map((line) => line.text)).toEqual([
      'UH OH... A SINKING FEELING...',
      'YOU HAVE FALLEN DOWN A CHUTE!',
      '  HIT ANY KEY TO CONTINUE...',
    ]);
    expect(session.view().box).toEqual([]);
    // ...and the tab is holding the first of them alone, which is chute's own second and a half.
    expect(session.view().screen.map((line) => line.text)).toEqual(['UH OH... A SINKING FEELING...']);
  });
});

describe('the monster the map draws a close-up of', () => {
  /** A generator whose every roll comes out as high as it can, so a swing lands and hurts. */
  const highest: Rng = { random: (n) => (n > 1 ? n - 1 : 0) };

  /** Put a monster on the square the character faces. The town has none of its own, so this is
   *  the only thing on the floor. */
  const standInFront = (hp: number) => (session: MwGameSession) => {
    const pc = session.game.pc;
    Object.assign(session.game.monsters[0], { x: pc.x, y: pc.y - 1, hp, type: 1, depth: 3 });
    mwSetOccupant(session.game, pc.x, pc.y - 1, 0);
  };

  const fighter = () =>
    mwCharacterFile({
      floor: 0,
      dir: 0,
      weapon: 6,
      str: 80,
      luck: 80,
      lev: 40,
      ...findMwSquare(0, (square) => square.n === 3 && square.ladder === 0),
    });

  it('carries the hit points it was stocked with, whatever a swing has left it', async () => {
    const session = playingMw(fighter(), highest, standInFront(4000));
    await settleMw();
    expect(session.view().engagedFullHp).toBe(4000);
    await pressMw(session, MW_KEY.fight);
    expect(session.view().engaged?.hp).toBeLessThan(4000);
    expect(session.view().engagedFullHp).toBe(4000);
  });

  it('carries the lines the screen and debug mode print over it, and none with nothing faced', async () => {
    const session = playingMw(fighter(), highest, standInFront(400));
    await settleMw();
    const lines = session.view().engagedDebugLines;
    expect(lines[0]).toMatch(/^HIT:\d+\.\d%$/);
    expect(lines[1]).toMatch(/^IT HITS:\d+\.\d%$/);
    const shown = session.view().engagedViewLines;
    expect(shown[0]).toMatch(/^LEV(EL)?:\d+$/);
    expect(shown[1]).toMatch(/^HP:\d+$/);
    expect(shown[2]).toMatch(/\d$/);
    session.game.engaged = -1;
    expect(session.view().engaged).toBeNull();
    expect(session.view().engagedFullHp).toBe(0);
    expect(session.view().engagedViewLines).toEqual([]);
    expect(session.view().engagedDebugLines).toEqual([]);
  });
});
