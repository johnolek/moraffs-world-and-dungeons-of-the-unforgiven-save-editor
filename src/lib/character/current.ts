import { app, currentEntry, entryById, type GameId, type Leaderboard, type RosterEntry } from '../app-state.svelte';
import { MORAFFS_REVENGE } from '../editor/games';
import {
  isGameId,
  loadChosenGame,
  loadCurrentCharacter,
  loadLastCharacter,
  saveChosenGame,
  saveCurrentCharacter,
  saveLastCharacter,
} from '../game-choice';
import { recordTab } from '../history';
import { revCharacterMap } from '../play/rev/memory';
import { runIsBeingSent } from '../play/streaming';
import type { JournalEntry } from '../play/journal';
import type { RunSession } from '../play/run';
import { tabFor } from '../tabs';
import { carryOverStoredMaps, carryOverStoredRoster } from './carry-over';
import { forgetCharacterMaps, loadKeptMaps, writeCharacterMaps } from './maps';
import { recordName, slotFromFileName } from './record';
import {
  markDead,
  markEdited,
  newEntry,
  oldestFirst,
  restoreImport,
  voidLeaderboard,
  withEntry,
  withoutEntry,
} from './roster';
import { dropCharacter, keepPlayed, readRoster, type PlayedSession } from './roster-db.svelte';
import {
  deviceIsAhead,
  entryFromServer,
  forgetOnServer,
  keepCharacterOnServer,
  readServerRoster,
  readServerRun,
} from './server-roster';

/** Put a save file that has just been read on the roster and start working on it. */
export function importCharacter(game: string, fileName: string, bytes: Uint8Array<ArrayBuffer>): void {
  const entry = newEntry({
    game,
    name: recordName(bytes, game) || fileName,
    slot: slotFromFileName(fileName),
    bytes,
    imported: true,
  });
  app.roster = withEntry(app.roster, entry);
  chooseEntry(entry.id);
  keepNow(entry);
}

/**
 * Keep a `<n>.BIN` dropped beside a character as the map that character has discovered, the way
 * Moraff's Revenge keeps one beside `<n>.EXE`.
 *
 * It goes to the character being worked on. The file says which character it belongs to only in
 * its name, and dropping it with the record makes that character the current one, so the two
 * come to the same thing.
 *
 * Returns the character it was kept beside, or null when the one being worked on is not a
 * Moraff's Revenge character.
 */
export function importRevExploredMap(bytes: Uint8Array): RosterEntry | null {
  const entry = currentEntry();
  if (!entry || entry.game !== MORAFFS_REVENGE.id) return null;
  revCharacterMap(entry.id).write(bytes);
  return entry;
}

/**
 * Put a character that has just been rolled on the roster and start working on it.
 *
 * `leaderboard` is the board the roller was asked to roll for, and null for a character to be
 * played for its own sake. It can never be given later: a board is a chain of runs from the roll.
 */
export function keepRolledCharacter(
  game: string,
  name: string,
  slot: number | null,
  bytes: Uint8Array<ArrayBuffer>,
  leaderboard: Leaderboard | null = null,
): void {
  const entry = newEntry({ game, name, slot, bytes, imported: false, leaderboard });
  app.roster = withEntry(app.roster, entry);
  chooseEntry(entry.id);
  keepNow(entry);
}

export function chooseCharacter(id: string): void {
  if (app.roster.some((candidate) => candidate.id === id)) chooseEntry(id);
}

/** Put the editor down without taking the character off the roster. */
export function unloadCharacter(): void {
  chooseEntry(null);
}

/**
 * Change which numbered character file this character downloads as, or null to keep downloading
 * under the name the file came in with.
 */
export function renumberCharacter(id: string, slot: number | null): void {
  const entry = app.roster.find((candidate) => candidate.id === id);
  if (!entry) return;
  entry.slot = slot;
  keepNow(entry);
}

export function renameCharacter(id: string, name: string): void {
  const entry = app.roster.find((candidate) => candidate.id === id);
  if (!entry || name.trim() === '') return;
  entry.name = name.trim();
  keepNow(entry);
}

