import type { CastEvent } from './action';

/**
 * The things a run journal reports, as the three games push them onto their event lists.
 *
 * `src/lib/game/action.ts` says which of these a run counts as an action; this says what each one
 * was. A step knows which way it went, a swing knows the weapon, the monster and the damage, a
 * find knows what was found. The words are `src/lib/play/journal.ts`, which turns one of these
 * into the line a player would say; the numbers are here so that the line, the summary and the
 * timeline all read the same run.
 *
 * The kinds are shared wherever the thing is the same, so one journal and one summary serve the
 * lot. A few of them belong to only one or two of the games — the vitamin pills the two Moraff
 * games hand out, Moraff's Revenge's breath of fire and its fountain of youth — and they are
 * here rather than on those games' own unions because the summary adds them up the same way for
 * whichever game has them. A game's own event union carries these
 * beside the kinds only it has — Dungeons of the Unforgiven's chutes and stone tablets are in
 * `GameEvent` (`src/lib/game/port/state.ts`).
 */

/**
 * The kinds of {@link JournalEvent}, as strings, since a run holds a game's events as a list of
 * kinds: an event with one of these is one every game pushes the same shape of, and one without
 * belongs to its own game and only that game's journal reads it.
 */
export const JOURNAL_KINDS = [
  'stepped',
  'waited',
  'dug',
  'trapdoorTaken',
  'ladderTaken',
  'buildingEntered',
  'swung',
  'breathed',
  'spellDamaged',
  'cast',
  'itemUsed',
  'dropped',
  'gearSwitched',
  'met',
  'hit',
  'killed',
  'afflicted',
  'statChanged',
  'found',
  'pillFound',
  'wandMade',
  'scrollWritten',
  'levelGained',
  'levelLost',
  'experienceDrained',
  'floorReached',
  'dungeonReached',
  'fountainDrunk',
  'coinsSpent',
  'deposited',
  'withdrew',
  'died',
] as const;

const KINDS: ReadonlySet<string> = new Set<string>(JOURNAL_KINDS);

/** Whether an event a game pushed is one of the kinds all three games share. */
export function isJournalKind(kind: string): boolean {
  return KINDS.has(kind);
}

/** A monster as the game names it where it is met: its kind, its level and the name the battle
 *  banner prints. */
export interface MonsterSeen {
  /** Which of the section's monster descriptions it is. */
  type: number;
  level: number;
  name: string;
}

/**
 * A spell by its place in its game's own table, which is what names it: Dungeons of the
 * Unforgiven and Moraff's World both hold four lists of ten lines of three.
 */
export interface SpellAt {
  /** 0 permanent, 1 preparation, 2 wizard, 3 priest. */
  type: number;
  /** 0 to 9, one less than the level the menu prints. */
  level: number;
  /** 0 to 2, the spell's place on its line of three. */
  slot: number;
}

/** What a square or a body turned out to be carrying. */
export type Find =
  /** A spellbook teaches the spell outright; a scroll and a sheet of paper are cast once. */
  | { what: 'spellbook' | 'scroll' | 'paper'; spell: SpellAt }
  | { what: 'wand'; spell: SpellAt; charges: number }
  /** A weapon, a suit of armour, a magic item or a potion, by the game's own name for it. */
  | { what: 'weapon' | 'armour' | 'item' | 'potion'; item: string }
  /** A trap door key, labelled with the floor its doors lead to. */
  | { what: 'key'; key: number }
  | { what: 'money'; amount: number };

