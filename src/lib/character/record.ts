import type { CurrentCharacter, GameId } from '../app-state.svelte';
import { readString } from '../editor/fields';
import { MORAFFS_REVENGE, MORAFFS_WORLD, UNFORGIVEN } from '../editor/games';
import { MW_SLOTS } from '../roller/mw-save-file';
import { REV_SLOTS } from '../roller/rev-save-file';
import { SLOTS } from '../roller/save-file';
import data from '../game/dotu-data.json';
import { REV_CLASS_NAMES } from '../game/rev-port/character';
import { loadRevPlayer, REV_ARMOUR_VALUE, REV_VALUE, revValue } from '../play/rev/record';

/** How many bytes the name field takes. Moraff's World allows 32, Dungeons of the Unforgiven 18,
 *  and both stop at the first zero, so reading the longer of the two suits either game. */
const NAME_LENGTH = 32;

/**
 * The name in a character record. It is the first field of the file in the two C games, and
 * Moraff's Revenge keeps no name in the record at all — its names are in F5.COM, one to a line.
 */
export function recordName(bytes: Uint8Array, game?: string): string {
  if (game === MORAFFS_REVENGE.id) return '';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return readString(view, 0, Math.min(NAME_LENGTH, bytes.length)).trim();
}

/**
 * The character number a save file's name says it is, or null when the name is not a number.
 * Every game names a character's file after its number — 20 to 29 in Dungeons of the Unforgiven,
 * 1 upwards in Moraff's World, and 1 to 10 with `.EXE` on the end in Moraff's Revenge.
 */
export function slotFromFileName(fileName: string): number | null {
  const numbered = /^(\d+)(\.EXE)?$/i.exec(fileName);
  return numbered ? Number(numbered[1]) : null;
}

/** The character numbers a game's folder has room for, which are the names a download can take. */
export function characterSlots(game?: string): number[] {
  if (game === MORAFFS_WORLD.id) return MW_SLOTS;
  if (game === MORAFFS_REVENGE.id) return REV_SLOTS;
  return SLOTS;
}

/** What a character's file is called: its number, or the name it was loaded under. */
export function characterFileName(slot: number | null, fallback: string, game?: string): string {
  if (slot === null) return fallback;
  return game === MORAFFS_REVENGE.id ? `${slot}.EXE` : String(slot);
}

/** One of the six characteristics, labelled the way the game's own status block labels it. */
export interface StatusStat {
  label: string;
  value: number;
}

/** Where a character stands, for the map explorer. */
export interface StatusPlace {
  game: GameId;
  dungeon: number;
  floor: number;
  x: number;
  y: number;
}

/**
 * Everything the game's bottom-left status block prints, read out of a character record.
 * FUN_3000_caac (exe 3000:caac) is the function that draws it.
 */
export interface CharacterStatus {
  /** The name in the record, which is not always what the app calls the character. */
  recordName: string;
  cls: string;
  armor: string;
  weapon: string;
  lev: number;
  exp: number;
  sp: number;
  /** The spell points the character tops out at, or null for a game that keeps no maximum. */
  maxSp: number | null;
  hp: number;
  maxHp: number;
  stats: StatusStat[];
  /** Whether the character was rolled under I can handle anything, the hard mode, which every
   *  curve the game works out for them is steeper for. */
  hard: boolean;
  /** The lines the game's own battle-spell box would print, in the order it prints them. */
  battleSpells: string[];
  place: StatusPlace;
}

/** The labels the status block prints beside the six characteristics. */
const STAT_LABELS = ['STR', 'INT', 'WIZ', 'CON', 'DEX', 'LUCK'];

/** The same six for Moraff's Revenge, which has its own characteristics: strength, intelligence,
 *  wisdom, health, agility and laziness. */
const REV_STAT_LABELS = ['STR', 'INT', 'WIS', 'HEA', 'AGI', 'LAZ'];

/**
 * The labels for one game's six characteristics, in the order that game's record keeps them.
 *
 * A page that shows the six as a column each — the boards' table of everyone — has to head those
 * columns before it has read anybody's record, so the labels are asked for by game rather than
 * taken off a status block.
 */
export function statLabels(game: string): string[] {
  return game === MORAFFS_REVENGE.id ? REV_STAT_LABELS : STAT_LABELS;
}

/** The five suits of Moraff's Revenge, in the order the store numbers them from the robes a new
 *  character stands up in (1000:2A9A). */
const REV_ARMOR_NAMES = ['ROBES', 'LEATHER', 'CHAIN', 'PLATE', 'FIELD PLATE'];

/**
 * The three weapons a Moraff's Revenge character can own, in the order the game's own statistics
 * sheet prints them (1000:1B08). The game has no weapon in hand: every swing names the weapon it
 * is thrown with, so what the record holds is which of the three the character owns.
 */
