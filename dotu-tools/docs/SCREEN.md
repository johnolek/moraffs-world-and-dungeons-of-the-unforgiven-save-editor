# The game screen

John's screenshot of Dungeons of the Unforgiven (2026-09-07), a new level-0 character in
the first corridor of Module I, taken in the 640x480 mode.

The game is played here in video mode 9, the 1024 by 768 in 256 colours, and every position
below is that screen's pixels. Nothing about the layout changes with the mode: the game
places it all in a 1600 by 1200 grid whatever the screen is, and `FUN_2000_ac9e` (exe
2000:ac9e) hands out the same rectangles either way. The numbers below are that table scaled
by the screen's last column over 1599 and its last row over 1199, which is what every callee
does.

## The regions

| region | x | y | source | look |
|---|---|---|---|---|
| key menu | 2..188 | 3..337 | `KEY_MENU_BOX` | maroon box, 13 lines |
| `S) SECTION INFO` | 2..188 | 313 | DS:6779 | white on maroon |
| LEFT ARROW view | 0..191 | 339..486 | `LEFT_VIEW` | small 3-D view, label at its bottom |
| UP ARROW view | 190..832 | 3..486 | `AHEAD_VIEW` | the big 3-D view, label centred at its top |
| zoom map | 834..1023 | 0..335 | `ZOOM_MAP_BOX` | maroon box, the discovered map drawn small |
| RIGHT ARROW view | 832..1023 | 339..486 | `RIGHT_VIEW` | small 3-D view, label at its bottom |
| CURRENT BATTLE SPELLS IN EFFECT | 3..437 | 490..662 | `BATTLE_SPELLS_BOX` | maroon box, green header |
| DOWN ARROW view | 441..585 | 492..660 | `BEHIND_VIEW` | small 3-D view, label at its bottom |
| the bar over the message box | 588..1023 | 490..517 | `MESSAGE_BAR_BOX` | green |
| message box | 588..1023 | 514..767 | `MESSAGE_BOX` | dark grey |
| status block | 2..585 | 664..765 | `STATUS_BOX` | green box |

The sources are the rectangles in `src/lib/play/display.ts` and
`src/lib/play/view3d/geometry.ts`, which are the game's own in its 1600 by 1200 grid.

The three small views are the same drawing as the big one at a quarter of the size. The
labels (`UP ARROW`, `LEFT ARROW`, `RIGHT ARROW`, `DOWN ARROW`) are yellow, in the big font,
drawn over the view.

## The key menu

Green text with the key letter in yellow, two entries per line where two fit (the
screenshot reads `1>`; the string at DS:65dd is `1)`, and `OPTIONS MENU` alone is drawn in
colour 3, pale blue):

```
1) PREP SPELLS
VIEW MONEY
VIEW STATS
CAST SPELL
EXPAND MAP
EXP NEEDED
OPTIONS MENU
DIG TUNNEL
FIGHT  LOSE ITEM
ARMOR  WEAPONS
ZOOM   POCKETS
HELP   GRAPHICS
QUIT   USE ITEM
```

(`V`, `C`, `X`, `E`, `O`, `T`, `F`, `L`, `A`, `W`, `Z`, `P`, `H`, `G`, `Q`, `I` are the
yellow letters; `1>` is yellow.)

## The 3-D view

A corridor seen from a square with walls on both sides. The vanishing point sits
`(32 - height) / 32` of the way down the view (34% for a Humanoid of height 21), which is
why the floor takes roughly the bottom 40% of the view and the ceiling less; both are drawn with the perspective tiles: a brown-red ground with darker red
seams between tiles and dark blue-grey puddles inside them (the floor and ceiling tile
images of the wall file). The walls are the section's material, a mottled green with
darker green veins, and every wall panel has a bright green edge line along its top,
bottom and vertical seams; the seams between squares along the corridor are drawn as
lighter green lines. An opening in the right wall further down shows as a break in the
wall with the floor tiles continuing into it. A ladder up hangs from the ceiling in the
foreground, drawn in orange and yellow, with a black ellipse behind it where it meets the
ceiling. Far down the corridor a monster stands, drawn small.

