import { allMonsters, isPuffball, type Monster } from '../bestiary/monsters';
import { renderMonster } from '../bestiary/pictures';
import { nudgeLevel, rollHp } from '../bestiary/roll';
import { FAITHFUL_RULES, type GameRules, type SectionPlace } from '../game/port/rules';
import { sectionInfo } from '../game/sections';
import { HEIGHT, WIDTH } from '../game/unfmap.js';
import { isOnMap, type MapArea } from './area';
import type { MapSquare, MapStocking, StockedKind } from './game';

/** Monsters the game keeps for one floor, boss included (RE notes 4.1). */
export const MONSTER_SLOTS = 145;

/** Monster type indexes the game loads from MD.BIN for the current section. */
const BOSS_SLOT = 22;
const FIRST_REGULAR_SLOT = 23;
const LEVEL_DRAINER_SLOT = 26;

/** Built-in monsters by their index in the game's table: 0..1 blockers, 2..13 puffballs,
 *  14..21 poison and disease. */
const FIRST_PUFFBALL = 2;
const PUFFBALL_COUNT = 12;
const BLOCKER_COUNT = 2;
const FIRST_POISON = 14;
const POISON_COUNT = 8;

/** The Shadow boss is first put down in the middle 50 squares of each axis. */
const BOSS_AREA_ORIGIN = 25;
const BOSS_AREA_SIZE = 50;

/** Every time after that he is put down within seven squares of where he was: `random(15) - 7`
 *  on each axis. */
const BOSS_STEP_SIZE = 15;
const BOSS_STEP_BACK = 7;

/**
 * The square a section's Shadow boss was last put down on, which the character record keeps at
 * `bossX` and `bossY`. A boss the game has never placed has 0 in both.
 */
export interface BossSquare {
  x: number;
  y: number;
}

/** A boss nobody has ever put down, which is how the map explorer asks for every roll: it has
 *  no character, so it has nothing to remember. */
export const BOSS_NEVER_PLACED: BossSquare = { x: 0, y: 0 };

/** The kill flags of a module whose four Shadow bosses are all still alive, which is every roll
 *  the map explorer asks for: it has no character, so it shows a dungeon nobody has beaten. */
export const NO_BOSS_BEATEN = 0;

/**
 * Whether the section's Shadow boss stands on this floor: it is his floor, and the bit for his
 * section is still clear.
 *
 * `bossesBeaten` is the module's byte at DS:c0c9, which the save calls `objective`; bits 1, 2, 4
 * and 8 are the four sections of the module, and kill_monster (exe 3000:b12d) sets one when its
 * boss dies.
 */
function bossStandsOn(section: StockedSection, floor: number, bossesBeaten: number): boolean {
  if (floor !== section.bossFloor) return false;
  return (bossesBeaten & (1 << (section.part - 1))) === 0;
}

export interface StockedMonster {
  /** Position in the floor's monster table; the Shadow boss is always slot 0. */
  slot: number;
  x: number;
  y: number;
  monsterId: string;
  level: number;
  hp: number;
}

const catalogue = new Map(allMonsters().map((entry) => [entry.id, entry]));

/** The catalogue entry a stocked monster refers to. */
export function monsterById(id: string): Monster {
  const entry = catalogue.get(id);
  if (!entry) throw new Error(`no monster ${id}`);
  return entry;
}

/** A section as a floor is stocked from it: where it sits, and the number its monster table is
 *  loaded by. */
export interface StockedSection extends SectionPlace {
  /** 1..20 across all modules. */
  section: number;
}

/**
 * The section whose monsters a floor is stocked from, or null when the game itself could not
 * stock it. The game needs two things the floor override can take away: a floor belonging to
 * one of its own module's sections, so there is a monster table to load, and a monster level of
 * at least 1.
 */
export function stockingSection(rules: GameRules, moduleIndex: number, floor: number): StockedSection | null {
  const section = rules.sectionOf(moduleIndex, floor);
  const place = rules.sectionPlace(section);
  if (!place || place.module !== moduleIndex) return null;
  if (rules.monsterLevel(moduleIndex, floor) <= 0) return null;
  return { section, ...place };
}

