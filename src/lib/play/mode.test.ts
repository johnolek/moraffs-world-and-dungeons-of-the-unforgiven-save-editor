import { afterEach, describe, expect, it } from 'vitest';
import type { StockedMonster } from '../map/stocking';
import {
  colourblindFilter,
  COLOURBLIND_FILTER_ID,
  DEFAULT_PLAY_MODE,
  debugDrawn,
  DEFAULT_PLAY_DISPLAY,
  discoveredMapOnly,
  lockedPlayMode,
  mapDrawn,
  modeIsChosen,
  monstersDrawn,
  dungeonNumbersVisible,
  panelVisible,
  PLAY_DISPLAYS,
  PLAY_MODES,
  INSTANT_REDRAW_MS,
  clockReseeds,
  readPlayAnnouncements,
  readPlayClockReseed,
  readPlayColourblind,
  readPlayForwardView,
  readPlaySound,
  readPlayDisplay,
  readPlayMode,
  readPlayRedraw,
  redrawWords,
  SLOWEST_REDRAW_MS,
  writePlayAnnouncements,
  writePlayClockReseed,
  writePlayColourblind,
  writePlayForwardView,
  writePlaySound,
  writePlayDisplay,
  writePlayMode,
  writePlayRedraw,
  zoomMapMonsters,
} from './mode';

/** Enough of the browser's Storage to stand in for it. */
function fakeStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => void items.delete(key),
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

function useStorage(storage: Storage | undefined): void {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
}

afterEach(() => useStorage(undefined));

const monster = (slot: number): StockedMonster => ({ slot, x: slot, y: 1, monsterId: '1', level: 3, hp: 20 });

describe('which mode a game is played in', () => {
  it('is faithful until the player says otherwise', () => {
    useStorage(fakeStorage());
    expect(DEFAULT_PLAY_MODE).toBe('faithful');
    expect(readPlayMode('unforgiven')).toBe('faithful');
    expect(readPlayMode('moraffsWorld')).toBe('faithful');
  });

  it('remembers the choice for one game without touching the other', () => {
    useStorage(fakeStorage());
    writePlayMode('unforgiven', 'debug');
    expect(readPlayMode('unforgiven')).toBe('debug');
    expect(readPlayMode('moraffsWorld')).toBe('faithful');
  });

  it('falls back to faithful when what is stored is not a mode', () => {
    const storage = fakeStorage();
    useStorage(storage);
    storage.setItem('moraff-tools.play.unforgiven.mode', 'cheating');
    expect(readPlayMode('unforgiven')).toBe('faithful');
  });

  it('is faithful where there is nowhere to remember anything', () => {
    useStorage(undefined);
    writePlayMode('moraffsWorld', 'speedrun');
    expect(readPlayMode('moraffsWorld')).toBe('faithful');
  });
});

describe('the control on the Play tab', () => {
  it('offers the three modes, each with a line about what it shows', () => {
    expect(PLAY_MODES.map((mode) => mode.id)).toEqual(['faithful', 'speedrun', 'debug']);
    expect(PLAY_MODES.map((mode) => mode.label)).toEqual(['Faithful', 'Speedrun', 'Debug']);
    expect(PLAY_MODES.every((mode) => mode.how.length > 0)).toBe(true);
  });

  it('does not promise that debug shows the top-down map, which the switch alone decides', () => {
    const debug = PLAY_MODES.find((mode) => mode.id === 'debug')!;
    expect(debug.how).not.toContain('top-down');
  });
});

