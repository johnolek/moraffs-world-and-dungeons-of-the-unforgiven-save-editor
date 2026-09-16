import type { BossSquare } from '../port/rules';
import type { PlayerCharacter } from '../port/state';

/**
 * What an endless character carries that the 2695-byte record has no room for.
 *
 * The record holds one trap door key flag per five floors down to floor 179, and a square and a
 * kill flag per section for the Shadow bosses of the twenty sections the game has. An endless
 * dungeon goes deeper than 179 and has more sections than twenty, so the keys, the squares and
 * the kills beyond what the record reaches are kept here instead, along with the Shadow wandering
 * the dungeon now, which is nobody's section's — beside the record, never in it, so that an
 * endless character's bytes are still a save Dungeons of the Unforgiven itself would read.
 *
 * It is held against the character rather than inside it the way `random_events_tick`'s step
 * count is (`src/lib/play/office.ts`): a character read from a record afresh starts with none,
 * which is the same thing that happens to the step count.
 */
export interface EndlessState {
  /** The floors a trap door key has been found for, past the ones the record's own flags reach.
   *  The floor is the one the door leads to, which is the number on its label. */
  keys: Set<number>;
  /** Where each section's Shadow boss was last put down, by section number, for the sections
   *  the record's own table has no place for. */
  bossSquares: Map<number, BossSquare>;
  /** The sections past the twentieth whose Shadow boss has been killed, which is what keeps him
   *  off his floor for good. The record's own byte has one bit per section of a module and the
   *  game has four in each, so it has no room for these. */
  bossesKilled: Set<number>;
  /**
   * The Shadow wandering the dungeon now: the floor it stands on, and the square it was last put
   * down on there. Null when none is alive, which is when a floor's own draw is allowed to stand
   * one up.
   */
  wanderer: WanderingShadowAt | null;
  /** The floor the last wandering Shadow was killed on, and 0 for a character who has killed
   *  none. A new one only ever stands up deeper than this. */
  shadowKilledOn: number;
}

/** Where the Shadow now wandering the dungeon is: its floor, and the square of that floor it was
 *  last put down on. */
export interface WanderingShadowAt {
  floor: number;
  x: number;
  y: number;
}

/**
 * Everything the record cannot carry, as plain data, which is how it is kept beside the character
 * between sittings.
 *
 * A character is played, put down and played again, and the second sitting has to start with the
 * keys and the bosses the first one left behind, and with the hit points it really had. The
 * record cannot carry any of that, so the roster entry does (`RosterEntry.endless`), and the
 * browser's database writes down plain data rather than a Set and a Map.
 */
export interface KeptEndlessState {
  /** {@link EndlessState.keys}. */
  keys: number[];
  /** {@link EndlessState.bossSquares}, each square with the section it belongs to. */
  bossSquares: { section: number; x: number; y: number }[];
  /** {@link EndlessState.bossesKilled}, and absent for a character who has killed none of
   *  them. */
  bossesKilled?: number[];
  /** {@link EndlessState.wanderer}, and absent while no Shadow is wandering. */
  wanderer?: WanderingShadowAt;
  /** {@link EndlessState.shadowKilledOn}, and absent for a character who has killed none. */
  shadowKilledOn?: number;
  /**
   * The character's hit points, for a character who has more of them than the record's own
   * signed 16-bit field at 0x31 holds, and absent for one who has not.
   *
   * The record is written with a clamped copy ({@link clampedToRecord}) so that the bytes stay a
   * save Dungeons of the Unforgiven itself would load, and this is the real number, put back over
   * the record's when the character is picked up again.
   */
  hp?: number;
  /** The same for the maximum, which the record keeps at 0x33. */
  maxHp?: number;
  /**
   * The character's rings of regeneration, for a character carrying more of them than the
   * record's signed byte at 0x7ca holds, and absent for one who is not.
   *
   * These counts are the first limit of the record an endless character meets: a Shadow hands
   * over piles of loot, and the hundred and twenty-eighth of any of them reads as -128. They are
   * kept the way the hit points are — a clamped copy in the bytes, the real number here.
   */
  regenRings?: number;
  /** The same for the lucky charms, which the record keeps at 0x7cb. */
  luckyCharms?: number;
  /** The same for the hand grenades, which the record keeps at 0x7cc. */
  grenades?: number;
  /** The same for the stones of seeing, which the record keeps at 0x7cd. */
  seeingStones?: number;
  /**
   * The same for the six potions the record keeps at 0x15d, all six of them together, and absent
   * unless the character carries more of one of them than that byte holds.
   */
  potions?: number[];
}

