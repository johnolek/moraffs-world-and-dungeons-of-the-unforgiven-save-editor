import type { Leaderboard, PortedGameId } from '../app-state.svelte';
import { readStored, writeStored } from '../character/storage';
import type { DiscoveredMap } from '../map/draw-floor';
import type { StockedMonster } from '../map/stocking';

/**
 * How much of the game a Play tab shows, which is a choice the tab offers and the browser
 * remembers for each game.
 *
 * Both games keep a great deal to themselves — a monster's hit points, the charges left on a
 * wand, the turns left on a spell, where the monsters on the floor are standing — and the tabs
 * were built showing all of it. This is the switch: **faithful** shows nothing the game does not
 * show, which is the map the character has discovered and the monsters its 3-D views would have
 * drawn; **speedrun** adds the whole floor, so that a run need not be planned against the maps
 * elsewhere on this site, but marks only the monsters faithful marks, since the monsters are
 * rolled afresh every game and finding them is part of the run; and **debug** shows everything
 * the port knows.
 *
 * This says how much of the game is shown and nothing else. Which dungeon is being played is a
 * separate fact and is decided elsewhere: a character rolled to play the endless dungeon plays it
 * in every one of the three, because the rules come from the lock on its roster entry rather than
 * from here (`startUnforgiven` in `games.ts`, `src/lib/game/endless/rules.ts`).
 */
export type PlayMode = 'faithful' | 'speedrun' | 'debug';

/** What a game is played in until the player says otherwise. */
export const DEFAULT_PLAY_MODE: PlayMode = 'faithful';

/** Where the choice is kept, one key per game. */
const PREFIX = 'moraff-tools.play.';
const SUFFIX = '.mode';

/** The three modes the control on a Play tab offers, each with a line about what it shows. */
export const PLAY_MODES: { id: PlayMode; label: string; how: string }[] = [
  {
    id: 'faithful',
    label: 'Faithful',
    how: 'Only what the game shows: the map you have discovered, the monsters its views would draw, and no hidden numbers.',
  },
  {
    id: 'speedrun',
    label: 'Speedrun',
    how: "The whole floor, so a route can be planned, but only the monsters the game's views would draw, and none of the hidden numbers.",
  },
  {
    id: 'debug',
    label: 'Debug',
    how:
      "The whole floor and every monster on it, plus the numbers the game never prints: over the game's own screen and in the panel beside it.",
  },
];

function isPlayMode(value: unknown): value is PlayMode {
  return PLAY_MODES.some((mode) => mode.id === value);
}

/**
 * How much of the game a character locked to a mode is shown.
 *
 * Two of the three locks are modes and answer for themselves. The endless lock is not: it names
 * the dungeon the character plays in and says nothing about how much of it is shown, and a
 * character on the endless board is shown what faithful shows, so that every run on that board is
 * a run of the same game.
 */
export function lockedPlayMode(lock: Leaderboard): PlayMode {
  return lock === 'endless' ? 'faithful' : lock;
}

/**
 * Whether the Play tab offers a character the mode radios rather than the mode it is locked to.
 *
 * A locked character is played its own way and has no radios, with one exception: an endless
 * character that is on no board. Its lock is the dungeon rather than the presentation, and John
 * (2026-09-15) wants one carried down to any floor and looked at in debug. Its runs are on no
 * board, so no run of it is being compared with anything.
 */
export function modeIsChosen(lock: Leaderboard | null, onBoard: boolean): boolean {
  return lock === null || (lock === 'endless' && !onBoard);
}

/** Which mode this game is played in: the player's choice, or faithful. */
export function readPlayMode(game: PortedGameId): PlayMode {
  const stored = readStored(PREFIX + game + SUFFIX);
  return isPlayMode(stored) ? stored : DEFAULT_PLAY_MODE;
}

export function writePlayMode(game: PortedGameId, mode: PlayMode): void {
  writeStored(PREFIX + game + SUFFIX, mode);
}

/**
 * Which of the two a Play tab has on its stage: the game's own screen — the four 3-D views and
 * the boxes the game draws around them — or the site's top-down map of the floor.
 */
export type PlayDisplay = 'screen' | 'map';

