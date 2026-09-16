import data from '../mw-data.json';
import type { JournalEvent, MonsterSeen } from '../journal-events';
import type { Rng } from '../port/rng';
import { BorlandRng } from '../port/rng';
import type { ScreenLine } from '../port/state';
import type { MwStockedMonster } from './stocking';
import { MONSTER_SLOTS } from './stocking';

/** The 112 rows of the monster table (exe DS:0237), which is where a monster's name comes from. */
const MW_MONSTERS = data.monsters;

/**
 * The character record Moraff's World writes.
 *
 * The whole record is 0x928 bytes, and what is named here is what the ported functions read or
 * write. Each field's comment gives the save offset and the global the original reaches it
 * through: the record sits at `DS:c0f2`, so `DAT_6000_xxxx` is save offset `xxxx - 0xc0f2`. The
 * names are the labels the Moraff's World schema in `src/lib/editor/games.ts` gives those
 * offsets.
 */
export interface MwCharacter {
  /** 0x00, DS:c0f2: upper case, at most the 18 characters read_string takes. */
  name: string;
  /** 0x28, DS:c11a: which of the eight rows of the race table the character was rolled from. */
  race: number;
  /** 0x29, DS:c11b: 0 male, 1 female. The schema calls this field Gender. */
  sex: number;
  /** 0x2a, DS:c11c: 0 Fighter, 1 Worshipper, 2 Monk, 3 Wizard, 4 Priest, 5 Sage, 6 Mage. */
  cls: number;
  /** 0x31, DS:c123. */
  hp: number;
  /** 0x33, DS:c125. */
  maxHp: number;
  /** 0x35, DS:c127: spell points, which the record keeps as a 32-bit float. */
  sp: number;
  /** 0x39, DS:c12b. */
  maxSp: number;
  /**
   * 0x3d, DS:c12f: the character's height in whole inches. Dungeons of the Unforgiven stores a
   * quarter of it in the same field; Moraff's World does not.
   */
  height: number;
  /** 0x3f, DS:c131: what the character weighs with nothing carried. */
  weight: number;
  /** 0x81, DS:c173: how many of each of the eight weapons the character owns. */
  weaponsOwned: number[];
  /** 0xb0, DS:c1a2: how many of each of the eight armors the character owns. */
  armorOwned: number[];
  /**
   * 0x177, DS:c269: 180 flags for the spells the character can cast out of their own head,
   * indexed `type * 45 + level * 3 + slot` over the four sub-categories of 45.
   */
  spellbook: number[];
  /** 0x454, DS:c546: jewels in the character's pocket. */
  money: number;
  /** 0x7ac, DS:c89e: where the character stands on the 80 x 110 section map. */
  x: number;
  /** 0x7ae, DS:c8a0. */
  y: number;
  /** 0x7b0, DS:c8a2: the floor the character is on, not the character's own level. */
  floor: number;
  /**
   * 0x7b2, DS:c8a4: which dungeon the character is in. The floor hash myrand (exe 3000:a384)
   * takes it beside x, y and the floor, so every value is a different set of floors.
   *
   * roll_char starts a character in 0 and the world-map screen (exe 3000:8235) is the only thing
   * that ever changes it: on leaving the map it works a number out of the map square the player
   * stands on, `regionX * regionY * regionX / (regionY + 1) % 31000` over 16-bit ints, then adds
   * one until floor 0 of that dungeon has a gate square to come back out through. The regions
   * are {@link MwCharacter.worldX} / 0x100 and {@link MwCharacter.worldY} / 0x80, both 0 to 63,
   * which puts every reachable value between -3204 and 3528; the modulus never bites.
   *
   * Confirmed against the save files in ~/games/mworld: slots 1 and 3 both read 0 here, and
   * brute-forcing all 31,000 values against the explored squares of their own 11/12/30/31.DUN
   * leaves 0 as the only dungeon whose floors have no wall where the character has walked.
   */
  dungeon: number;
  /** 0x7b4, DS:c8a6: where the character sits in the scrolling map view, not on the floor. */
  mapCursorX: number;
  /** 0x7b5, DS:c8a7. */
  mapCursorY: number;
  /**
   * 0x7d6, DS:c8c8: the character's age as a 32-bit count of minutes — years times 525,600.
   * Every screen that prints an age divides by 525,600 again.
   */
  ageMinutes: number;
  /**
   * 0x7f8, DS:c8ea: where the character stands on the 64 x 64 overworld map, in 256ths of a
   * tile across and 128ths down, so 2146 is column 8.
   */
  worldX: number;
  /** 0x7fa, DS:c8ec. */
  worldY: number;
  /**
   * 0x804, DS:c8f6: the dungeon to come back to. The temple (exe 2000:3085) sets it to the one
   * the character is standing in, and death (exe 2000:726f) puts them back there — throwing away
   * every explored floor if it is not the dungeon they died in.
   */
  returnDungeon: number;
  /** 0x806, DS:c8f8: the square to come back to. */
  returnX: number;
  /** 0x808, DS:c8fa. */
  returnY: number;
  /**
   * 0x80a, DS:c8fc: a 32-bit counter the encounter code (exe 2000:3085) recomputes as
   * `level * 500 + random(20)`.
   */
  encounterCounter: number;
  /** 0x812, DS:c904. */
  str: number;
  /** 0x814, DS:c906. */
  iq: number;
  /** 0x816, DS:c908. */
  wis: number;
  /** 0x818, DS:c90a. */
  con: number;
  /** 0x81a, DS:c90c: agility. The schema calls the field Agility / Dexterity. */
  dex: number;
  /** 0x81c, DS:c90e. */
  luck: number;

