import { describe, expect, it } from 'vitest';
import { decompSection } from './decomp';
import { allPortFunctions, portCode, portFiles, portsOfC, sourceFiles } from './ports';

describe('the port the app ships', () => {
  const games = ['unforgiven', 'moraffsWorld'] as const;

  it('finds declarations in every file it lists', () => {
    for (const game of games) {
      for (const entry of portFiles(game)) expect(entry.functions.length, entry.file).toBeGreaterThan(0);
      expect(portFiles(game).map((entry) => entry.file)).toEqual(sourceFiles(game));
    }
  });

  it("keeps the two games' files apart", () => {
    expect(sourceFiles()).toEqual(sourceFiles('unforgiven'));
    expect(sourceFiles('unforgiven')).toContain('src/lib/game/port/magic.ts');
    expect(sourceFiles('moraffsWorld')).toContain('src/lib/game/mw-port/character.ts');
    expect(sourceFiles('unforgiven')).not.toContain('src/lib/game/mw-port/character.ts');
  });

  it('can read the text of every declaration it found', () => {
    for (const fn of allPortFunctions()) expect(() => portCode(fn.file, fn.name), `${fn.file} ${fn.name}`).not.toThrow();
  });

  it('cites only functions the decompilation really holds', () => {
    const cited = allPortFunctions().filter((fn) => fn.c);
    expect(cited.length).toBeGreaterThan(50);
    for (const fn of cited) expect(decompSection(fn.c!.name, fn.c!.game), `${fn.file} ${fn.name}`).not.toBeNull();
  });

  it("cites mw.c from the Moraff's World files", () => {
    const mw = portFiles('moraffsWorld').flatMap((entry) => entry.functions).filter((fn) => fn.c);
    expect(mw.length).toBeGreaterThan(10);
    for (const fn of mw) expect(fn.c!.game, `${fn.file} ${fn.name}`).toBe('moraffsWorld');
  });

  it('says which port functions came from a decompiled one', () => {
    expect(portsOfC('sleep_monster').map((fn) => fn.name)).toContain('sleepMonster');
    expect(portsOfC('no_such_function')).toEqual([]);
  });

  it('answers for the game asked about, where both games have a function of that name', () => {
    expect(portsOfC('roll_char').map((fn) => fn.file)).toContain('src/lib/game/port/character.ts');
    expect(portsOfC('roll_char').map((fn) => fn.file)).not.toContain('src/lib/game/mw-port/character.ts');
    const mw = new Set(portsOfC('roll_char', 'moraffsWorld').map((fn) => fn.file));
    expect(mw).toEqual(new Set(['src/lib/game/mw-port/character.ts', 'src/lib/game/mw-port/state.ts']));
  });
});
