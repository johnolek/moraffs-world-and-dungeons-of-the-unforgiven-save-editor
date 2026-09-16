import { recolouredId } from '../../bestiary/monsters';
import data from '../dotu-data.json';
import { SeededRng } from '../port/rng';
import { FAITHFUL_RULES } from '../port/rules';
import type { MonsterKind } from '../port/state';

/**
 * What a section below the bottom of the game is made of: the section it is drawn and described
 * as, the five monsters that stand in it, and the theme they stand there under.
 *
 * The game has five monsters per section and twenty sections, and an endless dungeon has as many
 * sections as a character can walk down to. Each new one takes its five from the hundred the game
 * has — a Shadow boss, three regulars and a level drainer, each of them keeping everything about
 * it the game's own arithmetic reads — and paints them in a colour set other than their own so
 * that they do not read as the section they came from.
 */

/**
 * What a section does with its five monsters beyond standing them (John, MORF-512).
 *
 * A theme is about the monsters and nothing else. Module IV's last section is the model: every
 * one of its five breathes fire, which is what a character remembers about it long after the
 * names have gone. Nothing about the floor itself — its walls, its trap doors, its ladders —
 * knows that a theme exists.
 *
 * - `plain` — the five as they were drawn, stocked on the game's own odds.
 * - `fire` — every one of the five breathes fire.
 * - `ice` — every one of the five breathes ice.
 * - `drainers` — a second level drainer stands among the three regulars, and the section's own
 *   drainer comes up far more often.
 * - `afflictions` — the poison and the disease monsters come up far more often.
 * - `elites` — every monster of the section's floors is rolled as if the floor were deeper.
 */
export type SectionTheme = 'plain' | 'fire' | 'ice' | 'drainers' | 'afflictions' | 'elites';

/** The draw a section's theme is taken from: three sections in eight are plain, and each of the
 *  five themes has one in eight. */
const THEME_DRAW: SectionTheme[] = ['plain', 'plain', 'plain', 'fire', 'ice', 'drainers', 'afflictions', 'elites'];

/** The twenty sections the game itself has, which everything an endless section is made of is
 *  drawn out of. */
const OWN_SECTIONS = 20;

/**
 * The five rows load_md_bin (exe 2000:5fec) fills for a section, which follow the 22 built-in
 * monsters: 22 the Shadow boss, 23 to 25 the regulars, 26 the level drainer. The boss's slot
 * number doubles as how many built-in rows come before it.
 */
const BOSS_SLOT = 22;
const REGULAR_SLOTS = [23, 24, 25];
const DRAINER_SLOT = 26;

/** The breath a monster's row carries, as `dotu-data.json` holds the byte: 1 fire, 2 ice. A
 *  monster with any breath at all breathes it instead of striking about half the time. */
const FIRE_BREATH = 1;
const ICE_BREATH = 2;

/** The odd multiplier a 32-bit hash spreads its input with: two to the 32 over the golden
 *  ratio. */
const GOLDEN_RATIO = 0x9e3779b1;

/**
 * The colour sets a borrowed monster may be painted in.
 *
 * `scale_image2` (exe 4000:4818) adds `colorSet << 4` to a picture's pixel values, so the set
 * decides which run of the palette a monster is drawn out of. These three are the sets the game
 * paints its own monsters in, and they are the three whose run the dungeon palette fills: a
 * monster painted in set 3 or 4 would have most of its pixels in entries 64 to 79, which are
 * black everywhere outside a shop.
 */
const COLOUR_SETS = [0, 1, 2];

/** One of the game's own hundred monsters: the section it belongs to and the slot it fills
 *  there. */
interface Borrowed {
  /** 1 to 20. */
  section: number;
  /** 22 to 26. */
  slot: number;
}

/** A section below the bottom of the game. */
export interface EndlessSection {
  /** Which of the game's own twenty this section is drawn and described as: its walls, its
   *  palette and the words of its S screen. */
  source: number;
  /** What the section does with its five monsters. */
  theme: SectionTheme;
  /** The five monsters of slots 22 to 26. */
  monsters: MonsterKind[];
}

