import { afterEach, describe, expect, it } from 'vitest';
import { app, keysGoTo, watchingCharacterOn } from './app-state.svelte';

const startingTab = app.tab;

afterEach(() => {
  app.tab = startingTab;
  app.panelOverPage = false;
});

describe('whether a tab is watching the character', () => {
  it('is watching while it is the tab showing', () => {
    app.tab = 'calculators';

    expect(watchingCharacterOn('calculators')).toBe(true);
  });

  it('is not watching while another tab is showing', () => {
    app.tab = 'play';

    expect(watchingCharacterOn('calculators')).toBe(false);
  });
});

describe('whether a key belongs to a tab', () => {
  it('belongs to the tab showing', () => {
    app.tab = 'play';

    expect(keysGoTo('play')).toBe(true);
  });

  it('does not belong to a tab nobody is looking at', () => {
    app.tab = 'map';

    expect(keysGoTo('play')).toBe(false);
  });

  it('belongs to no tab at all while a panel over the page has the keyboard', () => {
    app.tab = 'play';
    app.panelOverPage = true;

    expect(keysGoTo('play')).toBe(false);
  });
});
