import data from '../game/dotu-data.json';
import { MONSTER_TYPE_ODDS } from '../game/dotu-mech.js';
import { BOTTOM_LEVEL } from '../game/unfmap.js';
import { MODULE_NUMERALS } from '../map/labels';

type SectionData = (typeof data.sections)[number];

/** One row of the game's 16-entry monster type table. */
export interface MonsterType {
  type: number;
  hex: string;
  defense: number;
  damageDie: number;
  hpPerLevel: number;
  speed: number;
  /** The line the game prints when the monster turns up. */
  text: string;
}

export type MonsterOrigin =
  | { kind: 'builtin' }
  | {
      kind: 'section';
      /** 1..20 across all modules. */
      section: number;
      /** 0-based, as the map explorer counts modules. */
      module: number;
      /** 1..4 within the module. */
      part: number;
      /** Monster type index 22..26: 22 the Shadow boss, 23..25 the regulars, 26 the level drainer. */
      slot: number;
    };

export interface Monster {
  id: string;
  name: string;
  origin: MonsterOrigin;
  picnum: number;
  colorSet: number;
  color: number;
  type: MonsterType;
  expMult: number;
  levelDrain: number;
  statDrain: number;
  breath: number;
  special: number;
  /** Built-in monsters have no description in the game's data. */
  description: string | null;
  isBoss: boolean;
}

export interface MonsterGroup {
  label: string;
  monsters: Monster[];
}