  // spells

  /**
   * 0x7a8, DS:c89a: the character's own level, which is not the floor
   * {@link MwCharacter.floor} holds. The damage spells multiply by it and autokill rolls it.
   */
  lev: number;
  /** 0x41, DS:c133: what the character weighs with everything carried. */
  loadedWeight: number;
  /** 0x8e, DS:c180: the plus on each of the eight weapons. */
  weaponPlus: number[];
  /** 0xb8, DS:c1aa: the plus on each of the eight armors. */
  armorPlus: number[];
  /**
   * 0x45c, DS:c54e: the six stone piles — copper, silver, ivory, gold, platinum and jewel
   * stones, in that order.
   */
  stones: number[];
  /**
   * 0x22b, DS:c31d: how many scrolls of each spell the character carries, laid out exactly like
   * {@link MwCharacter.spellbook} — 180 bytes indexed `category * 45 + level * 3 + slot`.
   */
  scrolls: number[];
  /** 0x2df, DS:c3d1: charges left on each spell's wand, in the same 180-byte layout. */
  wands: number[];
  /** 0x393, DS:c485: sheets of magic paper for each spell, in the same 180-byte layout. */
  paper: number[];
  /** 0x7ca, DS:c8bc: moves until the disease takes another point of constitution. */
  diseaseTimer: number;
  /** 0x7cc, DS:c8be: moves until the poison takes another point of strength. */
  poisonTimer: number;
  /** 0x7ce, DS:c8c0: the preparation Enchant Weapon plus, added to the attack roll. */
  enchantWeaponLevel: number;
  /** 0x7cf, DS:c8c1: the preparation Enchant Armor plus, taken off a monster's attack roll. */
  enchantArmorLevel: number;
  /** 0x7d0, DS:c8c2: the Body Armor level, also taken off a monster's attack roll. */
  bodyArmorLevel: number;
  /** 0x7d1, DS:c8c3: the ring of protection's plus. */
  ringOfProtection: number;
  /**
   * 0x7d2, DS:c8c4: the anti-magic ring's plus. Only the inventory screen reads it back, so the
   * ring does nothing.
   */
  antiMagicRing: number;
  /** 0x7d3, DS:c8c5: 1 from the preparation Feather, 100 from the permanent one. */
  feather: number;
  /** 0x7d4, DS:c8c6: 1 from the preparation Fast Move. */
  fastMove: number;
  /** 0x7d5, DS:c8c7: 1 from the preparation Invisibility, 100 from the permanent one. */
  invisibility: number;
  /** 0x7da, DS:c8cc: 5 while the preparation Strength is up, which is +5 on the strength. */
  prepStrength: number;
  /** 0x7db, DS:c8cd: 5 while the preparation Agility is up. */
  prepAgility: number;
  /** 0x7dc, DS:c8ce: 10 while Super Strength is up. */
  superStrength: number;
  /** 0x7dd, DS:c8cf: 10 while Super Agility is up. */
  superAgility: number;
  /** 0x7de, DS:c8d0: moves left on the battle Strength spell, which is worth +7. */
  strengthTimer: number;
  /** 0x7e0, DS:c8d2: moves left on the battle Speed spell, worth +7 agility. */
  speedTimer: number;
  /** 0x7e2, DS:c8d4: moves left on Slow Enemies. */
  slowEnemiesTimer: number;
  /** 0x7e4, DS:c8d6: 1, 2 or 3, which damage die a Power Weapon spell put in hand. */
  powerWeaponLevel: number;
  /** 0x7e5, DS:c8d7: moves left on that weapon. */
  powerWeaponTimer: number;
  /** 0x7e7, DS:c8d9: 1 to 4, the protection level; a monster's attack roll loses 2 × level². */
  protectionLevel: number;
  /** 0x7e8, DS:c8da: moves left on it. */
  protectionTimer: number;
  /** 0x7ea, DS:c8dc: moves left on Resist Poison. */
  resistPoisonTimer: number;
  /** 0x7ec, DS:c8de: moves left on Resist Disease. */
  resistDiseaseTimer: number;
  /** 0x7ee, DS:c8e0: moves left on Anti-Cold. */
  antiColdTimer: number;
  /** 0x7f0, DS:c8e2: moves left on Anti-Fire. */
  antiFireTimer: number;
  /** 0x7f2, DS:c8e4: moves left on Resist Level Drain. */
  resistDrainTimer: number;
  /**
   * 0x7f4, DS:c8e6: how many of the engaged monster's own turns it stays asleep, rather than
   * moves.
   */
  sleepTimer: number;
  /** 0x7f6, DS:c8e8: the same count of the monster's turns for Hold Monster. */
  holdMonsterTimer: number;
  // combat and town

