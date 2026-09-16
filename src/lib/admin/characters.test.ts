import { describe, expect, it } from 'vitest';
import type { AdminCharacterRow } from '../../../server/admins';
import { characterStatusWords, characterTypeWords, charactersMatching } from './characters';

function row(player: string, name: string): AdminCharacterRow {
  return {
    characterId: `${player}-${name}`,
    player,
    name,
    game: 'unforgiven',
    type: 'speedrun',
    status: 'alive',
    lastHeard: null,
  };
}

const ROWS = [row('John', 'Grond'), row('Moraff', 'Thurg'), row('Bernard', 'Johnny')];

describe('the characters the filter box leaves showing', () => {
  it('is all of them while nothing is typed', () => {
    expect(charactersMatching(ROWS, '')).toEqual(ROWS);
    expect(charactersMatching(ROWS, '   ')).toEqual(ROWS);
  });

  it('is the ones whose player or character has the words in it', () => {
    expect(charactersMatching(ROWS, 'john').map((one) => one.name)).toEqual(['Grond', 'Johnny']);
    expect(charactersMatching(ROWS, 'thu').map((one) => one.name)).toEqual(['Thurg']);
  });

  it('does not care about case or about what was typed around the word', () => {
    expect(charactersMatching(ROWS, '  MORAFF ').map((one) => one.name)).toEqual(['Thurg']);
  });

  it('is nobody when nobody read so far matches', () => {
    expect(charactersMatching(ROWS, 'nobody')).toEqual([]);
  });
});

describe('the words a character’s row shows', () => {
  it('names the board or the lock it was rolled for', () => {
    expect(characterTypeWords('speedrun')).toBe('Speedrun');
    expect(characterTypeWords('endless')).toBe('Endless');
  });

  it('shows a dash for a character rolled for neither', () => {
    expect(characterTypeWords(null)).toBe('—');
  });

  it('shows a word from a newer server exactly as it was sent', () => {
    expect(characterTypeWords('marathon')).toBe('marathon');
  });

  it('says what has become of the character', () => {
    expect(characterStatusWords('alive')).toBe('Alive');
    expect(characterStatusWords('dead')).toBe('Dead');
    expect(characterStatusWords('won')).toBe('Won');
  });
});