const REV_WEAPONS = [
  { value: REV_VALUE.knife, name: 'KNIFE' },
  { value: REV_VALUE.sword, name: 'SWORD' },
  { value: REV_VALUE.mace, name: 'MACE' },
];

/** What the status block prints for a Moraff's Revenge character who owns no weapon, which is
 *  what the F key swings with. */
const REV_NO_WEAPON = 'FISTS';

const WEAPON_NAMES = data.weapons.slice(0, 8).map((weapon) => weapon.name.toUpperCase());
const ARMOR_NAMES = data.armor.map((armor) => armor.name.toUpperCase());
const CLASS_NAMES = data.classes.map((entry) => entry.name);

/** What the status block prints for a piece of kit the record names a slot the game has no name for. */
const UNKNOWN = '?';

const pick = (names: string[], index: number) => names[index] ?? UNKNOWN;

/** The status block for the current character, or null for a game this build cannot read. */
export function characterStatus(character: CurrentCharacter): CharacterStatus | null {
  if (character.game === MORAFFS_REVENGE.id) return revengeStatus(character.bytes);
  const view = new DataView(character.bytes.buffer, character.bytes.byteOffset, character.bytes.byteLength);
  if (character.game === UNFORGIVEN.id) return unforgivenStatus(view, character.bytes);
  if (character.game === MORAFFS_WORLD.id) return moraffsWorldStatus(view, character.bytes);
  return null;
}

/** The Dungeons of the Unforgiven record, whose offsets `src/lib/game/port/state.ts` documents. */
function unforgivenStatus(view: DataView, bytes: Uint8Array): CharacterStatus {
  return {
    recordName: recordName(bytes),
    cls: pick(CLASS_NAMES, view.getInt8(0x2a)),
    armor: pick(ARMOR_NAMES, view.getInt8(0xc0)),
    weapon: pick(WEAPON_NAMES, view.getInt8(0x9b)),
    lev: view.getInt16(0x7ac, true),
    exp: view.getFloat64(0x7a4, true),
    sp: view.getFloat32(0x35, true),
    maxSp: view.getFloat32(0x39, true),
    hp: view.getInt16(0x31, true),
    maxHp: view.getInt16(0x33, true),
    stats: statsAt(view, [0x816, 0x818, 0x81a, 0x81c, 0x81e, 0x820]),
    hard: view.getInt8(0x8f6) !== 0,
    battleSpells: battleSpellsInEffect(view),
    place: {
      game: 'unforgiven',
      x: view.getInt16(0x7b0, true),
      y: view.getInt16(0x7b2, true),
      floor: view.getInt16(0x7b4, true),
      dungeon: view.getInt16(0x7b6, true),
    },
  };
}

/**
 * The Moraff's World record, whose offsets `MORAFFS_WORLD` in `src/lib/editor/games.ts` has.
 * It has no battle spells.
 */
function moraffsWorldStatus(view: DataView, bytes: Uint8Array): CharacterStatus {
  return {
    recordName: recordName(bytes),
    cls: pick(CLASS_NAMES, view.getInt8(0x2a)),
    armor: pick(ARMOR_NAMES, view.getInt8(0xc0)),
    weapon: pick(WEAPON_NAMES, view.getInt8(0x9b)),
    lev: view.getInt16(0x7a8, true),
    exp: view.getFloat64(0x858, true),
    sp: view.getFloat32(0x35, true),
    maxSp: view.getFloat32(0x39, true),
    hp: view.getInt16(0x31, true),
    maxHp: view.getInt16(0x33, true),
    stats: statsAt(view, [0x812, 0x814, 0x816, 0x818, 0x81a, 0x81c]),
    hard: false,
    battleSpells: [],
    place: {
      game: 'moraffsWorld',
      x: view.getInt16(0x7ac, true),
      y: view.getInt16(0x7ae, true),
      floor: view.getInt16(0x7b0, true),
      dungeon: view.getInt16(0x7b2, true),
    },
  };
}

/**
 * The Moraff's Revenge record, which `src/lib/play/rev/record.ts` reads and this only rearranges.
 *
 * The game draws no status block: its numbers are on the sheet the V key prints (1000:19F7), and
 * these are that sheet's. Two of the fields the other two games have are missing rather than
 * zero — the record holds no name and no maximum for the spell points, which every scroll and
 * fountain simply adds to.
 */
