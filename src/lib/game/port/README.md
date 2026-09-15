# The port

A faithful TypeScript port of Moraff's Dungeons of the Unforgiven, read out of
`dotu-tools/decomp/unf.c` — Ghidra's decompilation of the 1993 registered `UNF.EXE`, with the
names the reverse engineering worked out. `dotu-tools/docs/UNFORGIVEN-RE-NOTES.md` and
`dotu-tools/docs/FUNCTION-CATALOG.md` are the prose alongside it.

This is not a reimplementation and not a tidy-up. Every function here does what the 1993 code
does, including the parts that look like accidents.

## Where this is going

This port is the game: Dungeons of the Unforgiven, playable in a browser and almost entirely
faithful to the 1993 original, built function by function out of the decompilation. Every piece
of logic it runs is a cited port of the function it came from, bugs included.

The one deliberate difference in play is the random numbers. The original re-seeds from the clock
before nearly every roll, so what it hands back falls into patterns a player can feel — see "Your
to-hit roll is a clock" in `dotu-tools/docs/TIDBITS.md`. Unless the session hands the game a clock
of its own, a game played here draws its numbers from one generator seeded once at the start of
the run, which is why `Rng` is something a `Game` is handed rather than something a ported
function reaches for: `BorlandRng` reproduces the original's rolls for a test that has to match
them, and the run's own seeded generator goes in to play, which is what lets a run be played again
from its log.

## The three deliberate departures

The original keeps the whole game in globals in its data segment: `spell_effect` reads the
player's wisdom straight out of `DAT_6000_c09a` and writes the monster's hit points through a
pointer at `DAT_6000_c64b`. **Every function in this port takes a `Game` instead**, holding the
same state as named fields, and reads and writes that. Nothing else changes: the same fields are
read, in the same order, and written with the same values.

A screen that reads the keyboard is two functions here rather than one: a `draw...` that fills the
screen and a reader that says what one key means, or an `apply...` that acts on the choice. The
play engine puts its own `await` between them. `drawCastTypeMenu` and `gmenuChoice`,
`drawSpellList` and `spellListChoice`, `drawHelpMenu` and `helpMenuChoice` are the pattern.

Input is the other thing a `Game` carries: the original stops and reads the keyboard in the
middle of a spell, so the menus a spell puts up are questions the `Game` answers —
`chooseDirection` for Pass Wall, `chooseWeapon` and `chooseArmor` for the two permanent
enchantments, and `chooseSpell` for the three menus Write Scroll and Enchant Wand walk through.
Each is shaped after what the original's menu code reads back, down to the numbering, and each
one `newGame` supplies cancels the spell. The character roller asks its six questions the same
way, through `askDifficulty`, `askRace`, `askKeepRerollDesign`, `askDesignStat`, `askName` and
`askClass`.

A function that is not in the middle of arithmetic when it asks does not need a question of its
own: `kill_monster` and the two drops it offers wait on `game.choice`, which is `get_choice` (exe
2000:2d93) itself, at the line the original reads the keyboard on. That makes them `async`, which
is what `src/lib/play/`'s loop is built to wait on.

**The second departure is that a spell here stops at the character record.** Ascend, Descend
and the three like them change the floor the character is on and drop them somewhere open on
it; the original then reloads the game around them, and this port does not. Where the original
calls `load_level_map` (exe 2000:7687) to read in the new floor's monsters, and `give_hint`
(exe 2000:313a) with `mgetch_message` (exe 4000:418d) to show Youth's hint out of `UH.BIN`, the
port appends to `game.events` and carries on. The character record ends up holding exactly what
the original leaves in it; what is missing is the world around it, which the play engine in
`src/lib/play/` sees to when it reads those events. The rest of moving between floors — writing the explored map out, redrawing the screen —
happens above `spell_effect`, in the caller, and is not part of this port either way.

Combat stops in the same place. `defend` writes the character record back out to its file five
times over; the port appends a `playerSaved` event instead. Nothing in this port handles the
character dying either, because nothing in `defend` does: it takes the hit points down and
`movecontrol` is what notices the character is dead on the next pass round its loop.

`game.events` carries more than those two departures. A run is written up in words from what the
game reports it did (`src/lib/game/journal-events.ts` and `src/lib/play/journal.ts`), so a ported
function pushes an event where the thing happens and at the point the number is known: the damage
after the roll, the experience after the kill, the coins after the purchase, the spell and the
charges after a wand is written. That reports what the function did and changes nothing about what
it does; the arithmetic on either side of a push is the original's.

The character record's fields are named the way `src/lib/game/dotu-files.js` already names those
save offsets, so `pc.lev` is the character's level and `pc.level` is the floor, exactly as the
save parser has it. Fields that parser does not read are named after their label in
`src/lib/editor/games.ts`.

