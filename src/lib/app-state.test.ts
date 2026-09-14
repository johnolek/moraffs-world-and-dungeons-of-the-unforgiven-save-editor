import { afterEach, describe, expect, it } from 'vitest';
import { app, characterVersionOn } from './app-state.svelte';

const startingTab = app.tab;
const startingVersion = app.characterVersion;

afterEach(() => {
  app.tab = startingTab;
  app.characterVersion = startingVersion;
});

describe('the character version a tab watches', () => {
  it('is the real one while that tab is the one showing', () => {
    app.tab = 'calculators';
    app.characterVersion = 7;

    expect(characterVersionOn('calculators')).toBe(7);
  });

  it('is the same number whatever the character does, for a tab that is not showing', () => {
    app.tab = 'play';
    app.characterVersion = 7;
    const away = characterVersionOn('calculators');
    app.characterVersion = 8;

    expect(characterVersionOn('calculators')).toBe(away);
  });

  it('is the character as it now stands when the tab comes back', () => {
    app.tab = 'play';
    app.characterVersion = 7;
    characterVersionOn('calculators');
    app.characterVersion = 30;
    app.tab = 'calculators';

    expect(characterVersionOn('calculators')).toBe(30);
  });
});
