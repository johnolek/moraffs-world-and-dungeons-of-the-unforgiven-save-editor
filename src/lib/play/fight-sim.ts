import { levelDistribution } from '../bestiary/distribution';
import type { Monster } from '../bestiary/monsters';
import { rollHp } from '../bestiary/roll';
import { SPELL_MENU_KEYS, SPELL_MENU_NAMES, spellIndex } from '../game/port/inventory';
import { savePlayer } from '../game/port/record';
import type { Rng } from '../game/port/rng';
import { portedSpell } from '../game/port/spell-index';
import { MAP_EMPTY, MAP_PLAYER, setMonsterMap, type PlayerCharacter } from '../game/port/state';
import { endBattleSpells, endPrepSpells } from '../game/port/town';
import { UNFORGIVEN_MAP, type MapSquare } from '../map/game';
import { GameSession, runMoveControl, startGame, type CharacterFile } from './engine';
import { monsterTypeOf } from './floor';
import { KEY } from './keys';
import { runPlayLoop } from './loop';

/**
 * The Fight tab: one monster, a copy of a character, and the game's own loop between them.
 *
 * Nothing here is a port of anything — the original has no such screen. It is the setup
 * `src/lib/play/battle.test-support.ts` builds for the fight tests, made into something a player
 * can fill in: the record is copied and edited, the monster is put down with the kind, level and
 * hit points that were asked for, and `movecontrol` is then left to run the fight exactly as the
 * Play tab does.
 *
 * Two things are deliberately not the Play tab's. The fight is set on a dungeon floor rather
 * than in the town, because call_check_eng (exe 2000:a319) gives no monster its attacks while
 * the character stands on floor 0, so a town fight is one-sided. And the session carries no
 * `RunRecorder`, so nothing here is written down as a run.
 */

/** The monster slot the fight's own monster stands in, which is the slot a floor's Shadow boss
 *  would have had. */
const FIGHT_SLOT = 0;

/** The way the character faces, which is the way the monster is put down. */
const NORTH = 0;

/** The ten lines of a spell list, three spells to a line. */
const SPELL_LINES = 10;
const SPELLS_PER_LINE = 3;

/** The monster the fight is against, as the setup form has it. */
export interface FightMonster {
  /** The catalogue id `src/lib/map/stocking.ts` knows the kind by. */
  monsterId: string;
  /** 0-based, the module whose floor the fight is set on. */
  module: number;
  /** A floor of that module the monster can really be stocked on, which is what decides the
   *  section the game loads its monster table from. */
  floor: number;
  /** The level the monster is stored with. */
  level: number;
  hp: number;
}

/** Everything a fight is built out of. */
export interface FightSetup {
  /** The record the character was copied from. Only the fields the form does not show are read
   *  out of it; nothing here ever writes it back to the roster. */
  record: Uint8Array;
  /** That record as the form has edited it, which is the character the fight is fought with. */
  character: PlayerCharacter;
  monster: FightMonster;
}

/** A group of the record's number fields, under the heading and the labels the Save Editor gives
 *  them (`src/lib/editor/games.ts`). */
export interface FightFieldGroup {
  title: string;
  fields: { key: FightFieldKey; label: string }[];
}

/** The fields of the character record the setup form edits, which are the ones that are plain
 *  numbers; the weapon and the armor are picked from lists of their own. */
export type FightFieldKey = {
  [Key in keyof PlayerCharacter]: PlayerCharacter[Key] extends number ? Key : never;
}[keyof PlayerCharacter];

/**
 * The numbers a fight reads, in the Save Editor's own groups and words.
 *
 * Everything `src/lib/game/port/combat.ts` reads off the character is here, less the timers the
 * spells set — those are cast rather than typed — and less where the character is standing,
 * which the fight decides for itself.
 */