export function forgetCharacter(id: string): void {
  app.roster = withoutEntry(app.roster, id);
  if (app.characterId === id) app.characterId = null;
  app.characterVersion++;
  changedCharacters.delete(id);
  for (const session of changedSessions) if (session.startsWith(`${id}/`)) changedSessions.delete(session);
  saveCurrentCharacter(app.characterId);
  forgetCharacterMaps(id);
  void keeping(dropCharacter(id));
  // A player with a name has their characters on the server, so forgetting one here forgets it
  // everywhere; otherwise the next roster read would bring it straight back.
  void forgetOnServer(id);
}

/** Put the file a character was imported from back as the character. */
export function restoreCharacterImport(id: string): void {
  const entry = app.roster.find((candidate) => candidate.id === id);
  if (!entry || !restoreImport(entry)) return;
  app.characterVersion++;
  keepNow(entry);
}

/**
 * The current character is about to be written from outside the game, so it leaves the board it
 * was rolled for. Says whether it was on one.
 */
export function voidCurrentLeaderboard(): boolean {
  const entry = currentEntry();
  if (!entry || !voidLeaderboard(entry)) return false;
  app.characterVersion++;
  keepNow(entry);
  return true;
}

/** A field of the current character has been edited in place. */
export function characterEdited(): void {
  const entry = currentEntry();
  if (entry) {
    markEdited(entry);
    keepSoon(entry);
  }
  app.characterVersion++;
}

/** The character being played has died. */
export function characterDied(): void {
  const entry = currentEntry();
  if (entry) {
    markDead(entry);
    keepNow(entry);
  }
  app.characterVersion++;
}

/**
 * Keep the session being played as the newest of the character's run.
 *
 * `at` is where the session belongs in the run: everything before it is left as it is, and the
 * session written there last time is written over. That one session, the journal it has been
 * written up in and the character's record are what goes to the store, soon after, the same way
 * an edit in the save editor does, so a burst of keys is one write.
 */
export function runSessionPlayed(
  entry: RosterEntry,
  at: number,
  session: RunSession,
  journal: JournalEntry[] = [],
): void {
  entry.run = [...entry.run.slice(0, at), session];
  entry.journal = [...entry.journal.slice(0, at), journal];
  changedSessions.add(sessionKey(entry.id, at));
  keepSoon(entry);
}

/** The editor has swapped in a different set of bytes for the same character. */
export function replaceCharacterBytes(bytes: Uint8Array<ArrayBuffer>): void {
  const entry = currentEntry();
  if (!entry) return;
  entry.bytes = bytes;
  markEdited(entry);
  app.characterVersion++;
  keepSoon(entry);
}

/** Show the other game. The character becomes the one last worked on under it; the rest of the
 *  roster is left exactly where it is. */
export function switchGame(game: GameId): void {
  if (game === app.game) return;
  setGame(game);
  chooseEntry(lastCharacterOf(game));
}

/**
 * Bring back the game the last visit was looking at. A visit from before the site had a switch
 * has no game stored, so the character that was being worked on says which game it was.
 */
export function restoreGame(): void {
  const current = currentEntry();
  const stored = loadChosenGame() ?? (isGameId(current?.game) ? current.game : app.game);
  setGame(stored);
  if (current && current.game !== stored) chooseEntry(lastCharacterOf(stored));
}

/**
 * Bring back the characters the last visit left behind, which is the one thing the site waits on
 * before it can show a character: the database answers a question at a time rather than at once
 * the way localStorage did.
 *
 * The run server is asked as well, but nothing waits on it: the characters in the browser go up
 * at once and the server's are merged in whenever its answer arrives.
 */
