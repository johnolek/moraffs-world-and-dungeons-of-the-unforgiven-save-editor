import { base64FromBytes } from '../bytes';
import { readCharacterMaps, writeCharacterMaps } from '../character/maps';
import { fromBase64 } from '../character/storage';
import {
  DUN_COLUMNS,
  DUN_FLOOR_BYTES,
  DUN_ROW_BYTES,
  DUN_ROWS,
  EXPLORED_STRIDE,
  FLOORS_PER_BLOCK,
  type ExploredSquares,
} from '../map/explored';
import type { DiscoveredMap } from '../map/draw-floor';
import type { MapSquare } from '../map/game';

/**
 * The map a character has discovered.
 *
 * Both games keep it the same way, down to the constants: one bit per square per floor, 32
 * floors of a block resident at once, marked by three things and only three — the square
 * underfoot, every square the four 3-D views draw, and the stone that maps the level.
 * `dotu-tools/docs/MAP-MEMORY.md` and `mw-tools/docs/MAP-MEMORY.md` are the write-ups; the
 * addresses below are Dungeons of the Unforgiven's, and `mw/memory.ts` has the handful of
 * places where Moraff's World differs.
 */

/** A side a view can see through: retdwall's 3 (exe 3000:8360). A wall, a door, a secret door
 *  and a module teleporter all stop it, which is `if (cVar1 == '\x03') return 1;` in
 *  FUN_3000_342d (exe 3000:342d, unf.c:19241). */
const SIDE_OPEN = 3;

/**
 * How far a 3-D view reaches, in squares: `DS 0x2316 / 20 + 3` = 650 / 20 + 3 (unf.c:18277).
 * Moraff's World's FUN_3000_1a08 stops at the same number out of its own DS 0x43a8.
 */
export const VIEW_DEPTH = 35;

function emptyFloor(): Uint8Array {
  return new Uint8Array(DUN_FLOOR_BYTES);
}

/** FUN_2000_7210 (exe 2000:7210): is (x, y) known? */
function bitSet(bitmap: Uint8Array, x: number, y: number): boolean {
  if (x < 0 || x >= DUN_COLUMNS || y < 0 || y >= DUN_ROWS) return false;
  return (bitmap[y * DUN_ROW_BYTES + (x >> 3)] & (1 << x % 8)) !== 0;
}

/**
 * FUN_2000_72de (exe 2000:72de), which has no bounds check of its own; the geometry of the
 * dungeon is what keeps its callers inside the floor, so a mark that would land outside one is
 * dropped here rather than written into the next floor's bitmap.
 *
 * Says whether the square was not already known, which is how {@link MapMemory.discovered} knows
 * the map it hands out still describes the floor.
 */
function setBit(bitmap: Uint8Array, x: number, y: number): boolean {
  if (x < 0 || x >= DUN_COLUMNS || y < 0 || y >= DUN_ROWS) return false;
  const at = y * DUN_ROW_BYTES + (x >> 3);
  const mask = 1 << x % 8;
  const already = (bitmap[at] & mask) !== 0;
  bitmap[at] |= mask;
  return !already;
}

/**
 * The explored maps as they are kept beside the character: one floor's bitmap per entry, in the
 * game's own row bytes, keyed `<dungeon>:<floor>`.
 *
 * The original writes those bitmaps to a file of their own beside the character's record —
 * `<slot><quarter><module>.DUN` in Dungeons of the Unforgiven, `<slot><block>.DUN` in Moraff's
 * World — and this keeps a row of its own beside the character in the browser's database, so the
 * Save Editor's download of the record is the record alone, exactly as the game's own file is.
 */
export type StoredMaps = Record<string, string>;

/** One floor's bitmap and where in the game it belongs. */
export interface MappedFloor {
  dungeon: number;
  floor: number;
  bitmap: Uint8Array;
}

/** The dungeon and floor a stored key names, or null when it is not one of these keys. */
function storedPlace(key: string): { dungeon: number; floor: number } | null {
  const match = /^(-?\d+):(\d+)$/.exec(key);
  return match ? { dungeon: Number(match[1]), floor: Number(match[2]) } : null;
}

