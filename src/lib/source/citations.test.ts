import { describe, expect, it } from 'vitest';
import { declarations, mentions } from './citations';

const FILE = 'src/lib/game/port/magic.ts';

const FRAGMENT = [
  '/** The file this comment heads, citing (exe 1000:0000, unf.c "entry") from a long way off. */',
  '',
  'export const LIMIT = 3;',
  '',
  'export const PAIRS: number[][] = [[1, 2]];',
  '',
  '/** sleep_monster (exe 3000:d904, unf.c "sleep_monster"): put the monster to sleep. */',
  'export function sleepMonster(game) {',
  '  if (game) {',
  '    return LIMIT;',
  '  }',
  '}',
  '',
  'export class Dungeon {',
  '  constructor(dwall) {',
  '    this.dwall = dwall;',
  '  }',
  '',
  '  /** solidcheck (exe 3000:86b5, unf.c "solidcheck"): four walls. */',
  '  solid(x, y) {',
  '    if (x) {',
  '      return y;',
  '    }',
  '  }',
  '}',
  '',
  'function notExported() {}',
].join('\n');

const MW_FRAGMENT = [
  '/** show_roll (WORLD.EXE 3000:4477, mw.c "show_roll"): draw the character rolled. */',
  'export function showRoll(game) {}',
  '',
  '/**',
  ' * Which record of SPELLS.HLP a description is (WORLD.EXE 3000:b7fd, mw.c',
  ' * "FUN_3000_b7fd"), counted in menu order.',
  ' */',
  'export function mwSpellRecord(category) {}',
].join('\n');

describe('declarations', () => {
  const found = declarations(FILE, FRAGMENT);

  it('finds the exported values, the exported functions and the methods of a class', () => {
    expect(found.map((fn) => fn.name)).toEqual(['LIMIT', 'PAIRS', 'sleepMonster', 'solid']);
  });

  it('reads the citation out of the comment above a declaration', () => {
    expect(found[2].c).toEqual({ name: 'sleep_monster', address: '3000:d904', game: 'unforgiven' });
    expect(found[3].c).toEqual({ name: 'solidcheck', address: '3000:86b5', game: 'unforgiven' });
  });

  it('does not hand a file-level comment to whatever is declared after it', () => {
    expect(found[0].c).toBeNull();
  });

  it("takes a citation of mw.c as Moraff's World's, executable name and all", () => {
    const mw = declarations('src/lib/game/mw-port/character.ts', MW_FRAGMENT);
    expect(mw[0].c).toEqual({ name: 'show_roll', address: '3000:4477', game: 'moraffsWorld' });
  });

  it('finds a citation the line wrapping split in two', () => {
    const mw = declarations('src/lib/game/mw-port/spells.ts', MW_FRAGMENT);
    expect(mw[1].c).toEqual({ name: 'FUN_3000_b7fd', address: '3000:b7fd', game: 'moraffsWorld' });
  });
});

describe('mentions', () => {
  it('finds a bare address and the executable named in front of one', () => {
    const text = 'wipes nothing where it takes its key (exe 2000:c82d); getch (WORLD.EXE 1000:28b4) lower-cases it';
    expect(mentions(text)).toEqual([
      { address: '2000:c82d', prefix: 'exe' },
      { address: '1000:28b4', prefix: 'WORLD.EXE' },
    ]);
  });

  it("lowers Moraff's Revenge's capitals and keeps DUNSMALL.EXE in front", () => {
    expect(mentions('asks at DUNSMALL.EXE 1000:0517, and 1000:B674 lays them out')).toEqual([
      { address: '1000:0517', prefix: 'DUNSMALL.EXE' },
      { address: '1000:b674', prefix: null },
    ]);
  });

  it('reads the address out of a function Ghidra could not name', () => {
    expect(mentions('FUN_2000_c28b: the map has scrolled off')).toEqual([{ address: '2000:c28b', prefix: null }]);
  });

  it('sees the address inside a formal citation as well', () => {
    expect(mentions('/** go_away (exe 3000:db1e, unf.c "go_away"). */')).toEqual([{ address: '3000:db1e', prefix: 'exe' }]);
  });

  it('finds nothing in text that names no address', () => {
    expect(mentions('a 1024 by 768 frame, 60 steps at 7 ms')).toEqual([]);
  });
});
