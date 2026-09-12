import { describe, expect, it } from 'vitest';
import { directoryGame, mentionGame, parseRoutines, routineAt } from './routines';

const TABLE = [
  '3000:0f75\tdraw_3d_view\tsize=1234\tcallers=movecontrol, FUN_2000_c28b',
  '1000:0000\tentry\tsize=355\tcallers=',
  '2000:c308\tmovecontrol\tsize=5000\tcallers=main',
  'not a routine at all',
  '2000:7e36\tstrike\tsize=845\tcallers=movecontrol',
  '2000:8190\tFUN_2000_8190\tsize=0\tcallers=',
].join('\n');

const routines = parseRoutines(TABLE);

describe('parseRoutines', () => {
  it('sorts the routines by address and skips lines that are not one', () => {
    expect(routines.map((routine) => routine.address)).toEqual(['1000:0000', '2000:7e36', '2000:8190', '2000:c308', '3000:0f75']);
  });

  it('reads the name, the size and the callers', () => {
    expect(routines[4]).toEqual({
      address: '3000:0f75',
      segment: 0x3000,
      offset: 0x0f75,
      name: 'draw_3d_view',
      size: 1234,
      callers: ['movecontrol', 'FUN_2000_c28b'],
    });
    expect(routines[0].callers).toEqual([]);
  });
});

describe('routineAt', () => {
  it('finds the routine an address is inside', () => {
    expect(routineAt(routines, '2000:c82d')?.name).toBe('movecontrol');
    expect(routineAt(routines, '2000:7e36')?.name).toBe('strike');
  });

  it('owns the last byte and not the one after it', () => {
    expect(routineAt(routines, '2000:8182')?.name).toBe('strike');
    expect(routineAt(routines, '2000:8183')).toBeNull();
  });

  it('gives a routine with no size its first byte only', () => {
    expect(routineAt(routines, '2000:8190')?.name).toBe('FUN_2000_8190');
    expect(routineAt(routines, '2000:8191')).toBeNull();
  });

  it('does not run one segment into the next', () => {
    expect(routineAt(routines, '1000:ffff')).toBeNull();
    expect(routineAt(routines, '2000:0000')).toBeNull();
    expect(routineAt(routines, '4000:0000')).toBeNull();
  });
});

describe('directoryGame', () => {
  it("names Moraff's World's files by a directory or file named mw", () => {
    expect(directoryGame('src/lib/play/mw/engine.ts')).toBe('moraffsWorld');
    expect(directoryGame('src/lib/game/mw-port/state.ts')).toBe('moraffsWorld');
    expect(directoryGame('src/lib/game/mwmap.js')).toBe('moraffsWorld');
    expect(directoryGame('src/lib/play/mw/MwScreen.svelte')).toBe('moraffsWorld');
  });

  it("names Moraff's Revenge's files by a directory or file named rev", () => {
    expect(directoryGame('src/lib/play/rev/screen/text.ts')).toBe('revenge');
    expect(directoryGame('src/lib/rev-bestiary/monsters.ts')).toBe('revenge');
    expect(directoryGame('src/lib/game/revmap.js')).toBe('revenge');
    expect(directoryGame('src/lib/roller/rev-save-file.ts')).toBe('revenge');
    expect(directoryGame('src/lib/play/rev/RevPlay.svelte')).toBe('revenge');
    expect(directoryGame('src/lib/game/rev7.b64.js')).toBe('revenge');
  });

  it('names nothing for the rest, and is not fooled by a word that starts the same way', () => {
    expect(directoryGame('src/lib/play/engine.ts')).toBeNull();
    expect(directoryGame('src/lib/editor/games.ts')).toBeNull();
    expect(directoryGame('src/lib/ui/reveal.ts')).toBeNull();
    expect(directoryGame('src/lib/editor/Review.svelte')).toBeNull();
    expect(directoryGame('src/lib/mwl/x.ts')).toBeNull();
  });
});

describe('mentionGame', () => {
  it('believes the executable named in front of the address over the file', () => {
    expect(mentionGame('src/lib/play/mw/keys.ts', { address: '1000:3c34', prefix: 'UNF.EXE' })).toBe('unforgiven');
    expect(mentionGame('src/lib/game/port/town.ts', { address: '3000:302b', prefix: 'WORLD.EXE' })).toBe('moraffsWorld');
    expect(mentionGame('src/lib/play/mode.ts', { address: '1000:0517', prefix: 'DUNSMALL.EXE' })).toBe('revenge');
  });

  it("reads exe as the file's own game", () => {
    expect(mentionGame('src/lib/play/mw/engine.ts', { address: '1000:22a2', prefix: 'exe' })).toBe('moraffsWorld');
    expect(mentionGame('src/lib/play/engine.ts', { address: '1000:2789', prefix: 'exe' })).toBe('unforgiven');
  });

  it('gives a bare address in a file named for a game to that game', () => {
    expect(mentionGame('src/lib/mw-spells/effects.ts', { address: '1000:1417', prefix: null })).toBe('moraffsWorld');
    expect(mentionGame('src/lib/play/rev/fight.ts', { address: '1000:8356', prefix: null })).toBe('revenge');
  });

  it("gives a bare address in any other file to Dungeons of the Unforgiven, unless it is in segment 1000, which is Moraff's Revenge", () => {
    expect(mentionGame('src/lib/editor/games.ts', { address: '2000:c308', prefix: null })).toBe('unforgiven');
    expect(mentionGame('src/lib/editor/games.ts', { address: '1000:3e39', prefix: null })).toBe('revenge');
    expect(mentionGame('src/lib/map/explored.ts', { address: '1000:5449', prefix: null })).toBe('revenge');
  });
});
