import urollText from '../uroll.txt?raw';
import type { Game, PlayerCharacter, ScreenLine } from './state';

// The message text is the exact bytes of the game's own strings, read out of the data segment of
// the unpacked executable. The comment on each draw call gives the address of every line it
// prints, in order; dotu-tools/reference/scripts/exe_strings.py reads them back. The lines that
// come out of UROLL.TXT are the file's own, one line of the file to a line on screen.
//
// Every screen here is drawn with pfont (exe 4000:0bb3) or psfont (exe 4000:0db8), whose last
// argument is the colour: a palette entry between 1 and 15, which src/lib/game/palettes.json has
// the same in all forty palettes (PICTURES.md calls 1..15 the fixed UI colours). The ones
// roll_char uses are 2 blue, 3 light blue, 4 yellow, 5 orange, 6 red, 7 gold, 8 green and 15
// white. The argument before it picks the font: 0 the body face, 1 the middle one, 2 the big one.
// Ghidra hangs the colour off the end of the call that produced the string rather than the print
// call itself, so `read_uroll_line(buffer, file, 4); pfont(0, 0, 1, line)` in unf.c is a pfont
// call in colour 4.

/**
 * One of the eight rows of the race table (exe DS:0130, fourteen bytes apiece): a pointer to the
 * race's name, the six characteristics a character of that race starts from, and the height,
 * weight and age their rolls are built on.
 */
export interface Race {
  /** DS:0130 + 0, the string the race menu and the character screen print. */
  name: string;
  /** DS:0130 + 2, a signed byte, and the five below it. */
  str: number;
  iq: number;
  wis: number;
  con: number;
  /** The agility column. The record calls the field `dex` and the screens call it AGILITY. */
  dex: number;
  luck: number;
  /** DS:0130 + 8: the number the height roll works from. */
  height: number;
  /** DS:0130 + 10: the weight the roll is spread around. */
  weight: number;
  /** DS:0130 + 12: the age the roll adds up to nine years to. */
  age: number;
}

/**
 * The race table (exe DS:0130). The characteristics are what a race starts with before the roll
 * hands out its sixty points, so a race's average is its number plus ten — which is how
 * UROLL.TXT prints the table, except for two rows. The file gives HUMANOID 14 of everything
 * where the exe rolls 15, and gives MIDGET an average intelligence of 18 where the exe rolls 25.
 */
export const RACES: Race[] = [
  { name: 'HUMANOID', str: 5, iq: 5, wis: 5, con: 5, dex: 5, luck: 5, height: 70, weight: 130, age: 15 },
  { name: 'APE', str: 1, iq: 6, wis: 5, con: 2, dex: 6, luck: 4, height: 54, weight: 80, age: 10 },
  { name: 'CHILDMAN', str: 7, iq: 0, wis: 2, con: 8, dex: 6, luck: 1, height: 47, weight: 100, age: 8 },
  { name: 'RODENT', str: 2, iq: 1, wis: 1, con: 6, dex: 12, luck: 6, height: 21, weight: 60, age: 30 },
  { name: 'HOBO', str: 0, iq: 7, wis: 5, con: 2, dex: 7, luck: 4, height: 41, weight: 60, age: 130 },
  { name: 'GIANT', str: 10, iq: 0, wis: 0, con: 8, dex: 0, luck: 3, height: 99, weight: 400, age: 30 },
  { name: 'MIDGET', str: 0, iq: 15, wis: 2, con: 0, dex: 8, luck: 11, height: 31, weight: 20, age: 35 },
  { name: 'SHRIMP', str: 0, iq: 11, wis: 9, con: 3, dex: 0, luck: 4, height: 26, weight: 100, age: 17 },
];

/** The seven class names (exe DS:021d, a table of near pointers), in the order the menu takes. */
export const CLASS_NAMES = ['FIGHTER', 'WORSHIPPER', 'MONK', 'WIZARD', 'PRIEST', 'SAGE', 'MAGE'];

/**
 * UROLL.TXT as the game has it open: the whole file, and how far through it the reads have got.
 *
 * The original opens it with `fopen("uroll.txt", "rt")` at the top of roll_char and closes it
 * once the class descriptions have been read, walking it from beginning to end exactly once.
 * Text mode is what drops the carriage returns of its DOS line endings.
 */
export interface UrollFile {
  text: string;
  position: number;
}

/**
 * The `fopen` at the top of roll_char (exe 3000:4c9a). The port bundles the file, so the missing
 * file the original prints "I CAN'T FIND THE FILE UROLL.TXT. TRY TO FIND A COMPLETE COPY."
 * (DS:262c) for, before leaving the game through FUN_2000_04b7, cannot happen here.
 */
