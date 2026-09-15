import type { GameId, Tab } from './app-state.svelte';
import { runServerUrl } from './run-server';

/** Which group of the nav a tab sits in: `play` is the things you do with a character of your own,
 *  `reference` is what the site can tell you about the games, and `extras` is the rest. */
export type TabGroup = 'play' | 'reference' | 'extras';

export interface TabEntry {
  id: Tab;
  label: string;
  group: TabGroup;
}

/** The groups in the order the nav shows them, which is the order `TABS` is written in. */
export const TAB_GROUPS: TabGroup[] = ['play', 'reference', 'extras'];

/** Every tab the site has, in the order they show. */
export const TABS: TabEntry[] = [
  { id: 'play', label: 'Play', group: 'play' },
  { id: 'boards', label: 'Boards', group: 'play' },
  { id: 'roller', label: 'New Character', group: 'play' },
  { id: 'editor', label: 'Save Editor', group: 'play' },
  { id: 'map', label: 'DotU Map', group: 'reference' },
  { id: 'monsters', label: 'Monsters', group: 'reference' },
  { id: 'spells', label: 'Spells', group: 'reference' },
  { id: 'fight', label: 'Fight', group: 'reference' },
  { id: 'calculators', label: 'Calculators', group: 'reference' },
  { id: 'formulas', label: 'Formulas', group: 'reference' },
  { id: 'tidbits', label: 'Tidbits', group: 'extras' },
  { id: 'snake', label: 'Snake', group: 'extras' },
  { id: 'source', label: 'Source', group: 'extras' },
];

/** The tabs each game other than Dungeons of the Unforgiven has, which has them all: the fight
 *  simulator, the calculators, the formulas and the snake are that game's alone. A game listing
 *  `tidbits` here needs a file of its own in `src/lib/tidbits/files.ts` to show on it. */
const GAME_TABS: Partial<Record<GameId, Tab[]>> = {
  moraffsWorld: ['map', 'play', 'boards', 'editor', 'monsters', 'spells', 'tidbits', 'roller', 'source'],
  revenge: ['map', 'play', 'boards', 'editor', 'monsters', 'tidbits', 'roller', 'source'],
};

/** The one tab the other games call something else, since only Dungeons of the Unforgiven needs
 *  naming when the map is of another game's own dungeons. */
const OTHER_GAME_LABELS: Partial<Record<Tab, string>> = { map: 'Map' };

/** Where a game goes when the tab that was showing is not one of its own. */
const FALLBACK_TAB: Tab = 'editor';

export function tabsFor(game: GameId): TabEntry[] {
  // All three games have the boards, and a build that was given no run server address has none
  // to show: that is the only tab there is nothing at all behind without one.
  const shown = TABS.filter((tab) => tab.id !== 'boards' || runServerUrl() !== null);
  const theirs = GAME_TABS[game];
  if (!theirs) return shown;
  return shown.filter((tab) => theirs.includes(tab.id)).map((tab) => ({ ...tab, label: OTHER_GAME_LABELS[tab.id] ?? tab.label }));
}

/** The tabs a game has, split into the groups the nav draws with a gap between them. A group the
 *  game has no tab in is left out rather than showing as an empty gap. */
export function tabGroupsFor(game: GameId): TabEntry[][] {
  const theirs = tabsFor(game);
  return TAB_GROUPS.map((group) => theirs.filter((tab) => tab.group === group)).filter((tabs) => tabs.length > 0);
}

/** The tab to show under a game, which is the one asked for unless that game has no such tab.
 *  A game without a save editor to fall back on goes to the first tab it does have. */
export function tabFor(game: GameId, tab: Tab): Tab {
  const theirs = tabsFor(game);
  if (theirs.some((entry) => entry.id === tab)) return tab;
  return theirs.some((entry) => entry.id === FALLBACK_TAB) ? FALLBACK_TAB : theirs[0].id;
}