export async function restoreRoster(): Promise<void> {
  await carryOverStoredRoster();
  await carryOverStoredMaps();
  await loadKeptMaps();
  const entries = await readRoster();
  app.roster = entries ?? [];
  const stored = loadCurrentCharacter();
  app.characterId = app.roster.some((entry) => entry.id === stored) ? stored : null;
  app.characterVersion++;
  // A browser that will not open a database will not write one either, so the notice goes up
  // now rather than waiting for the first character to be changed.
  app.rosterKept = entries !== null;
  loaded = true;
  void catchUpWithTheServer();
}

/**
 * Bring the characters the run server is keeping for this player together with the ones in the
 * browser.
 *
 * A character belongs to the player and not to the device it was rolled in, so the server's copy
 * is the one that stands: it is the newest one any device of theirs sent. The exception is a
 * character this device is ahead on, which is what playing with the server unreachable leaves
 * behind — those keys are here and nowhere else, and they go up with the next batch that gets
 * through (`deviceIsAhead` in `server-roster.ts` is the whole rule).
 *
 * A device with no name, a build with no server and a server that did not answer all come to the
 * same thing: nothing here changes and the browser's own roster stands.
 */
export async function catchUpWithTheServer(): Promise<void> {
  const server = await readServerRoster();
  if (server === null) return;
  const taken: RosterEntry[] = [];
  const played: PlayedSession[] = [];
  for (const character of server) {
    const kept = entryById(character.id);
    if (kept !== null && deviceIsAhead(kept.run, character.run)) continue;
    const entry = entryFromServer(character, kept);
    if (entry === null) continue;
    writeCharacterMaps(entry.id, character.maps);
    taken.push(entry);
    for (let at = 0; at < entry.run.length; at++) played.push({ entry, at });
  }
  if (taken.length === 0) return;
  const replaced = new Set(taken.map((entry) => entry.id));
  app.roster = [...app.roster.filter((entry) => !replaced.has(entry.id)), ...taken].sort(oldestFirst);
  app.characterVersion++;
  await keeping(keepPlayed(taken, played));
}

/**
 * Bring the keys of a character's run here, where the chain came off the server without them.
 *
 * The roster the server hands over carries how many keys each sitting holds and not the keys
 * themselves, since a chain of Moraff's Revenge is megabytes and every page load would carry
 * every character's. So a character another device played arrives with its sittings and none of
 * their keys, and the two things that need them — playing the character on, which sends the
 * sittings behind it, and exporting the run — ask for them first.
 *
 * The keys already here are never written over: the sitting being played is one this device holds
 * and the server's copy of it is behind. Says whether the chain in hand holds every sitting's
 * keys now; a server that did not answer leaves it exactly as it was.
 */
export async function bringRunKeysHere(id: string): Promise<boolean> {
  const entry = entryById(id);
  if (entry === null) return false;
  if (everyKeyIsHere(entry)) return true;
  const chain = await readServerRun(id);
  if (chain === null) return false;
  const filled: PlayedSession[] = [];
  for (let at = 0; at < entry.run.length; at++) {
    const here = entry.run[at];
    const there = chain[at];
    if (here.inputs.length > 0 || there === undefined) continue;
    if (here.seed !== there.seed || here.startedAt !== there.startedAt) continue;
    entry.run[at] = { ...here, inputs: there.inputs };
    filled.push({ entry, at });
  }
  if (filled.length === 0) return everyKeyIsHere(entry);
  app.characterVersion++;
  await keeping(keepPlayed([], filled));
  return everyKeyIsHere(entry);
}

/** Whether every sitting of the character's run holds keys. A sitting nobody ever pressed a key
 *  in reads as one whose keys are elsewhere, which costs an ask that brings back the same
 *  nothing. */
function everyKeyIsHere(entry: RosterEntry): boolean {
  return entry.run.every((session) => session.inputs.length > 0);
}

function chooseEntry(id: string | null): void {
  app.characterId = id;
  app.characterVersion++;
  const entry = currentEntry();
  if (entry && isGameId(entry.game)) {
    // Which game a character belongs to is a fact about the file, so a save of the other game
    // being opened is what moves the site to that game.
    setGame(entry.game);
    saveLastCharacter(entry.game, entry.id);
  }
  saveCurrentCharacter(id);
}

