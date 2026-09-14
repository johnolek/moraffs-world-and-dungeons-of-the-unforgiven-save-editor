import { HistoryCursor } from './history';
import type { JournalEntry } from './play/journal';
import type { RunSession } from './play/run';

export type Tab = 'map' | 'play' | 'boards' | 'fight' | 'editor' | 'monsters' | 'spells' | 'calculators' | 'formulas' | 'tidbits' | 'snake' | 'roller' | 'source';

/** Which game the site is about, which is also the id of its schema in
 *  `src/lib/editor/games.ts`. */
export type GameId = 'unforgiven' | 'moraffsWorld' | 'revenge';

/** The games the site has a port of, which are the ones with a save editor, a character roller
 *  and a Play tab. */
export type PortedGameId = 'unforgiven' | 'moraffsWorld' | 'revenge';

/** A function to open in the Source tab: one of the port's, or one of the decompilation's. */
export type SourceRequest = { kind: 'ts'; file: string; name: string } | { kind: 'c'; name: string };

/**
 * The one character the whole app works from: the save that was loaded in the editor or the
 * character that was rolled. The editor's fields write into these same bytes, so anything that
 * reads them again sees the edits.
 */
export interface CurrentCharacter {
  /** The GameSchema id in `src/lib/editor/games.ts` the bytes belong to. */
  game: string;
  /** What to call this character in the app. It starts as the name in the record. */
  name: string;
  /** Which numbered character file it is, or null when the file it came from was not a number. */
  slot: number | null;
  bytes: Uint8Array<ArrayBuffer>;
}

/**
 * Which of the two leaderboards a character was rolled for, and is locked to for the rest of its
 * life, so that every run it plays can be compared with the others on that board.
 *
 * Both are named after the play mode they are played in: faithful shows only what the game shows,
 * speedrun adds the whole floor. Debug is not here — a run played with the port's own numbers on
 * screen is not a run anybody competes with.
 */
export type Leaderboard = 'faithful' | 'speedrun';

/** One of the characters the browser keeps. */
export interface RosterEntry extends CurrentCharacter {
  id: string;
  /** The file exactly as it came in, so the untouched original can always be had back. Null
   *  for a character rolled here rather than imported. */
  importedBytes: Uint8Array<ArrayBuffer> | null;
  createdAt: string;
  editedAt: string;
  /**
   * Whether the character has died. The game itself keeps no such flag — it writes nothing on a
   * death and leaves the file where the last save point left it — so this is the roster's own,
   * and the bytes stay as they are so the character can still be edited or downloaded.
   */
  dead: boolean;
  /**
   * The board this character was rolled for, or null for one played for its own sake. It is
   * chosen once, in the roller, and the only thing that ever changes it is a record written from
   * outside the game, which ends it for good.
   */
  leaderboard: Leaderboard | null;
  /**
   * The character's run: every sitting at the game it has been played in, oldest first.
   *
   * The game being played now is the last of them, written again after every key, so that a tab
   * closed in the middle of one loses nothing. The count of actions runs on through the lot,
   * which is what makes a speedrun of a character rather than of an evening. A character rolled
   * before the site kept runs has none until it is played, and its first session starts one.
   */
  run: RunSession[];
  /**
   * The character's run written up in words, one list of entries per session of {@link run}
   * (`src/lib/play/journal.ts`).
   *
   * It is not part of the log and is not exported with it: a replay of a session writes the same
   * lines again, which is how the run server has a run's journal without being handed one. What
   * is kept here is so that the timeline is there to read without a replay.
   */
  journal: JournalEntry[][];
}

/** A monster to set the fight simulator up with, on the floor the bestiary was reading it on. */
export interface FightRequest {
  monsterId: string;
  module: number;
  floor: number;
}

/** A square of the dungeon to send the map to, taken from where a character stands. */
export interface PlaceRequest {
  game: GameId;
  dungeon: number;
  floor: number;
  x: number;
  y: number;
}

export interface AppState {
  /** The game the whole site is showing: its tabs, its editor, its characters. */
  game: GameId;
  tab: Tab;
  /** How far the map has moved through the browser's history, so its own Back and Forward
   *  buttons know whether there is anywhere to go. It is shared because switching tabs pushes
   *  a history entry too, which drops whatever the map had ahead of it. */
  mapHistory: HistoryCursor;
  /** Set to open a monster in the Monsters tab; the database clears it once it has. */
  requestedMonsterId: string | null;
  /** Set to set the Fight tab up against a monster; that tab clears it once it has. */
  requestedFight: FightRequest | null;
  /** Set to open a function in the Source tab; the viewer clears it once it has. */
  requestedSource: SourceRequest | null;
  /** Set to the id of a formula to open in the Formulas tab; that tab clears it once it has. */
  requestedFormula: string | null;
  /** Set to stand the party somewhere in the Map tab; the map clears it once it has. */
  requestedPlace: PlaceRequest | null;
  /** Every character kept in the browser, oldest first. */
  roster: RosterEntry[];
  /** Which of them is being worked on. The entry itself is only ever reached through the
   *  roster, so that everything reading a character reads the same object. */
  characterId: string | null;
  /** Bumped whenever the current character changes: a different one is chosen, or a field of
   *  the one in hand is edited. Everything that reads the record watches this. */
  characterVersion: number;
  /** The roster entry the Play tab is to start as soon as it opens, which the roller's Play now
   *  sets, or null. */
  startPlaying: string | null;
  /** Whether the last attempt to keep the roster in the browser worked. False raises the notice
   *  saying the characters are not being saved, so a full or blocked store is not silent. */
  rosterKept: boolean;
}

export const app = $state<AppState>({
  game: 'unforgiven',
  tab: 'map',
  mapHistory: new HistoryCursor(),
  requestedMonsterId: null,
  requestedFight: null,
  requestedSource: null,
  requestedFormula: null,
  requestedPlace: null,
  roster: [],
  characterId: null,
  characterVersion: 0,
  startPlaying: null,
  rosterKept: true,
});

/**
 * {@link AppState.characterVersion} for the tab that is on screen, and a fixed number for every
 * other tab.
 *
 * Every tab of the site is built into the page from the moment it loads, so a tab nobody is
 * looking at is still live and still reacting. The game writes the character's record back to
 * the roster after every key, which bumps the version, and that used to set the save editor, the
 * five calculators, the monster page and the map explorer all recalculating on every keypress —
 * about three megabytes of rubbish per key, which the browser stopped to collect every few steps.
 *
 * A `$derived` or an `$effect` that reads this instead follows the character only while its own
 * tab is up. While another tab is showing it depends on {@link AppState.tab} alone, so nothing
 * the character does reaches it; when the player comes back, the tab changing is itself a change
 * and the derived runs again on the character as it now stands.
 *
 * The version is read inside the branch on purpose. Svelte follows what a reader actually reads,
 * so reading it above the branch and choosing afterwards would put every tab back to following
 * the character, and the numbers this hands out would be exactly the same.
 *
 * The character bar along the bottom of the page belongs to no tab and is not to use this: it is
 * the game's own status block and follows every key.
 *
 * @param tab the tab the caller is part of
 */
export function characterVersionOn(tab: Tab): number {
  if (app.tab !== tab) return -1;
  return app.characterVersion;
}

/** The character on the roster with that id, or null when the roster has none: an id of null
 *  never finds one. */
export function entryById(id: string | null): RosterEntry | null {
  return app.roster.find((entry) => entry.id === id) ?? null;
}

/** The character being worked on, or null when there is none. */
export function currentEntry(): RosterEntry | null {
  return entryById(app.characterId);
}