  /** 0x9b, DS:c18d: which of the twelve weapons is in hand. */
  weapon: number;
  /** 0xc0, DS:c1b2: which of the eight suits of armor is worn. */
  armor: number;
  /**
   * 0xdd, DS:c1cf: a word monster_turn (exe 2000:615c) takes off the monster's attack roll.
   * Nothing in the executable ever writes it, so it is zero on every character; Dungeons of
   * the Unforgiven subtracts the shield in the same place.
   */
  unread0dd: number;
  /** 0x15d, DS:c24f: the six vitamin pills, orange through yellow. */
  pills: number[];
  /** 0x458, DS:c54a: jewels in the bank. */
  bank: number;
  /** 0x7aa, DS:c89c: which way the character faces, 0 north, 1 south, 2 west, 3 east. */
  dir: number;
  /**
   * 0x7c0, DS:c8b2: a 32-bit counter the inn (exe 2000:35b1) adds eight hours' worth of
   * seconds to for a night's stay. It is not the age at 0x7d6, and nothing reads it back.
   */
  unread7c0: number;
  /** 0x7c6, DS:c8b8: rings of regeneration. */
  regenRings: number;
  /**
   * 0x7c7, DS:c8b9: a byte strike (exe 2000:5bef) adds to the swing and monster_turn (exe
   * 2000:615c) takes off the monster's attack. Nothing in the executable writes it, so it is
   * zero on every character; Dungeons of the Unforgiven counts lucky charms in the same place.
   */
  unread7c7: number;
  /** 0x7c8, DS:c8ba: holy hand grenades. */
  grenades: number;
  /** 0x7c9, DS:c8bb: stones of seeing. */
  seeingStones: number;
  /** 0x7fe, DS:c8f0: floor sloshers, which the game never lets go above one. */
  floorSloshers: number;
  /** 0x80e, DS:c900: potions of healing. */
  healingPotions: number;
  /** 0x810, DS:c902: stones of teleportation. */
  teleportStones: number;
  /** 0x81f, DS:c911: one flag per trap door floor, 10 through 200. */
  trapdoorKeys: number[];
  /**
   * 0x845, DS:c937: one bit per quest boss, in the order `mw-data.json` lists them. A set bit
   * means that boss is dead, which is what keeps generate_section from placing it again.
   */
  killedBosses: number;
  /** 0x846, DS:c938: the plus on the gauntlets. */
  gauntlet: number;
  /** 0x858, DS:c94a: experience, the one field of the record the game keeps as a double. */
  exp: number;
}

/**
 * Something the original does that this port records instead of doing, or something a ported
 * function did that the run log of `src/lib/play/run.ts` keeps: one of the run's actions, or a
 * milestone.
 */