/** Where a character's explored maps are read and written. */
export interface MapStore {
  read(): StoredMaps;
  write(maps: StoredMaps): void;
  /** The files are deleted, which is what Moraff's World does when a character dies. */
  clear(): void;
}

/**
 * The explored maps kept beside one roster entry, which is the JSON above as one string
 * (`src/lib/character/maps.ts`).
 *
 * A character that has explored nothing, and one whose string is not the JSON this writes, both
 * read as no floors at all, so the game can always write into what it reads back.
 */
export function characterMaps(id: string): MapStore {
  return {
    read() {
      const stored = readCharacterMaps(id);
      if (stored === null) return {};
      try {
        const parsed: unknown = JSON.parse(stored);
        return typeof parsed === 'object' && parsed !== null ? (parsed as StoredMaps) : {};
      } catch {
        return {};
      }
    },
    write: (maps) => writeCharacterMaps(id, JSON.stringify(maps)),
    clear: () => writeCharacterMaps(id, null),
  };
}

/** The squares of a floor, as the map draws and the explored-map reader indexes them. */
function squareIndex(x: number, y: number): number {
  return y * EXPLORED_STRIDE + x;
}

/**
 * One character's explored maps while they are being played: the block of 32 floor bitmaps that
 * is in memory, the floor being walked, the copy of it taken on arrival, and the blob they are
 * written to and read back from beside the roster entry.
 */
export class MapMemory {
  /** DS:c445: the 32 bitmaps of the block in memory, by floor number. */
  private readonly resident = new Map<number, Uint8Array>();
  /** DS:0417 with the module beside it: which block of which dungeon those bitmaps are, or null
   *  before the first floor is entered. */
  private held: { dungeon: number; block: number } | null = null;
  /** DS:c4c5: the floor being played. */
  private live = emptyFloor();
  /** DS:c4c9: the copy load_level_map takes of the floor on arrival. The only thing that ever
   *  reads it is the chute glyph, which is why a chute shows up on a floor only once the
   *  character has left it and come back. */
  private arrival = emptyFloor();
  /** The squares the four views drew on the last turn, which is exactly the set of squares a
   *  monster standing on one can be seen on. */
  private drawn: Set<number> = new Set();
  /** The map {@link discovered} last handed out, or null once a square has been marked since.
   *  Handing the same object back while the floor is unchanged is what lets the Play tab tell
   *  that a key drew nothing new on the little map. */
  private handedOut: DiscoveredMap | null = null;

  /** Where the maps are read and written, or null for a game nobody is keeping them for — a
   *  replay, or a test. */
  constructor(private readonly store: MapStore | null = null) {}

  /**
   * load_level_map (exe 2000:7687): arrive on a floor. All 32 floors of a block are resident at
   * once, so coming back to one costs nothing and loses nothing; the bitmap is simply pointed at
   * again, and copied into the snapshot the chute glyph is drawn from (unf.c:12427).
   */
  enterFloor(dungeon: number, floor: number): void {
    const block = Math.floor(floor / FLOORS_PER_BLOCK);
    if (this.held === null || this.held.dungeon !== dungeon || this.held.block !== block) {
      this.save();
      this.held = { dungeon, block };
      this.load();
    }
    let bitmap = this.resident.get(floor);
    if (!bitmap) {
      bitmap = emptyFloor();
      this.resident.set(floor, bitmap);
    }
    this.live = bitmap;
    this.arrival = bitmap.slice();
    this.drawn = new Set();
    this.handedOut = null;
  }

  /** movecontrol (exe 2000:c308, unf.c:15405): the square under the character's feet, and no
   *  neighbour of it. */
  markStep(x: number, y: number): void {
    if (setBit(this.live, x, y)) this.handedOut = null;
  }

  /**
   * draw_map_square (exe 3000:2848): every square any of the four 3-D views draws is marked,
   * which is where nearly all of the map comes from. The set is kept as well as marked, since a
   * monster is visible exactly when it stands on a square the views drew this turn.
   */
  markViews(rows: MapSquare[][], x: number, y: number): void {
    this.drawn = viewedSquares(rows, x, y);
    for (const index of this.drawn) {
      const column = index % EXPLORED_STRIDE;
      if (setBit(this.live, column, (index - column) / EXPLORED_STRIDE)) this.handedOut = null;
    }
  }

