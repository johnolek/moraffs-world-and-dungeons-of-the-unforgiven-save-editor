# Tidbits — things in unf.exe that nobody would guess from playing

Each of these was read out of the 1993 registered executable (addresses are in the
page-relaid Ghidra layout; see FUNCTION-CATALOG.md).  The earlier "top findings" —
the 1.4^L experience curve, the children discount, the trap-door landing square, the
teleporter rule — are in the FAQ and the RE notes; this list is the rest.

## The copy-protection you never noticed

* **The file called `v`.**  The first thing `main` does after allocating memory is open a
  file named simply `v` in text mode, print it line by line in yellow (that is the
  "A Note from MoraffWare: How to verify your registration" text), wait for a key, and
  compute a five-part checksum of every byte up to the `~`.  The five sums must equal
  exactly 1, 0x16F, 4, 0xAF2C and 0xAE; if any differs a "tampered" flag is set and the
  game quietly `exit(0)`s a few calls later, before the character list.  Delete or edit
  `v` and the registered game just... stops (2000:60e8, 2000:620f).
* **`intro.txt` does nothing.**  Its one line says "You can remove this file, but modifying
  it is an 'Unforgivable' action!" — a wink at the check above.  The shareware nag screen
  that mentions it ("DELETE THE FILE 'INTRO.TXT' TO REMOVE THIS SCREEN") is still compiled
  into the registered exe at 4000:751b, but nothing calls it.
* **A hidden message, Caesar-shifted.**  The quit screen prints "PLEASE DO NOT DISTRIBUTE
  THIS GAME".  That string is nowhere in the file: it is stored as three fragments
  `NJC?QC`BM`` / `LMR`BGQRPG@` / `SRC`RFGQ`E?KC` and decoded at run time by adding 2 to
  every character and turning backticks into spaces (2000:5f78), so a `strings` dump — or
  a hex editor looking for something to patch — never sees it.
* **The launcher's secret handshake.**  `UNFORGIV.EXE` is only a video-mode picker; it
  runs `UNF.EXE` with the arguments `~ T <mode> <chipset>`.  `UNF.EXE` checks that
  `argv[1]` is `~` and otherwise prints "Type `UNFORGIV' to start this game" and exits.
  The second argument is `S` or `T` (with `T` the mouse-detection call is skipped); the
  digit is the resolution mode; the last number is the SVGA chipset for modes 8, 9, A.

## Colours and pictures

* **Shadow bosses are a palette trick, not a picture.**  Every Shadow boss shares picture 7
  with its section's first regular monster.  Ten of them have tint 32 in colour set 2,
  which puts their tint pixels on palette entry 64 — an entry the dungeon palette never
  writes.  Memory starts zeroed, so in a fresh session those regions are black shadows.
  The other ten have tint 0, which the drawing routine treats as "skip", so they have holes
  through which the corridor shows.
* **Your last shopping trip colours the boss.**  Entries 64..79 of the palette are written
  only by the building palette.  When you leave a shop the game rebuilds 32..63 and 80..95
  but not 64..79, so for the rest of the session the Shadow bosses' black parts are painted
  in the shop's dark brown.  Whether a boss looks like a shadow depends on whether you have
  been inside a building since starting the game (4000:12c3).
* **The wall textures borrow a monster's colour.**  3-D walls are drawn with colour set 80
  and the same tint rule; the tint variable is simply whatever monster was drawn last, so
  the ~3,000 tint pixels in each wall set take that monster's colour (3000:0f75).
* **Floating garbage cans.**  In the three water sections the 22 built-in monsters are drawn
  140 rows tall instead of 200, with `overlay.pic` (the water) drawn over the bottom — that
  is why cans and puffballs "float" (3000:0f75, `DAT_4fc5`).
* **The picture format is a run-length code with a 201-entry row table**, 5-bit colours,
  and `ufmon.pic` starts with the two ladder pictures before the seven built-in monsters.
  `ufwallN.pic` image 2 is the "STEP THROUGH THIS TELEPORTER" sign — proof that the
  teleporters that are commented out in the recovered source are live in the exe.

## Monsters

