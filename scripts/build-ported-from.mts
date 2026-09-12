// Writes, for each of the two C games, the page that says where the port plays each routine of
// the original: dotu-tools/docs/PORTED-FROM.md and mw-tools/docs/PORTED-FROM.md.
//
// The pages are built from what the port already says about itself. Every ported function's
// doc comment cites the decompiled function it came from, and the prose around it names the
// addresses decisions were read from; both are read out of the source here and joined against
// Ghidra's function table for the game, so that an address inside a routine is credited to it.
// Nothing is typed by hand, which is why the pages cannot fall out of date: run this again and
// they say what the code says now.
//
// Moraff's Revenge has no function table, so its addresses are counted on the way past and
// reported, and it gets no page until it has one.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { declarations, mentions } from '../src/lib/source/citations.ts';
import { mentionGame, parseRoutines, routineAt, type Routine } from '../src/lib/source/routines.ts';

type GameId = 'unforgiven' | 'moraffsWorld' | 'revenge';

interface Game {
  id: GameId;
  name: string;
  executable: string;
  table: string;
  page: string;
  /** The catalogue that says what each routine does, for the page to point at. */
  catalogue: string;
}

const GAMES: Game[] = [
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

const SOURCE_ROOT = 'src';
/** A test, a test's helper, a fixture, or the Source tab itself, which quotes citations as examples. */
const NOT_A_PORT = /(?:\.test\.ts|\.test-support\.ts|\/test-[^/]+\.ts|\/fixtures\/|^src\/lib\/source\/)/;
const SOURCE_FILE = /\.(?:ts|js|svelte)$/;

/** The files of the port, as paths from the repository root, in a stable order. */
function portFiles(): string[] {
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
interface Evidence {
  named: Set<string>;
  mentioned: Set<string>;
}

interface Findings {
  evidence: Map<string, Evidence>;
  /** An address no routine of the game contains, with the file that wrote it. */
  unresolved: { file: string; address: string }[];
  /** A formal citation whose name is not the name of the routine at its address. */
  misnamed: { file: string; cited: string; address: string; actual: string }[];
}

function evidenceFor(findings: Findings, address: string): Evidence {
  let evidence = findings.evidence.get(address);
  if (!evidence) {
    evidence = { named: new Set(), mentioned: new Set() };
    findings.evidence.set(address, evidence);
  }
  return evidence;
}

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

const tables = new Map<GameId, Routine[]>(GAMES.map((game) => [game.id, parseRoutines(read(game.table))]));
const findings = new Map<GameId, Findings>(GAMES.map((game) => [game.id, { evidence: new Map(), unresolved: [], misnamed: [] }]));
const revenge = { files: new Set<string>(), addresses: new Set<string>() };

for (const file of portFiles()) {
  const text = read(file);
  const name = shortName(file);
  for (const fn of declarations(file, text)) {
    if (!fn.c) continue;
    const found = findings.get(fn.c.game)!;
    const routine = routineAt(tables.get(fn.c.game)!, fn.c.address);
    if (!routine) {
      found.unresolved.push({ file: name, address: fn.c.address });
      continue;
    }
    if (routine.name !== fn.c.name) found.misnamed.push({ file: name, cited: fn.c.name, address: fn.c.address, actual: routine.name });
    evidenceFor(found, routine.address).named.add(name);
  }
  for (const mention of mentions(text)) {
    const game = mentionGame(file, mention);
    if (game === 'revenge') {
      revenge.files.add(name);
      revenge.addresses.add(mention.address);
      continue;
    }
    const found = findings.get(game)!;
    const routine = routineAt(tables.get(game)!, mention.address);
    if (!routine) {
      found.unresolved.push({ file: name, address: mention.address });
      continue;
    }
    const evidence = evidenceFor(found, routine.address);
    if (!evidence.named.has(name)) evidence.mentioned.add(name);
  }
}

function fileList(files: Set<string>): string {
  return [...files].sort().map((file) => `\`${file}\``).join(', ');
}

function page(game: Game): string {
  const routines = tables.get(game.id)!;
  const found = findings.get(game.id)!;
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

for (const game of GAMES) {
  writeFileSync(game.page, page(game));
  const found = findings.get(game.id)!;
  const named = [...found.evidence.values()].filter((evidence) => evidence.named.size > 0).length;
  console.log(`${game.page}: ${found.evidence.size} routines pointed at, ${named} of them by a formal citation`);
  for (const miss of found.unresolved) console.log(`  no routine of ${game.executable} holds ${miss.address}, cited in ${miss.file}`);
  for (const wrong of found.misnamed) {
    console.log(`  ${wrong.file} cites ${wrong.address} as "${wrong.cited}" but the routine there is "${wrong.actual}"`);
  }
}
console.log(`Moraff's Revenge: ${revenge.addresses.size} addresses in ${revenge.files.size} files, no function table to resolve them against`);
