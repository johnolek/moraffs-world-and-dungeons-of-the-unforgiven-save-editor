import type { Game, ScreenLine } from '../game/port/state';
import { dropOdds, type DropChance } from './drop-odds';
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
 * How often a kill leaves something behind, as the kills it takes to see one.
 *
 * A per cent reads as nothing at all for the drops, which are rare enough that the weapon and
 * the armor lines both sit under five in a hundred. The most likely of the three is the special
 * item, and two kills in three is as often as that one can ever be, so the count never rounds
 * down to a kill.
 */
function killsPer(drop: DropChance): string {
  if (drop.never !== null) return `NEVER (${drop.never})`;
  return `1 IN ${Math.round(1 / drop.chance)} KILLS`;
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
 *
 * @param tick what the machine's tick counter reads at this moment, for a game played on the
 *   clock, which makes HIT the chance of the swing that could be made right now rather than the
 *   average over the eighty rolls. It moves as the counter does.
 */
export function debugMonsterLines(game: Game, tick: number | null = null): ScreenLine[] {
  const engaged = engagedMonster(game, tick);
  if (engaged === null) return [];
  const drops = dropOdds(game);
  const texts = [
    `LEVEL:${engaged.level} HP:${engaged.hp}`,
    `HIT:${hitPercent(engaged.hitChance)}`,
    `IT HITS:${hitPercent(engaged.hitsYouChance)}`,
    `DROPS WEAPON: ${killsPer(drops.weapon)}`,
    `DROPS ARMOR: ${killsPer(drops.armor)}`,
    `DROPS SPECIAL: ${killsPer(drops.special)}`,
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