  /**
   * The two marks of a floor's first drawing, made where the character has landed: the square
   * underfoot and every square the four 3-D views draw from it.
   *
   * The original makes them on movecontrol's next pass, and until that pass comes round it leaves
   * the floor the character came from on the screen. This port has no such stale screen: it draws
   * the floor they have arrived on every time the game waits for a key, and an arrival waits for
   * one before that pass — the snake's hint, the chute's "hit any key", the greeting the module
   * teleporter prints — so the map behind those boxes would otherwise be blank. The marks are the
   * same ones the next pass makes; only the moment they are made is earlier.
   *
   * {@link enterFloor} takes its copy of the floor before this, the way load_level_map takes it
   * before movecontrol draws, so a chute still shows up only on a floor already walked.
   */
  markArrival(rows: MapSquare[][], x: number, y: number): void {
    this.markStep(x, y);
    this.markViews(rows, x, y);
  }

  /** Whether a monster standing here is one the views have just drawn. */
  isVisible(x: number, y: number): boolean {
    return this.drawn.has(squareIndex(x, y));
  }

  /** FUN_2000_72de (exe 2000:72de) from anywhere but a step or a view, which is the stone that
   *  maps the level. The loop over the floor belongs to the game whose stone it is. */
  markKnown(x: number, y: number): void {
    if (setBit(this.live, x, y)) this.handedOut = null;
  }

  /** FUN_2000_7210 (exe 2000:7210). */
  isKnown(x: number, y: number): boolean {
    return bitSet(this.live, x, y);
  }

  /** FUN_2000_7277 (exe 2000:7277): was (x, y) known when the character arrived on this floor?
   *  drawsquare's chute branch (unf.c:21910) is its one caller. */
  wasKnownOnArrival(x: number, y: number): boolean {
    return bitSet(this.arrival, x, y);
  }

  /**
   * The floor as the game's own map draws it.
   *
   * The same object comes back until a square is marked, so a screen drawn from it can skip a
   * repaint on a key that discovered nothing. It answers for the floor it was handed out on
   * rather than for whichever floor is resident when it is asked, so a screen still showing the
   * floor a character has just fallen off (`engine.ts` ScreenFloor) can go on drawing its map.
   */
  discovered(): DiscoveredMap {
    const live = this.live;
    const arrival = this.arrival;
    this.handedOut ??= {
      known: (x, y) => bitSet(live, x, y),
      knownOnArrival: (x, y) => bitSet(arrival, x, y),
    };
    return this.handedOut;
  }

  /**
   * save_maps (exe 2000:7313): the block in memory, written out beside the character. The
   * original writes it when the block changes, when the module changes and on Q, and this is
   * called from those three places alone — so a death loses everything learned since the last
   * of them, which is what the original does by never saving on death at all.
   */
  save(): void {
    if (!this.store || !this.held) return;
    const maps = this.store.read();
    for (const [floor, bitmap] of this.resident) {
      maps[`${this.held.dungeon}:${floor}`] = base64FromBytes(bitmap);
    }
    this.store.write(maps);
  }

  /** load_maps (exe 2000:74ae): the block's bitmaps, with any floor the file does not hold
   *  zeroed. */
  private load(): void {
    this.resident.clear();
    if (!this.store || !this.held) return;
    const maps = this.store.read();
    const first = this.held.block * FLOORS_PER_BLOCK;
    for (let floor = first; floor < first + FLOORS_PER_BLOCK; floor++) {
      const stored = maps[`${this.held.dungeon}:${floor}`];
      if (typeof stored !== 'string') continue;
      const bytes = fromBase64(stored);
      if (!bytes || bytes.length !== DUN_FLOOR_BYTES) continue;
      this.resident.set(floor, bytes);
    }
  }

  /** The 32 bitmaps are blanked and the block marker is put back to -1, without touching what
   *  is on disk. */
  forgetResident(): void {
    this.resident.clear();
    this.held = null;
    this.live = emptyFloor();
    this.arrival = emptyFloor();
    this.drawn = new Set();
    this.handedOut = null;
  }