describe('the panel of numbers the game never prints', () => {
  it('is shown in debug whatever the character is locked to', () => {
    expect(panelVisible('faithful', null)).toBe(false);
    expect(panelVisible('speedrun', null)).toBe(false);
    expect(panelVisible('debug', null)).toBe(true);
  });

  it('is shown to an endless character in every mode', () => {
    expect(panelVisible('faithful', 'endless')).toBe(true);
    expect(panelVisible('speedrun', 'endless')).toBe(true);
    expect(panelVisible('debug', 'endless')).toBe(true);
  });

  it('is not shown to a character locked to a mode rather than to the endless dungeon', () => {
    expect(panelVisible('faithful', 'faithful')).toBe(false);
    expect(panelVisible('speedrun', 'speedrun')).toBe(false);
  });

  it('keeps what the dungeon is doing to debug, endless or not', () => {
    expect(dungeonNumbersVisible('debug')).toBe(true);
    expect(dungeonNumbersVisible('faithful')).toBe(false);
    expect(dungeonNumbersVisible('speedrun')).toBe(false);
  });
});

describe('the monsters the map draws', () => {
  const sight = { monsters: [monster(0), monster(1), monster(2)], visible: [monster(2)], engaged: monster(1) };

  it('is the ones the views drew, and the one being fought besides, in faithful', () => {
    expect(monstersDrawn('faithful', sight)).toEqual([monster(2), sight.engaged]);
  });

  it('does not draw the one being fought twice when the views drew it too', () => {
    expect(monstersDrawn('faithful', { ...sight, visible: [monster(1)] })).toEqual([monster(1)]);
  });

  it('is none at all in faithful with nothing in sight and nothing being fought', () => {
    expect(monstersDrawn('faithful', { ...sight, visible: [], engaged: null })).toEqual([]);
  });

  it('is what faithful draws in speedrun, since the monsters are rolled afresh every game', () => {
    expect(monstersDrawn('speedrun', sight)).toEqual([monster(2), sight.engaged]);
    expect(monstersDrawn('speedrun', { ...sight, visible: [], engaged: null })).toEqual([]);
  });

  it('is every monster on the floor in debug', () => {
    expect(monstersDrawn('debug', sight)).toEqual(sight.monsters);
    expect(monstersDrawn('debug', { ...sight, engaged: null })).toEqual(sight.monsters);
  });
});

describe("the marks debug mode puts on the game's own screen", () => {
  const sight = { monsters: [monster(0), monster(1), monster(2)], visible: [monster(2)], engaged: monster(1) };

  it('is drawn in debug alone', () => {
    expect(debugDrawn('faithful')).toBe(false);
    expect(debugDrawn('speedrun')).toBe(false);
    expect(debugDrawn('debug')).toBe(true);
  });

  it('marks every monster on the floor on the zoom map in debug', () => {
    expect(zoomMapMonsters('debug', sight)).toEqual(sight.monsters);
  });

  it('marks none at all in faithful or in speedrun, which no game ever did', () => {
    expect(zoomMapMonsters('faithful', sight)).toEqual([]);
    expect(zoomMapMonsters('speedrun', sight)).toEqual([]);
  });
});

describe('the map the floor is drawn from', () => {
  const memory = { discovered: () => ({ known: () => true, knownOnArrival: () => true }) };

  it('is the one the character has discovered in faithful', () => {
    expect(discoveredMapOnly('faithful')).toBe(true);
    expect(mapDrawn('faithful', memory)).not.toBeNull();
  });

  it('is none at all where the whole floor is drawn', () => {
    expect(discoveredMapOnly('speedrun')).toBe(false);
    expect(discoveredMapOnly('debug')).toBe(false);
    expect(mapDrawn('speedrun', memory)).toBeNull();
  });
});

describe('the mode a character locked to a board is played in', () => {
  it("is the lock's own for the two locks that are modes", () => {
    expect(lockedPlayMode('faithful')).toBe('faithful');
    expect(lockedPlayMode('speedrun')).toBe('speedrun');
  });

  it('is faithful for an endless character, whose lock names a dungeon instead', () => {
    expect(lockedPlayMode('endless')).toBe('faithful');
    expect(PLAY_MODES.some((mode) => mode.id === 'faithful')).toBe(true);
  });

  it('is played on the clock, the way every mode but debug is', () => {
    expect(clockReseeds(lockedPlayMode('endless'), false)).toBe(true);
  });
});

