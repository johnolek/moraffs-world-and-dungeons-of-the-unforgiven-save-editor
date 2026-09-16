import { describe, expect, it } from 'vitest';
import { FAITHFUL_RULES, type GameRules } from '../port/rules';
import page from './ENDLESS.md?raw';

/**
 * The section of the Endless tab's page that explains what endless mode does with each of the
 * rules a game is played by.
 *
 * The page is the only place a player is told any of this, and a page nobody is made to update
 * goes stale in a month. So every member of `GameRules` is written down here against the section
 * that covers it, and the two tests below fail when the seam and the page stop agreeing: a rule
 * added to endless mode has nowhere to go until somebody decides what the page says about it, and
 * a section renamed out from under this table is caught the same day.
 *
 * Only the rule-shaped differences are held this way. The rest of what endless changes — the
 * repainted monsters, the state kept beside the record, the world the server hands out — is not a
 * member of anything, and stays the writer's job.
 */
const EXPLAINED: Record<keyof GameRules, string> = {
  bottomLevel: 'The same game, with no bottom',
  sectionOf: 'Sections past the twentieth',
  sectionPlace: 'Sections past the twentieth',
  sectionSource: 'Sections past the twentieth',
  pictureFiles: 'Sections past the twentieth',
  bossSquares: 'Sections past the twentieth',
  bossBeaten: 'Sections past the twentieth',
  monsterKinds: 'Five monsters you have seen before, in colours you have not',
  monsterTypeOdds: 'Sections with a theme',
  sectionNote: 'Sections with a theme',
  deepShadows: 'Shadows that wander',
  monsterLevel: 'Monsters that keep growing',
  monsterLevelMax: 'Monsters that keep growing',
  monsterLevelWrap: 'Monsters that keep growing',
  monsterHpMax: 'Monsters that keep growing',
  experienceCap: 'What a kill is worth',
  trapdoorReach: 'Trap doors and their keys',
  keys: 'Trap doors and their keys',
  autokillDeepestFloor: 'Autokill stops at floor 200',
};

/** Every `###` of the page, which is what its table of contents lists. */
const HEADINGS = page
  .split('\n')
  .filter((line) => line.startsWith('### '))
  .map((line) => line.slice(4).trim());

describe('the Endless page', () => {
  it('says something about every rule a game is played by', () => {
    expect(Object.keys(EXPLAINED).sort()).toEqual(Object.keys(FAITHFUL_RULES).sort());
  });

  it('still has the section each rule was written down against', () => {
    for (const [rule, heading] of Object.entries(EXPLAINED)) {
      expect(HEADINGS, `the rule ${rule} is explained under "${heading}"`).toContain(heading);
    }
  });
});
