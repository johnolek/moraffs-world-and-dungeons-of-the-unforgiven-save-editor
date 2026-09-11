import type { CastSource } from '../game/action';
import { BREATH_NAMES } from '../game/port/combat';
import { giveHint } from '../game/port/hints';
import { SPELL_MENU_NAMES } from '../game/port/inventory';
import type { Find, JournalEvent, MonsterSeen, SpellAt } from '../game/journal-events';
import { isJournalKind } from '../game/journal-events';
import type { GameEvent } from '../game/port/state';
import { UNFORGIVEN_MAP } from '../map/game';

/**
 * The run journal: everything that happened in a run, one line at a time, in the words a player
 * would use.
 *
 * The games push what they do onto their event lists with the numbers on it
 * (`src/lib/game/journal-events.ts`); this turns one of those into a line, and `RunRecorder`
 * (`run.ts`) keeps the lines as a run is played. A replay pushes the same events in the same
 * order and so writes the same journal, which is what lets a run be read without being handed
 * anything but its log.
 *
 * Every word of the lines is John's. They are all in {@link unforgivenJournal} below, one case
 * of one switch each, so that changing what a run says is changing this one function.
 */

/** One thing that happened, in words, with where the run had got to when it did. */
export interface JournalEntry {
  /** How many actions the run had spent when this happened. */
  at: number;
  floor: number;
  /** The module of Dungeons of the Unforgiven, or the dungeon of the other two games. */
  module: number;
  text: string;
  /**
   * The shared event the line was written from, which is what {@link summarizeJournal}
   * (`summary.ts`) folds, and null for one of the kinds only the game itself has.
   */
  event: JournalEvent | null;
}

/** Where the run had got to when something happened. */
export interface JournalPlace {
  at: number;
  floor: number;
  module: number;
}

/**
 * A game's own words for one of its events, or null for an event with no line to show: the
 * saves, the floors the port records rather than loads, and the character being rolled.
 *
 * The recorder holds a game's events as a list of kinds, since it plays all three games; the
 * game that pushed them is what knows their shapes, which is why this takes the loose one.
 */
export type JournalWords = (event: { kind: string }) => string | null;

/** One event as a line of a run's journal, or null for an event that has nothing to say. */
export function journalEntry(
  event: { kind: string },
  where: JournalPlace,
  words: JournalWords,
): JournalEntry | null {
  const text = words(event);
  if (text === null) return null;
  return { ...where, text, event: isJournalKind(event.kind) ? (event as JournalEvent) : null };
}

/** Which way a step went, by the facing the character was left in. */
export const DIRECTIONS = ['north', 'south', 'west', 'east'];

/** What a spell was cast out of, as the line names it. */
export const CAST_SOURCES: Record<CastSource, string> = {
  spellPoints: 'from spell points',
  scroll: 'from a scroll',
  wand: 'from a wand',
  paper: 'from a sheet of paper',
};

/** The name the spell menu prints for the spell at one place in one of the four lists. */
export function spellMenuName(spell: SpellAt): string {
  return SPELL_MENU_NAMES[spell.type][spell.level * 3 + spell.slot];
}

/** "a Level 46 GHOUL", as the battle banner names one. */
export function monsterWords(monster: MonsterSeen): string {
  return `a Level ${monster.level} ${monster.name}`;
}

/** "floor 12", or the town, which is floor 0 of every module. */
export function floorWords(floor: number): string {
  return floor === 0 ? 'the town' : `floor ${floor}`;
}

/** What the snake's message says, with the line it opens every one of its own with dropped. */
function snakeWords(hint: number): string {
  const lines = giveHint(hint).filter((line) => line.trim() !== '');
  const said = lines[0] === 'A LITTLE SNAKE SAYS:' ? lines.slice(1) : lines;
  return said.map((line) => line.trim()).join(' ');
}

/** What was found, as the line names it. */
function findWords(find: Find): string {
  switch (find.what) {
    case 'spellbook':
      return `Found a spellbook: ${spellMenuName(find.spell)}`;
    case 'scroll':
      return `Found a scroll of ${spellMenuName(find.spell)}`;
    case 'paper':
      return `Found a sheet of paper for ${spellMenuName(find.spell)}`;
    case 'wand':
      return `Found a wand of ${spellMenuName(find.spell)} with ${find.charges} charges`;
    case 'weapon':
      return `Found a ${find.item}`;
    case 'armour':
      return `Found ${find.item} armour`;
    case 'item':
    case 'potion':
      return `Found a ${find.item}`;
    case 'key':
      return `Found the trap door key labelled ${find.key}`;
    case 'money':
      return `Found ${find.amount} Greater-American Dollars`;
  }
}

/**
 * Every line a Dungeons of the Unforgiven run journal can say.
 *
 * An event with no case here is one there is nothing to report about: the record being saved,
 * the floor the port records instead of loading, the character being rolled.
 */
