import data from '../dotu-data.json';
import type { JournalEvent, MonsterSeen } from '../journal-events';
import { BRIGHT_COLOURS } from '../dotu-pic.js';
import { DUNGEON_XMAX, DUNGEON_YMAX, HEIGHT, WIDTH } from '../unfmap.js';
import type { Rng } from './rng';
import { BorlandRng } from './rng';

/** The occupancy map's code for "nothing here" (0xff). */
export const MAP_EMPTY = 0xff;
/** The occupancy map's code for the square the player stands on (0xfe). */
export const MAP_PLAYER = 0xfe;

/**
 * One string on the screen, with everything the game's two text routines are told about it.
 *
 * `pfont` (exe 4000:0bb3, unf.c "pfont") takes an x, a y, one of the three fonts, the string and
 * a colour; `psfont` (exe 4000:0db8, unf.c "psfont") takes a second x as well and spreads the
 * string out until it reaches it. Both work in a grid 1600 across and 1200 down that they scale
 * to whatever video mode is running, so the numbers here are the game's own.
 */
export interface ScreenLine {
  /** The string, the exact bytes the game prints. */
  text: string;
  /** The left edge, out of 1600. */
  x: number;
  /** The top, out of 1200. */
  y: number;
  /** Which font: 0 the body face, 1 the middle one, 2 the big one. */
  font: number;
  /** The colour: a palette entry, 1 to 15 of the fixed UI colours, or 0 to rub the line out. */
  colour: number;
  /** psfont's second x, which the string is spread out to reach. A pfont line has none. */
  spreadTo?: number;
  /**
   * The bottom edge and the pen `FUN_4000_069a` (exe 4000:069a) is given, for the handful of
   * lines a screen hands that function directly instead of going through pfont or psfont.
   *
   * Those two work both out for themselves — psfont pulls the right edge in by half a character
   * and takes the height from the font — so a line without this is placed the way they place
   * one. A line with it spreads to `spreadTo` exactly and stands as tall as it says, which is
   * how the monster manual's row of letters and its DEAD stamp come out the size they do.
   */
  strokeBottom?: number;
  /** The pen width that same call is given, as a length in the 1600 by 1200 grid. */
  pen?: number;
  /**
   * A second string drawn on the same line at its own x, in the same font and colour. The game
   * draws "RACE: " and the race's name, or a characteristic's label and its number, as two calls
   * so that the numbers line up in a column; the message log gets the two joined into one line.
   */
  value?: string;
  /** The x that second string is drawn at. */
  valueX?: number;
  /**
   * Set on the lines psfont draws with DS:4dec cleared, which are the key menu's thirteen and
   * nothing else. Those come out as .FNT glyphs at their own size even at 1024 by 768, where
   * every other line is drawn with the vector font. Only the renderers that draw real pixels
   * look at this; the site sets all of these screens in a web font.
   */
  bitmapFace?: true;
}

/**
 * A rectangle of the screen in that same grid, as `fill_rect` (exe 4000:2a36) is given one: the
 * top left corner, and the column and row past its far edge.
 */
export interface ScreenRect {
  x: number;
  y: number;
  right: number;
  bottom: number;
}

/**
 * The fields of the character record the battle spells read or write. Each is one field of the
 * save file, and the name is the one `src/lib/game/dotu-files.js` already gives that offset;
 * fields that file does not parse are named after their label in `src/lib/editor/games.ts`.
 * The original reaches them as globals in the data segment, where `DAT_6000_xxxx` is save
 * offset `xxxx - 0xb880`.
 */