/** Where the choice is kept, one key per game, beside the mode. */
const DISPLAY_SUFFIX = '.display';

/** The two the switch on a Play tab offers. */
export const PLAY_DISPLAYS: { id: PlayDisplay; label: string }[] = [
  { id: 'screen', label: "The game's screen" },
  { id: 'map', label: 'The map' },
];

function isPlayDisplay(value: unknown): value is PlayDisplay {
  return PLAY_DISPLAYS.some((display) => display.id === value);
}

/**
 * What a game shows before the player has chosen: the game's own screen.
 * John (2026-09-08): the 3-D view is the default even for debug and speedrun; the top-down map
 * is a toggle of its own, which the mode never resets.
 */
export const DEFAULT_PLAY_DISPLAY: PlayDisplay = 'screen';

/** Which of the two this game shows: the player's choice, or the default above. */
export function readPlayDisplay(game: PortedGameId): PlayDisplay {
  const stored = readStored(PREFIX + game + DISPLAY_SUFFIX);
  return isPlayDisplay(stored) ? stored : DEFAULT_PLAY_DISPLAY;
}

export function writePlayDisplay(game: PortedGameId, display: PlayDisplay): void {
  writeStored(PREFIX + game + DISPLAY_SUFFIX, display);
}

/** Where the choice is kept, one key per game, beside the mode and the display. */
const COLOURBLIND_SUFFIX = '.colourblind';

/**
 * Whether the stage is drawn through a red-green colourblindness simulation.
 *
 * This is a filter over the pixels the port has already drawn and nothing else: the game's
 * palettes, its drawing and everything it decides are untouched, and turning it on mid-game
 * changes only what the screen looks like.
 */
export function readPlayColourblind(game: PortedGameId): boolean {
  return readStored(PREFIX + game + COLOURBLIND_SUFFIX) === 'on';
}

export function writePlayColourblind(game: PortedGameId, on: boolean): void {
  writeStored(PREFIX + game + COLOURBLIND_SUFFIX, on ? 'on' : 'off');
}

/** Where the choice is kept, one key per game, beside the mode and the display. */
const SOUND_SUFFIX = '.sound';

/**
 * Whether a game starts with its sound on.
 *
 * Moraff's Revenge asks on the way in: "Sound (Y or N)?" at DUNSMALL.EXE 1000:0517, over the
 * title screen, and it takes nothing but an upper-case Y or N (1000:0523). N writes 1 into
 * DGROUP B4BC, the flag the `O` key flips in play, and Y leaves it at the 0 it starts as. This
 * port draws no title screen, so the tab asks instead. The other two games start with their
 * switch (DS:022b, DS:119f) set from the same choice, and their O keys flip it in play.
 *
 * Off until the player says otherwise (John, 2026-09-09).
 */
export function readPlaySound(game: PortedGameId): boolean {
  return readStored(PREFIX + game + SOUND_SUFFIX) === 'on';
}

export function writePlaySound(game: PortedGameId, on: boolean): void {
  writeStored(PREFIX + game + SOUND_SUFFIX, on ? 'on' : 'off');
}

/** Where the choice is kept, one key per game, beside the mode and the display. */
const CLOCK_RESEED_SUFFIX = '.clock-reseed';

/**
 * Whether the game starts its random number generator again from the machine's clock wherever the
 * original starts it again from the PC's, which is what makes a swing's to-hit roll climb a
 * sawtooth in real time and lays a fresh floor's monsters in diagonal stripes (section 8 of
 * `dotu-tools/docs/UNFORGIVEN-RE-NOTES.md`).
 *
 * Only debug mode offers the choice, and only Dungeons of the Unforgiven has the switch: faithful
 * and speedrun always reseed, since a game that does not is not the game. Off, the run draws its
 * numbers from one generator seeded once, which is the port's third departure.
 */
export function readPlayClockReseed(game: PortedGameId): boolean {
  return readStored(PREFIX + game + CLOCK_RESEED_SUFFIX) !== 'off';
}

export function writePlayClockReseed(game: PortedGameId, on: boolean): void {
  writeStored(PREFIX + game + CLOCK_RESEED_SUFFIX, on ? 'on' : 'off');
}