function setGame(game: GameId): void {
  app.game = game;
  app.tab = tabFor(game, app.tab);
  saveChosenGame(game);
  // Being moved off a tab the new game does not have is not a jump, so the entry showing is
  // rewritten to name the tab that is now on screen rather than another one being added.
  recordTab(app);
}

/** The character to work on under a game: the one last worked on if it is still on the roster,
 *  and the newest of that game's otherwise. */
function lastCharacterOf(game: GameId): string | null {
  const theirs = app.roster.filter((entry) => entry.game === game);
  const remembered = loadLastCharacter(game);
  return theirs.find((entry) => entry.id === remembered)?.id ?? theirs[theirs.length - 1]?.id ?? null;
}

/**
 * How long an edit waits before the character is written.
 *
 * Long enough that typing a five digit number is one write rather than five, short enough that
 * the write is done by the time anybody has reached for the keyboard again.
 */
const EDIT_PAUSE_MS = 400;

/**
 * Whether the roster has been read.
 *
 * Nothing is written before it has. Reading the database is a wait, and a page closed during
 * that wait fires the same write a page on its way out always does; with an empty roster behind
 * it, that write would say the character in hand is no character at all.
 */
let loaded = false;

/** The write an edit has asked for and that has not happened yet. */
let pendingWrite: ReturnType<typeof setTimeout> | null = null;

/** The write asked for last, which is what a page on its way out waits on when there is nothing
 *  new to write. */
let writing: Promise<void> = Promise.resolve();

/** Follow a write, so that the notice says whether the browser is keeping the characters. */
function keeping(kept: Promise<boolean>): Promise<void> {
  writing = kept.then((ok) => void (app.rosterKept = ok));
  return writing;
}

/** The characters whose record or fields have changed and are not in the store yet, by id. */
const changedCharacters = new Set<string>();

/** The sessions that have been played into and are not in the store yet, each named by the
 *  character it belongs to and where it comes in that character's run. */
const changedSessions = new Set<string>();

function sessionKey(id: string, at: number): string {
  return `${id}/${at}`;
}

/** Write whatever is waiting now, whatever an edit was waiting for. Says when it is written. */
export function rememberNow(): Promise<void> {
  return write();
}

/** The character has changed in a way there is nothing to be gained by waiting over. */
function keepNow(entry: RosterEntry): void {
  changedCharacters.add(entry.id);
  void write();
}

/**
 * Write the character once the changes have settled.
 *
 * Every keystroke in the save editor is an edit, and every key in a game writes both the record
 * and the session it was pressed in, so a burst of them is collected into one write. The first
 * change of a burst is what sets the timer; the ones after it join the write already coming.
 */
function keepSoon(entry: RosterEntry): void {
  changedCharacters.add(entry.id);
  if (pendingWrite === null) pendingWrite = setTimeout(write, EDIT_PAUSE_MS);
}

function write(): Promise<void> {
  if (pendingWrite !== null) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  if (!loaded) return writing;
  saveCurrentCharacter(app.characterId);
  const characters = [...changedCharacters]
    .map((id) => entryById(id))
    .filter((entry): entry is RosterEntry => entry !== null);
  const sessions = [...changedSessions]
    .map(playedSession)
    .filter((played): played is PlayedSession => played !== null);
  changedCharacters.clear();
  changedSessions.clear();
  if (characters.length === 0 && sessions.length === 0) return writing;
  // A character being played is on its way to the server with every batch of its run; one changed
  // with no game running has nothing else to carry it there.
  for (const entry of characters) if (!runIsBeingSent(entry.id)) void keepCharacterOnServer(entry);
  return keeping(keepPlayed(characters, sessions));
}

/** The session a key names, or null for one whose character has left the roster since. */
function playedSession(key: string): PlayedSession | null {
  const at = key.lastIndexOf('/');
  const entry = entryById(key.slice(0, at));
  return entry ? { entry, at: Number(key.slice(at + 1)) } : null;
}
