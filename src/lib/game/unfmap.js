// Dungeons of the Unforgiven dungeon generator -- JavaScript port of unfmap.py.
// Verified against the Python reference (which is verified against 35,000+ explored
// squares from real save files).  Plain ES module, no dependencies; works in the
// browser and in Node.  All arithmetic emulates Borland C 16-bit signed ints.

export const DUNGEON_XMAX = 79;
export const DUNGEON_YMAX = 104;
export const NUM_PATTERNS = 25;
export const BOTTOM_LEVEL = [25, 45, 65, 85, 105];
export const WIDTH = 80, HEIGHT = 110;

const s16 = v => (v << 16) >> 16;                 // wrap to signed 16-bit
const mul16 = (a, b) => s16(Math.imul(a, b));      // 16-bit product (low word)
const cdiv = (a, b) => Math.trunc(a / b);          // C division (toward zero)
const cmod = (a, b) => a - cdiv(a, b) * b;         // C remainder (sign of dividend)

/** The dungeon hash: myrand(x, y, level, dungeon, range) -> 0..range-1. */
export function myrand(x, y, level, dungeon, rng) {
  if (x < 0 || y < 0) return 0;
  x = s16(x + 9); y = s16(y + 7); level = s16(level + 13); dungeon = s16(dungeon + 15);
  let v = s16(cdiv(mul16(x, 25), y) + mul16(dungeon, 7));
  v = mul16(v, level);
  v = s16(v + cmod(mul16(level, 27), dungeon));
  v = s16(v + cmod(mul16(y, 31), level));
  v = s16(v + cdiv(mul16(mul16(x, y), level), 17));
  v = s16(v + mul16(x, 13));
  v = s16(v + mul16(y, 11));
  v = s16(v + mul16(level, 17));
  const a = v === -0x8000 ? -0x8000 : Math.abs(v);
  let r = cmod(a, rng);
  if (r < 0) r = 0;
  if (r >= rng) r = rng - 1;
  return r;
}

/** Borland C rand()/random(n), needed for trapdoor landing squares. */
export class BorlandRand {
  constructor(seed) { this.seed = seed >>> 0; }
  rand() {
    // seed = seed * 0x015A4E35 + 1 (mod 2^32); return (seed >> 16) & 0x7fff
    const lo = Math.imul(this.seed, 0x015A4E35) >>> 0;
    this.seed = (lo + 1) >>> 0;
    return (this.seed >>> 16) & 0x7fff;
  }
  random(n) { return Math.trunc((this.rand() * n) / 0x8000); }
}

/** How far the trap doors of a floor lead: a roll of `limit` or more is no door, and `deepest` is
 *  the deepest floor one may lead to, drawn from the square, or null to let the roll name the
 *  floor itself. The game's own, for a module `bottom` floors deep: the roll names every fifth
 *  floor from 5 up, and a door is kept while it lands in the upper four fifths of the module. */
export function trapdoorReach(bottom) {
  return { limit: Math.trunc(4 * bottom / 5), deepest: null };
}

/** The module the destination of a drawn trap door is asked of. The game has five modules, 0 to
 *  4, so nothing else ever asks the hash this question. */
const TRAPDOOR_DEST_DUNGEON = 5;

/** Which floor a trap door on this square leads to when the reach names a deepest floor rather
 *  than letting the roll name one: one of the multiples of five from 5 up to `deepest`.
 *
 *  The draw is the same hash the rest of the floor comes out of, asked about a module the game
 *  does not have. Asking it about the square's own module would hand back a number some square's
 *  roll for a door was taken from, and only sixteen of the 2400 rolls put a door down, so the
 *  destinations would come from that narrow set: on a deep floor they would all crowd near the
 *  top of the dungeon and no door would ever lead downwards. */
function drawnTrapdoorDest(x, y, level, dungeon, deepest) {
  const floors = Math.trunc(deepest / 5);
  return 5 * (1 + myrand(x, y, level, TRAPDOOR_DEST_DUNGEON, floors));
}

export class Dungeon {
  /** @param {Uint8Array} dwall  the 12,800 bytes of UNFDUNG.BIN */
  constructor(dwall) {
    if (dwall.length !== 12800) throw new Error("unfdung.bin must be 12800 bytes");
    this.dwall = dwall;
  }

  /** retdwall: hv=0 -> side WEST of (x,y); hv=1 -> side NORTH of (x,y).
   *  0 wall, 1 door, 2 secret door, 3 open. */
  side(x, y, hv, level, dungeon) {
    if (hv === 0 && (x < 2 || x >= DUNGEON_XMAX)) return 0;
    if (hv === 1 && (y < 1 || y >= DUNGEON_YMAX)) return 0;
    let shift = hv ? 2 : 0;
    if (x & 1) shift += 4;
    const pattern = myrand(x >> 4, y >> 4, level, dungeon, NUM_PATTERNS);
    const idx = pattern * 0x200 + ((x >> 4) & 1) * 0x100 + ((y >> 4) & 1) * 0x80
              + ((x >> 1) & 7) * 0x10 + (y & 0xf);
    return (this.dwall[idx] >> shift) % 4;
  }

  /** retdwall2: same, plus 4 = module teleporter on a wall side. */
  side2(x, y, hv, level, dungeon) {
    const w = this.side(x, y, hv, level, dungeon);
    if ((level < 15 || dungeon === 0) && w === 0 &&
        cmod(s16(mul16(x, y) + mul16(level, dungeon)), 128) === 1) return 4;
    return w;
  }

  sides(x, y, level, dungeon, teleporters = true) {
    const f = teleporters ? this.side2.bind(this) : this.side.bind(this);
    return { n: f(x, y, 1, level, dungeon), s: f(x, y + 1, 1, level, dungeon),
             w: f(x, y, 0, level, dungeon), e: f(x + 1, y, 0, level, dungeon) };
  }

