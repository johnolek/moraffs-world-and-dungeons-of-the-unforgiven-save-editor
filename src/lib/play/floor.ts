import { bossIndex } from '../game/dotu-files.js';
import type { Rng } from '../game/port/rng';
import type { Game, Monster } from '../game/port/state';
import { MAP_EMPTY, MAP_PLAYER, monsterAt, setMonsterMap } from '../game/port/state';
import { WIDTH } from '../game/unfmap.js';
import type { MapSquare } from '../map/game';
import { MONSTER_SLOTS, stockFloor, type ClockedStocking, type StockedMonster } from '../map/stocking';

/**
 * Arriving on a floor: what the game loads, stocks and remembers.
 *
 * The monsters come from the map explorer's own stocking — `src/lib/map/stocking.ts` is a port of
 * `stock_level` (exe 2000:671e) and there is only one of them — turned into the six-byte slots
 * the game keeps at DS:c4cd.
 */

/**
 * How many monster kinds the game has loaded at a time: the 22 built-in ones and the five of the
 * section, which are the rows a stocked monster's type points at.
 */
const BUILTIN_KINDS = 22;

const BUILTIN_ID = /^builtin-(\d+)$/;
const SECTION_ID = /^section-\d+-(\d+)$/;

/**
 * The monster type a stocked monster is: which of the 27 rows of the table the game has loaded
 * for the section it stands in. The built-in monsters are rows 0 to 21, and a section's own five
 * are rows 22 to 26, which is the slot number their id already carries.
 */
export function monsterTypeOf(monsterId: string): number {
  const builtin = BUILTIN_ID.exec(monsterId);
  if (builtin) return Number(builtin[1]);
  const section = SECTION_ID.exec(monsterId);
  if (section) return Number(section[1]);
  throw new Error(`no monster type for ${monsterId}`);
}

/** The id `src/lib/map/stocking.ts` knows a monster of this type by, on a floor stocked from
 *  `section`'s own five monsters. */
export function monsterIdOf(type: number, section: number): string {
  return type < BUILTIN_KINDS ? `builtin-${type}` : `section-${section}-${type}`;
}

/**
 * The row of the loaded monster table a section's Shadow boss is. The section's own five rows
 * follow the built-in monsters and the boss is the first of them, so his row is the number of
 * built-in kinds.
 */
export const BOSS_KIND = BUILTIN_KINDS;

/**
 * Where a floor's Shadow boss has his square remembered: `bossIndex` (exe: the module times
 * eight plus section_number2, the section's own place among the module's four).
 */
function bossSquareIndex(game: Game, level: number): number {
  const module = game.pc.module;
  return bossIndex(module, (game.rules.sectionOf(module, level) - 1) % 4);
}

/**
 * stock_level (exe 2000:671e, unf.c "stock_level"): the square the Shadow boss has just been put
 * down on goes back into the character record, which is where the next roll of his floor puts
 * him within seven squares of. A roll that did not place a boss leaves the record alone.
 */
function rememberBossSquare(game: Game, index: number): void {
  const boss = game.monsters[0];
  if (boss.type !== BOSS_KIND) return;
  game.pc.bossX[index] = boss.x;
  game.pc.bossY[index] = boss.y;
}

/** One of the game's 145 monster slots, empty. */
function emptySlot(): Monster {
  return { x: 0, y: 0, hp: 0, type: 0, level: 1 };
}

/** A floor's monster table, and which floor it belongs to. */
interface FloorTable {
  /** The floor this table holds the monsters of, or null for a table nothing has been put in. */
  level: number | null;
  monsters: Monster[];
  /**
   * The hit points each slot was stocked with, or 0 for a slot nothing is known about.
   *
   * The game keeps no such thing: a monster's record holds the hit points it has left and
   * nothing else, so a bar drawn for one has nothing to fill towards without this.
   */
  fullHp: number[];
}

function emptyTable(): FloorTable {
  return {
    level: null,
    monsters: Array.from({ length: MONSTER_SLOTS }, emptySlot),
    fullHp: new Array<number>(MONSTER_SLOTS).fill(0),
  };
}

/**
 * stock_level (exe 2000:671e, unf.c "stock_level"): the floor's 145 monsters, and the memory of
 * the last three floors that decides whether they are rolled again.
 *
 * The game keeps three monster tables and rotates between them. Arriving on the floor either of
 * the other two holds, it swaps that table back in and rebuilds the occupancy grid from it, so
 * the monsters are exactly where they were left, minus the ones that were killed; arriving
 * anywhere else, the oldest table is emptied and filled with a fresh roll. The town is the one
 * floor that is emptied and never filled.
 *
 * The original starts with three tables it believes hold floor 0, and reads the monsters of the
 * floor a character is loaded onto out of that character's `?MON.MAP` file. There is no such file
 * in a browser, so this starts with three tables holding no floor at all and rolls the floor a
 * character starts on like any other.
 */
export class FloorMonsters {
  /** The three tables, the one in play first. */
  private tables: FloorTable[] = [emptyTable(), emptyTable(), emptyTable()];

  /** Which floors are remembered, the one in play first. */
  get remembered(): (number | null)[] {
    return this.tables.map((table) => table.level);
  }

