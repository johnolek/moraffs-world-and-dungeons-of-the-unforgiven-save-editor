import { describeEffects } from '../bestiary/monsters';
import { hitChance, toHitTotal, type ToHitFighter } from '../bestiary/to-hit';
import { NAMED_SLOTS, SLOTS_PER_SUBCATEGORY, SPELL_NAMES, SPELL_SUBCATEGORIES } from '../editor/spell-names';
import { monsterHpRange, monsterLevelBase } from '../game/dotu-mech.js';
import { breathDamageChance, breathResisted, monsterHitsYouChance } from './hits-you';
import type { Game, PlayerCharacter } from '../game/port/state';
import { UNFORGIVEN_MAP, type MapSquare } from '../map/game';
import type { Mark } from '../map/marks';
import type { StockedMonster } from '../map/stocking';

/**
 * The numbers the game keeps and never prints: the moves left on every spell, the charges on
 * every wand, scroll and paper, the poison and the disease clocks, what the monster being faced
 * is made of, and what the square underfoot holds.
 *
 * Everything here reads the record and the ported tables and works nothing out of its own; each
 * function names the function of the game the number comes from. Nothing in this file writes.
 */

/** One line of the panel: what it is, the number, and a quieter word about it. */
export interface PanelLine {
  label: string;
  value: string;
  note?: string;
}

/** "1 move", "2 moves": a timer counts one off per moment of the game. */
function moves(count: number): string {
  return `${count} move${count === 1 ? '' : 's'}`;
}

/**
 * Every battle spell in effect, with the moves it has left and what it is doing while it runs.
 *
 * The spells and the order they come in are view_battle_spells' own, which
 * `battleSpellsInEffect` in `src/lib/character/record.ts` already prints for the status block;
 * what this adds is the number beside each one. `tickSpellTimers` (exe 2000:a1b7) takes one off
 * every timer per moment, so a timer is the moments the spell has left.
 *
 * Protection and Power Weapon are listed for the level standing beside their timer rather than
 * for the timer, which is what keeps one on the list after its timer has run out.
 */
export function spellTimers(pc: PlayerCharacter): PanelLine[] {
  const lines: PanelLine[] = [];
  if (pc.protection !== 0) {
    lines.push(
      timerLine(
        `Protection, level ${pc.protection}`,
        pc.protectionTime,
        "Levels 1 to 4 take 2, 8, 18 or 32 off a monster's roll to hit you. A cast lasts 60 moves.",
      ),
    );
  }
  if (pc.strengthTimer > 0) lines.push(lending('Strength', pc.strengthTimer, '+7 Strength'));
  if (pc.powerWeapon !== 0) {
    lines.push(
      timerLine(
        `Power Weapon ${pc.powerWeapon}`,
        pc.powerWeaponTime,
        "Levels 1 to 3 swing a damage die of 129, 199 or 399 in place of your weapon's. A cast lasts 60 moves.",
      ),
    );
  }
  if (pc.speedTimer > 0) lines.push(lending('Speed', pc.speedTimer, '+7 Agility'));
  if (pc.slowEnemiesTimer > 0) {
    lines.push(
      timerLine(
        'Slow Enemies',
        pc.slowEnemiesTimer,
        'One moment in four, every monster on the floor waits a third of your Agility longer for its next attack. A cast lasts 60 moves.',
      ),
    );
  }
  if (pc.holdMonsterTimer > 0) {
    lines.push(
      timerLine(
        'Hold Monster',
        pc.holdMonsterTimer,
        'The monster you are fighting cannot attack. A cast lasts 15 moves, and the deeper the floor the likelier it breaks free early.',
      ),
    );
  }
  if (pc.sleepTimer > 0) {
    lines.push(
      timerLine(
        'Sleep',
        pc.sleepTimer,
        'The monster you are fighting cannot attack. A cast lasts 25 moves, and the deeper the floor the likelier it wakes early.',
      ),
    );
  }
  if (pc.resistDrainTimer > 0) {
    lines.push(
      timerLine(
        'Resist Level Drain',
        pc.resistDrainTimer,
        'Nothing a monster does can take a level or your experience off you. A cast lasts 60 moves.',
      ),
    );
  }
  if (pc.resistPoisonTimer > 0) {
    lines.push(
      timerLine(
        'Resist Poison',
        pc.resistPoisonTimer,
        'No monster can poison you, a poison already in you stops counting down, and a poison breath does half damage. A cast lasts 60 moves.',
      ),
    );
  }
  if (pc.resistDiseaseTimer > 0) {
    lines.push(
      timerLine(
        'Resist Disease',
        pc.resistDiseaseTimer,
        'No monster can give you a disease, a disease already in you stops counting down, and a disease breath does half damage. A cast lasts 60 moves.',
      ),
    );
  }
  if (pc.antiColdTimer > 0) {
    lines.push(timerLine('Anti-Cold', pc.antiColdTimer, 'An ice breath does half damage. A cast lasts 60 moves.'));
  }
  if (pc.antiFireTimer > 0) {
    lines.push(timerLine('Anti-Fire', pc.antiFireTimer, 'A fire breath does half damage. A cast lasts 60 moves.'));
  }
  return lines;
}

