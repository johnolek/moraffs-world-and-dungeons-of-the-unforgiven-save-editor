import spellsHelp from '../uspells.hlp?raw';
import type { CastSource } from '../action';
import { giveHint } from './hints';
import { spellEffect } from './magic';
import {
  clearMessageLine,
  clearStatsScreen,
  clearToBlack,
  drawMenu,
  ESCAPE,
  MENU_X,
  MESSAGE_LINE_Y,
  toUpperByte,
  viewBattleSpells,
} from './screens';
import type { MenuChoice } from './screens';
import type { Game, PlayerCharacter } from './state';

// The message text is the exact bytes of the game's own strings, read out of the data segment of
// the unpacked executable. The comment on each drawn line gives the address of every string it
// prints, in order; dotu-tools/reference/scripts/exe_strings.py reads them back.

/** Casting out of the character's own head. Only these cost spell points. */
export const CAST_SPELLBOOK = 1;
/** Reading a scroll, which is used up. */
export const CAST_SCROLL = 2;
/** Pointing a wand, which loses a charge. */
export const CAST_WAND = 3;
/** Using a sheet of spell paper, which is used up. This is all a fighter can do. */
export const CAST_PAPER = 4;

/**
 * The 120 spell names the menus print (exe DS:5310, four tables of thirty near pointers), by
 * list and then by `level * 3 + slot`.
 *
 * These are not quite the names `dotu-data.json` carries: that file takes its names from the
 * first line of each entry of USPELLS.HLP, and five of them read differently there — the exe has
 * ANTI-MAGIC RING LEVEL 1, WRITE SCROLL - LEVEL 10, LIGHTNING, MAGIC MISSLE and a HOLD MONSTER
 * with nothing after it. The menu prints these.
 */
export const SPELL_MENU_NAMES: string[][] = [
  [
    'ENCHANT WEAPON LEVEL 1', 'EXTRA HEALTH POINT', 'WRITE SCROLL TO LEVEL 3',
    'ENCHANT ARMOR LEVEL 1', 'EXTRA 3 HEALTH POINTS', 'ENCHANT WAND LEVEL 3',
    'ENCHANT WEAPON LEVEL 2', 'EXTRA 5 HEALTH POINTS', 'ENCHANT RING LEVEL 1',
    'ENCHANT ARMOR LEVEL 2', 'ANTI-MAGIC RING LEVEL 1', 'WRITE SCROLL - LEVEL 10',
    'ENCHANT WEAPON LEVEL 3', 'ENCHANT RING LEVEL 2', 'BODY ARMOR LEVEL 1',
    'ENCHANT ARMOR LEVEL 3', 'ANTI-MAGIC RING LEVEL 2', 'ENCHANT WAND LEVEL 8',
    'ENCHANT RING LEVEL 3', 'ANTI-MAGIC RING LEVEL 3', 'BODY ARMOR LEVEL 2',
    'ENCHANT WEAPON LEVEL 4', 'ENCHANT ARMOR LEVEL 4', 'ENCHANT WAND ANY LEVEL',
    'PERMANENT FEATHER', 'ANTI-MAGIC RING LEVEL 5', 'EXTRA 25 HEALTH POINTS',
    'PERMANENT INVISIBILITY', 'YOUTH', 'BODY ARMOR LEVEL 4',
  ],
  [
    'ENCHANT ARMOR LEVEL 1', 'ENCHANT WEAPON LEVEL 1', 'LITTLE CURE',
    'ENCHANT WEAPON LEVEL 2', 'RELOCATE', 'DETECT LEVEL',
    'CURE', 'ENCHANT ARMOR LEVEL 2', 'STRENGTH',
    'ENCHANT WEAPON LEVEL 3', 'AGILITY', 'DESCEND',
    'ASCEND', 'DETECT POSITION', 'FEATHER',
    'BIG CURE', 'DOUBLE ASCEND', 'ENCHANT WEAPON LEVEL 4',
    'INVISIBILITY', 'ENCHANT ARMOR LEVEL 3', 'FAST MOVE',
    'SUPER STRENGTH', 'ENCHANT WEAPON LEVEL 5', 'MAJOR DESCEND',
    'SUPER AGILITY', 'CURE POISON', 'HEAL ALL WOUNDS',
    'MAJOR ASCEND', 'CURE DISEASE', 'ENCHANT ARMOR LEVEL 4',
  ],
  [
    'SLEEP', 'MAGIC ZAP', 'MINOR PROTECTION',
    'SLOW ENEMIES', 'STRENGTH', 'MINOR SHOCK',
    'LIGHTNING', 'MAGIC MISSLE', 'SPEED',
    'GO AWAY', 'RELOCATE', 'POWER WEAPON I',
    'MINOR EXPLOSION', 'PROTECTION', 'RESIST POISON',
    'MAGIC ZOT', 'SHOCK', 'ANTI-COLD',
    'EXPLOSION', 'PASS WALL', 'ANTI-FIRE',
    'MAGIC BOLT', 'RESIST LEVEL DRAIN', 'POWER WEAPON II',
    'HOLD MONSTER', 'DRAIN MONSTER', 'MAJOR SHOCK',
    'MAJOR EXPLOSION', 'AUTOKILL', 'POWER WEAPON III',
  ],
  [
    'SLEEP', 'MINOR PROTECTION', 'STRENGTH',
    'RESIST POISON', 'SPEED', 'FAST CURE',
    'RESIST DISEASE', 'RELOCATE', 'SLOW ENEMIES',
    'ANTI-COLD', 'GO AWAY', 'POWER WEAPON I',
    'PROTECTION', 'ANTI-FIRE', 'PASS WALL',
    'RESIST LEVEL DRAIN', 'DRAIN MONSTER', 'FAST BIG CURE',
    'HOLD MONSTER', 'POWER WEAPON II', 'SHOCK',
    'MAJOR PROTECTION', 'EXPLOSION', 'MAGIC ZOT',
    'AUTOKILL', 'POWER WEAPON III', 'STRENGTH AND SPEED',
    'ULTRA PROTECTION', 'FAST HEAL', 'MAJOR SHOCK',
  ],
];

