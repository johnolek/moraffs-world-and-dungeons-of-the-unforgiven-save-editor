import type { Leaderboard, RosterEntry } from '../app-state.svelte';

/**
 * A character on the roster: what one is made of and what happens to it. Where the roster is
 * kept is `roster-db.svelte.ts`; nothing here touches a store.
 */

/** What is needed to put a character on the roster. */
export interface NewCharacter {
  game: string;
  name: string;
  slot: number | null;
  bytes: Uint8Array<ArrayBuffer>;
  /** Whether the bytes are a file that was imported, rather than a character rolled here. */
  imported: boolean;
  /**
   * The mode this character is locked to for life, or null for one that can be played any way.
   *
   * Only a roll can carry one. An imported file has already been somewhere this site cannot see,
   * so there is no chain of runs from a roll to hold it to a way of playing, or to compare it by.
   */
  lock?: Leaderboard | null;
  /** Whether its runs go on the leaderboard of that mode. A character with no lock goes on no
   *  board, since a board is a set of runs played the same way. */
  onBoard?: boolean;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newEntry(character: NewCharacter, now = new Date(), id = newId()): RosterEntry {
  const stamp = now.toISOString();
  const lock = character.imported ? null : (character.lock ?? null);
  return {
    id,
    game: character.game,
    name: character.name,
    slot: character.slot,
    importedBytes: character.imported ? character.bytes.slice() : null,
    bytes: character.bytes,
    createdAt: stamp,
    editedAt: stamp,
    dead: false,
    lock,
    leaderboard: lock !== null && character.onBoard === true ? lock : null,
    run: [],
    journal: [],
  };
}

export function withEntry(entries: RosterEntry[], entry: RosterEntry): RosterEntry[] {
  return [...entries, entry];
}

/**
 * The order the roster is always in: oldest first.
 *
 * Two characters made in the same millisecond are settled by their ids, which at least puts them
 * in the same order every time.
 */
export function oldestFirst(left: RosterEntry, right: RosterEntry): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

export function withoutEntry(entries: RosterEntry[], id: string): RosterEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

/** The character has died. Nothing takes it back: the entry keeps its bytes and is marked. */
export function markDead(entry: RosterEntry, now = new Date()): void {
  entry.dead = true;
  markEdited(entry, now);
}

/**
 * Take the character off the leaderboard it was rolled for. Says whether it was on one.
 *
 * Nothing puts it back: a board is a chain of runs from the roll, and a record written from
 * outside the game breaks the chain wherever it lands. The mode the character is locked to is
 * left alone — that is what it was rolled as, and no edit changes it.
 */
export function voidLeaderboard(entry: RosterEntry, now = new Date()): boolean {
  if (entry.leaderboard === null) return false;
  entry.leaderboard = null;
  markEdited(entry, now);
  return true;
}

/** Stamp the time a character was last changed. */
export function markEdited(entry: RosterEntry, now = new Date()): void {
  entry.editedAt = now.toISOString();
}

/**
 * Put the file the character was imported from back as the character, leaving the import itself
 * where it is so it can be gone back to again. The bytes are a fresh array, which is what tells
 * the editor to open the character again.
 */
export function restoreImport(entry: RosterEntry, now = new Date()): boolean {
  if (!entry.importedBytes) return false;
  entry.bytes = entry.importedBytes.slice();
  markEdited(entry, now);
  return true;
}