export interface PlayerCharacter {
  /** 0x00, DS:b880: upper case, at most the 18 characters the name field takes. */
  name: string;
  /** 0x28, DS:b8a8: which of the eight rows of the race table the character was rolled from. */
  race: number;
  /** 0x29, DS:b8a9: 0 male, 1 female. */
  sex: number;
  /** 0x2a, DS:b8aa: 0 Fighter, 1 Worshipper, 2 Monk, 3 Wizard, 4 Priest, 5 Sage, 6 Mage. */
  cls: number;
  /** 0x31, DS:b8b1. */
  hp: number;
  /** 0x33, DS:b8b3. */
  maxHp: number;
  /** 0x35, DS:b8b5: spell points, the one other field the game keeps as a float. */
  sp: number;
  /** 0x39, DS:b8b9. */
  maxSp: number;
  /**
   * 0x3d, DS:b8bd: the character's height in quarter-inches, so the screens that print it
   * multiply by four. The save editor labels this field "Height (/ 4)".
   */
  height: number;
  /** 0x3f, DS:b8bf: what the character weighs with nothing carried. */
  weight: number;
  /** 0x41, DS:b8c1: what the character weighs carrying everything they own. */
  loadedWeight: number;
  /** 0x81, DS:b901: how many of each of the eight weapons the character owns. */
  weaponsOwned: number[];
  /** 0x8e, DS:b90e: the plus on each of the eight weapons. */
  weaponPlus: number[];
  /** 0x9b, DS:b91b: which of the eight weapons is in hand. */
  weapon: number;
  /** 0xb0, DS:b930: how many of each of the eight armors the character owns. */
  armorOwned: number[];
  /** 0xb8, DS:b938: the plus on each of the eight armors. */
  armorPlus: number[];
  /** 0xc0, DS:b940: which of the seven suits of armor is worn. */
  armor: number;
  /**
   * 0xdd, DS:b95d: taken off a monster's attack roll. The save layout in the RE notes has no
   * name for this byte; the recovered source calls it `shield`. Nothing in the game writes it.
   */
  shield: number;
  /**
   * 0x177, DS:b9f7: 180 flags for the spells the character can cast out of their own head,
   * indexed `type * 45 + level * 3 + slot` the same way the scrolls are.
   */
  spellbook: number[];
  /** 0x22b, DS:baab: 180 scroll counts, indexed `type * 45 + level * 3 + slot`. */
  scrolls: number[];
  /** 0x2df, DS:bb5f: 180 wand charge counts, indexed the same way. */
  wands: number[];
  /** 0x454, DS:bcd4: rubles in the character's pocket. */
  money: number;
  /** 0x458, DS:bcd8: rubles in the bank. */
  bank: number;
  /** 0x46c, DS:bcec: magic crystals. */
  crystals: number;
  /** 0x7a4, DS:c024: experience, the one field of the record the game keeps as a double. */
  exp: number;
  /** 0x7ac, DS:c02c: the character's experience level. */
  lev: number;
  /** 0x7ae, DS:c02e: which way the character faces, 0 north, 1 south, 2 west, 3 east. */
  dir: number;
  /** 0x7b0, DS:c030. */
  x: number;
  /** 0x7b2, DS:c032. */
  y: number;
  /** 0x7b4, DS:c034: the floor the character is on, not the character's own level. */
  level: number;
  /** 0x7b6, DS:c036: 0..4. */
  module: number;
  /** 0x7b8, DS:c038: where the character sits in the scrolling map view, not on the floor. */
  mapCursorX: number;
  /** 0x7b9, DS:c039. */
  mapCursorY: number;
  /** 0x7cb, DS:c04b: how many lucky charms the character carries. */
  luckyCharms: number;
  /** 0x7ce, DS:c04e: moves until the disease bites again; -1 once it is cured. */
  disease: number;
  /** 0x7d0, DS:c050: moves until the poison bites again; -1 once it is cured. */
  poison: number;
  /** 0x7d2, DS:c052: the plus the preparation Enchant Weapon put on whatever is in hand. */
  tempWeaponPlus: number;
  /** 0x7d3, DS:c053: the plus the preparation Enchant Armor put on whatever is worn. */
  tempArmorPlus: number;
  /** 0x7d4, DS:c054: the level of the Body Armor spell in effect. */
  bodyArmor: number;
  /** 0x7d5, DS:c055: the plus on the Ring of Protection. */
  protRing: number;
  /** 0x7d6, DS:c056: the plus on the Anti-Magic Ring. */
  antiMagicRing: number;
  /** 0x7d7, DS:c057: 1 from the preparation spell, 100 from the permanent one. */
  feather: number;
  /** 0x7d8, DS:c058: 1 from the preparation Fast Move. */
  fastMove: number;
  /** 0x7d9, DS:c059: 1 from the preparation spell, 100 from the permanent one. */
  invisible: number;
  /** 0x7da, DS:c05a: the character's age in years, a 32-bit field. */
  age: number;
  /** 0x7de, DS:c05e: 5 while the preparation Strength's +5 STR is on. */
  prepStrength: number;
  /** 0x7df, DS:c05f: 5 while the preparation Agility's +5 AGI is on. */
  prepAgility: number;
  /** 0x7e0, DS:c060: 10 while Super Strength's +10 STR is on. */
  superStrength: number;
  /** 0x7e1, DS:c061: 10 while Super Agility's +10 AGI is on. */
  superAgility: number;
  /** 0x7e2, DS:c062: moves left on the Strength spell's +7 STR. */
  strengthTimer: number;
  /** 0x7e4, DS:c064: moves left on the Speed spell's +7 AGI. */
  speedTimer: number;
  /** 0x7e6, DS:c066. */
  slowEnemiesTimer: number;
  /** 0x7e8, DS:c068: 1, 2 or 3 for Power Weapon I, II and III. */
  powerWeapon: number;
  /** 0x7e9, DS:c069. */
  powerWeaponTime: number;
  /** 0x7eb, DS:c06b: 1 Minor, 2 Protection, 3 Major, 4 Ultra. */
  protection: number;
  /** 0x7ec, DS:c06c. */
  protectionTime: number;
  /** 0x7ee, DS:c06e. */
  resistPoisonTimer: number;
  /** 0x7f0, DS:c070. */
  resistDiseaseTimer: number;
  /** 0x7f2, DS:c072. */
  antiColdTimer: number;
  /** 0x7f4, DS:c074. */
  antiFireTimer: number;
  /** 0x7f6, DS:c076. */
  resistDrainTimer: number;
  /** 0x7f8, DS:c078: moves the engaged monster stays asleep. */
  sleepTimer: number;
  /** 0x7fa, DS:c07a: moves the engaged monster stays held. */
  holdMonsterTimer: number;
  /**
   * 0x7fc, DS:c07c. roll_char writes 2146 here and nothing in the game reads it back;
   * every real save file holds that number. The save layout has no name for it.
   */
  unread7fc: number;
  /** 0x7fe, DS:c07e: 1431 on every character, and read nowhere. */
  unread7fe: number;
  /** 0x808, DS:c088: zero on every character, and read nowhere. */
  unread808: number;
  /**
   * 0x80a, DS:c08a: 56 on every character. random_events_tick reads it once and compares it with
   * -1, so the note that comparison guards can never be shown.
   */
  unread80a: number;
  /** 0x80c, DS:c08c: 60 on every character, and read nowhere. */
  unread80c: number;
  /** 0x80e, DS:c08e: 300 on every character, and read nowhere. */
  unread80e: number;
  /** 0x810, DS:c090: zero on every character, and read nowhere. */
  unread810: number;
  /**
   * 0x854, DS:c0d4: refill hit points and spell points to the maximum. movecontrol reads it on
   * its next pass round the loop, fills the character up and writes zero back.
   */
  fillOnLoad: number;
  /**
   * 0x8f9, DS:c179: the deepest floor the character has reached, which movecontrol raises to
   * the current floor on every pass round its loop. The snake's greeting in the town is picked
   * by it.
   */
  deepestFloor: number;
  /** 0x816, DS:c096. */
  str: number;
  /** 0x818, DS:c098. */
  iq: number;
  /** 0x81a, DS:c09a. */
  wis: number;
  /** 0x81c, DS:c09c. */
  con: number;
  /** 0x81e, DS:c09e: agility. The save parser calls this field `dex`. */
  dex: number;
  /** 0x820, DS:c0a0. */
  luck: number;
  /** 0x853, DS:c0d3: the plus on the gauntlets. */
  gauntlet: number;
  /** 0x8f6, DS:c176: 1 on a character rolled under I Care How Awful, the hard mode. */
  hard: number;

