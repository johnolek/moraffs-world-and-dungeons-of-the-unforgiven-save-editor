import { mwSpellHoldings } from '../../game/mw-port/inventory';
import { experienceForKill } from '../../game/mw-port/combat';
import { experienceNeeded } from '../../game/mw-port/levels';
import { mwSpellTimers } from '../../game/mw-port/screens';
import type { MwCharacter, MwGame } from '../../game/mw-port/state';
import { ARMOUR, MONSTERS, WEAPONS, hpRange } from '../../mw-bestiary/monsters';
import { mwHitChance, toHitTotal } from '../../mw-bestiary/to-hit';
import type { MapSquare } from '../../map/game';
import type { StockedMonster } from '../../map/stocking';
import { breathDamageChance, breathResisted, monsterHitsYouChance } from '../hits-you';
import { stepCost } from './moment';

/**
 * The numbers Moraff's World keeps and never prints: the moves left on every spell, the charges
 * on every wand, scroll and piece of paper, the poison and disease clocks, what the monster being
 * faced is made of and how often a swing lands on it, and what the square underfoot holds.
 *
 * Everything here reads the record and the ported tables and works nothing out of its own; each
 * function names where the number comes from. Nothing in this file writes.
 */

/** One line of the panel: what it is, the number, and a quieter word about it. */
export interface MwPanelLine {
  label: string;
  value: string;
  note?: string;
}

/** "1 move", "2 moves": a timer counts one off per move of the game. */
function moves(count: number): string {
  return `${count} move${count === 1 ? '' : 's'}`;
}

/** The two of FUN_2000_7421's lines that are afflictions rather than spells. */
const AILMENTS = ['DISEASE', 'POISON'];

/**
 * Every spell in force, with the number behind the line FUN_2000_7421 draws for it.
 *
 * {@link mwSpellTimers} is that panel's own list in its own order; what this adds is what the
 * number means. The battle spells count moves down to zero, Sleep and Hold Monster count the
 * engaged monster's turns, and the preparation markers have no clock at all — the level or the
 * flag stands there and only a night at the inn takes it off.
 *
 * A line whose number is zero is one the game does not draw at all, and the poison and disease
 * clocks are on the list but have a section of their own.
 */
export function mwSpellsInForce(game: MwGame): MwPanelLine[] {
  return mwSpellTimers(game)
    .filter((timer) => timer.turns > 0 && !AILMENTS.includes(timer.label))
    .map((timer) => ({ label: timer.label, value: timerValue(timer.label, timer.turns) }));
}

/**
 * The nine preparation spells whose number is a level or a flag rather than a clock. Protection
 * and Power Weapon have a level too, but the panel's number for them is their timer.
 */
const MARKERS = [
  'WEAPONS, PLUS',
  'ARMOR, PLUS',
  'FEATHER',
  'INVISIBILITY',
  'FAST - MOVE',
  'STRENGTH (PREP)',
  'AGILITY (PREP)',
  'SUPER STRENGTH',
  'SUPER AGILITY',
];

function timerValue(label: string, turns: number): string {
  if (MARKERS.includes(label)) return 'until you sleep';
  if (label === 'STOP MONSTER' || label === 'HOLD MONSTER') {
    return `${turns} monster turn${turns === 1 ? '' : 's'}`;
  }
  return moves(turns);
}

/** How long a poison or a disease waits between the points it takes, which monsters_move starts
 *  the clock again at. */
const AFFLICTION_MOVES = 450;

/**
 * The two clocks monsters_move (WORLD.EXE 2000:81cd) counts down: a poisoning takes a point of
 * strength when its clock reaches one and starts again, and a disease takes constitution. The
 * matching resistance spell stops the clock being counted down at all while it is in effect.
 */
export function mwAilments(pc: MwCharacter): MwPanelLine[] {
  const lines: MwPanelLine[] = [];
  if (pc.poisonTimer > 0) lines.push(ailmentLine('Poison', pc.poisonTimer, pc.resistPoisonTimer, 'Strength'));
  if (pc.diseaseTimer > 0) lines.push(ailmentLine('Disease', pc.diseaseTimer, pc.resistDiseaseTimer, 'Constitution'));
  return lines;
}