describe('whether the radios are offered at all', () => {
  it('offers them to a character with no lock', () => {
    expect(modeIsChosen(null, false)).toBe(true);
  });

  it('offers them to an endless character that is on no board', () => {
    expect(modeIsChosen('endless', false)).toBe(true);
  });

  it('withholds them from a locked character whose runs are being compared', () => {
    expect(modeIsChosen('endless', true)).toBe(false);
    expect(modeIsChosen('faithful', false)).toBe(false);
    expect(modeIsChosen('speedrun', true)).toBe(false);
  });
});

describe('which of the two is shown until the player switches', () => {
  it("is the game's screen, whatever the mode", () => {
    expect(DEFAULT_PLAY_DISPLAY).toBe('screen');
  });

  it('offers the two, each with a label', () => {
    expect(PLAY_DISPLAYS.map((display) => display.id)).toEqual(['screen', 'map']);
    expect(PLAY_DISPLAYS.every((display) => display.label.length > 0)).toBe(true);
  });
});

describe('the switch between the screen and the map', () => {
  it('shows the screen until it has been touched', () => {
    useStorage(fakeStorage());
    expect(readPlayDisplay('unforgiven')).toBe('screen');
  });

  it('remembers the choice for one game without touching the other', () => {
    useStorage(fakeStorage());
    writePlayDisplay('unforgiven', 'map');
    expect(readPlayDisplay('unforgiven')).toBe('map');
    expect(readPlayDisplay('moraffsWorld')).toBe('screen');
  });

  it('falls back to the default when what is stored is not one of the two', () => {
    const storage = fakeStorage();
    useStorage(storage);
    storage.setItem('moraff-tools.play.revenge.display', 'both');
    expect(readPlayDisplay('revenge')).toBe('screen');
  });

  it('shows the default where there is nowhere to remember anything', () => {
    useStorage(undefined);
    writePlayDisplay('moraffsWorld', 'map');
    expect(readPlayDisplay('moraffsWorld')).toBe('screen');
  });
});

describe('the sound a game starts with', () => {
  it('is off until it has been turned on', () => {
    useStorage(fakeStorage());
    expect(readPlaySound('revenge')).toBe(false);
  });

  it('remembers the choice for one game without touching the other', () => {
    useStorage(fakeStorage());
    writePlaySound('revenge', true);
    expect(readPlaySound('revenge')).toBe(true);
    expect(readPlaySound('unforgiven')).toBe(false);
  });

  it('is off where there is nowhere to remember anything', () => {
    useStorage(undefined);
    writePlaySound('revenge', true);
    expect(readPlaySound('revenge')).toBe(false);
  });
});

describe('the 3-D view over the map', () => {
  it('is off until it has been asked for', () => {
    useStorage(fakeStorage());
    expect(readPlayForwardView('unforgiven')).toBe(false);
  });

  it('remembers the choice for one game without touching the other', () => {
    useStorage(fakeStorage());
    writePlayForwardView('unforgiven', true);
    expect(readPlayForwardView('unforgiven')).toBe(true);
    expect(readPlayForwardView('moraffsWorld')).toBe(false);
  });

  it('is off where there is nowhere to remember anything', () => {
    useStorage(undefined);
    writePlayForwardView('unforgiven', true);
    expect(readPlayForwardView('unforgiven')).toBe(false);
  });
});

describe('announcements in the message box', () => {
  it('is off until it has been asked for', () => {
    useStorage(fakeStorage());
    expect(readPlayAnnouncements('unforgiven')).toBe(false);
  });

  it('remembers the choice for one game without touching the other', () => {
    useStorage(fakeStorage());
    writePlayAnnouncements('unforgiven', true);
    expect(readPlayAnnouncements('unforgiven')).toBe(true);
    expect(readPlayAnnouncements('moraffsWorld')).toBe(false);
  });

  it('is off where there is nowhere to remember anything', () => {
    useStorage(undefined);
    writePlayAnnouncements('unforgiven', true);
    expect(readPlayAnnouncements('unforgiven')).toBe(false);
  });
});

