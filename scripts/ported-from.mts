// What the port says about the decompiled games, gathered by reading its own source.
//
// `pnpm build:ported` writes the two PORTED-FROM.md pages from this, and a test beside it
// asserts that what the walk finds is sound: every address resolves, every formal citation
// names the routine really at its address, and the committed pages say what the walk says now.
// Both go through the same walk on purpose, so the pages and the test cannot disagree about
// which files count or what an address means.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { declarations, mentions } from '../src/lib/source/citations.ts';
import { mentionGame, parseRoutines, routineAt, type Routine } from '../src/lib/source/routines.ts';

/** The two games with a function table. Moraff's Revenge has none, so it gets no page. */
export type TabledGame = 'unforgiven' | 'moraffsWorld';

export interface Game {
  id: TabledGame;
  name: string;
  executable: string;
  table: string;
  page: string;
  /** The catalogue that says what each routine does, for the page to point at. */
  catalogue: string;
}

export const GAMES: Game[] = [
  {
    id: 'unforgiven',
    name: 'Dungeons of the Unforgiven',
    executable: 'unf.exe',
    table: 'dotu-tools/decomp/functions.txt',
    page: 'dotu-tools/docs/PORTED-FROM.md',
    catalogue: 'FUNCTION-CATALOG.md',
  },
  {
    id: 'moraffsWorld',
    name: "Moraff's World",
    executable: 'WORLD.EXE',
    table: 'mw-tools/decomp/functions.txt',
    page: 'mw-tools/docs/PORTED-FROM.md',
    catalogue: '../decomp/functions.txt',
  },
];

/**
 * An address the port names that no routine of the table contains, and the reason it is
 * allowed to. These are holes in Ghidra's function table rather than mistakes in the comment,
 * so the comment stands and the table is left as the disassembler produced it.
 *
 * A gap that starts resolving is a gap that has been filled, and the test says so rather than
 * letting the entry sit here forever.
 */
export const KNOWN_TABLE_GAPS: { game: TabledGame; address: string; why: string }[] = [
  {
    game: 'unforgiven',
    address: '3000:2756',
    why: "Ghidra gave draw_3d_view (3000:0f75) 5,949 bytes, ending at 3000:26b2, and put the next routine at 3000:27fc. The 330 bytes between belong to no routine in the table, and the port's comment about what is drawn there is right about the game.",
  },
];

const SOURCE_ROOT = 'src';
/** A test, a test's helper, a fixture, or the Source tab itself, which quotes citations as examples. */
const NOT_A_PORT = /(?:\.test\.ts|\.test-support\.ts|\/test-[^/]+\.ts|\/fixtures\/|^src\/lib\/source\/)/;
const SOURCE_FILE = /\.(?:ts|js|svelte)$/;

/** The files of the port, as paths from the repository root, in a stable order. */
export function portFiles(): string[] {
  return readdirSync(SOURCE_ROOT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => SOURCE_FILE.test(file) && !NOT_A_PORT.test(file))
    .sort();
}

/** `play/engine.ts` for a file under `src/lib/`, and the whole path for the few that are not. */
function shortName(file: string): string {
  return file.startsWith('src/lib/') ? relative('src/lib', file) : file;
}

/** What the port says about one routine: the files that cite it by name, and the files that name an address in it. */
export interface Evidence {
  named: Set<string>;
  mentioned: Set<string>;
}

/** An address in a file that no routine of its game contains. */
export interface Unresolved {
  file: string;
  address: string;
}

/** A formal citation whose name is not the name of the routine at its address. */
export interface Misnamed {
  file: string;
  cited: string;
  address: string;
  actual: string;
}

export interface Findings {
  /** Keyed by the first address of the routine. */
  evidence: Map<string, Evidence>;
  unresolved: Unresolved[];
  misnamed: Misnamed[];
}

/** Everything one walk of the port found. */
export interface Walk {
  routines: Map<TabledGame, Routine[]>;
  findings: Map<TabledGame, Findings>;
  /** Moraff's Revenge's addresses, which there is no table to resolve. */
  revenge: { files: Set<string>; addresses: Set<string> };
}

function evidenceFor(findings: Findings, address: string): Evidence {
  let evidence = findings.evidence.get(address);
  if (!evidence) {
    evidence = { named: new Set(), mentioned: new Set() };
    findings.evidence.set(address, evidence);
  }
  return evidence;
}

/**
 * Every routine of the two C games the port points at, and how: by a doc comment that cites it
 * formally, or by a comment that names an address inside it in passing.
 */
