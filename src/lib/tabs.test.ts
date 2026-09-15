import { afterEach, describe, expect, it, vi } from 'vitest';
import { tabFor, tabGroupsFor, tabsFor, TAB_GROUPS, TABS, type TabGroup } from './tabs';

/** A build given a run server, which is the only kind that has boards to show. */
function withBoards(): void {
  vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the tabs a game has', () => {
  it('is all of them for Dungeons of the Unforgiven', () => {
    withBoards();

    expect(tabsFor('unforgiven')).toEqual(TABS);
  });

  it('is Play, New Character, the Save Editor, the Map, the Monsters, Spells, Tidbits and Source for Moraff’s World', () => {
    expect(tabsFor('moraffsWorld').map((tab) => tab.id)).toEqual(['play', 'roller', 'editor', 'map', 'monsters', 'spells', 'tidbits', 'source']);
  });

  it('is Play, New Character, the Save Editor, the Map, the Monsters, Tidbits and Source for Moraff’s Revenge', () => {
    expect(tabsFor('revenge').map((tab) => tab.id)).toEqual(['play', 'roller', 'editor', 'map', 'monsters', 'tidbits', 'source']);
  });

  it('gives all three games the Boards tab where the build has a run server', () => {
    withBoards();

    expect(tabsFor('unforgiven').map((tab) => tab.id)).toContain('boards');
    expect(tabsFor('moraffsWorld').map((tab) => tab.id)).toContain('boards');
    expect(tabsFor('revenge').map((tab) => tab.id)).toContain('boards');
  });

  it('gives no game the Boards tab in a build with no run server', () => {
    expect(tabsFor('unforgiven').map((tab) => tab.id)).not.toContain('boards');
    expect(tabsFor('moraffsWorld').map((tab) => tab.id)).not.toContain('boards');
    expect(tabsFor('revenge').map((tab) => tab.id)).not.toContain('boards');
    expect(tabFor('unforgiven', 'boards')).toBe('editor');
  });

  it('gives all three games the Play tab, since all three of them can be played', () => {
    expect(tabsFor('unforgiven').map((tab) => tab.id)).toContain('play');
    expect(tabsFor('moraffsWorld').map((tab) => tab.id)).toContain('play');
    expect(tabsFor('revenge').map((tab) => tab.id)).toContain('play');
    expect(tabFor('moraffsWorld', 'play')).toBe('play');
    expect(tabFor('revenge', 'play')).toBe('play');
  });

  it('gives the Fight tab to Dungeons of the Unforgiven alone', () => {
    expect(tabsFor('unforgiven').map((tab) => tab.id)).toContain('fight');
    expect(tabsFor('moraffsWorld').map((tab) => tab.id)).not.toContain('fight');
    expect(tabsFor('revenge').map((tab) => tab.id)).not.toContain('fight');
    expect(tabFor('moraffsWorld', 'fight')).toBe('editor');
  });

  it('calls the map tab DotU Map under that game and Map under the others', () => {
    expect(TABS.find((tab) => tab.id === 'map')?.label).toBe('DotU Map');
    expect(tabsFor('moraffsWorld').find((tab) => tab.id === 'map')?.label).toBe('Map');
    expect(tabsFor('revenge').find((tab) => tab.id === 'map')?.label).toBe('Map');
  });
});

describe('the groups the tabs are drawn in', () => {
  it('is the three groups in their order', () => {
    withBoards();

    expect(tabGroupsFor('unforgiven').map((group) => group.map((tab) => tab.id))).toEqual([
      ['play', 'boards', 'roller', 'editor'],
      ['map', 'monsters', 'spells', 'fight', 'calculators', 'formulas'],
      ['tidbits', 'snake', 'source'],
    ]);
  });

  it('finds TABS itself written in that order, so the flat list reads as the nav shows', () => {
    const runs: TabGroup[] = [];
    for (const tab of TABS) if (runs[runs.length - 1] !== tab.group) runs.push(tab.group);

    expect(runs).toEqual(TAB_GROUPS);
  });

  it('leaves out a group the game has no tab in', () => {
    expect(tabGroupsFor('revenge').map((group) => group.map((tab) => tab.id))).toEqual([
      ['play', 'roller', 'editor'],
      ['map', 'monsters'],
      ['tidbits', 'source'],
    ]);
  });
});

describe('the tab to show', () => {
  it('is the one asked for when the game has it', () => {
    expect(tabFor('moraffsWorld', 'roller')).toBe('roller');
    expect(tabFor('moraffsWorld', 'spells')).toBe('spells');
    expect(tabFor('unforgiven', 'map')).toBe('map');
  });

  it('falls back to the Save Editor when the game has no such tab', () => {
    expect(tabFor('moraffsWorld', 'calculators')).toBe('editor');
    expect(tabFor('moraffsWorld', 'snake')).toBe('editor');
  });

  it('falls back to the Save Editor for Moraff’s Revenge too, now that it has one', () => {
    expect(tabFor('revenge', 'spells')).toBe('editor');
    expect(tabFor('revenge', 'editor')).toBe('editor');
    expect(tabFor('revenge', 'source')).toBe('source');
  });
});
