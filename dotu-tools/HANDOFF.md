# Dungeons of the Unforgiven fan tools — handoff

This bundle is everything needed to extend the Moraff Save Editor (`index.html` in this
repo) into a full fan toolkit for *Moraff's Dungeons of the Unforgiven* (DotU, 1993 DOS):
a map explorer for all five modules, drop/experience/economy/combat calculators, a
bestiary and a spell reference, all driven by formulas and data recovered from the
game's executable. Nothing here is guessed: every algorithm was read out of `unf.exe`
(or the recovered `UNF.CPP`) and the map generator is verified against 341,000 squares
of real explored-map files, so treat the reference code as the spec and port it
faithfully rather than re-deriving anything.

Read this file top to bottom once; then §5 (map generator), §6 (file formats) and
`reference/` are what you will keep coming back to.  Second-wave additions (pictures,
the readable rulebook, the port plan) are listed in §12.

## 0. Quick facts

* Game files live in `~/games/4unf for claude/` (registered 1993 build). The user's
  own characters are the files `20`..`29` there, with `?##.DUN` map files and `?MON.MAP`
  monster files. Never modify those; copy them when you need fixtures.
* The reverse-engineering notes (`reverse-engineering/UNFORGIVEN-RE-NOTES.md` in that
  folder) and the corrected GameFAQs FAQ v2.2 (`dotu gamefaqs v2.2.txt`) are the prose
  references. The FAQ's sections `[COMT]`, `[TOWN]`, `[LOOT]`, `[MGEN]`, `[LDRS]`,
  `[SPMC]`, `[EXPT]`, `[HPSP]`, `[CEDB]` are cited throughout this document; copies of
  both files are in `docs/`.
* This bundle (`dotu-tools/`):
  * `reference/unfmap.js` — the dungeon generator (ES module, verified). **Use as is.**
  * `reference/unfmap.py` — same thing in Python, the primary reference; it carries the
    `--check` mode that validates against `.DUN` files.
  * `reference/dotu-mech.js` — every calculator formula (XP, drops, money, town prices,
    level-up rolls, strike/defend simulation, timing, spells). `node dotu-mech.js` runs
    its self-test.
  * `reference/dotu-files.js` — parsers for character files, `.DUN` and `MON.MAP`,
    plus section/boss-index helpers. Tested on the user's real files.
  * `reference/make_fixtures.mjs` — regenerates `fixtures/`.
  * `data/dotu-data.json` — races, classes, weapons, armor, temple, the 16 monster
    types, the 22 built-in monsters, the 20 sections (5 monsters each with the in-game
    descriptions), the 120 spells with in-game text, the 20 boss rewards, constants.
  * `data/unfdung.b64.js` — `UNFDUNG.BIN` (the 12,800-byte wall tile set) as base64, so
    the page works without asking the user for the file.
  * `fixtures/floors.txt` — ASCII renders of 11 floors (regression fixtures);
    `fixtures/floor-summary.json` — per-floor counts of open squares, ladders, chutes,
    trap doors (with destinations), teleporter squares, doors, town buildings and the
    trap-door landing square for all 330 floors.

## 1. What to build (prioritized)

**P0 — Map explorer.** Render any floor of any module (Module I–V, floor 0 = town up to
the module bottom 25/45/65/85/105) with walls, doors, secret doors, down/up ladders,
chutes (with destination floor), trap doors (with label = destination floor), module
teleporters, town buildings (store/temple/bank/inn). Pan/zoom, hover tooltips, a floor
picker, a legend, and "jump to the floor this ladder/chute/trap door goes to". Everything
is computed on the fly from `unfmap.js`; there is no map data to ship except
`unfdung.b64.js`.

**P0 — Save overlay.** Drop a character file (`2x`) plus its `.DUN` and `MON.MAP` files
onto the page: show the character's position and facing, the explored squares, the
monsters on the cached floors (name, level, HP, boss highlighted), the remembered boss
spots, which trap doors the character holds keys for, and which section bosses are
already beaten. The editor already parses the character file; `dotu-files.js` adds the
other two.

