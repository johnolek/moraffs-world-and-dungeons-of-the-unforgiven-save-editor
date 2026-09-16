import { recolouredId } from '../../bestiary/monsters';
import data from '../dotu-data.json';
import { SeededRng } from '../port/rng';
import { FAITHFUL_RULES, type MonsterTypeOdds } from '../port/rules';
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

/**
 * How often the type roll reaches for the section's level drainer in a drainers section, where the
 * game's own answer is one roll in fifteen.
 *
 * With the second drainer standing in one of the three regular slots as well, about a third of
 * what such a floor stands takes a level off the character when it hits.
 */
const DRAINERS_THEME_ODDS = 5;

/**
 * How often the type roll reaches for the eight poison and disease monsters in an afflictions
 * section, where the game's own answer is one of the rolls left in twelve.
 *
 * It puts about a quarter of what such a floor stands on the character's characteristics rather
 * than on its hit points: a hit that poisons takes a point of strength every 450 moves from then
 * on, and one that gives a disease takes a point of constitution, until a temple or a spell puts
 * it right.
 */
const AFFLICTIONS_THEME_ODDS = 3;

/**
 * How many levels deeper than the floor an elites section rolls everything standing on it.
 *
 * A monster's level is what its hit points are rolled from, what the character's swing is counted
 * against and what the kill is paid for, so the whole floor is that much harder and that much
 * better paid. It is felt on the shallowest endless floors, where the base level is around a
 * hundred; further down the floor number swamps it.
 */
const ELITE_LEVELS = 2;

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
  return { source, theme, monsters: themed(monsters, theme, drainer, rng) };
}

/**
 * The line the S screen prints about a themed section, or null for a section that does nothing
 * worth a line.
 *
 * It stands where the fourth of MD.BIN's own forty-column lines would stand, so it is written to
 * that width: the tablet the words are cut into holds four lines and no more.
 */
export function themeNote(theme: SectionTheme): string | null {
  if (theme === 'fire') return 'Everything down here breathes fire.';
  if (theme === 'ice') return 'Everything down here breathes ice.';
  if (theme === 'drainers') return 'Level drainers are everywhere.';
  if (theme === 'afflictions') return 'Poison and disease are everywhere.';
  if (theme === 'elites') return 'The monsters here stand two levels up.';
  return null;
}

/** How many levels deeper than the floor a themed section rolls its monsters, which is none for
 *  every theme but the one that is about the levels. */
export function themeLevels(theme: SectionTheme): number {
  return theme === 'elites' ? ELITE_LEVELS : 0;
}

/**
 * How often the type roll reaches for each kind of monster on a floor of a themed section, which
 * is the four tests the game itself makes with the one the theme is about made likelier.
 */
export function themeTypeOdds(theme: SectionTheme): MonsterTypeOdds {
  const game = FAITHFUL_RULES.monsterTypeOdds(1);
  if (theme === 'drainers') return { ...game, levelDrainer: DRAINERS_THEME_ODDS };
  if (theme === 'afflictions') return { ...game, poisonDisease: AFFLICTIONS_THEME_ODDS };
  return game;
}

/**
 * The section's five monsters as its theme has them.
 *
 * A breathing theme is written into the rows themselves, because the row is where a monster's
 * blow reads its breath from (exe 2000:8817): a borrowed monster breathes here whatever the row
 * says, rather than what it breathed in the section it came from. Everything else about it is
 * untouched, and the picture is the picture either way.
 *
 * @param drainer the monster of slot 26, which a second drainer is drawn to be a different
 *   monster from.
 */
function themed(monsters: MonsterKind[], theme: SectionTheme, drainer: Borrowed, rng: SeededRng): MonsterKind[] {
  if (theme === 'fire') return monsters.map((row) => ({ ...row, breath: FIRE_BREATH }));
  if (theme === 'ice') return monsters.map((row) => ({ ...row, breath: ICE_BREATH }));
  if (theme === 'drainers') return withSecondDrainer(monsters, drainer, rng);
  return monsters;
}

/**
 * The five with one of the three regulars stood down for another of the game's twenty level
 * drainers.
 *
 * It takes the regular's slot, so the type roll reaches for it as often as it reached for the
 * regular, and it takes a level off the character when it hits because the draining is the row's
 * rather than the slot's (`gain_or_drain`, exe 2000:8189). A drainer killed on a floor is also
 * what carries that floor's trap door key, so a drainers section is where the keys are.
 */
function withSecondDrainer(monsters: MonsterKind[], drainer: Borrowed, rng: SeededRng): MonsterKind[] {
  let second = borrow(rng, DRAINER_SLOT);
  while (second.section === drainer.section) second = borrow(rng, DRAINER_SLOT);
  const five = [...monsters];
  // The five rows are the boss and then the four of slots 23 to 26, so the regulars are 1 to 3.
  five[1 + rng.random(REGULAR_SLOTS.length)] = repainted(second, rng);
  return five;
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