export type MwEvent =
  /**
   * save_player (WORLD.EXE 2000:58bf, mw.c "save_player") writes the 0x928-byte record to the
   * file named after the slot. The record is the live one, which nothing writes to after this.
   */
  | { kind: 'characterCreated'; slot: number; pc: MwCharacter }
  /**
   * generate_section (WORLD.EXE 2000:46a4, mw.c "generate_section") builds the map and the
   * monsters of the floor the character starts on. Nothing of the world is ported yet.
   */
  | { kind: 'sectionGenerated'; section: number }
  /**
   * enter_level (WORLD.EXE 2000:55fc, mw.c "enter_level") switches the floor under the
   * character: it writes the explored map out, reads the new floor's monsters back in or stocks
   * them afresh, and redraws. The five spells that move between floors leave the character
   * record holding the new floor and a square on it; nothing of the world around them is ported.
   */
  | { kind: 'levelEntered'; floor: number }
  /**
   * save_player (WORLD.EXE 2000:58bf, mw.c "save_player") writes the character record out
   * mid-play. Combat and the drops do it after anything that cannot be undone.
   */
  | { kind: 'playerSaved' }
  /**
   * load_h_bin (WORLD.EXE 2000:240c, mw.c "load_h_bin") shows one eight-line record of H.BIN.
   * The port prints the record's own lines through {@link MwGame.say} as well.
   */
  | { kind: 'hintShown'; record: number }
  /**
   * recompute_weight (WORLD.EXE 2000:2d8e, mw.c "recompute_weight") adds up what the character
   * carries. Nothing ported here reads the weight back.
   */
  | { kind: 'weightRecomputed' }
  /**
   * The eight files death deletes when there is no raise-dead contract: the character record,
   * its monster cache and its six explored-map blocks. MORF-66 says a dead character keeps its
   * bytes and the roster entry is marked instead, so the port deletes nothing.
   */
  | { kind: 'characterFilesDeleted'; slot: number }
  /**
   * monster_killed (WORLD.EXE 3000:d51c) has killed one of the eight quest bosses. `boss` is
   * which of them, 0 to 7, being its monster type less 104.
   */
  | { kind: 'bossKilled'; boss: number }
  /** That boss was the eighth, the Red Dragon King, which is the end of the game. */
  | { kind: 'gameWon' }
  /**
   * The inn (WORLD.EXE 2000:35b1) has handed the character every level their experience has
   * earned. `level` is the one they wake on.
   */
  | { kind: 'levelGained'; level: number; from: number }
  /** FUN_3000_d37f (WORLD.EXE 3000:d37f): a cup of health drunk, and the points it gave back. */
  | { kind: 'cupOfHealth'; healed: number }
  /** FUN_3000_d43b (WORLD.EXE 3000:d43b): a shimmering ball of thought, which is one spell
   *  point back. */
  | { kind: 'ballOfThought' }
  /**
   * One of the four things a quest boss's item is a plus on (WORLD.EXE 3000:d51c): the weapon
   * the two orbs enhance, which `item` names, and the body armor, the gauntlet and the ring of
   * protection, which the character has one of and `item` is null for.
   */
  | { kind: 'gearEnhanced'; what: 'weapon' | 'bodyArmor' | 'gauntlet' | 'ring'; item: string | null; plus: number }
  /** The temple's raise-dead contract (WORLD.EXE 2000:3085, menu entry 6), which writes down the
   *  square death sends the character back to. */
  | { kind: 'contractSigned'; dungeon: number; x: number; y: number }
  /** That contract spent (WORLD.EXE 2000:726f): the character is alive again in the town of the
   *  dungeon it named. */
  | { kind: 'raised'; dungeon: number }
  /** bank (WORLD.EXE 2000:3716), menu entry 1: every stone the character carries turned into
   *  jewels, at the only exchange in the game. */
  | { kind: 'stonesConverted'; jewels: number }
  /** FUN_3000_a047 (WORLD.EXE 3000:a047): the pockets opened, and which of its five pages was
   *  read. */
  | { kind: 'pocketsRead'; page: number }
  /** A poisoning or a disease a blow brought with it (WORLD.EXE 2000:615c). */
  | { kind: 'afflicted'; what: 'poison' | 'disease'; monster: MonsterSeen }
  /**
   * One of the things a run journal reports (`src/lib/game/journal-events.ts`), which is also
   * where the kinds a run counts as actions carry their numbers.
   */
  | JournalEvent;

/**
 * One answer to the three menus that the Write Scroll and Enchant Wand spells walk through: the
 * kind of spell, its level, and which of the three spells on that line.
 */
export interface MwSpellChoice {
  /** 1 preparation, 2 wizard, 3 priestly: the digit the first menu takes. */
  category: number;
  /** 0 to 9, the level menu's digit less one, so 0 is a level 1 spell and 9 a level 10 one. */
  level: number;
  /** 0 to 2, the place on that line, the third menu's 1 to 3 less one. */
  slot: number;
}

/** The stride of the occupancy grid: 80 bytes a row, one more than the 79 columns the game
 *  lets you walk (exe DS:448b holds the 79). */