export function openUroll(text: string = urollText): UrollFile {
  return { text: text.replace(/\r\n/g, '\n'), position: 0 };
}

/**
 * read_uroll_line (exe 3000:4a24, unf.c "read_uroll_line"): read the next line of UROLL.TXT.
 *
 * It copies characters up to and including the newline into a buffer, dropping every '|' on the
 * way, and then writes a zero over the last character it copied, which is that newline. None of
 * the three files it is the reader for has a '|' anywhere in it — not UROLL.TXT, not the UH.BIN
 * hints, not the UH2.BIN tablets — so the dropping never has anything to drop.
 *
 * Running off the end of the file hangs the original, because fgetc goes on handing back -1 and
 * only a newline ends the loop. Nothing in roll_char reads that far.
 */
export function readUrollLine(file: UrollFile): string {
  let line = '';
  while (file.position < file.text.length) {
    const character = file.text[file.position];
    file.position += 1;
    if (character === '\n') return line;
    if (character !== '|') line += character;
  }
  return line;
}

/** The `count` lines roll_char reads in a row, which is how it walks a screen out of the file. */
export function readUrollLines(file: UrollFile, count: number): string[] {
  return Array.from({ length: count }, () => readUrollLine(file));
}

/** Where one line of a screen out of UROLL.TXT goes and how roll_char draws it. */
type UrollLineStyle = Omit<ScreenLine, 'text'>;

/** Read a screen out of UROLL.TXT and draw each of its lines where roll_char puts it. */
function drawUrollScreen(game: Game, file: UrollFile, screen: UrollLineStyle[]): void {
  for (const style of screen) game.draw({ ...style, text: readUrollLine(file) });
}

/** The difficulty menu, the first thirteen lines of UROLL.TXT (exe 3000:4cf1 to 3000:4e0e). */
const DIFFICULTY_MENU: UrollLineStyle[] = [
  { x: 0, y: 0, font: 1, colour: 4 },
  { x: 100, y: 100, font: 1, colour: 4 },
  { x: 0xa0, y: 0xbe, font: 1, colour: 5 },
  { x: 0xa0, y: 0xfa, font: 1, colour: 5 },
  { x: 0xa0, y: 0x136, font: 1, colour: 5 },
  { x: 0xa0, y: 0x172, font: 1, colour: 5 },
  { x: 100, y: 0x1ea, font: 1, colour: 4 },
  { x: 0xa0, y: 0x244, font: 1, colour: 5 },
  { x: 0xa0, y: 0x280, font: 1, colour: 5 },
  { x: 0xa0, y: 700, font: 1, colour: 5 },
  { x: 0xa0, y: 0x2f8, font: 1, colour: 5 },
  { x: 0xa0, y: 0x334, font: 1, colour: 5 },
  { x: 0xa0, y: 0x370, font: 1, colour: 5 },
];

/** The shareware contest screen, which the registered game reads past and never shows. */
const CONTEST_SCREEN: UrollLineStyle[] = [
  { x: 10, y: 10, font: 1, colour: 4 },
  { x: 10, y: 100, font: 1, colour: 4 },
  { x: 10, y: 0xbe, font: 1, colour: 4 },
  { x: 10, y: 0x118, font: 1, colour: 4 },
  { x: 10, y: 0x172, font: 1, colour: 4 },
  { x: 10, y: 0x1cc, font: 1, colour: 4 },
  { x: 10, y: 0x226, font: 1, colour: 4 },
  { x: 10, y: 0x280, font: 1, colour: 4 },
  { x: 10, y: 0x2da, font: 1, colour: 4 },
  { x: 10, y: 0x334, font: 1, colour: 4 },
  { x: 10, y: 0x38e, font: 1, colour: 4 },
  { x: 10, y: 0x44c, font: 1, colour: 6 },
];

/** The CREATING A CHARACTER screen: a big light blue title over two paragraphs and a prompt. */
const ADVICE_SCREEN: UrollLineStyle[] = [
  { x: 0, y: 0, font: 2, colour: 3 },
  { x: 0, y: 0x78, font: 0, colour: 5 },
  { x: 0, y: 0xdc, font: 0, colour: 5 },
  { x: 0, y: 0x140, font: 0, colour: 5 },
  { x: 0, y: 0x1a4, font: 0, colour: 5 },
  { x: 0, y: 0x208, font: 0, colour: 5 },
  { x: 0, y: 0x26c, font: 0, colour: 5 },
  { x: 0, y: 0x2d0, font: 0, colour: 5 },
  { x: 0, y: 0x334, font: 0, colour: 8 },
  { x: 0, y: 0x398, font: 0, colour: 8 },
  { x: 0, y: 0x3fc, font: 0, colour: 8 },
  { x: 0, y: 0x47e, font: 0, colour: 4 },
];

