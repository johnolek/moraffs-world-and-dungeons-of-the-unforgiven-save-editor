import type { Rgb } from '../game/dotu-pic.js';
import type { Game, ScreenLine } from '../game/port/state';
import { dropOdds, type DropChance } from './drop-odds';
import { engagedMonster } from './panel';
import { fillRect, type Frame } from './view3d/frame';
import { AHEAD_VIEW } from './view3d/geometry';
import { strokeAdvance, strokeLineHeight, UNITS_X, UNITS_Y } from './view3d/stroke-font';
import { drawDotuScreenLine, type TextScreen } from './view3d/text';

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

/** Which of the lines the HIT percentage is. It is the one line of them that moves on its own,
 *  so it is drawn apart from the rest while the tick it is read from is live. */
const HIT_LINE = 1;

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
  return texts.map((text, at) => placed(text, at));
}

/** One of the lines, where its place in the list puts it. */
function placed(text: string, at: number): ScreenLine {
  return { text, x: CORNER.x, y: CORNER.y + at * LINE_STEP, font: 0, colour: NUMBER_COLOUR };
}

/**
 * The lines the game's own screen carries, which are all of them but the HIT percentage while the
 * tick is live.
 *
 * A live tick moves that one line about eighteen times a second, and the screen is one 1024 by 768
 * frame built in one go, so leaving it in means rebuilding the whole frame — the four 3-D views
 * among them — on every reading of a counter. It is drawn on a layer of its own over the frame
 * instead ({@link liveHitLine}), and the frame is built only when the game draws.
 */
export function framedMonsterLines(game: Game, tick: number | null): ScreenLine[] {
  const lines = debugMonsterLines(game, tick);
  return tick === null ? lines : lines.filter((_line, at) => at !== HIT_LINE);
}

/**
 * The HIT percentage while the tick is live, in the place it stands in among the lines, or null
 * where the tick is not live or nothing is being faced.
 */
export function liveHitLine(game: Game, tick: number | null): ScreenLine | null {
  if (tick === null) return null;
  const engaged = engagedMonster(game, tick);
  if (engaged === null) return null;
  return placed(`HIT:${hitPercent(engaged.hitChance)}`, HIT_LINE);
}

/** A box of the screen's own pixels: where it starts, and how far it reaches. */
export interface ScreenBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The longest reading the HIT line can hold, which is what its box is sized for. */
const LONGEST_HIT = 'HIT:100.0%';

/** How many pixels of room the box leaves around the line, since the strokes are drawn with a pen
 *  a few pixels wide that runs a little past the box the font places a glyph in. */
const HIT_SLACK = 4;

/** Where the pixel column or row a place in the 1600 by 1200 grid falls in, the way the stroke
 *  font works it out. */
const acrossScreen = (grid: number, pixels: number): number => Math.trunc((grid * (pixels - 1)) / UNITS_X + 0.5);
const downScreen = (grid: number, pixels: number): number => Math.trunc((grid * (pixels - 1)) / UNITS_Y + 0.5);

/**
 * The box the live HIT line stands in, in the screen's own pixels, which is where the layer
 * carrying it is placed and how big it is.
 *
 * It reaches a whole line above the place the line is given as well as a line below it, because
 * the game's own percent sign is drawn rising out of the top of its box.
 */
export function liveHitBox(screen: TextScreen): ScreenBox {
  const left = CORNER.x;
  const top = CORNER.y + HIT_LINE * LINE_STEP;
  const height = strokeLineHeight(0);
  const x = acrossScreen(left, screen.width) - HIT_SLACK;
  const y = downScreen(top - height, screen.height) - HIT_SLACK;
  const right = acrossScreen(left + strokeAdvance('dotu', 0) * LONGEST_HIT.length, screen.width) + HIT_SLACK;
  const bottom = downScreen(top + height, screen.height) + HIT_SLACK;
  return { x, y, width: right - x + 1, height: bottom - y + 1 };
}

/** The colour of a pixel nothing has been drawn on, which is what the game clears a screen to. */
const NOTHING_DRAWN = 0;

/**
 * The live HIT line as the pixels of its own box: its own colour wherever a stroke fell, and
 * nothing at all everywhere else, so that a layer carrying them hides no part of the screen but
 * the line itself.
 *
 * `scratch` is a frame the size of the whole screen because the game's font places a line by the
 * whole screen's pixels rather than by the box it lands in. Only the box is read back out of it,
 * and only the box is cleared, so the frame is written once and kept.
 */
export function paintLiveHit(
  scratch: Frame,
  screen: TextScreen,
  line: ScreenLine,
  colour: Rgb,
  into: Uint8ClampedArray,
): ScreenBox {
  const box = liveHitBox(screen);
  fillRect(scratch, box.x, box.y, box.x + box.width - 1, box.y + box.height - 1, NOTHING_DRAWN);
  drawDotuScreenLine(scratch, screen, line);
  let at = 0;
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      into[at] = colour[0];
      into[at + 1] = colour[1];
      into[at + 2] = colour[2];
      into[at + 3] = scratch.pixels[y * scratch.width + x] === NOTHING_DRAWN ? 0 : 255;
      at += 4;
    }
  }
  return box;
}