**P1 — Calculators** (all formulas in `dotu-mech.js`, prose in the FAQ):
1. *Drop calculator*: floor + module + class → per-kill chance and expected kills for every
   weapon, armor, magic item, spell book/scroll/wand/paper, potion and key; monster level
   distribution on that floor.
2. *Experience planner*: class level + difficulty → XP to next level(s); floor/module →
   XP per kill by monster; kills-to-level; what a level drain would cost.
3. *Economy*: level + children helped → inn price, culture stock and crystal prices,
   upkeep per rest, break-even for helping children; money per kill by floor.
4. *Combat*: your stats/gear/spells vs. a chosen monster on a chosen floor → hit chance,
   damage per swing, monster hit chance and damage against you, attacks per action
   (timing), Sleep/Autokill/Drain Monster odds. Monte Carlo over the exact `strike()` /
   `defend()` ports.
5. *Level-up roll*: class + stats → HP/SP gain range per level (and the loss per drained
   level).

**P1 — Bestiary and spell reference.** All 20 sections with their five monsters,
type stats, XP multiplier, drains/breath/special, in-game description, HP range and XP
value at the floors where they appear; the 120 spells with cost, in-game text and the
real mechanics (`[SPMC]`).

**P2 — Route planner.** Shortest way from town to floor N (or to a boss) using ladders,
chutes, trap doors (given the keys the character owns), the slosher and digging limits.
The floor graph is small (≤ 106 floors per module), the intra-floor graph is 80×110.

**P2 — Boss tracker / character dashboard**: from the save, which of the 20 rewards are
collected, where each boss was last seen, keys owned, upkeep at the current level.

## 2. What exists

`index.html` (this repo) is a single-file, no-build, vanilla-JS editor with a
data-driven field schema (`UNFORGIVEN` in the script: scalar/enum/owned-list/counter-list
kinds, spell lists already using the correct 45-slot stride), a dark palette, drag-and-drop
file loading and a download button. It also supports Moraff's World; the tools in this
bundle are DotU-only.

## 3. Recommended architecture

Keep the "open the HTML file, no server, no build" property — it is why the editor is
usable at all. Two workable shapes:

* **Single file, tabbed** (Editor · Map · Calculators · Bestiary · Spells): inline the
  three reference modules and the two data files into `index.html` as `<script>` blocks
  (strip the `export` keywords or wrap in an IIFE). Simplest deployment, ~250 KB file.
* **Multi-file, no build**: `index.html` loads `dotu-tools/reference/*.js` and
  `data/*.js` as ES modules (`<script type="module">`). Cleaner, but `file://` loading of
  modules is blocked by Chrome unless served, so the user would need `python3 -m
  http.server`. If you go this way, say so in the README.

Either way: keep `unfmap.js`, `dotu-mech.js` and `dotu-files.js` byte-identical to the
bundle (or copy them verbatim) so the fixture tests keep passing; put UI code in separate
files/blocks. Rendering: a `<canvas>` is the right tool for the 80×110 grid (each floor
is 8,800 squares × 4 sides); draw once per floor into an offscreen canvas and blit with
pan/zoom. Computing a floor takes ~12 ms in JS (Node, `floor()` with all features); no
caching needed beyond the current floor. Use `requestAnimationFrame` for pan/zoom, compute the square under the cursor from
the transform for tooltips.

Suggested palette additions to the existing `:root` tokens: wall, door, secret door,
open floor, explored floor, ladder down/up, chute, trap door, teleporter, town buildings
(store/temple/bank/inn), monster, boss, player. Keep the existing accent yellow.

## 4. The game model

* **Modules** 1–5 (`dungeon` = 0..4 in the code), each with a **town** at floor 0 and
  floors 1..bottom (`BOTTOM_LEVEL = [25, 45, 65, 85, 105]`). Module V is only reachable
  on "I can handle anything" difficulty.