In the RIGHT ARROW view a monster stands close, drawn at about half the view's height, with
a ladder down (orange, on the floor) in front of it. That one is on the square next door,
which the game draws by its own rule; the next section is that rule.

## The monster on the square in front of you

The monster one square away — the one an engagement is fought with — is not drawn through
the perspective at all. `draw_3d_view` (exe 3000:0f75) walks the squares straight ahead
back toward the character, and on the last step of that walk it draws the monster into a
fixed rectangle of the view instead.

The walk's own square drawing is `draw_map_square` (exe 3000:2848), and that function
refuses to draw a monster for exactly this square: at exe 3000:2f5e it compares its first
two arguments against DS:25bb (-0.5, a double) and DS:25d7 (1.5) and jumps past the whole
monster block to 3000:3148, where the ladder and the trapdoor are drawn. Those two numbers
are the near corner of the square one step ahead, which is what `draw_3d_view` passes at
3000:225b. So the monsters further off go through the projection and the near one does not.
Only ever one of the two is drawn.

The rectangle is read out of the instruction stream at exe 3000:2342 and 3000:23ca, the
floating-point arguments having been lost in `unf.c` (METHOD.md section 8). With `left`,
`top`, `right` and `bottom` the view's own rectangle in the 1600 by 1200 grid and `e` the
slot narrowing every square of the walk uses one step out, `width * 1 / (2 * 1 + 1)`:

| edge | value |
|---|---|
| left | `ftol(left + e / 2)` |
| top | `(bottom + 3 * top) / 4` |
| right | `ftol(right - e / 2)` |
| bottom | `(15 * bottom + top) / 16` |

**The character's height does not come into it.** DS:b8bd, which every other part of the
view weighs its horizon by, is not read here: the two horizontal edges are fixed fractions
of the view, a quarter of the way down it and fifteen sixteenths of the way down. A tall
character and a short one see the monster in the same place.

The whole picture is drawn, columns 0 to 255 of it. Which way round it faces is a coin flip
drawn fresh for every view — `rand() * 2 / 0x8000` at exe 3000:2323 — and when that comes
out zero the left and right edges are handed to `scale_image2` (exe 4000:4818) the other
way round, which is how that routine mirrors. The colours are the monster's own, the same
DS:4fbd tint and DS:4fc1 colour-set base `draw_map_square` uses, and in the three water
sections a built-in monster is again drawn short: 140 of its rows stretched over the whole
rectangle.

Where that lands on the 1024 by 768 screen, for the two views the screenshot shows:

| view | rectangle | of the view |
|---|---|---|
| UP ARROW | 297..725 across, 123..455 down | 67% of its width, 25%..94% of its height |
| RIGHT ARROW | 863..991 across, 375..476 down | the same fractions |

All four views do it, each in its own rectangle: the code is inside `draw_3d_view`, which
`FUN_2000_ac9e` (exe 2000:ac9e) calls once per view. The four rectangles are kept as well,
in the arrays at DS:2318, DS:c67a, DS:c682 and DS:c68a indexed by the view (exe 3000:244f),
so that `movecontrol` (exe 2000:c308) can paint a picture over the same place again when
the monster dies. The kept copy holds its left and right the mirrored way round, so that
second drawing is always mirrored.

The monster goes on last. `draw_map_square` has already put down the wall behind it and the
ladder on its square by the time this runs, and the picture paints over both wherever it is
not transparent.

### Two rectangles, one of them unreachable