  /**
   * Put a floor's monsters in play, rolling them unless one of the three tables already holds
   * that floor. `rows` is the floor they are rolled onto.
   */
  stock(game: Game, rows: MapSquare[][], level: number, rng: Rng): void {
    const [current, previous, older] = this.tables;
    if (level === previous.level) this.tables = [previous, current, older];
    else if (level === older.level) this.tables = [older, previous, current];
    else this.tables = [older, current, previous];
    const table = this.tables[0];
    const rolled = table.level !== level;
    table.level = level;
    game.monsters = table.monsters;
    game.monsterMap.fill(MAP_EMPTY);
    if (rolled) {
      for (const slot of table.monsters) Object.assign(slot, emptySlot());
      table.fullHp.fill(0);
      // The player is on the grid before the roll, so nothing is stocked on top of them.
      setMonsterMap(game, game.pc.x, game.pc.y, MAP_PLAYER);
      if (level !== 0) {
        const index = bossSquareIndex(game, level);
        const stocked = stockFloor(
          game.rules,
          rows,
          game.pc.module,
          level,
          fractions(rng),
          [squareIndex(game.pc.x, game.pc.y)],
          game.pc.objective[game.pc.module],
          { x: game.pc.bossX[index], y: game.pc.bossY[index] },
          clockedStocking(game, rng),
        );
        fill(table.monsters, stocked);
        for (const monster of stocked) table.fullHp[monster.slot] = monster.hp;
        rememberBossSquare(game, index);
      }
    }
    for (let slot = 0; slot < table.monsters.length; slot++) {
      const monster = table.monsters[slot];
      if (monster.hp > 0) setMonsterMap(game, monster.x, monster.y, slot);
    }
    setMonsterMap(game, game.pc.x, game.pc.y, MAP_PLAYER);
  }

  /**
   * The hit points the monster in this slot had before anything hit it.
   *
   * A floor rolled here has them from the roll. A monster that arrived on the floor from
   * anywhere else has none, so the first hit points seen for its slot are taken as the mark and
   * kept: a monster already hurt reads as untouched, which is the best a floor nobody rolled
   * can do.
   */
  fullHp(slot: number, hp: number): number {
    const table = this.tables[0];
    if (!(table.fullHp[slot] > 0)) table.fullHp[slot] = hp;
    return table.fullHp[slot];
  }
}

/** Write a roll of a floor's monsters into the game's own slots. */
function fill(slots: Monster[], stocked: StockedMonster[]): void {
  for (const monster of stocked) {
    const slot = slots[monster.slot];
    slot.x = monster.x;
    slot.y = monster.y;
    slot.hp = monster.hp;
    slot.level = monster.level;
    slot.type = monsterTypeOf(monster.monsterId);
  }
}

/**
 * The uniform fraction the stocking draws its inline rolls out of, taken from the port's
 * generator.
 *
 * A roll the game writes inline is `rand() * n / 0x8000` over a generator whose numbers run from
 * 0 to 0x7fff, so a fraction of those same fifteen bits is exactly what it divides up. The one
 * roll of the stocking that is a `Random` call goes through {@link clockedStocking} instead.
 */
function fractions(rng: Rng): () => number {
  return () => rng.random(0x8000) / 0x8000;
}

/**
 * stock_level (exe 2000:671e, unf.c "stock_level") as a game with a clock plays it: the srand at
 * 2000:6979, which starts the generator again from the tick counter plus the slot and the number
 * of tries the floor has taken before every try at a monster's square, and the `Random` call
 * get_mtype opens with, which reseeds itself.
 *
 * Null for a game with no clock, which reseeds nothing and lays its monsters out evenly: the
 * third departure in `src/lib/game/port/README.md`.
 */
function clockedStocking(game: Game, rng: Rng): ClockedStocking | null {
  const clock = game.clock;
  if (clock === null) return null;
  return {
    randomCall: (n) => game.randomCall(n),
    reseed: (slot, attempt) => rng.reseed?.(clock() + slot + attempt),
  };
}

/**
 * load_level_map (exe 2000:7687, unf.c "load_level_map"): arrive on a floor. The section's
 * monster descriptions are loaded when the section changes, and the floor is stocked.
 *
 * What the original does besides is about files and pictures: it reads `MD.BIN` and the section's
 * `.PIC` files, writes the explored map of the floor being left out to its `.DUN` file, reads the
 * new one in, and sets the palette.
 */
export function loadLevelMap(game: Game, floors: FloorMonsters, rows: MapSquare[][], level: number, rng: Rng): void {
  game.monsterKinds = game.rules.monsterKinds(game.rules.sectionOf(game.pc.module, level));
  floors.stock(game, rows, level, rng);
}

/**
 * The monsters standing on the floor, as the map draws them: every slot the occupancy grid holds
 * at its own square, which is what `which_monster` (exe 2000:6573) reads to draw one.
 */
export function drawnMonsters(game: Game, level: number): StockedMonster[] {
  const section = game.rules.sectionSource(game.rules.sectionOf(game.pc.module, level));
  const drawn: StockedMonster[] = [];
  for (let slot = 0; slot < game.monsters.length; slot++) {
    const monster = game.monsters[slot];
    if (monsterAt(game, monster.x, monster.y) !== slot) continue;
    drawn.push({
      slot,
      x: monster.x,
      y: monster.y,
      monsterId: monsterIdOf(monster.type, section),
      level: monster.level,
      hp: monster.hp,
    });
  }
  return drawn;
}

/** Where a square sits in the 80 x 110 occupancy grid. */
function squareIndex(x: number, y: number): number {
  return y * WIDTH + x;
}