  // kills and town
  /**
   * 0x15d, DS:b9dd: how many of each of the six potions the character carries, in the order the
   * save parser lists them — orange, green, blue, red, white, yellow. Killing a level drainer
   * hands one over.
   */
  potions: number[];
  /** 0x393, DS:bc13: 180 spell-paper counts, indexed `type * 45 + level * 3 + slot`. */
  papers: number[];
  /** 0x464, DS:bce4: culture stock, the units a night at the inn spends instead of ageing you. */
  cultureStock: number;
  /** 0x468, DS:bce8: children helped, which is what the store's refund is worked out from. */
  children: number;
  /** 0x470, DS:bcf0: Greater-American Dollars, which the bank turns into rubles a hundred at a time. */
  dollars: number;
  /**
   * 0x7c4, DS:c044: seconds of game time, which is what a night at the inn adds 28,800 to.
   * The save parser calls this field `realtime`.
   */
  realtime: number;
  /** 0x7ca, DS:c04a: rings of regeneration. */
  regenRings: number;
  /** 0x7cc, DS:c04c: nuclear hand grenades. */
  grenades: number;
  /** 0x7cd, DS:c04d: stones of seeing. */
  seeingStones: number;
  /** 0x802, DS:c082: floor sloshers; the game only ever lets the character have one. */
  slosher: number;
  /** 0x812, DS:c092: potions of healing. */
  healingPotions: number;
  /** 0x814, DS:c094: stones of teleportation. */
  teleportStones: number;
  /**
   * 0x822, DS:c0a2: one flag per trap door label, indexed by the floor divided by five. The save
   * parser reads 36 of them; only the first 22 can ever be reached, the deepest floor being 105.
   */
  keys: number[];
  /**
   * 0x849, DS:c0c9: one byte per module, bits 1, 2, 4 and 8 for the four sections of it whose
   * boss is dead. The save parser calls this field `objective`.
   */
  objective: number[];
  /**
   * 0x855 and 0x8a5, DS:c0d5 and DS:c125: the square each section's Shadow boss was last put
   * down on, indexed by `bossIndex` in `src/lib/game/dotu-files.js`. A boss who has never been
   * placed has 0 in both, which is how stock_level tells a first placement from a later one.
   */
  bossX: number[];
  bossY: number[];
  /**
   * 0x8fb, DS:c17b: one byte per section, how many of that section's boss's taunts have been
   * read. Neither the save parser nor the editor names this field.
   */
  bossTaunts: number[];
}

/**
 * One of a floor's 145 monster slots: the 6-byte `?MON.MAP` record `[x, y, hp lo, hp hi, type,
 * level]` the game keeps at DS:c4cd.
 */
export interface Monster {
  x: number;
  y: number;
  hp: number;
  /** Which of the 27 rows of `monsterKinds` this monster is. */
  type: number;
  /** The monster's own level, stored as one unsigned byte. */
  level: number;
}

/**
 * The fields of a monster's 29-byte description (exe DS:4fc9 for the 22 built-in monsters,
 * `MD.BIN` for the section's 22..26) that the ported functions read. The record is
 * `name[19], picnum, color_set, ldrain, chrdrain, breath, special, type, int16 exp, color`.
 */