/** The game's random(n): an integer 0..n-1. */
const random = (rnd: () => number, n: number) => Math.trunc(rnd() * n);

/**
 * What stock_level does before every try at a monster's square (exe 2000:6979):
 * `srand(clock() + slot + attempt)`, where `attempt` counts the tries the whole floor has taken
 * rather than this slot's own.
 *
 * Seeds one apart give rolls that climb in a straight line, so consecutive slots land a fixed
 * distance apart and the floor comes out in diagonal stripes.
 */
export type SquareReseed = (slot: number, attempt: number) => void;

/**
 * What a floor stocked on the clock is handed beyond its rolls.
 *
 * Two of `stock_level`'s rolls are not the plain `rand() * n / 0x8000` the rest of the floor is
 * drawn with: the generator is started again before every try at a monster's square, and the
 * type roll opens with a `Random` call, which reseeds from the clock of its own accord. The map
 * explorer and a game played off the clock hand neither in and draw everything from `rnd`.
 */
export interface ClockedStocking {
  /** Random (exe 2000:4156, unf.c "Random"): the call get_mtype opens with, at 2000:6601. */
  randomCall(n: number): number;
  /** {@link SquareReseed}: the srand at 2000:6979. */
  reseed: SquareReseed;
}

/** stock_level starts its count of tries at 10 (exe 2000:6726) and raises it before each try, so
 *  the first try of the first slot is the eleventh. */
const TRIES_BEFORE_THE_FIRST = 10;

/**
 * Fills a floor's 145 monster slots the way stock_level (exe 2000:671e, unf.c "stock_level")
 * does: every slot gets a random open square nothing else stands on, hit points rolled from the
 * floor's base level for whichever monster the type roll picked, and a level nudged away from
 * that same base level. On a section's boss floor slot 0 is the Shadow boss, placed in the
 * middle of the map.
 *
 * Slot 0 is rolled twice over on a boss floor: it takes an ordinary square and an ordinary
 * type first, and only then does the boss take the slot, hand that square back and draw one of
 * his own. Both halves spend the generator, which is why they are both here.
 *
 * The game seeds its generator afresh for every square it draws, which makes the monsters land in
 * diagonal stripes, and its type roll reseeds too. `clocked` is both, and a caller without it —
 * the map explorer, and a game played off the clock — draws from `rnd` plainly and spreads its
 * monsters out evenly instead.
 *
 * `occupied` is the squares the occupancy grid already holds, as `y * 80 + x`. The game puts the
 * player on that grid before it rolls, so nothing is ever stocked on top of them; the map
 * explorer, which has no player, leaves it out.
 *
 * A floor the game could not stock gets nothing.
 *
 * @param rules the tables the floor is stocked from: its section, and the level its monsters are
 *   rolled around.
 * @param bossesBeaten the module's kill flags, which keep a Shadow boss who has already been
 *   killed off his floor for good.
 * @param bossLastSeen the square this section's Shadow boss was last put down on, which he is
 *   put back within seven squares of.
 * @param clocked {@link ClockedStocking}, or null to leave the generator alone.
 */
