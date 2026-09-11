import type { PortedGameId, RosterEntry } from '../app-state.svelte';
import { characterDied, replaceCharacterBytes, runSessionPlayed } from '../character/current';
import type { ZipEntry } from '../zip';
import {
  runMoveControl,
  startGame,
  type CharacterFile,
  type GameSession,
  type PlayView,
} from './engine';
import { dotuMapFiles, mwMapFiles, revMapFile } from './export-maps';
import { gameKey } from './keys';
import type { PlayLoopSession } from './loop';
import { characterMaps } from './memory';
import type { PlayMode, PlayDisplay } from './mode';
import { runMwMoveControl, startMwGame, type MwCharacterFile, type MwGameSession, type MwPlayView } from './mw/engine';
import { mwGameKey } from './mw/keys';
import { revCharacterMap } from './rev/memory';
import {
  runRevDungeon,
  startRevGame,
  type RevCharacterFile,
  type RevGameSession,
  type RevPlayView,
} from './rev/engine';
import { revGameKey } from './rev/keys';
import { RunRecorder, runTotals, type RunTotals } from './run';

/**
 * What the Play tab needs of the game it is playing.
 *
 * One tab plays all three games (`PlayTab.svelte`): the roster, the screen switch, the mode
 * radios, the run block and the over-box are the same wherever they are, and everything that is
 * not — how a game is started, what its loop is called, what a browser key means to it and where
 * on the floor its view says the character is standing — is a row of this table. The three
 * wrappers each pick their row and hand the shell the snippets for their own screen and panel.
 */

/** What the tab needs of a session, whatever else each game's own session carries. */
export interface PlaySession<View> extends PlayLoopSession {
  /** How much of the game the tab is showing, which the session carries into the run log. */
  mode: PlayMode;
  /** Called whenever the game is about to wait for a key, so the tab can draw. */
  onChange: (() => void) | null;
  /** The run this game is being written down in, or null. */
  readonly run: RunRecorder | null;
  press(key: number): void;
  recordEdited(bytes: Uint8Array): void;
  /** Nothing is going to draw this session again, so anything of its own still running stops. */
  finish(): void;
  view(): View;
}

/** What the tab needs of a view, whatever else each game's own view carries. */
export interface PlayViewBase {
  over: boolean;
  dead: boolean;
  /** The message the play loop threw and stopped on, or null. */
  stopped: string | null;
  run: RunTotals | null;
}

/** Where on the floor the character is standing, which is what the map is kept centred on. */
export interface PlayPlace {
  x: number;
  y: number;
  floor: number;
}

/** The game as it stands, which is what the tab hands each of its snippets. */
export interface PlayStage<Session, View> {
  session: Session;
  view: View;
  mode: PlayMode;
  display: PlayDisplay;
  /** How long the game's screen takes to appear, from the switch's slider. */
  redraw: number;
}

/** One game the Play tab can play. */
export interface PlayGame<Session extends PlaySession<View>, View extends PlayViewBase> {
  /** The game as the roster, the browser's memory and a run log all name it. */
  id: PortedGameId;
  /** The paragraph under the heading on the tab's landing page. */
  lead: string;
  /** What the landing page says when the character on the roster plays another game. */
  hint: string;
  /** How many pixels a square is drawn at when the map is centred on the character. */
  cell: number;
  /** A character off the roster, started: the file, the run log and the session in one. */
  start(entry: RosterEntry, sound: boolean): Session;
  /** The loop `runPlayLoop` runs for this game. */
  loop(session: Session): Promise<void>;
  /** A browser key event as the byte the game's own loop dispatches on, or null. */
  gameKey(event: KeyboardEvent): number | null;
  place(view: View): PlayPlace;
  /** The map files this character would have beside them in the game's own folder. */
  mapFiles(session: Session, entry: RosterEntry): ZipEntry[];
}

/** The record on the roster, as a game reads and writes it while it is being played. */
function playedFile(entry: RosterEntry): CharacterFile {
  // Where this game goes in the character's run: on the end of the sessions it has already been
  // played in, written again every time the record is.
  const at = entry.run.length;
  return {
    bytes: entry.bytes,
    write(bytes) {
      this.bytes = bytes;
      replaceCharacterBytes(bytes);
    },
    died: characterDied,
    keepRun: (session, journal) => runSessionPlayed(entry, at, session, journal),
  };
}