/** The race table: the title, two lines of instructions, the column headers and the eight rows. */
const RACE_SCREEN: UrollLineStyle[] = [
  { x: 0, y: 0, font: 2, colour: 3 },
  { x: 0, y: 100, font: 0, colour: 4 },
  { x: 0, y: 0x96, font: 0, colour: 4 },
  { x: 0, y: 0xdc, font: 0, colour: 5 },
  { x: 0, y: 0x140, font: 0, colour: 8 },
  { x: 0, y: 0x1a4, font: 0, colour: 8 },
  { x: 0, y: 0x208, font: 0, colour: 8 },
  { x: 0, y: 0x26c, font: 0, colour: 8 },
  { x: 0, y: 0x2d0, font: 0, colour: 8 },
  { x: 0, y: 0x334, font: 0, colour: 8 },
  { x: 0, y: 0x398, font: 0, colour: 8 },
  { x: 0, y: 0x3fc, font: 0, colour: 8 },
];

/**
 * The class menu: the question, then a colour for each of the seven classes — light blue, yellow,
 * orange, red, green, gold and blue — over the one or two lines that describe it. Every line is
 * spread out to the right edge the way psfont does it.
 */
const CLASS_SCREEN: UrollLineStyle[] = [
  { x: 0, y: 0x1e0, spreadTo: 0x5dc, font: 1, colour: 2 },
  { x: 0, y: 0x226, spreadTo: 0x640, font: 0, colour: 3 },
  { x: 0x5a, y: 0x24e, spreadTo: 0x640, font: 0, colour: 3 },
  { x: 0, y: 0x280, spreadTo: 0x640, font: 0, colour: 4 },
  { x: 0x5a, y: 0x2a8, spreadTo: 0x640, font: 0, colour: 4 },
  { x: 0, y: 0x2da, spreadTo: 0x640, font: 0, colour: 5 },
  { x: 0x5a, y: 0x302, spreadTo: 0x640, font: 0, colour: 5 },
  { x: 0, y: 0x334, spreadTo: 0x640, font: 0, colour: 6 },
  { x: 0x5a, y: 0x35c, spreadTo: 0x640, font: 0, colour: 6 },
  { x: 0, y: 0x38e, spreadTo: 0x640, font: 0, colour: 8 },
  { x: 0x5a, y: 0x3b6, spreadTo: 0x640, font: 0, colour: 8 },
  { x: 0, y: 1000, spreadTo: 0x640, font: 0, colour: 7 },
  { x: 0x5a, y: 0x410, spreadTo: 0x640, font: 0, colour: 7 },
  { x: 0x5a, y: 0x438, spreadTo: 0x640, font: 0, colour: 7 },
  { x: 0, y: 0x465, spreadTo: 0x640, font: 0, colour: 2 },
  { x: 0x5a, y: 0x48d, spreadTo: 0x640, font: 0, colour: 2 },
];

/**
 * The six characteristics on the character screen. roll_char draws each label at x = 0 in colour
 * 6 (DS:2670 267a 2688 2690 269e 26a7) and show_rolled_character draws its number in the same
 * colour at x = 0x212, which is what lines the numbers up in a column. The port draws the two as
 * one line, so both ends of it live here.
 */
const CHARACTERISTIC_LINES = [
  { label: 'STRENGTH: ', y: 100 },
  { label: 'INTELLIGENCE: ', y: 0xa0 },
  { label: 'WISDOM: ', y: 0xdc },
  { label: 'CONSTITUTION: ', y: 0x118 },
  { label: 'AGILITY: ', y: 0x154 },
  { label: 'LUCK: ', y: 400 },
];

/** One of the six characteristics, in the order the design menu numbers them. */
function characteristic(pc: PlayerCharacter, stat: number): number {
  return [pc.str, pc.iq, pc.wis, pc.con, pc.dex, pc.luck][stat];
}

/**
 * One characteristic's line of the character screen, label and number together.
 *
 * `on` is show_rolled_character's argument: 1 draws the number in colour 6 and 0 draws it in the
 * background, which is how the game rubs out a roll the player has turned down. Because the port
 * has the label and the number in one line, the erasing pass takes the label off the screen too,
 * where the original leaves it standing.
 */
export function drawCharacteristic(game: Game, stat: number, on: number): void {
  const line = CHARACTERISTIC_LINES[stat];
  game.draw({
    text: line.label,
    value: String(characteristic(game.pc, stat)),
    x: 0,
    valueX: 0x212,
    y: line.y,
    font: 1,
    colour: on * 6,
  });
}