Before the coin flip, at exe 3000:2312, the code compares the screen's own last column (the
long at DS:c6aa) against 1000, and a second copy of the whole draw follows at 3000:25ff
with `e / 3` for the inset and `(bottom + 7 * top) / 8` for the top edge — a smaller, lower
rectangle for a narrow screen. It can never run: all three branches of that comparison land
on the same instruction (`jg` and `jne` both jump to 3000:2323, and the `ja` is a jump to
the next instruction), so the wide-screen rectangle is taken whatever the screen is. Ghidra
drops the second copy as unreachable, which is why `unf.c` shows only one pair of
`scale_image2` calls here. The port has the reachable one only.

Moraff's World draws its own engaged monster with the numbers of the copy Unforgiven cannot
reach — `slotNarrowing(width, 1) / 3` and `(bottom + 7 * top) / 8` — in `FUN_3000_1a08`
(WORLD.EXE 3000:1a08) and so in `src/lib/play/mw/view3d/render.ts`. The two games share the
routine; only Unforgiven grew the second rectangle over it.

### The skull, when it dies

`movecontrol` is what draws over the rectangle it kept. At exe 2000:dafb, once the key has been
dealt with and before `kill_monster` says a word, a monster whose hit points have run out gets
`overlay.pic`'s **second** image painted into the rectangle of the view DS:049d names — a skull
and crossbones. It is drawn at colour-set base 0x20 (set at 2000:daf1), and since every pixel of
it is under 28 the tint left over from the last monster drawn never comes into it.

The kept rectangle holds its left and right edges the other way round, so the skull is always the
mirror of the picture under it.

Nothing takes it off: it stands through every box the kill prints, each of which waits for a key,
until the loop comes round and draws the four views again. That is the whole of it — one picture
into one rectangle, over the monster still on the screen.

The port draws it in `src/lib/play/view3d/render.ts`, and redraws the dead monster underneath it
because it paints a fresh screen every pass where the original leaves the last one standing.

### The water, in the three water sections

`draw_3d_view` follows the monster with it at exe 3000:24c8 and `draw_map_square` at exe
3000:307c, and the two sites are the same code with the same test, so the water is drawn at
every distance the monster is.

The test is that the monster was just drawn short — DS:4fc5 holding 140 rather than 200,
which `load_section_pictures` (exe 2000:372c) arranges by setting DS:031d for sections 4, 8
and 20 and which only applies to the 22 built-in monsters — and that `overlay.pic` was read
at all, which is DS:031b.

`overlay.pic`'s **first** image then goes into the monster's own rectangle, out of the same
window of source columns, with DS:4fc5 put back to the whole 200 rows. The colour-set base
becomes 0x3a in a 256-colour mode (0x10 colours take -0x18 instead), and the tint is left
holding the monster's own colour byte: nothing between the two calls writes DS:4fbd.

Which way round it faces is decided again, and separately, at each site. `draw_3d_view`
rolls a second coin flip of its own at exe 3000:24fe, so the water can lie the other way
round from the thing standing in it; `draw_map_square` reads the square's own x again (exe
3000:30b2), so there the two always agree.

The port draws both in `src/lib/play/view3d/render.ts`.

## The message box

Text the screenshot reads as light blue, the big font, four lines from the bottom (the
code draws the box's text in colour 6, the red of the stats block, in both its branches;
which is right is unsettled, see MORF-174): `HOW TO PLAY: USE ARROW
KEYS / TO EXPLORE THE DUNGEON. USE / LADDERS TO DESCEND TO DEEPER, / MORE DANGEROUS
PLACES.` The green bar across the top of the box is about 12 pixels tall.

## The status block

Green background. Line 1, cyan: `ARMOR:SKIN` at the left, `WEAPON:FIST` at the middle.
Line 2, yellow: `LEVEL: 0` and `EXP: 0`. Line 3, green: `SPELL POINTS:6 OF 6`. Line 4,
green: `HEALTH POINTS:32 OF 32`. To the right of lines 2..4, in red, two columns:
`STR:11 INT:14`, `WIZ:17 CON:14`, `DEX:17 LUCK17`.

## The zoom map

