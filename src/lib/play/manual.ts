import { resetViewCaches } from '../game/port/character';
import data from '../game/dotu-data.json';
import { toUpperByte } from '../game/port/screens';
import type { Game } from '../game/port/state';
import type { Turn } from './engine';
import {
  MANUAL_DEAD,
  MANUAL_LETTERS,
  MANUAL_TEXT,
  manualTextBox,
  type SectionScreen,
} from './section-screen';

/**
 * monster_manual (exe 3000:c39d, unf.c "monster_manual"), the S key: the section the character
 * is in, and the five monsters that live there.
 *
 * The text is MD.BIN's, which is `dotu-data.json`'s `sections`: four forty-column lines of
 * introduction and then twenty more, four to a monster, in the order the section's monster table
 * has them. load_md_bin (exe 2000:5fec) reads them into the twenty pointers at DS:c615 and
 * FUN_3000_9026 (exe 3000:9026) draws four of them at a time, on the stone tablet of `tablet.ts`
 * lifted to the top of the screen.
 *
 * `section-screen.ts` is the rest of it: the five panels of the section's wall material with the
 * monsters standing in them, and the fat dark pass of every line printed here.
 */

/** How many lines of MD.BIN one monster's description is. */
const BLOCK_LINES = 4;

/**
 * Which description each of the five letters shows (exe 3000:ca35). The letters are not the
 * order the monster table is in: A is the section's Shadow boss, E is the first of the four
 * ordinary monsters, and B, C and D are the other three. The pictures are drawn in the same
 * order, so a letter is under the monster it describes.
 */
const LETTER_BLOCKS = [0, 2, 3, 4, 1];

/** The first and last of the five letters the manual reads. */
const FIRST_LETTER = 0x41;

/**
 * What the screen says about a section the game has no words for, which is a section past the
 * twenty MD.BIN describes: it says which section it is and whose pages the reader is about to
 * turn, since the five monsters under the letters are that section's and not the ones standing
 * on the floor.
 */
function borrowedIntro(section: number, source: number): string[] {
  return [
    `SECTION ${section}`,
    'Nobody mapped this far down. The pages',
    `below are section ${source}'s. Its monsters`,
    'are not the ones standing here.',
  ];
}

/** The line across the bottom (exe DS:3598), as psfont draws it when there is no mouse. */
const PROMPT = {
  text: 'PRESS A, B, C, D, OR E FOR MORE INFORMATION OR HIT A KEY TO CONTINUE',
  x: 0,
  y: 0x488,
  spreadTo: 0x63f,
  font: 0,
  colour: 15,
};

/** What drawing a page needs of the session: the game to print the lines on, and somewhere to
 *  leave the screen the tab draws the panels and the monsters from. */
export interface ManualHost {
  game: Game;
  sectionScreen: SectionScreen | null;
}

/** What the S key opens on. */
export interface ManualOpening {
  /** The section the five monsters under the letters come from, 1 to 20. */
  source: number;
  /** Which of its module's sections the character is standing in, counted from 1. */
  part: number;
  /** The four lines on the slab. */
  intro: string[];
}

/**
 * The section the S key shows for the floor the character is standing on: the row of MD.BIN the
 * five monsters and their descriptions come from, and the words the screen opens on.
 */
export function manualOpening(game: Game): ManualOpening {
  const standingIn = game.rules.sectionOf(game.pc.module, game.pc.level);
  const source = game.rules.sectionSource(standingIn);
  const row = data.sections[source - 1];
  return {
    source,
    part: game.rules.sectionPlace(standingIn)?.part ?? row.part,
    intro: source === standingIn ? row.intro : borrowedIntro(standingIn, source),
  };
}

/** The S key, until the reader leaves it. */
export async function readTheMonsterManual(turn: Turn): Promise<void> {
  const game = turn.game;
  const opening = manualOpening(game);
  const section = data.sections[opening.source - 1];
  let shown: string[] = opening.intro;
  for (;;) {
    drawManualPage(turn.session, opening.source, opening.part - 1, shown);
    const block = letterPressed(await game.key());
    if (block === null) break;
    shown = section.descriptions.slice(block * BLOCK_LINES, (block + 1) * BLOCK_LINES);
  }
  turn.session.sectionScreen = null;
  game.eraseScreen();
  resetViewCaches(game);
}

/**
 * Which description a key asks for. The original puts the key through toupper and treats
 * everything outside A to E as the answer that leaves, escape included.
 */
function letterPressed(key: number): number | null {
  const letter = toUpperByte(key) - FIRST_LETTER;
  return LETTER_BLOCKS[letter] ?? null;
}

/**
 * The four lines of a page, with the letters, the stamp and the prompt that stand under them.
 *
 * The original draws the letters and the stamp once and leaves them standing while it turns the
 * pages, redrawing only the tablet and the line across the bottom; the port draws every line of
 * the screen again for each page, which comes out the same picture.
 *
 * @param section the section the five monsters come from.
 * @param part which of its module's sections the character is standing in, counted from 0, which
 *   is what says whether its Shadow boss has been killed.
 */
export function drawManualPage(session: ManualHost, section: number, part: number, lines: string[]): void {
  const game = session.game;
  const bossDead = bossIsDead(game, part);
  game.eraseScreen();
  session.sectionScreen = { section, lines, bossDead };
  game.draw({ ...MANUAL_LETTERS.box, ...MANUAL_LETTERS.bright, text: MANUAL_LETTERS.text, font: 1 });
  if (bossDead) game.draw({ ...MANUAL_DEAD.box, ...MANUAL_DEAD.bright, text: MANUAL_DEAD.text, font: 1 });
  lines.forEach((text, index) => {
    game.draw({ ...manualTextBox(index), ...MANUAL_TEXT.bright, text, font: 1 });
  });
  game.draw(PROMPT);
}

/**
 * Whether the section's Shadow boss has been killed (exe 3000:c4b5): the module's byte at
 * DS:c0c9, which the save calls `objective`, has one bit per section of the module.
 */
function bossIsDead(game: Game, part: number): boolean {
  return (game.pc.objective[game.pc.module] & (1 << part)) !== 0;
}
