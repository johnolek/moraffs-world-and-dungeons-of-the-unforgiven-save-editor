# Playing Moraff's World

`movecontrol` (WORLD.EXE 2000:aad5), the loop Moraff's World is played in, and everything that
hangs off it. The rules of `src/lib/game/mw-port/README.md` hold here too: every function is a
cited port of the function it came from, bugs and all, and where this port declines to do
something the original does, a comment says so.

`../README.md` is the same thing for Dungeons of the Unforgiven. The two games are two
executables with two loops and two save layouts, so they are two engines; what they share is the
tab (`../PlayTab.svelte`), the map canvas, the screen renderer and the roster.

## The shape

* **`engine.ts`** — `MwGameSession`, `startMwGame`, `runMwMoveControl` and the key table. The
  session holds the `MwGame`, the floor the character is standing on, the monsters it is stocked
  with, and the keyboard the loop waits on.
* **`../session.ts`** — `KeyedSession`, the key queue, the record and the run log all three
  games share. `MwGameSession` extends it and keeps what is this game's own: the pending boxes,
  the banner a fight is drawn in and the two menu key readers. Its `placeEdited` is the hook that
  works the carried weight out again and puts the character back on the occupancy grid.
* **`keys.ts`** — the byte `movecontrol` dispatches on for every key, and the browser key events
  they come from. Moraff's World's arrows are compass directions rather than turns: the up arrow
  faces the character north and asks for a step north, whatever they were facing before.
* **One file per thing a key does** — `move.ts`, `ladders.ts`, `trapdoor.ts`, `chute.ts`,
  `dig.ts`, `fight.ts`, `kill.ts`, `cast.ts`, `town.ts`, `letters.ts`, `drop.ts`, `pills.ts`,
  `items.ts`, `display.ts`, `quit.ts`, `death.ts` — so that two people can add two keys without
  touching the same file.
* **`moment.ts`** — the two halves of a moment, which every step and the wait key go between.
* **`floor.ts`** — `enter_level` and `generate_section`'s three monster tables: arriving on a
  floor and the memory that decides whether its monsters are rolled again. The map the character
  has discovered is `../memory.ts`, since that part of `enter_level` is the same engine as
  Dungeons of the Unforgiven's; **`memory.ts`** is the little this game does differently with it,
  which is that a death and the gate throw the maps away.
* **`record.ts`** — `load_player` and `save_player` over the whole 2,344-byte record.
* **`screens.ts`** — where the message box goes.
* **`replay.ts`** — how a ported function that stops for a menu is run at all.
* **`menus.ts`** — the menus `movecontrol` and the spells build themselves.
* **`advice.ts`** — the little mouse: eight pieces of advice and fourteen lessons.
* **`map.ts`** — the little map at the far left of the middle band, and the X key's map over the
  whole screen. `draw_map_square` (exe 3000:a97d) is the same routine Dungeons of the Unforgiven
  draws its own corner map with, so the drawing is `../zoom-map.ts` and this file is the row of
  the table this game fills in: where the map sits, its eighteen by thirty-eight of ten-pixel
  cells, the maroon box, a building's colour, and the cursor that stands where the other game
  points an arrow. The expanded map is the same drawing at seven pixels a square over the floor's
  own eighty by a hundred and ten, which both games' X keys share.
* **`panel.ts`, `MwPanel.svelte`** — the numbers the game keeps and never prints, in the column
  beside the map, which `../mode.ts` shows in debug alone. **`MwPortrait.svelte`** — the picture
  of the monster in front of the character, in `../PortraitFrame.svelte`'s box.
* **`view3d/`** — the 3-D views and the screen they sit on; see below. **`MwScreen.svelte`**
  paints them and lays the game's own lines of text over them.
* **`MwPlay.svelte`** — what this game puts in the Play tab: the game's screen or the top-down
  map, whichever the switch is set to, the four corners of that screen laid over the map, the
  heads-up display of `../MapHud.svelte` over it — the monster's close-up, with the bar of its
  hit points beside it, the level, hit points and experience the game's screen prints beside
  it and, in debug mode, `debug-screen.ts`'s lines under those, and the health and
  spell orbs and the experience bar on their bar of stone along the foot of the map, in place of
  the game's own status blocks — and the panel. A page the game takes the whole display over with
  — the help, the statistics, a letter — is drawn by `MwScreen.svelte` in either display: on the
  stage in the screen display, and over the map in the map one, letterboxed at 4:3 until the game
  takes it down. The tab around them is `../PlayTab.svelte`, which all three games share, and this game's
  row of its `PLAY_GAMES` table is in `../games.ts`. `src/App.svelte` picks this wrapper or
  Dungeons of the Unforgiven's by the game showing.

