import { afterEach, describe, expect, it } from 'vitest';
import { app, watchingCharacterOn } from './app-state.svelte';

const startingTab = app.tab;

afterEach(() => {
  app.tab = startingTab;
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
