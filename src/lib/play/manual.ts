import { resetViewCaches } from '../game/port/character';
import data from '../game/dotu-data.json';
import type { GameRules } from '../game/port/rules';
import { toUpperByte } from '../game/port/screens';
import type { Game, MonsterKind } from '../game/port/state';
import { monsterById } from '../map/stocking';
import type { Turn } from './engine';
import {
  FIRST_SECTION_MONSTER,
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
 *
 * A section below the bottom of the game has no row of MD.BIN at all. Its five monsters are
 * borrowed from sections all over the game (`src/lib/game/endless/README.md`), so the pages under
 * the letters are the pages those sections give those monsters.
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
 * twenty MD.BIN describes: which section it is, and that the five under the letters are the five
 * standing here.
 *
 * A section whose rules have a line of their own about its monsters spends the fourth line on
 * that. Four lines is what the tablet holds.
 */
function endlessIntro(section: number, note: string | null): string[] {
  const opening = [`SECTION ${section}`, 'Nobody mapped this far down. The five', 'below are what stands here.'];
  return note === null ? opening : [...opening, note];
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
  /** The section the character is standing in, whose five monsters the letters turn to: 1 to 20
   *  in the game itself, and past 20 on a floor below the bottom of it. */
  section: number;
  /** The four lines on the slab. */
  intro: string[];
}

/**
 * The section the S key shows for the floor the character is standing on, and the words the
 * screen opens on.
 *
 * A section of the game's own twenty opens on the four lines MD.BIN gives it. A section below the
 * bottom of the game has no row of MD.BIN, so the screen says what it can about it instead.
 */
export function manualOpening(game: Game): ManualOpening {
  const section = game.rules.sectionOf(game.pc.module, game.pc.level);
  const row = data.sections[section - 1];
  return {
    section,
    intro: row ? row.intro : endlessIntro(section, game.rules.sectionNote(section)),
  };
}

/**
 * The four lines of MD.BIN each of the section's five monsters is described in, in the order the
 * section's own table has them, which is the order the letters read them in.
 *
 * A section of the game's own twenty is described by its own row: twenty forty-column lines, four
 * to a monster, in slot order. A section below the bottom of the game stands five monsters
 * borrowed from sections all over the game, so each of them brings the four lines the row of the
 * section it came from gives it.
 */
export function manualPages(rules: GameRules, section: number): string[][] {
  return rules.monsterKinds(section).slice(FIRST_SECTION_MONSTER).map(monsterPage);
}

/** The four lines the monster's own section describes it in. */
function monsterPage(kind: MonsterKind): string[] {
  const origin = monsterById(kind.id).origin;
  if (origin.kind !== 'section') return [];
  const block = origin.slot - FIRST_SECTION_MONSTER;
  return data.sections[origin.section - 1].descriptions.slice(block * BLOCK_LINES, (block + 1) * BLOCK_LINES);
}

/** The S key, until the reader leaves it. */
export async function readTheMonsterManual(turn: Turn): Promise<void> {
  const game = turn.game;
  const opening = manualOpening(game);
  const pages = manualPages(game.rules, opening.section);
  let shown: string[] = opening.intro;
  for (;;) {
    drawManualPage(turn.session, opening.section, shown);
    const block = letterPressed(await game.key());
    if (block === null) break;
    shown = pages[block];
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
 * The DEAD stamp over the first panel goes up when the section's Shadow boss has already been
 * killed. The original reads the module's byte at DS:c0c9 for that (exe 3000:c4b5), which has one
 * bit per section of the module; the rules are asked here instead, and the faithful rules read
 * that same bit. A section below the bottom of the game has no bit of its own, so its rules keep
 * the kill beside the record.
 *
 * @param section the section the character is standing in, whose five monsters the panels stand.
 */
export function drawManualPage(session: ManualHost, section: number, lines: string[]): void {
  const game = session.game;
  const bossDead = game.rules.bossBeaten(game.pc, section);
  game.eraseScreen();
  session.sectionScreen = { section, lines, bossDead };
  game.draw({ ...MANUAL_LETTERS.box, ...MANUAL_LETTERS.bright, text: MANUAL_LETTERS.text, font: 1 });
  if (bossDead) game.draw({ ...MANUAL_DEAD.box, ...MANUAL_DEAD.bright, text: MANUAL_DEAD.text, font: 1 });
  lines.forEach((text, index) => {
    game.draw({ ...manualTextBox(index), ...MANUAL_TEXT.bright, text, font: 1 });
  });
  game.draw(PROMPT);
}