/** The switch's label and the line under it, which says when a change to it takes hold. */
export const CLOCK_RESEED_LABEL = 'Reseed from the clock, as the game does';
export const CLOCK_RESEED_NOTE =
  'Read when a game starts, so changing it now takes effect the next time this character is played.';

/**
 * Whether this game is played on the clock: always in faithful and speedrun, and in debug
 * whichever way the switch above was left.
 *
 * @param switchedOn {@link readPlayClockReseed}, which only debug mode is asked for.
 */
export function clockReseeds(mode: PlayMode, switchedOn: boolean): boolean {
  return mode === 'debug' ? switchedOn : true;
}

/** Where the choice is kept, one key per game, beside the mode and the display. */
const FORWARD_VIEW_SUFFIX = '.forward-view';

/**
 * Whether the top-down map draws the game's forward-facing 3-D view over itself, in the frame the
 * picture of the monster being fought stands in.
 *
 * Off until the player asks for it: the map is the site's own view of the floor, and the game's
 * own screen is where the 3-D views live.
 */
export function readPlayForwardView(game: PortedGameId): boolean {
  return readStored(PREFIX + game + FORWARD_VIEW_SUFFIX) === 'on';
}

export function writePlayForwardView(game: PortedGameId, on: boolean): void {
  writeStored(PREFIX + game + FORWARD_VIEW_SUFFIX, on ? 'on' : 'off');
}

/** The inline SVG filter the switch defines and a stage points at. */
export const COLOURBLIND_FILTER_ID = 'red-green-simulation';

/** What a stage's CSS `filter` is set to, or null to leave it alone. */
export function colourblindFilter(on: boolean): string | null {
  return on ? `url(#${COLOURBLIND_FILTER_ID})` : null;
}

/**
 * Whether a key cuts short a pause of the game's own: a message it is holding on the screen, or a
 * stretch it leaves one standing for before it reads the keyboard again.
 *
 * None of the three games reads the keyboard while one of its own delays is running, so a player
 * at the original could not hurry one along: the teleporter tunnel rushed at them for its full
 * five seconds, DIGGING... DIGGING... flashed four times whatever they pressed, and the HIT ANY
 * KEY plaque could not be answered before it was drawn. Faithful and speedrun both sit through
 * them, a speedrun being run against the original's own timing, and debug — which is for looking
 * at the port rather than playing the game — still cuts them short. Either way the key is taken
 * as it is given: it waits the way one typed at DOS waits in the keyboard buffer, so the same
 * keys reach the game in the same order whichever mode a run was played in.
 */
export function waitsAreEnforced(mode: PlayMode): boolean {
  return mode !== 'debug';
}

/**
 * Whether the column of numbers the game keeps and never prints is shown — the engaged monster's
 * hit points and the chance a swing lands, the charges on every wand and scroll, the turns left
 * on every spell, the odds the square underfoot holds a trap door, how many monsters are left
 * alive and which are nearest.
 */
export function panelVisible(mode: PlayMode): boolean {
  return mode === 'debug';
}

/**
 * Whether debug mode's own marks are drawn over the game's own screen: the engaged monster's
 * numbers on its view, and a mark on every monster the zoom map's window reaches.
 *
 * Nothing here is a port of anything the game draws, so faithful and speedrun leave the screen
 * exactly as the game would have it.
 */
export function debugDrawn(mode: PlayMode): boolean {
  return mode === 'debug';
}

/** What a tab knows about the monsters on the floor: every one standing on it, the ones the
 *  3-D views have just drawn, and the one the character is facing. Both games' views have
 *  these. */
export interface MonstersInSight {
  monsters: StockedMonster[];
  visible: StockedMonster[];
  engaged: StockedMonster | null;
}

/**
 * The monsters the map draws.
 *
 * Faithful draws the ones the 3-D views drew this turn, which is every monster standing on a
 * square any of the four views reached, and the one being fought whether or not it is among
 * them: the game names that one itself, beside its picture, and Moraff's World points at it
 * without any line of sight at all. Speedrun draws the same: the monsters are rolled afresh
 * every game, so finding them is part of the run (John, 2026-09-09). Debug draws the whole floor.
 */