export function stockFloor(
  rules: GameRules,
  rows: MapSquare[][],
  moduleIndex: number,
  floor: number,
  rnd: () => number,
  occupied: Iterable<number> = [],
  bossesBeaten: number = NO_BOSS_BEATEN,
  bossLastSeen: BossSquare = BOSS_NEVER_PLACED,
  clocked: ClockedStocking | null = null,
): StockedMonster[] {
  const section = stockingSection(rules, moduleIndex, floor);
  if (!section) return [];
  const baseLevel = rules.monsterLevel(moduleIndex, floor);
  const taken = new Set<number>(occupied);
  const monsters: StockedMonster[] = [];
  let tries = TRIES_BEFORE_THE_FIRST;
  for (let slot = 0; slot < MONSTER_SLOTS; slot++) {
    const beforeTry = clocked === null ? null : () => clocked.reseed(slot, (tries += 1));
    let { x, y } = freeSquare(rows, taken, rnd, beforeTry);
    taken.add(y * WIDTH + x);
    let entry = rollKind(section.section, rnd, clocked);
    if (slot === 0 && bossStandsOn(section, floor, bossesBeaten)) {
      entry = sectionMonster(section.section, BOSS_SLOT);
      // set_monster_map(x, y, 0xff) gives the square just rolled back before the boss is put
      // down in the middle of the floor instead.
      taken.delete(y * WIDTH + x);
      ({ x, y } = bossSquare(rows, taken, rnd, bossLastSeen));
      taken.add(y * WIDTH + x);
    }
    // The hit points are rolled from the floor's base level and the stored level is jittered
    // only afterwards, so a monster's hit points and its level need not match.
    const hp = rollHp(entry, baseLevel, rnd);
    monsters.push({ slot, x, y, monsterId: entry.id, level: nudgeLevel(baseLevel, rnd, rules.monsterLevelMax), hp });
  }
  return monsters;
}

export function monsterAt(monsters: StockedMonster[], x: number, y: number): StockedMonster | null {
  return monsters.find((monster) => monster.x === x && monster.y === y) ?? null;
}

export interface MonsterCount {
  monsterId: string;
  name: string;
  count: number;
  /** A second line about this type's monsters, or null when the game has nothing to add. */
  detail: string | null;
}

/** How many of each monster type a stocked floor holds, commonest first, with the Shadow
 *  boss ahead of them all. */
export function monsterCounts(monsters: StockedMonster[]): MonsterCount[] {
  const counts = new Map<string, number>();
  for (const monster of monsters) counts.set(monster.monsterId, (counts.get(monster.monsterId) ?? 0) + 1);
  return [...counts]
    .map(([monsterId, count]) => ({ monsterId, name: monsterById(monsterId).name, count, detail: null }))
    .sort((a, b) => Number(monsterById(b.monsterId).isBoss) - Number(monsterById(a.monsterId).isBoss) || b.count - a.count);
}

/** How many of the floor's monsters stand outside the area the game shows. */
export function beyondMapCount(monsters: StockedMonster[], area: MapArea): number {
  return monsters.filter((monster) => !isOnMap(monster, area)).length;
}

export interface MonsterCountGroup {
  /** The heading over this part of the list, or null when the list has only one part. */
  label: string | null;
  counts: MonsterCount[];
}

/** The headings the monster list groups its types under, in the order it shows them. */
const GROUP_LABELS = ['Shadow boss', 'This section', 'Everywhere', 'Puffballs', 'Poison and disease'] as const;

type GroupLabel = (typeof GROUP_LABELS)[number];

function groupOf(entry: Monster): GroupLabel {
  if (entry.isBoss) return 'Shadow boss';
  if (entry.origin.kind === 'section') return 'This section';
  if (isPuffball(entry)) return 'Puffballs';
  if (entry.special === 0) return 'Everywhere';
  return 'Poison and disease';
}

/** The floor's monster types split into those groups, commonest first within each group.
 *  A group nothing was stocked from is left out. */
export function groupedMonsterCounts(monsters: StockedMonster[]): MonsterCountGroup[] {
  const counts = monsterCounts(monsters);
  return GROUP_LABELS.map((label) => ({
    label,
    counts: counts.filter((entry) => groupOf(monsterById(entry.monsterId)) === label),
  })).filter((group) => group.counts.length > 0);
}

/**
 * get_mtype (exe 2000:65f8, unf.c "get_mtype"): the type roll. 1 in 20 a puffball, else 1 in 7 a
 * garbage can or ball, else 1 in 15 the section's level drainer, else 1 in 12 a poison or disease
 * monster, else one of the section's three regulars.
 *
 * Each of the four tests asks whether the roll came up 1 rather than 0, which is the same one
 * chance in twenty over an even generator and a different monster over a reseeded one. Only the
 * first roll is a `Random` call (2000:6601); the six under it are written inline.
 */