/** Where what an endless character carries is kept while it is not being played. */
export interface EndlessStore {
  /** What it was carrying when it was last written down, or null for a character that has never
   *  been played. */
  read(): KeptEndlessState | null;
  write(state: KeptEndlessState): void;
}

const states = new WeakMap<PlayerCharacter, EndlessState>();

/** The state kept beside this character, made the first time anything asks for it. */
export function endlessStateOf(pc: PlayerCharacter): EndlessState {
  const state = states.get(pc) ?? {
    keys: new Set<number>(),
    bossSquares: new Map<number, BossSquare>(),
    bossesKilled: new Set<number>(),
    wanderer: null,
    shadowKilledOn: 0,
  };
  states.set(pc, state);
  return state;
}

/**
 * The largest number the record's two hit point fields hold. They are signed 16-bit words at 0x31
 * and 0x33 (`src/lib/game/port/record.ts`).
 */
const RECORD_HP_MAX = 32767;

/**
 * The largest number one of the record's item counts holds. The rings of regeneration, the lucky
 * charms, the hand grenades and the stones of seeing at 0x7ca to 0x7cd, and the six potions at
 * 0x15d, are each one signed byte.
 */
const RECORD_ITEM_MAX = 127;

/** What this character is carrying now, ready to be written down. */
export function keptEndlessState(pc: PlayerCharacter): KeptEndlessState {
  const state = endlessStateOf(pc);
  const kept: KeptEndlessState = {
    keys: [...state.keys],
    bossSquares: [...state.bossSquares].map(([section, square]) => ({ section, x: square.x, y: square.y })),
  };
  if (state.bossesKilled.size > 0) kept.bossesKilled = [...state.bossesKilled];
  if (state.wanderer !== null) kept.wanderer = { ...state.wanderer };
  if (state.shadowKilledOn > 0) kept.shadowKilledOn = state.shadowKilledOn;
  if (pc.hp > RECORD_HP_MAX) kept.hp = pc.hp;
  if (pc.maxHp > RECORD_HP_MAX) kept.maxHp = pc.maxHp;
  if (pc.regenRings > RECORD_ITEM_MAX) kept.regenRings = pc.regenRings;
  if (pc.luckyCharms > RECORD_ITEM_MAX) kept.luckyCharms = pc.luckyCharms;
  if (pc.grenades > RECORD_ITEM_MAX) kept.grenades = pc.grenades;
  if (pc.seeingStones > RECORD_ITEM_MAX) kept.seeingStones = pc.seeingStones;
  if (pc.potions.some((count) => count > RECORD_ITEM_MAX)) kept.potions = [...pc.potions];
  return kept;
}

/** Put back what this character was carrying when it was last written down. */
export function restoreEndlessState(pc: PlayerCharacter, kept: KeptEndlessState): void {
  const state = endlessStateOf(pc);
  state.keys = new Set(kept.keys);
  state.bossSquares = new Map(kept.bossSquares.map((boss) => [boss.section, { x: boss.x, y: boss.y }]));
  state.bossesKilled = new Set(kept.bossesKilled ?? []);
  state.wanderer = kept.wanderer ? { ...kept.wanderer } : null;
  state.shadowKilledOn = kept.shadowKilledOn ?? 0;
  if (kept.hp !== undefined) pc.hp = kept.hp;
  if (kept.maxHp !== undefined) pc.maxHp = kept.maxHp;
  if (kept.regenRings !== undefined) pc.regenRings = kept.regenRings;
  if (kept.luckyCharms !== undefined) pc.luckyCharms = kept.luckyCharms;
  if (kept.grenades !== undefined) pc.grenades = kept.grenades;
  if (kept.seeingStones !== undefined) pc.seeingStones = kept.seeingStones;
  // The record has six potions and no more, and what arrives here may have come over the open
  // internet, so the counts are put into the six the character already has rather than replacing
  // them with whatever list turned up.
  const potions = kept.potions;
  if (potions !== undefined) pc.potions = pc.potions.map((count, colour) => potions[colour] ?? count);
}