* **Sections**: 20 in all, 4 per module. `sectionOf(module, floor)` (in
  `dotu-files.js`): floors above 19·(module+1) belong to the module's 4th section,
  otherwise section-in-module = `trunc((floor−1) / (5·(module+1)))`. Each section has its
  own five monsters (slots 22–26: Shadow boss, three regulars, level drainer) and a boss
  floor `5·(module+1)·k` for k = 1..4 (I: 5/10/15/20 … V: 25/50/75/100).
* **Floor geometry**: 80 columns (x, east) × 110 rows (y, south). Squares are separated by
  **sides**; a square has north/south/west/east sides. `side(x, y, 0)` is the side WEST
  of (x, y); `side(x, y, 1)` is the side NORTH of (x, y). So east of (x, y) is
  `side(x+1, y, 0)` and south is `side(x, y+1, 1)`. Side values: 0 wall, 1 door, 2 secret
  door, 3 open, 4 module teleporter (walk into it to change module; only `side2()`
  reports 4). A square is **solid** (rock, never enterable) when all four sides are 0.
  Sides with x < 2 or x ≥ 79 (hv 0) and y < 1 or y ≥ 104 (hv 1) are always walls, so the
  playable area is x 1..78, y 1..103.
* **Facing**: 0 north (y−1), 1 south (y+1), 2 west (x−1), 3 east (x+1).
* **Ladders** are on squares (not sides); a square has at most one ladder, down (+1/+2
  floors) or up (−1..−3). Down ladders never exist on the bottom floor.
* **Chutes** are squares; stepping on one drops you to the first open square straight
  below within 2 floors (4 below floor 9), never past ¾ of the bottom. Ladder squares are
  never chutes.
* **Trap doors** are squares labelled with a destination floor (multiple of 5); they need
  the key `keys[dest/5]` from the save and land on one fixed square per destination floor
  (`trapdoorDest`). The game only checks a square for a trap door when it has no ladder.
* **Town buildings** (floor 0 only): `townFeature()` → 1 store, 2 temple, 3 bank, 4 inn.
  Typically ~200 building squares per town. A square with a ladder is never a building:
  the game checks the ladder first and only asks about buildings (and trap doors and
  chutes) when there is none.
* **Module teleporters**: a wall side with `(x·y + floor·module) % 128 == 1`, only on
  floors below 15 (all floors in Module I). Walking into one goes to the next module
  (from Module I always up, from V always down, otherwise the game asks). You arrive in
  the destination town at a random open square (`relocate()`).
* **Monsters**: a floor gets 145 slots on random open squares when first stocked; the
  monster file caches the current floor and the two visited before it, everything else is
  re-stocked on return. Level = floor + 15·module ± a small nudge, and the hit points come
  from that number before the nudge (`[MGEN]`).

## 5. The map generator

`reference/unfmap.js` (and `.py`) is a line-for-line port of five functions from the
executable plus five from `UNF.CPP`:

| function | origin | what it does |
|---|---|---|
| `myrand(x, y, level, dungeon, range)` | exe 3000:81ba | the hash everything is built on; **16-bit signed arithmetic with wraparound, `idiv` semantics** — the JS uses `Math.imul` and `(v<<16)>>16` to reproduce it |
| `side(x, y, hv, level, dungeon)` | exe `retdwall` 3000:8360 | picks one of 25 tile patterns per 16×16 block via `myrand(x>>4, y>>4, …, 25)` and reads 2 bits out of `UNFDUNG.BIN` |
| `side2(...)` | exe `retdwall2` 2000:c22d | adds the teleporter rule (this rule is commented out in the recovered source but live in the exe) |
| `solid(x, y, level, dungeon)` | exe `solidcheck` 3000:86b5 | all four sides are walls |
| `ladder(x, y, level, dungeon)` | exe `check_for_ladder` 3000:827f | down ladder if `myrand(…,27)==1`, up ladders wherever a down ladder from the three floors above lands |
| `townFeature`, `trapdoor`, `chute`, `trapdoorDest` | `UNF.CPP` | as described in `[LDRS]` |
| `floor(level, dungeon)` | — | convenience: the whole 110×80 grid of squares |

