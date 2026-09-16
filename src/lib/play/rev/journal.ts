import type { Find } from '../../game/journal-events';
import { MORAFFS_REVENGE_MAP } from '../../map/game';
import { DIRECTIONS, floorWords, monsterWords } from '../journal';
import type { RevEvent } from './state';

/**
 * Every line a Moraff's Revenge run journal can say.
 *
 * `../journal.ts` is what this is for: the recorder turns each event the game pushed into one of
 * these lines and keeps it beside the run. Every word of them is John's, and every one is a case
 * of the one switch below, so changing what a run of this game says is changing this one
 * function.
 *
 * An event with no case here is one there is nothing to report about.
 */

/** What was found, as the line names it. */
function findWords(find: Find): string {
  switch (find.what) {
    // The names carry their own article where the game's own line does, which is every one of
    // them but the suits of armour.
    case 'weapon':
    case 'armour':
    case 'item':
    case 'potion':
      return `Found ${find.item}`;
    case 'money':
      return `Found treasure worth ${find.amount}`;
    // This game has no spellbooks, scrolls, wands or trap door keys of the shapes the other two
    // find: its spellbooks are `spellLearned` and its wands `wandFound`, both by colour.
    default:
      return 'Found something';
  }
}

export function moraffsRevengeJournal(pushed: { kind: string }): string | null {
  // The recorder holds the events as a list of kinds; this is the game that pushed them.
  const event = pushed as RevEvent;
  switch (event.kind) {
    case 'stepped':
      return `Stepped ${DIRECTIONS[event.dir]}`;
    case 'turned':
      return `Turned to face ${DIRECTIONS[event.facing]}`;
    case 'wayBlocked':
      return `A monster blocked the way ${DIRECTIONS[event.direction]}`;
    case 'ladderTaken':
      // This game pushes the shape that says which of the two the D key was; the shared one,
      // which the other two games push, has no false floor to ask about.
      return 'falseFloor' in event && event.falseFloor
        ? `The false floor gave way down to floor ${event.to}`
        : `Took the ladder to ${floorWords(event.to)}`;
    case 'chuteTaken':
      return `Fell down the chute at ${event.from.column},${event.from.row} to floor ${event.to}`;
    case 'floorReached':
      return `Reached ${floorWords(event.floor)}`;
    case 'buildingEntered':
      return `Went into the ${event.building}`;
    case 'met':
      return `Came face to face with ${monsterWords(event.monster)}`;
    case 'swung':
      return event.damage === 0
        ? `Swung the ${event.weapon} at ${monsterWords(event.monster)} and missed`
        : `Swung the ${event.weapon} at ${monsterWords(event.monster)} and hit for ${event.damage}`;
    case 'breathed':
      return `Breathed fire on ${monsterWords(event.monster)} for ${event.damage}`;
    case 'hit':
      return event.damage === 0
        ? `The ${event.monster.name} missed`
        : `The ${event.monster.name} hit you for ${event.damage}`;
    case 'killed':
      return `Killed ${monsterWords(event.monster)} for ${event.experience} experience`;
    case 'levelLost':
      return `The ${event.monster.name} drained a level, down to level ${event.level}`;
    case 'experienceDrained':
      return `The ${event.monster.name} drained ${event.experience} experience`;
    case 'levelGained':
      return `Gained a level: now level ${event.level}`;
    case 'cast':
      // Every cast this game pushes is one of its own, out of the dungeon's twelve or the
      // fight's.
      if (event.spell.game !== 'revenge') return null;
      return `Cast ${event.spell.name}`;
    case 'itemUsed':
      return `Used the ${event.item}`;
    case 'potionWoreOff':
      return `The ${event.potion} wore off`;
    case 'found':
      return findWords(event.find);
    case 'pillFound':
      return `Found a ${event.colour.toLowerCase()} pill`;
    case 'wandFound':
      return `Found a ${event.colour.toLowerCase()} wand with ${event.charges} charges`;
    case 'spellLearned':
      return event.set === 'prep'
        ? `Learned the level ${event.level} spell ${event.name}`
        : `Learned the level ${event.level} battle spell ${event.name}`;
    case 'coinsSpent':
      return `Bought ${event.on} at the ${event.where} for ${event.amount} jewel pieces`;
    case 'deposited':
      return `Put ${event.amount} jewel pieces in the bank`;
    case 'withdrew':
      return `Took ${event.amount} jewel pieces out of the bank`;
    case 'treasureSold':
      return `The bank turned ${event.amount} of treasure into jewel pieces`;
    case 'treasureDropped':
      return `Threw away ${event.amount} of treasure`;
    case 'fountainDrunk':
      return `Drank from the fountain of youth: generation ${event.generation}`;
    case 'raised':
      return event.how === 'raised'
        ? 'Carried out of the dungeon and raised in the town'
        : 'Came back as somebody else';
    case 'died': {
      const generation = MORAFFS_REVENGE_MAP.dungeonName(event.dungeon);
      const where =
        event.floor === 0
          ? `in the town of ${generation}`
          : `on floor ${event.floor} of ${generation}`;
      return event.monster === null
        ? `Died ${where}`
        : `Died to ${monsterWords(event.monster)} ${where}`;
    }
    default:
      return null;
  }
}