function timerLine(label: string, left: number, note: string): PanelLine {
  if (left > 0) return { label, value: moves(left), note };
  return { label, value: 'out of moves', note: `${note} Only a night at the inn takes it off you.` };
}

/** A spell that hands a characteristic back the moment its timer runs out. */
function lending(label: string, left: number, lent: string): PanelLine {
  return timerLine(label, left, `${lent} while it runs. A cast lasts 60 moves.`);
}

/** How long a disease or a poison waits between the points it takes, which pass_moment starts
 *  the clock again at. */
const AILMENT_MOVES = 450;

/**
 * The poison and the disease clocks: the moves until each one takes its next point.
 *
 * pass_moment (exe 2000:a53c) counts the clock down by one a moment and takes the point when it
 * reaches 1, so the moves left are one fewer than the number in the record. The point is gone for
 * good and the clock starts again at 450. The matching resistance spell stops the clock being
 * counted down at all while it is in effect.
 */
export function ailments(pc: PlayerCharacter): PanelLine[] {
  const lines: PanelLine[] = [];
  if (pc.poison > 0) lines.push(ailmentLine('Poison', pc.poison, pc.resistPoisonTimer, 'Strength'));
  if (pc.disease > 0) lines.push(ailmentLine('Disease', pc.disease, pc.resistDiseaseTimer, 'Constitution'));
  return lines;
}

function ailmentLine(label: string, clock: number, resisted: number, costs: string): PanelLine {
  if (resisted > 0) {
    return { label, value: 'held off', note: `Resist ${label} is stopping the clock, so nothing is lost while it runs.` };
  }
  return {
    label,
    value: `${moves(Math.max(0, clock - 1))} to −1 ${costs}`,
    note: `That point of ${costs} is gone for good, and the clock then starts again at ${AILMENT_MOVES} moves.`,
  };
}

/** What a spell with no timer is waiting for: a permanent one waits for nothing. */
const UNTIL_THE_INN = 'Lasts until a night at the inn.';
const FOR_GOOD = 'Lasts for good.';

/**
 * The spells in effect that have no timer at all.
 *
 * end_prep_spells (exe 2000:4212) is what ends them, and it only clears a 1, so Feather,
 * Invisibility and Fast Move each read as the preparation spell at 1 and the permanent one at
 * 100. Body Armor, the Ring of Protection and the Anti-Magic Ring are permanent spells that
 * nothing takes away.
 */
export function untimedSpells(pc: PlayerCharacter): PanelLine[] {
  const lines: PanelLine[] = [];
  if (pc.tempWeaponPlus !== 0) {
    lines.push({ label: 'Enchant Weapon', value: `+${pc.tempWeaponPlus}`, note: 'On the weapon in hand. ' + UNTIL_THE_INN });
  }
  if (pc.tempArmorPlus !== 0) {
    lines.push({ label: 'Enchant Armor', value: `+${pc.tempArmorPlus}`, note: 'On the armor worn. ' + UNTIL_THE_INN });
  }
  if (pc.prepStrength !== 0) {
    lines.push({ label: 'Strength', value: `+${pc.prepStrength} Strength`, note: UNTIL_THE_INN });
  }
  if (pc.prepAgility !== 0) {
    lines.push({ label: 'Agility', value: `+${pc.prepAgility} Agility`, note: UNTIL_THE_INN });
  }
  if (pc.superStrength !== 0) {
    lines.push({ label: 'Super Strength', value: `+${pc.superStrength} Strength`, note: UNTIL_THE_INN });
  }
  if (pc.superAgility !== 0) {
    lines.push({ label: 'Super Agility', value: `+${pc.superAgility} Agility`, note: UNTIL_THE_INN });
  }
  if (pc.fastMove === 1) {
    lines.push({
      label: 'Fast Move',
      value: 'in effect',
      note: `One moment in four goes by with no poison, no disease and no monster moving. ${UNTIL_THE_INN}`,
    });
  }
  if (pc.feather !== 0) {
    lines.push({
      label: 'Feather',
      value: 'in effect',
      note: `Your own weight stops counting against what you can carry; your gear still weighs what it weighs. ${lasting(pc.feather)}`,
    });
  }
  if (pc.invisible !== 0) {
    lines.push({
      label: 'Invisibility',
      value: 'in effect',
      note: `One moment in four goes by with no monster moving. ${lasting(pc.invisible)}`,
    });
  }
  if (pc.bodyArmor !== 0) {
    lines.push({
      label: 'Body Armor',
      value: `level ${pc.bodyArmor}`,
      note: `Its level comes off a monster's roll to hit you. ${FOR_GOOD}`,
    });
  }
  if (pc.protRing !== 0) {
    lines.push({
      label: 'Ring of Protection',
      value: `+${pc.protRing}`,
      note: `Its plus comes off a monster's roll to hit you. ${FOR_GOOD}`,
    });
  }
  if (pc.antiMagicRing !== 0) {
    lines.push({
      label: 'Anti-Magic Ring',
      value: `+${pc.antiMagicRing}`,
      note: `Nothing but the inventory screen ever reads it, so it does nothing at all. ${FOR_GOOD}`,
    });
  }
  return lines;
}