Validation already done (repeat it whenever you touch the generator):

1. `python3 reference/unfmap.py <unfdung.bin> 1 1 --check <all X##.DUN files>` — every
   square the player has ever stood on must be non-solid. Result on all of the user's
   `.DUN` files (10 characters, Modules I–V): 341,154 explored squares, 0 inconsistent. (The intro-demo files
   `010.dun`/`011.dun` are *expected* to fail; they are written by the title-screen demo
   with different parameters.)
2. JS vs Python: `render()` output identical for 14 floors across all modules.
3. `fixtures/floors.txt` — if your port's `render()` of those 11 floors differs by a
   single character, the port is wrong.

Things that bite when porting: `myrand` truncates *twice* in `(x*y*level)/17`
(`x*y` to 16 bits, then `*level` to 16 bits); the C `%` keeps the dividend's sign;
`abs(-32768)` stays negative and then clamps to 0; `retdwall` returns the raw value `% 4`
after shifting, so the byte packs [hv=1,x odd | hv=0,x odd | hv=1,x even | hv=0,x even]
in bit pairs from the top. Coordinates passed to `myrand` by `retdwall` are the *block*
coordinates (`x>>4`, `y>>4`), by the ladder/chute/trap door code the *square*
coordinates. The town (`floor 0`) uses the same generator, with `level = 0`.

Rendering suggestions: draw sides as lines between squares (walls thick, doors as a gap
with a bar, secret doors dashed) and solid squares filled; ladders/chutes/trap doors as
glyphs in the square; mark teleporter sides in a distinct color and, on hover, say where
they lead. Floor 0 is a town: buildings are squares, not sides.

## 6. File formats and ingestion

All parsers are in `reference/dotu-files.js`; details in FAQ `[CEDB]`/`[CEDA]` and RE
notes §6.

* **Character file** `20`..`29`: 2,695-byte record + 2 checksum bytes
  (`a += b; c += a − a²`, both mod 256). Fields the tools need: name 0x000, class 0x02a,
  level 0x7ac, exp 0x7a4 (double), x/y/floor/module 0x7b0/0x7b2/0x7b4/0x7b6, facing
  0x7ae, stats 0x816.., keys[36] 0x822 (index floor/5), bosses beaten 0x849 (byte per
  module, bits 1/2/4/8 = sections 1–4), boss positions 0x855 (x) / 0x8a5 (y) indexed
  `module·8 + sectionInModule`, difficulty 0x8f6, spell arrays 0x177/0x22b/0x2df/0x393
  (180 bytes each, index `45·type + 3·(level−1) + slot`). `parseSave()` returns all of it
  with the checksum verdict.
* **`?##.DUN`**: name = slot letter (`D`..`M` for files 20..29) + `floor >> 5` + module
  (0..4). 4-byte floor bitmask (stored reversed: bytes 3,2,1,0), then per present floor a
  16-byte row bitmask over 110 rows and 10 bytes (80 bits) per present row. It records
  only where the player has stood (or revealed with a Stone of Seeing). `parseDun()` →
  `Map<floorWithinQuarter, Uint8Array(110*80)>`; add `quarter·32` to get the floor.