describe('reseeding from the clock', () => {
  it('is on until it has been turned off', () => {
    useStorage(fakeStorage());
    expect(readPlayClockReseed('unforgiven')).toBe(true);
  });

  it('remembers the choice for one game without touching the other', () => {
    useStorage(fakeStorage());
    writePlayClockReseed('unforgiven', false);
    expect(readPlayClockReseed('unforgiven')).toBe(false);
    expect(readPlayClockReseed('moraffsWorld')).toBe(true);
  });

  it('is on where there is nowhere to remember anything, the way the game is', () => {
    useStorage(undefined);
    writePlayClockReseed('unforgiven', false);
    expect(readPlayClockReseed('unforgiven')).toBe(true);
  });

  it('is the switch in debug and nothing but on in the two modes a run is played in', () => {
    expect(clockReseeds('faithful', false)).toBe(true);
    expect(clockReseeds('speedrun', false)).toBe(true);
    expect(clockReseeds('debug', true)).toBe(true);
    expect(clockReseeds('debug', false)).toBe(false);
  });
});

describe('the colourblindness simulation', () => {
  it('is off until it has been asked for', () => {
    useStorage(fakeStorage());
    expect(readPlayColourblind('unforgiven')).toBe(false);
  });

  it('remembers the choice for one game without touching the other', () => {
    useStorage(fakeStorage());
    writePlayColourblind('unforgiven', true);
    expect(readPlayColourblind('unforgiven')).toBe(true);
    expect(readPlayColourblind('moraffsWorld')).toBe(false);
  });

  it('turns back off again', () => {
    useStorage(fakeStorage());
    writePlayColourblind('revenge', true);
    writePlayColourblind('revenge', false);
    expect(readPlayColourblind('revenge')).toBe(false);
  });

  it('is off where there is nowhere to remember anything', () => {
    useStorage(undefined);
    writePlayColourblind('moraffsWorld', true);
    expect(readPlayColourblind('moraffsWorld')).toBe(false);
  });

  it('points the stage at the filter only while it is on', () => {
    expect(colourblindFilter(true)).toBe(`url(#${COLOURBLIND_FILTER_ID})`);
    expect(colourblindFilter(false)).toBe(null);
  });
});

describe('how long a screen takes to appear', () => {
  it('is instant until the slider is moved', () => {
    useStorage(fakeStorage());
    expect(INSTANT_REDRAW_MS).toBe(0);
    expect(readPlayRedraw('unforgiven')).toBe(0);
  });

  it('remembers the choice for one game without touching the other', () => {
    useStorage(fakeStorage());
    writePlayRedraw('unforgiven', 600);
    expect(readPlayRedraw('unforgiven')).toBe(600);
    expect(readPlayRedraw('moraffsWorld')).toBe(0);
  });

  it('takes nothing slower than the slowest the slider goes', () => {
    useStorage(fakeStorage());
    writePlayRedraw('revenge', SLOWEST_REDRAW_MS + 5000);
    expect(readPlayRedraw('revenge')).toBe(SLOWEST_REDRAW_MS);
  });

  it('reads a stored value that is not a number as instant', () => {
    const storage = fakeStorage();
    storage.setItem('moraff-tools.play.revenge.redraw', 'slowly');
    useStorage(storage);
    expect(readPlayRedraw('revenge')).toBe(0);
  });

  it('is instant where there is nowhere to remember anything', () => {
    useStorage(undefined);
    writePlayRedraw('moraffsWorld', 900);
    expect(readPlayRedraw('moraffsWorld')).toBe(0);
  });

  it('says what the slider is set to', () => {
    expect(redrawWords(0)).toBe('Instant');
    expect(redrawWords(100)).toBe('0.1 s');
    expect(redrawWords(1500)).toBe('1.5 s');
    expect(redrawWords(SLOWEST_REDRAW_MS)).toBe('2.0 s');
  });
});
