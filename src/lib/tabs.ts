import { app, type GameId, type Tab } from './app-state.svelte';
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
  { id: 'admin', label: 'Admin', group: 'extras' },
];

/** The tabs each game other than Dungeons of the Unforgiven has, which has them all: the fight
 *  simulator, the calculators, the formulas and the snake are that game's alone. A game listing
 *  `tidbits` here needs a file of its own in `src/lib/tidbits/files.ts` to show on it. */
const GAME_TABS: Partial<Record<GameId, Tab[]>> = {
  moraffsWorld: ['map', 'play', 'boards', 'editor', 'monsters', 'spells', 'tidbits', 'roller', 'source', 'admin'],
  revenge: ['map', 'play', 'boards', 'editor', 'monsters', 'tidbits', 'roller', 'source', 'admin'],
};

/** The one tab the other games call something else, since only Dungeons of the Unforgiven needs
 *  naming when the map is of another game's own dungeons. */
const OTHER_GAME_LABELS: Partial<Record<Tab, string>> = { map: 'Map' };

/** Where a game goes when the tab that was showing is not one of its own. */
const FALLBACK_TAB: Tab = 'editor';

export function tabsFor(game: GameId): TabEntry[] {
  const shown = TABS.filter(inThisSite);
  const theirs = GAME_TABS[game];
  if (!theirs) return shown;
  return shown.filter((tab) => theirs.includes(tab.id)).map((tab) => ({ ...tab, label: OTHER_GAME_LABELS[tab.id] ?? tab.label }));
}

/**
 * Whether a tab that is not on every page is on this one. The rest are always there.
 *
 * All three games have the boards, and a build that was given no run server address has none to
 * show. The Admin tab is for the player whose passphrase the run server answered as an admin's,
 * which is an answer only a build with a server ever got, and nobody else is to know there is
 * such a tab.
 */
function inThisSite(tab: TabEntry): boolean {
  if (tab.id === 'boards') return runServerUrl() !== null;
  if (tab.id === 'admin') return app.admin !== null;
  return true;
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

/**
 * Whether a tab's contents are built into the page.
 *
 * A tab is built the first time it is opened and then kept in the page, hidden, for the rest of
 * the visit, so that everything it remembers — a game in progress, where the map is looking, a
 * half-rolled character, a fight set up — is still there when the player comes back to it. A tab
 * nobody has opened is not built at all, which is what keeps the first paint to the one tab the
 * site opens on.
 *
 * @param showing the tab on screen now
 * @param opened every tab that has been on screen before
 * @param tab the tab being asked about
 */
export function tabIsBuilt(showing: Tab, opened: ReadonlySet<Tab>, tab: Tab): boolean {
  return showing === tab || opened.has(tab);
}