/**
 * The eight lines of cast_a_spell's first menu (exe DS:2507): the four spell lists, and then the
 * same four again for reading a spell's description instead of casting it.
 */
export const CAST_TYPE_MENU = [
  '1) PERMANENT SPELLS',
  '2) PREPARATION SPELLS',
  '3) WIZARD BATTLE SPELLS',
  '4) PRIEST BATTLE SPELLS',
  '5) HELP-PERMANENT SPELLS',
  '6) HELP-PREPARATION SPELLS',
  '7) HELP-WIZARD BATTLE SP.',
  '8) HELP-PRIEST BATTLE SP.',
];

/** What a spell menu prints in place of a spell the character does not have (exe DS:1f65). */
export const NOT_YET_FOUND = 'NOT YET FOUND';

/** The classes that may cast wizard spells out of a book: Monk, Wizard, Sage and Mage. */
export const WIZARD_CLASSES = [2, 3, 5, 6];

/** The classes that may cast priest spells out of a book: Worshipper, Monk, Priest and Sage. */
export const PRIEST_CLASSES = [1, 2, 4, 5];

/**
 * The 180 counts one of the four sources keeps, indexed `type * 45 + level * 3 + slot`. The
 * spellbook holds a flag per spell and the other three hold how many are left — a wand's are its
 * charges, which is why a wand run down to nothing reads as a spell the character has not found.
 */
export function spellsOwned(pc: PlayerCharacter, source: number): number[] {
  if (source === CAST_SPELLBOOK) return pc.spellbook;
  if (source === CAST_SCROLL) return pc.scrolls;
  if (source === CAST_WAND) return pc.wands;
  return pc.papers;
}

/** Where a spell sits in one of those 180-long arrays. */
export function spellIndex(type: number, level: number, slot: number): number {
  return type * 45 + level * 3 + slot;
}

/** Which of the four places a spell was cast from, as the run's own record of a cast names it. */
function castSource(source: number): CastSource {
  if (source === CAST_SCROLL) return 'scroll';
  if (source === CAST_WAND) return 'wand';
  if (source === CAST_PAPER) return 'paper';
  return 'spellPoints';
}

/**
 * How much of a source a spell has left: 1 or 0 out of the spellbook, and the scrolls, charges or
 * sheets of paper for the other three.
 */
export function spellCharges(
  pc: PlayerCharacter,
  source: number,
  type: number,
  level: number,
  slot: number,
): number {
  return spellsOwned(pc, source)[spellIndex(type, level, slot)];
}

/**
 * What casting a spell out of the character's own head costs, in spell points: its level. A
 * scroll, a wand and a sheet of paper cost none — cast_a_spell only takes spell points off when
 * the source is the spellbook. `level` is the line of the book, 0 for the level 1 line.
 */
export function spellCost(level: number): number {
  return level + 1;
}

/** The prompt over the type menu, one per source (exe DS:1fb9 1fd3 1fee 2007). */
const CAST_PROMPTS = [
  'SELECT THE TYPE OF SPELL:',
  'SELECT THE TYPE OF SCROLL:',
  'SELECT THE TYPE OF WAND:',
  'SELECT THE TYPE OF PAPER:',
];

/**
 * cast_a_spell (exe 2000:e017, unf.c "cast_a_spell"), its first screen: the menu of the four
 * spell lists and the four help lists.
 *
 * A fighter is turned away before the menu goes up, because papers are the one thing they can
 * use and the paper menu is reached by a key of its own. The caller reads a key over the menu and
 * hands it to `gmenuChoice(1, 8, key)`; escape gives up on the spell, and a line 1 to 8 is a list
 * to go on to, which is what {@link castTypeAllowed} then judges.
 *
 * @returns false when the fighter refusal was printed and there is no menu.
 */
