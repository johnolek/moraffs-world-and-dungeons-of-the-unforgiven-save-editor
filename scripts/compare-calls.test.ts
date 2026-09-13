import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSections } from '../src/lib/source/sections.ts';
import { callsIn, compare, namesIn, portedFunctions, type PortedFunction } from './compare-calls.mts';

describe('reading calls out of code', () => {
  it('finds a call in either language and leaves the keywords alone', () => {
    expect([...callsIn('if (x) { give_hint(); FUN_2000_4054(); }')]).toEqual(['give_hint', 'FUN_2000_4054']);
    expect([...callsIn('await session.keyWithPlaque();')]).toEqual(['keyWithPlaque']);
  });

  it('takes a name that is never called, which is how a key reaches its handler', () => {
    expect(namesIn('{ run: useAnItem }').has('useAnItem')).toBe(true);
    expect(callsIn('{ run: useAnItem }').has('useAnItem')).toBe(false);
  });
});

describe('comparing a routine with what plays it', () => {
  const DECOMP = [
    '// ==== alpha @ 2000:1000 (size 40) callers: main',
    'void alpha(void) { beta(); gamma(); }',
    '',
    '// ==== beta @ 2000:2000 (size 10) callers: alpha',
    'void beta(void) { return; }',
    '',
    '// ==== gamma @ 2000:3000 (size 10) callers: alpha',
    'void gamma(void) { return; }',
    '',
  ].join('\n');
  const sections = parseSections(DECOMP);
  const ported = (calls: string[][]): PortedFunction[] => [
    { file: 'src/lib/a.ts', name: 'alphaOne', cited: 'alpha', calls: new Set(calls[0]) },
    { file: 'src/lib/a.ts', name: 'alphaTwo', cited: 'alpha', calls: new Set(calls[1]) },
    { file: 'src/lib/b.ts', name: 'betaPort', cited: 'beta', calls: new Set() },
    { file: 'src/lib/c.ts', name: 'gammaPort', cited: 'gamma', calls: new Set() },
  ];
  const noFiles = new Map<string, Set<string>>();

  it('says nothing when everything the routine calls is reached', () => {
    expect(compare(sections, ported([['betaPort'], ['gammaPort']]), noFiles)).toEqual([]);
  });

  it('pools what every function playing the routine calls, not one at a time', () => {
    // alphaOne reaches beta and alphaTwo reaches gamma; neither reaches both, and that is fine.
    const missing = compare(sections, ported([['betaPort'], ['gammaPort']]), noFiles);
    expect(missing).toEqual([]);
  });

  it('reports what none of them reaches', () => {
    const missing = compare(sections, ported([['betaPort'], []]), noFiles);
    expect(missing.map((miss) => miss.absent)).toEqual(['gamma']);
    expect(missing[0].routine).toBe('alpha');
  });

  it('counts a name the file mentions, since a handler is named rather than called', () => {
    const byFile = new Map([['src/lib/a.ts', new Set(['gammaPort'])]]);
    expect(compare(sections, ported([['betaPort'], []]), byFile)).toEqual([]);
  });
});

describe('the port as it stands', () => {
  for (const [game, decomp, cited] of [
    ['Dungeons of the Unforgiven', 'dotu-tools/decomp/unf.c', 'unforgiven'],
    ["Moraff's World", 'mw-tools/decomp/mw.c', 'moraffsWorld'],
  ] as const) {
    it(`calls everything ${game}'s routines call, or says why not`, () => {
      const sections = parseSections(readFileSync(decomp, 'utf8'));
      const { functions, byFile } = portedFunctions(cited);
      expect(functions.length).toBeGreaterThan(100);
      const missing = compare(sections, functions, byFile).map(
        (miss) => `${miss.routine} (${miss.file}) reaches nothing for ${miss.absent}`,
      );
      expect(missing).toEqual([]);
    });
  }
});
