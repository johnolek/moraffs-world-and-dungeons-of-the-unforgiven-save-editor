import { allMonsters, appearsOn, stockingOdds } from '../bestiary/monsters';
import { dropOdds } from '../game/dotu-mech.js';

export interface DropRow {
  name: string;
  /** Chance per kill, 0 to 1. */
  chance: number;
}

export interface Hunt {
  module: number;
  floor: number;
  cls: number;
  /** Weapon ids 1 to 7, Stick to Great Sword; a weapon you own never drops again. */
  ownedWeapons: number[];
}

export interface DropTables {
  /** How often the "YOU FIND" check passes; one pass in three still finds nothing. */
  findGate: number;
  /** How much of a floor's monsters are the level drainer whose kill pays a reward. */
  drainerShare: number;
  weapons: DropRow[];
  armors: DropRow[];
  items: DropRow[];
  drainer: DropRow[];
  spells: DropRow[];
}

/** Monster type index of the section's level drainer. */
const DRAINER_SLOT = 26;

/** The seven weapons a kill can drop, in the order the game rolls them; the index plus one is
 *  the weapon id the save file stores. Read out of dropOdds so the names cannot drift apart. */
export const WEAPON_NAMES = Object.keys(dropOdds(1, 0).weapons);

/** Keys start dropping on floor 4. The game also stops them below floor 179, which is deeper
 *  than the deepest floor in the game. */
const FIRST_KEY_FLOOR = 4;

/**
 * How often a floor's monsters are a drainer that takes a whole level. Only those pay the
 * potion or key; section 1's Sustrontima drains experience instead and pays nothing.
 */
export function drainerShare(module: number, floor: number): number {
  const drainer = allMonsters().find(
    (monster) =>
      monster.origin.kind === 'section' && monster.origin.slot === DRAINER_SLOT && appearsOn(monster, module, floor),
  );
  if (!drainer || drainer.levelDrain <= 0) return 0;
  return stockingOdds(drainer) ?? 0;
}

export function dropTables(hunt: Hunt): DropTables {
  const odds = dropOdds(hunt.floor, hunt.cls);
  const keyDrops = hunt.floor >= FIRST_KEY_FLOOR;
  const drainers = drainerShare(hunt.module, hunt.floor);
  return {
    // dropOdds reports the chance of ending up with an item, which is two passes in three.
    findGate: (odds.anyItem * 3) / 2,
    drainerShare: drainers,
    weapons: Object.entries(odds.weapons)
      .filter((_, index) => !hunt.ownedWeapons.includes(index + 1))
      .map(([name, chance]) => ({ name, chance })),
    armors: Object.entries(odds.armors).map(([name, chance]) => ({ name, chance })),
    items: Object.entries(odds.items).map(([name, chance]) => ({ name, chance })),
    drainer: [
      { name: 'Stat potion', chance: drainers * odds.drainerPotion },
      { name: 'Trap door key', chance: keyDrops ? drainers * odds.drainerKey : 0 },
    ],
    spells: [
      { name: `Spell book rolled (a random spell up to level ${odds.maxBookLevel})`, chance: odds.spellbookRoll },
      { name: `Scroll (up to level ${odds.maxScrollLevel})`, chance: odds.scroll },
      { name: `Wand (up to level ${odds.maxWandLevel})`, chance: odds.wand },
      { name: `Spell paper (up to level ${odds.maxPaperLevel})`, chance: odds.paper },
      { name: 'Cup of health (heals you)', chance: odds.healChance },
      { name: 'Ball of thought (+1 spell point)', chance: odds.spChance },
    ],
  };
}

/** Kills it takes on average to see one; null when it cannot drop here at all. */
export function expectedKills(chance: number): number | null {
  return chance > 0 ? 1 / chance : null;
}