export interface MonsterKind {
  /** Bytes 0..18, upper case as the game stores it: what a battle message calls the monster. */
  name: string;
  /**
   * Byte 21. Above zero it drains that many character levels a hit; below zero it drains
   * experience, and the amount it names is only what the message prints — see {@link defend}.
   */
  levelDrain: number;
  /** Byte 22: 1..6 raises a stat and -1..-6 drains one, the stat being `abs(byte) - 1`. */
  statDrain: number;
  /** Byte 23: 0 none, 1 fire, 2 ice, 3 acid, 4 green phlegm, 5 black slime. */
  breath: number;
  /** Byte 24. 100 marks a Shadow boss, which several spells refuse to touch; 6 a puffball. */
  special: number;
  /** Byte 25: which row of `monsterStats` this monster fights with. */
  type: number;
  /**
   * Bytes 26..27 plus one: what a kill's experience is multiplied by. `dotu-data.json` stores it
   * that way, so the -1 the exe treats as worth nothing at all arrives here as 0.
   */
  expMult: number;
}

/**
 * What the three menus of `write_scroll_or_wand` (exe 3000:d384) come back with: a type, a
 * level and a place on that line. The scroll and wand arrays are indexed
 * `type * 45 + level * 3 + slot`.
 */
export interface SpellChoice {
  /** 1 preparation, 2 wizard, 3 priest: the digit the first menu takes. */
  type: number;
  /** 0..9: the level menu's digit less one, so 0 is a level 1 spell and 9 a level 10 one. */
  level: number;
  /** 0..2: the place on that line, the third menu's 1..3 less one. */
  slot: number;
}

/**
 * Something the original does after a spell that this port records instead of doing (see the
 * README's second departure), or something a ported function did that the run log of
 * `src/lib/play/run.ts` keeps: one of the run's actions, or a milestone.
 */
export type GameEvent =
  /** load_level_map (exe 2000:7687) reads in another floor's monsters. */
  | { kind: 'levelChanged'; from: number; to: number }
  /** give_hint (exe 2000:313a) prints one of the hints in `UH.BIN`. */
  | { kind: 'hintShown'; hint: number }
  /** tablet_message (exe 3000:931c) prints one of the stone tablets in `UH2.BIN`. */
  | { kind: 'tabletShown'; entry: number }
  /** save_player (exe 2000:79ad) writes the character record back out to its file. */
  | { kind: 'playerSaved' }
  /**
   * save_player (exe 2000:79ad) again, at the end of roll_char, where the file it writes is a
   * character that did not exist before. The record is the live one, which nothing writes to
   * after this.
   */
  | { kind: 'characterCreated'; slot: number; pc: PlayerCharacter }
  /**
   * kill_monster (exe 3000:b12d) has killed the twenty-second monster of a section, which is that
   * section's Shadow boss. `boss` is the section, 0 to 19.
   */
  | { kind: 'bossKilled'; boss: number }
  /** That boss was the last section's, the Shadow Ogeroth, which is the end of the game. */
  | { kind: 'gameWon' }
  /** chute (exe 2000:b532): the square the chute stood on and the floor it dropped to. */
  | { kind: 'chuteTaken'; from: { x: number; y: number }; to: number }
  /** The character has arrived on a floor of a section they were not in, 0 to 19. Each section
   *  is five floors with its own monsters and its own Shadow boss. */
  | { kind: 'sectionReached'; section: number }
  /**
   * One of UH2.BIN's stone tablets read: the town's greeting, or a section boss's taunt, whose
   * section this names. `entry` is the message's number in the file.
   */
  | { kind: 'tabletRead'; entry: number; section: number | null }
  /** FUN_2000_31bc (exe 2000:31bc): the snake's word on arriving on a floor, by its number in
   *  UH.BIN. */
  | { kind: 'hintRead'; hint: number }
  /** bank (exe 2000:568b), menu entry 1: Greater-American Dollars changed into rubles. */
  | { kind: 'dollarsChanged'; dollars: number; rubles: number }
  /** Hit points a battle spell took off the monster being fought. */
  | { kind: 'spellDamaged'; monster: MonsterSeen; damage: number }
  /** One of the things a run journal reports (`src/lib/game/journal-events.ts`), which is also
   *  where the kinds a run counts as actions carry their numbers. */
  | JournalEvent;

/** The columns of the type table `mstats` (exe DS:5402) that the ported functions read. */
export interface MonsterStats {
  /** The to-hit armor column; a swing at the monster has it taken off the roll. */
  defense: number;
  /** The die a monster of this type rolls for damage. */
  damageDie: number;
  /** Hit points per level; Drain Monster takes half of it for each point of wisdom. */
  hpPerLevel: number;
  /** The `dex` column of the table; Autokill rolls against it, and it sets the attack interval. */
  speed: number;
  /** The line the battle banner prints under the monster's name, such as "THIS ONE IS FAST!". */
  text: string;
}

/**
 * Everything a ported game function touches.
 *
 * **This is a deliberate departure from the original.** The 1993 code keeps all of this in
 * globals in the data segment and every function reads and writes them directly; the port hands
 * the same state to each function as an argument instead, so a spell can be run and checked
 * without a running game. Nothing else about a ported function is allowed to depart: the reads,
 * the writes, the order they happen in and the values are the ones the exe has.
 */