* **`?MON.MAP`**: 3 bytes (floor of each of the three cached arrays, 255 = none) then
  3 × 145 × 6 bytes `[x, y, hpLo, hpHi, type, level]`. Type 0..21 = built-in monster
  (`data.builtinMonsters`), 22..26 = the current section's five (`data.sections[s-1]
  .monsters[type-22]`), 254 = the player's marker, 255 = empty; killed monsters are parked
  at (100,100). Slot 0 is the Shadow boss on boss floors. Note the arrays can be stale
  from before a module change (the game only compares floor numbers), so label them with
  the floor and let the user pick.
* **`MD.BIN`, `USPELLS.HLP`, the exe tables**: already extracted into
  `data/dotu-data.json` by `reference/build_data.py` (needs the game folder and the
  unpacked exe from the RE folder); you should not need to parse them at runtime.
  `data.spells[i].saveIndex` maps to the 180-byte arrays.
* **`UNFDUNG.BIN`**: `dwall[25][2][2][8][16]`, embedded as base64. If the user drops a
  copy, prefer it (`new Dungeon(bytes)`); we only have the one copy, so other releases
  may differ.

Ingestion UX: one drop zone that accepts any number of files and sorts them by name
pattern (`^2[0-9]$` character, `^[D-M][0-3][0-4]\.DUN$`, `^[D-M]MON\.MAP$`,
`unfdung.bin`, `md.bin`). The character file tells you the slot letter, module and floor
to show first. Everything stays in memory; nothing is uploaded.

## 7. Mechanics for the calculators

Everything below is implemented in `reference/dotu-mech.js`; the prose is in the FAQ
section named. Integer division truncates toward zero throughout; `rand(N)` is 0..N−1.

* **Experience thresholds** (`[EXPT]`): reach level L at `250·1.4^(L−2) − 80` (normal) or
  `250·2^(L−2)` (ICHA); you need strictly more, and levels are only awarded at the inn.
* **Experience per kill** (`[LOOT]`): `mult · (ML + 1 + 5·1.23^ML)`, ML capped at 130;
  `mult` = `expMult` from the data (1 for regulars, 16 for bosses, 3 for blockers, 5 for
  poison/disease monsters). Drain Monster kills pay for level 0 (6·mult).
* **Monster level** (`[MGEN]`): `Lm = floor + 15·module` (→ 1 if ≥ 221), then `while
  rand(3)==0: L += rand(3)−1`, clamp 1..210. `monsterLevelDistribution()` gives the pmf.
  HP is rolled from `Lm` before that nudge, so it does not follow the level the slot ends
  up holding: `(rand(hp·Lm+1) + rand(hp·Lm+1) + 2)/2` (+20·Lm for bosses, ×2 in
  sections 18–20, max 32,000). Type odds: 1/20 puffball, else 1/7 blocker, else 1/15 drainer, else 1/12
  poison/disease, else one of the three regulars.
* **Drops** (`[LOOT]`): weapon/armor `rand(100·N) ≤ ML+10` (N = 1..7 / 1..6), never for
  monks; the "YOU FIND" gate `(floor+40)/950` (550 for fighter/sage) × `min(1, floor/20)`,
  then 1/3 nothing else one of 12 items; level-drainer kills give a potion with chance
  `(floor+175)/375`, otherwise a key (floors 4–178, if not owned); spell books every kill
  for casters (level ≤ 2·floor/3), sages gated; scroll/wand/paper 1/3 each at
  `16/(350−floor)` only when no book was learned; money formula and the cup/ball rolls.
* **Town** (`[TOWN]`): stock `((L/3+1)·L²+10)/3`; crystals `((L/2+1)·L²+10)/3` (or `/2`
  on ICHA); children refund `min(children%, 50%)` on those two; inn `L⁴+10 − L·children`
  floored at half; stock needed `L²`; one crystal per missing SP; temple prices fixed.
* **Level-up** (`[HPSP]`): the seven class formulas; the same roll is subtracted on a
  level drain.
* **Combat** (`[COMT]`): `strike()` and `defend()` are ported verbatim; run them a few
  thousand times for hit chance / damage distributions. Note the three FAQ corrections:
  the `> depth·4 → depth` cap, the 1/4 replacement roll, and the "bonus damage only when
  floor > character level" gate. Timing: monster attack interval `(85−speed)/3 + 10` s,
  move `1 + (100 + weight − 10·agi)/100` s (weight = body + gear, 0 with Feather),
  attack `weaponSpeed + (85−agi)/5` s.
* **Spells** (`[SPMC]`): durations 60 moves (Sleep 25, Hold 15), cures, damage numbers,
  Sleep `rand(ML) < 3`, Autokill formula, Drain Monster, protections 2/8/18/32, Power
  Weapon dice 69/129/199 (held weapon's to-hit/plus/speed still apply), resists 100%.

## 8. Feature specs

### 8.1 Map explorer
Inputs: module (1–5), floor (0..bottom), toggles (explored overlay, monsters, features,
teleporters, grid coordinates). Output: canvas map + side panel with the floor's stats
(from a live count, matching `fixtures/floor-summary.json`), a legend, and on hover the
square's coordinates, its four sides, its feature and where it leads. Clicking a ladder,
chute or trap door switches to the destination floor and highlights the landing square
(same x,y for ladders/chutes; `trapdoorDest(dest)` for trap doors). Show the section
name and boss floor in the header. Keyboard: arrows to move the highlighted square,
PgUp/PgDn to change floor. Export: PNG of the current floor.

### 8.2 Save overlay
Given a parsed save: marker at (x, y) with facing; explored squares from the `.DUN`
matching the slot/quarter/module (dim the unexplored); monsters from `MON.MAP` for the
current floor if cached (name, level, HP; boss highlighted; hovering a monster shows XP
it is worth via `expValue`); remembered boss spot for the floor's section
(`bossX/bossY[bossIndex(module, sec)]`, non-zero means placed before); keys owned →
trap doors the character can use drawn differently from those it cannot; beaten
sections from `objective` bits.

### 8.3 Drop calculator
Inputs: module, floor, class, (optional) which items the character already owns
(weapons block re-drops). Output table: item → chance per kill → expected kills → also
per hour given a kills-per-minute input. Include the monster level distribution and the
"YOU FIND" gate value so the user sees *why*. Include spell-book level ceiling and
scroll/wand/paper odds. Edge cases: monks (all zero), fighters (papers only), sages
(gated books, better scrolls).

### 8.4 Experience planner
Inputs: current level and XP (or a save), difficulty, target level, module + floor to hunt
on. Output: XP needed, XP per kill for each monster on that floor (using the section's
five plus the built-ins, with the level pmf), kills needed, and the level-drain cost
(XP resets to the new level's minimum; HP/SP roll lost).

### 8.5 Economy
Inputs: level, children helped, missing SP per rest, difficulty. Output: room price,
stock and crystal unit prices, stock needed, refund, total per rest; a table by level;
break-even children count `(L³ + 10/L)/2` for the inn floor and 50 for the store.
Money per kill by floor (expected, and a histogram from `rollMoney`).

### 8.6 Combat calculator
Inputs: character (from save or manual: level, class, str/int/wis/con/agi/luck, weapon and
plus, temp plus, gauntlet, armor and plus, body armor, prot ring, protection level,
lucky charms, power weapon level, difficulty), monster (pick from bestiary → type stats;
level from floor/module or manual), floor. Output: hit chance and damage per swing
(mean/percentiles), swings to kill vs. the monster's HP range, monster's hit chance and
damage against you, attacks per your swing (`monsterAttackInterval` vs
`attackSeconds`), expected HP lost per kill, Sleep/Autokill/Drain odds. Breath: 50% per
attack for breathers, `ML + rand(ML)` halved by the resist.

### 8.7 Bestiary / spells
Static pages generated from `dotu-data.json`, searchable, with the FAQ's notes on each
spell's real behaviour (copy the `[SPMC]` text per spell into a `mechanics` field — that
mapping is the one piece of data work left to do).

### 8.8 Route planner (P2)
Graph over (module, floor, x, y) reachable squares with edges for moves through open
sides/doors/secret doors, ladders, chutes (one-way), trap doors (one-way, need key), the
slosher (one floor down, above ⅔ bottom) and digging (up to 6 down, above ¾ bottom).
BFS per floor is 8,800 nodes; a floor-level abstraction (ladder squares as portals) keeps
the whole module tractable. Output the route as a list of floors with the square to reach
on each.

## 9. Testing

* `node reference/dotu-mech.js` — formula self-test (values from the FAQ tables).
* `node reference/make_fixtures.mjs` then `git diff fixtures/` — must be empty after any
  change to the generator.
* `python3 reference/unfmap.py unfdung.bin 1 1 --check *.DUN` with the user's map files
  (copy them from the game folder) — 0 inconsistent.
* Unit tests worth adding for the UI layer: `sectionOf` boundaries (floor 19/20/21 in
  Module I; floor 95/96 in Module V), `dunFileName`, checksum round trip on a save,
  `spellIndex` against the editor's existing spell list.
* Manual: load `26` (INIMICAL2, Module V town) with `J00.DUN`/`J04.DUN` and `JMON.MAP`;
  load `21` (LUCKSTER) with `E01.DUN`; both should place the marker on an open square of
  the explored region.

## 10. Known unknowns

* Monster movement is now read (see `docs/PORT-PLAN.md` §3: one step toward the player
  per moment, 80% of the time, only inside a `floor/10 + 10` radius); the exact
  engagement timers (2000:b782 / b8f7) are still "probable".  The combat calculator should
  model attacks per action, not full pathing.
* Whether the monster stocking RNG is seeded deterministically at startup (the FAQ author
  observed identical monster maps) is unverified; the tools should treat monster placement
  as random and only display what `MON.MAP` says.
* `roll_char()` (starting stats) was not re-derived; the FAQ's `[CBLD]` formulas are the
  best source. A character-creation "reroll odds" tool would need that first.
* The title-screen demo writes `010.dun`/`011.dun` with parameters that do not match the
  generator; ignore those files.
* `.PIC` is decoded and every monster/building/wall picture is rendered with the real
  palettes (`docs/PICTURES.md`, `reference/dotu-pic.js`, `pics/`).  `.FNT` is decoded
  too: `docs/FONTS.md`, `reference/extract_fnt.py`, `data/dotu-fonts.json`.

## 11. Bundle inventory

```
dotu-tools/
  HANDOFF.md                     this file
  docs/dotu gamefaqs v2.2.txt    corrected FAQ (spec for the calculators)
  docs/UNFORGIVEN-RE-NOTES.md    reverse-engineering notes (addresses, offsets, tables)
  data/dotu-data.json            all static game data
  data/unfdung.b64.js            wall tile set, base64
  reference/unfmap.js            map generator (JS, verified)
  reference/unfmap.py            map generator (Python reference + .DUN checker)
  reference/parse_dun.py         Python .DUN / MON.MAP parser used by the checker
  reference/build_data.py        rebuilds data/ from the game files + unpacked exe
  reference/dotu-mech.js         mechanics / calculator formulas + self-test
  reference/dotu-files.js        save / .DUN / MON.MAP parsers, section & boss helpers
  reference/make_fixtures.mjs    regenerates fixtures/
  fixtures/floors.txt            ASCII renders of 11 floors
  fixtures/floor-summary.json    per-floor feature counts, all 330 floors
  --- second wave ---
  docs/PICTURES.md               .PIC format, palette banks, colour rules, how to draw a monster
  docs/METHOD.md                 how the functions in the exe were identified
  docs/PORT-PLAN.md              browser-playable port: what is known, what is not, phases
  docs/TIDBITS.md                the odd things found in the exe (copy protection, palette leaks...)
  docs/CONTEST.md                the hundred-dollar contest, and why the promised code does not exist
  docs/FUNCTION-CATALOG.md       all 647 functions of unf.exe, 185 named, with callers
  reference/dotu-explained.js    the game rules as long-named, step-by-step JS + cross-check self-test
  reference/dotu-pic.js          .PIC decoder + palette/colour rules (ES module)
  reference/unfpic.py            .PIC decoder (Python) + PNG export
  reference/render_monsters.py   renders pics/monsters from the game files + palettes.json
  reference/scripts/render_walls.mjs  renders pics/walls through the port's own drawers
  reference/scripts/EmuPalette.py  Ghidra headless script that emulated set_palette -> palettes.json
  reference/scripts/make_catalog.py  regenerates FUNCTION-CATALOG.md from ghidra_out/functions.txt
  reference/scripts/*.py         the other Ghidra headless scripts (decompile export, setup)
  data/palettes.json             40 emulated 256-colour palettes: m<module>_s<part>_{dungeon,town}
  data/building-palette-banks.json  the two shop palette tables (entries 32..63 / 64..95)
  data/unfdung.bin               the raw wall tile set (same bytes as unfdung.b64.js)
  docs/FONTS.md                  the .FNT bitmap font format
  reference/extract_fnt.py       decodes the three .FNT files into data/dotu-fonts.json
  data/dotu-fonts.json           the game's .FNT fonts as row bitmaps, five sizes of them
  data/uroll.txt                 UROLL.TXT out of the game folder, with the DOS line
                                 endings dropped the way the game's own text-mode read
                                 does: every screen roll_char shows while rolling up a
                                 character, one line of the file to a line on screen
  pics/monsters/                 122 monsters as PNG + per-section sheets
  pics/buildings/                the six town buildings composited (320x200) + sheet
  pics/walls/                    ufwall1-4 textures (10 each) + sheets, each file in the
                                 colours of the first section that loads it
```

## 12. Second wave: pictures, the readable rulebook, the port

* **Pictures.**  `docs/PICTURES.md` is the spec; `reference/dotu-pic.js` draws a monster in
  the browser in four lines (see its §5).  Use `data/palettes.json` +
  `data/building-palette-banks.json` for colours; never hand-pick a palette.  The
  bestiary (§8.7) should show the real picture next to each monster, and the map explorer
  can use the wall textures for a first-person peek at a square.
* **`reference/dotu-explained.js`.**  Same formulas as `dotu-mech.js`, written for
  humans: one named step per line and a `steps` array returned from every calculation.
  Wire `steps` into the calculators as a "show the math" panel.  Its self-test proves it
  agrees with `dotu-mech.js` and `unfmap.js` on seeded random streams; keep both in sync.
* **The port.**  `docs/PORT-PLAN.md` is the plan for a browser-playable version; it is a
  separate project from the tools, but shares every module in `reference/`.

## Appendix — formula sheet

```
myrand(x,y,l,d,r): x+=9; y+=7; l+=13; d+=15  (all int16)
  v = ((x*25)/y + d*7)*l + (l*27)%d + (y*31)%l + ((x*y)*l)/17 + x*13 + y*11 + l*17
  return clamp(|v| % r, 0, r-1)
side(x,y,hv,l,d): pattern = myrand(x>>4, y>>4, l, d, 25)
  byte = dwall[pattern*512 + ((x>>4)&1)*256 + ((y>>4)&1)*128 + ((x>>1)&7)*16 + (y&15)]
  return (byte >> (2*hv + 4*(x&1))) & 3        (0 wall 1 door 2 secret 3 open)
teleporter: side==0 && (x*y + l*d) % 128 == 1 && (l < 15 || d == 0)
solid(x,y): W==0 && N==0 && E==0 && S==0
down ladder: myrand(x,y,l,d,27)==1 -> first open of l+1, l+2 (< bottom)
up ladder:   a down ladder on l-1..l-3 whose landing is l
chute: myrand(x,y,l,d,max(20,230-l/3)) < 5 -> first open of l+1..l+2 (l+4 if l>9), <= 3*bottom/4
trap door: a = myrand(x,y,l,d,2400)*5; valid if 5 <= a < 4*bottom/5 and a/5 != l/5; needs keys[a/5]
trap door landing: srand(10..): x = random(60)+10, y = random(90)+10, first open
town: myrand(x,y,0,d,60) in 1..4 = store/temple/bank/inn
monster level: l + 15*d (+/- nudges);  XP = mult*(ML+1+5*1.23^ML), ML<=130
reach level L: 250*1.4^(L-2)-80  |  ICHA 250*2^(L-2)
inn: L^4+10 - L*children, min (L^4+10)/2;  stock L^2 @ ((L/3+1)L^2+10)/3;  crystals ((L/2+1)L^2+10)/3 (ICHA /2)
```
