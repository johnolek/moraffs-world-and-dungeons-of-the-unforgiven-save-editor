// Writes, for each of the two C games, the page that says where the port plays each routine of
// the original: dotu-tools/docs/PORTED-FROM.md and mw-tools/docs/PORTED-FROM.md.
//
// The pages are built from what the port already says about itself, so they cannot fall out of
// date: run this again and they say what the code says now. `ported-from.mts` beside this does
// the reading, and `ported-from.test.ts` holds the walk to what it found.
import { writeFileSync } from 'node:fs';
import { GAMES, KNOWN_TABLE_GAPS, page, unexplained, walkPort } from './ported-from.mts';

const walk = walkPort();

for (const game of GAMES) {
  writeFileSync(game.page, page(walk, game));
  const found = walk.findings.get(game.id)!;
  const named = [...found.evidence.values()].filter((evidence) => evidence.named.size > 0).length;
  console.log(`${game.page}: ${found.evidence.size} routines pointed at, ${named} of them by a formal citation`);
  for (const miss of unexplained(walk, game.id)) {
    console.log(`  no routine of ${game.executable} holds ${miss.address}, named in ${miss.file}`);
  }
  for (const wrong of found.misnamed) {
    console.log(`  ${wrong.file} cites ${wrong.address} as "${wrong.cited}" but the routine there is "${wrong.actual}"`);
  }
  for (const gap of KNOWN_TABLE_GAPS.filter((gap) => gap.game === game.id)) {
    console.log(`  ${gap.address} is a known hole in the function table and is left alone`);
  }
}
console.log(
  `Moraff's Revenge: ${walk.revenge.addresses.size} addresses in ${walk.revenge.files.size} files, no function table to resolve them against`,
);