export interface Game {
  pc: PlayerCharacter;
  /** DS:c4cd: the current floor's 145 monster slots. */
  monsters: Monster[];
  /** The 27 monster descriptions for the current section. */
  monsterKinds: MonsterKind[];
  /** The 16 rows of `mstats`. */
  monsterStats: MonsterStats[];
  /** The weight column of the eight weapons (exe DS:01a6, one every 7 bytes). */
  weaponWeights: number[];
  /**
   * The damage-die column of the weapon table (exe DS:01a2, one every 7 bytes). It has twelve
   * rows: the eight weapons, then the four power weapons a Power Weapon spell puts in hand.
   */
  weaponDamage: number[];
  /** The to-hit column of the same twelve rows (exe DS:01a4). */
  weaponHit: number[];
  /** The seconds-per-swing column of the same twelve rows (exe DS:01a5). */
  weaponTime: number[];
  /** The weight column of the seven armors (exe DS:01f8, one every 5 bytes). */
  armorWeights: number[];
  /** The armor-rating column of the seven armors (exe DS:01f6, one every 5 bytes). */
  armorHitChance: number[];
  /** The deepest floor of each of the five modules (exe DS:0493): 25, 45, 65, 85, 105. */
  bottomLevel: number[];
  /**
   * DS:c4d1: one byte per square of the whole 80 x 110 grid, indexed `y * 80 + x`. Holds
   * {@link MAP_EMPTY}, {@link MAP_PLAYER}, or the slot number of the monster standing there.
   */
  monsterMap: Uint8Array;
  /** DS:c4df: one seconds-until-its-next-attack timer per monster slot. */
  monsterTimers: Int16Array;
  /**
   * DS:035a: which of the ten character files, 20 to 29, the game has open. select_player (exe
   * 2000:5c0d) sets it from the digit the player picks, and save_player names the file after it.
   */
  slot: number;
  /** DS:2517: the slot of the monster the player is fighting, or -1 for none. */
  engaged: number;
  /** DS:c655: the monster standing in the direction the player faces, or -1 for none. */
  engagedAhead: number;
  /** DS:049d: the direction the monster found by call_check_eng was standing in. */
  enemyDir: number;
  /** DS:0431: what the last monster attack did to the player. */
  lastMonsterDamage: number;
  /**
   * DS:0437, which Ctrl-F puts up (exe 2000:d285): the loop takes F rather than reading a key,
   * so the character keeps swinging. Anything that reads the keyboard puts it down again.
   *
   * `defend` (exe 2000:82b7) reads it as well as the loop does: the beats it holds a swing for
   * are dropped while the character is swinging on its own, so a repeat runs at full speed.
   */
  repeatFight: boolean;
  /** DS:047b: how many seconds of game time the character has spent, counted as a float. */
  secondsElapsed: number;
  /** DS:2328: how many columns of a floor the game lets the player reach. */
  columns: number;
  /** DS:232a: how many rows of a floor the game lets the player reach. */
  rows: number;
  /** DS:2503: the width of the area being displayed — the whole 80 in the dungeon, less indoors. */
  areaColumns: number;
  /** DS:2504: the height of the area being displayed. */
  areaRows: number;
  /** DS:0327: the map view has to be re-centred on the player. */
  recenterMap: boolean;
  /** DS:c607: the 3D view has to be redrawn. */
  redrawView: boolean;
  /** DS:c657: the battle banner is on screen. */
  battleInfoOn: boolean;
  /** DS:c649: the battle banner has been written over and has to be printed again. */
  reprintBattleInfo: boolean;
  /**
   * DS:2519: the box on the screen goes with the character's next step. FUN_2000_bcb6, which
   * takes the character off a square, wipes the eight lines and the strip above them when this
   * is up; explain_trapdoor, the EXP NEEDED screen, the end of kill_monster and a pass with a
   * monster engaged raise it.
   */
  boxLeavesWithSquare: boolean;
  /** DS:c4dd: the line printed beside the monster during a fight. */
  monsterStatusLine: string;
  /**
   * DS:c694: the eight strings of the message box, as the block is showing them.
   *
   * print_menu_only (exe 2000:309e) copies its eight arguments into that buffer and FUN_2000_2f5d
   * (exe 2000:2f5d) draws them; the buffer itself is never emptied, so the game tells what is on
   * the block from what was last drawn there rather than from the strings. This holds the strings
   * only while they are on the block, which is the same thing said once: {@link clearMenuBlock}
   * empties it, since that is what takes them off the screen.
   */
  menuBox: string[];
  /** Every line the game has printed, oldest first. */
  messages: string[];
  /** What is on the screen now, in the order it was drawn. */
  screen: ScreenLine[];
  /**
   * The rectangle the game last filled with colour 0 for a screen to be drawn on, and null where
   * the port does not know one.
   *
   * A screen that takes the display over is drawn over the four 3-D views, and the game fills the
   * part of the screen it is about to draw on first. Most of those fills are not in the
   * decompilation, so the tab blacks the whole display out behind such a screen; the ones that
   * are get their own rectangle recorded here instead. Anything that wipes the screen without
   * filling it black takes the record down again, which leaves the tab back on the whole display.
   */
  blackedOut: ScreenRect | null;
  /** Every side effect the port declined to carry out, oldest first. */
  events: GameEvent[];
  rng: Rng;
  /**
   * solidcheck (exe 3000:86b5, unf.c "solidcheck"): whether the square is rock, meaning all
   * four of its sides are walls. `Dungeon.solid` in `src/lib/game/unfmap.js` is the same test.
   */
  solid(x: number, y: number, level: number, module: number): boolean;
  /**
   * retdwall (exe 3000:8360, unf.c "retdwall"): what stands on one side of a square — 0 wall,
   * 1 door, 2 secret door, 3 open. `hv` is 0 for the west side and 1 for the north side.
   * `Dungeon.side` in `src/lib/game/unfmap.js` is the same function.
   */
  retdwall(x: number, y: number, hv: number, level: number, module: number): number;
  /**
   * FUN_2000_72de (exe 2000:72de): mark the square known on the floor's explored bitmap. A game
   * being played hands in the map its character has discovered; {@link newGame} keeps no map and
   * remembers nothing.
   */
  markKnown(x: number, y: number): void;
  /**
   * get_choice (exe 2000:2d93) reading the direction menu Pass Wall prints: 1 north, 2 south, 3
   * east, 4 west, 5 cancel. The original reads the keyboard; the port asks whoever built the
   * game, and {@link newGame} cancels by default.
   */
  chooseDirection(): number;
  /**
   * mset_gmenu (exe 2000:2b08) reading the eight-line weapon menu enchant_weapon_perm prints:
   * 1 to 8 for a line of the menu, or null for the -1 it hands back on Escape. {@link newGame}
   * escapes by default.
   */
  chooseWeapon(): number | null;
  /** The same menu of the eight armors, for enchant_armor_perm. */
  chooseArmor(): number | null;
  /**
   * The three menus write_scroll_or_wand prints — the kind of spell, its level, and which of the
   * three spells on that line — as one answer, or null for the Escape that leaves the first of
   * them. `maxLevel` is the deepest level the spell being cast will write, which is all the
   * level menu does with it. {@link newGame} escapes by default.
   */
  chooseSpell(maxLevel: number): SpellChoice | null;
  /**
   * The difficulty menu roll_char puts up first: 0 for normal, 1 for I can handle anything.
   * The original reads a digit and loops until it is 1 or 2; {@link newGame} answers 0.
   */
  askDifficulty(): number;
  /** The race menu: 0 to 7, one of the eight rows of the race table. */
  askRace(): number;
  /**
   * What to do with the character that has just been rolled: 0 keep it, 1 roll another, 2 design
   * one. The original reads Y, N or D. {@link newGame} keeps, so a roll finishes on its own.
   */
  askKeepRerollDesign(): number;
  /**
   * Which characteristic the next of the 24 design points goes on: 0 strength, 1 intelligence,
   * 2 wisdom, 3 constitution, 4 agility, 5 luck, or 6 for the Escape that throws the character
   * away and rolls another. {@link newGame} escapes.
   */
  askDesignStat(): number;
  /** The typed name. roll_char keeps the first 18 characters of it, in upper case. */
  askName(): string;
  /** The class menu: 0 to 6, Fighter through Mage. */
  askClass(): number;
  /**
   * print_menu_only (exe 2000:309e): show a screen of up to eight lines and wait for a key.
   * The game fills the slots it does not use with the empty string at DS:258b; those trailing
   * blanks are dropped here, blank lines between two printed ones are kept.
   */
  say(...lines: string[]): void;
  /**
   * tablet_message (exe 3000:931c, unf.c "tablet_message"): four lines shown on the stone tablet
   * FUN_3000_9026 (exe 3000:9026) draws — a slab of the section's wall material across the middle
   * of the screen — rather than in the eight-line message box. The tablet waits for a key of its
   * own and goes when it is given one.
   *
   * The default keeps the lines with everything else the game has said, which is what a test
   * reads; the Play tab puts the slab up instead (`src/lib/play/tablet.ts`).
   */
  tablet(...lines: string[]): void;
  /**
   * pfont (exe 4000:0bb3) and psfont (exe 4000:0db8): draw one string on the screen and append it
   * to `messages` as well.
   *
   * Drawing over a string already at the same x and y replaces it, which is how the game puts the
   * next number where the last one was. Colour 0 is the background: the game rubs a string out by
   * drawing it again in it, so a call in colour 0 takes the line off the screen and prints
   * nothing.
   */
  draw(line: ScreenLine): void;
  /**
   * erase_menu_block (exe 4000:42b4, unf.c "erase_menu_block") and the fill_rect (exe 4000:2a36)
   * calls roll_char wipes the bottom of the screen with: everything drawn at `fromY` or below it
   * goes, and everything by default. What `messages` has already recorded stays.
   */
  eraseScreen(fromY?: number): void;
  /**
   * mgetch_message (exe 4000:418d, unf.c "mgetch_message"): wait for a key with the screen as it
   * stands, which is what keeps a screen up until the player has read it. {@link newGame} returns
   * at once.
   *
   * This one stays synchronous because the functions that call it are: a spell prints its box in
   * the middle of its own arithmetic. A game being played answers it by remembering that a wait
   * is owed and doing the waiting with {@link Game.key} once the spell has finished.
   */
  pressAnyKey(): void;
  /**
   * delay (exe 1000:2789, unf.c "FUN_1000_2789"): hold the screen as it stands for a number of
   * milliseconds, which is how long the game leaves a message on the screen before wiping it.
   *
   * The argument is milliseconds. The routine busy-waits on channel 0 of the 8253, whose count
   * it multiplies by the 2386 at DS:7b62; the channel runs in square-wave mode, where the count
   * steps down by two per 1,193,182 Hz clock, so 2386 counts is one millisecond.
   *
   * Nothing about the game changes over that time: the original is not reading the keyboard and
   * no monster moves. {@link newGame} therefore returns at once, and the Play tab is where the
   * delay means anything — it holds what has been drawn for that long before letting the next
   * thing show.
   */
  delay(ms: number): void;
  /**
   * getch (exe 4000:417b, unf.c "FUN_4000_417b"): the key movecontrol (exe 2000:c308) stops and
   * waits for, which is where every turn of the game begins.
   *
   * The value is the byte the original ends up dispatching on: a key that produces a character
   * is that character, and one that does not — an arrow key, a function key — is the negative of
   * its scan code, which is what movecontrol makes of the zero byte the BIOS sends first.
   * `src/lib/play/keys.ts` names them all. {@link newGame} has no keyboard and throws.
   */
  key(): Promise<number>;
  /**
   * get_choice (exe 2000:2d93, unf.c "get_choice"): wait for one of a menu's keys, ignoring
   * everything else, and hand back the byte.
   *
   * The original takes the first and last box of the menu it is under and works the digits out
   * from those, so what it accepts is always a run of digits from '1'; the port takes the keys
   * themselves so that a menu lettered rather than numbered can use it too. Escape always ends
   * it, which is the one answer the original takes outside the run. {@link newGame} has no
   * keyboard and throws.
   */
  choice(allowed: number[]): Promise<number>;