function rollKind(section: number, rnd: () => number, clocked: ClockedStocking | null): Monster {
  const puffballs = clocked === null ? random(rnd, 20) : clocked.randomCall(20);
  if (puffballs === 1) return builtinMonster(random(rnd, PUFFBALL_COUNT) + FIRST_PUFFBALL);
  if (random(rnd, 7) === 1) return builtinMonster(random(rnd, BLOCKER_COUNT));
  if (random(rnd, 15) === 1) return sectionMonster(section, LEVEL_DRAINER_SLOT);
  if (random(rnd, 12) === 1) return builtinMonster(random(rnd, POISON_COUNT) + FIRST_POISON);
  return sectionMonster(section, random(rnd, 3) + FIRST_REGULAR_SLOT);
}

function builtinMonster(index: number): Monster {
  return monsterById(`builtin-${index}`);
}

function sectionMonster(section: number, slot: number): Monster {
  return monsterById(`section-${section}-${slot}`);
}

/** A random square, redrawn until it is open and holds no monster yet. `beforeTry` is the
 *  generator being started again for this try, which a game played on the clock asks for. */
function freeSquare(
  rows: MapSquare[][],
  taken: Set<number>,
  rnd: () => number,
  beforeTry: (() => void) | null = null,
): { x: number; y: number } {
  for (;;) {
    beforeTry?.();
    const x = random(rnd, WIDTH);
    const y = random(rnd, HEIGHT);
    if (!rows[y][x].solid && !taken.has(y * WIDTH + x)) return { x, y };
  }
}

/**
 * Where the Shadow boss is put down. The first time his section ever places him it is anywhere
 * in the middle 50 squares of each axis; every time after that it is within seven squares of
 * where he was last seen, so a boss stays roughly where a character left him. Both rolls take
 * the row before the column — the other way round from an ordinary monster's square.
 *
 * A square off the edge of the 80 x 110 floor is turned down the same way rock is. The game
 * reads its map there and takes whatever it finds; the port has nothing to read.
 */
function bossSquare(
  rows: MapSquare[][],
  taken: Set<number>,
  rnd: () => number,
  lastSeen: BossSquare,
): { x: number; y: number } {
  const placedBefore = lastSeen.x !== 0 || lastSeen.y !== 0;
  const roll = (from: number) =>
    placedBefore
      ? from + random(rnd, BOSS_STEP_SIZE) - BOSS_STEP_BACK
      : random(rnd, BOSS_AREA_SIZE) + BOSS_AREA_ORIGIN;
  for (;;) {
    const y = roll(lastSeen.y);
    const x = roll(lastSeen.x);
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) continue;
    if (!rows[y][x].solid && !taken.has(y * WIDTH + x)) return { x, y };
  }
}

/** Dungeons of the Unforgiven's monsters, as the map descriptor asks for them. */
export const UNFORGIVEN_STOCKING: MapStocking = {
  stocks: (dungeon, floor) => stockingSection(FAITHFUL_RULES, dungeon, floor) !== null,
  stock: (rows, dungeon, floor) => stockFloor(FAITHFUL_RULES, rows, dungeon, floor, Math.random),
  kind: unforgivenKind,
  groups: groupedMonsterCounts,
  describe: (monster) => `${monsterById(monster.monsterId).name} · level ${monster.level} · ${monster.hp} HP`,
  beyondMap: (count) =>
    count === 1
      ? "1 stands beyond the game's map, below row 103, where nothing can reach it."
      : `${count} stand beyond the game's map, below row 103, where nothing can reach them.`,
  note: null,
};

/** A monster looks different in each section, so the section's palette is what its picture
 *  depends on beyond the monster itself. */
function unforgivenKind(monsterId: string): StockedKind {
  const entry = monsterById(monsterId);
  const partOn = (dungeon: number, floor: number) => sectionInfo(dungeon, floor)?.part ?? 1;
  return {
    name: entry.name,
    boss: entry.isBoss,
    pictureKey: (dungeon, floor) => `${dungeon}:${partOn(dungeon, floor)}`,
    picture: (dungeon, floor) => renderMonster(entry, dungeon + 1, partOn(dungeon, floor)),
  };
}
