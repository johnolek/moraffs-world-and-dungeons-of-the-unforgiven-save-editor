// Reading a decompiled routine against its port: what the routine does step by step, and where
// PORTED-FROM.md says the port plays it. `show-routine.mts` is the command over this.
//
// Reading a decompiled routine against its port is how the faithfulness pass is done, and two
// things make it work that a plain reading of the C does not give you. The first is that a
// routine's *data writes* matter as much as its calls and have to be read in with them: the
// chute's bug is `DAT_6000_0327 := 1` landing after the key wait rather than before it, which is
// invisible in a list of calls. The second is that the useful question is usually asked of the
// callee rather than the caller — every caller of FUN_2000_4054 draws a plaque, so asking which
// port sites answer for those callers finds a whole class of fault at once.
import { parseSections, type DecompSection } from '../src/lib/source/sections.ts';

export interface Game {
  decomp: string;
  page: string;
}

/** The two games with a decompilation and a PORTED-FROM.md to read it against. */
export const GAMES: Record<string, Game> = {
  dotu: { decomp: 'dotu-tools/decomp/unf.c', page: 'dotu-tools/docs/PORTED-FROM.md' },
  mw: { decomp: 'mw-tools/decomp/mw.c', page: 'mw-tools/docs/PORTED-FROM.md' },
};

/** A call in the C, which is a name followed by an open bracket. */
const CALL = /\b([A-Za-z_]\w*)\s*\(/g;
/** A write to one of the game's globals: `DAT_6000_0327 = 1;`. */
const WRITE = /\b(DAT_6000_[0-9a-f]+)\s*=\s*([^;=][^;]*);/g;
/** Words that are followed by a bracket and are not a call. */
const NOT_A_CALL = new Set([
  'if', 'while', 'for', 'switch', 'return', 'sizeof', 'do', 'else',
  'CONCAT22', 'CONCAT11', 'CONCAT31', 'SUB42', 'SUB41',
  'undefined', 'undefined1', 'undefined2', 'undefined4',
  'uint', 'int', 'char', 'short', 'long', 'byte', 'ulong', 'ushort', 'code', 'void',
]);

/** One thing a routine does, in the order it does it. */
type Step = { at: number; what: string };

/**
 * The calls and the global writes of one routine, in order, with a run of the same one collapsed.
 *
 * A name is taken as a call when the decompilation has a routine of that name, or when it is all
 * lower case, which is what the C library's names look like here.
 */
export function stepsOf(section: DecompSection, known: Set<string>): string[] {
  const steps: string[] = [];
  let last: string | null = null;
  for (const line of section.body.split('\n')) {
    const code = line.split('//')[0];
    const found: Step[] = [];
    for (const write of code.matchAll(WRITE)) {
      found.push({ at: write.index, what: `${write[1]} := ${write[2].trim().slice(0, 30)}` });
    }
    for (const call of code.matchAll(CALL)) {
      const name = call[1];
      if (NOT_A_CALL.has(name) || name === section.name) continue;
      if (!known.has(name) && name !== name.toLowerCase()) continue;
      found.push({ at: call.index, what: name });
    }
    for (const step of found.sort((a, b) => a.at - b.at)) {
      if (step.what !== last) steps.push(step.what);
      last = step.what;
    }
  }
  return steps;
}

/** Where `PORTED-FROM.md` says a routine is played, as one line. */
export function portedAt(page: string, address: string): string {
  for (const line of page.split('\n')) {
    if (!line.startsWith('| `') || !line.includes(`| ${address} |`)) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    const named = cells[3] || '—';
    const mentioned = cells[4] || '—';
    return `named in ${named}\n      mentioned in ${mentioned}`;
  }
  return 'nothing in the port points at it';
}