* **Monsters outside a bubble are frozen.**  Each moment, a monster only moves if its
  Manhattan distance to you is under `floor/10 + 10` squares (10 on floor 1, 20 on floor
  100), and then only with an 80% chance: one step toward you, x-axis first, the y-axis
  only when that step is blocked, no pathfinding, and doors and secret doors do not stop it
  (2000:a53c).  Everything farther away stands still forever.
* **Fast Move and Invisibility are the same trick.**  Each gives the monsters a 1-in-4
  chance of losing the whole moment (`random(4) == 1` -> return before anyone moves).
* **The monster cache is keyed by floor number only.**  `load_level_map` keeps three
  floors' monster arrays in memory keyed by floor number, not module, so walking floor 5
  of Module I and then floor 5 of Module II in one session can hand you the stale array.
* **Every dead monster is the same garbage can.**  `kill_monster` (3000:b12d) and the
  puffball branch of `defend` rewrite the slot as type 0 / level 0 / 0 HP at (100, 100);
  the 80x110 occupancy grid is one unchecked byte run, so when `load_monster_map` or
  `stock_level`'s come-back branch rebuilds it, byte 8100 aliases to square (20, 101),
  and every corpse on the floor sits there.  Facing it kills it at once (HP < 1) for
  `(2+1) * (0 + 1 + 5 * 1.23^0) = 18` experience plus floor-rate drops.
* **Poison and disease are stat drains on a 450-move timer**: poison takes 1 STR and disease
  1 CON every 450 moments (each floored at 1), and Resist Poison / Resist Disease pause the
  counter rather than cure it (2000:a53c).
* **Boss HP in sections 18-20 is doubled after the +20/level bonus**, which is why the
  Module V bosses feel like a wall.
* **The last boss's reward message is not in a text file.**  `kill_monster` (3000:b12d) gives
  the other nineteen section bosses `give_hint(60 + section)`; section 20's case skips
  `give_hint` and prints the tiny-cat screen and the Orb of Explosive Weapon Enhancement from
  string constants in the executable.  UH.BIN's run of reward hints stops at 78, which is the
  boss of floor 75 telling you to go and find the Shadow Ogeroth.

## Numbers with a story

* **Every trap door on a floor lands on the same square** — the first non-solid square
  produced by `srand(10)` (then 11, 12...): `random(60)+10, random(90)+10`.  For most floors
  that is (18, 93).
* **Ladders are 1-in-27 squares, chutes 5-in-(230 - floor/3)**, and both are pure hash
  lookups — the dungeon has no stored map at all; every wall is
  `myrand(x, y, floor, module)` into one of 25 sixteen-by-sixteen wall patterns in
  `UNFDUNG.BIN`.  `abs(-32768)` staying negative in C is part of the map.
* **Spell arrays reserve 15 levels** (stride 45 = 15 levels x 3 slots) though only 10
  levels exist — Moraff left room for five more spell levels per book.
* **Great Swords and Titanium have prices** (9,900 and 60,000) in the store tables but the
  menus stop at key 6, so they can only be found.
* **The intro demo has maps.**  `010.DUN` / `011.DUN` are explored-map files for the
  attract-mode demo character; they are deliberately not valid game maps.
* **The `.uhp` files are the F1 help screens.**  `0.uhp`..`29.uhp` in the game folder are not
  the snake's hints: `read_help_screen` (3000:7c6d) builds the name `<n>.uhp` out of the topic
  number the F1 menu picked and reads one every time help is asked for.  A letter of `rgbynow`
  in the text is a colour code rather than a character, and `e` ends the page.  The snake's
  spoken hints are `UH.BIN` (138 messages of eight lines, `give_hint` 2000:313a) and the stone
  tablets `UH2.BIN` (86 of four, `tablet_message` 3000:931c).
* **One help screen has no key.**  The F1 menu's twenty-eight lines open twenty-eight of the
  twenty-nine `.uhp` files.  `18.uhp` is the options help of `16.uhp` on a single page instead
  of two, and nothing opens it; there is no `19.uhp` either.
* **The inn is a different inn in each module.**  `flea_inn` (2000:4fe7) prints hint 16 +
  module — the Hell Hole Inn, the Slacker Hotel, the Flea Bag Inn, the Motel 6.5 and the
  Moraff Inn — and then works the room price, the aging and the spell-point refill out
  of the level and the children helped, with no module anywhere in them.