export const FIGHT_FIELDS: FightFieldGroup[] = [
  { title: 'Level & Experience', fields: [{ key: 'lev', label: 'Player Level' }] },
  {
    title: 'Vitals',
    fields: [
      { key: 'hp', label: 'Current HP' },
      { key: 'maxHp', label: 'Maximum HP' },
      { key: 'sp', label: 'Current SP' },
      { key: 'maxSp', label: 'Maximum SP' },
    ],
  },
  {
    title: 'Stats',
    fields: [
      { key: 'str', label: 'Strength' },
      { key: 'iq', label: 'Intelligence' },
      { key: 'wis', label: 'Wisdom' },
      { key: 'con', label: 'Constitution' },
      { key: 'dex', label: 'Agility' },
      { key: 'luck', label: 'Luck' },
    ],
  },
  {
    title: 'Rings & Worn Items',
    fields: [
      { key: 'gauntlet', label: 'Gauntlets' },
      { key: 'protRing', label: 'Ring of Protection' },
      { key: 'bodyArmor', label: 'Body Armor' },
      { key: 'regenRings', label: 'Rings of Regeneration' },
      { key: 'luckyCharms', label: 'Lucky Charms' },
    ],
  },
  {
    title: 'Special Items',
    fields: [
      { key: 'grenades', label: 'Nuclear Hand Grenades' },
      { key: 'healingPotions', label: 'Potions of Healing' },
    ],
  },
];

/**
 * The levels stock_level (exe 2000:671e) could store a monster with on a floor of this base
 * level.
 *
 * The hit points are rolled from the floor's base level and the stored level is nudged away from
 * it afterwards, so the two numbers need not agree (`src/lib/bestiary/roll.ts`). This is how far
 * that nudge reaches, which is the same spread the Monsters tab charts.
 */
export function monsterLevelRange(baseLevel: number): { from: number; to: number } {
  const levels = levelDistribution(baseLevel);
  return { from: levels[0].level, to: levels[levels.length - 1].level };
}

/** The hit points stock_level rolls a monster of this kind on a floor of this base level. */
export function rollFightHp(entry: Monster, baseLevel: number, rnd: () => number = Math.random): number {
  return rollHp(entry, baseLevel, rnd);
}

/**
 * The square the character stands on to fight, the monster standing on the square to the north.
 *
 * It has to be a square movecontrol does nothing of its own on: a ladder, a trap door or a chute
 * under the character's feet all take the turn before a key can be pressed.
 */
export function fightSquare(floor: number, module: number): { x: number; y: number } {
  const rows: MapSquare[][] = UNFORGIVEN_MAP.floor(floor, module);
  for (let y = 2; y < 100; y++) {
    for (let x = 1; x < 76; x++) {
      const square = rows[y][x];
      if (square.solid || square.n !== 3 || rows[y - 1][x].solid) continue;
      if (square.ladder !== 0 || square.trapdoor !== -1 || square.chute !== 0) continue;
      return { x, y };
    }
  }
  throw new Error(`no square to fight on, floor ${floor} of module ${module + 1}`);
}

/**
 * Set a fight up: the character standing alone on a floor of the module, facing the square the
 * monster will be sent to, with `movecontrol` running.
 *
 * The monster comes afterwards rather than now, because cast_a_spell refuses a preparation spell
 * while a monster is engaged (exe DS:206f) and `movecontrol` engages one on its first pass, so a
 * monster put down here would be a monster no preparation spell could be cast against.
 *
 * The character arrives as if they had just come from the inn: {@link endBattleSpells} and
 * {@link endPrepSpells} are the two routines a night there calls, so a character saved in the
 * middle of an adventure does not bring their running spells into a fight meant to measure the
 * bare one. The permanent spells stay, since those are as much the character as their armor is.
 */