/** The permanent version of a spell writes 100 where the preparation one writes 1. */
function lasting(value: number): string {
  return value === 1 ? UNTIL_THE_INN : FOR_GOOD;
}

/** One of the three things a character carries spells on. */
export interface ItemGroup {
  title: string;
  lines: PanelLine[];
}

/**
 * The charges on every wand, scroll and spell paper the character holds.
 *
 * The three arrays are 180 counts each, indexed `type * 45 + level * 3 + slot` the way
 * `write_scroll_or_wand` (exe 3000:d384) writes them, so `src/lib/editor/spell-names.ts` names
 * the spell every count belongs to. Only the first 30 slots of each 45 are spells; the game
 * writes nothing to the other fifteen, and the save editor shows them the same way.
 */
export function magicItems(pc: PlayerCharacter): ItemGroup[] {
  return [
    { title: 'Wands', lines: chargedSpells(pc.wands) },
    { title: 'Scrolls', lines: chargedSpells(pc.scrolls) },
    { title: 'Papers', lines: chargedSpells(pc.papers) },
  ];
}

function chargedSpells(counts: number[]): PanelLine[] {
  const lines: PanelLine[] = [];
  SPELL_SUBCATEGORIES.forEach((subcategory, list) => {
    for (let slot = 0; slot < SLOTS_PER_SUBCATEGORY; slot++) {
      const held = counts[list * SLOTS_PER_SUBCATEGORY + slot] ?? 0;
      if (held <= 0) continue;
      if (slot >= NAMED_SLOTS) {
        lines.push({ label: `${subcategory.title} slot ${slot + 1} (unused)`, value: String(held) });
        continue;
      }
      lines.push({
        label: SPELL_NAMES[subcategory.key][slot],
        value: String(held),
        note: `${subcategory.title}, level ${Math.trunc(slot / 3) + 1}`,
      });
    }
  });
  return lines;
}

/** Byte 24 of a monster description: 100 marks a Shadow boss, which is stocked with more hit
 *  points than anything else on its floor. */
const SHADOW_BOSS_SPECIAL = 100;

/** Byte 24's other value that matters here: 6 marks a puffball, whose turn drains or raises a
 *  characteristic and never does damage (defend, exe 2000:82b7). */
const PUFFBALL_SPECIAL = 6;

/** The floor past which defend adds half of however far below it the character is standing. */
const DEEP_FLOOR = 75;

/** The class number of a wizard, whose Intelligence comes off the monster's roll. */
const WIZARD_CLASS = 2;

/** Where the eight weapons end and the four Power Weapon rows of the weapon table begin. */
const FIRST_POWER_WEAPON_ROW = 8;

/** What the panel says about the monster the character is up against. */
export interface EngagedMonster {
  /** The name the game's own battle messages call it, in the capitals it stores. */
  name: string;
  level: number;
  hp: number;
  /** The most a monster of this kind is ever stocked with on this floor. */
  mostHp: number;
  /** The share of swings the game itself calls hits, 0 to 1. */
  hitChance: number;
  /** The share of the monster's own attacks that take hit points off the character, 0 to 1. */
  hitsYouChance: number;
  /** What it does beyond an ordinary hit, in the words the Monsters tab uses for the same
   *  monster: the drains, the breath, the poison and the disease. Empty for a monster that only
   *  hits. */
  effects: string[];
}