export const MW_FLOOR_COLUMNS = 80;

/** How many rows a floor has (exe DS:448d). */
export const MW_FLOOR_ROWS = 110;

/** The occupancy grid's byte for a square nobody is standing on. */
export const MW_SQUARE_EMPTY = 0xff;

/** The occupancy grid's byte for the square the character is standing on. */
export const MW_SQUARE_PLAYER = 0xfe;

/**
 * Everything the ported roller touches.
 *
 * **This is a deliberate departure from the original**, the same one the Dungeons of the
 * Unforgiven port makes: the 1993 code keeps all of this in globals in the data segment, and
 * every function reads and writes them directly. The port hands the same state to each function
 * as an argument instead. Nothing else about a ported function departs — the reads, the writes,
 * the order they happen in and the values are the ones the executable has.
 */
export interface MwGame {
  pc: MwCharacter;
  /**
   * DS:125c: which of the ten character files, 0 to 9, the game has open. select_player (exe
   * 2000:3c8f) sets it from the digit the player picks, and save_player names the file after it.
   */
  slot: number;
  /**
   * DS:4489: how many columns of a floor the map view shows. set_map_view (exe 2000:3ae1) sets
   * it from the video mode, and roll_char halves it into the map cursor.
   */
  mapViewColumns: number;
  /** DS:448a: the same for rows. */
  mapViewRows: number;
  /** Every line the game has printed, oldest first. */
  messages: string[];
  /** What is on the screen now, in the order it was drawn. */
  screen: ScreenLine[];
  /** Every side effect the port declined to carry out, oldest first. */
  events: MwEvent[];
  rng: Rng;

  // spells