/**
 * The character as the record is able to hold it: the hit points and the maximum brought back
 * inside the two signed 16-bit words the record keeps them in, and the counts of the items it
 * keeps in one signed byte each brought back inside those.
 *
 * An endless character can heal past 32,767 and can carry more than 127 of a thing a Shadow hands
 * over, and the record written for one has to stay a record — a file the 1993 game would load and
 * make sense of, showing a character pegged at the largest number each field holds. The real
 * numbers travel beside it in {@link keptEndlessState}, so nothing is lost; what the record loses
 * is only the part it never had room for.
 *
 * The copy is what goes to `savePlayer`. The character being played is left alone, because the
 * sitting carries on with the numbers it really has.
 */
export function clampedToRecord(pc: PlayerCharacter): PlayerCharacter {
  if (!pastTheRecord(pc)) return pc;
  return {
    ...pc,
    hp: Math.min(pc.hp, RECORD_HP_MAX),
    maxHp: Math.min(pc.maxHp, RECORD_HP_MAX),
    regenRings: Math.min(pc.regenRings, RECORD_ITEM_MAX),
    luckyCharms: Math.min(pc.luckyCharms, RECORD_ITEM_MAX),
    grenades: Math.min(pc.grenades, RECORD_ITEM_MAX),
    seeingStones: Math.min(pc.seeingStones, RECORD_ITEM_MAX),
    potions: pc.potions.map((count) => Math.min(count, RECORD_ITEM_MAX)),
  };
}

/** Whether any of the character's numbers has grown past the field the record keeps it in. */
function pastTheRecord(pc: PlayerCharacter): boolean {
  return (
    pc.hp > RECORD_HP_MAX ||
    pc.maxHp > RECORD_HP_MAX ||
    pc.regenRings > RECORD_ITEM_MAX ||
    pc.luckyCharms > RECORD_ITEM_MAX ||
    pc.grenades > RECORD_ITEM_MAX ||
    pc.seeingStones > RECORD_ITEM_MAX ||
    pc.potions.some((count) => count > RECORD_ITEM_MAX)
  );
}

/**
 * Whether this is a state an endless character can be carrying, for reading one off a request
 * body or off a roster answer.
 *
 * A state travels with the character between devices, so it arrives over the open internet and
 * every field is checked here before anything is done with it. The hit points and the item counts
 * are the numbers the record has no room for, and a character whose numbers all fit the record
 * carries none of them.
 */
export function isKeptEndlessState(value: unknown): value is KeptEndlessState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Record<string, unknown>;
  if (!Array.isArray(state.keys) || !state.keys.every((key) => Number.isInteger(key))) return false;
  if (!Array.isArray(state.bossSquares) || !state.bossSquares.every(isBossSquare)) return false;
  if (state.bossesKilled !== undefined && !isSections(state.bossesKilled)) return false;
  if (state.wanderer !== undefined && !isWanderingShadowAt(state.wanderer)) return false;
  if (state.shadowKilledOn !== undefined && !Number.isInteger(state.shadowKilledOn)) return false;
  if (state.hp !== undefined && !Number.isInteger(state.hp)) return false;
  if (state.maxHp !== undefined && !Number.isInteger(state.maxHp)) return false;
  if (state.regenRings !== undefined && !Number.isInteger(state.regenRings)) return false;
  if (state.luckyCharms !== undefined && !Number.isInteger(state.luckyCharms)) return false;
  if (state.grenades !== undefined && !Number.isInteger(state.grenades)) return false;
  if (state.seeingStones !== undefined && !Number.isInteger(state.seeingStones)) return false;
  if (state.potions !== undefined && !isCounts(state.potions)) return false;
  return true;
}

/** Whether this is a list of how many of something the character carries, which is how the six
 *  potions travel. */
function isCounts(value: unknown): boolean {
  return Array.isArray(value) && value.every((count) => Number.isInteger(count));
}

/** Whether this is where a wandering Shadow stands: the floor it is on and its square of it. */
function isWanderingShadowAt(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const at = value as Record<string, unknown>;
  return Number.isInteger(at.floor) && Number.isInteger(at.x) && Number.isInteger(at.y);
}

/** Whether this is a list of section numbers, which is how the sections of a dungeon deeper than
 *  the game's own travel. */
function isSections(value: unknown): boolean {
  return Array.isArray(value) && value.every((section) => Number.isInteger(section));
}

/** Whether this is one of a state's Shadow boss squares: the section it belongs to and where in
 *  that section's last floor he stands. */
function isBossSquare(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const square = value as Record<string, unknown>;
  return Number.isInteger(square.section) && Number.isInteger(square.x) && Number.isInteger(square.y);
}
