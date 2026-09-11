import { describe, expect, it } from 'vitest';
import { readScalar } from '../../editor/fields';
import { MORAFFS_WORLD } from '../../editor/games';
import type { ScalarField } from '../../editor/schema';
import { BorlandRng } from '../../game/port/rng';
import { findMwSquare, mwCharacterFile, playingMw, pressMw, settleMw } from './test-engine';
import { MW_KEY } from './keys';
import { loadMwPlayer } from './record';

/** A square of the town with a way out to the north and nothing else on it. */
const townWalk = () =>
  findMwSquare(0, (square) => square.n === 3 && square.ladder === 0 && square.surface === 0);

/** What the Save Editor's Moraff's World schema reads at one of its own fields. */
function editorField(bytes: Uint8Array, label: string): string | number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const section of MORAFFS_WORLD.sections) {
    for (const field of section.fields) {
      if ('label' in field && field.label === label) return readScalar(view, field as ScalarField);
    }
  }
  throw new Error(`no field called ${label}`);
}

describe('the Q key', () => {
  it('writes the character back where the Save Editor reads them', async () => {
    const start = townWalk();
    const file = mwCharacterFile({ floor: 0, dir: 0, money: 77, ...start });
    const session = playingMw(file);
    await pressMw(session, MW_KEY.arrowUp);
    await pressMw(session, MW_KEY.quit);
    // The quit message, and then the key that ends it.
    await pressMw(session, MW_KEY.escape);
    expect(session.view().over).toBe(true);
    expect(file.dead).toBe(false);
    expect(loadMwPlayer(file.bytes).y).toBe(start.y - 1);
    expect(editorField(file.bytes, 'Position X')).toBe(start.x);
    expect(editorField(file.bytes, 'Position Y')).toBe(start.y - 1);
    expect(editorField(file.bytes, 'Jewels in Pocket')).toBe(77);
    expect(editorField(file.bytes, 'Character Name')).toBe('GRIMWALD');
  });
});

describe('the S key', () => {
  it('saves without leaving the game', async () => {
    const start = townWalk();
    const file = mwCharacterFile({ floor: 0, dir: 0, ...start });
    const session = playingMw(file);
    await pressMw(session, MW_KEY.arrowUp);
    await pressMw(session, MW_KEY.save);
    expect(session.view().over).toBe(false);
    expect(loadMwPlayer(file.bytes).y).toBe(start.y - 1);
  });
});

describe('death', () => {
  it('marks the roster entry and ends the game when there is no contract', async () => {
    const file = mwCharacterFile({ floor: 0, hp: -1, returnX: -1, ...townWalk() });
    const session = playingMw(file);
    // Death says two boxes, "EVERYTHING GOES BLACK..." and then what it costs.
    await new Promise((resolve) => setTimeout(resolve));
    expect(session.box[0]).toBe('EVERYTHING GOES BLACK...');
    await pressMw(session, MW_KEY.escape);
    expect(file.dead).toBe(true);
    expect(session.view()).toMatchObject({ over: true, dead: true });
  });

  it('holds the blow that killed the character on the strip', async () => {
    const file = mwCharacterFile({ floor: 0, hp: -1, returnX: -1, ...townWalk() });
    const delays: number[] = [];
    const session = playingMw(file, new BorlandRng(3), (ready) => {
      // The blow the monster landed in the step at the end of the pass before this one.
      ready.banner = ['NORTH DOES 40 POINTS'];
      const hold = ready.game.delay;
      ready.game.delay = (ms) => {
        delays.push(ms);
        hold(ms);
      };
    });
    await settleMw();
    expect(delays).toEqual([1300]);
    expect(session.view().banner).toEqual(['NORTH DOES 40 POINTS']);
    await pressMw(session, MW_KEY.escape);
  });

  it('puts a character with a raise-dead contract back where the temple wrote them', async () => {
    const back = townWalk();
    const file = mwCharacterFile({
      floor: 4,
      hp: -1,
      maxHp: 90,
      con: 15,
      returnDungeon: 0,
      returnX: back.x,
      returnY: back.y,
      x: 30,
      y: 30,
    });
    const session = playingMw(file);
    await new Promise((resolve) => setTimeout(resolve));
    // Death, the contract taking effect, and the advice to buy another.
    await pressMw(session, MW_KEY.escape);
    await pressMw(session, MW_KEY.escape);
    expect(session.view()).toMatchObject({ over: false, dead: false });
    expect(session.view().place).toMatchObject({ x: back.x, y: back.y, floor: 0 });
    expect(session.game.pc.hp).toBe(90);
    expect(session.game.pc.con).toBe(14);
    expect(session.game.pc.returnX).toBe(-1);
  });
});