  /** DS:cbde: the current floor's 145 monster slots. */
  monsters: MwStockedMonster[];
  /** DS:4593: the slot of the monster the character is fighting, or -1 for none. */
  engaged: number;
  /**
   * DS:cbe2: one byte per square of the whole 80 x 110 floor, indexed `y * 80 + x`. It holds
   * {@link MW_SQUARE_EMPTY}, {@link MW_SQUARE_PLAYER}, or the slot of the monster standing there.
   */
  monsterMap: Uint8Array;
  /** DS:448b: how many columns a floor has, which is 80. */
  columns: number;
  /** DS:448d: how many rows a floor has, which is 110. */
  rows: number;
  /** DS:cbee: the line printed beside the monster during a fight. */
  monsterStatusLine: string;
  /**
   * DS:11e5: a floor has just greeted the character and they have not stepped since.
   *
   * The arrival greeting raises it; the first step movecontrol takes afterwards lowers it and
   * skips the little mouse's turn, so a floor's own greeting is never followed straight away by
   * the mouse. It is a plain global rather than part of the character record, so it does not
   * survive quitting the game, and nothing but that first step ever puts it back down.
   */
  justArrived: boolean;
  /** DS:123d: the map view has to be re-centred on the character. */
  recenterMap: boolean;
  /** DS:cd18: the view has to be redrawn. */
  redrawView: boolean;
  /**
   * DS:45c7: the message box goes with the character's next step. FUN_2000_a57e, which takes the
   * character off a square, wipes the whole box when this is up and only the top strip otherwise;
   * the trap door's box, EXP NEEDED, a kill and a pass with a monster engaged raise it.
   */
  boxLeavesWithSquare: boolean;
  /**
   * is_solid (WORLD.EXE 3000:a854, mw.c "is_solid"): whether the square is rock, meaning all
   * four of its sides are walls. `Dungeon.solid` in `src/lib/game/mw-dungeon.js` is the same
   * test over the same map hash.
   */
  isSolid(x: number, y: number, floor: number, dungeon: number): boolean;
  /**
   * The eight-line weapon menu enchant_weapon prints, read back by the menu at WORLD.EXE
   * 2000:1d0b: 1 to 8 for a line of it, or -1 for Escape. {@link newMwGame} escapes by default.
   */
  chooseWeaponSlot(): number;
  /** The same menu over the eight armors, for enchant_armour. */
  chooseArmorSlot(): number;
  /**
   * The direction menu Pass Wall prints, read back by the key loop at WORLD.EXE 2000:1fbd: 1
   * north, 2 south, 3 east, 4 west, 5 cancel. {@link newMwGame} cancels by default.
   */
  chooseDirection(): number;
  /**
   * The three menus the Write Scroll and Enchant Wand spells print, as one answer, or null for
   * the Escape that leaves them. `maxLevel` is the deepest level the spell being cast will
   * write, which is all the level menu does with it. {@link newMwGame} escapes by default.
   */
  chooseSpellToWrite(maxLevel: number): MwSpellChoice | null;
  /**
   * The race menu, which takes 1 to 8: 0 to 7, one of the eight rows of the race table. Escape
   * leaves the game through quit (exe 2000:03cb), which a browser has nothing to do with, so
   * there is no answer here that stands for it.
   */
  askRace(): number;
  /**
   * What to do with the character that has just been rolled: 0 keep it, 1 roll another, 2 design
   * one. The original reads Y, N or D. {@link newMwGame} keeps, so a roll finishes on its own.
   */
  askKeepRerollDesign(): number;
  /**
   * Which characteristic the next of the 24 design points goes on: 0 strength, 1 intelligence,
   * 2 wisdom, 3 constitution, 4 agility, 5 luck, or 6 for the Escape that throws the character
   * away and rolls another. {@link newMwGame} escapes.
   */
  askDesignStat(): number;
  /** The typed name. read_string keeps the first 18 characters of it, in upper case. */
  askName(): string;
  /** The class menu, which takes 1 to 7: 0 to 6, Fighter through Mage. Escape quits the game. */
  askClass(): number;
  /**
   * One line of text on the screen with nowhere in particular to go. The roller draws every line
   * it prints with {@link MwGame.draw} instead.
   */
  say(...lines: string[]): void;
  /**
   * print_text (exe 4000:0b14, mw.c "print_text"), print_text_clipped (exe 4000:0d0f) and
   * draw_text_box (exe 4000:4147): draw one string on the screen and append it to `messages`.
   *
   * Drawing over a string already at the same x and y replaces it, which is how the game puts the
   * next number where the last one was. Colour 0 is the background: the game rubs a string out by
   * drawing it again in it, so a call in colour 0 takes the line off the screen and prints
   * nothing. The {@link ScreenLine} the two games draw is the same shape, so the port takes it
   * from the Dungeons of the Unforgiven port rather than declaring it twice.
   */
  draw(line: ScreenLine): void;
  /**
   * clear_screen (exe 4000:34d8, mw.c "clear_screen") and the fill_rect (exe 4000:2020) calls
   * roll_char wipes the bottom of the screen with: everything drawn at `fromY` or below it goes,
   * and everything by default. What `messages` has already recorded stays.
   */
  eraseScreen(fromY?: number): void;
  /**
   * wait_key (exe 4000:3452, mw.c "wait_key"): wait for a key with the screen as it stands, which
   * is what keeps a screen up until the player has read it. {@link newMwGame} returns at once.
   */
  pressAnyKey(): void;
  /**
   * delay (WORLD.EXE 1000:22a2, mw.c "FUN_1000_22a2"): hold the screen as it stands for a number
   * of milliseconds, which is how long the game leaves a message on the screen before wiping it.
   *
   * The argument is milliseconds. The routine busy-waits on channel 0 of the 8253, whose count it
   * multiplies by the 2386 at DS:9162; the channel runs in square-wave mode, where the count steps
   * down by two per 1,193,182 Hz clock, so 2386 counts is one millisecond.
   *
   * Nothing about the game changes over that time: the original is not reading the keyboard and no
   * monster moves. {@link newMwGame} therefore returns at once, and the Play tab is where the
   * delay means anything — it holds what has been drawn for that long before letting the next
   * thing show.
   */
  delay(ms: number): void;

  // combat and town

  /**
   * DS:cbf0: one countdown per monster slot. It runs down with the moves the character spends
   * and every pass below zero buys that monster a turn.
   */
  monsterTimers: number[];
  /**
   * DS:119f: the sound switch, which the O key flips (exe 2000:aad5, the 0x6f branch). The four
   * noises the game makes ask it first, and the key menu offers the opposite of whatever it is
   * doing; see `sound.ts` and `mwKeyMenuLines`.
   *
   * It starts on. The flag is only ever flipped, never written from the code, so its first value
   * is whatever the executable's data segment holds: DGROUP has a 0 at 0x119f, and every gate
   * plays when the flag is 0, so the port's `true` stands for that 0.
   */
  sound: boolean;
  /**
   * DS:cd40: the direction the "YOU ARE FIGHTING THE MONSTER" banner was last drawn for, so it
   * is drawn again only when the character turns.
   */
  engagedBanner: number;
  /** DS:1301: what the last swing did. */
  lastStrikeDamage: number;
  /** DS:12ff: what the last monster's turn did. */
  lastMonsterDamage: number;
  /** DS:1305: the moves the character has spent, which the game keeps as a float. */
  movesTaken: number;
  /**
   * wall_side (WORLD.EXE 3000:a524, mw.c "wall_side"): the wall between two squares, 0 wall,
   * 1 door, 2 secret door, 3 open. `hv` 0 is the side west of (x, y) and 1 the side north of
   * it, which is what `MwDungeon.side` in `../mwmap.js` already computes.
   */
  wallSide(x: number, y: number, hv: 0 | 1, floor: number, dungeon: number): number;
  /**
   * mark_explored (WORLD.EXE 2000:5263): mark the square known on the floor's explored bitmap. A
   * game being played hands in the map its character has discovered; {@link newMwGame} keeps no
   * map and remembers nothing.
   */
  markExplored(x: number, y: number): void;
}

