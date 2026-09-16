import { describe, expect, it } from 'vitest';
import type { GameId } from '../app-state.svelte';
import { allFormulas } from '../formulas/formulas';
import { decompilation, decompSection } from '../source/decomp';
import { allPortFunctions, sourceFiles } from '../source/ports';
import { tabsFor } from '../tabs';
import { TIDBITS_FILES, tidbitsGames } from './files';
import { parseDoc, type Inline, type LinkTarget, type Section } from '../ui/markdown';

const SECTIONS = [
  'Exploits and shortcuts',
  'Combat',
  'Magic',
  'Monsters',
  'Map and travel',
  'Town and money',
  'Bugs the game has',
  'Trivia and history',
];

const FORMULA_IDS = new Set(allFormulas().map((formula) => formula.id));

function entriesOf(sections: Section[]) {
  return sections.flatMap((section) => section.entries);
}

function targetsOf(sections: Section[]): LinkTarget[] {
  const nodes: Inline[] = entriesOf(sections)
    .flatMap((entry) => entry.blocks)
    .flatMap((block) => (block.kind === 'paragraph' ? [block.content] : block.items))
    .flat();
  return nodes.flatMap((node) => (node.kind === 'link' ? [node.target] : []));
}

/** True for a game whose tabs hold the one a link would open, since a link that switches to a
 *  tab the game does not have would leave the site showing nothing. */
function hasTab(game: GameId, tab: 'formulas' | 'source'): boolean {
  return tabsFor(game).some((entry) => entry.id === tab);
}

describe.each(tidbitsGames())('the tidbits of %s', (game) => {
  const sections = parseDoc(TIDBITS_FILES[game] ?? '');
  const entries = entriesOf(sections);
  const targets = targetsOf(sections);

  it('holds its sections in order, each named once', () => {
    const titles = sections.map((section) => section.title);
    expect(titles.length).toBeGreaterThan(0);
    expect(new Set(titles).size).toBe(titles.length);
    // The two Borland games share one plan of sections; Moraff's Revenge, a different kind of
    // game with far less of it read, has its own.
    if (game !== 'revenge') expect(titles).toEqual(SECTIONS);
  });

  it('gives every section entries and every entry something to say', () => {
    for (const section of sections) expect(section.entries.length, section.title).toBeGreaterThan(0);
    for (const entry of entries) expect(entry.blocks.length, entry.title).toBeGreaterThan(0);
  });

  it('gives every entry a banner in the game\'s own voice', () => {
    for (const entry of entries) expect(entry.banner, entry.title).not.toBe('');
  });

  // A banner is set in the game's font, which draws printable ASCII and nothing else. That the
  // font really covers all of it is `scripts/font.test.ts`'s business; this only keeps a banner
  // from reaching for a curly quote or a dash the font has never heard of.
  it('writes every banner in printable ASCII', () => {
    for (const entry of entries) {
      const undrawable = [...entry.banner].filter((char) => char < ' ' || char > '~');
      expect(undrawable, `${entry.title}: ${entry.banner}`).toEqual([]);
    }
  });

  it('names every entry once', () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('links every source:ts/ to a declaration the Source tab shows for this game', () => {
    const declared = allPortFunctions();
    for (const target of targets) {
      if (target.kind !== 'port') continue;
      const file = sourceFiles(game).find((path) => path.endsWith(`/${target.file}`));
      expect(file, `no file ${target.file}`).toBeDefined();
      const found = declared.some((fn) => fn.file === file && fn.name === target.name);
      expect(found, `${target.file} declares no ${target.name}`).toBe(true);
    }
  });

  it("links every source:c/ to a function of this game's decompilation", () => {
    for (const target of targets) {
      if (target.kind !== 'decompiled') continue;
      expect(decompSection(target.name, game), `no decompiled ${target.name}`).not.toBe(null);
    }
  });

  it('links a formula only from a game whose tabs hold the Formulas tab', () => {
    for (const target of targets) {
      if (target.kind !== 'formula') continue;
      expect(hasTab(game, 'formulas'), `${game} has no Formulas tab`).toBe(true);
      expect(FORMULA_IDS.has(target.id), `no formula ${target.id}`).toBe(true);
    }
  });

  it('links to the port, the decompilation where the Source tab has one, and the web', () => {
    const kinds = new Set(targets.map((target) => target.kind));
    for (const kind of ['port', 'url']) expect(kinds).toContain(kind);
    if (decompilation(game)) expect(kinds).toContain('decompiled');
  });

  it('shows on a Tidbits tab, and opens its code links on a Source tab', () => {
    expect(tabsFor(game).map((entry) => entry.id)).toContain('tidbits');
    expect(hasTab(game, 'source')).toBe(true);
  });
});

describe('TIDBITS.md', () => {
  const targets = targetsOf(parseDoc(TIDBITS_FILES.unforgiven ?? ''));

  it('is the one file that links to the Formulas tab', () => {
    expect(targets.some((target) => target.kind === 'formula')).toBe(true);
  });
});