## The 3-D views

`view3d/` draws what `FUN_3000_1a08` (WORLD.EXE 3000:1a08) draws: the four compass views, the
walls, the ground, the monsters and the ladder marks. It paints palette indices into a plain
buffer and touches no DOM, so the same code runs under vitest and in
`../../../mw-tools/reference/render_screen.mjs`, which writes a whole screen to a PNG.

Most of it is not written here. Moraff's World and Dungeons of the Unforgiven share one view
engine — the later game's routines are the earlier one's, three years on — so `../view3d/` is
imported wholesale for the parts that agree:

* `frame.ts`, `texture.ts` and `scale.ts` — the buffer, the wall texture mapper and the picture
  blitter. `draw_wall_picture` (exe 3000:04d3) and `draw_picture` (exe 3000:0105) are the same
  routines as the later game's, down to the 390-to-399 clamp and the run-endpoint mapping.
* `flood.ts` — the recursive frustum split the view walks the floor with. `FUN_3000_0b3b` and
  `FUN_3000_12ca` agree with the later game's pair down to the 650-call budget and the detail
  that the left half works its texture percentages out in floating point where the right half
  uses integers.
* `geometry.ts` — the 35-square reach, the slot narrowing, the snap to a half-integer.

What is this game's own is written beside it:

* **`screen.ts`** — the four view rectangles and everything else the screen is laid out from.
* **`wall.ts`** — `FUN_3000_31f3`: WALL.PIC's two images rather than the later game's ten, and
  palette entries 16 to 31 rather than 80 to 95.
* **`geometry.ts`** — the two places the projection differs: which way the sideways rounding
  branches, and that there is no 0.15 step.
* **`render.ts`** — `FUN_3000_1a08` itself, and the chevron ground the later game replaced with
  perspective tiles.
* **`pictures.ts`, `browser.ts`** — which image is the door, the wall and the two ladder marks.

## Waiting for a key

The original blocks on `getch` in the middle of its loop. A browser cannot, so everything that
reads the keyboard is `async` and goes through the session:

```ts
const key = await session.key();               // getch (WORLD.EXE 1000:28b4)
const chosen = await session.menuKey(2, 3);    // FUN_2000_1fbd: a digit off lines 3 and 4
const slot = await session.lineMenuKey(1, 8);  // FUN_2000_1d0b: 1 to 8, or -1 for Escape
```

`MwGameSession.press(key)` is what settles them; the Play tab calls it from its keydown handler.
A key pressed while nothing is waiting is queued, four deep. Both the queue and the wait are
`KeyedSession`'s (`../session.ts`), which this game takes as it stands: nothing of Moraff's World
happens at the top of a pass but the read itself.

A ported function that is **not** async — a fight, a drop, a town menu — cannot wait, so
`game.pressAnyKey()` (`wait_key`, WORLD.EXE 4000:3452) only remembers that a key is owed.
`await session.settle()` in the loop is where it is taken, and where the boxes the function
printed are shown one after another.

## The run

Every game here is recorded the same way Dungeons of the Unforgiven's is, by the same `../run.ts`:
the record play began with, the seed, the engine's commit and every input in order, with the
action count and the milestones beside them. `../README.md` has the whole of it. Two things are
this game's own:

* Its four arrows each face the character and step them, so any of them is an action where the
  step went through; the turn where the character stands, which `mwTurn` does outside the loop
  because the game has no key for it, costs nothing and is an input of its own in the log rather
  than a key.
* Its milestones come from `monster_killed`'s eight quest-boss bits and from the inn's level-up.
* Its journal is `journal.ts` — every line a run of this game can say, one case of one switch,
  in the game's own names for its monsters, its spells, its items and its dungeons. The events
  behind those lines are the shared ones of `src/lib/game/journal-events.ts` wherever the thing
  is the same as the other two games', and `MwEvent` (`../../game/mw-port/state.ts`) carries the
  kinds only this game has beside them: the cup of health, the shimmering ball, a quest boss's
  plus on a piece of gear, the temple's raise-dead contract and the death it undoes, the bank's
  one exchange, the pockets, a characteristic a monster moved, a poisoning or a disease, and the
  hit points a battle spell took off. `../README.md` has the journal and the summary in full.

## Where the words go

Moraff's World writes in two places, and this port keeps them apart the way the screen does.