On the maroon box, the discovered squares drawn as small white and black cells (black for
a square, white for its walls), with a white arrow on the character's square pointing the
way it faces. The map shows only the handful of squares walked so far.

The arrow flashes. `movecontrol` redraws it every time round the loop it waits for a key in
(exe 2000:c748) and turns its colour over whenever `biostime() / 6` comes back a different
number, which is once every six BIOS ticks — a third of a second. The two colours are 15 and
0 — 14 and 0 in video mode 1 (exe 2000:c792) — so the dark half is `FUN_2000_9d17` plotting
the same seven by seven bitmap in black and the arrow disappears into the cell rather than
changing colour. A screen narrower than four colours (DS:c6e9 at or below 2) gets
`biostime() / 4` for the colour instead, cycling rather than flashing. Nothing else in the
game draws the arrow: the poll a message box waits behind (`FUN_2000_2a2e`, exe 2000:2a2e)
leaves it standing in whatever colour it was last given, and the key that ends a pass has it
drawn in colour 0 first (exe 2000:cc1d).

`drawsquare` (exe 3000:87de) draws one cell, in this order: the fill, the four sides
through `draw_side` (exe 3000:8432), a red dot on each of the four corners, and then the
mark for whatever the square holds.

* **The fill** is black, unless the square is one of the town's four buildings, which fills
  it with the building's own number plus two — 3 for the store, 4 for the temple, 5 for the
  bank, and 8 for the inn, whose 6 the game moves on rather than draw the cell in the
  colour of the corner dots. That colour is the whole of what the map says about a
  building: no mark is drawn over it.
* **A side** is a white line along that edge of the cell, stopping a pixel short of both
  corners, for anything `retdwall` does not call open — so a secret door and a module
  teleporter are walls to look at. A door adds the gap in the wall a doorway is drawn as:
  two white lines across the side, a pixel either side of its middle and a third of a cell
  long each. There is a shorter three-pixel tick as well, which the two halves of the
  routine disagree over — the side running along the top of a cell draws it only where the
  cell is under eight pixels, and the side running down the left draws it always, under the
  pair. A door on a side whose right-hand end would fall past the screen's last column
  loses its ticks altogether, which is the map's own right edge.
* **The marks** are asked about in order, each only on a square the last one left alone. A
  ladder down draws the diagonal from the cell's top left corner and a ladder up the one
  from its bottom left, in yellow. A trap door draws both, which makes a cross. A chute
  draws both as well, with a plus sign through them, and swaps the yellow for pale blue —
  and it is asked about only where `FUN_2000_7277` says the square was already known when
  the character arrived on the floor, so a chute under their feet stays off the map until
  they have left the floor and come back. Every diagonal is drawn twice, a pixel apart, on
  a screen wider than 1000 pixels.

The X key draws the same squares over the whole screen. `movecontrol`'s 0x78 branch (exe
2000:d2fe) has two halves and the test between them (exe 2000:d330) is the screen's own width: a
screen narrower than 321 pixels is shown the top, middle and bottom thirds of the floor one after
another, centred on rows 18, 55 and 92, and every wider screen — the 1024 by 768 among them — gets
the whole floor at once, centred on column 40 and row 55. The two have different headlines to
match, `EXPANDED DUNGEON MAP, HIT ANY KEY...` (DS:1e27) against `DUNGEON MAP, TOP THIRD, HIT ANY
KEY...` (DS:1e4c), and only the wide one is ever drawn here. `FUN_3000_8e75` (exe 3000:8e75) fills
the screen with colour 10 before it starts, the same maroon the side map's own box is drawn in,
and `FUN_2000_a068` (exe 2000:a068) fills the character's own square over the top, in a new colour
every pass of the loop the game waits for a key in.

