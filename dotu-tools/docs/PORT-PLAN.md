# A browser-playable Dungeons of the Unforgiven — what is known, what is not, and a plan

Short version: yes, it is feasible, and most of the hard-to-guess parts are already
recovered.  The game is small — 647 functions, of which roughly 100 are game rules and
the rest are the Borland runtime, video drivers and drawing primitives that a browser
replaces with `<canvas>`.  The rules that matter are in this bundle as tested JavaScript.
What is *not* yet recovered is mostly presentation and glue: the exact 3-D view geometry,
the menus and hint system, and a few timing details.

## 1. Inventory: ready to use

| area | source in this bundle | status |
|---|---|---|
| dungeon layout (walls, doors, secret doors, teleporters, ladders, trap doors, chutes, town buildings) | `unfmap.js` / `dotu-explained.js` §10 + `data/unfdung.bin` | verified on 341k explored squares |
| monster stocking (145 per floor, kinds, levels, HP, boss floors and positions) | `dotu-mech.js`, `dotu-explained.js` §4 | from the exe, cross-checked with the source |
| monster movement | see §3 below (`pass_moment` 2000:a53c) | read, not yet coded |
| combat (strike, defend, breath, protection, power weapons) | `dotu-explained.js` §5 | line-for-line with UNF.CPP |
| XP, level thresholds, level-up gains | §2, §3 | matches the game's E screen |
| loot: weapons, armor, money, finds, books, scrolls, wands, papers, drainer bonus, boss rewards | §6 + `bossRewards` in `dotu-data.json` | from the exe |
| town: store prices, refund, inn cost/aging/level-up, temple, bank | §7 | from the exe |
| time: move/attack/monster intervals, poison & disease ticks | §8 | from the exe |
| spells: SP costs, durations, damage/cure amounts, sleep/autokill/drain rules, class rules | `dotu-data.json` `spells[]`, `dotu-mech.js`, RE notes §5 | complete list of 120 spells and effects |
| all monsters (names, types, pictures, tints, drains, breath) | `dotu-data.json` `builtinMonsters` + `sections` | from DS:4fc9 and MD.BIN |
| pictures: monsters, buildings, walls, ladders, water overlay | `dotu-pic.js`, `pics/`, `data/palettes.json` | pixel-exact |
| save files (read AND write, checksum), `.DUN` explored maps, `?MON.MAP` | `dotu-files.js` | tested on real files |
| hints (`UH.BIN`) and spell help (`USPELLS.HLP`) | `give_hint` 2000:313a, `read_spell_help` 2000:7a78 | readers identified; the `.uhp` files in the game folder are the F1 help screens, read by `read_help_screen` 3000:7c6d |

A browser port can therefore load one of John's real characters, place it on the real
floor at the real square, draw the real monsters in the real colours, and run the real
fight — that is the milestone that proves the whole thing.

## 2. Not yet recovered (and how hard each is)

* **The first-person view geometry** (`draw_3d_view` 3000:0f75, 654 decompiled lines).
  It is a classic three-squares-deep corridor renderer: for each of the visible squares
  it draws the floor/ceiling perspective tiles (`ufwallN` images 6..9) and the wall/door/
  teleporter textures (images 0..5) scaled into rectangles with `scale_image2`, front to
  back, then the nearest monster over the top (monsters in water sections are 140 rows
  tall with the overlay).  The rectangle coordinates are computed from the resolution
  (`799`, `0x63f`, `0x4af` scale factors appear everywhere: the game works in a virtual
  1600 x 1200 space and scales down).  Transcribing it exactly is a day's work; designing
  your own corridor renderer with the same textures is an afternoon and nobody would
  notice.
* **`movecontrol`** (2000:c308): the keyboard loop.  The key bindings are in the FAQ; the
  order of checks (engagement before movement, ladder prompts, digging, the option
  toggles) needs a read-through but has no formulas in it.
