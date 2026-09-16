import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { panelVisible } from './mode';

/**
 * Where the panel of numbers the game never prints sits on each of the three Play tabs.
 *
 * Every mode starts on the game's own screen now, so the panel has to stand beside the screen
 * rather than beside the top-down map: it lives in the column down the right of the tab, which
 * the switch between the two never touches. That column is `PlayTab.svelte`'s, and each game
 * hands its own panel in as the snippet at the foot of it. The tabs have no props to render them
 * with — each plays whichever character is on the roster — so what is checked here is the markup.
 */

const shell = readFileSync('src/lib/play/PlayTab.svelte', 'utf8');

const TABS = [
  { game: 'Dungeons of the Unforgiven', file: 'src/lib/play/Play.svelte', panel: '<Panel' },
  { game: "Moraff's World", file: 'src/lib/play/mw/MwPlay.svelte', panel: '<MwPanel' },
  { game: "Moraff's Revenge", file: 'src/lib/play/rev/RevPlay.svelte', panel: '<RevPanel' },
];

describe('the panel of numbers the game never prints', () => {
  it('is shown in debug alone, whichever of the two is on the stage', () => {
    expect(panelVisible('faithful', null)).toBe(false);
    expect(panelVisible('speedrun', null)).toBe(false);
    expect(panelVisible('debug', null)).toBe(true);
  });

  it('is drawn in the column beside the stage rather than on it', () => {
    const column = { opens: shell.indexOf('<aside class="side">'), closes: shell.indexOf('</aside>') };
    const foot = shell.indexOf('{@render sideFoot?.(stage)}');
    expect(foot).toBeGreaterThan(column.opens);
    expect(foot).toBeLessThan(column.closes);
    // Everything the switch chooses between is on the stage, which the column comes after, so
    // the column and its panel are there whichever of the two is being shown.
    expect(shell.indexOf('<div class="map"')).toBeLessThan(column.opens);
  });

  for (const tab of TABS) {
    const source = readFileSync(tab.file, 'utf8');

    it(`is what the foot of the column holds on ${tab.game}'s tab`, () => {
      const snippet = source.indexOf('{#snippet sideFoot(');
      expect(snippet).toBeGreaterThan(-1);
      const guard = source.indexOf('{#if panelVisible(stage.mode, stage.lock)}', snippet);
      expect(guard).toBeGreaterThan(snippet);
      // The mode and the lock are the whole of what the panel waits on: it is drawn right behind
      // that guard.
      // The tag alone is looked for, since a panel with props enough to wrap opens on its own
      // line.
      expect(source.slice(guard, source.indexOf('{/if}', guard))).toContain(tab.panel);
    });
  }
});