/**
 * show_rolled_character (exe 3000:4a67, unf.c "show_rolled_character"): draw the numbers of the
 * character that has just been rolled — the six characteristics, the height, the weight, the age
 * and the sex.
 *
 * The original draws each number at a fixed column beside a label roll_char has already put on
 * the screen, and `on` picks the colour it draws in: 1 for the text colour and 0 for the
 * background, which is how a rejected roll is rubbed out again. The port draws each number joined
 * to the label it lands beside, so a pass with `on` at 0 takes the whole line off the screen and
 * prints nothing at all in the message log.
 *
 * The height is drawn as four times the field, so a character whose record says 21 stands 84
 * inches tall.
 */
export function showRolledCharacter(game: Game, on: number): void {
  const pc = game.pc;
  for (let stat = 0; stat < CHARACTERISTIC_LINES.length; stat++) drawCharacteristic(game, stat, on);
  // DS:26ad 26c2 26d7 at x = 0x2ee in colour 8, whose blank runs are where the numbers at
  // x = 0x438 land. The port has the number in the line rather than in a column of its own.
  game.draw({ text: `HEIGHT: ${pc.height * 4} INCHES`, x: 0x2ee, y: 100, font: 1, colour: on * 8 });
  game.draw({ text: `WEIGHT: ${pc.weight} POUNDS`, x: 0x2ee, y: 0xaa, font: 1, colour: on * 8 });
  game.draw({ text: `AGE: ${pc.age} YEARS`, x: 0x2ee, y: 0xf0, font: 1, colour: on * 8 });
  // DS:2615 / DS:2609, the whole line either way, in the big font in colour 15. The original
  // draws the two at different columns, 900 for the male one and 0x2ee for the female one.
  game.draw(
    pc.sex === 0
      ? { text: 'SEX: MALE', x: 900, y: 0, font: 2, colour: on * 15 }
      : { text: 'SEX: FEMALE', x: 0x2ee, y: 0, font: 2, colour: on * 15 },
  );
}

/**
 * The roll at the top of roll_char's loop (exe 3000:4c77, unf.c "roll_char"): everything about a
 * character that comes out of the race table and the dice — the age, the weight, the height, the
 * sex and the six characteristics.
 *
 * Each characteristic starts at its race's number and then sixty points are handed out one at a
 * time, each to whichever of the six a d6 picks, which is why a race's average is its number
 * plus ten and why the six always add up to the race's total plus sixty.
 *
 * The height is the race's number times thirty and divided by a hundred, and every screen that
 * prints it multiplies by four again, so a HUMANOID whose table row says 70 stands 84 inches
 * tall. The weight is spread a fifth of the race's weight wide around a tenth of it below.
 */
export function rollCharacteristics(game: Game): void {
  const pc = game.pc;
  const race = RACES[pc.race];
  pc.age = race.age + game.rng.random(10);
  pc.weight = race.weight;
  pc.weight = pc.weight + (game.rng.random(Math.trunc(pc.weight / 5)) - Math.trunc(pc.weight / 10));
  pc.height = Math.trunc((race.height * 30) / 100);
  pc.sex = game.rng.random(2);
  pc.str = race.str;
  pc.iq = race.iq;
  pc.wis = race.wis;
  pc.con = race.con;
  pc.dex = race.dex;
  pc.luck = race.luck;
  for (let point = 0; point < 60; point++) {
    switch (game.rng.random(6)) {
      case 0:
        pc.str += 1;
        break;
      case 1:
        pc.iq += 1;
        break;
      case 2:
        pc.wis += 1;
        break;
      case 3:
        pc.con += 1;
        break;
      case 4:
        pc.dex += 1;
        break;
      case 5:
        pc.luck += 1;
        break;
    }
  }
}

/**
 * The D of roll_char's keep, reroll and design menu (exe 3000:4c77, unf.c "roll_char"): four
 * points come off every characteristic and the player puts twenty-four back wherever they like,
 * which leaves the six adding up to exactly what the roll gave them.
 *
 * Returns false for the Escape the screen calls "cancel this character". It does not leave
 * character creation: roll_char goes back round and rolls another character from the top.
 *
 * The prompt tells the player to press D for agility and the code reads A. D is what the menu
 * one screen earlier took for designing a character, and pressing it here does nothing at all.
 */
