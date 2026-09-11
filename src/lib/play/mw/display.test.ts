import { describe, expect, it } from 'vitest';
import { findMwSquare, mwCharacterFile, playingMw, pressMw } from './test-engine';
import { MW_KEY } from './keys';

/** A square of the town with nothing on it, so the key pressed is the only thing happening. */
const townSquare = () => findMwSquare(0, (square) => square.ladder === 0);

/** The first line of the box each of the five keys the port answers with words puts up. */
const BOXES: [number, string][] = [
  [MW_KEY.brickSpeed, 'THE GAME WOULD STEP THROUGH THE'],
  [MW_KEY.zoomView, 'THE GAME WOULD FILL THE SCREEN'],
  [MW_KEY.paletteGreen, 'THE GAME WOULD ADD SIXTEEN TO'],
  [MW_KEY.paletteBlue, 'THE GAME WOULD ADD SIXTEEN TO'],
  [MW_KEY.paletteRed, 'THE GAME WOULD ADD SIXTEEN TO'],
];

describe('the keys that are about the screen', () => {
  it('each say what the game would have done, in four lines or fewer', async () => {
    for (const [key, first] of BOXES) {
      const session = playingMw(mwCharacterFile({ floor: 0, ...townSquare() }));
      await pressMw(session, key);
      expect(session.box[0]).toBe(first);
      expect(session.box.length).toBeLessThanOrEqual(4);
    }
  });

  it('names the colour each of the three palette keys moves', async () => {
    const colours: [number, string][] = [
      [MW_KEY.paletteGreen, 'THE GREEN IN ITS BACKGROUND'],
      [MW_KEY.paletteBlue, 'THE BLUE IN ITS BACKGROUND'],
      [MW_KEY.paletteRed, 'THE RED IN ITS BACKGROUND'],
    ];
    for (const [key, line] of colours) {
      const session = playingMw(mwCharacterFile({ floor: 0, ...townSquare() }));
      await pressMw(session, key);
      expect(session.box).toContain(line);
    }
  });

  it('says what the 3-D view key would have done', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, ...townSquare() }));
    await pressMw(session, MW_KEY.zoomView);
    expect(session.box).toContain('WITH THE VIEW ONE WAY AND NAME');
  });
});

describe('the O key', () => {
  it('turns the sound off and on again and says nothing about it', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, ...townSquare() }));
    expect(session.view().sound).toBe(true);
    await pressMw(session, MW_KEY.sound);
    expect(session.view().sound).toBe(false);
    expect(session.box).toEqual([]);
    await pressMw(session, MW_KEY.sound);
    expect(session.view().sound).toBe(true);
  });
});

describe('the X key', () => {
  it('fills the screen with the floor and waits for a key over it', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, ...townSquare() }));
    await pressMw(session, MW_KEY.expandMap);
    expect(session.expandedMap).toBe(true);
    expect(session.game.screen).toEqual([
      { text: 'EXPANDED DUNGEON MAP, HIT ANY KEY...', x: 0, y: 0x47e, font: 0, colour: 15 },
    ]);
    expect(session.box).toEqual([]);
    await pressMw(session, MW_KEY.escape);
    expect(session.expandedMap).toBe(false);
    expect(session.game.screen).toEqual([]);
  });

  it('points at the quest boss when slot 0 holds one', async () => {
    const start = findMwSquare(0, (square) => square.ladder === 0);
    const session = playingMw(mwCharacterFile({ floor: 0, ...start }), undefined, (playing) => {
      const boss = playing.game.monsters[0];
      boss.type = 0x6a;
      boss.x = start.x;
      boss.y = start.y - 8;
    });
    await pressMw(session, MW_KEY.expandMap);
    expect(session.game.screen[1]).toEqual({
      text: 'GO NORTH',
      x: 0x4b0,
      y: 0x442,
      font: 0,
      colour: 4,
    });
  });

  it('says nothing about a boss when slot 0 holds an ordinary monster', async () => {
    const session = playingMw(mwCharacterFile({ floor: 0, ...townSquare() }), undefined, (playing) => {
      playing.game.monsters[0].type = 0x10;
    });
    await pressMw(session, MW_KEY.expandMap);
    expect(session.game.screen).toHaveLength(1);
  });
});