function revengeStatus(bytes: Uint8Array): CharacterStatus | null {
  const pc = loadRevPlayer(bytes);
  if (pc === null) return null;
  const owned = REV_WEAPONS.filter((weapon) => revValue(pc, weapon.value) === 1).map((weapon) => weapon.name);
  return {
    recordName: '',
    cls: pc.cls === 1 ? REV_CLASS_NAMES[0] : REV_CLASS_NAMES[1],
    armor: pick(REV_ARMOR_NAMES, revValue(pc, REV_ARMOUR_VALUE)),
    weapon: owned.length > 0 ? owned.join(' ') : REV_NO_WEAPON,
    lev: pc.level,
    exp: pc.experience,
    sp: pc.spellPoints,
    maxSp: null,
    hp: pc.hp,
    maxHp: pc.maxHp,
    stats: REV_STAT_LABELS.map((label, index) => ({ label, value: pc.stats[index] })),
    hard: false,
    battleSpells: [],
    place: {
      game: 'revenge',
      // The game numbers its columns and rows from 1 and the map numbers both from 0.
      x: pc.column - 1,
      y: pc.row - 1,
      floor: pc.dungeonLevel,
      dungeon: pc.generation,
    },
  };
}

function statsAt(view: DataView, offsets: number[]): StatusStat[] {
  return STAT_LABELS.map((label, index) => ({ label, value: view.getInt16(offsets[index], true) }));
}

/**
 * view_battle_spells (exe 2000:9417, unf.c "view_battle_spells"): the spells the game's own
 * "CURRENT BATTLE SPELLS IN EFFECT" box lists, worded and ordered the way it prints them —
 * two to a row, left column then right. Protection and Power Weapon are listed for their level
 * rather than their timer, which is what makes a spell with a level and no timer left stay on
 * the screen until the character rests at an inn.
 */
export function battleSpellsInEffect(view: DataView): string[] {
  const lines: string[] = [];
  const protection = view.getInt8(0x7eb);
  const powerWeapon = view.getInt8(0x7e8);
  // DS:1731, DS:134e
  if (protection !== 0) lines.push(`PROTECT, LEVEL ${protection}`);
  if (view.getInt16(0x7e2, true) > 0) lines.push('STRENGTH');
  // DS:1741, DS:174f
  if (powerWeapon !== 0) lines.push(`POWER WEAPON ${powerWeapon}`);
  if (view.getInt16(0x7e4, true) > 0) lines.push('SPEED');
  // DS:1755, DS:1762
  if (view.getInt16(0x7e6, true) > 0) lines.push('SLOW MONSTER');
  if (view.getInt16(0x7fa, true) > 0) lines.push('HOLD MONSTER');
  // DS:176f, DS:177c
  if (view.getInt16(0x7f8, true) > 0) lines.push('STOP MONSTER');
  if (view.getInt16(0x7f6, true) > 0) lines.push('RESIST DRAIN');
  // DS:1789, DS:1797
  if (view.getInt16(0x7ee, true) > 0) lines.push('RESIST POISON');
  if (view.getInt16(0x7f0, true) > 0) lines.push('RESIST DISEASE');
  // DS:17a6, DS:17b0
  if (view.getInt16(0x7f2, true) > 0) lines.push('ANTI-COLD');
  if (view.getInt16(0x7f4, true) > 0) lines.push('ANTI-FIRE');
  return lines;
}

const NUMBERS = new Intl.NumberFormat('en-US');

/** Experience and the other big numbers, with the thousands separators the game itself has no
 *  room for. */
export function withSeparators(value: number): string {
  return NUMBERS.format(Math.round(value));
}

/**
 * The status block labels the level and the experience in full while a character is under level
 * 9, and in one letter each from there on, which is how the experience of a deep character
 * still fits on the line (exe 3000:caac).
 */
export function levelLabel(lev: number): string {
  // DS:3613, DS:3610
  return lev < 9 ? 'LEVEL: ' : 'L:';
}

export function expLabel(lev: number): string {
  // DS:361e, DS:361b
  return lev < 9 ? 'EXP:' : 'X:';
}

/**
 * Which three of the six characteristics the folded line carries, by their place in the record.
 * Every game keeps its own six in its own order, and the first, fourth and sixth are the same
 * three ideas in all three of them: strength, the one health points are worked out from, and the
 * one left over — luck in the two C games and laziness in Moraff's Revenge.
 */
const FOLDED_STATS = [0, 3, 5];

/** The one line the panel is folded away to: who the character is and the numbers most worth
 *  keeping an eye on. */
export function collapsedLine(status: CharacterStatus, name: string): string {
  const stat = (at: number) => {
    const entry = status.stats[at];
    return entry ? `${entry.label} ${entry.value}` : '';
  };
  const spellPoints = status.maxSp === null ? `${Math.trunc(status.sp)}` : `${Math.trunc(status.sp)}/${Math.trunc(status.maxSp)}`;
  return (
    `${status.recordName || name} L:${status.lev}  ` +
    `HP ${status.hp}/${status.maxHp}  SP ${spellPoints}  ` +
    `${stat(FOLDED_STATS[0])} · ${stat(FOLDED_STATS[1])} · ${stat(FOLDED_STATS[2])}`
  );
}