export function designYourOwn(game: Game): boolean {
  const pc = game.pc;
  // fill_rect(0, 0x2b2, ...) in colour 0, which takes the keep, reroll and design menu away.
  game.eraseScreen(0x2b2);
  showRolledCharacter(game, 0);
  pc.str -= 4;
  pc.iq -= 4;
  pc.wis -= 4;
  pc.con -= 4;
  pc.dex -= 4;
  pc.luck -= 4;
  showRolledCharacter(game, 1);
  // DS:2756 in colour 4, then DS:2770 2794 in colour 3, DS:27b2 in colour 6 and DS:27cf 27f9
  // 2818 in colour 4, every one of them spread out by psfont. DS:2836 the original only prints
  // when a mouse is attached; the port has no mouse flag and prints it either way.
  game.draw({ text: 'ESC-CANCEL THIS CHARACTER', x: 0x96, y: 0x226, font: 1, colour: 4 });
  game.draw({ text: 'YOU MAY ASSIGN 24 ADDITIONAL POINTS', x: 0, y: 700, spreadTo: 0x63f, font: 1, colour: 3 });
  game.draw({ text: 'TO THE ABOVE CHARACTERISTICS.', x: 200, y: 0x302, spreadTo: 0x578, font: 1, colour: 3 });
  game.draw({ text: 'CHARACTERISTIC POINTS LEFT: ', x: 0, y: 0x348, spreadTo: 1000, font: 1, colour: 6 });
  game.draw({ text: "PRESS 'S', 'I', 'W', 'C', 'D', OR 'L' FOR", x: 0, y: 0x3a2, spreadTo: 0x63f, font: 1, colour: 4 });
  game.draw({ text: 'STRENGTH, INTELLIGENCE, WISDOM', x: 0x78, y: 1000, spreadTo: 0x63f, font: 1, colour: 4 });
  game.draw({ text: 'CONSTITUTION, AGILITY OR LUCK', x: 0x78, y: 0x42e, spreadTo: 0x63f, font: 1, colour: 4 });
  game.draw({
    text: 'OR POINT THE MOUSE TO A CHARACTERISTIC AND PRESS THE BUTTON',
    x: 0,
    y: 0x47e,
    spreadTo: 0x63f,
    font: 0,
    colour: 4,
  });
  for (let left = 24; left > 0; left--) {
    // The original rubs the last count out with a fill_rect and draws this one in its place, on
    // the end of the label above.
    game.draw({ text: String(left), x: 1000, y: 0x348, font: 1, colour: 6 });
    const stat = game.askDesignStat();
    if (stat === 6) {
      game.eraseScreen();
      return false;
    }
    switch (stat) {
      case 0:
        pc.str += 1;
        break;
      case 1:
        pc.iq += 1;
        break;
      case 2:
        pc.wis += 1;
        break;
      case 3:
        pc.con += 1;
        break;
      case 4:
        pc.dex += 1;
        break;
      case 5:
        pc.luck += 1;
        break;
    }
    // The original rubs the old number out and draws the new one in its place at x = 0x212.
    drawCharacteristic(game, stat, 1);
  }
  return true;
}

/**
 * The memset at the top of roll_char (exe 3000:4ca8, unf.c "roll_char"): all 0xa87 bytes of the
 * character record go to zero before anything about the new character is rolled. The fields the
 * port keeps as a string or an array come back empty and all-zero, which is those same bytes.
 *
 * Nothing puts the character's own level back up afterwards, so a character starts play at level
 * 0 with no experience and reaches level 1 at the inn. Every freshly rolled save file in the
 * game folder has a zero there.
 */
export function blankPlayerCharacter(): PlayerCharacter {
  return {
    name: '',
    race: 0,
    sex: 0,
    cls: 0,
    hp: 0,
    maxHp: 0,
    sp: 0,
    maxSp: 0,
    height: 0,
    weight: 0,
    loadedWeight: 0,
    weaponsOwned: [0, 0, 0, 0, 0, 0, 0, 0],
    weaponPlus: [0, 0, 0, 0, 0, 0, 0, 0],
    weapon: 0,
    armorOwned: [0, 0, 0, 0, 0, 0, 0, 0],
    armorPlus: [0, 0, 0, 0, 0, 0, 0, 0],
    armor: 0,
    shield: 0,
    spellbook: Array.from({ length: 180 }, () => 0),
    scrolls: Array.from({ length: 180 }, () => 0),
    wands: Array.from({ length: 180 }, () => 0),
    money: 0,
    bank: 0,
    crystals: 0,
    exp: 0,
    lev: 0,
    dir: 0,
    x: 0,
    y: 0,
    level: 0,
    module: 0,
    mapCursorX: 0,
    mapCursorY: 0,
    luckyCharms: 0,
    disease: 0,
    poison: 0,
    tempWeaponPlus: 0,
    tempArmorPlus: 0,
    bodyArmor: 0,
    protRing: 0,
    antiMagicRing: 0,
    feather: 0,
    fastMove: 0,
    invisible: 0,
    age: 0,
    prepStrength: 0,
    prepAgility: 0,
    superStrength: 0,
    superAgility: 0,
    strengthTimer: 0,
    speedTimer: 0,
    slowEnemiesTimer: 0,
    powerWeapon: 0,
    powerWeaponTime: 0,
    protection: 0,
    protectionTime: 0,
    resistPoisonTimer: 0,
    resistDiseaseTimer: 0,
    antiColdTimer: 0,
    antiFireTimer: 0,
    resistDrainTimer: 0,
    sleepTimer: 0,
    holdMonsterTimer: 0,
    unread7fc: 0,
    unread7fe: 0,
    unread808: 0,
    unread80a: 0,
    unread80c: 0,
    unread80e: 0,
    unread810: 0,
    fillOnLoad: 0,
    deepestFloor: 0,
    str: 0,
    iq: 0,
    wis: 0,
    con: 0,
    dex: 0,
    luck: 0,
    gauntlet: 0,
    hard: 0,

    // kills and town
    potions: [0, 0, 0, 0, 0, 0],
    papers: Array.from({ length: 180 }, () => 0),
    cultureStock: 0,
    children: 0,
    dollars: 0,
    realtime: 0,
    regenRings: 0,
    grenades: 0,
    seeingStones: 0,
    slosher: 0,
    healingPotions: 0,
    teleportStones: 0,
    keys: Array.from({ length: 36 }, () => 0),
    objective: [0, 0, 0, 0, 0],
    bossX: Array.from({ length: 80 }, () => 0),
    bossY: Array.from({ length: 80 }, () => 0),
    bossTaunts: Array.from({ length: 20 }, () => 0),
  };
}