/**
 * The overrides {@link newMwGame} accepts: any field of an {@link MwGame} except `pc`, which it
 * takes field by field, and the three printing methods, which it always supplies itself.
 */
export interface MwGameOverrides extends Partial<Omit<MwGame, 'pc' | 'say' | 'draw' | 'eraseScreen'>> {
  pc?: Partial<MwCharacter>;
}

/**
 * The memset at the top of roll_char (WORLD.EXE 3000:4695, mw.c "roll_char"): all 0x928 bytes of
 * the character record go to zero before anything about the new character is rolled. The fields
 * the port keeps as a string or an array come back empty and all-zero, which is those same bytes.
 *
 * Nothing puts the character's own level back up afterwards, so a character starts play at level
 * 0 rather than 1, with no experience.
 */
export function blankMwCharacter(): MwCharacter {
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
    weaponsOwned: [0, 0, 0, 0, 0, 0, 0, 0],
    armorOwned: [0, 0, 0, 0, 0, 0, 0, 0],
    spellbook: Array.from({ length: 180 }, () => 0),
    money: 0,
    x: 0,
    y: 0,
    floor: 0,
    dungeon: 0,
    mapCursorX: 0,
    mapCursorY: 0,
    ageMinutes: 0,
    worldX: 0,
    worldY: 0,
    returnDungeon: 0,
    returnX: 0,
    returnY: 0,
    encounterCounter: 0,
    str: 0,
    iq: 0,
    wis: 0,
    con: 0,
    dex: 0,
    luck: 0,
    lev: 0,
    loadedWeight: 0,
    weaponPlus: [0, 0, 0, 0, 0, 0, 0, 0],
    armorPlus: [0, 0, 0, 0, 0, 0, 0, 0],
    stones: [0, 0, 0, 0, 0, 0],
    scrolls: Array.from({ length: 180 }, () => 0),
    wands: Array.from({ length: 180 }, () => 0),
    paper: Array.from({ length: 180 }, () => 0),
    diseaseTimer: 0,
    poisonTimer: 0,
    enchantWeaponLevel: 0,
    enchantArmorLevel: 0,
    bodyArmorLevel: 0,
    ringOfProtection: 0,
    antiMagicRing: 0,
    feather: 0,
    fastMove: 0,
    invisibility: 0,
    weapon: 0,
    armor: 0,
    unread0dd: 0,
    pills: [0, 0, 0, 0, 0, 0],
    bank: 0,
    dir: 0,
    unread7c0: 0,
    regenRings: 0,
    unread7c7: 0,
    grenades: 0,
    seeingStones: 0,
    prepStrength: 0,
    prepAgility: 0,
    superStrength: 0,
    superAgility: 0,
    strengthTimer: 0,
    speedTimer: 0,
    slowEnemiesTimer: 0,
    powerWeaponLevel: 0,
    powerWeaponTimer: 0,
    protectionLevel: 0,
    protectionTimer: 0,
    resistPoisonTimer: 0,
    resistDiseaseTimer: 0,
    antiColdTimer: 0,
    antiFireTimer: 0,
    resistDrainTimer: 0,
    sleepTimer: 0,
    holdMonsterTimer: 0,
    floorSloshers: 0,
    healingPotions: 0,
    teleportStones: 0,
    trapdoorKeys: Array.from({ length: 20 }, () => 0),
    killedBosses: 0,
    gauntlet: 0,
    exp: 0,
  };
}

/**
 * occupant_at (WORLD.EXE 2000:4575, mw.c "occupant_at"): the slot of the monster standing on a
 * square, or -1 when nothing is. The character's own square reads back as 0xfe, not as -1.
 */
export function mwOccupantAt(game: MwGame, x: number, y: number): number {
  const value = game.monsterMap[y * MW_FLOOR_COLUMNS + x];
  return value === MW_SQUARE_EMPTY ? -1 : value;
}