export function drawCastTypeMenu(game: Game, source: number): boolean {
  if (source !== CAST_PAPER && game.pc.cls === 0) {
    // DS:1f73 1f8a 1fa2
    game.say('FIGHTERS CAN ONLY CAST', '  SPELLS BY USING MAGIC', '  PAPER. KEEP LOOKING.');
    return false;
  }
  clearMessageLine(game);
  const prompt = CAST_PROMPTS[source - 1];
  game.draw({ text: prompt, x: MENU_X, y: MESSAGE_LINE_Y, font: 0, colour: 8 });
  drawMenu(game, CAST_TYPE_MENU);
  return true;
}

/**
 * cast_a_spell (exe 2000:e017, unf.c "cast_a_spell"), the three tests it makes on the list that
 * was picked. `type` is the menu line less one, so 0 to 3 are the four lists and 4 to 7 are the
 * same four for help.
 *
 * A permanent spell takes a month and cannot be cast below the town; a preparation spell takes
 * three minutes and cannot be cast with a monster engaged. Both of those hold for every source.
 * The class test only holds for the spellbook, so a fighter's sheet of paper casts a wizard spell
 * and a priest's wand casts one too — and because it names the two help lists as well as the two
 * spell lists, a wizard reading out of their own book cannot even look up what a priest spell
 * does.
 *
 * @returns false when a refusal was printed and the spell is over.
 */
export function castTypeAllowed(game: Game, source: number, type: number): boolean {
  if (type === 0 && game.pc.level !== 0) {
    // DS:2021 203d 2057
    game.say('THESE SPELLS TAKE ONE MONTH', '   TO CAST AND CAN NOT BE', '   USED IN THE DUNGEON.');
    return false;
  }
  if (type === 1 && game.engaged !== -1) {
    // DS:206f 208b 20a4
    game.say('THESE SPELLS TAKE 3 MINUTES', '   TO CAST. THIS CAN NOT', '   BE DONE DURING BATTLE.');
    return false;
  }
  const wizard = (type === 2 || type === 6) && !WIZARD_CLASSES.includes(game.pc.cls);
  const priest = (type === 3 || type === 7) && !PRIEST_CLASSES.includes(game.pc.cls);
  // The original writes this test as a source below 2, and 1 is the only source below 2.
  if (source === CAST_SPELLBOOK && (wizard || priest)) {
    // DS:20be 20da
    game.say('YOU ARE UNABLE TO CAST THIS', '   TYPE OF SPELLS.');
    return false;
  }
  return true;
}

/** How far into the line print_spell_line pads each of the three spells out to (exe 2000:df3e). */
const SPELL_LINE_COLUMNS = [0x1b, 0x35, 0x4f];

/**
 * FUN_2000_df0e (exe 2000:df0e): pad a line out with spaces to a column, and cut it off there if
 * it has already run past it.
 */
function padToColumn(text: string, column: number): string {
  return text.padEnd(column).slice(0, column);
}

/**
 * print_spell_line (exe 2000:df3e, unf.c "print_spell_line"): one line of the spell menu, which
 * is three spells side by side.
 *
 * Each spell is its key's prefix and then its name, or NOT YET FOUND where the character has none
 * of it, padded out to column 27, 53 and 79. The padding truncates as well as pads, so the third
 * spell of a line is cut at 79 characters however long its name is; none of the game's names is
 * long enough for that to show.
 */
export function printSpellLine(prefixes: string[], names: string[], owned: number[]): string {
  let line = '';
  for (let column = 0; column < 3; column += 1) {
    line += prefixes[column] + (owned[column] === 0 ? NOT_YET_FOUND : names[column]);
    line = padToColumn(line, SPELL_LINE_COLUMNS[column]);
  }
  return line;
}

/** The keys the spell menu takes, left to right and top to bottom: A to Z and then 1 to 4. */
export const SPELL_MENU_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234';

/**
 * cast_a_spell (exe 2000:e017): which of the thirty spells a key picks, before the menu asks
 * whether the character has it.
 *
 * The key is upper-cased, a digit 1 to 4 is pushed up by 0x2a so that it lands after Z, and 'A'
 * is taken off. Nothing checks that what is left is a letter, so the four keys between Z and the
 * shifted digits — '[', '\', ']' and '^' — pick the last four spells as well.
 */
export function spellMenuIndex(key: number): number {
  let code = toUpperByte(key);
  if (code > 0x30 && code < 0x35) code += 0x2a;
  return code - 0x41;
}