/**
 * Every game is a session of the character's run: a seed of its own, and every key that follows
 * written down beside it. It goes on counting from what the sessions before it came to, so that
 * leaving the game and playing on does not start the count again.
 *
 * The board the character is locked to goes in as play begins, since nothing in a game changes
 * it.
 */
function recorder(game: PortedGameId, entry: RosterEntry, sound?: boolean): RunRecorder {
  return new RunRecorder({
    game,
    name: entry.name,
    record: entry.bytes,
    sound,
    leaderboard: entry.leaderboard,
    before: runTotals(entry.run),
  });
}

function startUnforgiven(entry: RosterEntry, sound: boolean): GameSession {
  const file: CharacterFile = {
    ...playedFile(entry),
    // The explored maps live beside the roster entry, the way the game's .DUN files live beside
    // the character's record.
    maps: characterMaps(entry.id),
  };
  const run = recorder('unforgiven', entry);
  const session = startGame(file, run.rng, run);
  // DS:022b starts at 0, sound on; the tab's choice stands in for that (`mode.ts`).
  session.game.sound = sound;
  return session;
}

function startMoraffsWorld(entry: RosterEntry, sound: boolean): MwGameSession {
  const file: MwCharacterFile = { ...playedFile(entry), maps: characterMaps(entry.id) };
  const run = recorder('moraffsWorld', entry);
  const session = startMwGame(file, run.rng, run);
  // DS:119f starts at 0, sound on; the tab's choice stands in for that (`mode.ts`).
  session.game.sound = sound;
  return session;
}

function startMoraffsRevenge(entry: RosterEntry, sound: boolean): RevGameSession {
  const file: RevCharacterFile = {
    ...playedFile(entry),
    // The explored map lives beside the roster entry, the way <n>.BIN lives beside <n>.EXE.
    map: revCharacterMap(entry.id),
    // F5.COM holds the names in the game's own folder; here the roster entry does.
    name: entry.name,
  };
  const run = recorder('revenge', entry, sound);
  return startRevGame(file, run.rng, run, sound);
}

export const PLAY_GAMES = {
  unforgiven: {
    id: 'unforgiven',
    lead:
      "Dungeons of the Unforgiven, played in a browser: the game's own dungeon, its own monsters and its own keys, on " +
      'the screen the game draws them on. The character on the roster is the one who walks, and the game saves them ' +
      'back where it would have saved them, so they can go on playing in DOS.',
    hint: 'Load a Dungeons of the Unforgiven save, or roll a character below, and this is where they play.',
    cell: 22,
    start: startUnforgiven,
    loop: (session) => runMoveControl(session),
    gameKey,
    place: (view) => ({ x: view.place.x, y: view.place.y, floor: view.place.floor }),
    mapFiles: (session, entry) => dotuMapFiles(session.memory.exploredFloors(), entry.slot),
  } satisfies PlayGame<GameSession, PlayView>,

  moraffsWorld: {
    id: 'moraffsWorld',
    lead:
      "Moraff's World, played in a browser: the game's own dungeon, its own monsters and its own keys, on the screen " +
      'the game draws them on. The character on the roster is the one who walks, and the game saves them back where ' +
      'it would have saved them, so they can go on playing in DOS.',
    hint: "Load a Moraff's World save, or roll a character below, and this is where they play.",
    cell: 22,
    start: startMoraffsWorld,
    loop: (session) => runMwMoveControl(session),
    gameKey: mwGameKey,
    place: (view) => ({ x: view.place.x, y: view.place.y, floor: view.place.floor }),
    mapFiles: (session, entry) =>
      mwMapFiles(session.memory.exploredFloors(), entry.slot, session.game.pc.dungeon),
  } satisfies PlayGame<MwGameSession, MwPlayView>,

  revenge: {
    id: 'revenge',
    lead:
      "Moraff's Revenge, played in a browser: the dungeon the wall rule works out square by square, the monsters the " +
      "disk has standing on it, and the game's own keys. The monsters move on their own clock while you think, " +
      'and a fight is turn based once one is beside you. The character on the roster is the one who walks, and the ' +
      'game saves them back where it would have saved them.',
    hint: "Load a Moraff's Revenge save, or roll a character below, and this is where they play.",
    cell: 26,
    start: startMoraffsRevenge,
    loop: (session) => runRevDungeon(session),
    gameKey: revGameKey,
    place: (view) => ({ x: view.place.x, y: view.place.y, floor: view.place.level }),
    mapFiles: (session, entry) => [revMapFile(session.game.memory.bytes(), entry.slot)],
  } satisfies PlayGame<RevGameSession, RevPlayView>,
};
