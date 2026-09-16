import { describe, expect, it } from 'vitest';
import { newGame } from '../port/state';
import { endlessStateOf, keptEndlessState, restoreEndlessState } from './state';

/**
 * What an endless character carries beside its record, written down and read back, which is what
 * it takes to put a character down mid-run and go on playing it tomorrow.
 */
describe('the state kept beside an endless character', () => {
  it('is nothing at all for a character nothing has happened to', () => {
    expect(keptEndlessState(newGame().pc)).toEqual({ keys: [], bossSquares: [] });
  });

  it('carries the keys and the bosses of a character across a write and a read', () => {
    const played = newGame().pc;
    endlessStateOf(played).keys.add(44);
    endlessStateOf(played).bossSquares.set(23, { x: 12, y: 34 });

    const started = newGame().pc;
    restoreEndlessState(started, keptEndlessState(played));

    expect([...endlessStateOf(started).keys]).toEqual([44]);
    expect(endlessStateOf(started).bossSquares.get(23)).toEqual({ x: 12, y: 34 });
  });

  it('leaves the character it was read into carrying nothing else', () => {
    const started = newGame().pc;
    endlessStateOf(started).keys.add(7);

    restoreEndlessState(started, { keys: [44], bossSquares: [] });

    expect([...endlessStateOf(started).keys]).toEqual([44]);
  });
});