  /** The explored maps are deleted outright, which only Moraff's World does. */
  forgetEverything(): void {
    this.store?.clear();
    this.forgetResident();
  }

  /**
   * Every floor the character has a map of, by dungeon and floor: what is stored beside them,
   * with the block in memory laid over the top.
   *
   * The block in memory is more than the game itself would have on disk at this moment, since it
   * writes only on a quarter change, a module change and Q — the point here is to hand a player
   * everything the site knows, not to reproduce what a crash would have left behind.
   */
  exploredFloors(): MappedFloor[] {
    const floors = new Map<string, MappedFloor>();
    for (const [key, stored] of Object.entries(this.store?.read() ?? {})) {
      const place = storedPlace(key);
      const bitmap = fromBase64(stored);
      if (!place || !bitmap || bitmap.length !== DUN_FLOOR_BYTES) continue;
      floors.set(key, { ...place, bitmap });
    }
    const held = this.held;
    if (held) {
      for (const [floor, bitmap] of this.resident) {
        floors.set(`${held.dungeon}:${floor}`, { dungeon: held.dungeon, floor, bitmap });
      }
    }
    return [...floors.values()];
  }

  /** Every known square of the floor being played, for a caller that wants the whole set rather
   *  than a square at a time. */
  knownSquares(): ExploredSquares {
    const squares = new Set<number>();
    for (let y = 0; y < DUN_ROWS; y++) {
      for (let x = 0; x < DUN_COLUMNS; x++) {
        if (bitSet(this.live, x, y)) squares.add(squareIndex(x, y));
      }
    }
    return squares;
  }
}

/**
 * Every square the four 3-D views draw from (x, y), which is every square the turn marks.
 *
 * Each view is a 90-degree frustum flooded through openings alone, out to {@link VIEW_DEPTH}
 * squares: draw_3d_view (exe 3000:0f75) walks forward and hands each depth to FUN_3000_0837 and
 * FUN_3000_00a8, the left and right halves of the cone, which test each side with FUN_3000_342d
 * and recurse into the square beyond when it is open. The cone is +/-0.5 of a square across at
 * the near face of the character's own square, half a square away, so the four of them together
 * are the full circle whichever way the character faces — Dungeons of the Unforgiven's views
 * turn with the character and Moraff's World's are the fixed compass directions, and the union
 * is the same either way.
 *
 * The original clips the frustum in floating point that Ghidra did not recover, so the exact
 * edge of a view is not known; this is an integer shadowcast over the same frustum instead. A
 * beam is an interval of slopes, narrowed by every opening it passes through, and a square is
 * drawn when some ray still reaches it. Two grazing cases follow from that: a beam that has
 * narrowed to a single slope is empty, so a square seen only through the point where two walls
 * meet is not drawn, and a square the cone's own edge merely touches is not drawn either. The
 * `.DUN` files in the game folder do not tell the two models apart.
 */
export function viewedSquares(rows: MapSquare[][], x: number, y: number, depth = VIEW_DEPTH): Set<number> {
  const drawn = new Set<number>();
  for (const quadrant of QUADRANTS) floodQuadrant(rows, x, y, quadrant, depth, drawn);
  return drawn;
}

/** One view: the way it looks, and the way to its right. */
interface Quadrant {
  fx: number;
  fy: number;
  rx: number;
  ry: number;
}

const QUADRANTS: Quadrant[] = [
  { fx: 0, fy: -1, rx: 1, ry: 0 },
  { fx: 0, fy: 1, rx: -1, ry: 0 },
  { fx: -1, fy: 0, rx: 0, ry: -1 },
  { fx: 1, fy: 0, rx: 0, ry: 1 },
];

/**
 * A direction as a fraction across the view: the offset to the side over the depth ahead, both
 * doubled so that a square's edges are whole numbers. The depth is always positive.
 */
interface Slope {
  across: number;
  ahead: number;
}

/** The slopes a beam still covers, from one edge to the other. */
interface Beam {
  lo: Slope;
  hi: Slope;
}

function slopeBelow(left: Slope, right: Slope): boolean {
  return left.across * right.ahead < right.across * left.ahead;
}