* **`f_bug.exe` and `fix.bat`.**  The README's "if the map keeps telling you to GO EAST,
  type FIX" deletes every `*.MAP` and runs `f_bug`, which "puts the special monster back".
  The boss position is remembered per section in the save (`bossX/bossY`); the homing
  text points at that remembered square, so a monster map without the boss on it — the
  cache bug above is one way to get one — sends you east forever.

## Random numbers that are not random

Borland's `rand()` is a linear congruential generator, and the game re-seeds it constantly
with the clock.  Consecutive seeds give outputs that are *linear* in the seed: the first
`rand()` after `srand(t)` rises by 346 (out of 32,768) for every tick t, the second by
-216, the third by +10,851.  Everything below follows from that (`clock()` here is the
BIOS tick counter, 18.2 per second, counted from program start and truncated to 16 bits).

* **Your to-hit roll is a clock.**  `strike()` (2000:7e36) begins with `srand(clock())`
  and its very first `rand()` is the `random(80)` to-hit roll.  So that roll is not random:
  it climbs 0, 1, 2 ... 79 at 0.85 per tick and wraps every 5.2 seconds of real time, for
  as long as the game runs.  Swing at the right moment and you always roll high.  Only the
  later rolls in the swing (damage dice, strength bonus) move fast enough to look random.
* **The monster's roll is not the sawtooth.**  `defend()` (2000:82b7) does seed with
  `srand(clock() + 100)`, but its first roll is the capital-R `Random(80)`, which reseeds
  again with the accumulator scheme below, so that seed is dead code; only the player's
  to-hit roll is the pure clock.
* **Monsters are stocked in diagonal stripes.**  `stock_level()` (2000:671e) seeds every
  placement with `srand(clock() + slot + counter)` — consecutive seeds — and then takes
  `x = random(80)`, `y = random(110)` as the first two outputs.  Slot after slot, x rises
  by about 2 and y falls by about 2, so a freshly stocked floor holds its 145 monsters in
  parallel diagonal lines.  Every `?MON.MAP` in John's folder shows it: the step between
  consecutive slots is (+2, -2) far more often than anything else, and because monsters
  outside the `floor/10 + 10` bubble never move, the stripes survive for as long as the
  floor is cached.  (The Shadow boss is placed separately with `random(50) + 25` and sits
  off the pattern.)  This is also why the FAQ author remembered "identical monster maps":
  the layout depends only on the tick count at stocking time.
* **Money is re-seeded from the wall clock.**  `drop_money()` (4000:6aca) calls
  `srand(time(NULL))` on every kill.  `time()` has one-second resolution, so two monsters
  killed within the same second pay exactly the same dollars.
* **`Random(n)` (capital R, 2000:4156) is a third scheme**: `srand(accumulator + clock());
  accumulator += clock()`.  The running sum keeps it from repeating within a tick, but it
  is still a pure function of the sequence of tick readings.  It drives the find-item gate,
  the spellbook/scroll/wand/paper gates, Sleep, Autokill, Go Away, relocation and the
  explosion damage.
* **Trap doors use `srand(10)`.**  The landing square is the first open square found from
  seeds 10, 11, 12..., which is why every trap door on a floor lands on the same spot.
* **The one properly random thing** is anything that uses `rand()` without re-seeding in
  between — the level nudges and kind rolls inside `stock_level` after the first
  placement, and the damage dice within a swing.

## Left in the binary, never called

* **The old dungeon hash.**  3000:8d7e takes the same five arguments as `myrand` (x, y,
  floor, module, range) and implements it as a chain of `srand(rand()*k)` calls.  Nothing
  calls it; the arithmetic `myrand` at 3000:81ba replaced it.
* **Dice helpers that the game never rolls.**  2000:7832 is a textbook "N dice of M"
  function; 2000:77ae is a bounded random walk; 2000:7800 counts coin flips until tails.
  All three are orphans — every damage roll in the shipped game is "one die per 40 points".
* **An older picture loader** (3000:968b, opens a file and draws it in sequence) and an
  older map-square drawer (3000:8736, four `retdwall` calls and four `draw_side` calls)
  have no callers; so do two large drawing routines in the WORLD segment (2000:1d4f,
  2000:0fc5) that only touch the resolution variables and the line-drawing driver.
