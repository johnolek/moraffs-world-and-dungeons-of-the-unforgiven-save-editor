import { POTION_NAMES, WEAPON_NAMES } from '../port/drops';
import { SeededRng } from '../port/rng';
import type { Game, PlayerCharacter } from '../port/state';
import { endlessStateOf } from './state';

/**
 * The Shadows of the endless dungeon: the boss standing on the last floor of every section past
 * the twentieth, and what killing one of them is worth.
 *
 * kill_monster (exe 3000:b12d) has a reward written for each of the twenty sections the game has
 * and nothing at all for a twenty-first, so a Shadow this deep is handed over to here instead
 * (`GameRules.deepShadows`).
 */

/**
 * The two draws one floor of a world makes: which Shadow stands on it, and what that Shadow is
 * carrying.
 *
 * Nothing about the character reaches either, so a floor is the same floor for everybody playing
 * the world. `draw` tells the two apart, and the world's seed goes in inverted so that a floor's
 * draws are not the draws the section of that number makes (`endlessSection` in `monsters.ts`).
 */
function floorDraws(seed: number, floor: number, draw: number): SeededRng {
  return new SeededRng(Math.imul(floor * DRAWS_A_FLOOR + draw, GOLDEN_RATIO) ^ ~seed);
}

/** The odd multiplier a 32-bit hash spreads its input with: two to the 32 over the golden
 *  ratio. */
const GOLDEN_RATIO = 0x9e3779b1;

/** Which of a floor's draws is being made. */
const DRAWS_A_FLOOR = 2;
const WHAT_IT_CARRIES = 1;

/**
 * A Shadow below the bottom of the game has just been killed on the floor the character is
 * standing on: the kill written down, and the pile it was carrying handed over.
 *
 * The kill goes beside the record, since the record's own byte has one bit per section of a
 * module and the game has four in each. It is what keeps the boss off his floor from now on: a
 * section whose Shadow is not written down anywhere stands him up again every time his floor is
 * rolled.
 */
export function shadowKilled(game: Game, seed: number): void {
  const pc = game.pc;
  endlessStateOf(pc).bossesKilled.add(game.rules.sectionOf(pc.module, pc.level));
  handOverLoot(game, shadowLoot(seed, pc.level));
}

/**
 * The most potions one Shadow leaves behind, and the six colours they are drawn from (John,
 * MORF-504).
 *
 * The potions are the loot worth carrying home: each of the six raises one of the character's
 * characteristics and drops another (`src/lib/play/potions.ts`), and a characteristic is what
 * the to-hit total and the number of damage dice are counted off, so a pile of them is how much
 * deeper the character can go.
 */
const MOST_POTIONS = 20;
const POTION_COLOURS = 6;

/** How often a Shadow is carrying an orb as well as the potions: one in three (John, MORF-504). */
const ORB_ODDS = 3;

/**
 * The plus an orb puts on a weapon (John, MORF-504).
 *
 * The game's own orbs stop at the plus 101 the Shadow Ogeroth hands over for finishing it, which
 * is the end of the twenty sections; these are for the floors below them, where a monster's level
 * is the floor it stands on.
 */
const ORB_PLUSES = [200, 300, 500];

/** What a Shadow of the endless dungeon was carrying. */
export interface ShadowLoot {
  /** How many potions of each of the six colours, in the order the record counts them at
   *  0x15d. */
  potions: number[];
  /** The plus the orb puts on a weapon, or 0 for a Shadow carrying no orb. */
  weaponPlus: number;
}

/**
 * What the Shadow of a floor is carrying, drawn from the world and the floor and from nothing
 * else: the Shadow of floor 433 leaves the same pile behind for everybody who kills it.
 *
 * The potions come in one colour or in several, which is the colours drawn first and then the
 * pile shared out between them.
 */
export function shadowLoot(seed: number, floor: number): ShadowLoot {
  const rng = floorDraws(seed, floor, WHAT_IT_CARRIES);
  const colours = potionColours(rng);
  const potions = new Array<number>(POTION_COLOURS).fill(0);
  const carried = rng.random(MOST_POTIONS) + 1;
  for (let each = 0; each < carried; each += 1) potions[colours[rng.random(colours.length)]] += 1;
  const orb = rng.random(ORB_ODDS) === 0;
  return { potions, weaponPlus: orb ? ORB_PLUSES[rng.random(ORB_PLUSES.length)] : 0 };
}

/** The colours this Shadow's potions are in: between one and all six of them, no colour twice. */
function potionColours(rng: SeededRng): number[] {
  const wanted = rng.random(POTION_COLOURS) + 1;
  const colours: number[] = [];
  while (colours.length < wanted) {
    const colour = rng.random(POTION_COLOURS);
    if (!colours.includes(colour)) colours.push(colour);
  }
  return colours;
}

/**
 * The pile handed to the character and told in the message box, a `found` for each thing in it
 * pushed on the way so that the run journal and the summary count what a Shadow was worth.
 *
 * The box holds eight lines, which is what the heading and the six colours come to.
 */
function handOverLoot(game: Game, loot: ShadowLoot): void {
  const pc = game.pc;
  const lines: string[] = [];
  for (let colour = 0; colour < loot.potions.length; colour += 1) {
    const count = loot.potions[colour];
    if (count === 0) continue;
    pc.potions[colour] += count;
    for (let each = 0; each < count; each += 1) {
      game.events.push({ kind: 'found', find: { what: 'potion', item: POTION_NAMES[colour] } });
    }
    lines.push(`  ${count} ${POTION_NAMES[colour]}${count === 1 ? '' : 'S'}`);
  }
  game.say('  THE SHADOW LEAVES BEHIND:', '', ...lines);
  if (loot.weaponPlus === 0) return;
  const row = enhancedWeapon(pc);
  // The character keeps the better of the two: an orb is a find, and a find that took a plus 500
  // back down to 200 would be a punishment for killing the wrong Shadow.
  pc.weaponPlus[row] = Math.max(pc.weaponPlus[row], loot.weaponPlus);
  game.events.push({ kind: 'found', find: { what: 'item', item: `PLUS ${loot.weaponPlus} ${WEAPON_NAMES[row]}` } });
  game.say(
    '  THE SHADOW ALSO LEAVES AN',
    'ORB OF WEAPON ENHANCEMENT!',
    '',
    `  YOUR ${WEAPON_NAMES[row]} IS NOW`,
    `PLUS ${pc.weaponPlus[row]}.`,
  );
}

/** The weapon the orb is used on: the one in hand, or the best of the ones the character owns
 *  where the hand holds something they do not. */
function enhancedWeapon(pc: PlayerCharacter): number {
  if (pc.weaponsOwned[pc.weapon] > 0) return pc.weapon;
  for (let row = pc.weaponsOwned.length - 1; row > 0; row -= 1) {
    if (pc.weaponsOwned[row] > 0) return row;
  }
  return 0;
}