/** A paragraph in MD.BIN starts with the monster's name in capitals followed by a colon. */
const DESCRIPTION_MARKER = /^[A-Z][A-Z .'-]+:/;

/**
 * The in-game description of each of a section's five monsters, in slot order.
 *
 * MD.BIN stores the five paragraphs as 20 forty-column lines with no separators, and a few
 * of them are headed by a name the monster table spells differently (FIRE ELEMENTAL for
 * Flame Elemental) or run in a different order than the monsters, so paragraphs are matched
 * to monsters by name where possible and handed out in order where not.
 */
export function monsterDescriptions(section: SectionData): string[] {
  const paragraphs = splitParagraphs(section.descriptions);
  const spare = paragraphs.filter((p) => !section.monsters.some((m) => m.name.toUpperCase() === p.name));
  return section.monsters.map((monster) => {
    const named = paragraphs.find((p) => p.name === monster.name.toUpperCase());
    return (named ?? spare.shift())?.text ?? '';
  });
}

function splitParagraphs(lines: string[]): { name: string; text: string }[] {
  const starts = lines.flatMap((line, i) => (DESCRIPTION_MARKER.test(line) ? [i] : []));
  return starts.map((start, i) => {
    const block = lines.slice(start, starts[i + 1] ?? lines.length);
    const name = DESCRIPTION_MARKER.exec(block[0])![0].slice(0, -1);
    block[0] = block[0].slice(name.length + 1).trim();
    return { name, text: joinLines(block) };
  });
}

/** Words the forty-column layout broke with a hyphen; every other line-ending hyphen in
 *  the game's text is a real compound such as Crab-Horse-Spider or shish-kabob. */
const LINE_BREAK_HYPHENS: Record<string, string> = {
  'temp-erature': 'temperature',
  'Unfor-givin': 'Unforgivin',
  'surf-boards': 'surfboards',
};

/** A line broken mid-word ends in a hyphen; the rest of the word follows with no space. */
function joinLines(block: string[]): string {
  const joined = block.reduce((text, line) => (text.endsWith('-') ? text + line : `${text} ${line}`)).trim();
  return Object.entries(LINE_BREAK_HYPHENS).reduce((text, [broken, whole]) => text.replace(broken, whole), joined);
}

/** special = 100 marks the Shadow boss of a section. */
const BOSS_SPECIAL = 100;

const builtins: Monster[] = data.builtinMonsters.map((monster) => ({
  id: `builtin-${monster.id}`,
  name: monster.name,
  origin: { kind: 'builtin' },
  picnum: monster.picnum,
  colorSet: monster.colorSet,
  color: monster.color,
  type: data.monsterTypes[monster.type],
  expMult: monster.expMult,
  levelDrain: monster.levelDrain,
  statDrain: monster.statDrain,
  breath: monster.breath,
  special: monster.special,
  description: null,
  isBoss: false,
}));

const sectionGroups: MonsterGroup[] = data.sections.map((section) => {
  const descriptions = monsterDescriptions(section);
  return {
    label: `Section ${section.section} · Module ${MODULE_NUMERALS[section.module - 1]} · ${section.monsters[0].name}`,
    monsters: section.monsters.map((monster, i) => ({
      id: `section-${section.section}-${monster.slot}`,
      name: monster.name,
      origin: {
        kind: 'section',
        section: section.section,
        module: section.module - 1,
        part: section.part,
        slot: monster.slot,
      },
      picnum: monster.picnum,
      colorSet: monster.colorSet,
      color: monster.color,
      type: data.monsterTypes[monster.type],
      expMult: monster.expMult,
      levelDrain: monster.levelDrain,
      statDrain: monster.statDrain,
      breath: monster.breath,
      special: monster.special,
      description: descriptions[i],
      isBoss: monster.special === BOSS_SPECIAL,
    })),
  };
});

const groups: MonsterGroup[] = [{ label: 'Built-in', monsters: builtins }, ...sectionGroups];

/** The 22 built-in monsters followed by the five monsters of each section, in slot order. */
export function allMonsters(): Monster[] {
  return groups.flatMap((group) => group.monsters);
}

/** The monster list as the database shows it: the built-ins, then one group per section. */
export function monsterGroups(): MonsterGroup[] {
  return groups;
}

/**
 * The id of a monster of the catalogue painted in a colour set other than the one the game
 * paints it in.
 *
 * An endless section's five monsters are borrowed from sections all over the game and repainted
 * so that they read as new ones (`src/lib/game/endless/README.md`). The colour set goes in the
 * id because everything that draws a monster draws it by its id: the 3-D view, the thumbnail on
 * the map and the portrait all look the monster up and read the colours off it, and none of them
 * has to know that the endless dungeon exists.
 */
export function recolouredId(id: string, colorSet: number): string {
  return `${id}-set${colorSet}`;
}

const RECOLOURED_ID = /^(.+)-set(\d+)$/;

/** The monster a recoloured id was made from and the colour set it is painted in, or null when
 *  the id names a monster of the catalogue itself. */
export function readRecolouredId(id: string): { id: string; colorSet: number } | null {
  const match = RECOLOURED_ID.exec(id);
  return match ? { id: match[1], colorSet: Number(match[2]) } : null;
}

/** An inclusive run of floors within one module; module is 0-based. */
export interface FloorRange {
  module: number;
  from: number;
  to: number;
}

export interface Appearance {
  kind: 'builtin' | 'section' | 'boss';
  ranges: FloorRange[];
}

/** One floor of one module, as the level control has it. */
export interface FloorChoice {
  module: number;
  floor: number;
}

/**
 * The floors of part 1..4 of a module. Each part is five floors per module number, except
 * the last, which runs on to the bottom of the module -- the same split as sectionOf().
 */
export function sectionFloors(module: number, part: number): FloorRange {
  const size = 5 * (module + 1);
  return { module, from: (part - 1) * size + 1, to: part === 4 ? BOTTOM_LEVEL[module] : part * size };
}

/** The modules the level control offers: any for a built-in, its own for a section monster. */
export function allowedModules(entry: Monster): number[] {
  return entry.origin.kind === 'builtin' ? [0, 1, 2, 3, 4] : [entry.origin.module];
}

/** The floors of the given module the monster can be stocked on. */
export function allowedFloors(entry: Monster, module: number): number[] {
  const ranges = whereItAppears(entry).ranges.filter((range) => range.module === module);
  return ranges.flatMap((range) => floorsOf(range));
}

/** Where the level control starts: the first floor the monster can appear on. */
export function homeFloor(entry: Monster): FloorChoice {
  const [first] = whereItAppears(entry).ranges;
  return { module: first.module, floor: first.from };
}

export function whereItAppears(entry: Monster): Appearance {
  if (entry.origin.kind === 'builtin') {
    return {
      kind: 'builtin',
      ranges: BOTTOM_LEVEL.map((bottom, module) => ({ module, from: 1, to: bottom })),
    };
  }
  const { module, part, section } = entry.origin;
  if (entry.isBoss) {
    const bossFloor = data.sections[section - 1].bossFloor;
    return { kind: 'boss', ranges: [{ module, from: bossFloor, to: bossFloor }] };
  }
  return { kind: 'section', ranges: [sectionFloors(module, part)] };
}

/** Can this monster be stocked on this floor? Module is 0-based; the town has no monsters. */
export function appearsOn(entry: Monster, module: number, floor: number): boolean {
  return whereItAppears(entry).ranges.some((range) => range.module === module && floor >= range.from && floor <= range.to);
}

export function floorsOf(range: FloorRange): number[] {
  return Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i);
}