Beside it stands `FUN_2000_bf91` (exe 2000:bf91), the way to the section's Shadow boss: `GO WEST`,
`GO EAST`, `GO NORTH` or `GO SOUTH` (DS:1cba, 1cc2, 1cca, 1cd3) at 1200, 1090 in colour 4. It reads
monster slot 0, where `stock_level` puts the boss, and prints nothing at all unless that slot still
holds a type 22 monster — so a floor with no boss and a floor whose boss has been killed both get
no signpost. The axis with further to go names the direction, and a tie goes to north or south.

`FUN_2000_59c0` (exe 2000:59c0) sizes it from a table the video mode indexes rather than by
scaling. The side map the play screen shows gets eight-pixel cells in fifteen columns by
twenty-six rows on a 640 by 480 screen and ten-pixel cells in nineteen by thirty-three at
1024 by 768; the full-screen map the X key draws gets four-pixel cells and seven, both in
eighty columns by a hundred and ten rows. Only its left edge scales — `0x519 * maxX / 0x63f`,
which is 521 on a 640-pixel screen and 834 on a 1024-pixel one — and its top is always 0.

## What else the video mode changes

The game takes its mode from its fourth command-line argument (exe 2000:62ce), not from the G
key, which only cycles the view size and the wall detail. Mode 9 is the 1024 by 768 in 256
colours; the jump table at `FUN_2000_1598` (exe 2000:1598) is the whole list, and it is the
same twelve modes in the same order as Moraff's World's.

Two things change with it beyond the scaling.

The letters. Above 730 pixels across (exe 4000:0bda in `pfont`, 4000:0ddc in `psfont`) both
routines hand the line to `FUN_4000_069a` (exe 4000:069a), which draws the vector font of
`src/lib/play/view3d/stroke-font.ts`, rather than a .FNT glyph. Each character is spread
rather than stepped: `pfont` works the right edge out as `x + 1600 / 80 * length` for font 0
(the divisors at DS:4dda are 80, 50 and 28, narrower than Moraff's World's 68, 42 and 24), a
line is `1100 / 36` units tall, and the pen is 3 units — two pixels each way at this size. The
site draws the real face, on the Play tab and in the render script alike.

One group of lines is the exception, and it is the reason the key menu looks unlike everything
else on the screen. `psfont` takes the vector path only while DS:4dec is set, and the key menu
(`FUN_4000_667b`, exe 4000:667b) clears that word around its thirteen body lines and sets it
again before it draws the key letters. So the menu's own words fall through to `FUN_4000_09a5`
(exe 4000:09a5), the .FNT blitter, which plots one screen pixel per set bit with no scaling at
all. Mode 9 asks `load_font` for `320x200.fnt` (exe 2000:1c6e) and reads it with the first row
of boxes at DS:4d22 and DS:4d5e, and the menu asks for the third of those boxes, so the face is
ten pixels wide and fourteen rows tall — small, thin, and perfectly readable next to the bold
strokes of the key letters and the status block. It is also why the menu's first line reads
`1>` when the string at DS:65dd is ` ) PREP SPELLS`: in that face a parenthesis is two straight
diagonals meeting at a point. `src/lib/play/view3d/menu-font.ts` is the port of it.

The ground of the 3-D view, when the wall pictures are not laid on it. Mode 9 has its own path
there (exe 3000:13ab, 154d, 1592, 15ee and 19f5, 1b97, 1bdc, 1c38, one run for each half) which
replaces the two-colour stone alternation with a walk over a palette ramp, the same idea as
Moraff's World's mode-9 ground. With the pictures present the halves are laid with the wall
file's own tiles through `scale_image2`, and nothing about that depends on the mode.

`draw_3d_view` draws the two halves one after the other, the half above the horizon first, and
asks about each separately. The first question carries DS:031d, the flag `load_section_pictures`
(exe 2000:372c) raises for sections 4, 8 and 20, where the second does not: so in the three water
sections the ceiling takes the ramp and the floor still takes the tiles. That is why the water is
underfoot and not overhead, and the port follows it — filling its ceiling flat, since the ramp is
not ported (`FAITHFUL-GAPS.md`).
