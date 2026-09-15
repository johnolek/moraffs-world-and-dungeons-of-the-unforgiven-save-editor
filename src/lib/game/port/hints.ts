import { readUrollLine, type UrollFile } from './character';
import type { Rng } from './rng';
import type { GameRules } from './rules';
import uhText from '../hints/uh.bin?raw';
import uh2Text from '../hints/uh2.bin?raw';

/**
 * What the little snake says, and which file each line comes out of.
 *
 * The game keeps its spoken text in three files. UH.BIN holds 138 eight-line messages, which
 * give_hint (exe 2000:313a) reads by number into the same buffer the eight-line message box
 * uses; the snake's own lines are the ones that begin "A LITTLE SNAKE SAYS:". UH2.BIN holds 86
 * four-line messages, which tablet_message (exe 3000:931c) shows in the stone-tablet box: the
 * town greetings, the congratulations for a new level, and the section boss's taunts. The
 * numbered .uhp files are the help screens the snake called Smarty shows for F1, and they are
 * the only text of the three that carries colours.
 *
 * Every text in this module is the file's own, typos and all.
 */

/** UH.BIN's messages are eight lines each and UH2.BIN's are four. */
export const HINT_LINES = 8;
export const TABLET_LINES = 4;

/** The 138 messages of UH.BIN. The file has one stray "?" line after the last of them. */
export const HINT_COUNT = 138;

/** The 86 messages of UH2.BIN. The file has one stray "-" line after the last of them. */
export const TABLET_COUNT = 86;

/**
 * The `fopen` that give_hint (exe 2000:313a) and tablet_message (exe 3000:931c) do, for a file
 * the port has bundled rather than found on disk. Both open in text mode, which is what drops
 * the carriage returns of the DOS line endings; the bundled copies have newlines already.
 */
function openHintFile(text: string): UrollFile {
  return { text: text.replace(/\r\n/g, '\n'), position: 0 };
}

/**
 * give_hint (exe 2000:313a, unf.c "give_hint"): the eight lines of UH.BIN message `index`.
 *
 * The original walks the file from the beginning every time, throwing away eight lines per
 * message it is not being asked for, and reads the eight it wants into the same buffer at
 * DS:c694 that the eight-line message box prints from. A message number past the end of the
 * file would read the two "?" lines the file ends with and then keep asking a finished file for
 * characters, which in 1993 never returns; nothing calls it with one.
 */
export function giveHint(index: number, text: string = uhText): string[] {
  const file = openHintFile(text);
  for (let skipped = 0; skipped < index; skipped += 1) {
    for (let line = 0; line < HINT_LINES; line += 1) readUrollLine(file);
  }
  return Array.from({ length: HINT_LINES }, () => readUrollLine(file));
}

/**
 * tablet_message (exe 3000:931c, unf.c "tablet_message"): the four lines of UH2.BIN message
 * `index`, shown in the stone-tablet box.
 *
 * The original reads four lines per message from the start of the file and keeps the last four
 * it read, then pads each line with spaces out to 37 characters — which blanks whatever the
 * previous message left in the buffer, and would cut a longer line off at 37. No line in
 * UH2.BIN is that long, so nothing is ever lost. The lines come back unpadded here; the padding
 * matters only to the tablet the words are drawn on, which spreads a line across a fixed width,
 * and `src/lib/play/tablet.ts` puts it back for that.
 */
export function tabletMessage(index: number, text: string = uh2Text): string[] {
  const file = openHintFile(text);
  let lines: string[] = [];
  for (let entry = 0; entry <= index; entry += 1) {
    lines = Array.from({ length: TABLET_LINES }, () => readUrollLine(file));
  }
  return lines;
}

/**
 * The colour codes of the .uhp help screens (exe DS:2d4f, "rgbynow") and the palette entry each
 * one switches the text to, from read_help_screen (exe 3000:7c6d).
 *
 * The letters are the initials of the colours they give: r red, g green, b blue, y yellow, o
 * orange, n a golden orange and w white. The numbers are indexes into the game's 256-colour
 * palette, whose first sixteen entries are the same in all forty of the palettes the game
 * loads, so a code always comes out the same colour. The files never use w.
 */
export const HELP_COLOURS: Record<string, number> = { r: 6, g: 8, b: 3, y: 4, n: 7, o: 5, w: 15 };

