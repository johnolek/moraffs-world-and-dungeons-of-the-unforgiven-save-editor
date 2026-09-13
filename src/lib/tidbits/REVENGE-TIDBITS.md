<!--
  How to add a tidbit
  -------------------
  The same small Markdown as TIDBITS.md: `### Some title` under a `## Section`, blank lines
  between paragraphs, `- ` for a list item, `backticks` for code and **stars** for bold.
  Anything written between a `##` and the first `###` under it is dropped.

  Moraff's Revenge has no decompiled C and no Formulas tab, so the only in-app link this file
  uses is the port:

      [text](source:ts/revmap.js/wallSide)   a declaration of the dungeon generator

  Everything else is cited in prose, by the document in `rev-tools/docs/` that establishes it
  and the address in the executable it was read from. Ordinary Markdown links to the web work,
  `[text](https://example.com/)`, and a test checks that every link still points at something.
-->

## The game itself

### Every statement in the game is an interrupt
! EVERY SINGLE LINE OF THIS GAME IS AN INTERRUPT! ASTOUNDING!

Moraff's Revenge is compiled Microsoft QuickBASIC 3.0, and a compiled QuickBASIC 3.0 program is
very nearly nothing but calls into a run-time library shipped beside it as `BRUN30.EXE`. A
`PRINT`, an assignment, an addition, an `INT`: each one compiles to a couple of `mov`s and a
three-byte `INT 3Dh`, `INT 3Eh` or `INT 3Fh`, with the function byte sitting in the instruction
stream behind the interrupt for the handler to pick up. `DUNSMALL.EXE` holds 5,702 of those in
51 KB of code — one every nine bytes — calling 136 distinct run-time routines.

That is why this game has no decompiled C on the Source tab the way the other two do. Every
operand that matters is a bare number and every operation is a call into a different executable,
so the decompilation comes out structurally right and semantically empty. The disassembly, once
each of the 136 routines has its name, is a different story: it reads close to a transcript of
the BASIC Moraff wrote.

