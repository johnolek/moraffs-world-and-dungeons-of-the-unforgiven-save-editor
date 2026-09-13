// Comparing what a routine of the original calls with what the code that plays it calls.
//
// The anchor sweep of MORF-426 found three divergences by hand, all of the same shape: the
// original calls something at a point where the port does not. That shape can be looked for
// everywhere at once rather than a routine at a time, which is what this does.
//
// The port says which routine each of its functions came from — `(exe 3000:d904, unf.c
// "sleep_monster")` — so those citations are a dictionary between the two call graphs. Read the
// original's graph out of the decompilation, read the port's out of its own source, translate
// the port's through the dictionary, and anything the original calls that its counterpart does
// not is worth a look.
//
// It cannot be conclusive, and is not meant to be. The port splits some routines into several,
// calls helpers the original has no name for, and reaches some things through the play layer
// rather than from inside the ported function. What it gives is a short list to read, in place
// of 647.
import { readFileSync } from 'node:fs';
import { declarations } from '../src/lib/source/citations.ts';
import { parseSections, type DecompSection } from '../src/lib/source/sections.ts';
import { snippet } from '../src/lib/ui/source-snippet.ts';
import { portFiles } from './ported-from.mts';

/** A name followed by an open bracket, which is how a call looks in both languages. */
const CALL = /\b([A-Za-z_]\w*)\s*\(/g;

/** Words followed by a bracket that are not a call, in the C and in the TypeScript both. */
const NOT_A_CALL = new Set([
  'if', 'while', 'for', 'switch', 'return', 'sizeof', 'do', 'else', 'catch', 'function',
  'CONCAT22', 'CONCAT11', 'CONCAT31', 'SUB42', 'SUB41',
  'undefined', 'undefined1', 'undefined2', 'undefined4',
  'uint', 'int', 'char', 'short', 'long', 'byte', 'ulong', 'ushort', 'code', 'void',
  'Math', 'Array', 'Number', 'String', 'Object', 'Set', 'Map', 'Boolean', 'JSON',
]);

/** Every name that appears at all, which is what a file is searched for: a key handler is named
 *  in a table rather than called, and a spell is often passed as a function rather than invoked. */
export function namesIn(code: string): Set<string> {
  const names = new Set<string>();
  for (const match of code.matchAll(/\b([A-Za-z_]\w*)\b/g)) {
    if (!NOT_A_CALL.has(match[1])) names.add(match[1]);
  }
  return names;
}

/** Every name called in a piece of code, whichever language it is. */
export function callsIn(code: string): Set<string> {
  const names = new Set<string>();
  for (const match of code.matchAll(CALL)) {
    if (!NOT_A_CALL.has(match[1])) names.add(match[1]);
  }
  return names;
}

/** One function of the port, with the routine it says it came from. */
export interface PortedFunction {
  file: string;
  name: string;
  /** The routine of the original its comment cites. */
  cited: string;
  /** The names its own body calls. */
  calls: Set<string>;
}

/** Which game a citation names, as the citation itself spells it. */
type CitedGame = 'unforgiven' | 'moraffsWorld';

/**
 * Every function of the port that says which routine it came from, with what it calls.
 *
 * A declaration whose body cannot be lifted back out of the file is skipped rather than guessed
 * at; `snippet` throws for the few shapes it does not know.
 */
export function portedFunctions(game: CitedGame): { functions: PortedFunction[]; byFile: Map<string, Set<string>> } {
  const functions: PortedFunction[] = [];
  const byFile = new Map<string, Set<string>>();
  for (const file of portFiles()) {
    const text = readFileSync(file, 'utf8');
    byFile.set(file, namesIn(text));
    for (const declared of declarations(file, text)) {
      if (!declared.c || declared.c.game !== game) continue;
      let body: string;
      try {
        body = snippet(text, declared.name);
      } catch {
        continue;
      }
      functions.push({ file, name: declared.name, cited: declared.c.name, calls: callsIn(body) });
    }
  }
  return { functions, byFile };
}

/**
 * Routines the port deliberately answers for somewhere other than inside the ported function, so
 * that their absence there means nothing. The README's departures are what most of these are.
 *
 * Keeping them here rather than dropping them from the citations is the point: each one is a
 * claim about the port's shape that a reader can check, and a routine that stops belonging on
 * this list should start being reported again.
 */
export const ANSWERED_ELSEWHERE = new Map<string, string>([
  ['FUN_2000_4054', 'the wait behind a box, which the play layer supplies: a ported function cannot await'],
  ['FUN_2000_412a', 'the same wait without the status caches thrown away'],
  ['mset_gmenu', 'a menu, which is drawn by one function here and answered by another'],
  ['get_choice', 'the key a menu is answered with, which the play layer reads'],
  ['typed_name', 'a typed answer, which the play layer reads'],
  ['FUN_2000_2f5d', 'the message box itself, which the play layer shows'],
  ['FUN_2000_3076', 'drawing the eight lines, which the play layer does'],
  ['erase_message_block', 'wiping the block, which the play layer does after the key'],
  ['load_level_map', "the README's second departure: a spell here stops at the character record"],
  ['set_palette', 'the palette, which Screen.svelte owns'],
  ['reset_view_caches', 'the view caches, which the port has no equivalent of'],
  ['FUN_4000_667b', 'the key menu, drawn by display.ts'],
  ['FUN_2000_9d17', "the map arrow, drawn by Screen.svelte"],
  ['FUN_3000_8e75', 'the zoom map, drawn by zoom-map.ts'],
  ['FUN_3000_caac', 'the status lines, drawn by panel.ts'],
  ['load_section_pictures', 'the section pictures, which the play layer loads'],
  ['FUN_3000_9488', "the town's tablet, which the play layer shows on arrival"],
  ['section_number', 'a number the play layer works out for itself where it needs it'],
  // Moraff's World's own names for the same things.
  ['FUN_2000_216b', "Moraff's World's message box, which the play layer shows"],
  ['print_text', 'drawing a line, which the play layer does'],
  ['read_string', 'a typed answer, which the play layer reads'],
  ['save_player', 'the record, which the session writes after every key in both games'],
  ['FUN_4000_3a72', 'the key menu, drawn by the play layer'],
  ['FUN_2000_8728', 'the monster bar over a view, drawn by the play layer'],
  ['enter_level', 'arriving on a floor, which the play layer sees to: the same departure as load_level_map'],
]);

/**
 * Particular pairs that have been read and answered, as `routine -> what it seems not to call`.
 *
 * Unlike {@link ANSWERED_ELSEWHERE} these are about one routine rather than about the port's
 * shape, so each is a note of what was found when somebody looked. Anything not on either list
 * is reported, which is what makes a new one worth reading.
 */
export const CHECKED = new Map<string, Map<string, string>>([
  ['defend', new Map([
    ['FUN_2000_826d', 'combat.ts:497 calls playBlowTaken, the wrapper round it, which cites the address in prose rather than formally'],
    ['save_player', 'engine.ts:942 writes the record after every key instead, which John asked for on 2026-09-09; the game\'s own save points are unchanged'],
  ])],
  ['strike', new Map([['FUN_2000_7dec', 'combat.ts:173 calls playBlowLanded, the wrapper round it']])],
  ['kill_monster', new Map([['FUN_3000_b0ea', 'kills.ts:307 calls playMonsterKilled, the wrapper round it']])],
  ['pass_moment', new Map([['save_player', 'the record is written after every key instead; see defend above']])],
  ['chute', new Map([['save_player', 'chute.ts:53 calls session.save(), which is the same thing a level higher']])],
  ['quit_game', new Map([['save_player', 'quit.ts calls session.save() after the key, in the original\'s own order']])],
  ['roll_char', new Map([['FUN_1000_1d8b', 'the roller upper-cases with JavaScript rather than through the game\'s own helper']])],
  ['typed_name', new Map([['FUN_1000_1d8b', 'the same']])],
  ['draw_map_square', new Map([
    ['check_for_ladder', 'projectSquare is the geometry only; what is on a square comes from the map data'],
    ['trapdoor', 'the same'],
  ])],
  ['FUN_3000_caac', new Map([['view_battle_spells', 'the battle-spell panel is drawn by Screen.svelte beside the status lines, not from within them']])],
  ['movecontrol', new Map([
    ['compute_weight', 'weight is worked out in gear.ts, which is not one of the files citing movecontrol'],
    ['FUN_2000_31bc', 'the arrival hint is reached from ladders.ts and trapdoor.ts, not from the loop itself'],
    ['FUN_2000_bf91', 'the boss signpost is drawn from misc.ts'],
    ['g_store', 'the town buildings are reached through building.ts'],
    ['flea_inn', 'the same'],
  ])],
]);

/** One routine the original calls at a point where the code playing it seems not to. */
export interface Missing {
  /** The routine of the original being compared. */
  routine: string;
  /** The port function that says it came from it. */
  port: string;
  file: string;
  /** The routine the original calls and the port does not. */
  absent: string;
  /** Where that routine is played, so the reader can see what is being skipped. */
  absentIsPlayedBy: string[];
}

/**
 * Every routine the original calls that is itself ported, and that nothing playing it calls.
 *
 * The port does not answer for a routine one function at a time: `spell_effect` is forty-two
 * functions here and `movecontrol` is spread over nine files, so what a single one of them does
 * not call says nothing. Everything citing the same routine is taken together and its calls
 * pooled, and only what none of them reaches is reported.
 *
 * Only routines the port models are compared. A routine the port has no answer for at all is not
 * evidence of anything — it may be video plumbing, or something the play layer sees to — and
 * including them buries the signal.
 */
export function compare(
  sections: DecompSection[],
  ported: PortedFunction[],
  byFile: Map<string, Set<string>>,
): Missing[] {
  const byName = new Map(sections.map((section) => [section.name, section]));
  /** Which port functions play each routine of the original. */
  const playedBy = new Map<string, PortedFunction[]>();
  for (const fn of ported) {
    const already = playedBy.get(fn.cited);
    if (already) already.push(fn);
    else playedBy.set(fn.cited, [fn]);
  }
  /** The routine a port function came from, for translating the port's own calls back. */
  const cameFrom = new Map(ported.map((fn) => [fn.name, fn.cited]));

  const missing: Missing[] = [];
  for (const [routine, plays] of playedBy) {
    const section = byName.get(routine);
    if (!section) continue;
    // Everything in a file that plays the routine counts, not only the cited function itself.
    // movecontrol's keys reach their handlers through a table rather than by being called, and
    // several ported functions hand work to a helper beside them that cites nothing.
    const pooled = new Set<string>();
    for (const file of new Set(plays.map((fn) => fn.file))) {
      for (const call of byFile.get(file) ?? []) pooled.add(cameFrom.get(call) ?? call);
    }
    for (const call of callsIn(section.body)) {
      if (call === routine || !playedBy.has(call) || pooled.has(call)) continue;
      if (ANSWERED_ELSEWHERE.has(call)) continue;
      if (CHECKED.get(routine)?.has(call)) continue;
      missing.push({
        routine,
        port: plays.map((fn) => fn.name).join(', '),
        file: [...new Set(plays.map((fn) => fn.file.replace('src/lib/', '')))].join(', '),
        absent: call,
        absentIsPlayedBy: (playedBy.get(call) ?? []).map((fn) => fn.name),
      });
    }
  }
  return missing;
}

/** Every routine of the original that the port plays, so a reader can see the ground covered. */
export function coverage(sections: DecompSection[], ported: PortedFunction[]): {
  routines: number;
  played: number;
  compared: number;
} {
  const played = new Set(ported.map((fn) => fn.cited));
  const real = sections.filter((section) => !section.name.startsWith('thunk'));
  return { routines: real.length, played: played.size, compared: ported.length };
}