/** The string of code letters read_help_screen looks a character up in (exe DS:2d4f). */
export const HELP_CODE_LETTERS = 'rgbynow';

/** The palette entry a help screen starts in, before any colour code: white. */
export const HELP_DEFAULT_COLOUR = 15;

/** One line of a help screen, with the palette entry the whole line is drawn in. */
export interface HelpLine {
  colour: number;
  text: string;
}

/**
 * read_help_screen (exe 3000:7c6d, unf.c "read_help_screen"): one .uhp help screen, page by
 * page.
 *
 * The name of the file is `<n>.uhp`, built by printing the topic number and adding ".uhp" (exe
 * DS:2d2a); the reader for USPELLS.HLP is a different function, `read_spell_help` at 2000:7a78.
 * This one walks the file a character at a time. A character
 * in "rgbynow" changes the colour and is not printed; every other character joins the line
 * being built, and a newline draws that line in whichever colour is in effect at the end of it
 * — so a code halfway through a line would recolour the whole line, though none of the files
 * does that. An 'e' ends the page, taking the half-built line it appears in with it. After the
 * page the original waits for a key and reads one more character: another 'e' ends the file,
 * and anything else (the files use 'X') is followed by one skipped character, the newline, and
 * the next page begins.
 */
export function readHelpScreen(text: string): HelpLine[][] {
  const file = openHintFile(text);
  const pages: HelpLine[][] = [];
  let colour = HELP_DEFAULT_COLOUR;
  let character = '';
  do {
    const page: HelpLine[] = [];
    let line = '';
    for (;;) {
      character = file.text[file.position] ?? '';
      file.position += 1;
      if (character === '' || character === 'e') break;
      if (HELP_CODE_LETTERS.includes(character)) {
        colour = HELP_COLOURS[character];
      } else if (character === '\n') {
        page.push({ colour, text: line });
        line = '';
      } else {
        line += character;
      }
    }
    pages.push(page);
    character = file.text[file.position] ?? '';
    file.position += 1;
    if (character !== 'e') file.position += 1;
  } while (character !== 'e' && character !== '');
  return pages;
}

/** One entry of the F1 help menu: the key that opens it and the .uhp file it opens. */
export interface HelpTopic {
  /** The key the menu line begins with, as the menu prints it. */
  key: string;
  /** The menu line itself, from the two tables of near pointers at DS:52d8 and DS:52f4. */
  label: string;
  /** The number of the .uhp file the topic reads. */
  file: number;
}

/**
 * FUN_3000_7dfc (exe 3000:7dfc, unf.c "FUN_3000_7dfc"): the menu the snake puts up for F1.
 *
 * "A little snake scurries up and says: 'Smarty is my name, and information is my game.
 * Learning means earning, so what can I do for you?'" — then two columns of fourteen lines,
 * which are the labels here. A click picks the line by its position and a key picks it by its
 * letter; both end up at the same file number, which is what the switch in the middle of the
 * function is for. The order the files come in has nothing to do with the order of the menu.
 */
export const HELP_TOPICS: HelpTopic[] = [
  { key: 'A', label: 'A-CHANGE (A)RMOR', file: 4 },
  { key: 'C', label: 'C-(C)AST SPELL OR SPELL HELP', file: 13 },
  { key: 'D', label: 'D-GO (D)OWN LADDER', file: 9 },
  { key: 'E', label: 'E-SHOW (E)XPERIENCE NEEDED', file: 12 },
  { key: 'F', label: 'F-(F)IGHT MONSTER', file: 2 },
  { key: 'G', label: 'G-(G)RAPHICS CONTROL', file: 0 },
  { key: 'I', label: 'I-USE MAGIC (I)TEM', file: 6 },
  { key: 'L', label: 'L-(L)OSE OR DROP THINGS', file: 8 },
  { key: 'M', label: 'M-(M)ONEY (FINANCIAL) STATEMENT', file: 5 },
  { key: 'O', label: 'O-(O)PTIONS MENU', file: 16 },
  { key: 'P', label: 'P-CHECK (P)OCKETS (INVENTORY)', file: 14 },
  { key: 'Q', label: 'Q-(Q)UIT AND SAVE CHARACTER', file: 1 },
  { key: 'S', label: 'S-(S)ECTION MONSTER INFORMATION', file: 11 },
  { key: 'U', label: 'U-CLIMB (U)P LADDER', file: 10 },
  { key: 'V', label: 'V-VIEW YOUR (V)ITAL STATS', file: 7 },
  { key: 'W', label: 'W-SELECT (W)EAPON FOR ATTACKING', file: 3 },
  { key: 'X', label: 'X-E(X)PAND THE MAP', file: 17 },
  { key: 'Z', label: 'Z-(Z)OOM IN ON FORWARD VIEW', file: 15 },
  { key: '0', label: '0-OBJECTIVE, (MEANING OF LIFE)', file: 20 },
  { key: '1', label: '1-MOVING AROUND THE DUNGEON', file: 21 },
  { key: '2', label: '2-GENERAL PLAY OF GAME', file: 22 },
  { key: '3', label: "3-VISITOR'S GUIDE TO THE TOWN", file: 23 },
  { key: '4', label: '4-SPELLS, SCROLLS, WANDS, PAPER', file: 24 },
  { key: '5', label: '5-HOW TO USE MAGIC ITEMS', file: 25 },
  { key: '6', label: '6-GENERAL HINTS FOR SUCCESS', file: 26 },
  { key: '7', label: "7-MORAFF'S SPECIAL SECRET HINTS", file: 27 },
  { key: '8', label: '8-TOP SECRET HINTS NO ONE KNOWS', file: 28 },
  { key: '9', label: '9-HISTORY OF THIS UNIVERSE', file: 29 },
];