In the code: `rev-tools/docs/BRUN30.md`, which is the table of all 136, and the dispatch that
reads the function byte at BRUN30 `CS:00E9`.
[QuickBASIC](https://en.wikipedia.org/wiki/QuickBASIC).

### Half the files that look like programs are not
! HALF THE PROGRAMS IN THIS FOLDER ARE NOT PROGRAMS AT ALL!

Eighteen files in the game folder carry an `.EXE` or a `.COM` name and only seven of them hold
any code. Moraff gave his data files an executable's extension, presumably so that nobody would
delete or edit them.

- `1.EXE` to `5.EXE` are the five character records, in plain text.
- `F5.COM` holds the characters' names, `F1.COM` the spell table and `F2.COM` the magic items.
- `F6.COM` and `F7.COM` are twenty-two monster names each.
- `F9.EXE` is the hall of fame, which is a picture.

The text ones are BASIC `WRITE #` output, which is why the strings arrive in quotation marks and
the numbers arrive with no padding at all. Moraff's own programs are `DUNSMALL.EXE`,
`BEGIN.EXE`, `CHCHAR.EXE`, `NCD.EXE` and `F8.EXE`, with Microsoft's run-time beside them; none of
the five is compressed.

In the code: `rev-tools/docs/SURVEY.md` section 1.

### The game times your machine before it lets you in
! THE GAME TIMES YOUR MACHINE BEFORE IT LETS YOU IN!

Startup runs a calibration at `1000:BF60`: line up with a tick of the clock, count how many times
round an empty loop the machine gets in one second, and divide that count by 326. The 326 is
whatever the author's own machine gave.

Everything the monsters do is then scaled by that number, so a machine ten times faster polls ten
times as often and needs ten times as many polls to move a monster. The monsters keep the same
wall-clock pace on any hardware, which for a 1988 BASIC game is more care than the genre usually
took.

In the code: `rev-tools/docs/MONSTERS.md` part 1, on the calibration at `1000:BF60` and the odds
at `1000:7EEC`.

### The dungeon never waits for you, and neither does a fight
! THE DUNGEON NEVER WAITS! STAND STILL AND IT MOVES WITHOUT YOU!

The dungeon's main loop does not block on a key. It reads `INKEY$`, which comes back at once with
an empty string when nothing has been typed, rolls a chance to move one monster, and goes round
again. So a monster crosses the room while you sit reading the screen, and the game is running
whether you are playing it or not.

The fight prompt is a second loop of the same shape and it rolls the same chance before its own
`INKEY$`, so standing over a monster deciding whether to swing costs you turns as well.

What does stop the dungeon is the shared prompt wait at `1000:2F71`. It spins on `INKEY$` and
never gives a monster a turn, and twenty-two places in the program call it, so while a wand menu
or a "which item" list or a shop counter is up, nothing in the dungeon moves at all.

In the code: `rev-tools/docs/MONSTERS.md` part 1, on the loop at `1000:087F`, the fight prompt's
own poll at `1000:86E2` and the blocking wait at `1000:2F71`.

### All seventy levels are on the disk, and seventeen of them are yours
! SEVENTY LEVELS ON THE DISK! SEVENTEEN OF THEM ARE YOURS!

This is the beginner's build, and it stops the player at level 17. The data does not stop there.
`1.NUM` and `2.NUM` carry forty monster slots for each of levels 1 to 70, `7.NUM` is an array
twenty-one rows by seventy-two levels, and every character's explored map is dimensioned the same
way. `NCD.EXE`, the order form for the paid version, promises to "take you all the way to the
70'th level"; the levels were always there.

In the code: `rev-tools/docs/SURVEY.md` section 3, on the `BSAVE` shapes at `1000:B637`,
`1000:B670` and `1000:B583`.

## The character

### Nothing you would want to raise is in the file as itself
! NOTHING WORTH CHEATING AT IS WRITTEN DOWN AS ITSELF!

A character record is 340 numbers of plain text, which anybody could open in an editor, and
seven of its scalar fields have a fixed amount added on the way out and taken off again on the
way in. Experience carries 12,316, the player level 476, maximum health points 376, current
health points 176, weight 71, pocket money 223, and one field nobody has identified 4,434. Add
the six characteristics, which are shifted and scaled both, and there is nothing in the file a
player would recognise as their own number.

It is not encryption, and it was not meant to be; it is exactly enough to make a text editor
useless. The fields it does not bother with are the giveaway: money in the bank, spell points
and everything from value 21 onwards are stored plain, so the one number in the file you could
have raised by hand is the one in the bank.

In the code: `rev-tools/docs/SURVEY.md` section 3 — the load subtracts at `1000:B674`, the save
adds the same constants back at `1000:B308`, and `CHCHAR.EXE` writes the file that way in the
first place.

### A characteristic is stored three times as big
! YOUR STRENGTH IS FILED AT THREE TIMES ITS SIZE! GOOD LUCK!

The six characteristics go into the file as `3 × stat + 237`, so the 255 to 303 the shipped
records hold is a range of 6 to 22. That is five characters, not a scale. The roll hands out a
race's four to nine points and then scatters between 52 and 61 more over the six one at a time,
which puts the average characteristic around 13 and puts no ceiling anywhere above it.

Which makes the game's own advice a harder ask than it sounds. `CHCHAR.EXE` tells a first-time
player to hold out for "a high strength (22 or more)", and for a human that is about one roll in
230.

The statistics screen shows all six, six lines of `PRINT USING`, and the formats it prints them
with are sitting in `F1.COM` in among the spell descriptions: `Strength:    ### `,
`Intelligence:### `, and four more.

In the code: `rev-tools/docs/SURVEY.md` section 3, on the read-back at `1000:B6BF`, the write at
`1000:B342` and the six lines at `1000:1A9A`.

### Your character starts at level zero
! EVERY HERO BEGINS AT LEVEL ZERO! EVEN THE MIGHTY ONES!

The level cell is the level plus 476, and the level underneath it is an ordinary count that
starts at nothing. A new character is given 0, reincarnation puts it back to 0, and the only
thing that adds to it is the temple. Four of the five characters on the shipped disk hold 476,
which is to say they have never gained a level between them.

In the code: `rev-tools/docs/SURVEY.md` section 3 — 0 for a new character at `1000:3E39`, back
to 0 at `1000:A172`, plus one at the temple at `1000:2044`, and printed raw on the statistics
screen at `1000:1BAF`.

### Laziness is a characteristic that does nothing, and the game says so
! LAZINESS IS ONE OF YOUR SIX CHARACTERISTICS! IT DOES NOTHING!

The six characteristics are strength, intelligence, wisdom, health, agility and laziness, and
the instruction screen `CHCHAR.EXE` prints before the roll says of the last one that it wastes
points that could have gone to the others and "serves no purpose whatsoever". The smaller it is,
the better.

You cannot roll it away either. Every race starts it somewhere — 4 for a human, a dwarf and a
hobbit, 3 for an elf — and the points that come after are handed out one at a time to a
characteristic picked at random, laziness included. It is a stat whose only job is to be a place
the roller can throw your points.

In the code: the characteristics screen at `CHCHAR.EXE` offset `0739` and the roll at `0ADA`.

### Every race adds up to twenty-four
! EVERY RACE ADDS UP TO TWENTY-FOUR! CHOOSE WITH CARE!

The four races are a `DATA` statement of twenty-four numbers, six to a race: 4,4,4,4,4,4 for a
human, 4,1,1,7,7,4 for a dwarf, 2,6,5,3,5,3 for an elf and 2,2,2,5,9,4 for a hobbit. Each of
those adds to exactly 24, so picking a race moves points about and never adds any.

Then `INT(RND(1) * 10) + 52` points are handed out one at a time. Every character in the game,
whatever it is, comes to between 76 and 85 points across the six characteristics — and all five
of the shipped ones do.

In the code: the race table at `CHCHAR.EXE` offset `0578` and the scatter at `0B29`.

### Which dungeon you walk in is a field of your character
! THE DUNGEON YOU WALK IN IS WRITTEN IN YOUR OWN RECORD!

The wall rule divides by a number the game keeps in the character record, and every character on
the disk holds 1 there. The fountain of youth adds two to it.

That is the whole of what "regenerate your character, allowing him to become more powerful than
ever before" means in the help file. Change the divisor and every wall on all seventy levels
moves. A regenerated character goes to 3, then 5, then 7: a dungeon of its own each time.

The fountain knows what it has done. Before it adds the two it walks the character's explored map
and zeroes rows 1 to 20 of every level from 1 to 70, so months of filling in are thrown away with
the dungeon they described. Level 0 is the one it does not touch, which leaves you the twenty
rows of the town, drawn for a town whose walls have moved as well.

In the code: [wallSide](source:ts/revmap.js/wallSide), and `rev-tools/docs/DUNGEON.md`
section 5 on the map at `1000:3DCC` and the fountain at `1000:3ED0`.

### Your explored map is twenty bits to a row
! YOUR WHOLE EXPLORED MAP IS TWENTY BITS TO A ROW!

The `<n>.BIN` beside a character record is a `BSAVE` of the array that remembers where it has
walked: one number per row per level, with the twenty columns packed into it from the top bit
down, so column 1 is bit 19 and column 20 is bit 0. The game asks whether you have been
somewhere with `INT(M(row, level) / 2 ^ (20 - column)) MOD 2`.

The neatest confirmation of the whole format is a `DATA` statement in `CHCHAR.EXE`: twenty
numbers, seeded into every new character's map, which are byte for byte what elements 1 to 20 of
four of the five shipped files hold. It is the town, which everybody has already seen.

In the code: `rev-tools/docs/SURVEY.md` section 3, on the bit test at `1000:5449` and the
`BSAVE` shape at `1000:B583`.

## The dungeon

### There is no maze in the box
! THERE IS NO MAZE IN THE BOX! A HUNDRED THOUSAND WALLS OUT OF THIN AIR!

Seventy levels of twenty squares by nineteen, four sides to a square, is more than a hundred
thousand walls, and not one of them is stored anywhere. Every `BSAVE` image in the game folder is
accounted for — five explored maps, the ladders, the monsters and their pictures — and none of
them describes a wall. The dungeon is one line of arithmetic over the square's own coordinates,
worked out afresh every time the game needs it.

The five characters shipped on the disk are what proves it. A character reached every square it
has walked on by stepping onto it from a square beside it, so the squares it has walked cannot be
cut into pieces by walls; replaying the rule against those maps gives nine explored levels, every
one of them a single connected piece. Change one term — `level + 3` instead of `level + 2`, the
two kinds swapped, the `+ 10` dropped — and eight of the nine shatter.

In the code: [floor](source:ts/revmap.js/floor), and `rev-tools/docs/DUNGEON.md` sections 1
and 7.

### Eight and nine are a wall, six and seven a door
! EIGHT AND NINE ARE A WALL! SIX AND SEVEN ARE A DOOR!

Every side of every square is
`INT(ABS(SIN(kind * column * row * (level + 2) / generation + 10)) * 10)`, with `kind` 1 for the
wall across the top of a square and 2 for the wall down its left-hand side.
The number that comes out is 0 to 9, and three bands is all it means: 8 and 9 are a wall and the
move is refused, 6 and 7 are a door and you walk through it, and anything below that is an
opening.

The map draws all three from the same number, which is where the bands come from: a line when the
value is over 5, and then three pixels of that line painted back out in the background colour
when it is also 7 or less. The help file's map key agrees exactly — a straight line is a wall, a
line with a small break is a door, no line is an opening.

A wall belongs to one square, and the two squares it separates ask for it under the same name:
the wall across the top of a square is the one along the bottom of the square above it.

In the code: [wallSide](source:ts/revmap.js/wallSide) and [side](source:ts/revmap.js/side), from
the move test at `1000:548B` and the map at `1000:4B5F` (`rev-tools/docs/DUNGEON.md` sections 2
to 4).

### Nearly a third of all the sides are a nine
! NEARLY A THIRD OF EVERY WALL IN THE GAME IS A NINE!

Of the 51,191 interior sides in the whole dungeon, 42.2% are a wall and 18.2% a door. The ten
values are nowhere near evenly spread: 9 on its own accounts for 29% of all the sides in the game.

That is not a choice anybody made. `ABS(SIN(x))` spends most of its time near 1, so multiplying
by ten and flooring lands on 9 far more often than on anything else, and the dungeon is walled up
tighter than a uniform roll would have made it.

In the code: [wallSide](source:ts/revmap.js/wallSide) and `rev-tools/docs/DUNGEON.md` section 2.

### QuickBASIC's sine is wrong, and the whole dungeon rests on it
! THE WHOLE DUNGEON RESTS ON A SINE THAT IS WRONG!

BRUN30's single-precision `SIN` reduces its angle by multiplying by a single-precision `1/(2*pi)`
and keeping the fraction, which at the sort of angle this game asks for leaves about four correct
digits. At 27,370 — an ordinary square — it answers 0.430327 where the real sine is 0.430279.

Ordinarily that would not matter. Here the answer is multiplied by ten and floored to one of ten
bands, so a difference of five in the fifth decimal place is a different wall about once every
two thousand squares. Anything that computes this dungeon with a real sine gets thousands of
walls wrong, scattered, in the wrong places. There is no way round it: the only correct sine for
Moraff's Revenge is Microsoft's incorrect one, polynomial and all.

In the code: [mbfSin](source:ts/revmap.js/mbfSin), which is BRUN30 `CS:BF0C` step for step, and
`rev-tools/docs/DUNGEON.md` section 6.
[Microsoft Binary Format](https://en.wikipedia.org/wiki/Microsoft_Binary_Format).

### A door asks nothing of you
! THE HELP SAYS STRENGTH OPENS DOORS! THE DOORS DISAGREE!

`H5.OVL`, the game's own help, lists strength as useful for opening doors. It is not, and there is
nothing behind the sentence at all. The move test computes one number, compares it with 7, and
either moves you or does not: no strength check, no die roll, no table. A door and an opening are
walked through in exactly the same way, and the only difference between them is that the map
draws a line with a gap in it.

There are no secret doors either, and no teleporters. The vocabulary of sides the site's map
draws with has a code for each, carried over from the other two games, and nothing in this
dungeon ever produces one.

In the code: [blocked](source:ts/revmap.js/blocked) and `rev-tools/docs/DUNGEON.md` section 3,
on the four move directions at `1000:30D9`, `3192`, `3254` and `3316`.

### The floor is twenty squares by nineteen
! TWENTY SQUARES ACROSS AND NINETEEN DOWN! NOT TWENTY!

Columns run 1 to 20 and rows run 1 to 19 — not 20. The move code stops at 1 and at 19, and the
map's own loop is `FOR row = 1 TO 19`.

The arrays do not agree. Both of the map-shaped ones, the explored map and the feature index,
have room for a twentieth row on every level, and the game never touches it. Seventy-four of the
squares where the feature formula and its own shipped index disagree are in that row, which
nobody has ever stood in.

In the code: [COLUMNS](source:ts/revmap.js/COLUMNS) and [ROWS](source:ts/revmap.js/ROWS), and
`rev-tools/docs/DUNGEON.md` section 1.

### What is on a square is a second formula, and its own index does not quite agree
! THE WALLS HAVE ONE FORMULA AND THE LADDERS HAVE ANOTHER!

Walls are one rule; ladders and chutes are another, and the two know nothing about each other.
The square's own coordinates go into
`INT(((column + 7) ^ 1.3 * (row + 6) ^ 1.2 * (level + step + 1) ^ 1.1) MOD 300) - 3`, and the
code that comes out says what is there: 0 a chute, 1 to 9 a ladder up out of this square, and 10
or more sends the game asking the three levels below for a ladder down to one of them. The 50 is
not a code the formula can produce. It is what the game writes when there is nothing here, either
because `7.NUM` has no bit for the square or because the search below came back empty-handed.

`7.NUM` looks like the dungeon's feature file and is not. Every bit in it says only that a square
holds something; which something still comes from the formula. And the file and the formula do
not entirely agree — recomputing every one of the 28,000 squares puts a feature on 1,597 of the
1,632 the file marks, and on 100 squares it does not mark, for 135 disagreements in all. The
cause is single precision: the product reaches 400,000, and a 24-bit fraction has less than a
unit of room left by the time the remainder is taken. Whichever pass built the file was not
computing quite what the game computes when it reads it.

In the code: [featureCode](source:ts/revmap.js/featureCode) and
[feature](source:ts/revmap.js/feature), from `1000:5793` and `1000:552B`
(`rev-tools/docs/SURVEY.md` section 3).

### A ladder can be three levels long
! A LADDER CAN CARRY YOU THREE WHOLE LEVELS AT ONCE!

The feature code is not the number of levels a ladder spans; it is folded down to one. Take three
off it twice, while it is still over three, and what is left is 1, 2 or 3 — how far the ladder
goes. A ladder up is the square's own code. A ladder down is trickier: the game asks each of the
three levels below in turn and takes the first whose folded code comes out equal to the distance,
which is why the loop stops at three, and why a ladder down and the ladder up that answers it are
the same square on two different levels — everywhere below the town, at any rate.

In the code: [fold](source:ts/revmap.js/fold) and [feature](source:ts/revmap.js/feature), from
the folding at `1000:5649` and the search at `1000:552B`.

### A chute drops one, two or three levels, and the false floor under it drops one more
! A CHUTE DROPS YOU THREE LEVELS AND THE FLOOR BELOW DROPS YOU AGAIN!

Falling down a chute prints its line and leaves your column and row alone — you land on the same
square, further down — and the game remembers the three coordinates it left you on. How much
further is worked out from the square you fell through, in three tests that each add a level and
gate the next: one level always, a second when your column plus your row is even, and a third when
the level you have then reached plus your column is even and that level is over 25. So an odd
column plus row always falls exactly one. There is a fourth test as well, and it can never pass:
it asks for a level that is its own half.

That memory is the whole of the false floor. Every step asks what is on the square just stepped
onto, and where the answer is nothing at all **and** the square is the one a chute dropped you on,
the game sets the square's code to 1, prints "False floor." and offers you the go-down prompt. So
a false floor is not a feature of the dungeon: it is the square under a chute.

The code it writes is what `D` adds to your level, so that second fall is exactly one level
however far the chute itself went. And the level it remembers is matched twice, against the level
you are on and against the level above it, so the same column and row let you fall through twice
in a row: the chute, a false floor, another false floor, and then the arithmetic stops matching
and you are standing on ordinary ground.

In the code: [chuteLanding](source:ts/revmap.js/chuteLanding) and
[falseFloor](source:ts/revmap.js/falseFloor), from the chute at `1000:3428`, the levels it adds at
`1000:3491` to `1000:355A`, the square it remembers at `1000:356F` and the test at `1000:064D`
(`rev-tools/docs/DUNGEON.md` section 8).

## Monsters

### A monster is stopped by the same walls you are
! THE MONSTERS ARE STOPPED BY THE VERY SAME WALLS YOU ARE!

A monster's turn is one square, orthogonally, and two things can refuse it. One is another
monster already standing there: the grid the game keeps them in holds slot numbers, and a square
with a number in it is taken. The other is the wall, tested with the dungeon's own rule: the same
sine of the same coordinates, divided by your character's own generation, floored to a band and
compared with 7. So 8 and 9 turn a monster back and 6 and 7 let it through a door, exactly as they
do you.

What is conditional is the drawing. The redraw compares the distance against a sight table and
skips a monster you cannot see, so one walks the length of a corridor out of sight and turns up
beside you.

In the code: `rev-tools/docs/MONSTERS.md` part 1, on the direction at `1000:7390`, the wall test
at `1000:758D` and the commit at `1000:7667`.

### A slot number is the whole monster
! A SLOT NUMBER IS THE WHOLE MONSTER! NAME, LEVEL AND ALL!

Forty slots belong to each level, and everything about the monster in one is worked out from the
slot's own number. Its name is the slot modulo twenty, plus one. Its level is the level it is
standing on, plus one for each of 2, 4, 8 and 16 that divides the slot number, so a level's forty
monsters run from its own depth to four or five levels deeper. Its kind — which weapon hurts it,
how hard it is to hit — is sorted out of its name by bands. Only two things about it are in a
file: which square it is on, and how many hit points it has left.

The level it works out is `INT((slot + 40) / 40)`, which is right for thirty-nine slots out of
forty and one too high for the fortieth.

In the code: `rev-tools/docs/MONSTERS.md` part 2, on the name at `1000:80B0`, the level at
`1000:80DE` and the kind at `1000:82E5`.

### The last two names have to be earned
! TWO MONSTER NAMES MUST BE EARNED! THE SLOT WILL NOT GIVE THEM!

Each of `F6.COM` and `F7.COM` holds twenty-two monster names, and the slot itself only ever picks
one of the first twenty. Two corrections sit behind that, and both of them test the same pair of
names, 19 and 20, and nothing else. On levels 1 to 6 the pair drops by eight, to 11 and 12. From
level 7 down, a monster carrying more than 140 hit points goes the other way, to 21 and 22.

So the last two names are what a strong name 19 or 20 is met as, and there is nothing in either
file you cannot meet. `SPECTOR` in the first dungeon and `GHOST` in the second are name 21, and
92 slots of the shipped tables are already carrying enough hit points to be met as one.

In the code: `rev-tools/docs/MONSTERS.md` part 2, on `1000:80B0` and the two corrections at
`1000:81A6`.

### The whole floor moves at the pace of the last monster you met
! THE WHOLE FLOOR MOVES AT THE PACE OF THE LAST MONSTER YOU MET!

A monster taking its turn decides between wandering and coming at you by rolling against a level
plus 35 and asking whether the result is under 15, so the bigger that level is, the less anything
wanders. How often a monster gets a turn at all comes from `165 - the same level + your level`,
and the bigger it is the more often the floor moves, though never oftener than one pass of the
loop in eight, whatever the arithmetic says.

The level in both is one variable, and it is not the level of the monster taking the step. Two
places write it. One is the attack message, which fills it in from the monster that has just
reached you. The other is the refill after a kill, which sets it to the floor you are standing on.
So a monster four levels deeper than the floor makes every monster on that floor quicker and more
determined for as long as it lives, and killing it puts the floor back to its own depth.

In the code: `rev-tools/docs/MONSTERS.md` part 1, on the odds at `1000:7EEC` and the choice at
`1000:73B6`.

### Killing one puts a fresh one in its place
! KILL ONE AND A FRESH ONE TAKES ITS PLACE AT ONCE!

A monster that runs out of hit points banks its experience and then, rather than being cleared
out of its slot, is written over. The slot gets `INT(RND * 8 * depth) + 2 * depth + 1` hit points,
where `depth` is the dungeon level, and a fresh square, rerolled until it lands somewhere nothing
else is standing.

So a level always holds its forty monsters. You cannot clear a floor, and everything you kill
comes back at the depth you killed it at.

In the code: `rev-tools/docs/MONSTERS.md` part 1, on the kill at `1000:8E36` and the refill at
`1000:A3C8`.

### The monsters belong to the disk, not to you
! THE MONSTERS BELONG TO THE DISK! EVERY CHARACTER SHARES THEM!

`1.NUM` and `2.NUM` — where every monster on all seventy levels is standing and how much is left
of it — are loaded once for the whole disk, not per character, and saved back out on the way out
of the game. Every character on the disk shares them.

Two consequences. A monster you ran away from is still wounded when you find it again, because
what was left of it went back into the file. And a monster another character on the disk softened
up on level 12 is waiting there, softened, for yours.

In the code: `rev-tools/docs/MONSTERS.md` part 2 and `rev-tools/docs/SURVEY.md` section 3, on the
save at `1000:B5C8` and the survivor's remainder at `1000:8FB2`.

### Meeting a monster can weaken it for good
! MEET A MONSTER AND IT MAY NEVER BE THE SAME AGAIN!

The first thing the fight does is cap the monster: if its stored hit points are at or above ten
times its level, they are set to ten times its level — and the new number is written back into
the array that gets saved. Walking up to something and walking away has permanently reduced it.

The cap is a comparison, not a clamp, so a negative number in the file would slip under it
untouched and then be fought at its magnitude. Nothing in the game ever writes one; every value
it stores is positive, and every read but one takes the magnitude anyway. What a negative entry
was for, and what wrote it, is not in this program.

In the code: `rev-tools/docs/MONSTERS.md` part 2, on the cap at `1000:8223` and the write-back at
`1000:825A`.

### No monster is ever put down on the outer ring
! NO MONSTER IS EVER SET DOWN ON THE OUTER RING! WALK THE EDGE!

When the stocking loop needs a square for a monster it rolls a row of 2 to 18 and a column of 2
to 19. The floor is twenty by nineteen, so rows 1 and 19 and columns 1 and 20 — the whole border
of every level — hold nothing at the moment a level is stocked.

They do not stay empty. Nothing about the border refuses a step onto it: a monster on row 2 that
walks north is standing on row 1, and the only arithmetic the step does about the edge is a clamp
to columns 1 to 20 and rows 1 to 19, which is there to keep it from walking off the grid
altogether.

In the code: `rev-tools/docs/MONSTERS.md` part 2, on the stocking loop at `1000:7A2E` and the
four clamps at `1000:75F0`, `7613`, `7636` and `765C`.

### Two casts of monsters, and depth alone decides which
! TWO WHOLE CASTS OF MONSTERS! ONLY DEPTH DECIDES WHICH!

There are two complete sets: twenty-two names in `F6.COM` with their pictures, and twenty-two
more in `F7.COM` with a second set of pictures in the files whose names end in `A`. Levels 1 to
34 draw on the first and levels 35 to 70 on the second, swapped over as you cross the boundary
and swapped back on the way up.

They are not two skins on the same monsters. Of `4.NUM`'s 7,999 bytes of close-up pictures, 2,875
differ from `4A.NUM`'s — different creatures, drawn separately.

In the code: `rev-tools/docs/MONSTERS.md` part 2 and `rev-tools/docs/SURVEY.md` section 3, on the
swap at `1000:4C6B` and `1000:4C97`.

## The town

### The town is an ordinary floor with a table written on top of it
! THE TOWN IS AN ORDINARY FLOOR WITH TEN SQUARES MARKED ON IT!

Level 0 is twenty squares by nineteen with the same sine walls as everywhere else, computed with
the level set to zero. What makes it the town is ten `IF column = c AND row = r` tests in a row,
one after another, handing a number to a seven-way `ON ... GOTO`:

- 7, 3 — the Flea Bag Inn
- 3, 2 — the Yuppydom Inn
- 18, 17 — the Kings Inn
- 13, 3 — the bank
- 7, 15 and 14, 12 — the temple
- 18, 3 and 13, 18 and 2, 8 — the store
- 6, 14 — the wizard's guild

Three of the ten squares are the same store and two are the same temple, which is why ten squares
hold seven buildings. There is no data file behind any of it, and no other level reaches the
branch: both ways in test the level first, so nothing below the town has a building on it.

In the code: [townBuilding](source:ts/revmap.js/townBuilding) and
[TOWN_BUILDINGS](source:ts/revmap.js/TOWN_BUILDINGS), from the table at `1000:10FD` and the
dispatch at `1000:132A` (`rev-tools/docs/DUNGEON.md` section 9).

### A building is up a rope, and the map draws it as a letter
! EVERY BUILDING IN TOWN IS UP A ROPE! HIT U TO CLIMB IT!

Walking onto one of the ten squares tells you there is a rope above and to hit `U` to climb it,
which is the ordinary go-up key doing something it does nowhere else.

The map marks them, though not the way it marks anything else. Ladders and chutes are drawn only
where the feature index has the square's bit set, and not one of the ten buildings is in that
file; the buildings are a pass of their own, with the same ten `IF column = c AND row = r` tests
the ground floor uses, stamping a 7 by 7 letter on each square you have already walked on. `B` is
the bank, `T` the temple, `I` an inn, `S` a store and `W` the wizard's guild. The five sprites are
made at start-up by printing the word `SBTIW` and reading the characters back off the screen.

The map every new character starts with has walked over four of them, and only four — the Flea
Bag Inn, the bank and one of the three stores, all along row 3, and then the temple at 14, 12,
where the seeded path stops.

In the code: `rev-tools/docs/DUNGEON.md` section 9, on the rope at `1000:12C6` and the climb at
`1000:0DBD`, and `rev-tools/docs/MAP-MEMORY.md` on the letters at `1000:C102`.

### Three inns, and the cheap ones can rob you
! THREE INNS! THE CHEAP ONES MAY ROB YOU IN YOUR SLEEP!

A room at the Flea Bag Inn is 10 jewel pieces and heals one health point. A suite at the Yuppydom
is 200 and heals three. A grand suite at the Kings Inn is 6,000, and a cleric on the staff heals
every wound you have.

Except that the two cheap ones also heal you completely if you are carrying rings of health, in
which case the Kings Inn is six thousand jewel pieces for something the Flea Bag does for ten.
What the cheap ones charge instead is risk: both roll afterwards, and one time in ten you are
told you were robbed. It is not only the money. The same six lines zero the purse, the knife, the
sword, the mace and the pluses on the sword and the mace, so a cheap night can cost you every
weapon you own. The Flea Bag rolls once more on top of
that, against being sick. Say yes without the money and a guard throws you out.

In the code: `rev-tools/docs/DUNGEON.md` section 9, on the three routines at `1000:1E0A`,
`1F3D` and `1FCD` and the robbery at `1000:1EE2`.

### The temple sells a level for half a million
! THE TEMPLE WILL SELL YOU A WHOLE LEVEL FOR HALF A MILLION!

Its menu is five lines, and each one subtracts its own price: 75 to cure wounds, 1,000 to heal
all of them, 400 to cure disease, 20,000 to remove poison, and 500,000 to gain a level. Curing
wounds gives back `INT(RND * 8) + 4` health points, which at 75 a go is the cheapest healing in
the game and the slowest.

Look at the shape of that list. Healing every wound you have costs 1,000; removing poison costs
twenty times that, and a level five hundred times it. The temple is where the money goes at the
end of the game, and there is nothing else in the town to spend half a million on.

In the code: `rev-tools/docs/DUNGEON.md` section 9, on the menu at `1000:2663` and the level at
`1000:2044`.

### The store will sell you the town, and the bank will sell you the bank
! THE STORE WILL SELL YOU THE TOWN! THE BANK WILL SELL YOU THE BANK!

The store's list is seven lines of weapons and armour, from a knife at 10 jewel pieces to field
plate armor at 10,000, and its `ON ... GOTO` has exactly seven targets. There is an eighth line
on the screen: "8) The Town: 1000000 JP". Typing 8 falls off the end of the table into a routine
that offers to throw in the Brooklyn bridge.

The bank does the same joke without even a line to type. Its sign offers the bank itself for
5,000,000 jewel pieces and "Heh heh heh", and nothing anywhere in the routine will take the
money.

In the code: `rev-tools/docs/DUNGEON.md` section 9, on the store at `1000:281E`, the eighth line
at `1000:2B67` and the bank's sign at `1000:236C`.

### The wizard's guild sells you words
! THE GUILD SELLS NOTHING BUT SENTENCES! 800 JEWELS A TIME!

The guild sells two things and both of them are sentences. For 800 jewel pieces it tells you what
the magic items do. For `INT(level ^ 1.75 * 220)` it reads out either the two prep spells of a
level, 1 to 6, or the two battle spells, and takes the money. Nothing in the routine marks a
spell as known or hands one over; the price buys the description, and the descriptions are all
sitting in `F1.COM` on the disk.

The first level is 220 and the sixth about 5,060, twenty-three times as much for six times as
deep, to be told what `GOD?` does.

In the code: `rev-tools/docs/DUNGEON.md` section 9, on the guild at `1000:2BB8`, the price at
`1000:2DAE` and the two branches at `1000:2E24` and `1000:2E91`.

### The town's ladders ask a looser question than the rest of the dungeon
! THE TOWN'S LADDERS ASK AN EASIER QUESTION THAN ANY OTHER!

Level 0 skips the branch that reads a square's own feature code and goes straight to the search
for a ladder down, which is why the town has no ladder up and no chute. Inside that search sits a
second branch only level 0 ever takes, and it is the whole difference between the town and
everywhere else: below the town, a ladder goes down to a level whose folded code is **exactly** the
distance; in the town, any level that folds to at least the distance will do.

That is three ladders out of the town turned into ten, and ten is precisely what the shipped
feature index marks on level 0 — those squares and no others, with nothing left over on either
side. It is a cleaner agreement than the rest of the dungeon manages.

The branch went unread for a while because it assigns from an address nothing in the program ever
writes. The address is not a variable at all: it is the compiler's second spill slot, filled four
instructions earlier.

In the code: [feature](source:ts/revmap.js/feature), from the town's branch at `1000:55DD` and
the spill at `1000:55F9` (`rev-tools/docs/DUNGEON.md` section 9).

## Bugs the game has

### Seven of the town's ladders lead to floor minus one
! SEVEN OF THE TOWN'S TEN LADDERS GO SOMEWHERE THAT IS NOT THERE!

The looser test the town uses takes any ladder that reaches **at least** as far as asked, which
means seven of its ten ladders down are longer than the trip they were picked for. The square at
11, 6 of the town is a ladder down one level. The square at 11, 6 of level 1 — the same square,
one floor down, the one the ladder lands you on — is a ladder up two, and two levels above
level 1 is a floor that does not exist.

Everywhere below the town a ladder down and the ladder up that answers it agree about how far
they go, because the exact test is what the rest of the dungeon uses. Seven squares of the town
are the only place the pairing breaks.

In the code: [feature](source:ts/revmap.js/feature) and `rev-tools/docs/DUNGEON.md` section 9.

### A magic mace makes you harder to hit
! THE MAGIC MACE DEFENDS YOU WHILE YOU SWING IT! WHAT A WEAPON!

Your own swing adds the plus on your weapon to the roll, which is what a plus is for. The
monster's swing, on the way past, adds the magic mace's plus to your armour class — in the
routine that works out whether the monster hits **you**.

So a magic mace is quietly worth more than it says: it is a weapon bonus and a defence bonus at
once, and nothing on any screen mentions the second half.

In the code: `rev-tools/docs/MONSTERS.md` part 1, on the monster's swing at `1000:9B12` beside
yours at `1000:8A5C`.

### The monster's die is never cleared
! THE MONSTER'S DIE IS NEVER WIPED CLEAN! IT REMEMBERS!

Both sides of a fight roll a twenty-sided die that explodes: roll a 20 and roll again, adding.
Your roll assigns the result to its variable. The monster's adds to it.

The variable it adds to is the compiler's general-purpose scratch cell, the one hundreds of
statements in the program use as somewhere to put a number for a moment. So a monster's attack
roll does not start at the die; it starts at whatever the last statement to touch that cell
happened to leave in it, and then the die is added on top.

In the code: `rev-tools/docs/MONSTERS.md` part 1, on the monster's roll at `1000:9A96` against
yours at `1000:8A14`.

### After the fountain of youth, the game disagrees with itself about its own walls
! DRINK FROM THE FOUNTAIN AND THE MAP STOPS AGREEING WITH THE WALLS!

The wall rule divides by the generation, and two places in the game compute it. The move test
divides first and multiplies the coordinates on afterwards; the map divides last. In
single-precision arithmetic that is not the same sum.

While the generation is 1 — which is every character as shipped — dividing by one costs nothing
and the two agree everywhere. Drink from the fountain and they stop agreeing: two sides out of
60,480 at generation 3, seven at generation 5, six at generation 7. A handful of squares in a
regenerated dungeon are drawn with a wall you can walk through, or without one you cannot.

In the code: [wallSide](source:ts/revmap.js/wallSide), whose order is the move test's, and
`rev-tools/docs/DUNGEON.md` section 6.

### The last number of your saved map is cut in half
! THE LAST NUMBER OF YOUR SAVED MAP IS CUT CLEAN IN HALF!

The statement that writes a character's explored map asks for a length of "the address of the
last element minus the address of the first, plus one". The two addresses are 6,044 bytes apart,
so the length comes out 6,045 — four bytes for every element except the last, which gets one.

Nothing is lost, because the last element is the corner of an array the game never reads. What it
leaves behind is the giveaway: every `<n>.BIN` in the game folder is an odd number of bytes long,
which is not a shape a `BSAVE` of an array of four-byte numbers can otherwise take.

In the code: `rev-tools/docs/SURVEY.md` section 3, on the `BSAVE` at `1000:B583`.

### A zero in your saved map still carries the bytes that were there before
! A ZERO IN YOUR MAP STILL CARRIES WHAT USED TO BE THERE!

BRUN30 stores a floating-point zero by writing the exponent byte and nothing else, on the
grounds that an exponent of zero is the whole of what makes a number zero — the other three bytes
are never read again, so why write them.

They do get written to disk, though. Eight rows of the town are zero in a new character's map,
and the bytes underneath those zeroes are whatever happened to be in that memory when the array
was dimensioned. They read back as zero and always will; they are just not blank.

In the code: the explored-map writer in `src/lib/roller/rev-save-file.ts`, which writes them
clean, from the `BSAVE` at `CHCHAR.EXE` offset `1557`.

## Trivia

### The disk calls itself the advanced version, and it is not
! MORAFF'S REVENGE ADVANCED VERSION 3.3! IT IS NOT THE ADVANCED ONE!

`BEGIN.EXE` banners itself `MORAFF'S REVENGE ADVANCED VERSION 3.3` on the way in, and then offers
"5...ORDER MORAFF'S REVENGE ADVANCED VER." as a menu item, and the order form behind that item is
perfectly clear that what you have is the beginner's build and that it stops at the seventeenth
level. The title screen is advertising a thing it claims to be.

In the code: `rev-tools/docs/SURVEY.md` section 1, on `BEGIN.EXE`'s strings and `NCD.EXE`'s
order text.

### One file in the folder has nothing to do with the game
! ONE FILE IN THIS FOLDER HAS NOTHING TO DO WITH THE GAME!

`COLOR.COM` is a real `.COM` file, 1,092 bytes, and it identifies itself as copyright Diamond
Flower Electric: a video-card utility dated 1987. Nothing in the game runs it and nothing in the
game names it. It was bundled with the disk and never used.

The only other thing in the folder Moraff did not write is Microsoft's run-time, which the game
cannot run a statement without.

In the code: `rev-tools/docs/SURVEY.md` section 1.

### A 41-byte text file decides which characters exist
! 41 BYTES DECIDE WHICH HEROES EXIST! NOT ONE BYTE MORE!

`F5.COM` is the list of names, one per line in slot order, ending with the word `END`, and it —
not the presence of a character record — is what the front end offers you. The shipped disk has
five character records and five explored maps sitting in the folder and two names in `F5.COM`,
so three complete characters from 1991 are on that disk and cannot be reached from the menu.

In the code: `rev-tools/docs/SURVEY.md` section 1, on the character picker in `BEGIN.EXE`.

### The hall of fame is not a table, it is a picture
! THE HALL OF FAME IS NOT A LIST! IT IS A PHOTOGRAPH!

`F9.EXE` is not a program and not a text file. It is a `BSAVE` image — a block of
memory written straight to disk — 1,789 bytes, of which the first seven are the header and the
last is the end-of-file byte. `F8.EXE`, the program on the main menu that shows the hall of fame,
`BLOAD`s it back to the address the header names and that is the whole of the feature.

In the code: `rev-tools/docs/SURVEY.md` sections 1 and 3, on `F8.EXE`'s `BLOAD` at its offset
`01DD`.

### The seventh paragraph comes out blue
! THE SEVENTH PARAGRAPH ALWAYS COMES OUT BLUE! EVERY TIME!

The instruction screens take a new colour at the start of every paragraph from a table filled
`C(J) = J + 9`, with a counter that goes up by one each time and wraps at 6 back to 0. The
characteristics screen has eight paragraphs.

So the first six run green, cyan, red, magenta, yellow, white, and then the seventh — the
paragraph about laziness — falls back to element 0 of the table, which is blue, before the eighth
starts the cycle again at green. It is the only paragraph on the screen in a colour the rest of
the cycle never uses.

In the code: the colour step at `CHCHAR.EXE` offset `16E8` and the table at `044E`.

### Picture 6 is a skull, a ribcage and a scythe
! PICTURE 6 IS A SKULL, A RIBCAGE AND A SCYTHE!

Which picture a monster is drawn with is two files deep: the first name in `F6.COM` is `SKELETON`,
element 1 of `3.NUM` is a 6, and picture 6 of `4.NUM` is a skull, a ribcage and a scythe. That
single chain is what confirmed the whole arrangement — two small tables of picture numbers, one
for the close-up view and one for the distant one, in front of two files of pictures.

In the code: `rev-tools/docs/SURVEY.md` section 3.

### The monsters are drawn in CGA's own two palettes
! DRAWN IN BOTH OF CGA'S PALETTES! FOUR COLOURS AT A TIME!

The game runs in `SCREEN 1`, which is four colours at two bits a pixel, and it starts on
background 0 with the palette set to 2. In `SCREEN 1` an even palette number is CGA palette 0 —
black, green, red and brown. The `@` key steps the palette between 2 and 3, and 3 is CGA
palette 1 — black, cyan, magenta and white — while the `#` key steps the background colour along.
Those are not choices Moraff made about how a monster should look; they are the only two sets of
colours `SCREEN 1` had to offer.

In the code: `rev-tools/docs/MONSTERS.md` part 2, on the colour setup at `1000:0174` and the two
keys at `1000:1038` and `1000:1003`.
[Color Graphics Adapter](https://en.wikipedia.org/wiki/Color_Graphics_Adapter).