  // kills and town
  /**
   * DS:00c3: the high speed option, which the O menu turns on. It stops the game printing that
   * money was found, skips the drops the character has no use for, and skips most of its delays.
   */
  highSpeed: boolean;
  /**
   * DS:022b: the sound switch, which the last entry of the O menu flips (exe 2000:d9ca). The four
   * noises the game makes ask it first; see `sound.ts`.
   *
   * It starts on. The flag is only ever flipped, never written from the code, so its first value
   * is whatever the data segment of the executable holds: the unpacked image has a 0 at DS:022b,
   * and every gate plays when the flag is 0, so the port's `true` stands for that 0.
   */
  sound: boolean;
  /**
   * DS:4df2: the options menu's colour setting, 0 to 3. 0 draws the wall colours at full
   * strength and every other setting blends them toward grey. roll_char (exe 3000:4c77) gives a
   * new character 0, and the game saves the setting with the character at DS:c18f.
   */
  colourSetting: number;
  /**
   * DS:5400: drop_money has already said the character cannot carry any more dollars, so it does
   * not say it again until a find succeeds.
   */
  dollarCapWarned: boolean;
}

/**
 * monster_at (exe 2000:65b0, unf.c "monster_at"): the slot of the monster standing on a
 * square, or -1 when the square is empty. A square holding the player reads back as 0xfe, not
 * as empty.
 */