export function monstersDrawn(mode: PlayMode, sight: MonstersInSight): StockedMonster[] {
  if (mode === 'debug') return sight.monsters;
  const seen = [...sight.visible];
  const engaged = sight.engaged;
  if (engaged !== null && !seen.some((monster) => monster.slot === engaged.slot)) seen.push(engaged);
  return seen;
}

/**
 * The monsters the game's own zoom map marks, which is every one on the floor in debug and none
 * at all otherwise.
 *
 * The three games draw the same small map of the squares around the character and not one of
 * them ever puts a monster on it, so this is a mark of the site's own: showing it in faithful or
 * in speedrun would be showing something no game ever showed.
 */
export function zoomMapMonsters(mode: PlayMode, sight: { monsters: StockedMonster[] }): StockedMonster[] {
  return debugDrawn(mode) ? sight.monsters : [];
}

/**
 * Whether the floor is drawn as the character has discovered it rather than whole, which is what
 * faithful does and what speedrun and debug do not.
 */
export function discoveredMapOnly(mode: PlayMode): boolean {
  return mode === 'faithful';
}

/**
 * The map the floor is drawn from: the one the character has discovered in faithful, and none in
 * the other two modes, where the whole floor is drawn.
 *
 * `MapMemory` is what the two games that share a map engine hand it; Moraff's Revenge keeps its
 * own and hands over the same one question, which is all this asks for.
 */
export function mapDrawn(mode: PlayMode, memory: { discovered(): DiscoveredMap }): DiscoveredMap | null {
  return discoveredMapOnly(mode) ? memory.discovered() : null;
}

/** Where the choice is kept, one key per game, beside the mode and the display. */
const REDRAW_SUFFIX = '.redraw';

/** A screen that appears all at once, which is what a game shows until the slider is moved. */
export const INSTANT_REDRAW_MS = 0;

/** The slowest a screen can be made to appear: two seconds from its first paint to its last. */
export const SLOWEST_REDRAW_MS = 2000;

/** What one notch of the slider is worth. */
export const REDRAW_STEP_MS = 100;

/**
 * How long a new screen takes to appear, a piece at a time: Dungeons of the Unforgiven's paint by
 * paint in the order the game drew it, the other two games' row by row from the top down.
 *
 * A machine slow enough to watch drew a screen a row at a time as the processor reached it, and
 * this is the tab doing the same on purpose. Nothing of the game is behind it: the frame is
 * worked out and finished before any of it is shown, so the wipe only decides when the pixels
 * reach the canvas. The game, the monsters' clock and the run log run exactly as they do with it
 * at Instant.
 */
export function readPlayRedraw(game: PortedGameId): number {
  const stored = Number(readStored(PREFIX + game + REDRAW_SUFFIX));
  if (!Number.isFinite(stored) || stored <= 0) return INSTANT_REDRAW_MS;
  return Math.min(stored, SLOWEST_REDRAW_MS);
}

export function writePlayRedraw(game: PortedGameId, ms: number): void {
  writeStored(PREFIX + game + REDRAW_SUFFIX, String(ms));
}

/** What the slider says it is set to, which is a whole number of tenths of a second. */
export function redrawWords(ms: number): string {
  return ms <= 0 ? 'Instant' : `${(ms / 1000).toFixed(1)} s`;
}

/** Where the choice is kept, one key per game, beside the mode and the display. */
const ANNOUNCEMENTS_SUFFIX = '.announcements';

/**
 * Whether an announcement the run server makes while this game is being played is printed in the
 * game's own message box.
 *
 * The footer and the timeline both show announcements, and a player at the game's screen is
 * looking at neither of them. This puts the newest one where their eyes already are. It is drawn
 * by the tab over the box and never reaches the game, so a run played with it on is the same run
 * as one played with it off.
 *
 * Off until the player asks for it: it is the site writing in a box the game owns.
 */
export function readPlayAnnouncements(game: PortedGameId): boolean {
  return readStored(PREFIX + game + ANNOUNCEMENTS_SUFFIX) === 'on';
}

export function writePlayAnnouncements(game: PortedGameId, on: boolean): void {
  writeStored(PREFIX + game + ANNOUNCEMENTS_SUFFIX, on ? 'on' : 'off');
}

/** What the switch for it says. */
export const ANNOUNCEMENTS_LABEL = 'Announcements in the message box';