* **Engagement rules** (`check_engagement` 2000:a0c8, `call_check_eng` 2000:a319): which
  monster you are fighting and when a monster gets to attack.  Timing is in §8; the
  "monster in front of you in any of four directions" rule is simple.  The two timer
  functions 2000:b782 / 2000:b8f7 are named "probable" in the catalog.
* **Character creation** (`roll_char` 3000:4c77): the decompiler fails on it; use the FAQ's
  formulas (they were checked against the race table at DS:0130).
* **The hint snake**: `give_hint(n)` prints hint n; *when* each hint fires is scattered
  through `movecontrol` and the town functions.  A port can trigger them liberally or
  skip them.
* **Sound**: the game has none beyond PC-speaker beeps.
* **Fonts**: `.fnt` files (`load_font` 4000:0abf) are not decoded — any pixel font will do.

## 3. Monster movement, as read from `pass_moment` (2000:a53c)

Every "moment" (each player action that consumes time):

1. Spell timers tick down.  If Fast Move is on, 1 moment in 4 is skipped entirely for the
   monsters; the same again if Invisibility is on.
2. Disease: counter −1; when it reaches 1 it resets to 450, CON −1 (min 1), save, hint.
   Poison: same with STR.  Resist Disease / Resist Poison pause the counters.
3. For each of the 145 monster slots: with probability 4/5 (`random(5) != 1`), if the
   monster is within Manhattan distance `floor/10 + 10` of the player, it takes one step
   toward the player: first along x (west if the player is west and the wall on that side
   is open and the square is empty; else east likewise), otherwise along y.  Monsters
   farther away than that radius do not move at all — the dungeon is frozen outside a
   bubble that grows from 10 squares on floor 1 to 20 on floor 100.

That is the entire AI.  There is no pathfinding, which is why monsters get stuck behind
walls and why "monsters that drift down corridors in boats" are just monsters walking.

## 4. Suggested phases

1. **Dungeon walker** (a weekend): load a save + `.DUN`; render the map explorer that is
   already planned; add a first-person canvas view built from the wall textures and the
   generator's four side codes; draw monsters from `?MON.MAP`.  No rules yet, but the game
   world is already real.
2. **Moments and monsters**: the clock, movement (§3), stocking a fresh floor, ladders,
   trap doors (they all land on the same square — see TIDBITS), chutes, teleporters.
3. **Combat and loot**: engagement, `playerStrike` / `monsterAttack`, `kill_monster` in
   the exe's evaluation order (`dotu-explained.js` §6 follows it), death.
4. **Town**: store, inn (aging, level-ups), temple, bank — all formulas exist.
5. **Magic**: the 120 spells from `dotu-data.json`; scrolls/wands/papers; the immune-boss
   rule; the SP accounting.
6. **Saves**: round-trip through `dotu-files.js` so the browser game reads and writes the
   DOS files — the same character can be played in DOSBox and in the browser.
7. **Polish**: hints from `UH.BIN`, the `.uhp` help screens, the monster manual (`monster_manual`
   3000:c39d reads the 24 text lines per section from MD.BIN — those are in
   `dotu-data.json` too), the title and death screens.

## 5. Notes for whoever writes it

* Use `dotu-explained.js` as the rulebook and keep its `steps` output — an in-game
  "show the math" panel is a feature the original never had and fans will love.
* Keep the 16-bit quirks: `abs(-32768)`, truncating division, `random(n)` never returning
  n.  The maps depend on them and `unfmap.js` shows every place they matter.
* The game's random numbers are Borland's `rand()`, re-seeded from the clock in several
  places, and some of the game's *feel* comes from that (TIDBITS.md, "Random numbers that
  are not random"): the to-hit roll is a 5-second sawtooth, monsters are stocked in
  diagonal stripes, trap doors all land on one square.  Decide up front whether the port
  reproduces those (use `BorlandRandom` with the same seeding) or fixes them (any RNG).
* Monster records are 6 bytes (x, y, hp lo, hp hi, type, level); the type byte indexes
  the 27-entry table (22 built-ins + the section's 5) and everything about a monster —
  picture, tint, drains, XP multiplier — comes from that table.