* **The message box** — eight lines at x 0, fifty apart from y 0x28, in colour 5 (FUN_2000_216b,
  WORLD.EXE 2000:216b). `game.say(...lines)` puts one there, and every box fills all eight, so a
  box replaces the one before it rather than adding to it.
* **The banner** — the top left of the screen, y 0 to 0x78 in colour 15, which is where
  `attack_timing`, the swing, the monster's turn and "THE WALL REFUSES TO MOVE" are drawn.
  `session.fighting(...)` sends what a fight says there instead of into the box, and leaving a
  square takes it down, which is the `fill_rect` FUN_2000_a57e starts with. The one thing a fight
  says that really is a box — the notice a level drain, a poisoning or a disease brings — is the
  last thing said before `wait_key`, so it comes out of the banner and into the box. The one line
  it prints in a colour of its own is a puffball's, which `monster_turn` names 6 for; that one is
  drawn on the strip the kill's own messages use rather than said into the banner, since the
  banner has one colour for every line in it.
  A delay taken while a fight is being drawn keeps the banner with the frame (`../timed.ts`) and
  starts a fresh one afterwards, because the original wipes that whole corner before it writes
  there again. That is what lets a turn two monsters both get be read one message at a time:
  `monster_turn` ends on a hold of its own, so the first stands alone before the second replaces
  it.
* **The box's own rows, drawn rather than said** — the little mouse (`advice.ts`). FUN_3000_9383
  and FUN_3000_8b27 wipe the whole box and print four lines on its fifth to eighth rows, each
  piece of advice in a colour of its own, so they go through `game.draw` at those rows: a said
  line is always the box's colour 5 and always starts at the top.
* **A screen** — `game.draw(line)` and `game.eraseScreen()`, which are `print_text` and
  `clear_screen`. Anything on `game.screen` is drawn over the map at the game's own coordinates.
  `session.showScreens(...)` is for a ported function that draws a page, waits for a key and then
  clears it: the wait is where the page is kept, so the player sees it before it goes.

## Where the words are drawn

The tab lays the game's own screen over the map, in the corners the game puts it in and at one
size: each corner is given the share of the map's width it has of the screen's 1600.

| corner | what is in it |
| --- | --- |
| top left | the strip a kill and a fight write on, and the message box under it (`mwCorner`) |
| top right | the picture of the monster faced, with the level, hit points and experience FUN_2000_892d prints over its view, and the line FUN_2000_a9bd puts under the map |
| bottom left | the character's own level, experience, spell points and health points (`mwStatusLines`) |
| bottom right | the six characteristics (`mwCharacteristicLines`) |

With the game's own screen up rather than the map, those three values go over every view a
monster is standing in rather than over the one being faced, which is what FUN_2000_8b3f does
after it has drawn the four views; `view3d/monster-bar.ts` is the bar FUN_2000_8728 puts the hit
points on.

A screen with every line inside that corner — the rectangle every box wipes before it prints,
x 0 to 0x2d0 and down to y 0x1ae — is drawn there rather than taking the whole display over
(`mwInMessageBox`), which is what puts a menu's heading above its own box, and what keeps the
mouse's advice, the chute's three lines and the list of spells in force in the corner the game
prints them in.

One thing is not where the original puts it. The strip is drawn over the top of the message box in
the game — the first line of each is at y 0x28 — which it gets away with because a menu is never
up while a monster is being swung at; `mwCorner` moves the box down by as much of the strip as is
in use instead. A line drawn further down that corner than the strip reaches is left on the row
the game drew it on, since it is already in the box's own grid.

A screen that does take the display over is drawn on the game's screen at the coordinates the
game drew it at, over everything else the screen has. Only the tab showing the top-down map has
it cover the map instead, since the views it draws across are not there to draw it on.

## A menu in the middle of a ported function

Four spells and four moments of a kill stop and read the keyboard. The port takes those choices
as a function it is handed or as a method of the `MwGame`, and a browser cannot answer one
without waiting. So `runAsking` in `replay.ts` runs the function twice over: once on a copy of
the game, which throws the moment it wants an answer nobody has given yet, and once for real when
every answer is in. The copy draws its random numbers through `MwRecordedRng`, which keeps them,
so the run for real makes the same decisions and prints the same boxes — the same trick
`src/lib/roller/mw-session.ts` plays on `roll_char`.

The boxes shown are the copy's, so the player reads them in the order the original prints them
and answers each menu where the original asks; the run for real is silent.

## The floor

`session.enterFloor(level)` is `enter_level` (WORLD.EXE 2000:55fc). Stocking is
`src/lib/game/mw-port/stocking.ts`, which is already a port of `generate_section`; the three
tables that function rotates between live in `MwFloorMonsters`, so going up a ladder and back
finds the monsters where they were left. Arriving on a floor neither of the other two tables
holds empties the oldest and rolls it afresh.