/**
 * The six characteristics, in the order the stat-drain byte numbers them: 1..6 and -1..-6 name
 * the one the monster gives or takes (DotU RE notes 4.3 and 6.4). Moraff's World numbers them
 * the same way in puffball_stat at exe 2000:603f, and its bestiary reads this list.
 */
export const DRAINED_STATS = ['Strength', 'Intelligence', 'Wisdom', 'Constitution', 'Agility', 'Luck'];

/** breath 1..5 (RE notes 6.4); only fire and ice are used by any monster. */
const BREATH_ELEMENTS = ['fire', 'ice', 'acid', 'disease', 'poison'];

const PUFFBALL_SPECIAL = 6;

/** Puffballs change one of your stats when they hit you and are worth no experience. */
export function isPuffball(entry: Monster): boolean {
  return entry.special === PUFFBALL_SPECIAL;
}

/**
 * The fields of a monster the effects are read out of, which the game's own 29-byte record
 * carries as well as the catalogue entry does. The Play tab's debug mode shows the same lines
 * over the monster it is fighting, and reads them off the record the port loaded.
 */
export interface MonsterEffects {
  levelDrain: number;
  statDrain: number;
  breath: number;
  special: number;
  isBoss: boolean;
}

/** What the monster does to you beyond its ordinary attack. */
export function describeEffects(entry: MonsterEffects): string[] {
  const lines: string[] = [];
  if (entry.levelDrain > 0) {
    lines.push(`Drains ${entry.levelDrain} level${entry.levelDrain === 1 ? '' : 's'} when it hits you`);
  }
  if (entry.levelDrain < 0) lines.push(`Drains ${-entry.levelDrain} experience when it hits you`);
  if (entry.statDrain !== 0) {
    const stat = DRAINED_STATS[Math.abs(entry.statDrain) - 1];
    lines.push(`${entry.statDrain > 0 ? '+1' : '-1'} ${stat} when it hits you`);
  }
  if (entry.breath > 0) {
    const element = BREATH_ELEMENTS[entry.breath - 1];
    const extra = entry.breath === 3 ? ', which destroys your armor' : '';
    lines.push(`Breathes ${element} instead of striking half the time${extra}`);
  }
  if (entry.special === 1) lines.push('Poisons you when it hits you');
  if (entry.special === 2) lines.push('Gives you a disease when it hits you');
  if (entry.special === PUFFBALL_SPECIAL) lines.push('Vanishes when it hits you, and is worth no experience');
  if (entry.isBoss) lines.push('Immune to Go Away, Autokill, Drain Monster, Hold Monster and grenades');
  return lines;
}

/**
 * The chance a monster slot on one of the monster's floors is stocked with it; null for a
 * Shadow boss, which takes the floor's first slot rather than being rolled for. The roll is
 * 1/20 a puffball (12 equally likely), else 1/7 a blocker (garbage can or ball), else 1/15
 * the section's level drainer, else 1/12 a poison or disease monster (8 equally likely),
 * else one of the section's three regulars (FAQ v2.2 [GTPS], RE notes 4.1).
 */
export function stockingOdds(entry: Monster): number | null {
  if (entry.origin.kind === 'builtin') {
    if (entry.special === PUFFBALL_SPECIAL) return MONSTER_TYPE_ODDS.puffball / 12;
    if (entry.special === 0) return MONSTER_TYPE_ODDS.blocker / 2;
    return MONSTER_TYPE_ODDS.poisonDisease / 8;
  }
  if (entry.isBoss) return null;
  return entry.origin.slot === 26 ? MONSTER_TYPE_ODDS.levelDrainer : MONSTER_TYPE_ODDS.sectionMonster / 3;
}
