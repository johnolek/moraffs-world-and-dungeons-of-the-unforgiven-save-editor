import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The character roller on the Play tab.
 *
 * A player with no character for the game they are looking at had to go and find the New
 * Character tab; the same roller opens in a panel over the landing page instead, so a character
 * can be rolled and walked into the dungeon without leaving the page. The tabs have no props to
 * render them with, so what is checked is the markup.
 */

const shell = readFileSync('src/lib/play/PlayTab.svelte', 'utf8');
const css = readFileSync('src/lib/play/play-tab.css', 'utf8');
const roller = readFileSync('src/lib/roller/NewCharacter.svelte', 'utf8');

describe('the roller on the Play tab', () => {
  it('is opened in a panel over the landing page rather than laid into it', () => {
    expect(shell).toContain('<Overlay label={NEW_CHARACTER}');
    expect(shell).toContain('<NewCharacter standalone={false} tab="play" onclose=');
    expect(shell.indexOf('<Overlay')).toBeLessThan(shell.indexOf('<div class="stage">'));
  });

  it('leaves the landing page a page that scrolls, since the roller made it outgrow the tab', () => {
    // The character's status block is pinned along the foot of the window, and a page that does
    // not scroll runs underneath it.
    expect(css).toMatch(/\.play > \.page \{[^}]*overflow-y: auto;/);
  });

  it('answers the keyboard on the tab it was mounted on and on no other', () => {
    // Both are mounted at once — every tab stays in the page — so the one on the Play tab and the
    // one on the New Character tab would otherwise each take every key.
    expect(roller).toContain('if (app.tab !== tab) return;');
  });

  it('shuts on Escape, but not while a character is part-way through being rolled', () => {
    // There Escape belongs to the roller: the screen a character is designed on reads it, and a
    // roll half answered is not worth losing to a stray key.
    expect(roller).toContain("const midRoll = $derived(screen !== null && screen !== 'number');");
    expect(roller).toContain("if (event.key === 'Escape' && onclose && !midRoll) {");
  });
});