  /** solidcheck: true when all four sides are walls (square is rock). */
  solid(x, y, level, dungeon) {
    return this.side(x, y, 0, level, dungeon) === 0 && this.side(x, y, 1, level, dungeon) === 0
        && this.side(x + 1, y, 0, level, dungeon) === 0 && this.side(x, y + 1, 1, level, dungeon) === 0;
  }

  /** check_for_ladder: floor offset (>0 down, <0 up, 0 none). A ladder down stops above `bottom`,
   *  the deepest floor of the module, which is the module's own unless a caller moves it. */
  ladder(x, y, level, dungeon, bottom = BOTTOM_LEVEL[dungeon]) {
    for (let i = level - 1; i > level - 4 && i >= 0; i--) {
      if (!this.solid(x, y, i, dungeon) && myrand(x, y, i, dungeon, 27) === 1) {
        let j = i + 1;
        while (this.solid(x, y, j, dungeon)) j++;
        if (j === level) return i - level;
      }
    }
    if (myrand(x, y, level, dungeon, 27) === 1) {
      for (let j = level + 1; j < level + 3 && j < bottom; j++) {
        if (!this.solid(x, y, j, dungeon)) return j - level;
      }
    }
    return 0;
  }

  /** town_features (floor 0 only): 1 store, 2 temple, 3 bank, 4 inn, 0 nothing. */
  townFeature(x, y, dungeon) {
    if (x <= 0 || x >= DUNGEON_XMAX || y <= 0 || y >= DUNGEON_YMAX) return 0;
    const n = myrand(x, y, 0, dungeon, 60);
    return n <= 4 ? n : 0;
  }

  /** trapdoor: destination floor (multiple of 5) or -1. Ladder squares are not checked by the game.
   *  `bottom` is the deepest floor of the module, as in ladder(); `reach` is how far the doors of
   *  this floor lead, the module's own unless a caller moves it. */
  trapdoor(x, y, level, dungeon, bottom = BOTTOM_LEVEL[dungeon], reach = trapdoorReach(bottom)) {
    const a = myrand(x, y, level, dungeon, 2400) * 5;
    if (a < 5 || a >= reach.limit) return -1;
    const dest = reach.deepest === null ? a : drawnTrapdoorDest(x, y, level, dungeon, reach.deepest);
    if (Math.trunc(dest / 5) === Math.trunc(level / 5)) return -1;
    return dest;
  }

  /** detect_chute: floor the chute drops to, or `level` if this square has no (working) chute.
   *  `bottom` is the deepest floor of the module, as in ladder(). */
  chute(x, y, level, dungeon, bottom = BOTTOM_LEVEL[dungeon]) {
    const rng = Math.max(20, 230 - Math.trunc(level / 3));
    if (myrand(x, y, level, dungeon, rng) < 5) {
      const reach = level > 9 ? 5 : 3;
      for (let i = level + 1; i < level + reach; i++) {
        if (i > Math.trunc(3 * bottom / 4)) break;
        if (!this.solid(x, y, i, dungeon)) return i;
      }
    }
    return level;
  }

  /** trapdoor_dest: the (x, y) every trap door to `level` lands on. */
  trapdoorDest(level, dungeon) {
    for (let i = 10; ; i++) {
      const r = new BorlandRand(i);
      const a = r.random(60) + 10, b = r.random(90) + 10;
      if (!this.solid(a, b, level, dungeon)) return [a, b];
    }
  }

  /** Whole floor as rows[y][x] of {n,s,w,e,solid,ladder,chute,trapdoor,town}. */
  floor(level, dungeon, teleporters = true, bottom = BOTTOM_LEVEL[dungeon], reach = trapdoorReach(bottom)) {
    const rows = [];
    for (let y = 0; y < HEIGHT; y++) {
      const row = [];
      for (let x = 0; x < WIDTH; x++) {
        const sq = this.sides(x, y, level, dungeon, teleporters);
        sq.solid = this.solid(x, y, level, dungeon);
        sq.ladder = 0; sq.chute = 0; sq.trapdoor = -1; sq.town = 0;
        if (!sq.solid) {
          sq.ladder = this.ladder(x, y, level, dungeon, bottom);
          // The game checks the ladder first and only asks about buildings, trap doors and
          // chutes on squares without one (drawsquare 3000:87de, movecontrol 2000:c308).
          if (sq.ladder === 0) {
            if (level === 0) {
              sq.town = this.townFeature(x, y, dungeon);
            } else {
              sq.trapdoor = this.trapdoor(x, y, level, dungeon, bottom, reach);
              const c = this.chute(x, y, level, dungeon, bottom);
              sq.chute = c !== level ? c : 0;
            }
          }
        }
        row.push(sq);
      }
      rows.push(row);
    }
    return rows;
  }
}

/** Same ASCII rendering as unfmap.py, for cross-checking the two ports. */
export function render(rows) {
  const out = [];
  for (const row of rows) {
    let line = "";
    for (const sq of row) {
      let ch;
      if (sq.solid) ch = "#";
      else if (sq.town) ch = "SPBI"[sq.town - 1];
      else if (sq.ladder > 0) ch = ">";
      else if (sq.ladder < 0) ch = "<";
      else if (sq.trapdoor >= 0) ch = "T";
      else if (sq.chute) ch = "v";
      else if ([sq.n, sq.s, sq.w, sq.e].includes(4)) ch = "@";
      else if ([sq.n, sq.s, sq.w, sq.e].includes(1)) ch = "=";
      else if ([sq.n, sq.s, sq.w, sq.e].includes(2)) ch = "?";
      else ch = ".";
      line += ch;
    }
    out.push(line);
  }
  return out;
}