* **The shareware nag screen** (4000:751b), as noted above.
* **Five messages nothing asks for.**  UH.BIN 30 is the arrival in a new universe, which
  the module teleporter's own two messages replaced.  UH2 72, 73 and 74 are the
  registration and "modules 2,3,4, and 5 are now available" pitches, sitting in the three
  empty cases at the end of the switch in 3000:6b8a.  UH2 81 is "TRY NOT TO DIE, IT'S BAD
  FOR YOUR HEALTH", which `random_events_tick` guards with `DAT_6000_c08a == -1` on a field
  that is 56 on every character.

## Sized for a bigger game

* `bossX/bossY` have 80 entries indexed `module*8 + section` — room for 8 sections per
  module, 4 are used.  `keys[]` has 36 entries indexed `floor/5` — room for floor 179.
  The monster-level formula has a special case for `floor + 15*module >= 221`, which no
  module can reach (Module V tops out at 105 + 60 = 165).  Spell arrays hold 15 levels
  of 10.  Great Sword and Titanium have store prices.  The monster record has an
  `exp = -1` "worth nothing" case that no monster uses.  Every one of these is a knob
  for content that never shipped.

## Bugs, or at least things that cannot have been meant

* **The level-5 priest "Protection"** sets protection level 1 — the same as Minor
  Protection — so a priest goes from 2 to Major's 18 with nothing in between.
* **The damage cap is a cliff.**  In `defend()`, `if (d > floor*4) d = floor` — a hit of
  4 x floor + 1 is cut to floor, but 4 x floor gets through untouched.
* **The 1-in-4 "replacement" roll can un-hit you.**  After the dice, `random(4) == 1`
  replaces the damage with `random(floor/2 + 3)`, which can be 0 — a monster that rolled
  a solid hit does no damage a quarter of the time on shallow floors.
* **Drain Monster kills pay level-0 XP** because the monster's level is reduced before the
  kill is scored; **Youth costs 10% of your experience**; **Ascend fails from floor 66**
  while the message says 64.
* **The anti-magic ring** is stored, displayed and castable, and no code ever reads it.
  **Lucky charms** are in both combat formulas and nothing in the game grants one.
* **Monster arrays are cached by floor number only** (three floors, no module in the key),
  so switching modules can hand you another dungeon's floor.
* **Palette entries 64..79** are never rewritten after a shop, so they leak the last shop's
  colours across screens.  (The wall tint does not: `FUN_3000_342d` writes DS:4fbd itself
  before every face — see `PICTURES.md` section 4.)
* **The `v` file has no NULL check**: `fopen` fails, `fgetc(NULL)` reads memory from
  DS:0000 (the Borland copyright string), and the loop runs until it meets a `~` byte.
* **A power weapon spell** replaces only the damage die; the held weapon's hit bonus,
  plus and speed still apply, so the best play is to keep your best weapon in hand.
* **The town greeting follows the deepest floor reached, not the level.**  `FUN_3000_9488`
  picks it from DS:c179, which `movecontrol` raises as you walk.  That is offset 0x8f9 of the
  0xa87-byte block `save_player` writes, so it is saved and reloaded with the character; only a
  brand-new one is greeted with "You are still a wimp!".

## How much time a spell costs, and why it matters against a boss

`cast_a_spell` (2000:e017) returns a casting time and `movecontrol` turns it into monster
attack opportunities (`call_check_eng` 2000:a319, which runs every adjacent monster's
attack timer down by that many seconds and lets it strike while the timer is negative,
`(85 - speed)/3 + 10` seconds per strike, at most three strikes per check):

* battle spells, and any scroll/wand/paper of one: **10 seconds** -> one check of 10 s.
  Against Shadow Ogeroth (20-second interval) that is exactly one attack per two zaps.
* preparation spells (cures, protections, resists, Descend): **100 seconds** -> one check
  of 60 s -> up to three attacks from an adjacent boss.  Cast them before stepping in.
* permanent spells (wand and scroll making, Extra HP): **36,096 seconds**, and any time of
  30,000 or more skips the engagement check entirely -> making a wand next to a boss is
  free.
* a spell that changes floors returns 1 second.

On a new engagement the monster's timer starts at `random(AGI)` (2000:b8f7), so a
high-agility character gets a few free zaps; a level-32 monk with AGI 5 gets none.