function ailmentLine(label: string, clock: number, resisted: number, costs: string): MwPanelLine {
  if (resisted > 0) {
    return { label, value: 'held off', note: `Resist ${label} is stopping the clock, so nothing is lost while it runs.` };
  }
  return {
    label,
    value: `${moves(clock - 1)} to −1 ${costs}`,
    note: `That point of ${costs} is gone for good, and the clock then starts again at ${AFFLICTION_MOVES} moves.`,
  };
}

/** One heading of the charges list, and its lines. */
export interface MwChargeGroup {
  title: string;
  lines: MwPanelLine[];
}

/**
 * Every scroll, wand and sheet of magic paper the character carries, with what is left on it.
 *
 * The spell screen shows a spell as held or NOT YET FOUND and never says how many are left;
 * these are the counts behind those words, out of {@link mwSpellHoldings}.
 */
export function mwCharges(game: MwGame): MwChargeGroup[] {
  const holdings = mwSpellHoldings(game);
  const group = (title: string, count: (held: (typeof holdings)[number]) => number): MwChargeGroup => ({
    title,
    lines: holdings
      .filter((held) => count(held) > 0)
      .map((held) => ({ label: held.name, value: String(count(held)) })),
  });
  return [
    group('Scrolls', (held) => held.scrolls),
    group('Wands', (held) => held.wands),
    group('Magic paper', (held) => held.paper),
  ];
}

/** The monster the character is fighting, as strike and experience_for_kill see it. */
export interface MwEngagedMonster {
  name: string;
  /** The monster's own depth, which stands in for the floor number in both formulas. */
  depth: number;
  hp: number;
  mostHp: number;
  /** What killing it is worth (WORLD.EXE 3000:b8d4). */
  experience: number;
  /** The share of swings that land, out of `src/lib/mw-bestiary/to-hit.ts`. */
  hitChance: number;
  /** The share of the monster's own turns that take hit points off the character, 0 to 1. */
  hitsYouChance: number;
}

/** The row of the monster table a puffball is, whose turn drains or raises a characteristic and
 *  never does damage (monster_turn, WORLD.EXE 2000:615c). */
const PUFFBALL_KIND = 6;

/** The floor past which monster_turn adds half of however far below it the character stands. */
const DEEP_FLOOR = 75;

/** The class number of a wizard, whose Intelligence goes onto the monster's roll. */
const WIZARD_CLASS = 2;

export function mwEngagedMonster(game: MwGame): MwEngagedMonster | null {
  if (game.engaged === -1) return null;
  const monster = game.monsters[game.engaged];
  const kind = MONSTERS[monster.type];
  if (!kind) return null;
  const pc = game.pc;
  const total = toHitTotal({
    lev: pc.lev,
    str: pc.str,
    luck: pc.luck,
    weapon: pc.weapon,
    weaponPlus: pc.weaponPlus[pc.weapon] ?? 0,
    gauntlet: pc.gauntlet,
  });
  return {
    name: kind.name,
    depth: monster.depth,
    hp: monster.hp,
    mostHp: hpRange(kind, monster.depth)[1],
    experience: experienceForKill(game, game.engaged),
    hitChance: mwHitChance(total, kind, monster.depth, WEAPONS[pc.weapon].damageDie),
    hitsYouChance: monsterHitsYouChance({
      attacks: kind.kind !== PUFFBALL_KIND && pc.sleepTimer < 1 && pc.holdMonsterTimer < 1,
      total: monsterTurnTotal(game, monster.depth, kind.attack + kind.defenceAndAttack),
      // monster_turn puts the wizard's Intelligence onto the roll, so it makes a wizard easier to
      // hit; Dungeons of the Unforgiven takes the same number off instead.
      wizardIq: pc.cls === WIZARD_CLASS ? pc.iq : 0,
      damageDie: kind.damageDie,
      floor: pc.floor,
      breath: kind.breath === 0 ? null : breathDamageChance(monster.depth, breathResisted(kind.breath, pc)),
    }),
  };
}