/** The beams narrowed to the opening between `lo` and `hi`, dropping any that closes. */
function throughOpening(beams: Beam[], lo: Slope, hi: Slope): Beam[] {
  const narrowed: Beam[] = [];
  for (const beam of beams) {
    const left = slopeBelow(beam.lo, lo) ? lo : beam.lo;
    const right = slopeBelow(hi, beam.hi) ? hi : beam.hi;
    if (slopeBelow(left, right)) narrowed.push({ lo: left, hi: right });
  }
  return narrowed;
}

/**
 * Beams that came through several openings as one set, with the overlapping ones joined.
 *
 * Without this a square in an open room would keep one beam per way round to it and the count
 * would double every square; joined, a square holds one beam per separate opening it is seen
 * through, which is a handful at most.
 */
function joined(beams: Beam[]): Beam[] {
  if (beams.length < 2) return beams;
  // Two beams starting on the same slope are left in the order they came, rather than in
  // whatever order the sort happens to leave a comparator that never says they are equal.
  const sorted = [...beams].sort((left, right) => {
    if (slopeBelow(left.lo, right.lo)) return -1;
    return slopeBelow(right.lo, left.lo) ? 1 : 0;
  });
  const merged: Beam[] = [sorted[0]];
  for (const beam of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (slopeBelow(last.hi, beam.lo)) merged.push(beam);
    else if (slopeBelow(last.hi, beam.hi)) last.hi = beam.hi;
  }
  return merged;
}

/** The side of a square facing the given step, as retdwall returns it. */
function sideTowards(square: MapSquare, dx: number, dy: number): number {
  if (dy < 0) return square.n;
  if (dy > 0) return square.s;
  if (dx < 0) return square.w;
  return square.e;
}

function floodQuadrant(rows: MapSquare[][], px: number, py: number, quadrant: Quadrant, depth: number, drawn: Set<number>): void {
  const width = 2 * depth + 1;
  // The cone through the near face of the character's own square: half a square away and half a
  // square either side of the middle, which is 45 degrees each way.
  let behind: Beam[][] = Array.from({ length: width }, () => []);
  behind[depth] = [{ lo: { across: -1, ahead: 1 }, hi: { across: 1, ahead: 1 } }];
  for (let ahead = 1; ahead <= depth; ahead++) {
    const row: Beam[][] = Array.from({ length: width }, () => []);
    // Outward from the middle, so that a square is reached before the one beside it is asked
    // whether the beam comes through their shared side.
    for (let step = 0; step <= ahead; step++) {
      for (const across of step === 0 ? [0] : [step, -step]) {
        const wx = px + across * quadrant.rx + ahead * quadrant.fx;
        const wy = py + across * quadrant.ry + ahead * quadrant.fy;
        const square = rows[wy]?.[wx];
        if (!square) continue;
        const beams: Beam[] = [];
        const nearer = behind[across + depth];
        if (nearer.length > 0 && sideTowards(square, -quadrant.fx, -quadrant.fy) === SIDE_OPEN) {
          beams.push(
            ...throughOpening(nearer, { across: 2 * across - 1, ahead: 2 * ahead - 1 }, { across: 2 * across + 1, ahead: 2 * ahead - 1 }),
          );
        }
        if (across > 0) {
          const inner = row[across - 1 + depth];
          if (inner.length > 0 && sideTowards(square, -quadrant.rx, -quadrant.ry) === SIDE_OPEN) {
            beams.push(
              ...throughOpening(inner, { across: 2 * across - 1, ahead: 2 * ahead + 1 }, { across: 2 * across - 1, ahead: 2 * ahead - 1 }),
            );
          }
        }
        if (across < 0) {
          const inner = row[across + 1 + depth];
          if (inner.length > 0 && sideTowards(square, quadrant.rx, quadrant.ry) === SIDE_OPEN) {
            beams.push(
              ...throughOpening(inner, { across: 2 * across + 1, ahead: 2 * ahead - 1 }, { across: 2 * across + 1, ahead: 2 * ahead + 1 }),
            );
          }
        }
        if (beams.length === 0) continue;
        row[across + depth] = joined(beams);
        drawn.add(squareIndex(wx, wy));
      }
    }
    behind = row;
  }
}