/** The prefix in front of each of the three spells on a line, in the big menu (exe DS:2205). */
const LARGE_PREFIXES = Array.from({ length: 10 }, (unused, row) =>
  [0, 1, 2].map((column) => {
    const key = SPELL_MENU_KEYS[row * 3 + column];
    return column === 0 ? `${key})` : ` ${key})`;
  }),
);

/**
 * The prefix in front of each of the three spells on a line, in the miniature menu (exe DS:217d
 * and DS:2180). It carries no key: the miniature menu draws the thirty letters separately, in the
 * big font, in a grid of its own beside the names.
 */
const MINI_PREFIXES = [' )', '  )', '  )'];

/** Where the big menu puts each of its ten lines. The steps are not quite even. */
const LARGE_ROW_Y = [0x28, 0x4f, 0x76, 0x9d, 0xc4, 0xea, 0x114, 0x13b, 0x162, 0x188];

/** The three columns the miniature menu draws its letters in. */
const MINI_LETTER_X = [0x39c, 0x488, 0x564];

/** The ten spell names of one list, three at a time. */
function spellRows(type: number): string[][] {
  return Array.from({ length: 10 }, (unused, row) => SPELL_MENU_NAMES[type].slice(row * 3, row * 3 + 3));
}

/** How much of each of one list's thirty spells the character has, three at a time. */
function ownedRows(game: Game, source: number, type: number): number[][] {
  const owned = spellsOwned(game.pc, source);
  return Array.from({ length: 10 }, (unused, row) =>
    [0, 1, 2].map((slot) => owned[spellIndex(type, row, slot)]),
  );
}

/**
 * cast_a_spell (exe 2000:e017, unf.c "cast_a_spell"), its second screen in the big layout: the
 * thirty spells of one list over the whole screen.
 *
 * The heading is one of three: the spellbook says what a spell costs, a spellbook's help list
 * says to press a key for a description, and the other three sources just say to pick one. The
 * line under the table explains the cost, and the last line offers the miniature layout — only
 * where the video mode is wide enough to have one, which the port always is.
 *
 * The table is drawn on black. cast_a_spell fills the top 0x21c of the screen with colour 0
 * before it prints a word (exe 2000:ee34), which takes the key menu, the zoom map and the top of
 * the big 3-D view with it and leaves the battle spells, the status block and the message box
 * standing.
 */
function drawLargeSpellList(game: Game, source: number, type: number): void {
  clearToBlack(game, 0, 0, 0x640, 0x21c);
  game.draw({ text: castHeading(source, type), x: 0, y: 0, font: 0, colour: 4 });
  // DS:2176
  game.draw({ text: 'ESCAPE', x: 0x5be, y: 0, spreadTo: 0x63f, font: 0, colour: 3 });
  const names = spellRows(type % 4);
  const owned = ownedRows(game, source, type % 4);
  LARGE_ROW_Y.forEach((y, row) => {
    const text = printSpellLine(LARGE_PREFIXES[row], names[row], owned[row]);
    game.draw({ text, x: 0, y, spreadTo: 0x640, font: 0, colour: 8 });
  });
  // DS:2184
  const note = 'SPELLS ON LINE 1 USE 1 SPELL POINT, ON LINE 3 THEY USE 3, LINE 7 USE 7, ETC.';
  game.draw({ text: note, x: 0, y: 0x1b0, spreadTo: 0x640, font: 0, colour: 6 });
  // DS:2273
  const switchTo = '5) SWITCH TO THE HIGH SPEED MINIATURE SPELL MENU MODE';
  game.draw({ text: switchTo, x: 100, y: 0x1e2, spreadTo: 0x5dc, font: 0, colour: 6 });
}

/**
 * cast_a_spell (exe 2000:e017, unf.c "cast_a_spell"), its second screen in the miniature layout:
 * the same thirty spells squeezed into the menu column.
 *
 * The names carry no keys here. The thirty letters are drawn on top of them in the big font, in a
 * grid of three columns, three units above the line of names they belong to.
 *
 * This one is drawn on black as well: the fill at exe 2000:e26e takes the whole message column,
 * the bar over the box included, and the list goes where the box was.
 */
function drawMiniSpellList(game: Game, source: number, type: number): void {
  clearToBlack(game, 0x398, 0x2ff, 0x640, 0x4b0);
  game.draw({ text: castHeading(source, type), x: 0x39c, y: 0x301, font: 1, colour: 4 });
  // DS:2176
  game.draw({ text: 'ESCAPE', x: 0x5e6, y: 0x301, spreadTo: 0x63f, font: 1, colour: 3 });
  const names = spellRows(type % 4);
  const owned = ownedRows(game, source, type % 4);
  names.forEach((row, index) => {
    const text = printSpellLine(MINI_PREFIXES, row, owned[index]);
    game.draw({ text, x: MENU_X, y: index * 0x25 + 0x326, spreadTo: 0x640, font: 1, colour: 15 });
  });
  names.forEach((unused, row) => {
    MINI_LETTER_X.forEach((x, column) => {
      const text = SPELL_MENU_KEYS[row * 3 + column];
      game.draw({ text, x, y: row * 0x25 + 0x323, font: 2, colour: 8 });
    });
  });
  // DS:21db
  const switchTo = '5) SWITCH TO LARGE, SLOW, CAST SPELL MENU';
  game.draw({ text: switchTo, x: 0x39c, y: 0x48c, spreadTo: 0x63b, font: 2, colour: 6 });
}