export function monsterAt(game: Game, x: number, y: number): number {
  const value = game.monsterMap[y * WIDTH + x];
  return value === MAP_EMPTY ? -1 : value;
}

/**
 * The monster in a slot as a run journal names it: its kind, its level and the name every
 * battle message calls it by.
 */
export function monsterSeen(game: Game, slot: number): MonsterSeen {
  const monster = game.monsters[slot];
  return { type: monster.type, level: monster.level, name: game.monsterKinds[monster.type].name };
}

/** set_monster_map (exe 2000:65dc, unf.c "set_monster_map"): write one square of the map. */
export function setMonsterMap(game: Game, x: number, y: number, value: number): void {
  game.monsterMap[y * WIDTH + x] = value;
}

/**
 * The overrides {@link newGame} accepts: any field of a {@link Game} except `pc`, which it takes
 * field by field, and the three printing methods, which it always supplies itself.
 */
export interface GameOverrides extends Partial<Omit<Game, 'pc' | 'say' | 'tablet' | 'draw' | 'eraseScreen'>> {
  pc?: Partial<PlayerCharacter>;
}

/**
 * What {@link newGame} answers a read of the keyboard with. A game built for a test has no
 * keyboard, and a loop that waits for a key it will never be given would never come back, so
 * asking says so instead.
 */
function noKeyboard(): never {
  throw new Error('this game has no keyboard: give it a key() to be played');
}

