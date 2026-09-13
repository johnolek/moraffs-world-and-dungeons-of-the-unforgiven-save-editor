// The command that reads a routine of the original against its port.
//
//   pnpm routine chute post_kill_heal          one routine's own steps
//   pnpm routine --callers FUN_2000_4054       every routine that calls one, and where each is played
//   pnpm routine --game=mw store               the same for Moraff's World
import { readFileSync } from 'node:fs';
import { parseSections, type DecompSection } from '../src/lib/source/sections.ts';
import { GAMES, portedAt, stepsOf } from './routine.mts';

const args = process.argv.slice(2);
const gameArg = args.find((arg) => arg.startsWith('--game='))?.slice('--game='.length) ?? 'dotu';
const game = GAMES[gameArg];
if (!game) throw new Error(`no game called ${gameArg}; try ${Object.keys(GAMES).join(' or ')}`);
const callersOf = args.includes('--callers');
const names = args.filter((arg) => !arg.startsWith('--'));
if (names.length === 0) {
  throw new Error('name a routine: pnpm routine chute, or pnpm routine --callers FUN_2000_4054');
}

const sections = parseSections(readFileSync(game.decomp, 'utf8'));
const byName = new Map(sections.map((section) => [section.name, section]));
const known = new Set(byName.keys());
const page = readFileSync(game.page, 'utf8');

function show(section: DecompSection): void {
  console.log(`=== ${section.name} @ ${section.address} (${section.size} bytes)`);
  if (section.description) console.log(`    ${section.description}`);
  console.log(`    port: ${portedAt(page, section.address)}`);
  console.log('    does, in order:');
  for (const step of stepsOf(section, known)) console.log(`      ${step}`);
  console.log();
}

for (const name of names) {
  const section = byName.get(name);
  if (!section) throw new Error(`${game.decomp} has no routine called ${name}`);
  if (!callersOf) {
    show(section);
    continue;
  }
  console.log(`=== every routine that calls ${name} (${section.callers.length} of them)`);
  console.log(`    ${name} itself: ${portedAt(page, section.address)}\n`);
  for (const caller of section.callers) {
    const from = byName.get(caller);
    if (!from) {
      console.log(`--- ${caller}: not a routine of this decompilation`);
      continue;
    }
    const times = stepsOf(from, known).filter((step) => step === name).length;
    console.log(`--- ${caller} @ ${from.address} calls it ${times === 0 ? 'inside a branch' : `${times}x`}`);
    console.log(`      ${portedAt(page, from.address)}`);
  }
}