/**
 * typed_name (exe 4000:55b2, unf.c "typed_name") as roll_char calls it: the name the player
 * types, cut to the 18 characters the record's name field holds.
 *
 * The original reads the keyboard a key at a time. Every key goes through toupper and only
 * letters, digits and the space bar are taken, so a name is upper case with nothing else in it.
 * Enter finishes and Escape gives up, but both are ignored until at least one character has been
 * typed, so a character cannot end up with no name at all. The port takes what the hook answers
 * as final and only filters it.
 */
export function typedName(typed: string): string {
  let name = '';
  for (const character of typed.toUpperCase()) {
    if (name.length === 18) break;
    if (/[A-Z0-9 ]/.test(character)) name += character;
  }
  return name;
}

/**
 * The spells a class starts with, in roll_char (exe 3000:4c77, unf.c "roll_char") straight after
 * the class menu. The spell book is 180 flags indexed `type * 45 + level * 3 + slot`, the same
 * way the scrolls and the wands are.
 *
 * A monk has every one of the 180 set, the fifteen unused slots on the end of each of the four
 * lists included: that is the class UROLL.TXT says "has ability to cast spells without
 * spellbooks". Everyone but a fighter starts with the preparation Little Cure, the wizard, sage
 * and mage with the wizard Magic Zap, and the worshipper, priest and sage with priest Strength.
 */
export function startingSpells(game: Game): void {
  const pc = game.pc;
  if (pc.cls === 2) {
    for (let slot = 0; slot < 3; slot++) {
      for (let level = 0; level < 15; level++) {
        for (let type = 0; type < 4; type++) pc.spellbook[type * 45 + level * 3 + slot] = 1;
      }
    }
  }
  if (pc.cls !== 0) pc.spellbook[1 * 45 + 0 * 3 + 2] = 1;
  if (pc.cls === 3 || pc.cls === 5 || pc.cls === 6) pc.spellbook[2 * 45 + 0 * 3 + 1] = 1;
  if (pc.cls === 1 || pc.cls === 4 || pc.cls === 5) pc.spellbook[3 * 45 + 0 * 3 + 2] = 1;
}

/**
 * reset_view_caches (exe 2000:3d9b, unf.c "reset_view_caches"): throw away everything the game has
 * cached about the view it is showing, so the next frame is drawn from nothing.
 *
 * Nearly all of it is display state this port does not keep: twelve bytes at DS:034c, a dozen
 * -1s over the drawing scratch, the eight counters at DS:ca67. The two the Game does have are
 * the flags that say the 3D view has to be redrawn and the map re-centred on the player.
 */
export function resetViewCaches(game: Game): void {
  game.redrawView = true;
  game.recenterMap = true;
}

/**
 * roll_char (exe 3000:4c77, unf.c "roll_char"): create a character, from the difficulty menu to
 * the file the finished character is written out to.
 *
 * It reads five screens out of UROLL.TXT — the difficulty menu, the contest screen it never
 * shows, the advice, the race table and the class descriptions — asks six questions, and rolls
 * the character once the race has been picked. Where the original writes the character to its
 * file, the port records a `characterCreated` event with the record and the file number
 * instead; where it stocks floor 1 with monsters, through stock_level (exe 2000:671e), it does
 * nothing, which is the same place the rest of this port stops.
 *
 * A character comes out of here at level 0 with no experience: nothing in the roller writes the
 * level field the memset zeroed.
 */
