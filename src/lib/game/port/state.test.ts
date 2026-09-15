import { describe, expect, it } from 'vitest';
import { BorlandRng } from './rng';
import { newGame } from './state';

describe('the screen', () => {
  it('keeps what has been drawn in the order it was drawn', () => {
    const game = newGame();
    game.draw({ text: 'ONE', x: 0, y: 0, font: 1, colour: 4 });
    game.draw({ text: 'TWO', x: 0, y: 100, font: 1, colour: 5 });
    expect(game.screen.map((line) => line.text)).toEqual(['ONE', 'TWO']);
  });

  it('puts every drawn line on the end of the message log as well', () => {
    const game = newGame();
    game.draw({ text: 'ONE', x: 0, y: 0, font: 1, colour: 4 });
    game.say('AND A SAID LINE');
    expect(game.messages).toEqual(['ONE', 'AND A SAID LINE']);
  });

  it('logs a line and the value beside it as one line', () => {
    const game = newGame();
    game.draw({ text: 'RACE: ', value: 'GIANT', x: 0, valueX: 0x14a, y: 0, font: 2, colour: 5 });
    expect(game.messages).toEqual(['RACE: GIANT']);
  });

  it('replaces a line drawn over one already at the same place', () => {
    const game = newGame();
    game.draw({ text: '24', x: 1000, y: 0x348, font: 1, colour: 6 });
    game.draw({ text: '23', x: 1000, y: 0x348, font: 1, colour: 6 });
    expect(game.screen.map((line) => line.text)).toEqual(['23']);
    // The log keeps both: the screen is what is showing, the log is what has been printed.
    expect(game.messages).toEqual(['24', '23']);
  });

  it('takes a line off the screen when it is drawn in the background colour', () => {
    const game = newGame();
    game.draw({ text: '24', x: 1000, y: 0x348, font: 1, colour: 6 });
    game.draw({ text: '24', x: 1000, y: 0x348, font: 1, colour: 0 });
    expect(game.screen).toEqual([]);
    expect(game.messages).toEqual(['24']);
  });

  it('clears the whole screen and the bottom of it', () => {
    const game = newGame();
    game.draw({ text: 'TOP', x: 0, y: 100, font: 1, colour: 4 });
    game.draw({ text: 'BOTTOM', x: 0, y: 700, font: 1, colour: 4 });
    game.eraseScreen(0x2b2);
    expect(game.screen.map((line) => line.text)).toEqual(['TOP']);
    game.eraseScreen();
    expect(game.screen).toEqual([]);
    expect(game.messages).toEqual(['TOP', 'BOTTOM']);
  });

  it('waits for no key of its own accord', () => {
    const game = newGame();
    expect(() => game.pressAnyKey()).not.toThrow();
  });
});

describe('the keyboard', () => {
  it('says so rather than waiting forever when a game has none', () => {
    const game = newGame();
    expect(() => game.key()).toThrow('no keyboard');
    expect(() => game.choice([0x31])).toThrow('no keyboard');
  });

  it('is whatever the game was built with', async () => {
    const game = newGame({ key: async () => 0x66, choice: async (allowed) => allowed[0] });
    expect(await game.key()).toBe(0x66);
    expect(await game.choice([0x31, 0x32])).toBe(0x31);
  });
});

describe('a Random call', () => {
  it('is a plain roll when the game has no clock', () => {
    const game = newGame({ rng: new BorlandRng(12345) });
    const scripted = new BorlandRng(12345);
    expect([game.randomCall(80), game.randomCall(50)]).toEqual([
      scripted.random(80),
      scripted.random(50),
    ]);
    expect(game.randomTotal).toBe(0);
  });

  it('starts its running total the way main does when the game has a clock', () => {
    // main seeds from the wall clock and scales the roll to 0..1999 (exe 2000:63bd, 2000:63cc);
    // the seed the sitting was started from stands in for that clock. Borland's generator
    // answers a state of 12345 with 15301, and 15301 * 2000 / 0x8000 is 933.
    const game = newGame({ rng: new BorlandRng(12345), clock: () => 1000 });
    expect(game.randomTotal).toBe(933);
  });

  it('keeps the total the game was built with', () => {
    const game = newGame({ rng: new BorlandRng(12345), clock: () => 1000, randomTotal: 7 });
    expect(game.randomTotal).toBe(7);
  });

  it('reseeds from the total and the clock, and an inline roll carries on from there', () => {
    // The total starts at 933. The first call adds the tick to it, seeds the generator with the
    // 1933 that leaves and rolls: state 1933 gives 14048, and 14048 * 80 / 0x8000 is 34. The
    // inline roll after it does not reseed, so it is the next number of that same sequence.
    // The second call seeds with 1933 + 1005 = 2938 and starts again.
    let tick = 1000;
    const game = newGame({ rng: new BorlandRng(12345), clock: () => tick });
    expect(game.randomCall(80)).toBe(34);
    expect(game.randomTotal).toBe(1933);
    expect(game.rng.random(50)).toBe(14);
    tick = 1005;
    expect(game.randomCall(6)).toBe(0);
    expect(game.randomTotal).toBe(2938);
    expect(game.rng.random(6)).toBe(4);
  });

  it('wraps the total at a word, as the original does', () => {
    const game = newGame({ rng: new BorlandRng(12345), clock: () => 1010, randomTotal: 0xfff0 });
    // 0xfff0 + 1010 comes to 0x103e2, and the original keeps the low word of it: 994.
    expect(game.randomCall(100)).toBe(50);
    expect(game.randomTotal).toBe(994);
  });
});