/**
 * The slot of the monster the panel is about: the one straight ahead, and otherwise the one
 * being fought. `GameSession.view` picks the same one for the map.
 */
function engagedSlot(game: Game): number {
  return game.engagedAhead === -1 ? game.engaged : game.engagedAhead;
}

/**
 * The monster being faced, with the chance the character's next swing lands.
 *
 * `strike` (exe 2000:7e3c, in `src/lib/game/port/combat.ts`) is what the chance is counted out
 * of: it adds random(80) to the character's total, takes off the monster's `2 * level + defense
 * + speed`, and rolls one weapon damage die per full 40 points left over. `hitChance` in
 * `src/lib/bestiary/to-hit.ts` counts those eighty rolls rather than sampling them, and it is
 * the same number the Monsters tab prints. It leaves out the one-in-thirty bonus of 40 that
 * strike rolls past floor 75, so the chance is a little low down there.
 *
 * A Power Weapon spell swings its own damage die eight rows further into the weapon table while
 * the to-hit bonus and the plus still come from the weapon in hand, exactly as strike reads them.
 */
export function engagedMonster(game: Game): EngagedMonster | null {
  const slot = engagedSlot(game);
  if (slot === -1) return null;
  const monster = game.monsters[slot];
  const kind = game.monsterKinds[monster.type];
  if (!kind) return null;
  const stats = game.monsterStats[kind.type];
  const pc = game.pc;
  const fighter: ToHitFighter = {
    lev: pc.lev,
    str: pc.str,
    luck: pc.luck,
    luckyCharms: pc.luckyCharms,
    weaponHit: game.weaponHit[pc.weapon],
    gauntlet: pc.gauntlet,
    weaponPlus: pc.weaponPlus[pc.weapon] ?? 0,
    tempWeaponPlus: pc.tempWeaponPlus,
    hard: pc.hard !== 0,
  };
  const damageRow = pc.powerWeapon !== 0 ? pc.powerWeapon + FIRST_POWER_WEAPON_ROW : pc.weapon;
  const boss = kind.special === SHADOW_BOSS_SPECIAL;
  // The hit points were rolled from the floor's base level, before the nudge that gave this
  // monster the level it stands at, so the ceiling is the floor's and not the monster's.
  const baseLevel = monsterLevelBase(pc.level, pc.module);
  const [, mostHp] = monsterHpRange(stats.hpPerLevel, baseLevel, boss, game.rules.sectionOf(pc.module, pc.level));
  return {
    name: kind.name,
    level: monster.level,
    hp: monster.hp,
    mostHp,
    hitChance: hitChance(toHitTotal(fighter), monster.level, stats.defense, stats.speed, game.weaponDamage[damageRow]),
    hitsYouChance: monsterHitsYouChance({
      attacks: kind.special !== PUFFBALL_SPECIAL && pc.sleepTimer < 1 && pc.holdMonsterTimer < 1,
      total: defendTotal(game, monster.level),
      // defend takes the wizard's Intelligence off the roll, so it makes a wizard harder to hit.
      wizardIq: pc.cls === WIZARD_CLASS ? -pc.iq : 0,
      damageDie: stats.damageDie,
      floor: pc.level,
      breath: kind.breath === 0 ? null : breathDamageChance(monster.level, breathResisted(kind.breath, pc)),
    }),
    effects: describeEffects({ ...kind, isBoss: boss }),
  };
}

/**
 * What defend (exe 2000:82b7) adds to its d80 before it looks for damage: twenty and twice the
 * monster's level, less everything the character wears, carries and is, and plus half of however
 * far past floor 75 they are standing.
 *
 * The permanent plus on the armor being worn is not in the subtraction, which is the game's own
 * omission and is why an enchanted suit defends no better than a plain one.
 */
function defendTotal(game: Game, monsterLevel: number): number {
  const pc = game.pc;
  let total = 20 + monsterLevel * 2;
  total -= pc.lev * 2;
  total -= pc.dex + pc.luck;
  total -= Math.trunc(pc.dex / 2);
  total -= pc.luckyCharms;
  total -= game.armorHitChance[pc.armor];
  total -= pc.tempArmorPlus;
  total -= pc.shield;
  total -= pc.bodyArmor;
  total -= pc.protRing;
  total -= pc.protection * pc.protection * 2;
  if (pc.level > DEEP_FLOOR) total += Math.trunc((pc.level - DEEP_FLOOR) / 2);
  return total;
}

/** How many floors apart the trap door keys are: one key per five floors (explain_trapdoor,
 *  exe 2000:be3d). */
const KEY_STEP = 5;

