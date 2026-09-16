import { describe, expect, it } from 'vitest';
import type { Leaderboard, RosterEntry } from '../app-state.svelte';
import { ENDLESS_WORLD_SEED } from '../game/endless/rules';
import { markDead, markEdited, newEntry, restoreImport, voidLeaderboard, withEntry, withoutEntry } from './roster';

const ROLLED_AT = new Date('2026-09-06T12:00:00Z');
const EDITED_AT = new Date('2026-09-07T09:30:00Z');

function imported(id = 'a'): RosterEntry {
  const bytes = Uint8Array.from([1, 2, 3]);
  return newEntry({ game: 'unforgiven', name: 'SAGEY', slot: 21, bytes, imported: true }, ROLLED_AT, id);
}

function rolled(id = 'b'): RosterEntry {
  const bytes = Uint8Array.from([9]);
  return newEntry({ game: 'unforgiven', name: 'NEWBIE', slot: 22, bytes, imported: false }, ROLLED_AT, id);
}

function rolledForTheBoard(board: Leaderboard, id = 'c'): RosterEntry {
  const bytes = Uint8Array.from([7]);
  return newEntry({ game: 'unforgiven', name: 'RACER', slot: 23, bytes, imported: false, lock: board, onBoard: true }, ROLLED_AT, id);
}

function rolledLockedOffTheBoard(lock: Leaderboard, id = 'd'): RosterEntry {
  const bytes = Uint8Array.from([7]);
  return newEntry({ game: 'unforgiven', name: 'PURIST', slot: 24, bytes, imported: false, lock }, ROLLED_AT, id);
}

describe('a character put on the roster', () => {
  it('remembers the file it was imported from, apart from the one being edited', () => {
    const entry = imported();
    entry.bytes[0] = 99;
    expect([...entry.importedBytes!]).toEqual([1, 2, 3]);
    expect(entry.createdAt).toBe(ROLLED_AT.toISOString());
  });

  it('has no import to go back to when it was rolled here', () => {
    expect(rolled().importedBytes).toBeNull();
  });
});

describe('the endless world a character is rolled into', () => {
  it('is the world the run server was playing when the roll was made', () => {
    const bytes = Uint8Array.from([7]);
    const rolled = newEntry(
      { game: 'unforgiven', name: 'DELVER', slot: 24, bytes, imported: false, lock: 'endless', worldSeed: 77 },
      ROLLED_AT,
      'e',
    );

    expect(rolled.worldSeed).toBe(77);
  });

  it('is the world of the game’s own rules for a roll that could not reach the server', () => {
    expect(rolledLockedOffTheBoard('endless').worldSeed).toBe(ENDLESS_WORLD_SEED);
    expect(rolledForTheBoard('endless').worldSeed).toBe(ENDLESS_WORLD_SEED);
  });

  it('is nothing at all for a character that plays the game as it shipped', () => {
    expect(rolled().worldSeed).toBeUndefined();
    expect(rolledLockedOffTheBoard('faithful').worldSeed).toBeUndefined();
    expect(imported().worldSeed).toBeUndefined();
  });
});

describe('the board a character is rolled for', () => {
  it('is kept on the character that was rolled for it, which is locked to that mode', () => {
    expect(rolledForTheBoard('speedrun').leaderboard).toBe('speedrun');
    expect(rolledForTheBoard('speedrun').lock).toBe('speedrun');
  });

  it('is nothing at all for a character rolled to be played for its own sake', () => {
    expect(rolled().leaderboard).toBeNull();
    expect(rolled().lock).toBeNull();
  });

  it('is nothing at all for one locked to a mode but asked for no board', () => {
    expect(rolledLockedOffTheBoard('faithful').leaderboard).toBeNull();
    expect(rolledLockedOffTheBoard('faithful').lock).toBe('faithful');
  });

  it('is nothing at all for one asked onto a board with no mode to lock it to', () => {
    const bytes = Uint8Array.from([7]);
    const entry = newEntry({ game: 'unforgiven', name: 'RACER', slot: 23, bytes, imported: false, onBoard: true });
    expect(entry.leaderboard).toBeNull();
    expect(entry.lock).toBeNull();
  });

  it('is never given to an imported file, whatever the caller asks for', () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const entry = newEntry({ game: 'unforgiven', name: 'SAGEY', slot: 21, bytes, imported: true, lock: 'faithful', onBoard: true });
    expect(entry.leaderboard).toBeNull();
    expect(entry.lock).toBeNull();
  });
});

describe("the sessions of a character's run", () => {
  it('are none at all for a character that has just been rolled', () => {
    expect(rolled().run).toEqual([]);
  });
});

describe('a record written from outside the game', () => {
  it('takes the character off its board, leaves its lock, and stamps the change', () => {
    const entry = rolledForTheBoard('faithful');
    expect(voidLeaderboard(entry, EDITED_AT)).toBe(true);
    expect(entry.leaderboard).toBeNull();
    expect(entry.lock).toBe('faithful');
    expect(entry.editedAt).toBe(EDITED_AT.toISOString());
  });

  it('leaves a character that was on no board alone', () => {
    const entry = rolled();
    expect(voidLeaderboard(entry, EDITED_AT)).toBe(false);
    expect(entry.editedAt).toBe(ROLLED_AT.toISOString());
  });
});

describe('the roster', () => {
  it('keeps the characters in the order they arrived', () => {
    const entries = withEntry(withEntry([], imported()), rolled());
    expect(entries.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('drops the character that is removed and leaves the rest', () => {
    const entries = withEntry(withEntry([], imported()), rolled());
    expect(withoutEntry(entries, 'a').map((entry) => entry.id)).toEqual(['b']);
  });
});

describe('editing a character', () => {
  it('stamps when it was last changed', () => {
    const entry = imported();
    markEdited(entry, EDITED_AT);
    expect(entry.editedAt).toBe(EDITED_AT.toISOString());
    expect(entry.createdAt).toBe(ROLLED_AT.toISOString());
  });
});

describe('a character that has died', () => {
  it('is marked and keeps its bytes', () => {
    const entry = imported();
    expect(entry.dead).toBe(false);
    markDead(entry, EDITED_AT);
    expect(entry.dead).toBe(true);
    expect([...entry.bytes]).toEqual([1, 2, 3]);
    expect(entry.editedAt).toBe(EDITED_AT.toISOString());
  });
});

describe('restoring the import', () => {
  it('puts the file back as the character, in bytes of its own', () => {
    const entry = imported();
    entry.bytes[0] = 99;
    expect(restoreImport(entry, EDITED_AT)).toBe(true);
    expect([...entry.bytes]).toEqual([1, 2, 3]);
    expect(entry.bytes).not.toBe(entry.importedBytes);
    expect(entry.editedAt).toBe(EDITED_AT.toISOString());
  });

  it('does nothing for a character that was rolled here', () => {
    const entry = rolled();
    expect(restoreImport(entry)).toBe(false);
  });
});
