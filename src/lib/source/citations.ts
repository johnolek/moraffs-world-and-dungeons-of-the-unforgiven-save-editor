/**
 * Reading the port's citations of the decompiled games out of its own source text.
 *
 * Every ported function's doc comment cites the decompiled function it came from, as in
 * `(exe 3000:d904, unf.c "sleep_monster")` — see `Naming and citations` in
 * `src/lib/game/port/README.md`. That is the formal citation, and `declarations` reads it off
 * the comment above each declaration of a file.
 *
 * Nothing here reads a file or knows which files exist: callers hand in the text. That keeps
 * this usable from the Source tab, which bundles the files with Vite, and from a Node script,
 * which reads them off the disk.
 */
import type { GameId } from '../app-state.svelte';

/** Where in the executable, and under what name, a decompiled function sits. */
export interface Citation {
  name: string;
  /** Segment and offset, as `3000:d904`. */
  address: string;
  /** The game whose decompilation holds the function: `unf.c` names Dungeons of the
   *  Unforgiven's, `mw.c` names Moraff's World's. */
  game: GameId;
}

/** One declaration of one file, with the decompiled function its comment cites. */
export interface PortFunction<F extends string = string> {
  file: F;
  name: string;
  /** Null where the comment above the declaration cites nothing. */
  c: Citation | null;
}

/**
 * A citation: `(exe 3000:d904, unf.c "sleep_monster")`, or the Moraff's World port's
 * `(WORLD.EXE 3000:4477, mw.c "show_roll")` — that game ships two executables, so its port names
 * the one it means.
 */
const CITATION = /\((?:exe|WORLD\.EXE)\s+([0-9a-f]{4}:[0-9a-f]+),\s+(unf|mw)\.c\s+"([^"]+)"\)/;
const CITED_GAME: Record<string, GameId> = { unf: 'unforgiven', mw: 'moraffsWorld' };
const EXPORTED_FUNCTION = /^export (?:async )?function (\w+)\s*\(/;
/** An exported value, with or without a type written on it: `export const TWINS: Twin[] = [`. */
const EXPORTED_VALUE = /^export const (\w+)\s*(?::[^=\n]+)?=/;
const CLASS_START = /^(?:export )?class \w/;
/** A method of a class: two spaces of indentation, an argument list, and an opening brace. */
const METHOD = /^ {2}(\w+)\s*\([^;]*\)\s*(?::[^{]+)?\{\s*$/;
/** Words that start a block inside a method, which is not a declaration of anything. */
const BLOCK_WORDS = ['if', 'for', 'while', 'switch', 'do', 'try', 'catch', 'else', 'return'];

function isComment(line: string): boolean {
  const text = line.trim();
  return text.startsWith('//') || text.startsWith('/*') || text.startsWith('*');
}

/** One line of a comment with the `//`, `/**` or `*` that marks it as one taken off. */
function commentText(line: string): string {
  return line.trim().replace(/^(?:\/\/+|\/\*+|\*+)/, '').replace(/\*\/$/, '').trim();
}

/** The function a comment cites, read across the whole comment so that a citation the line
 *  wrapping happens to split in two is still found. */
function citation(comment: string[]): Citation | null {
  const cited = CITATION.exec(comment.map(commentText).join(' '));
  if (!cited) return null;
  return { address: cited[1], name: cited[3], game: CITED_GAME[cited[2]] };
}

/**
 * The declarations of one file, in the order it declares them: every exported function and
 * value, and every method of a class.
 *
 * A citation is carried down from the comment written directly on top of a declaration. Any
 * other line between the two, blank ones included, drops it, so a citation in a file's opening
 * comment is not handed to whatever happens to be declared first.
 */
export function declarations<F extends string>(file: F, source: string): PortFunction<F>[] {
  const found: PortFunction<F>[] = [];
  let comment: string[] = [];
  let inClass = false;
  for (const line of source.split('\n')) {
    if (line.trim() === '') {
      comment = [];
      continue;
    }
    if (isComment(line)) {
      comment.push(line);
      continue;
    }
    if (CLASS_START.test(line)) inClass = true;
    else if (line === '}') inClass = false;
    const method = inClass ? METHOD.exec(line) : null;
    const name =
      EXPORTED_FUNCTION.exec(line)?.[1] ??
      EXPORTED_VALUE.exec(line)?.[1] ??
      (method && method[1] !== 'constructor' && !BLOCK_WORDS.includes(method[1]) ? method[1] : null);
    if (name) found.push({ file, name, c: citation(comment) });
    comment = [];
  }
  return found;
}