/**
 * What monster_turn (WORLD.EXE 2000:615c) adds to its d80 before it looks for damage: twice the
 * monster's depth and what its row brings, less everything the character wears, carries and is,
 * and plus half of however far past floor 75 they are standing.
 */
function monsterTurnTotal(game: MwGame, depth: number, kindAttack: number): number {
  const pc = game.pc;
  let total = depth * 2 + kindAttack;
  total -= pc.lev * 2;
  total -= pc.dex + pc.luck;
  total -= pc.unread7c7;
  total -= ARMOUR[pc.armor].armourClass;
  total -= pc.enchantArmorLevel;
  total -= pc.unread0dd;
  total -= pc.bodyArmorLevel;
  total -= pc.ringOfProtection;
  total -= pc.protectionLevel * pc.protectionLevel * 2;
  if (pc.floor > DEEP_FLOOR) total += Math.trunc((pc.floor - DEEP_FLOOR) / 2);
  return total;
}

/** One of the monsters standing on the floor, by how far off it is. */
export interface MwNearbyMonster {
  name: string;
  depth: number;
  hp: number;
  distance: number;
}

export function mwMonstersNearby(game: MwGame, monsters: StockedMonster[], most: number): MwNearbyMonster[] {
  const pc = game.pc;
  return monsters
    .map((monster) => ({
      name: MONSTERS[game.monsters[monster.slot].type]?.name ?? '',
      depth: monster.level,
      hp: monster.hp,
      distance: Math.abs(pc.x - monster.x) + Math.abs(pc.y - monster.y),
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, most);
}

/** How close a monster has to be before monsters_move walks it towards the character. */
export function mwChaseDistance(floor: number): number {
  return Math.trunc(floor / 10) + 10;
}

/** The five things a square of the surface can hold, in the order the generator numbers them. */
const SURFACE = ['store', 'temple', 'bank', 'inn', 'gate out to the world map'];

/**
 * What the square underfoot holds. Moraff's World works every one of these out of the same hash
 * the map is built from, so there is nothing to roll and nothing hidden about them but the fact
 * that the game only tells you about one at a time.
 */
export function mwSquareFacts(game: MwGame, square: MapSquare): MwPanelLine[] {
  const lines: MwPanelLine[] = [];
  if (square.ladder < 0) lines.push({ label: 'Ladder up', value: `${-square.ladder} floor${square.ladder === -1 ? '' : 's'}` });
  if (square.ladder > 0) lines.push({ label: 'Ladder down', value: `${square.ladder} floor${square.ladder === 1 ? '' : 's'}` });
  if (square.trapdoor !== -1) {
    const key = game.pc.trapdoorKeys[Math.trunc(square.trapdoor / 10) - 1] !== 0;
    lines.push({
      label: 'Trap door to floor',
      value: String(square.trapdoor),
      note: key ? undefined : 'A level drainer near that floor carries the key.',
    });
  }
  if (square.chute !== 0) lines.push({ label: 'Chute down to floor', value: String(square.chute), note: 'Standing here is falling.' });
  if (square.surface) lines.push({ label: 'Building', value: SURFACE[square.surface - 1] });
  return lines;
}

/** What a step costs and what the next level takes, which no screen of the game puts together. */
export function mwGoing(game: MwGame): MwPanelLine[] {
  const pc = game.pc;
  const needed = experienceNeeded(pc.lev + 1);
  return [
    { label: 'A step costs', value: moves(stepCost(game)), note: 'Half the time, and nothing at all the other half.' },
    { label: 'Moves spent', value: String(Math.round(game.movesTaken)) },
    { label: 'Experience', value: Math.round(pc.exp).toLocaleString() },
    {
      label: `To reach level ${pc.lev + 1}`,
      value: Math.max(0, Math.ceil(needed - pc.exp)).toLocaleString(),
      note: 'A level is gained by staying the night at an inn.',
    },
  ];
}