**The third departure is that the port reseeds the random number generator only when it is given
a clock.** The original calls `srand(clock() + something)` before nearly every roll: `strike`
(exe 2000:7e36) does it at 2000:7e63 before the to-hit roll, `defend` (exe 2000:82b7) does it
with `+ 100` at 2000:84ca, and `Random` (exe 2000:4156) does it on every single call. Section 8
of `dotu-tools/docs/UNFORGIVEN-RE-NOTES.md` is all ten of them, and §8.4 there is which of the
game's 212 rolls go through `Random` and which are written inline. That reseeding is why the
to-hit roll follows the BIOS tick counter round a sawtooth instead of being random, which
`dotu-tools/docs/TIDBITS.md` lays out.

The switch is `Game.clock`, the tick counter the session hands in, or null. Null is what a game
built for a test has, and what a run played off the clock has: the port then reseeds nothing, says
so in a comment where the original reseeds, and the run draws its numbers from one generator
seeded once, which is what lets it be played again from that seed alone. Given a clock — which is
what the faithful and speedrun modes hand in — the reseeds come back and with them the sawtooth
the to-hit roll follows. The clock a session hands in reads the machine's tick counter, and what
it read is written into the run log in front of the input it was read for, so a replay rolls what
the player rolled; `src/lib/play/README.md` is that half of it.

Given a clock the port plays all three of the tick-counter reseeds that reach a die: `strike`'s,
`Random`'s own, and the one `stock_level` (exe 2000:671e) does at 2000:6979 before every try at a
monster's square, which is why a freshly stocked floor holds its monsters in diagonal stripes.
`Game.randomCall(n)` is the `Random` call and `Game.rng.random(n)` is the roll the game writes
inline, and every roll site in the port is one or the other, checked against the instruction
stream; `Game.randomTotal` is the running total `Random` keeps, `DS:c609`, which a sitting starts
the way `main` does except that the seed the sitting was started from stands in for the wall clock
`main` reads, so a replay off the log alone starts it at the same number.

The tick-counter reseed left over is `defend`'s, which never reaches a die even in the original:
the roll under it is a `Random` call, and `Random` reseeds from the clock again before it rolls,
so playing the `srand` above it alone would hand out numbers the game never had. The reseeds after
that are not from the tick counter at all: `roll_char` and `drop_money` seed from `time()`, the
second the roller was started in and the second a kill happened in, which is a clock no session
supplies, and `trapdoor_dest` counts up from 10 and needs no clock. `roll_char` and `drop_money`
are what MORF-519 still owes; everything else the game reseeds, a game here reseeds too. The
arithmetic on either side of a reseed is ported exactly, reseed or no reseed.

## Naming and citations

* One exported function per function of the game, named after the name it has in the function
  catalog, in camelCase: `sleep_monster` becomes `sleepMonster`. Where the catalog has no name
  for a function, it is named for what it does. Where the catalog's name is demonstrably wrong,
  the port likewise names the function for what it does and its doc comment says so.
* A spell whose code the original writes inline inside `spell_effect`, rather than in a function
  of its own, becomes a function here named after the spell: `magicZap`, `minorShock`. Its
  citation names the list, the level and the slot the spell has in the tables of the RE notes —
  level 1 to 10, slot 1 to 3, each one more than the index the switch itself uses.
* `spell_effect` is one function in the game and five here: `spellEffect` on the type, and
  `permanentList`, `preparationList`, `wizardBattle` and `priestBattle` for the four inner
  switches, so that one spell's code can be shown on its own.
* **Every function's doc comment cites where it came from**: the address in the executable and
  the name it has in `dotu-tools/decomp/unf.c`, and for an inlined spell, which case of the
  switch it is.

  ```ts
  /** go_away (exe 3000:db1e, unf.c "go_away"). ... */
  /** spell_effect (exe 3000:e1b8, unf.c "spell_effect"), type 2 level 1 slot 2. ... */
  ```
* Where the game does something that looks unintended, the behaviour stays and a one-line
  comment says why it looks unintended. There are no improvements here.

## The messages

The game prints through `print_menu_only`, which takes eight lines and waits for a key. Here
that is `game.say(...lines)`, which appends to `game.messages`; the empty strings the game pads
the unused slots with are dropped from the end of a call and kept in the middle. Combat also
prints single lines straight onto the message line with `pfont`, out of the scratch buffer at
DS:c427; those are `say` calls of one line each, in the order the game prints them.

The text is upper-case because the game's is. Every line is the exact bytes of the game's own
string, punctuation and spacing included — the leading spaces on a line are the game indenting
its continuation lines. `dotu-tools/reference/scripts/exe_strings.py` prints those strings out
of the data segment of the PKLITE-unpacked executable, which is not in this repository; the
comment on each `say` call lists the address of every line the call prints, in order, so they
can be checked against it. Do not read the text off Ghidra's labels for the string table:
those replace every character that is not a letter or a digit with an underscore.

## The screens

