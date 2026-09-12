/**
 * The routines of the decompiled games, and which game an address in the port belongs to.
 *
 * Ghidra's function table for each of the two C games is `functions.txt` in its bundle, one
 * routine a line with its address, name, size and callers. A comment in the port mostly names an
 * address inside a routine rather than its first byte, so the question this answers is which
 * routine contains an address.
 *
 * Which game's table to ask is the harder question, because unf.exe and WORLD.EXE were built by
 * the same compiler with the same segment layout and `2000:9dbc` is a real routine in both. The
 * address never says; the file it is written in does, and the executable's name written in
 * front of it overrides the file. `mentionGame` is that rule.
 *
 * Nothing here reads a file: the table's text and the file's path are handed in.
 */
import type { GameId } from '../app-state.svelte';
import type { Mention } from './citations';

/** One routine of a decompiled game, as Ghidra's function table lists it. */
export interface Routine {
  /** Segment and offset in lower case, as `2000:c308`. */
  address: string;
  segment: number;
  offset: number;
  /** The name the reverse engineering gave it, or Ghidra's `FUN_2000_c28b` where it gave none. */
  name: string;
  /** Bytes of machine code. */
  size: number;
  callers: string[];
}

const TABLE_LINE = /^([0-9a-f]{4}):([0-9a-f]{4})\t(\S+)\tsize=(\d+)\tcallers=(.*)$/;

/** The routines in a `functions.txt`, sorted by address. Lines that are not a routine are skipped. */
export function parseRoutines(table: string): Routine[] {
  const routines: Routine[] = [];
  for (const line of table.split('\n')) {
    const match = TABLE_LINE.exec(line);
    if (!match) continue;
    const [, segment, offset, name, size, callers] = match;
    routines.push({
      address: `${segment}:${offset}`,
      segment: parseInt(segment, 16),
      offset: parseInt(offset, 16),
      name,
      size: Number(size),
      callers: callers.split(',').map((caller) => caller.trim()).filter(Boolean),
    });
  }
  return routines.sort((a, b) => a.segment - b.segment || a.offset - b.offset);
}

/**
 * The routine an address falls inside, or null where none does. A routine Ghidra gave no size
 * still owns its first byte.
 */
export function routineAt(routines: Routine[], address: string): Routine | null {
  const [segment, offset] = address.split(':').map((part) => parseInt(part, 16));
  let low = 0;
  let high = routines.length - 1;
  let last: Routine | null = null;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const routine = routines[middle];
    const before = routine.segment < segment || (routine.segment === segment && routine.offset <= offset);
    if (before) {
      last = routine;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (!last || last.segment !== segment) return null;
  return offset < last.offset + Math.max(last.size, 1) ? last : null;
}

/**
 * A directory or file named for a game: `mw`, `mw-port`, `mwmap.js`, `MwScreen.svelte`, `rev`,
 * `rev-bestiary`, `revmap.js`, `RevPlay.svelte`. The letter after the prefix must not be a lower
 * case one, other than in the two map generators, so that a file named for reviewing or
 * revealing something is not taken for Moraff's Revenge's.
 */
const NAMED_FOR_GAME = /^(mw|Mw|rev|Rev)(?:map|[^a-z]|$)/;

/**
 * The game a file is about by its path, or null for a file that is not named for one — which is
 * most of the port, since Dungeons of the Unforgiven was the first game and its files carry no
 * mark, and the files that serve every game (the map explorer, the editor, the roller) carry
 * none either.
 */
export function directoryGame(file: string): GameId | null {
  for (const part of file.split('/')) {
    const named = NAMED_FOR_GAME.exec(part);
    if (named) return named[1].toLowerCase() === 'mw' ? 'moraffsWorld' : 'revenge';
  }
  return null;
}

/**
 * The game an address in a file belongs to.
 *
 * An executable's name written in front of the address says outright. `exe` means the game the
 * file is a port of, which is the game its path is named for, and Dungeons of the Unforgiven
 * where it is named for none. A bare address in a file named for a game is that game's. In any
 * other file a bare address is Dungeons of the Unforgiven's unless it is in segment 1000, which
 * is the whole of Moraff's Revenge and only the Borland runtime in the two C games — and the
 * port, when it cites the runtime, writes `exe` in front.
 */
export function mentionGame(file: string, mention: Mention): GameId {
  switch (mention.prefix) {
    case 'UNF.EXE':
      return 'unforgiven';
    case 'WORLD.EXE':
      return 'moraffsWorld';
    case 'DUNSMALL.EXE':
      return 'revenge';
  }
  const named = directoryGame(file);
  if (named) return named;
  if (mention.prefix === 'exe') return 'unforgiven';
  return mention.address.startsWith('1000:') ? 'revenge' : 'unforgiven';
}