/**
 * Why the square's lines are facts rather than odds. The dungeon is a hash of the square's own
 * coordinates — `trapdoor` and `detect_chute` in `src/lib/game/unfmap.js` — so asking whether a
 * trap door or a chute is here has an answer, and there is no chance about it.
 */
export const SQUARE_NOTE =
  'The dungeon is worked out from the square itself, so this is what is on it, not the odds of it.';

/**
 * What the square the character stands on holds: the ladder, the town building, the trap door
 * and the floor it leads to, and the chute and the floor it drops to.
 *
 * The generator only puts a building, a trap door or a chute on a square with no ladder, which
 * is the order the game itself asks in (drawsquare exe 3000:87de, movecontrol exe 2000:c308).
 */
export function squareFacts(game: Game, square: MapSquare): PanelLine[] {
  const pc = game.pc;
  const lines: PanelLine[] = [];
  if (square.ladder !== 0) {
    const to = pc.level + square.ladder;
    const where = square.ladder > 0 ? `down to floor ${to}` : to === 0 ? 'up to the town' : `up to floor ${to}`;
    lines.push({ label: 'Ladder', value: where });
  }
  const building = UNFORGIVEN_MAP.buildingOn(square);
  if (building !== 0) {
    lines.push({ label: UNFORGIVEN_MAP.buildings[building - 1].label, value: 'on this square' });
  }
  if (square.trapdoor >= 0) {
    const held = pc.keys[Math.trunc(square.trapdoor / KEY_STEP)] !== 0;
    lines.push({
      label: 'Trap door',
      value: `to floor ${square.trapdoor}`,
      note: held
        ? 'You have the key it is labelled with.'
        : 'Its key is carried by a level drainer near the floor it leads to.',
    });
  }
  if (square.chute !== 0) {
    lines.push({
      label: 'Chute',
      value: `drops to floor ${square.chute}`,
      note: 'Standing on it is falling down it; there is no key to press.',
    });
  }
  return lines;
}

/** One kind of monster stocked on the floor, as debug mode's list names it. */
export interface FloorMonsterKind {
  /** The id the Monsters tab keys this kind by, which is what a highlighted kind is named by. */
  monsterId: string;
  name: string;
  /** How many of this kind are standing on the floor. */
  count: number;
  /** The lowest and the highest level any of them was stocked at. */
  lowestLevel: number;
  highestLevel: number;
  /** Squares to the nearest one, counted the way pass_moment counts them: the two axes added
   *  together. */
  nearest: number;
}

/**
 * Every kind of monster standing on the floor, the nearest kind first, with how many there are of
 * each.
 *
 * This is the port's own list rather than anything the game shows, and it leaves nothing out: the
 * section's Shadow boss is a kind like any other here, and so is a kind whose only member is
 * standing at the far corner of the floor. The S key's own screen is where the game's rule about
 * showing the nearest five lives.
 */
export function floorMonsterKinds(game: Game, monsters: StockedMonster[]): FloorMonsterKind[] {
  const pc = game.pc;
  const away = (monster: StockedMonster) => Math.abs(pc.x - monster.x) + Math.abs(pc.y - monster.y);
  const kinds = new Map<string, FloorMonsterKind>();
  for (const monster of monsters) {
    const distance = away(monster);
    const found = kinds.get(monster.monsterId);
    if (found) {
      found.count++;
      found.lowestLevel = Math.min(found.lowestLevel, monster.level);
      found.highestLevel = Math.max(found.highestLevel, monster.level);
      found.nearest = Math.min(found.nearest, distance);
      continue;
    }
    kinds.set(monster.monsterId, {
      monsterId: monster.monsterId,
      name: game.monsterKinds[game.monsters[monster.slot].type]?.name ?? '',
      count: 1,
      lowestLevel: monster.level,
      highestLevel: monster.level,
      nearest: distance,
    });
  }
  return [...kinds.values()].sort((left, right) => left.nearest - right.nearest || left.name.localeCompare(right.name));
}

/** The square of every monster of one kind, which is what the maps ring while that kind is the
 *  one picked out of the list. Nothing is picked, nothing is ringed. */
export function monsterKindSquares(monsters: StockedMonster[], monsterId: string | null): Mark[] {
  if (monsterId === null) return [];
  return monsters
    .filter((monster) => monster.monsterId === monsterId)
    .map((monster) => ({ x: monster.x, y: monster.y, label: null }));
}

/** How far off a monster has to be before pass_moment leaves it standing where it is. */
export function chaseDistance(floor: number): number {
  return Math.trunc(floor / 10) + 10;
}