/** The line over the spell table, which says what the list is for (exe DS:2110 2145 20ed). */
function castHeading(source: number, type: number): string {
  if (source !== CAST_SPELLBOOK) return 'SELECT A SPELL FROM THE FOLLOWING:';
  if (type < 4) return 'SELECT A SPELL-SPELLS USE ONE SPELL POINT PER LEVEL:';
  return 'PRESS A LETTER OR A NUMBER TO GET A DESCRIPTION:';
}

/**
 * cast_a_spell (exe 2000:e017, unf.c "cast_a_spell"), its second screen: the thirty spells of one
 * list, in whichever of the two layouts the character last chose.
 *
 * `mini` is the flag at DS:041b, which the game keeps per character at save offset 0x975 and only
 * loads and saves at all on a screen wider than 1000 of its own units. The port takes it as an
 * argument so that nothing has to be added to the character record for it.
 */
export function drawSpellList(game: Game, source: number, type: number, mini = false): void {
  if (mini) drawMiniSpellList(game, source, type);
  else drawLargeSpellList(game, source, type);
}

/** What a key does to the spell table. */
export type SpellListChoice =
  /** One of the thirty spells, as `level * 3 + slot`. */
  | { kind: 'spell'; index: number; level: number; slot: number }
  /** Escape: the spell is given up on. */
  | { kind: 'escape' }
  /** '5': the other of the two layouts. The original hands back 0 the same way an escape does. */
  | { kind: 'switchLayout' }
  /** A key the original goes on waiting past, a spell the character does not have included. */
  | { kind: 'ignored' };

/**
 * cast_a_spell (exe 2000:e017, unf.c "cast_a_spell"), the half of it that reads the spell table.
 *
 * A spell the character has none of is ignored, which is what keeps NOT YET FOUND from being
 * cast. Switching layouts ends the spell as well as changing the menu: the original returns from
 * cast_a_spell with the flag flipped, so the player has to press the key again to see the list.
 */
export function spellListChoice(
  game: Game,
  source: number,
  type: number,
  key: number,
): SpellListChoice {
  if (key === ESCAPE) return { kind: 'escape' };
  if (key === 0x35) return { kind: 'switchLayout' };
  const index = spellMenuIndex(key);
  if (index < 0 || index > 29) return { kind: 'ignored' };
  const level = Math.trunc(index / 3);
  const slot = index % 3;
  if (spellCharges(game.pc, source, type % 4, level, slot) === 0) return { kind: 'ignored' };
  return { kind: 'spell', index, level, slot };
}

/** What casting a spell cost, and what the battle-spell panel now has showing. */
export interface CastResult {
  /**
   * The seconds of game time the spell took, which movecontrol turns into moments. A battle spell
   * takes 10 and a preparation spell 100; a permanent spell takes 0x8d00, ten hours, however
   * firmly the menu says it takes a month. A spell that moved the character to another floor
   * takes 1, and one that did nothing takes none.
   */
  seconds: number;
  /** The twelve flags view_battle_spells now has showing, for the next call to it. */
  battleSpellsShown: boolean[];
}

/**
 * cast_a_spell (exe 2000:e017, unf.c "cast_a_spell"), what it does once a spell has been picked:
 * the spell point check, the spell itself, and what it costs the character afterwards.
 *
 * The spell runs before anything is paid for it, and a spell that gives up — no monster engaged,
 * the effect already standing — costs nothing at all. Only the spellbook spends spell points; the
 * other three sources spend a scroll, a charge or a sheet. A permanent spell cast out of the book
 * takes its level off the character's maximum spell points as well, which is the price of making
 * it permanent.
 *
 * `type` is 0 to 3. The four help lists, 4 to 7, never reach here: their spell is shown by the
 * help screen instead, which is also why the original's spell point check lets a list above 3
 * past without asking.
 */
