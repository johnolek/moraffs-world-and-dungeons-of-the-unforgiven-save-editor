import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GAMES,
  KNOWN_TABLE_GAPS,
  page,
  portFiles,
  unexplained,
  walkPort,
  type TabledGame,
} from './ported-from.mts';
import { routineAt } from '../src/lib/source/routines.ts';

/** One walk of the whole port, which every test here reads. Walking it costs about a tenth of a second. */
const walk = walkPort();

describe('the addresses the port names', () => {
  it('walks a port that is there at all', () => {
    expect(portFiles().length).toBeGreaterThan(300);
    for (const game of GAMES) expect(walk.findings.get(game.id)!.evidence.size, game.name).toBeGreaterThan(100);
  });

  it('lies inside a routine of the game the file belongs to', () => {
    for (const game of GAMES) {
      const missing = unexplained(walk, game.id).map((miss) => `${miss.file} names ${miss.address}, which no routine of ${game.executable} holds`);
      expect(missing).toEqual([]);
    }
  });

  it('is named for the routine that is really at that address', () => {
    for (const game of GAMES) {
      const wrong = walk.findings
        .get(game.id)!
        .misnamed.map((miss) => `${miss.file} cites ${miss.address} as "${miss.cited}" but the routine there is "${miss.actual}"`);
      expect(wrong).toEqual([]);
    }
  });

  it("puts Moraff's Revenge's in segment 1000, which is the whole of that game", () => {
    const elsewhere = [...walk.revenge.addresses].filter((address) => !address.startsWith('1000:'));
    expect(elsewhere).toEqual([]);
    expect(walk.revenge.addresses.size).toBeGreaterThan(500);
  });
});

describe('the holes in the function tables that are written down', () => {
  it('are still holes, so that an entry does not outlive the gap it explains', () => {
    for (const gap of KNOWN_TABLE_GAPS) {
      const routines = walk.routines.get(gap.game)!;
      expect(routineAt(routines, gap.address), `${gap.address} resolves now; take it out of KNOWN_TABLE_GAPS`).toBeNull();
    }
  });

  it('are named by something in the port, so that an entry does not outlive the citation', () => {
    for (const gap of KNOWN_TABLE_GAPS) {
      const named = walk.findings.get(gap.game as TabledGame)!.unresolved.some((miss) => miss.address === gap.address);
      expect(named, `nothing names ${gap.address} any more; take it out of KNOWN_TABLE_GAPS`).toBe(true);
    }
  });
});

describe('the committed pages', () => {
  it('say what the port says now, so that forgetting `pnpm build:ported` fails here', () => {
    for (const game of GAMES) {
      expect(readFileSync(game.page, 'utf8'), `${game.page} is out of date; run \`pnpm build:ported\``).toBe(page(walk, game));
    }
  });
});