export function startFight(setup: FightSetup, rng: Rng): GameSession {
  const square = fightSquare(setup.monster.floor, setup.monster.module);
  const character: PlayerCharacter = {
    ...setup.character,
    level: setup.monster.floor,
    module: setup.monster.module,
    dir: NORTH,
    x: square.x,
    y: square.y,
  };
  const session = startGame(fightFile(savePlayer(character, setup.record)), rng);
  endBattleSpells(session.game);
  endPrepSpells(session.game);
  emptyTheFloor(session);
  void runPlayLoop(session, runMoveControl(session));
  return session;
}

/**
 * Put the monster down on the square the character faces and let the loop take it up.
 *
 * `movecontrol` works out what it is fighting at the top of a pass, so a monster put down while
 * the loop waits for a key is not met until the next key. The escape is that key: nothing is
 * bound to it, so the pass it buys does nothing but run attack_timing (exe 2000:b8f7).
 *
 * @returns false when the character is facing rock, where no monster of the game's ever stands.
 */
export async function sendInTheMonster(session: GameSession, monster: FightMonster): Promise<boolean> {
  const ahead = squareAhead(session);
  if (ahead === null) return false;
  plantTheMonster(session, monster, ahead);
  session.press(KEY.escape);
  await settle();
  return true;
}

/** The square the character faces, or null when it is rock or off the edge of the floor. 0 is
 *  north, 1 south, 2 west, 3 east, which is how `stepForward` (`move.ts`) reads the same byte. */
function squareAhead(session: GameSession): { x: number; y: number } | null {
  const pc = session.game.pc;
  const x = pc.x + (pc.dir === 2 ? -1 : pc.dir === 3 ? 1 : 0);
  const y = pc.y + (pc.dir === 0 ? -1 : pc.dir === 1 ? 1 : 0);
  return session.rows[y]?.[x]?.solid === false ? { x, y } : null;
}

/**
 * The character file a fight is played out of: a copy of the record, and nothing that reaches
 * the roster.
 *
 * `write` keeps whatever the game saved for as long as the fight lasts, and `died` does nothing
 * at all, so a character killed here is not marked dead the way one killed in the Play tab is
 * (`characterDied` in `src/lib/character/current.ts`).
 */
function fightFile(bytes: Uint8Array<ArrayBuffer>): CharacterFile {
  return {
    bytes,
    write(written) {
      this.bytes = written;
    },
    died() {},
  };
}

/**
 * Take every monster off the floor.
 *
 * load_level_map has just stocked it with 145 of them and a fight wants one, so the rest go: an
 * empty floor is the floor a character who had killed them all would be standing on, and nothing
 * else walks into the fight.
 */
function emptyTheFloor(session: GameSession): void {
  const game = session.game;
  for (const slot of game.monsters) {
    slot.x = 0;
    slot.y = 0;
    slot.hp = 0;
    slot.type = 0;
    slot.level = 1;
  }
  game.monsterMap.fill(MAP_EMPTY);
  setMonsterMap(game, game.pc.x, game.pc.y, MAP_PLAYER);
}

/** The one monster the fight is against, with the kind, level and hit points the form asked
 *  for, standing on the square the character faces. */
function plantTheMonster(session: GameSession, monster: FightMonster, at: { x: number; y: number }): void {
  const game = session.game;
  const planted = game.monsters[FIGHT_SLOT];
  planted.x = at.x;
  planted.y = at.y;
  planted.hp = monster.hp;
  planted.level = monster.level;
  planted.type = monsterTypeOf(monster.monsterId);
  setMonsterMap(game, at.x, at.y, FIGHT_SLOT);
}

/** The monster the fight was set up against, as the game holds it. */
export function fightMonster(session: GameSession) {
  return session.game.monsters[FIGHT_SLOT];
}

/** How a fight stands. */
export type FightOutcome = 'waiting' | 'fighting' | 'monsterDead' | 'characterDead';

/**
 * Whether either of the two is dead yet. A monster is dead the moment its hit points run out,
 * which is where movecontrol kills it (`kill.ts`).
 *
 * @param sent whether the monster has been sent in, since an empty slot before that reads as a
 *   monster with no hit points left.
 */
