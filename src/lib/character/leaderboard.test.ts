import { describe, expect, it } from 'vitest';
import { characterTypeWords, lockedPlayNote } from './leaderboard';

describe('what the roster says a character is', () => {
  it('names the board for one whose runs go on one', () => {
    expect(characterTypeWords('faithful', 'faithful')).toBe('Faithful board');
    expect(characterTypeWords('speedrun', 'speedrun')).toBe('Speedrun board');
  });

  it('names the mode alone for one locked to a mode and on no board', () => {
    expect(characterTypeWords(null, 'faithful')).toBe('Faithful');
    expect(characterTypeWords(null, 'speedrun')).toBe('Speedrun');
  });

  it('is free play for one that can be played any way', () => {
    expect(characterTypeWords(null, null)).toBe('Free play');
  });
});

describe('what the Play tab says in place of the mode radios', () => {
  it('says the board is why, for a character on one', () => {
    expect(lockedPlayNote('speedrun', true)).toContain('rolled for the speedrun leaderboard');
  });

  it('says the character is why, and that no board is waiting, for one on none', () => {
    const note = lockedPlayNote('speedrun', false);
    expect(note).toContain('rolled as a speedrun character');
    expect(note).toContain('no leaderboard');
  });
});
