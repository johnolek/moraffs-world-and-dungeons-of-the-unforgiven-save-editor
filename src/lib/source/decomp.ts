/**
 * Ghidra's decompilation of each game, cut into one section per function.
 *
 * `dotu-tools/decomp/unf.c` and `mw-tools/decomp/mw.c` are a megabyte apiece of C with a header
 * line above every function:
 *
 *     // ==== sleep_monster @ 3000:d904 (size 288) callers: spell_effect  // the Sleep spell
 *
 * The header carries the name the reverse engineering gave the function, where it sits in the
 * executable, how many bytes of machine code it was, what calls it, and sometimes a note. Both
 * files are imported as text and split here, so the Source tab can show any of Dungeons of the
 * Unforgiven's 647 functions or Moraff's World's 580 without fetching anything. Moraff's
 * Revenge's decompilation is not bundled: it is another megabyte and a half, and nothing on the
 * site cites it yet.
 */
import type { GameId } from '../app-state.svelte';
import { parseSections, type DecompSection } from './sections';
import unfSource from '../../../dotu-tools/decomp/unf.c?raw';
import mwSource from '../../../mw-tools/decomp/mw.c?raw';

export { parseSections, type DecompSection } from './sections';

/** One game's decompilation: the executable it was read out of and every function of it. */
export interface Decompilation {
  /** The executable Ghidra read, as `UNF.EXE`. */
  executable: string;
  /** Every function, in the order the file lists them. */
  sections: DecompSection[];
  byName: Map<string, DecompSection>;
}


function decompilationOf(executable: string, source: string): Decompilation {
  const sections = parseSections(source);
  return { executable, sections, byName: new Map(sections.map((section) => [section.name, section])) };
}

const DECOMPILATIONS: Record<GameId, Decompilation | null> = {
  unforgiven: decompilationOf('UNF.EXE', unfSource),
  moraffsWorld: decompilationOf('WORLD.EXE', mwSource),
  revenge: null,
};

/**
 * One game's decompilation, or null for a game whose decompilation the site does not carry.
 * Moraff's World ships two executables and `WORLD.EXE` is the game; Dungeons of the Unforgiven
 * has only `UNF.EXE`.
 *
 * A caller that names no game means Dungeons of the Unforgiven, which is the game most of the
 * site is about.
 */
export function decompilation(game: GameId = 'unforgiven'): Decompilation | null {
  return DECOMPILATIONS[game];
}

/** The decompilation of one function, or null for a name that game's file does not carry. */
export function decompSection(name: string, game: GameId = 'unforgiven'): DecompSection | null {
  return DECOMPILATIONS[game]?.byName.get(name) ?? null;
}

/** True for the functions the reverse engineering never worked out a name for. */
function isUnnamed(section: DecompSection): boolean {
  return section.name.startsWith('FUN_');
}

/**
 * Every function of one game, the ones with a real name first and each half alphabetical, which
 * is the order the Source tab lists them in: a reader is looking for `sleep_monster`, not for
 * the hundreds of `FUN_` addresses.
 */
export function sectionsByName(game: GameId = 'unforgiven'): DecompSection[] {
  const byName = (a: DecompSection, b: DecompSection) => a.name.localeCompare(b.name);
  const sections = DECOMPILATIONS[game]?.sections ?? [];
  return [
    ...sections.filter((section) => !isUnnamed(section)).sort(byName),
    ...sections.filter(isUnnamed).sort(byName),
  ];
}