const helpFiles = import.meta.glob('../hints/*.uhp', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** The .uhp files the game folder holds, in number order. There is no 19.uhp. */
export const HELP_FILES: number[] = Object.keys(helpFiles)
  .map((path) => Number(path.replace('../hints/', '').replace('.uhp', '')))
  .sort((a, b) => a - b);

/** The text of one .uhp file, as read_help_screen would read it. */
export function helpScreen(file: number): HelpLine[][] {
  const text = helpFiles[`../hints/${file}.uhp`];
  if (text === undefined) throw new Error(`no ${file}.uhp`);
  return readHelpScreen(text);
}

/**
 * FUN_2000_31bc (exe 2000:31bc, unf.c "FUN_2000_31bc"): the hint for arriving on a floor, or
 * null for the floors that get none.
 *
 * movecontrol calls this every time the floor changes by ladder or trap door. Arriving in the
 * town of module I always gets hint 102, the one that explains the coloured squares. Arriving
 * on the floor a section's boss lives on gets that section's warning, but only while the boss
 * is still alive: the game keeps one byte per module with a bit per section, and the warning is
 * given while the bit is clear. Otherwise there is a one in twelve chance of one of the eight
 * general hints, 8 to 15, picked at random.
 *
 * The boss warnings are not stored in section order. Sections 0 to 7 — modules I and II — take
 * hints 0 to 7, and the twelve sections of modules III to V take hints 126 to 137, which is
 * what the section number plus 118 in the code works out to.
 */
export function hintOnArrival(module: number, floor: number, bossesKilled: number, rng: Rng): number | null {
  if (module === 0 && floor === 0) return 102;
  const warning = bossWarningHint(module, floor, bossesKilled);
  if (warning !== null) return warning;
  if (rng.random(12) !== 1) return null;
  return 8 + rng.random(8);
}

/**
 * FUN_2000_31bc (exe 2000:31bc, unf.c "FUN_2000_31bc"), the part of it that warns about a
 * section boss: the hint for arriving on a boss's floor with that boss still alive, or null.
 *
 * `bossesKilled` is the module's byte at DS:c0c9 + module, whose low four bits say which of the
 * module's four bosses are dead. The original writes the four floors out as four comparisons
 * per module rather than working them out, so the floors are exactly 5, 10, 15 and 20 times one
 * more than the module index.
 */
export function bossWarningHint(module: number, floor: number, bossesKilled: number): number | null {
  for (let part = 0; part < 4; part += 1) {
    if (floor !== (module + 1) * 5 * (part + 1)) continue;
    if ((bossesKilled & (1 << part)) !== 0) return null;
    const section = module * 4 + part;
    return section < 8 ? section : section + 118;
  }
  return null;
}

/** The eight general hints of UH.BIN that FUN_2000_31bc picks one of at random. */
export const GENERAL_HINTS = [8, 9, 10, 11, 12, 13, 14, 15];

/**
 * FUN_3000_9488 (exe 3000:9488, unf.c "FUN_3000_9488"): the tablet for reaching the town, or
 * null when the player has been too deep for the game to have anything to say.
 *
 * load_level_map shows this on arriving at floor 0, and what it picks by is not the character's
 * level but the deepest floor they have reached — the running maximum at DS:c179, which
 * movecontrol raises to the current floor on every pass round its loop. That address is inside
 * the character record, at offset 0x8f9 of the block save_player writes, so the maximum goes to
 * disk and comes back with the character.
 */
export function townTablet(deepestFloor: number): number | null {
  const thresholds = [4, 8, 12, 16, 20, 30, 40, 60, 80, 100];
  const step = thresholds.findIndex((threshold) => deepestFloor < threshold);
  return step === -1 ? null : step;
}

/**
 * level_up_screen (exe 3000:955f, unf.c "level_up_screen"): the tablet for the level gained by
 * a night at the inn, or null from level 80 up.
 *
 * flea_inn shows this after the night has been paid for and the level gained, so the level it
 * reads is the new one. The last three of its fourteen tablets do not fit what they are used
 * for: 21 has the snake cowering as you leave the inn, and 22 and 23 have you leaving the
 * temple, which the inn is not.
 */
export function innTablet(level: number): number | null {
  const thresholds = [2, 4, 6, 8, 12, 16, 20, 25, 30, 40, 50, 60, 70, 80];
  const step = thresholds.findIndex((threshold) => level < threshold);
  return step === -1 ? null : 10 + step;
}

/**
 * flea_inn (exe 2000:4fe7, unf.c "flea_inn"): the sign the inn greets you with, which is a
 * different inn in each module — the Hell Hole, the Slacker, the Flea Bag, the Motel 6.5 and
 * Moraff's own — and so hints 16 to 20.
 */
export function innSignHint(module: number): number {
  return 16 + module;
}

/**
 * boss_office_message (exe 3000:6c9d, unf.c "boss_office_message"): the taunt the section boss
 * sends, for a section and the number of its taunts already read.
 *
 * The snake brings it: seeing the section's boss offers hint 123, "A LITTLE SNAKE HAS A MESSAGE
 * FROM THE VAST DEPTHS OF THE DUNGEON", and reading it opens the tablet with the boss's picture
 * and "A MESSAGE FROM THE OFFICE OF". Module I's four sections have three taunts each, tablets
 * 24 to 35, and the game counts how many of a section's the player has read; every other
 * section has one, tablets 36 to 51, shown once.
 */
export function bossTablet(section: number, taunts: number): number | null {
  if (section < 4) return taunts < 3 ? 24 + section * 3 + taunts : null;
  return taunts === 0 ? 32 + section : null;
}

/** section_number (exe 2000:1d23, unf.c "section_number"): the section a floor is in, 0 to 19. */
export function sectionNumber(rules: GameRules, module: number, floor: number): number {
  return rules.sectionOf(module, floor) - 1;
}

/**
 * roll_char (exe 3000:4c9a, unf.c "roll_char"): the tablet a new character is welcomed with,
 * one per class, tablets 52 to 58 in the order the class menu takes.
 */
export function classTablet(classIndex: number): number {
  return 52 + classIndex;
}

/** One message of one of the three files, as the page lists them. */
export interface HintEntry {
  /** The file the message is in, as the game folder names it. */
  file: string;
  /** The message's number within its file, which is what the game asks for it by. */
  index: number;
  /** The message's lines, with the colour each is drawn in where the file gives one. */
  lines: HelpLine[];
}

/** Every message of UH.BIN, UH2.BIN and the .uhp help screens, in file and number order. */
export function allHints(): HintEntry[] {
  const plain = (lines: string[]): HelpLine[] =>
    lines.map((text) => ({ colour: HELP_DEFAULT_COLOUR, text }));
  const hints: HintEntry[] = Array.from({ length: HINT_COUNT }, (unused, index) => ({
    file: 'uh.bin',
    index,
    lines: plain(giveHint(index)),
  }));
  const tablets: HintEntry[] = Array.from({ length: TABLET_COUNT }, (unused, index) => ({
    file: 'uh2.bin',
    index,
    lines: plain(tabletMessage(index)),
  }));
  const screens: HintEntry[] = HELP_FILES.flatMap((file) =>
    helpScreen(file).map((page, index) => ({ file: `${file}.uhp`, index, lines: page })),
  );
  return [...hints, ...tablets, ...screens];
}