export function fightOutcome(session: GameSession, sent: boolean): FightOutcome {
  if (session.dead) return 'characterDead';
  if (!sent) return 'waiting';
  return fightMonster(session).hp < 1 ? 'monsterDead' : 'fighting';
}

/** One spell the Fight tab has a button for. */
export interface FightSpell {
  /** The list cast_a_spell's first menu numbers from 1: 1 preparation, 2 wizard battle, 3 priest
   *  battle. */
  type: number;
  /** 0..9, the line of that list. */
  level: number;
  /** 0..2, the place on the line. */
  slot: number;
  /** The name the game's own menu prints for it. */
  name: string;
}

/** One of the three lists of buttons. */
export interface FightSpellList {
  title: string;
  spells: FightSpell[];
}

/**
 * The spells that would end a fight by leaving it rather than changing it: the two that walk the
 * character through a wall or somewhere else on the floor, and the five that carry them to
 * another floor. `spell-index.ts` names the function of `magic.ts` every spell runs.
 */
const SPELLS_THAT_LEAVE = new Set([
  'ascend',
  'descend',
  'doubleAscend',
  'majorAscend',
  'majorDescend',
  'passWall',
  'relocateSpell',
]);

function fightSpells(type: number): FightSpell[] {
  const spells: FightSpell[] = [];
  for (let level = 0; level < SPELL_LINES; level++) {
    for (let slot = 0; slot < SPELLS_PER_LINE; slot++) {
      if (SPELLS_THAT_LEAVE.has(portedSpell(type, level, slot).fn)) continue;
      spells.push({ type, level, slot, name: SPELL_MENU_NAMES[type][level * SPELLS_PER_LINE + slot] });
    }
  }
  return spells;
}

/**
 * A button for every preparation and battle spell that changes a fight, in the game's own
 * order.
 *
 * The permanent list is left out whole: those spells take a month, cannot be cast below the town
 * and are paid for out of the character's maximum spell points.
 */
export const FIGHT_SPELL_LISTS: FightSpellList[] = [
  { title: 'Preparation spells', spells: fightSpells(1) },
  { title: 'Wizard battle spells', spells: fightSpells(2) },
  { title: 'Priest battle spells', spells: fightSpells(3) },
];

/**
 * The three keys cast_a_spell (exe 2000:e017) reads to cast one spell out of the spellbook: the
 * C key, the line of its first menu (exe DS:2507), and the spell's own letter in the table.
 */
export function castKeys(spell: FightSpell): number[] {
  return [KEY.cast, 0x31 + spell.type, SPELL_MENU_KEYS.charCodeAt(spell.level * SPELLS_PER_LINE + spell.slot)];
}

/**
 * Cast a spell the way a player casts one: the three keys pressed into the session one after
 * another, so the spell itself is cast_a_spell's and nothing here works out what a spell does.
 *
 * The copy is given the spell in its book first. The menu ignores the key for a spell the
 * character has none of and goes on waiting for another, so without that the button would leave
 * the spell table standing open.
 */
export async function castFightSpell(session: GameSession, spell: FightSpell): Promise<void> {
  session.game.pc.spellbook[spellIndex(spell.type, spell.level, spell.slot)] = 1;
  // The last spell may have left a message box standing, and a box waits for a key of its own
  // before the loop asks for the next one. Escape is that key, and with no box waiting it is a
  // key movecontrol does nothing with, so it costs the character nothing either way.
  session.press(KEY.escape);
  await settle();
  for (const key of castKeys(spell)) {
    session.press(key);
    await settle();
  }
}

/** Fill the copy's spell points up, so that a cast is not refused for want of them. */
export function fillSpellPoints(session: GameSession): void {
  session.game.pc.sp = session.game.pc.maxSp;
}

/** Let the loop get as far as it can with the keys it has been given. */
export const settle = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve));
