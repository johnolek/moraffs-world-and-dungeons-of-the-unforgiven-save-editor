import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The character roller on the Play tab's landing page.
 *
 * A player with no character for the game they are looking at had to go and find the New
 * Character tab; the same roller is mounted here instead, so a character can be rolled and walked
 * into the dungeon without leaving the page. The tabs have no props to render them with, so what
 * is checked is the markup.
 */

const shell = readFileSync('src/lib/play/PlayTab.svelte', 'utf8');
const roller = readFileSync('src/lib/roller/NewCharacter.svelte', 'utf8');

describe('the roller on the Play tab', () => {
  it('is mounted on the landing page rather than beside the game', () => {
    expect(shell).toContain('<NewCharacter standalone={false} tab="play" />');
    expect(shell.indexOf('<NewCharacter')).toBeLessThan(shell.indexOf('<div class="stage">'));
  });

  it('is drawn without the frame and the title the New Character tab draws', () => {
    expect(roller).toContain('let { standalone = true, tab = \'roller\' }');
  });

  it('answers the keyboard on the tab it was mounted on and on no other', () => {
    // Both are mounted at once — every tab stays in the page — so the one on the Play tab and the
    // one on the New Character tab would otherwise each take every key.
    expect(roller).toContain("if (app.tab !== tab || screen === null) return;");
  });
});