/**
 * One endless section, drawn from the world's seed and the section number and from nothing
 * else: no part of the character reaches these rolls, so everybody playing the same world walks
 * into the same section.
 *
 * The Shadow boss keeps the colours he came with. Every boss in the game is the picture of one
 * of his section's regulars painted so that what shows of it is black or nothing at all, which
 * is what makes him a shadow, and a set of his own would paint him in as a copy of the monster
 * he is the shadow of.
 */
export function endlessSection(seed: number, section: number): EndlessSection {
  const rng = new SeededRng(Math.imul(section, GOLDEN_RATIO) ^ seed);
  const source = rng.random(OWN_SECTIONS) + 1;
  const boss = borrow(rng, BOSS_SLOT);
  const regulars = threeRegulars(rng);
  const drainer = borrow(rng, DRAINER_SLOT);
  const monsters = [rowOf(boss), ...regulars.map((one) => repainted(one, rng)), repainted(drainer, rng)];
  // The theme comes out of the generator after the five monsters, so which five a section
  // stands does not depend on which theme it drew.
  const theme = THEME_DRAW[rng.random(THEME_DRAW.length)];
  return { source, theme, monsters: themed(monsters, theme) };
}

/**
 * The section's five monsters as its theme has them.
 *
 * A breathing theme is written into the rows themselves, because the row is where a monster's
 * blow reads its breath from (exe 2000:8817): a borrowed monster breathes here whatever the row
 * says, rather than what it breathed in the section it came from. Everything else about it is
 * untouched, and the picture is the picture either way.
 */
function themed(monsters: MonsterKind[], theme: SectionTheme): MonsterKind[] {
  if (theme === 'fire') return monsters.map((row) => ({ ...row, breath: FIRE_BREATH }));
  if (theme === 'ice') return monsters.map((row) => ({ ...row, breath: ICE_BREATH }));
  return monsters;
}

/** The 27 rows an endless section keeps loaded: the 22 monsters every section has, then its own
 *  five. */
export function endlessMonsterKinds(seed: number, section: number): MonsterKind[] {
  return [...builtinKinds(), ...endlessSection(seed, section).monsters];
}

/** The monsters the game keeps loaded whatever section the character is in. A fresh copy every
 *  time, because the rows of a game's table belong to that game. */
function builtinKinds(): MonsterKind[] {
  return FAITHFUL_RULES.monsterKinds(1).slice(0, BOSS_SLOT);
}

/** The monster of that slot in a section drawn at random. */
function borrow(rng: SeededRng, slot: number): Borrowed {
  return { section: rng.random(OWN_SECTIONS) + 1, slot };
}

/** Three of the sixty regulars, no two of them the same monster: a section with the same monster
 *  standing in it twice would have two thirds of the variety the game's own sections have. */
function threeRegulars(rng: SeededRng): Borrowed[] {
  const picked: Borrowed[] = [];
  while (picked.length < REGULAR_SLOTS.length) {
    const one = borrow(rng, REGULAR_SLOTS[rng.random(REGULAR_SLOTS.length)]);
    if (!picked.some((each) => each.section === one.section && each.slot === one.slot)) picked.push(one);
  }
  return picked;
}

/** The row of the loaded table a borrowed monster is, as the section it came from has it. */
function rowOf(borrowed: Borrowed): MonsterKind {
  return FAITHFUL_RULES.monsterKinds(borrowed.section)[borrowed.slot];
}

/** A borrowed monster painted in one of the colour sets the game does not paint it in. */
function repainted(borrowed: Borrowed, rng: SeededRng): MonsterKind {
  const row = rowOf(borrowed);
  const others = COLOUR_SETS.filter((set) => set !== ownColourSet(borrowed));
  return { ...row, id: recolouredId(row.id, others[rng.random(others.length)]) };
}

/** The colour set the game paints a monster in, out of its row of `dotu-data.json`. A section's
 *  five rows are in slot order, so the boss's slot number is where they start. */
function ownColourSet(borrowed: Borrowed): number {
  return data.sections[borrowed.section - 1].monsters[borrowed.slot - BOSS_SLOT].colorSet;
}
