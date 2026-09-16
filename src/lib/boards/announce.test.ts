import { describe, expect, it } from 'vitest';
import type { Announcement } from '../../../server/announcing';
import { announcementWords } from './announce';

function said(over: Partial<Announcement>): string {
  return announcementWords({
    id: 1,
    characterId: 'grond',
    kind: 'death',
    which: 0,
    game: 'unforgiven',
    leaderboard: 'speedrun',
    player: 'Moraff',
    name: 'Grond',
    actions: 4120,
    time: 300,
    floor: 7,
    dungeon: 2,
    level: 12,
    playMs: 60000,
    at: '2026-09-09 21:00:00',
    ...over,
  });
}

describe('what an announcement says', () => {
  it('names the character and the player who played it', () => {
    expect(said({ kind: 'level', which: 20 })).toBe('Grond (Moraff) reached level 20');
  });

  it('says what a won run was won in', () => {
    expect(said({ kind: 'win' })).toBe('Grond (Moraff) won Dungeons of the Unforgiven in 4120 actions');
  });

  it('says where a death happened and what level the character was', () => {
    expect(said({ kind: 'death' })).toBe('Grond (Moraff) died on floor 7 of Module III at level 12');
  });

  it('leaves the dungeon out of a death in Moraff’s Revenge, which has only the one', () => {
    expect(said({ kind: 'death', game: 'revenge' })).toBe('Grond (Moraff) died on floor 7 at level 12');
  });

  it('says a death in the town rather than on floor 0', () => {
    expect(said({ kind: 'death', floor: 0, level: 3 })).toBe('Grond (Moraff) died in the town at level 3');
  });

  it('counts a boss from one, the way a player would', () => {
    expect(said({ kind: 'boss', which: 2 })).toBe('Grond (Moraff) beat Boss 3');
  });

  it('says how many monsters a run has killed', () => {
    expect(said({ kind: 'kills', which: 500 })).toBe('Grond (Moraff) has killed 500 monsters');
  });

  it('names what a run found the way the game names it', () => {
    expect(said({ kind: 'find', which: 5 })).toBe('Grond (Moraff) found a RING OF REGENERATION');
  });

  it('calls a dungeon what the game it was played in calls it', () => {
    expect(said({ kind: 'dungeon', which: 3 })).toBe('Grond (Moraff) reached Module IV');
    expect(said({ kind: 'dungeon', which: 3, game: 'moraffsWorld' })).toBe('Grond (Moraff) reached Dungeon 3');
  });

  it('says the floor a Moraff’s Revenge character got down to', () => {
    expect(said({ kind: 'floor', which: 30, game: 'revenge' })).toBe('Grond (Moraff) reached floor 30');
  });

  it('names each game the way the switch in the header does', () => {
    expect(said({ kind: 'win', game: 'moraffsWorld' })).toContain("won Moraff's World in");
    expect(said({ kind: 'win', game: 'revenge' })).toContain("won Moraff's Revenge in");
  });
});
