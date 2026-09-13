// Reads every ported routine against the routine it came from, and lists what it seems to skip.
//
//   pnpm check:port              Dungeons of the Unforgiven
//   pnpm check:port --game=mw    Moraff's World
//
// Nothing here is a verdict. Each line is one place where the original calls something the port
// models and the counterpart does not appear to, which is the shape every divergence found by
// hand so far has had. Read them; most will have an answer.
import { readFileSync } from 'node:fs';
import { parseSections } from '../src/lib/source/sections.ts';
import { compare, coverage, portedFunctions } from './compare-calls.mts';

const GAMES = {
  dotu: { decomp: 'dotu-tools/decomp/unf.c', cited: 'unforgiven' as const, name: 'Dungeons of the Unforgiven' },
  mw: { decomp: 'mw-tools/decomp/mw.c', cited: 'moraffsWorld' as const, name: "Moraff's World" },
};

const which = process.argv.slice(2).find((arg) => arg.startsWith('--game='))?.slice('--game='.length) ?? 'dotu';
const game = GAMES[which as keyof typeof GAMES];
if (!game) throw new Error(`no game called ${which}; try ${Object.keys(GAMES).join(' or ')}`);

const sections = parseSections(readFileSync(game.decomp, 'utf8'));
const { functions: ported, byFile } = portedFunctions(game.cited);
const counted = coverage(sections, ported);
const missing = compare(sections, ported, byFile);

console.log(`${game.name}: ${counted.routines} routines, ${counted.played} of them played by ${counted.compared} functions of the port.`);
console.log(`${missing.length} places where the original calls something the port models and its counterpart does not.\n`);

const byRoutine = new Map<string, typeof missing>();
for (const miss of missing) {
  const already = byRoutine.get(miss.routine);
  if (already) already.push(miss);
  else byRoutine.set(miss.routine, [miss]);
}
for (const [routine, misses] of [...byRoutine].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${routine} — played by ${[...new Set(misses.map((miss) => `${miss.file} ${miss.port}`))].join(', ')}`);
  for (const absent of [...new Set(misses.map((miss) => miss.absent))]) {
    const plays = misses.find((miss) => miss.absent === absent)!.absentIsPlayedBy;
    console.log(`    does not call ${absent}, which the port plays as ${plays.join(', ')}`);
  }
}
