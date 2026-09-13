import { typedName } from '../game/port/character';
import type { Question } from './session';

/** A screen the roller waits at: one of the game's own, or the page the tab opens on, where
 *  nothing has been rolled yet. */
export type RollerScreen = Question | 'start';

/** What a key does at the screen showing. */
export type RollerAction =
  /** Answer the question the roller is waiting on. */
  | { kind: 'answer'; value: number }
  /** What the name being typed now reads. */
  | { kind: 'typing'; typed: string }
  /** Enter: take the name that is typed, or start the roll. */
  | { kind: 'accept' }
  /** Move a menu's pointer, which is what the arrow keys do in Moraff's Revenge. */
  | { kind: 'move'; step: number };

/** How many lines the menus have, which the tab reads out of the game it is showing. */
export interface RollerMenus {
  races: number;
  classes: number;
}

/**
 * The letter each characteristic takes on the design screen, in the order the answers number
 * them. Both games print "PRESS 'S', 'I', 'W', 'C', 'D', OR 'L'" and then read A for agility, so
 * D does nothing there at all.
 */
export const DESIGN_STAT_KEYS = ['S', 'I', 'W', 'C', 'A', 'L'];

/** Moraff's Revenge asks the keep question as "Do you want it (Y, N, OR ESC)?" and reads the two
 *  letters; Escape leaves the roller altogether, which the tab's own button stands in for. */
const REV_KEEP_KEYS = ['Y', 'N'];

/** How many races that game's menu goes round. */
const REV_RACES = 4;

/** The answer that leaves the design screen and rolls another character. */
const DESIGN_CANCELLED = 6;

/** Keep this character, roll another, or design one, the way both games read that menu. */
const KEEP_KEYS = ['Y', 'N', 'D'];

/** What a key does at the screen showing, or null when the screen has no use for it. */
export function rollerKey(screen: RollerScreen, key: string, typed: string, menus: RollerMenus): RollerAction | null {
  switch (screen) {
    case 'continue':
      return isKey(key) ? { kind: 'answer', value: 0 } : null;
    case 'start':
      return key === 'Enter' ? { kind: 'accept' } : null;
    case 'difficulty':
      return menuLine(key, 2);
    case 'race':
      return menuLine(key, menus.races);
    case 'class':
      return menuLine(key, menus.classes);
    case 'keepRerollDesign':
      return letter(key, KEEP_KEYS);
    case 'designStat':
      if (key === 'Escape') return { kind: 'answer', value: DESIGN_CANCELLED };
      return letter(key, DESIGN_STAT_KEYS);
    case 'revRace':
      if (key === 'ArrowRight' || key === 'ArrowDown') return { kind: 'move', step: 1 };
      if (key === 'ArrowLeft' || key === 'ArrowUp') return { kind: 'move', step: -1 };
      if (key === 'Enter') return { kind: 'accept' };
      return numbered(key, REV_RACES);
    case 'revKeep':
      return letter(key, REV_KEEP_KEYS);
    case 'revClass':
      return numbered(key, 2);
    case 'name':
      return name(key, typed);
    default:
      return null;
  }
}

/** A menu whose answer is the number the player typed rather than the line it picks: Moraff's
 *  Revenge reads its class menu with VAL, so 1 means 1. */
function numbered(key: string, lines: number): RollerAction | null {
  const value = digit(key);
  return value !== null && value >= 1 && value <= lines ? { kind: 'answer', value } : null;
}

/** A menu line, which the game numbers from one. */
function menuLine(key: string, lines: number): RollerAction | null {
  const line = digit(key);
  return line !== null && line >= 1 && line <= lines ? { kind: 'answer', value: line - 1 } : null;
}

function letter(key: string, keys: string[]): RollerAction | null {
  const value = keys.indexOf(key.toUpperCase());
  return value < 0 ? null : { kind: 'answer', value };
}

/** The name is typed a key at a time, and the game keeps letters, digits and spaces only. */
function name(key: string, typed: string): RollerAction | null {
  if (key === 'Enter') return { kind: 'accept' };
  if (key === 'Backspace') return { kind: 'typing', typed: typed.slice(0, -1) };
  if (key.length !== 1 || typedName(key) === '') return null;
  return { kind: 'typing', typed: typedName(typed + key) };
}

function digit(key: string): number | null {
  return /^[0-9]$/.test(key) ? Number(key) : null;
}

/** The pauses take any key, which a modifier pressed on its own is not. Tab is left to the
 *  browser so the page can still be walked through with the keyboard. */
function isKey(key: string): boolean {
  return key.length === 1 || key === 'Enter' || key === 'Backspace' || key === 'Escape';
}