export function castSpell(
  game: Game,
  source: number,
  type: number,
  level: number,
  slot: number,
  battleSpellsShown: boolean[] = [],
): CastResult {
  const pc = game.pc;
  const floorBefore = pc.level;
  if (source === CAST_SPELLBOOK && spellCost(level) > pc.sp) {
    // DS:22a9 22c0 22d8
    game.say('YOU DO NOT HAVE ENOUGH', '   SPELL POINTS TO CAST', '   THIS SPELL.');
    return { seconds: 0, battleSpellsShown };
  }
  // spell_effect pushes what the spell did as it does it, and a spell that refused itself is no
  // cast at all, so the cast is only known to have happened once it comes back true. Its own
  // event goes in where the spell started rather than after it, so that a journal reads the
  // cast and then what it did.
  const beforeTheSpell = game.events.length;
  if (!spellEffect(game, type, level, slot)) return { seconds: 0, battleSpellsShown };
  game.events.splice(beforeTheSpell, 0, {
    kind: 'cast',
    spell: {
      game: 'unforgiven',
      type,
      level,
      slot,
      source: castSource(source),
      name: SPELL_MENU_NAMES[type][level * 3 + slot],
    },
  });
  const shown = viewBattleSpells(game, battleSpellsShown);
  if (source === CAST_SPELLBOOK) pc.sp -= spellCost(level);
  else spellsOwned(pc, source)[spellIndex(type, level, slot)] -= 1;
  if (pc.level !== floorBefore) return { seconds: 1, battleSpellsShown: shown };
  if (type === 0) {
    if (source === CAST_SPELLBOOK) pc.maxSp -= spellCost(level);
    return { seconds: 0x8d00, battleSpellsShown: shown };
  }
  return { seconds: type === 1 ? 100 : 10, battleSpellsShown: shown };
}

/** Records in USPELLS.HLP: one for every spell in the game, in the same order as the menus. */
export const SPELL_HELP_RECORDS = 120;

/** The eight lines the message box has room for, which is all show_spell_help fills. */
export const SPELL_HELP_LINES = 8;

/**
 * read_spell_help (exe 2000:7a78, unf.c "read_spell_help") and show_spell_help (exe 3000:a023,
 * unf.c "show_spell_help"): the description of one spell, split into the lines the message box
 * prints.
 *
 * read_spell_help opens USPELLS.HLP in text mode and reads characters into a buffer until it
 * meets a '~', turning every newline on the way into a '@'; it does that once per record from the
 * beginning of the file and stops at record 119. Text mode is what drops the carriage returns of
 * the file's DOS line endings, so the mirrored copy has newlines.
 *
 * show_spell_help then copies that buffer into the eight line buffers, starting at its *second*
 * character and breaking a line at every '@'. That second character is why every record but the
 * first begins with the newline that ended the record before it, and why record 0 begins with a
 * space: the file is written so that the character being skipped is never part of the text.
 * Moraff's World does the same thing with the same file, which `mwSpellHelp` in `mw-port` ports.
 *
 * Nothing stops a record of more than eight lines from running off the end of the buffers; no
 * record in the file has more than four.
 */
export function spellHelp(record: number, text: string = spellsHelp): string[] {
  if (record < 0 || record >= SPELL_HELP_RECORDS) throw new Error(`no spell record ${record}`);
  return text.split('~')[record].slice(1).split('\n');
}

/**
 * Which record of USPELLS.HLP a spell's description is: `type * 30 + level * 3 + slot`, which is
 * how show_spell_help (exe 3000:a023) is called with the three numbers the menu holds.
 */
export function spellHelpRecord(type: number, level: number, slot: number): number {
  return type * 30 + level * 3 + slot;
}

/**
 * cast_a_spell (exe 2000:e017, unf.c "cast_a_spell"), what the four help lists do with the spell
 * that was picked: put its description down the menu column and wait for a key.
 *
 * `type` is 0 to 3 — the original works it out as the menu line less five, so the help list for
 * wizard spells shows a wizard spell's description. The caller reads the key and hands it to
 * `anyKeyChoice`, which takes whatever it is.
 */
export function showSpellHelp(game: Game, type: number, level: number, slot: number): void {
  const lines = spellHelp(spellHelpRecord(type, level, slot));
  clearMessageLine(game);
  // DS:22e7
  const prompt = 'HIT A KEY WHEN FINISHED';
  game.draw({ text: prompt, x: MENU_X, y: MESSAGE_LINE_Y, font: 0, colour: 8 });
  drawMenu(game, lines);
}

/** Which of UH.BIN's messages the pockets screen opens with (exe: give_hint(0x5b)). */
export const POCKETS_HINT = 91;

/**
 * The five lines of that menu, as get_choice numbers them. The first four are the same four
 * sources cast_a_spell numbers, in the same order, so a line of this menu is a source as it
 * stands: the switch behind it hands FUN_3000_71e6 the spellbook at DS:b9f7, the scrolls at
 * DS:baab, the wands at DS:bb5f and the paper at DS:bc13.
 */
export const POCKETS_SPELLBOOKS = 1;
export const POCKETS_SCROLLS = 2;
export const POCKETS_WANDS = 3;
export const POCKETS_PAPERS = 4;
export const POCKETS_MAGIC_ITEMS = 5;