The roller does not print through `print_menu_only`; it draws string by string with `pfont` (exe
4000:0bb3) and `psfont` (exe 4000:0db8), each call naming an x, a y, one of the three fonts and a
colour. That is `game.draw(...)` here, which appends the line to `game.messages` the way `say`
does and also keeps `game.screen`, the lines that are showing. `pfont` works in a grid 1600
across and 1200 down that the game scales to whatever video mode is running, so the coordinates
in the port are the game's own numbers.

The colour is a palette entry between 1 and 15 — what `dotu-tools/docs/PICTURES.md` calls the
fixed UI colours, the same in all forty palettes of `src/lib/game/palettes.json`. Ghidra hangs
that last argument off the end of the call that produced the string rather than the print call
itself, so `read_uroll_line(buffer, file, 4); pfont(0, 0, 1, line)` in `unf.c` is a `pfont` call
in colour 4.

Two things the screen keeps that a log cannot. Drawing over a string already at the same x and y
replaces it, which is how the game puts the next number where the last one was; and colour 0 is
the background, so a call in colour 0 rubs a string out. `game.eraseScreen(fromY)` is
`erase_menu_block` (exe 4000:42b4) and the `fill_rect` calls that clear the bottom of the screen
between one screen of the roller and the next. `game.pressAnyKey()` is `mgetch_message` (exe
4000:418d), the wait that keeps a screen up until the player has read it.

## What is ported

* `state.ts` — the `Game` state, the monster and item tables, and `newGame()` for tests.
* `rng.ts` — `Random(n)` over Borland's generator.
* `sound.ts` — the four noises a fight makes, each with the gates it asks before it plays. The
  speaker they go to is `src/lib/speaker.ts`, which the other two games share.
* `combat.ts` — `strike` and `defend`, with the drains, the poison, the disease, the puffballs
  and the five breath weapons, and the clock that decides how many attacks an adjacent monster
  gets while the player acts: `check_engagement`, `call_check_eng`, `attack_timing`, the battle
  banner, and the seconds a step and a swing cost.
* `character.ts` — `roll_char`: the screens it reads out of `UROLL.TXT`, the questions it asks,
  the race table, the roll, the keep/reroll/design loop, the starting spells, health, spell
  points, kit and money, and the record a new character starts play with. Where it writes the
  character file the port records a `characterCreated` event; where it stocks floor 1 with
  monsters, through `stock_level` (exe 2000:671e), it does nothing.
* `magic.ts` — all four of `spell_effect`'s spell lists and `spellEffect` itself, with the
  helpers they share: the explosion roll, the autokill roll, Drain Monster, Go Away, Sleep,
  Relocate, Pass Wall, the protection and power weapon levels, the five resistances, the two
  permanent enchantments, the rings, Body Armor, Write Scroll and Enchant Wand, the temporary
  enchantments, and the carried weight.

* `kills.ts` — `kill_monster` (exe 3000:b12d): the experience, the garbage-can rewrite of the
  slot, the drainer's potion or key, the seven drop rolls, the find gate and the twenty section
  rewards, and the death path behind it.
* `drops.ts` — the eight drop routines, `find_item`, `post_kill_heal`, `post_kill_sp`,
  `lose_item` and `use_magic_item`.
* `levels.ts` — `go_up_level`, `check_gain_level`, `gain_level` and the level-up screen.
* `town.ts` — the store, the temple, the bank, the inn and the night's clearing, the boss office
  message and the arrival hints.
* `moment.ts` — `pass_moment`: the spell timers, the disease and the poison, and every monster's
  step, with the two halves of a step it belongs between and `relocate`.
* `record.ts` — `load_player` and `save_player`: the character file the game reads and writes,
  which is what lets a character played here go back to DOS.
* `screens.ts` — the menu column: how `mset_gmenu` draws its eight lines and what its reader and
  `get_choice` take, the two rectangles a menu wipes first, the spells-in-effect screens, the V
  screen and the experience-needed screen.
* `inventory.ts` — the screens a spell or an item is picked off: `cast_a_spell`'s type menu, its
  thirty-spell table in both layouts and what casting one costs, the spell descriptions out of
  USPELLS.HLP, the pockets screen, and the three menus Write Scroll and Enchant Wand walk through.
* `hints.ts` — the lines of `UH.BIN` and `UH2.BIN`: what the little snake says, and the tablets
  the town and the arrival screens print.
* `pictures.ts` — which of the four wall files each of the twenty sections is drawn from.
* `spell-index.ts` — which function of `magic.ts` each of the game's 120 spells runs, so that a
  spell's own code can be shown without running anything.

`movecontrol` itself, the loop all of this is played in, is in `src/lib/play/`, which has a
README of its own about the keys, the screens and where the rest of the game plugs in.

## What is ported elsewhere

* The 3-D view (`draw_3d_view`, exe 3000:0f75) and the drawing around it, in
  `src/lib/play/view3d/`, which is where the screen a game is played on is drawn.
* The dungeon generator, verbatim from the reference bundle, in `src/lib/game/unfmap.js`.