/**
 * The monster in a slot as a run journal names it: its kind, the depth it was stocked at, which
 * is the level every one of this game's formulas uses, and the name the fight's banner prints.
 */
export function mwMonsterSeen(game: MwGame, slot: number): MonsterSeen {
  const monster = game.monsters[slot];
  return { type: monster.type, level: monster.depth, name: MW_MONSTERS[monster.type].name };
}

/** set_occupant (WORLD.EXE 2000:45a1, mw.c "set_occupant"): write one square of the grid. */
export function mwSetOccupant(game: MwGame, x: number, y: number, value: number): void {
  game.monsterMap[y * MW_FLOOR_COLUMNS + x] = value;
}

/**
 * The strip a kill writes its own messages on, in the game's 1600 by 1200 grid: from the top
 * left corner across to x 0x2d0, and down as far as y 0x28, which is where the first line of the
 * message box is drawn.
 */
const MW_MESSAGE_LINE_WIDTH = 0x2d0;
const MW_MESSAGE_LINE_HEIGHT = 0x28;

/**
 * The line monster_killed (WORLD.EXE 3000:d51c) and FUN_3000_b99e (WORLD.EXE 3000:b99e) write
 * their own messages on: the top left corner of the screen, in the body font and whatever colour
 * the print_text call names.
 *
 * Drawing over the line replaces what was there, which is how one of those messages follows
 * another.
 */
export function mwMessageLine(text: string, colour: number): ScreenLine {
  return { text, x: 0, y: 0, font: 0, colour };
}

/**
 * Whether a drawn line stands on that strip.
 *
 * The screen keeps a string's top left corner rather than the box its letters fill, so a line
 * counts as inside the strip when the point it was drawn at is.
 */
export function mwOnMessageLine(line: ScreenLine): boolean {
  return line.x < MW_MESSAGE_LINE_WIDTH && line.y < MW_MESSAGE_LINE_HEIGHT;
}

/** The fill_rect (WORLD.EXE 4000:2020) both of them wipe that strip with before they write on it. */
export function mwClearMessageLine(game: MwGame): void {
  for (let at = game.screen.length - 1; at >= 0; at -= 1) {
    if (mwOnMessageLine(game.screen[at])) game.screen.splice(at, 1);
  }
}

/**
 * A game to run the ported roller against. The character starts blank, the way the memset at the
 * top of roll_char leaves it, and every question answers itself so a roll finishes on its own.
 *
 * The map view is 0x12 by 0x26, which is what set_map_view (exe 2000:3ae1) sets it to for the
 * three biggest video modes — the ones the game is played in. `main` (exe 2000:4292) calls that
 * function with 1 before it ever reaches the roller.
 */
export function newMwGame(overrides: MwGameOverrides = {}): MwGame {
  const { pc: pcOverrides, ...rest } = overrides;
  const messages = overrides.messages ?? [];
  const screen = overrides.screen ?? [];
  return {
    pc: { ...blankMwCharacter(), ...pcOverrides },
    slot: 0,
    mapViewColumns: 0x12,
    mapViewRows: 0x26,
    events: [],
    rng: new BorlandRng(1),
    askRace: () => 0,
    askKeepRerollDesign: () => 0,
    askDesignStat: () => 6,
    askName: () => '',
    askClass: () => 0,
    pressAnyKey: () => {},
    delay: () => {},
    monsters: [],
    engaged: -1,
    monsterMap: new Uint8Array(MW_FLOOR_COLUMNS * MW_FLOOR_ROWS).fill(MW_SQUARE_EMPTY),
    columns: MW_FLOOR_COLUMNS,
    rows: MW_FLOOR_ROWS,
    monsterStatusLine: '',
    justArrived: false,
    recenterMap: false,
    redrawView: false,
    boxLeavesWithSquare: false,
    isSolid: () => false,
    chooseWeaponSlot: () => -1,
    chooseArmorSlot: () => -1,
    chooseDirection: () => 5,
    chooseSpellToWrite: () => null,
    monsterTimers: Array.from({ length: MONSTER_SLOTS }, () => 0),
    sound: true,
    engagedBanner: -1,
    lastStrikeDamage: 0,
    lastMonsterDamage: 0,
    movesTaken: 0,
    wallSide: () => 3,
    markExplored: () => {},
    ...rest,
    messages,
    screen,
    say(...lines: string[]): void {
      let last = lines.length;
      while (last > 0 && lines[last - 1] === '') last--;
      for (let i = 0; i < last; i++) messages.push(lines[i]);
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
    },
  };
}