export function unforgivenJournal(pushed: { kind: string }): string | null {
  // The recorder holds the events as a list of kinds; this is the game that pushed them.
  const event = pushed as GameEvent;
  switch (event.kind) {
    case 'stepped':
      return `Stepped ${DIRECTIONS[event.dir]}`;
    case 'waited':
      return 'Waited a moment';
    case 'dug':
      if (event.outcome === 'hole') return `Dug through the floor to floor ${event.to}`;
      if (event.outcome === 'interrupted') return 'A monster interrupted the digging';
      return 'Too deep to dig, and moved somewhere else on the floor';
    case 'trapdoorTaken':
      return `Went down the trap door at ${event.from.x},${event.from.y} to floor ${event.to}`;
    case 'chuteTaken':
      return `Fell down the chute at ${event.from.x},${event.from.y} to floor ${event.to}`;
    case 'ladderTaken':
      return `Took the ladder to ${floorWords(event.to)}`;
    case 'buildingEntered':
      return `Went into the ${event.building}`;
    case 'floorReached':
      return `Reached ${floorWords(event.floor)}`;
    case 'sectionReached':
      return `Reached section ${event.section + 1}`;
    case 'dungeonReached':
      return `Arrived in ${UNFORGIVEN_MAP.dungeonName(event.dungeon)}`;
    case 'met':
      return `Came face to face with ${monsterWords(event.monster)}`;
    case 'swung':
      return event.damage === 0
        ? `Swung the ${event.weapon} at ${monsterWords(event.monster)} and missed`
        : `Swung the ${event.weapon} at ${monsterWords(event.monster)} and hit for ${event.damage}`;
    case 'hit':
      if (event.breath !== null) {
        const breath = BREATH_NAMES[event.breath] ?? '';
        return event.damage === 0
          ? `The ${event.monster.name} breathed ${breath} on you and it did nothing`
          : `The ${event.monster.name} breathed ${breath} on you for ${event.damage}`;
      }
      return event.damage === 0
        ? `The ${event.monster.name} missed`
        : `The ${event.monster.name} hit you for ${event.damage}`;
    case 'killed':
      return `Killed ${monsterWords(event.monster)} for ${event.experience} experience`;
    case 'spellDamaged':
      return `The spell hit ${monsterWords(event.monster)} for ${event.damage}`;
    case 'levelLost':
      return `The ${event.monster.name} drained ${event.levels === 1 ? 'a level' : `${event.levels} levels`}, down to level ${event.level}`;
    case 'experienceDrained':
      return `The ${event.monster.name} drained ${event.experience} experience`;
    case 'levelGained':
      return `Gained ${event.level - event.from === 1 ? 'a level' : `${event.level - event.from} levels`} at the inn: now level ${event.level}`;
    case 'cast':
      // Every cast this game pushes is one of its own, which says what it was cast out of.
      if (event.spell.game !== 'unforgiven') return null;
      return `Cast ${event.spell.name} ${CAST_SOURCES[event.spell.source]}`;
    case 'wandMade':
      return `Wrote a wand of ${spellMenuName(event.spell)} with ${event.charges} charges`;
    case 'scrollWritten':
      return `Wrote a scroll of ${spellMenuName(event.spell)}`;
    case 'itemUsed':
      return `Used the ${event.item}`;
    case 'dropped':
      return event.what === 'money'
        ? `Threw away ${event.amount} rubles`
        : `Dropped the ${event.item}`;
    case 'gearSwitched':
      return event.what === 'weapon' ? `Took up the ${event.item}` : `Put on ${event.item} armour`;
    case 'found':
      return findWords(event.find);
    case 'coinsSpent':
      return `Bought ${event.on} at the ${event.where} for ${event.amount} rubles`;
    case 'deposited':
      return `Put ${event.amount} rubles in the bank`;
    case 'withdrew':
      return `Took ${event.amount} rubles out of the bank`;
    case 'dollarsChanged':
      return `Changed ${event.dollars} Greater-American Dollars into ${event.rubles} rubles`;
    case 'tabletRead':
      return event.section === null
        ? "Read the snake's stone tablet in the town"
        : `Read the tablet in section ${event.section + 1}`;
    case 'hintRead':
      return `The snake said: ${snakeWords(event.hint)}`;
    case 'bossKilled':
      return `Beat the Shadow boss of section ${event.boss + 1}`;
    case 'gameWon':
      return 'Beat the Shadow Ogeroth and won the game';
    case 'died': {
      const module = UNFORGIVEN_MAP.dungeonName(event.dungeon);
      const where = event.floor === 0 ? `in the town of ${module}` : `on floor ${event.floor} of ${module}`;
      return event.monster === null ? `Died ${where}` : `Died to ${monsterWords(event.monster)} ${where}`;
    }
    default:
      return null;
  }
}