/** Everything a run journal reports that more than one of the games has. */
export type JournalEvent =
  /** A step the square ahead allowed. `dir` is 0 north, 1 south, 2 west, 3 east. */
  | { kind: 'stepped'; dir: number }
  /** A moment spent standing still. */
  | { kind: 'waited' }
  /** A hole dug through the floor, and the floor it came out on. */
  | { kind: 'dug'; outcome: 'hole'; to: number }
  /** The six moments a monster interrupted, and the move a Fighter too deep to dig is given. */
  | { kind: 'dug'; outcome: 'interrupted' | 'moved' }
  /** A trap door opened with its key: the square it stood on and the floor it dropped to. */
  | { kind: 'trapdoorTaken'; from: { x: number; y: number }; to: number }
  /** A ladder climbed, and the floor it reached. */
  | { kind: 'ladderTaken'; to: number }
  /** One of the town's buildings gone into, by the game's own name for it. */
  | { kind: 'buildingEntered'; building: string }
  /** A swing taken at the monster being fought. A damage of 0 is a miss. */
  | { kind: 'swung'; weapon: string; monster: MonsterSeen; damage: number }
  /** A breath of fire, which is Moraff's Revenge's own swing and cannot miss. */
  | { kind: 'breathed'; monster: MonsterSeen; damage: number }
  | CastEvent
  /** A charge, a pill, a potion or one of the magic items spent. */
  | { kind: 'itemUsed'; item: string }
  /** Something put down to save carrying it. */
  | { kind: 'dropped'; what: 'weapon' | 'armour'; item: string }
  | { kind: 'dropped'; what: 'money'; amount: number }
  /** The weapon held or the armour worn changed. */
  | { kind: 'gearSwitched'; what: 'weapon' | 'armour'; item: string }
  /** The character came to face a monster, which is where a fight begins. */
  | { kind: 'met'; monster: MonsterSeen; slot: number }
  /** A blow a monster landed, or missed with. `breath` is the breath weapon it used, and null
   *  for an ordinary swing. */
  | { kind: 'hit'; monster: MonsterSeen; damage: number; breath: number | null }
  | { kind: 'killed'; monster: MonsterSeen; experience: number }
  /** Hit points a battle spell took off the monster being fought. */
  | { kind: 'spellDamaged'; monster: MonsterSeen; damage: number }
  /** A poisoning or a disease a blow or a breath brought with it. */
  | { kind: 'afflicted'; what: 'poison' | 'disease'; monster: MonsterSeen }
  /**
   * One of the six characteristics moved by a point, which a life drainer's blow and a puffball
   * both do. `stat` is the game's own name for it, and `by` is 1 for a raise and -1 for a drain,
   * since every value the monster tables hold moves its characteristic by exactly one point.
   */
  | { kind: 'statChanged'; stat: string; by: number; monster: MonsterSeen }
  | { kind: 'found'; find: Find }
  /** A vitamin pill, which the two Moraff games hand over by colour and nothing else. */
  | { kind: 'pillFound'; colour: string }
  /** A wand written by a spell, with the charges it was written with. */
  | { kind: 'wandMade'; spell: SpellAt; charges: number }
  | { kind: 'scrollWritten'; spell: SpellAt }
  /**
   * Levels the character's experience has earned them, handed over all at once: `level` is the
   * one they are left on and `from` the one they had before.
   */
  | { kind: 'levelGained'; level: number; from: number }
  /** Levels a life drainer took, and the level the character is left on. */
  | { kind: 'levelLost'; levels: number; level: number; monster: MonsterSeen }
  /** Experience a drainer took. */
  | { kind: 'experienceDrained'; experience: number; monster: MonsterSeen }
  | { kind: 'floorReached'; floor: number }
  /** The module or dungeon the character moved to. */
  | { kind: 'dungeonReached'; dungeon: number }
  /** Moraff's Revenge's fountain of youth, drunk from, and the generation it started. */
  | { kind: 'fountainDrunk'; generation: number }
  /** Money spent in one of the town's buildings, on what and where. */
  | { kind: 'coinsSpent'; amount: number; on: string; where: string }
  | { kind: 'deposited'; amount: number }
  | { kind: 'withdrew'; amount: number }
  /** The end of the run, and what killed the character; null for a death nothing was standing
   *  over, such as one a poison finished. */
  | { kind: 'died'; monster: MonsterSeen | null; floor: number; dungeon: number };
