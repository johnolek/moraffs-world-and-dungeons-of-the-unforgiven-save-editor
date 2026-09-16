import { describe, expect, it } from 'vitest';
import type { Announcement } from '../../../server/announcing';
import {
  announcementBoxLines,
  announcementCarried,
  announcementRows,
  boxSignature,
  type MessageBoxGrid,
} from './announcement-box';

function said(id: number, name: string, which: number): Announcement {
  return {
    id,
    characterId: 'grond',
    kind: 'boss',
    which,
    game: 'unforgiven',
    leaderboard: 'speedrun',
    player: 'Moraff',
    name,
    actions: 10,
    time: 20,
    floor: 3,
    dungeon: 1,
    level: 7,
    playMs: 1000,
    at: '2026-09-16T21:00:00.000Z',
  };
}

/** A box of four rows of ten characters, at ten units a row, so that a test can read the row a
 *  line landed on off its y. */
const BOX: MessageBoxGrid = {
  rows: 4,
  columns: 10,
  line: (text, row) => ({ text, x: 100, y: row * 10, font: 0, colour: 6 }),
};

describe('breaking an announcement into rows', () => {
  it('fills a row as far as it goes and puts the next word on the next one', () => {
    expect(announcementRows('ONE TWO THREE FOUR', 10)).toEqual(['ONE TWO', 'THREE FOUR']);
  });

  it('gives a sentence that fits one row of its own', () => {
    expect(announcementRows('ONE TWO', 10)).toEqual(['ONE TWO']);
  });

  it('cuts a sentence too long for two rows short', () => {
    expect(announcementRows('ONE TWO THREE FOUR FIVE SIX', 10)).toEqual(['ONE TWO', 'THREE F...']);
  });

  it('marks a cut on a row with room left for the mark', () => {
    expect(announcementRows('AAA BBB CCCC DDDDDDDD', 8)).toEqual(['AAA BBB', 'CCCC...']);
  });

  it('leaves a word longer than a row whole, the way the games squeeze one', () => {
    expect(announcementRows('ABCDEFGHIJKLM', 10)).toEqual(['ABCDEFGHIJKLM']);
  });
});

describe('an announcement as message box lines', () => {
  it('stands on the bottom rows of the box, where the game prints last', () => {
    const lines = announcementBoxLines(said(1, 'GROND', 2), BOX);

    expect(lines.map((line) => line.text)).toEqual(['GROND', '(MORAFF...']);
    expect(lines.map((line) => line.y)).toEqual([20, 30]);
  });

  it('takes one row only when the words fit on one', () => {
    const lines = announcementBoxLines(said(1, 'G', 2), { ...BOX, columns: 40 });

    expect(lines.map((line) => line.text)).toEqual(['G (MORAFF) BEAT BOSS 3']);
    expect(lines.map((line) => line.y)).toEqual([30]);
  });

  it('is drawn in the font and the colour the box draws its own lines in', () => {
    const [line] = announcementBoxLines(said(1, 'G', 2), { ...BOX, columns: 40 });

    expect(line.x).toBe(100);
    expect(line.font).toBe(0);
    expect(line.colour).toBe(6);
  });
});

describe('what the message box is carrying', () => {
  const ANNOUNCEMENT = said(5, 'GROND', 2);

  it('carries nothing while nothing has arrived', () => {
    expect(announcementCarried(null, null, 'a box')).toBe(null);
  });

  it('takes up the one that has arrived, over the box that was up', () => {
    expect(announcementCarried(null, ANNOUNCEMENT, 'a box')).toEqual({
      announcement: ANNOUNCEMENT,
      over: 'a box',
    });
  });

  it('keeps it while the box has not changed', () => {
    const carrying = announcementCarried(null, ANNOUNCEMENT, 'a box');

    expect(announcementCarried(carrying, ANNOUNCEMENT, 'a box')).toBe(carrying);
  });

  it('drops it when the game prints something else', () => {
    const carrying = announcementCarried(null, ANNOUNCEMENT, 'a box');

    expect(announcementCarried(carrying, ANNOUNCEMENT, 'another box')?.over).toBe(null);
  });

  it('does not put a dropped one back when the game prints the same box again', () => {
    const carrying = announcementCarried(null, ANNOUNCEMENT, 'a box');
    const gone = announcementCarried(carrying, ANNOUNCEMENT, 'another box');

    expect(announcementCarried(gone, ANNOUNCEMENT, 'a box')?.over).toBe(null);
  });

  it('takes up the next one to arrive over whatever box is up then', () => {
    const carrying = announcementCarried(null, ANNOUNCEMENT, 'a box');
    const next = said(6, 'THRUD', 3);

    expect(announcementCarried(carrying, next, 'another box')).toEqual({ announcement: next, over: 'another box' });
  });
});

describe('the box as one string', () => {
  it('reads the same for a box built afresh out of the same lines', () => {
    const lines = [{ text: 'YOU FIND GOLD', x: 1, y: 2, font: 0, colour: 6 }];

    expect(boxSignature(lines)).toBe(boxSignature([{ ...lines[0] }]));
  });

  it('reads differently for a line printed somewhere else', () => {
    const line = { text: 'YOU FIND GOLD', x: 1, y: 2, font: 0, colour: 6 };

    expect(boxSignature([line])).not.toBe(boxSignature([{ ...line, y: 3 }]));
  });
});
