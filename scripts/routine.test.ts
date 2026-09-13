import { describe, expect, it } from 'vitest';
import { parseSections } from '../src/lib/source/sections.ts';
import { portedAt, stepsOf } from './routine.mts';

const DECOMP = [
  '// ==== example @ 2000:1000 (size 40) callers: movecontrol  // a made-up routine',
  '',
  'void __cdecl16far example(int param_1)',
  '{',
  '  DAT_6000_c034 = param_1;',
  '  load_level_map(param_1);',
  '  if (param_1 == 0) {',
  '    pfont(0x3a2,0x329,0,"A LINE",5);',
  '    pfont(0x3a2,0x351,0,"ANOTHER",5);',
  '  }',
  '  FUN_2000_4054();',
  '  DAT_6000_0327 = 1;  // pfont(1) inside a comment is not a call',
  '  return;',
  '}',
  '',
  '// ==== load_level_map @ 2000:2000 (size 10) callers: example',
  '',
  'void __cdecl16far load_level_map(int param_1) { return; }',
  '',
  '// ==== FUN_2000_4054 @ 2000:4054 (size 208) callers: example  // the plaque and the key it waits for',
  '',
  'undefined2 __cdecl16far FUN_2000_4054(void) { return 0; }',
  '',
].join('\n');

const sections = parseSections(DECOMP);
const known = new Set(sections.map((section) => section.name));
const steps = stepsOf(sections[0], known);

describe('what a routine does, in order', () => {
  it('reads the global writes in with the calls', () => {
    expect(steps).toEqual([
      'DAT_6000_c034 := param_1',
      'load_level_map',
      'pfont',
      'FUN_2000_4054',
      'DAT_6000_0327 := 1',
    ]);
  });

  it('keeps a write after a call after it, which is what the chute bug looks like', () => {
    expect(steps.indexOf('DAT_6000_0327 := 1')).toBeGreaterThan(steps.indexOf('FUN_2000_4054'));
  });

  it('collapses a run of the same call rather than listing it twice', () => {
    expect(steps.filter((step) => step === 'pfont')).toHaveLength(1);
  });

  it('ignores what a comment says', () => {
    expect(steps.filter((step) => step === 'pfont')).toHaveLength(1);
    expect(steps.at(-1)).toBe('DAT_6000_0327 := 1');
  });

  it('takes a routine the reverse engineering never named, which is most of them', () => {
    expect(steps).toContain('FUN_2000_4054');
  });

  it('does not take a keyword followed by a bracket for a call', () => {
    expect(steps).not.toContain('if');
    expect(steps).not.toContain('return');
  });
});

describe('where the port plays a routine', () => {
  const PAGE = [
    '| routine | address | named in | mentioned in |',
    '|---|---|---|---|',
    '| `chute` | 2000:b532 | `play/chute.ts` | `game/port/state.ts` |',
    '| `strike` | 2000:7e36 |  | `game/port/combat.ts` |',
  ].join('\n');

  it('reads both columns off the page', () => {
    expect(portedAt(PAGE, '2000:b532')).toContain('named in `play/chute.ts`');
    expect(portedAt(PAGE, '2000:b532')).toContain('mentioned in `game/port/state.ts`');
  });

  it('marks an empty column rather than leaving it blank', () => {
    expect(portedAt(PAGE, '2000:7e36')).toContain('named in —');
  });

  it('says so when nothing in the port points at the routine', () => {
    expect(portedAt(PAGE, '4000:0fc0')).toBe('nothing in the port points at it');
  });
});