/** A character to run a ported function against. Fresh each call, arrays and all. */
function defaultPc(): PlayerCharacter {
  return {
    name: '',
    race: 0,
    sex: 0,
    cls: 0,
    hp: 100,
    maxHp: 100,
    sp: 0,
    maxSp: 0,
    height: 18,
    weight: 150,
    loadedWeight: 150,
    weaponsOwned: [1, 0, 0, 0, 0, 0, 0, 0],
    weaponPlus: [0, 0, 0, 0, 0, 0, 0, 0],
    weapon: 0,
    armorOwned: [1, 0, 0, 0, 0, 0, 0, 0],
    armorPlus: [0, 0, 0, 0, 0, 0, 0, 0],
    armor: 0,
    shield: 0,
    spellbook: Array.from({ length: 180 }, () => 0),
    scrolls: Array.from({ length: 180 }, () => 0),
    wands: Array.from({ length: 180 }, () => 0),
    money: 0,
    bank: 0,
    crystals: 0,
    exp: 100000,
    lev: 10,
    dir: 0,
    x: 40,
    y: 50,
    level: 5,
    module: 0,
    mapCursorX: 40,
    mapCursorY: 55,
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
    age: 25,
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
    str: 20,
    iq: 20,
    wis: 20,
    con: 20,
    dex: 20,
    luck: 20,
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
 * The 27 monster descriptions the game has loaded while the character is in a section: the 22
 * built-in ones, then the five load_md_bin (exe 2000:5fec) reads out of `MD.BIN` for that
 * section, which fill slots 22 to 26. `section` is 1 to 20, the way section_number (exe
 * 2000:1d23) counts them.
 *
 * `dotu-data.json` title-cases the names for the bestiary; the game holds them upper case,
 * which is how a battle message prints them.
 */
export function sectionMonsterKinds(section = 1): MonsterKind[] {
  return [...data.builtinMonsters, ...data.sections[section - 1].monsters].map((kind) => ({
    name: kind.name.toUpperCase(),
    levelDrain: kind.levelDrain,
    statDrain: kind.statDrain,
    breath: kind.breath,
    special: kind.special,
    type: kind.type,
    expMult: kind.expMult,
  }));
}

/** The 145 empty slots a floor starts with. */
function emptySlots(): Monster[] {
  return Array.from({ length: 145 }, () => ({ x: 0, y: 0, hp: 0, type: 0, level: 1 }));
}

/**
 * A game to run a ported function against. The defaults are a level 10 character standing on
 * floor 5 of module I with nothing engaged, an empty floor, and the monster tables of section 1.
 */
export function newGame(overrides: GameOverrides = {}): Game {
  const { pc: pcOverrides, ...rest } = overrides;
  const messages = overrides.messages ?? [];
  const screen = overrides.screen ?? [];
  const game: Game = {
    pc: { ...defaultPc(), ...pcOverrides },
    events: [],
    monsters: emptySlots(),
    monsterKinds: sectionMonsterKinds(),
    monsterStats: data.monsterTypes,
    weaponWeights: data.weapons.slice(0, 8).map((weapon) => weapon.weight),
    weaponDamage: data.weapons.map((weapon) => weapon.damageDie),
    weaponHit: data.weapons.map((weapon) => weapon.hit),
    weaponTime: data.weapons.map((weapon) => weapon.speed),
    armorWeights: data.armor.map((armor) => armor.weight),
    armorHitChance: data.armor.map((armor) => armor.armor),
    bottomLevel: data.constants.bottomLevel,
    monsterMap: new Uint8Array(WIDTH * HEIGHT).fill(MAP_EMPTY),
    monsterTimers: new Int16Array(145),
    slot: 20,
    engaged: -1,
    engagedAhead: -1,
    enemyDir: -1,
    lastMonsterDamage: 0,
    repeatFight: false,
    secondsElapsed: 0,
    columns: DUNGEON_XMAX,
    rows: DUNGEON_YMAX,
    areaColumns: WIDTH,
    areaRows: HEIGHT,
    recenterMap: false,
    redrawView: false,
    battleInfoOn: false,
    reprintBattleInfo: false,
    boxLeavesWithSquare: false,
    monsterStatusLine: '',
    menuBox: [],
    rng: new BorlandRng(1),
    solid: () => false,
    retdwall: () => 3,
    markKnown: () => {},
    chooseDirection: () => 5,
    chooseWeapon: () => null,
    chooseArmor: () => null,
    chooseSpell: () => null,
    askDifficulty: () => 0,
    askRace: () => 0,
    askKeepRerollDesign: () => 0,
    askDesignStat: () => 6,
    askName: () => '',
    askClass: () => 0,
    pressAnyKey: () => {},
    delay: () => {},
    key: noKeyboard,
    choice: noKeyboard,

    // kills and town
    highSpeed: false,
    sound: true,
    colourSetting: BRIGHT_COLOURS,
    dollarCapWarned: false,
    ...rest,
    messages,
    screen,
    blackedOut: null,
    say(...lines: string[]): void {
      let last = lines.length;
      while (last > 0 && lines[last - 1] === '') last--;
      for (let i = 0; i < last; i++) messages.push(lines[i]);
    },
    tablet(...lines: string[]): void {
      game.say(...lines);
    },
    draw(line: ScreenLine): void {
      const at = screen.findIndex((drawn) => drawn.x === line.x && drawn.y === line.y);
      if (line.colour === 0) {
        if (at !== -1) screen.splice(at, 1);
        return;
      }
      messages.push(line.value === undefined ? line.text : line.text + line.value);
      if (at === -1) screen.push(line);
      else screen[at] = line;
    },
    eraseScreen(fromY = 0): void {
      for (let at = screen.length - 1; at >= 0; at--) {
        if (screen[at].y >= fromY) screen.splice(at, 1);
      }
      game.blackedOut = null;
    },
  };
  return game;
}