export function rollChar(game: Game): void {
  const pc = game.pc;
  // The original zeroes the module at DS:c036 first, which the memset on the next line does too.
  Object.assign(pc, blankPlayerCharacter());
  game.eraseScreen();
  const uroll = openUroll();
  drawUrollScreen(game, uroll, DIFFICULTY_MENU);
  // UROLL.TXT describes a third difficulty, the shareware contest, over the next three lines.
  // This is the registered game, whose menu only takes 1 or 2, so it reads them and throws them
  // away and there is no way to pick it.
  readUrollLines(uroll, 3);
  const difficulty = game.askDifficulty();
  // DS:c647, the contest flag. This menu can only ever leave it 0, because it never comes back
  // with anything but 0 or 1, but it is not the only thing in the game that writes it: a hidden
  // key in the play loop (byte 0xfb, exe 2000:c308) sets it, and choosing to quit is the only
  // thing that clears it again. This port stops before the play loop, so it reaches neither.
  // See dotu-tools/docs/CONTEST.md.
  let contest = 0;
  if (difficulty === 0) {
    pc.hard = 0;
  } else {
    pc.hard = 1;
    contest = difficulty === 1 ? 0 : 1;
  }
  if (contest === 1) {
    game.eraseScreen();
    drawUrollScreen(game, uroll, CONTEST_SCREEN);
    game.pressAnyKey();
    // The erase_menu_block after the key clears the screen for the tablet, which this port does
    // not draw; the same goes for the two later ones.
    game.events.push({ kind: 'tabletShown', entry: 0x55 });
  } else {
    readUrollLines(uroll, 12);
  }
  game.eraseScreen();
  drawUrollScreen(game, uroll, ADVICE_SCREEN);
  game.pressAnyKey();
  game.eraseScreen();
  // srand(time(NULL)) at 3000:5447, over the date and time read at 3000:543e, deliberately not
  // ported: see the README's third departure. It is the only reseed in the whole roller, and
  // the seed is the second the roller was started in rather than the tick counter a swing uses.
  drawUrollScreen(game, uroll, RACE_SCREEN);
  pc.race = game.askRace();
  game.eraseScreen();

  for (;;) {
    let choice = 0;
    for (;;) {
      // DS:266a in the big font in colour 5, with the race's name drawn after it at x = 0x14a
      game.draw({ text: 'RACE: ', value: RACES[pc.race].name, x: 0, valueX: 0x14a, y: 0, font: 2, colour: 5 });
      rollCharacteristics(game);
      showRolledCharacter(game, 1);
      // DS:26eb 2702 271a 2737, all four indented to x = 0xbe in colour 4
      game.draw({ text: 'Y) KEEP THIS CHARACTER', x: 0xbe, y: 700, font: 1, colour: 4 });
      game.draw({ text: 'N) ROLL A NEW CHARACTER', x: 0xbe, y: 0x302, font: 1, colour: 4 });
      game.draw({ text: 'D) DESIGN YOUR OWN CHARACTER', x: 0xbe, y: 0x348, font: 1, colour: 4 });
      game.draw({ text: 'PLEASE SELECT ONE OF THE ABOVE', x: 0xbe, y: 0x44c, font: 1, colour: 4 });
      choice = game.askKeepRerollDesign();
      if (choice === 0) break;
      if (choice === 1) showRolledCharacter(game, 0);
      if (choice === 2) break;
    }
    if (choice === 0) break;
    // A designed character is kept without being asked again; Escape rolls another one.
    if (designYourOwn(game)) break;
  }

  // fill_rect(0, 0x212, ...) in colour 0, leaving only the top of the character screen standing.
  game.eraseScreen(0x212);
  game.draw({ text: 'PLEASE TYPE YOUR NAME:', x: 0, y: 700, font: 1, colour: 7 }); // DS:2872
  // typed_name draws the letters as they are typed at x = 0 y = 0x44c, in the big font in colour
  // 4. The port takes the finished name from the hook, so nothing of it is drawn on the way.
  pc.name = typedName(game.askName());
  // fill_rect(0, 0x2b2, ...) over the prompt and the name. In the two smallest video modes the
  // original draws both strings again in colour 0 instead, which comes to the same thing.
  game.eraseScreen(0x2b2);
  // DS:2872 + 17, which is the tail of the same string, with the name drawn after it at x = 0x38e
  game.draw({ text: 'NAME: ', value: pc.name, x: 700, spreadTo: 0x370, valueX: 0x38e, y: 0x136, font: 1, colour: 8 });
  drawUrollScreen(game, uroll, CLASS_SCREEN);
  pc.cls = game.askClass();
  startingSpells(game);
  // DS:2889 in colour 8 with the class name drawn after it at x = 0x3d4
  game.draw({
    text: 'CLASS: ',
    value: CLASS_NAMES[pc.cls],
    x: 700,
    spreadTo: 0x398,
    valueX: 0x3d4,
    y: 0x17c,
    font: 1,
    colour: 8,
  });

  pc.maxSp = 0;
  pc.hp = pc.con + Math.trunc(pc.con / 2) + Math.trunc(pc.luck / 2) + game.rng.random(7);
  pc.maxHp = pc.hp;
  if (pc.cls === 0 || pc.cls === 5) {
    pc.maxHp = pc.maxHp + game.rng.random(22) + game.rng.random(22);
  }
  if (pc.hard === 0) {
    pc.maxHp = pc.maxHp + 25;
    // The 1.5 at DS:25d7 was meant to give a normal-difficulty character half again as many
    // spell points, but the spell points are worked out below, so this multiplies a zero and
    // the test in front of it means it does not even do that.
    if (pc.maxSp !== 0) pc.maxSp = pc.maxSp * 1.5;
  }
  switch (pc.cls) {
    case 0:
      pc.maxSp = 0;
      break;
    case 1:
      pc.maxSp = Math.trunc((pc.wis * 2 + pc.iq) / 4);
      break;
    case 2:
      pc.maxSp = Math.trunc((pc.wis + pc.iq) / 17) + 1;
      break;
    case 3:
      pc.maxSp = Math.trunc((pc.wis + pc.iq * 2) / 7);
      break;
    case 4:
      pc.maxSp = Math.trunc((pc.wis * 2 + pc.iq) / 8);
      break;
    case 5:
      pc.maxSp = Math.trunc((pc.wis + pc.iq) / 18);
      break;
    case 6:
      pc.maxSp = Math.trunc((pc.wis + pc.iq * 2) / 12);
      break;
  }
  pc.sp = pc.maxSp;
  pc.hp = pc.maxHp;
  // The class menu's question again in colour 0, which is how the game takes it off the screen
  // and leaves the seven descriptions standing under the finished character.
  game.draw({
    text: 'PLEASE SELECT A CLASS BY HITTING A NUMBER 1-7:',
    x: 0,
    y: 0x1e0,
    spreadTo: 0x5dc,
    font: 1,
    colour: 0,
  });
  // DS:28bf and DS:28ce in colour 4, whose four leading spaces are the gap between the two numbers
  game.draw({
    text: `SPELL POINTS: ${Math.trunc(pc.sp)}    HEALTH POINTS: ${pc.maxHp}`,
    x: 0,
    y: 0x1cc,
    font: 1,
    colour: 4,
  });
  game.pressAnyKey();
  game.events.push({ kind: 'tabletShown', entry: pc.cls + 0x34 });

  pc.x = 0x3a;
  pc.y = 0x2c;
  pc.level = 1;
  pc.module = 0;
  pc.mapCursorY = game.areaRows >> 1;
  pc.mapCursorX = game.areaColumns >> 1;
  pc.unread7fc = 0x862;
  pc.unread7fe = 0x597;
  // The kit: bare fists and bare skin, which are the first row of each of the two tables.
  pc.weaponsOwned[0] = 1;
  pc.armorOwned[0] = 1;
  pc.unread808 = 0;
  pc.unread80a = 0x38;
  pc.unread80c = 0x3c;
  pc.unread810 = 0;
  pc.unread80e = 300;

  pc.money = pc.luck * 5 + game.rng.random(pc.luck * 2);
  // A fighter gets no magic crystals. The save layout has the bank two fields before this one,
  // and this writes the crystals, so nobody starts with anything in the bank.
  if (pc.cls !== 0) {
    pc.crystals = pc.luck * 2 + game.rng.random(pc.luck * 5);
  }
  if (pc.hard === 0) {
    pc.money = pc.money + game.rng.random(100) + 500;
    if (pc.luck > 10) {
      // Three rolls on how much luck is over ten, multiplied together, so a lucky character on
      // normal difficulty can start with thousands and an unlucky one with a few hundred.
      pc.money =
        pc.money +
        (game.rng.random(pc.luck - 10) + 1) *
          (game.rng.random(pc.luck - 10) + 1) *
          (game.rng.random(pc.luck - 10) + 1);
    }
  }
  resetViewCaches(game);
  // save_player (exe 2000:79ad) writes the record to the file named after the character number.
  game.events.push({ kind: 'characterCreated', slot: game.slot, pc });
  // stock_level(0) (exe 2000:671e) fills floor 1 with monsters; not ported, see the README.
}