/**
 * FUN_3000_7545 (exe 3000:7545), its first screen: the menu the P key opens.
 *
 * The lines are message 91 of UH.BIN rather than strings in the executable, which is why they
 * read as a question — "WHICH DO YOU WISH TO SEE?" and then the five things. give_hint (exe
 * 2000:313a) draws them down the menu column exactly as a menu's own lines are drawn. The caller
 * reads a key and hands it to `getChoice(1, 5, key)`; anything else closes the screen.
 */
export function drawPocketsMenu(game: Game): void {
  drawMenu(game, giveHint(POCKETS_HINT));
}

/**
 * FUN_3000_71e6 (exe 3000:71e6), one of its two pages: thirty rows, each the level of a line of
 * the book and the two lists' spells for that place on it.
 *
 * Page 0 is the permanent and preparation lists and page 1 the wizard and priest ones. A row is
 * drawn whatever the character has; the spell's name only appears where they have some of it, so
 * a row can be a level number and nothing else. The colour runs 6, 7, 8 and round again with the
 * level, so each line of three shares one.
 *
 * `source` is which of the four arrays is being looked at, and the two pages are drawn one after
 * the other with a wait for a key between them.
 */
export function drawSpellInventoryPage(game: Game, source: number, page: number): void {
  game.eraseScreen();
  const owned = spellsOwned(game.pc, source);
  // DS:290b 2911 2922 2935 294a
  const headings =
    page === 0
      ? ['PERMANENT SPELLS', 'PREPARATION SPELLS']
      : ['WIZARD BATTLE SPELLS', 'PRIEST BATTLE SPELLS'];
  game.draw({ text: 'LEVEL', x: 0, y: 0, font: 0, colour: 4 });
  game.draw({ text: headings[0], x: 0xb4, y: 0, font: 0, colour: 4 });
  game.draw({ text: headings[1], x: 900, y: 0, font: 0, colour: 4 });
  for (let row = 0; row < 30; row += 1) {
    const level = Math.trunc(row / 3);
    const colour = (level % 3) + 6;
    const y = row * 0x26 + 0x3c;
    game.draw({ text: `${level + 1}`, x: 0x1e, y, font: 0, colour });
    const left = page * 2;
    if (owned[spellIndex(left, level, row % 3)] !== 0) {
      game.draw({ text: SPELL_MENU_NAMES[left][row], x: 0xb4, y, font: 0, colour });
    }
    if (owned[spellIndex(left + 1, level, row % 3)] !== 0) {
      game.draw({ text: SPELL_MENU_NAMES[left + 1][row], x: 900, y, font: 0, colour });
    }
  }
}

/** Where FUN_3000_71be (exe 3000:71be) puts the magic item page's lines: 0x28 apart at x 0x2d3. */
const MAGIC_ITEM_X = 0x2d3;
const MAGIC_ITEM_STEP = 0x28;

/**
 * FUN_3000_7545 (exe 3000:7545), its fifth choice: everything the character carries that is not a
 * spell, with how many of each.
 *
 * The lines are printed through a helper that keeps a running row number, and the number is
 * stepped an extra time before each of the three headings, which is what leaves a blank line
 * above them. The numbers in front of the items are the keys the I menu uses to spend them: 1 to
 * 5 under its fifth line and 6 to 11 under its fourth. The last five are worn or held and cannot
 * be spent at all.
 */
export function drawMagicItems(game: Game): void {
  const pc = game.pc;
  clearStatsScreen(game);
  const rows: (string | null)[] = [
    // DS:295f 2972 2990 29ab 29c8 29de 29f2
    'MISC. MAGIC ITEMS:',
    null,
    "HIT 'I' AND '5' TO USE THESE:",
    `1) NUCLEAR HAND GRENADES: ${pc.grenades}`,
    `2) STONES OF TELEPORTATION: ${pc.teleportStones}`,
    `3) STONES OF SEEING: ${pc.seeingStones}`,
    `4) FLOOR SLOSHERS: ${pc.slosher}`,
    `5) POTION OF HEALING: ${pc.healingPotions}`,
    null,
    // DS:2a09 2a27 2a3a 2a4e 2a62 2a73 2a86
    "HIT 'I' AND '4' TO USE THESE:",
    `6) GREEN POTIONS: ${pc.potions[1]}`,
    `7) ORANGE POTIONS: ${pc.potions[0]}`,
    `8) YELLOW POTIONS: ${pc.potions[5]}`,
    `9) RED POTIONS: ${pc.potions[3]}`,
    `10) BLUE POTIONS: ${pc.potions[2]}`,
    `11) WHITE POTIONS: ${pc.potions[4]}`,
    null,
    // DS:2a9a 2aba 2ad6 2af4 2b0f 2b26 2b3a
    'THESE ARE AUTOMATICALLY IN USE:',
    `12) RINGS OF REGENERATION: ${pc.regenRings}`,
    `13) RING OF PROTECTION, PLUS ${pc.protRing}`,
    `14) ANTI-MAGIC RING, PLUS ${pc.antiMagicRing}`,
    `15) BODY ARMOR, LEVEL ${pc.bodyArmor}`,
    `16) GAUNTLET, PLUS ${pc.gauntlet}`,
    null,
    'HIT ANY KEY...',
  ];
  rows.forEach((text, row) => {
    if (text === null) return;
    game.draw({ text, x: MAGIC_ITEM_X, y: row * MAGIC_ITEM_STEP, font: 0, colour: 4 });
  });
}