The original reads and writes those three tables in the character's `<slot>MON.MAP` file, so in
DOS they survive quitting. A browser has no such file, so they last as long as the session.

## What is not built yet

Nothing. Every key movecontrol dispatches on is answered, and so is the gate on top of the town,
which is the one place the game leaves the dungeon behind: it asks which dungeon to walk out
into rather than drawing the overworld.

X is a screen of its own: it clears the display, fills it with the whole floor at seven pixels a
square and prints the way to the floor's quest boss beside it, which is the branch a screen wider
than 320 pixels takes (`display.ts` and `map.ts`). O is the sound switch and really flips it. The
other keys that are about the screen rather than the game — B the brick speed, Z the 3-D view
close up, and the three that step one colour of the background on — are answered in `display.ts`
with a box each saying what the game would have done, the way `../misc.ts` answers the same keys
for Dungeons of the Unforgiven.

## Where this leaves the original

* **Random numbers from a seed of the run's own.** `SeededRng` in `src/lib/game/port/rng.ts`,
  which is mulberry32 under the game's own `Random(n)`, per the port's third departure. The seed
  is drawn once when the game starts and kept in the run log with every key that follows
  (`run.ts`), so a run can be played again exactly. A test hands the session its own seed.
* **No clock in the game.** The game is turn based: a moment passes per action and nothing
  happens while the player thinks. The `delay` calls the original busy-waits in are about the
  screen alone, so a kill's own messages are held for theirs by the Play tab's display timer
  (`../timed.ts`); the flashes while a hole is dug are kept as
  well, on the strip the original draws them on.
* **The four noises the game makes are made.** `src/lib/game/mw-port/sound.ts` is the game's four
  wrappers around the PC speaker of `src/lib/speaker.ts`, called where the original calls them:
  the sweep up when the blow lands, the sweep down when the monster's does, and the chime and the
  dirge that each go before the words they belong to. They are Dungeons of the Unforgiven's four
  cues note for note, so the sequences come from that port. All four ask DS:119f, which the O key
  flips and the key menu's sound line offers the opposite of. The speaker is opened on the first
  key pressed in the tab, since a browser will not start audio that nothing the player did asked
  for, and a replay never opens one.
* **The screen is the game's own.** `view3d/` and `MwScreen.svelte` draw what `movecontrol`
  draws — the four views, the message box, the key menu, the zoom map and the lines of text the
  game lays over them — and the top-down map of the floor is a switch away from it. On that map
  the picture of the monster being faced stands in for the view ahead, with the level, hit points
  and experience the game prints over that view over it; in speedrun and in debug the whole floor
  is drawn rather than the squares walked, and debug alone marks every monster on it
  (`../mode.ts`).
* **No `<slot>MON.MAP`.** The three floors of monsters live only as long as the tab is open.
* **The `.DUN` files are a row beside the character.** The explored maps are written where the
  original writes them — when the character crosses out of the 32 floors in memory, on the way out
  through the gate, and on Q — and kept in the `maps` store of the browser's database, keyed by
  the character's id, one bitmap per floor in the game's own row bytes.
* **The character file is the roster entry.** `save_player` writes the record back through the
  roster, which is the real 2,344-byte file, so a character can be downloaded and played on in
  DOS. Death writes nothing, which is what the original does short of deleting the file; the
  roster marks the entry instead and keeps the bytes. The explored maps beside it are deleted,
  which the original does too (`memory.ts`).
* **The town has no pictures to draw.** `draw_picture` (WORLD.EXE 3000:0105) is called from three
  places only — the view ahead, the square painter and the attract screen — so the store, the
  temple, the bank and the inn really are words alone in this game too. The one thing the town
  is drawn with is the mark `FUN_3000_2796` hangs over a building's square on floor 0, which is
  in `view3d/render.ts`.
* **There is no world map.** FUN_3000_8235 walks the character over an overworld, and all it
  does with where they stop is work a dungeon number out of the cell — one of 31,000, each of
  them the same eighteen wall patterns behind a different number. The port asks for that number
  in the box instead and then runs the rest of that function's return path, so the gate still
  counts the number up to one whose floor 0 has a gate square and stands the character on it.
* **The mouse is left out**, and with it the "(TYPE NUMBER ON KEYBOARD)" line the write-scroll
  menu adds when one is attached.
* **The hidden key is left out**: 0x7c hands out ten hit points.