export function walkPort(): Walk {
  const routines = new Map<TabledGame, Routine[]>(
    GAMES.map((game) => [game.id, parseRoutines(readFileSync(game.table, 'utf8'))]),
  );
  const findings = new Map<TabledGame, Findings>(
    GAMES.map((game) => [game.id, { evidence: new Map(), unresolved: [], misnamed: [] }]),
  );
  const revenge = { files: new Set<string>(), addresses: new Set<string>() };

  for (const file of portFiles()) {
    const text = readFileSync(file, 'utf8');
    const name = shortName(file);
    for (const fn of declarations(file, text)) {
      if (!fn.c) continue;
      const found = findings.get(fn.c.game as TabledGame)!;
      const routine = routineAt(routines.get(fn.c.game as TabledGame)!, fn.c.address);
      if (!routine) {
        found.unresolved.push({ file: name, address: fn.c.address });
        continue;
      }
      if (routine.name !== fn.c.name) {
        found.misnamed.push({ file: name, cited: fn.c.name, address: fn.c.address, actual: routine.name });
      }
      evidenceFor(found, routine.address).named.add(name);
    }
    for (const mention of mentions(text)) {
      const game = mentionGame(file, mention);
      if (game === 'revenge') {
        revenge.files.add(name);
        revenge.addresses.add(mention.address);
        continue;
      }
      const found = findings.get(game as TabledGame)!;
      const routine = routineAt(routines.get(game as TabledGame)!, mention.address);
      if (!routine) {
        found.unresolved.push({ file: name, address: mention.address });
        continue;
      }
      const evidence = evidenceFor(found, routine.address);
      if (!evidence.named.has(name)) evidence.mentioned.add(name);
    }
  }
  return { routines, findings, revenge };
}

/** The unresolved addresses of one game that are not a table gap already written down. */
export function unexplained(walk: Walk, game: TabledGame): Unresolved[] {
  const known = new Set(KNOWN_TABLE_GAPS.filter((gap) => gap.game === game).map((gap) => gap.address));
  return walk.findings.get(game)!.unresolved.filter((miss) => !known.has(miss.address));
}

function fileList(files: Set<string>): string {
  return [...files].sort().map((file) => `\`${file}\``).join(', ');
}

/** One game's page, as `pnpm build:ported` writes it. */
export function page(walk: Walk, game: Game): string {
  const routines = walk.routines.get(game.id)!;
  const found = walk.findings.get(game.id)!;
  const cited = routines.filter((routine) => found.evidence.has(routine.address));
  const uncited = routines.filter((routine) => !found.evidence.has(routine.address));
  const unnamed = (routine: Routine) => routine.name.startsWith('FUN_') || routine.name.startsWith('thunk');
  const runtime = (routine: Routine) => routine.segment === 0x1000;
  const uncitedNamed = uncited.filter((routine) => !unnamed(routine) && !runtime(routine));

  const lines = [
    `# Where the port plays each routine of ${game.executable}`,
    '',
    `Generated by \`pnpm build:ported\` from the citations in \`src/\`. Do not edit it: run that`,
    `again after the code changes and it says what the code says now.`,
    '',
    `One row per routine of ${game.name} that something in the port points at. **Named in** lists`,
    `the files whose doc comments cite the routine by its address and its name in the decompilation,`,
    `the formal citation of \`src/lib/game/port/README.md\`. **Mentioned in** lists the files whose`,
    `comments name an address inside the routine in passing, which is weaker evidence: a routine`,
    `known only that way may be described there rather than ported there. A file appears in one`,
    `column or the other, not both.`,
    '',
    `Tests, test helpers, fixtures and the Source tab's own files are left out, since they quote`,
    `citations rather than make them. What each routine does is in \`${game.catalogue}\`.`,
    '',
    `${cited.length} of the ${routines.length} routines are pointed at. Files are named from`,
    `\`src/lib/\`.`,
    '',
    '| routine | address | named in | mentioned in |',
    '|---|---|---|---|',
  ];
  for (const routine of cited) {
    const evidence = found.evidence.get(routine.address)!;
    lines.push(`| \`${routine.name}\` | ${routine.address} | ${fileList(evidence.named)} | ${fileList(evidence.mentioned)} |`);
  }
  lines.push('', '## Routines nothing in the port points at', '');
  lines.push(
    `${uncitedNamed.length} routines the reverse engineering named, outside the runtime segment, that no file`,
    `cites or mentions. Each is either not ported, ported without saying so, or something a browser has no`,
    `use for; which one is the judgement the catalogue is for.`,
    '',
  );
  for (const routine of uncitedNamed) lines.push(`- \`${routine.name}\` ${routine.address}`);
  const uncitedUnnamed = uncited.filter(unnamed).length;
  const uncitedRuntime = uncited.filter((routine) => runtime(routine) && !unnamed(routine)).length;
  lines.push(
    '',
    `Also uncited: ${uncitedUnnamed} routines Ghidra could not name, and ${uncitedRuntime} named routines of`,
    `the Borland runtime in segment 1000.`,
    '',
  );
  return lines.join('\n');
}
