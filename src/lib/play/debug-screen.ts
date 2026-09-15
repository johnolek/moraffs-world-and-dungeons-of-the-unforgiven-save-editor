import type { Game, ScreenLine } from '../game/port/state';
import { dropOdds } from './drop-odds';
import { engagedMonster } from './panel';
import { AHEAD_VIEW } from './view3d/geometry';
import { strokeAdvance } from './view3d/stroke-font';

/**
 * What debug mode prints over the game's own screen: what the monster in the big forward view is
 * made of, which the game shows nowhere at all.
 *
 * The numbers are `engagedMonster`'s in `panel.ts`, so the lines over the view and the panel
 * beside the screen always say the same thing. Moraff's World prints its own monster's level and
 * hit points over the view it stands in, and these are placed to match.
 *
 * Under the numbers go what the kill is likely to be worth ({@link dropOdds}), and then the
 * things the record says the monster does beyond an ordinary hit — the drains, the breath, the
 * poison, the disease — in the words the Monsters tab uses for the same monster, so that the two
 * pages never describe one monster two ways.
 */

/** Where they go: inside the top left corner of the forward view, clear of the yellow label the
 *  game spreads across the middle of its top edge. */
const CORNER = { x: AHEAD_VIEW.left + 0x10, y: AHEAD_VIEW.top + 6 };

/** How far apart two lines of the game's smallest font sit, which is the key menu's own step. */
const LINE_STEP = 0x25;

/** White, which is what Moraff's World prints the same numbers in. */
const NUMBER_COLOUR = 15;

/** How many characters fit between the corner the lines start at and the right-hand edge of the
 *  view they are printed over, which is where the effect lines are broken. */
const LINE_CHARACTERS = Math.trunc((AHEAD_VIEW.right - CORNER.x) / strokeAdvance('dotu', 0));

/** The share of swings that land, to a tenth of a per cent, as the panel prints it. */
function hitPercent(chance: number): string {
  return `${(chance * 100).toFixed(1)}%`;
}

/**
 * Sentences broken into lines of at most `characters`, on the spaces between words.
 *
 * The Monsters tab reads these in a paragraph that reflows; the game's screen has a fixed grid
 * and a view only so wide, so a sentence too long for it is carried on to the next line. A single
 * word longer than the line is left to run over rather than being cut in half.
 */
export function wrapToWidth(sentences: string[], characters: number): string[] {
  const lines: string[] = [];
  for (const sentence of sentences) {
    let line = '';
    for (const word of sentence.split(' ')) {
      if (line === '') line = word;
      else if (line.length + 1 + word.length <= characters) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line !== '') lines.push(line);
  }
  return lines;
}

/**
 * The lines over the monster: its level and hit points on the first, the chance the character's
 * next swing lands on the second, the chance the monster's own next attack takes hit points off
 * them on the third, what killing it is likely to leave behind on the three after those, and what
 * it does beyond an ordinary hit under the lot. Nothing is printed when nothing is being faced.
 */
export function debugMonsterLines(game: Game): ScreenLine[] {
  const engaged = engagedMonster(game);
  if (engaged === null) return [];
  const drops = dropOdds(game);
  const texts = [
    `LEVEL:${engaged.level} HP:${engaged.hp}`,
    `HIT:${hitPercent(engaged.hitChance)}`,
    `IT HITS:${hitPercent(engaged.hitsYouChance)}`,
    `DROPS WEAPON:${hitPercent(drops.weapon)}`,
    `DROPS ARMOR:${hitPercent(drops.armor)}`,
    `DROPS SPECIAL:${hitPercent(drops.special)}`,
    ...wrapToWidth(engaged.effects, LINE_CHARACTERS),
  ];
  return texts.map((text, at) => ({
    text,
    x: CORNER.x,
    y: CORNER.y + at * LINE_STEP,
    font: 0,
    colour: NUMBER_COLOUR,
  }));
}