/** The line the type menu draws in place of a list the character's class cannot cast (DS:3716 373a). */
const WRITE_SPELL_BARRED = ['2) -------------', '3) -------------'];

/**
 * write_scroll_or_wand (exe 3000:d384, unf.c "write_scroll_or_wand"), its first menu: which of
 * the three lists a scroll or a wand is to be made for.
 *
 * The permanent list is not offered, so the numbers here are the same 1, 2 and 3 that index the
 * scroll and wand arrays as `type * 45 + level * 3 + slot`. A class that cannot cast wizard
 * spells gets dashes where the wizard line would be and a class that cannot cast priest spells
 * gets dashes on the priest line — but the menu is read by get_choice, which takes the key
 * whatever the line says, so a fighter can write a wizard scroll off a menu offering nothing.
 * That is the note already on `writeScrollOrWand` in `magic.ts`, which is the rest of the spell.
 */
export function drawWriteSpellTypeMenu(game: Game): void {
  const wizard = WIZARD_CLASSES.includes(game.pc.cls) ? '2) WIZARD SPELLS' : WRITE_SPELL_BARRED[0];
  const priest = PRIEST_CLASSES.includes(game.pc.cls) ? '3) PRIESTLY SPELLS' : WRITE_SPELL_BARRED[1];
  // DS:36d0 258b 36ef 3705 or 3716, 3727 or 373a
  drawMenu(game, ['PLEASE SELECT A TYPE OF SPELL:', '', '1) PREPARATION SPELLS', wizard, priest]);
}

/**
 * write_scroll_or_wand (exe 3000:d384), its second menu: which level of that list.
 *
 * `maxLevel` is how deep the spell doing the writing reaches — 3 for Write Scroll To Level 3 and
 * 10 for Write Scroll - Level 10. Only a menu that reaches level 10 says so, because the tenth
 * level is picked with '0'.
 */
export function drawWriteSpellLevelMenu(game: Game, maxLevel: number): void {
  const tenth = maxLevel > 9 ? "HIT 0 FOR 10'TH LEVEL" : '';
  // DS:374b 3765 3780 258b 3790 258b 37a6
  drawMenu(game, [
    'PLEASE SELECT A THE LEVEL',
    '   SPELL YOU WISH ENCHANT.',
    `MAXIMUM LEVEL: ${maxLevel}`,
    '',
    tenth,
    '',
    'HIT ESC FOR PREVIOUS MENU',
  ]);
}

/**
 * write_scroll_or_wand (exe 3000:d384), its third menu: which of the three spells on that line.
 *
 * The fifth line is whatever the level menu left in that buffer, so a menu that reached level 10
 * still shows its "HIT 0 FOR 10'TH LEVEL" under the three spells. SELECT ONE OF THE ABOVE (exe
 * DS:273e) is written into the sixth line and then wiped by the loop that blanks lines six to
 * eight, so it never reaches the screen; the decompilation is what puts the two in that order.
 */
export function drawWriteSpellSlotMenu(
  game: Game,
  type: number,
  level: number,
  maxLevel: number,
): void {
  const spells = [0, 1, 2].map((slot) => `${slot + 1}) ${SPELL_MENU_NAMES[type][level * 3 + slot]}`);
  const tenth = maxLevel > 9 ? "HIT 0 FOR 10'TH LEVEL" : '';
  // DS:37da 37de 37e2 with the names, then 37e6
  drawMenu(game, [...spells, '4) PREVIOUS MENU', tenth]);
}

/**
 * write_scroll_or_wand (exe 3000:d384), the key its second menu takes: a level 1 to 9 by its own
 * digit and level 10 by '0', neither past `maxLevel`. Escape goes back to the type menu.
 *
 * @returns the line of the book, 0 for the level 1 line, or 'escape', or null for a key the
 * original goes on waiting past.
 */
export function writeSpellLevelChoice(maxLevel: number, key: number): MenuChoice {
  if (key === ESCAPE) return 'escape';
  const digit = key - 0x30;
  if (digit === 0) return maxLevel >= 10 ? 9 : null;
  if (digit < 1 || digit > maxLevel) return null;
  return digit - 1;
}
