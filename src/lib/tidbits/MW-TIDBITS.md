<!--
  How to add a tidbit
  -------------------
  The same Markdown TIDBITS.md is written in: a `### Some title` under one of the `## Section`
  headings, then a paragraph or two. Blank lines separate paragraphs, a line starting `- ` is a
  list item, `backticks` make inline code and **stars** make bold.

  Links are ordinary Markdown, `[text](https://example.com/)`, and two forms point inside this
  app instead of at the web:

      [text](source:ts/effects.ts/MW_SPELL_EFFECTS)   a declaration of the Moraff's World port
      [text](source:c/strike)                         a function of mw.c, WORLD.EXE decompiled

  Both resolve against Moraff's World, because this is Moraff's World's file: the file names come
  from the Source tab under that game and the function names from `mw-tools/decomp/mw.c`. The
  `formula:` links TIDBITS.md uses are Dungeons of the Unforgiven's alone, since the Formulas tab
  is that game's; a link to one from here fails the test.
-->

## Exploits and shortcuts

### A priest can write wizard scrolls, and a wizard priest ones
! YOUR PRIEST CAN WRITE WIZARD SCROLLS!! THE MENU ONLY LOOKS SHUT!

Write Scroll and Enchant Wand ask three questions in a row: which kind of spell, which level, and
which of the three spells on that line. The first menu draws the two battle lists your class
cannot cast as rows of dashes and blanks their mouse hot-spots, so they read as switched off. The
keyboard is still listening. The menu reader is asked for lines 2 to 4 whatever your class is, so
typing the number writes the scroll or charges the wand without a word of complaint.

The gate that turns a class away lives on the spell screen, and only when that screen was opened
for your spell book. A scroll, a wand or a piece of magic paper goes straight past it, so anything
you can write down, anyone can cast.

Anyone but a fighter. The spell screen has a second gate ahead of that one, and it turns a fighter
away from the spell book, a scroll and a wand alike: `FIGHTERS CAN ONLY CAST SPELLS BY USING MAGIC
PAPER. KEEP LOOKING.` Magic paper is the one thing it lets through.

In the code: [cast_spell](source:c/cast_spell), [spell_screen](source:c/spell_screen) and
[mwCanCast](source:ts/spells.ts/mwCanCast).

### Two pills are two free points
! TWO PILLS, TWO FREE POINTS, AND NOBODY ASKS FOR THEM BACK!

A vitamin pill puts four points on one characteristic and takes two off another, and the six pills
are three pairs that trade the same two characteristics in opposite directions. Green is four
intelligence for two agility and white is four agility for two intelligence; orange and yellow
trade strength against luck, red and blue constitution against wisdom.

Swallow one of a pair and then the other and both characteristics are two points higher than they
started. Nothing caps either number and nothing limits how many pills you may take, so a level
drainer that keeps handing them over is a characteristic farm.

In the code: [take_pill](source:c/take_pill).

### A Power Weapon spell is a row better than it says
! POWER WEAPON IS BETTER THAN ADVERTISED! A WHOLE ROW BETTER!

Power Weapon writes 1, 2 or 3 and the swing looks the weapon table up eight rows past it. Row
eight is already POWER WEAPON 1, so Power Weapon I swings the 129-point die labelled POWER WEAPON
2, the second swings 199 and the third swings 399 — the biggest die in the table, which no spell
was meant to reach. The greatest sword in the game rolls 19.

Only the die changes. The to-hit bonus, the permanent plus and the swing time still come from
whatever is actually in your hand, so casting Power Weapon with a great sword out keeps its bonus
and casting it barehanded throws that bonus away.

The row you are borrowing has the better swing time too, and that one you do not get. Every
weapon carries the time units its swing takes, which are handed to the routine that lets game
time pass — which is what buys the monster next to you its turns. A great sword takes 25, a knife
8, and all four power weapon rows take 8.

In the code: [strike](source:c/strike),
[MW_POWER_WEAPON_DICE](source:ts/spells.ts/MW_POWER_WEAPON_DICE),
[WEAPONS](source:ts/monsters.ts/WEAPONS) and [spend_time](source:c/FUN_2000_7fb1).

### A monk starts with every spell in the game
! THE MONK BEGINS WITH EVERY SPELL IN MORAFF'S WORLD!!

The roller hands out three flags between them. Little Cure goes to every class but the fighter,
Zap to the wizard, the sage and the mage, and Strength to the worshipper, the priest and the sage.
So a fighter starts with nothing, four classes start with two, and the sage starts with three.

A monk gets a triple loop over the whole spell book instead: four categories, fifteen levels,
three slots, all 180 flags set. That is 120 real spells and sixty flags for levels that do not
exist.

`ROLL.TXT` calls this "HAS ABILITY TO CAST SPELLS WITHOUT SPELLBOOKS", which sounds like a
convenience. It means the monk walks out of character creation holding every permanent spell,
every preparation spell and both battle lists, and only has the spell points to worry about.

In the code: [startingSpells](source:ts/character.ts/startingSpells) and
[roll_char](source:c/roll_char).

### Sleep works on a boss
! SLEEP WORKS ON A BOSS! ONLY FIVE SPELLS EVER ASK WHO IT IS!

Only five spells ask whether a monster is one of the spell-proof ten: Teleport Monster, Autokill,
Drain Monster and the two Hold Monsters. Nothing else does. Every damage spell in the game lands
on Zeus, the Devil and the eight quest bosses as squarely as on anything else, and so does Sleep.
"Ten monsters no spell touches", below, is about those five and what they refuse.

Sleep rolls once against the monster's own level and, on a zero, the monster does nothing for ten
of its turns, boss or not. Against something with several thousand hit points a spell that buys
free swings is worth more than a spell that does damage, though each sleeping turn also ends
outright when a roll on 500 comes out below the floor number, so the deeper you are the less of
the sleep you get.

In the code: [sleep_monster](source:c/sleep_monster), [spell_proof](source:c/spell_proof) and
[isSpellProof](source:ts/monsters.ts/isSpellProof).

### The most important thing in town is free
! THE FINEST THING IN TOWN COSTS YOU NOTHING! ZERO JEWELS!

The temple sells five cures at 30, 200, 2,500, 300 and 500 jewels, and a sixth line, the raise
dead contract, priced at zero. It writes down the dungeon and the square you are standing on and
nothing else.

Die with one and you wake in the town, one point of constitution poorer and otherwise whole. Die
without one and the game deletes your character's file, its monster cache and its explored maps.
There is no confirmation and no second chance, and the contract is spent every time it is used,
so buying another is the first thing to do on every visit to town.

In the code: [the temple](source:c/FUN_2000_3085) and [death](source:c/FUN_2000_726f).

### The floor slosher never runs out
! THE FLOOR SLOSHER NEVER RUNS OUT! USE IT FOR EVER!

Six magic items turn up on kills. Four of them are used up when you use them: the holy hand
grenade, the stone of teleportation, the stone of seeing and the potion of healing. The ring of
regeneration is never used at all, since it works by sitting in your pack and handing back a
health point as time passes. That leaves the floor slosher, which is used and never spent.
Nothing anywhere in the game takes it off you.

It drops you through the floor onto the one below. Not onto the square you were standing on,
though it starts there: if that square is rock on the new floor, it rolls a fresh square anywhere
on the floor and keeps rolling until one is not rock, so a slosher through a wall lands you
somewhere else entirely.

The find that hands one over refuses to give you a second, on the grounds that one is enough. It
is: above floor 76 a slosher is an unlimited ladder down.

In the code: [use_magic_item](source:c/use_magic_item).

## Combat

### Swing on the beat
! THERE ARE GOOD MOMENTS TO SWING AND BAD ONES!

Your to-hit roll is not random. The swing reseeds the random number generator from the PC's tick
counter and then takes the very first number out of it, and Borland's generator answers
consecutive seeds with numbers that climb steadily rather than jumping about. The result is a
sawtooth: the roll walks up from 0 to 79 at about 0.85 per tick and wraps round every 5.2 seconds
of real time, over and over, for as long as the game is running.

So there are good moments to attack and bad ones, on a five-second cycle, and nothing on screen
tells you which is which. Only the first roll of the swing follows the clock; the damage dice
after it move fast enough to look random.

The monster's own attack looks as though it does the same. It seeds from the tick count plus 100,
and then takes its to-hit roll through `random_n`, which reseeds itself from a running sum of
clock readings before it rolls anything. The seed it was handed never reaches a die. The sawtooth
is yours alone.

In the code: [strike](source:c/strike), [monster_turn](source:c/monster_turn) and
[rand](source:c/rand). Borland's generator is a plain
[linear congruential generator](https://en.wikipedia.org/wiki/Linear_congruential_generator),
which is why consecutive seeds give answers that lie on a straight line.

### A big swing rolls the damage die several times
! ONE MIGHTY SWING ROLLS THE DICE AGAIN AND AGAIN!

The to-hit roll is not pass or fail. A roll on 80 is added to twice your level, your strength,
your luck, the weapon's own to-hit number and every plus you are carrying; twice the monster's
depth and the three bytes of its row that count as defence come off; and then the weapon's damage
die is rolled once for every 40 points, or part of one, that the total sits above 40, so 41 rolls
it once and 81 rolls it twice.

That is why a character who has outgrown a floor kills in one blow: it is the same swing, cashed
several times over. The monster's side works the same way on a threshold of 32 with 40 coming off
each time, so a monster's roll of 33 hits once and 73 hits twice.

In the code: [strike](source:c/strike), [monster_turn](source:c/monster_turn) and
[toHitTotal](source:ts/to-hit.ts/toHitTotal).

### Constitution only helps on a floor deeper than you are
! CONSTITUTION ONLY SAVES YOU WHERE YOU DO NOT BELONG!

Once a monster's swing has landed, and only while your level is below the floor number, the game
piles on extra rolls: one on the difference between the floor and your level, one on four times
the floor from floor 26 down, another on five times the floor from floor 101 down, and one on the
monster's own depth. That is what makes a floor deeper than you dangerous rather than merely
harder.

The whole total is then multiplied by `(100 - constitution + 50) / 150`. At 0 constitution that is
the damage unchanged; at 100 constitution it is a third of it. The subtraction is floored at 1, so
constitution above 100 buys nothing at all.

The multiply is inside the same block as the extra rolls, so it is the same condition. A character
whose level has caught up with the floor takes neither the extras nor the reduction: the most
useful number in the game does nothing whatever until you go deeper than your level, and stops
mattering again at exactly 100.

In the code: [monster_turn](source:c/monster_turn).

### One monster attack in four is thrown away
! ONE MONSTER SWING IN FOUR NEVER LANDS! LUCKY YOU!

After the damage dice there is a roll on four, and on a 1 the entire total is discarded and
replaced with a roll on `floor / 2 + 3`. That roll can come out zero, so a monster that landed a
solid hit does nothing at all a quarter of the time on shallow floors, and the message says it
missed you.

It is not the last word on the damage. The replacement is made before the deep-floor extras and
the constitution divide, so on a floor deeper than your level a nonzero replacement still has all
of those piled on top of it.

In the code: [monster_turn](source:c/monster_turn).

### A monk is easier to hit for being clever
! THE MONK'S OWN CLEVERNESS HELPS THE MONSTERS HIT HIM!

Every class is hit on the same arithmetic except one. A monk has a roll on their own intelligence
**added** to the monster's chance of hitting them, which is the one place in the game where a
characteristic makes you worse at something.

Dungeons of the Unforgiven has the same line and subtracts it. Whatever it was meant to be, in
Moraff's World a monk who rolls a high intelligence — and intelligence is half of a monk's spell
points — is paying for it on every swing anything takes at them.

In the code: [monster_turn](source:c/monster_turn).

### A level 0 character cannot be hit for more than four
! AT LEVEL 0 NOTHING HURTS YOU MORE THAN FOUR! WE LOOK AFTER BEGINNERS!

Near the end of a monster's attack, after the damage is final, comes a line: if your level is 0
and the damage is above 4, throw it away and take a roll on 4 plus 1 instead, which is 1 to 4. You
leave character creation at level 0 and stay there until you have earned 54 experience and paid
for a room, so the whole of that first stretch is played under a cap of four points a hit.

It is the only difficulty setting the game has, and nothing tells you it is there or that it is
about to end. It is not quite the last line either: a monster with a breath weapon breathes it
half the time, and the breath is worked out afterwards and never sees the cap.

In the code: [monster_turn](source:c/monster_turn) and
[experience_needed](source:c/experience_needed).

### You cannot fight through a door
! WALK THROUGH A DOOR ALL YOU LIKE! YOU CANNOT SWING THROUGH ONE!

A square's four sides are each a wall, a door, a secret door or open air, and only a wall stops
you walking. A door is walked through as freely as open air; a secret door is a door the automap
draws as a wall.

Engagement is stricter. The test for what you are facing wants the side between you and it to be
fully open, and a monster's attack wants the same. A monster's own step wants only that the side
is not a wall. So a monster walks through a doorway to reach you and then neither of you can touch
the other, and the game says `THE DOOR IS JAMMED` when you try to walk into the square it is
standing on.

In the code: [check_engagement](source:c/FUN_2000_7d60),
[monsters_move](source:c/monsters_move) and [side](source:ts/mwmap.js/side).

### Breath throws the whole fight away
! A BREATH WEAPON IGNORES YOUR ARMOUR AND EVERYTHING ELSE!!

A monster whose row names a breath weapon breathes it instead of swinging half the time, and when
it does, everything above — the roll on 80, your armour, your level, your constitution — is
discarded. Breath is `depth + a roll on depth`, and that is all.

The five are fire, ice, acid, green phlegm and black slime. Anti-Fire and Anti-Cold halve their
kinds, and Resist Disease and Resist Poison halve phlegm and slime, which is the only thing those
two spells do by halves. Acid has no defence: it does its damage, sets the permanent plus on the
suit you are wearing to zero, takes one of that suit away and leaves you in your skin.

In the code: [monster_turn](source:c/monster_turn) and
[describeEffects](source:ts/monsters.ts/describeEffects).

## Magic

### Go Away never fails, and charges you when it refuses
! TELEPORT MONSTER NEVER FAILS! AND IT CHARGES YOU WHEN IT WILL NOT!

The help text for Teleport Monster talks about your level against the monster's. There is no such
test anywhere in the spell. Against anything but the ten spell-proof monsters it works every
single time.

The other half of that is worse. The dispatcher throws away the answer the spell gives it and
reports success regardless, and the spell points are taken once the effect has reported success —
so a spell-proof monster that laughs it off, or casting it with nothing engaged at all, costs the
full price for nothing.

In the code: [teleport_monster](source:c/teleport_monster), [spell_effect](source:c/spell_effect)
and [MW_SPELL_EFFECTS](source:ts/effects.ts/MW_SPELL_EFFECTS).

### Go Away can drop a monster inside solid rock
! TELEPORT MONSTER PUTS THEM SOMEWHERE ELSE! SOMETIMES INSIDE A WALL!

The spell rolls a new square for the monster and then checks whether it is solid before accepting
it. It checks the wrong square: it asks about the square **you** are standing on, not the one the
monster just landed on. You are never standing in rock, so the check passes on the first roll
every time and the monster can end up sealed inside a wall where nothing can reach it.

Dungeons of the Unforgiven has exactly the same mistake in exactly the same spell.

In the code: [teleport_monster](source:c/teleport_monster).

### The three resistances are absolute while they last
! THE HELP SAYS 95 PER CENT! IT IS EVERY LAST PER CENT!

Resist Poison, Resist Disease and Resist Level Drain read as percentages in the help text — 95,
95 and 90. They are not chances at all. While the timer is running the poisoning, the disease and
the level drain do not happen, with no roll anywhere, and a poison or disease you are already
carrying stops counting down towards its next point.

Each cast adds 60 moves to the timer rather than replacing it, so casting one again while it is up
is not wasted.

Anti-Fire and Anti-Cold, which sound like the strongest of the set, are the weakest. They do not
stop a breath weapon; they divide its damage by two and do nothing else at all. Nothing in the
game stops a dragon's breath outright, and nothing whatever answers acid.

In the code: [resist_poison](source:c/resist_poison), [resist_drain](source:c/resist_drain),
[anti_fire](source:c/anti_fire) and [monster_turn](source:c/monster_turn).

### The anti-magic ring does nothing
! THE ANTI-MAGIC RING IS ON YOUR SHEET FOR ALL TO ADMIRE!

The Anti-Magic Ring is bought with four permanent spells, kept in the save file, shown on the
inventory screen, and refused by the spell when you already have a better one. No line anywhere
in the game ever reads the field back. It protects against nothing.

The levels give it away as unfinished: the ring goes 1, 2, 3 and then straight to 5, with no level
4 anywhere in the list — which is the gap Dungeons of the Unforgiven's identical ring has too.

In the code: [raise_ring_antimagic](source:c/raise_ring_antimagic) and
[MW_SPELL_EFFECTS](source:ts/effects.ts/MW_SPELL_EFFECTS).

### Priest Protection is Minor Protection again
! THE PRIEST'S PROTECTION IS EVERY BIT AS GOOD AS THE CHEAP ONE!

Protection takes `2 * level * level` off a monster's attack roll, so level 1 is 2 and level 2 is
8. The priestly list's Protection, on spell level 5, asks for protection level 1 — which is what
the level 1 Minor Protection asks for. The wizard's Protection, on the same spell level, asks for
2.

So a priest goes 2, then 2 again, and then straight to Major Protection's 18 three levels later,
and casting the level 5 spell over the level 1 one buys nothing but sixty more moves. The other
game's priests have the same complaint.

In the code: [raise_protection](source:c/raise_protection) and
[MW_SPELL_EFFECTS](source:ts/effects.ts/MW_SPELL_EFFECTS).

### The permanent Invisibility is the weaker one
! PERMANENT INVISIBILITY LASTS FOR EVER AND WORKS NO BETTER!

Both Invisibilities write the same field: the preparation one writes 1 and the permanent one
writes 100, which is what keeps a night at the inn from clearing it. The monster movement pass
tests that field for **exactly** 1 before it skips a move.

So the cheap version stops every monster on the floor one move in four, and the expensive
permanent version does not. What the permanent one keeps is the other half of the spell, the roll
that decides whether a monster you have just met gets its free first strike, which tests the field
for anything at all.

In the code: [monsters_move](source:c/monsters_move) and
[MW_SPELL_EFFECTS](source:ts/effects.ts/MW_SPELL_EFFECTS).

### Fast Move and Invisibility stack
! RUN FAST AND VANISH AT ONCE! TWO CHANCES TO SKIP THE MONSTERS!

Each of them skips the whole monster movement pass one move in four, and they are two separate
rolls made a few lines apart rather than one roll used twice. Either on its own buys you four
moves in sixteen where nothing on the floor follows you and nothing swings. Running both buys
seven, because the pass survives only when both rolls miss.

Dungeons of the Unforgiven's pair are the same roll and do not stack. This one is the better deal
and nothing says so.

In the code: [monsters_move](source:c/monsters_move).

### Youth halves your age
! YOUTH DOES NOT TAKE TEN YEARS! IT TAKES HALF OF THEM ALL!

The help text offers ten years off. What the spell does is halve the age field outright, with a
floor of 15,744 minutes, which is about eleven days, and give back nothing of the strength and
constitution that ageing took.

Age is kept as a count of minutes — years times 525,600 — and everything that prints it divides by
525,600 again, which is why a character who has been played has an age like 37.5 years. Halving it
is a fortune to an old character and almost nothing to a young one, and the deal only gets better
the longer you leave it.

In the code: [MW_SPELL_EFFECTS](source:ts/effects.ts/MW_SPELL_EFFECTS),
[show_roll](source:c/show_roll) and
[MINUTES_PER_YEAR](source:ts/character.ts/MINUTES_PER_YEAR).

### Ascend and Descend put you anywhere on the floor
! ASCEND DOES NOT LIFT YOU STRAIGHT UP! IT PUTS YOU ANYWHERE!

All five of the floor-changing spells describe themselves as moving you straight up or straight
down, into the open space above or below where you stand. None of them does. Each one rolls
squares of the destination floor until it finds one that is not rock and drops you there, so a
Descend is a Relocate with a floor change attached and you can arrive anywhere at all.

The depth limits are not what the messages say either. Descend is refused on floor 124 and deeper.
The three Ascends are refused from floor 66 down while the message names the 64th, and refused in
the town on top of that.

Major Descend takes the Ascends' refusal and not their town one, so it is the one floor spell you
can cast standing in the town. Nor is it the "at least 25" it advertises, or even twenty five
exactly: it adds 25 and then clamps the answer to floor 75. That is a full twenty five floors only
down to floor 50, fifteen from floor 60, and ten from floor 65, which is as deep as it will go.

In the code: [spell_effect](source:c/spell_effect) and
[MW_SPELL_EFFECTS](source:ts/effects.ts/MW_SPELL_EFFECTS).

### Permanent spells are free off a scroll
! PERMANENT MAGIC FOR NOTHING!! JUST READ THE SCROLL!

Casting a permanent spell out of your spell book takes its level off your current spell points and
the same number off your maximum, for good. That is the price of the improvement, and it is why
nobody casts the deep ones.

Cast the very same spell off a scroll, a wand or a piece of magic paper and it costs nothing at
all: the screen takes the points only for a spell cast from memory, and one charge comes off the
item instead. The improvement lands either way. Writing the scroll is itself a permanent spell, so
it costs its own level — but the deepest Write Scroll is a level 4 permanent spell and it writes a
scroll of anything up to level 10.

The time is free as well. A permanent spell hands the movement loop 36,096 moves as what it cost
you — `SPELLS.HLP` calls that a month, and at the sixty moves the loop counts to a minute it is
about ten hours. It is neither. The loop spends anything under 60 in one go and anything under
30,000 a minute at a time, and 36,096 falls through both tests, so no time passes at all.

In the code: [spell_screen](source:c/spell_screen),
[mwMaximumSpellPointCost](source:ts/spells.ts/mwMaximumSpellPointCost),
[cast_spell](source:c/cast_spell) and [movecontrol](source:c/movecontrol).

## Monsters

### MORAFF can never appear, twice over
! THERE IS A MONSTER NAMED MORAFF! YOU WILL NEVER MEET HIM!

Monster 9 of the table is called MORAFF. Its lowest floor is 120 and its highest is 90, so no
floor in the game falls inside its range; and the picture flag for its slot is clear, so it has no
picture in `WORLD.PIC` either. The roller checks both, and MORAFF fails both.

Whatever it looked like and whatever it did, nobody has ever met it.

In the code: [pick_monster](source:c/pick_monster),
[neverStocked](source:ts/monsters.ts/neverStocked) and
[MONSTERS](source:ts/monsters.ts/MONSTERS).

### Seventeen monsters have no picture, and so no existence
! SEVENTEEN MONSTERS HAVE NO PICTURE AND SO NO LIFE AT ALL!

`WORLD.PIC` holds 37 images against a 48-byte table of flags saying which of them are there, and
35 of those flags are set. A monster's row carries a picture number, and the routine that rolls a
monster redraws until it has one whose flag is set. Seventeen of the 104 rollable monsters carry a
number whose flag is not.

They are ordinary monsters with ordinary numbers — the Hobbit, the Troll, the Goblin, the
Gargoyle, the Floating Eye, the Specter, three centipedes and three giant toads among them — and
the game will never place a single one. The Hobbit matters more than the rest: it is monster 6,
which is the group a character in dungeon 0 walks over. Their floors get no group lean at all,
because the monster the group names cannot be drawn.

In the code: [pick_monster](source:c/pick_monster),
[load_world_pic](source:c/load_world_pic) and
[stockingOdds](source:ts/monsters.ts/stockingOdds).

### Everything you kill becomes an ogre in the corner
! EVERY MONSTER YOU SLAY BECOMES AN OGRE IN THE CORNER!!

A dead monster is not removed. Its slot is rewritten in place as monster type 0 — an Ogre — with
no hit points, no depth, and a position of x 100, y 100, which is off the side of an 80-wide
floor.

The occupancy grid is 80 by 110 kept as one run of bytes, indexed `y * 80 + x` with no range
check, and the branch that puts you back on a floor you were on before writes every one of the 145
slots onto that grid whatever its hit points. A corpse lands at byte 8,100, which reads back as
the square x 20, y 101. Every monster you ever killed on that floor piles onto that one square,
and the last of them wins it.

The game kills whatever you are facing the moment its hit points drop below one, so an ogre with
none dies before you swing. At depth 0 it pays 12 experience, on any floor, and still rolls every
drop the kill has to offer — and the drops read the depth of the slot, which the kill has already
zeroed, so they are the same drops on floor 200 as on floor 2.

That blanking is the kill's other mark on the game. It happens before any of the ten routines
that decide what the monster was carrying, three of which read the dead monster's depth and so
read a zero — on every kill, not only this one. The experience is worked out first and is the one
thing it does not spoil.

In the code: [monster_killed](source:c/monster_killed),
[generate_section](source:c/generate_section), [the weapon find](source:c/FUN_3000_ba27),
[the money find](source:c/FUN_3000_bdb5) and
[killExperience](source:ts/monsters.ts/killExperience).

### The Shadow dragons are holes in the shape of a dragon
! ONE DRAGON PICTURE, PAINTED FIFTEEN DIFFERENT COLOURS!

Every monster has a colour byte, and the picture drawer paints pixel value 17 with it — which is
how one picture of a ball serves as fifteen coloured balls and one dragon picture serves as seven
dragons.

The four Shadow dragons carry 32, and 32 is the value the drawer reads as "do not draw this pixel"
at all. So a Shadow dragon is not a dark dragon. It is the dragon picture with every coloured
region cut out and the corridor showing through the gaps — the same trick Dungeons of the
Unforgiven plays with its own Shadow bosses.

In the code: [draw_picture](source:c/draw_picture) and
[MONSTERS](source:ts/monsters.ts/MONSTERS).

### Ten monsters no spell touches, and they hand your grenade back
! TEN MONSTERS LAUGH AT YOUR SPELLS AND HAND THE GRENADE BACK!

Zeus, the Devil and the eight quest bosses carry a 100 in the byte that marks a monster's kind.
Teleport Monster, Autokill, Drain Monster and both Hold Monsters ask about it first and print
`NO, THAT SILLY SPELL DOESTN'T WORK ON ME` instead of working.

A holy hand grenade thrown at one of them is caught, and the game says so — misspelling its own
word for it as `GRADADE` — and then hands it back. Unlike a spell, the grenade is not used up: the
count comes off only on the branch where the monster dies. Throwing one at the Red Dragon King
costs nothing but the key press.

In the code: [spell_proof](source:c/spell_proof), [use_magic_item](source:c/use_magic_item) and
[isSpellProof](source:ts/monsters.ts/isSpellProof).

### Everything more than a few steps away is standing still
! THE MONSTERS ONLY WAKE UP WHEN YOU GET CLOSE!

A monster only moves if the two axes' distances add to less than `floor / 10 + 10`, and even
then only four times in five. That is nine squares on floor 1 and twenty-nine on floor 200, and it
is measured straight across the grid, through any wall in the way, so a monster on the far side of
a partition counts as close. Anything further off stands exactly where it was placed, for as long
as the floor stays in memory.

When it does move it takes one step: west if you are west of it, else east if you are east, else
north, else south, and if the first of those it wants is blocked it tries the next. It never steps
away and never goes round anything. A monster level with you whose sideways step is walled off has
nothing left to try and stands there for ever.

In the code: [monsters_move](source:c/monsters_move).

### The quest bosses stay where you left them
! THE QUEST BOSSES WAIT EXACTLY WHERE YOU LEFT THEM!

The eight quest bosses stand on floors 4, 8, 12, 16, 125, 150, 175 and 200, in the first of the
floor's 145 monster slots, and only while the kill flag for that one is still clear. The first
time a boss is placed it goes somewhere in the middle of the floor, `random(50) + 25` on each axis,
and its square is written into a pair of tables indexed by the monster number.

Every later visit puts it back within seven squares of that remembered spot. The rest of the floor
is rerolled from scratch and stands somewhere new; the dragon is roughly where you ran away from
it. It also gets twenty hit points per floor of depth on top of its ordinary roll, which on floor
200 is four thousand before the dice are thrown.

In the code: [generate_section](source:c/generate_section),
[stockFloor](source:ts/stocking.ts/stockFloor) and [BOSSES](source:ts/monsters.ts/BOSSES).

## Map and travel

### There is no map, and it is the other game's map
! THERE IS NO MAP! AND IT IS THE OTHER GAME'S MAP!

The game ships no dungeon and saves none. Every question about a square — whether there is a wall
between here and there, whether this is where a ladder stands — is answered by pushing the column,
the row, the floor and the dungeon number through one piece of arithmetic and taking a remainder.
The same question always gets the same answer, so any floor of any dungeon can be drawn from four
numbers.

That piece of arithmetic is, instruction for instruction, the one Dungeons of the Unforgiven uses.
The two games share a dungeon generator and feed it different numbers: 18 wall patterns instead of
25, a floor 80 by 110 instead of 80 by 104, a ladder on one square in 31 instead of one in 27, and
31,000 dungeons instead of five modules.

They very nearly share the patterns too. Those live in a file — `DUNG.BIN` here, `UNFDUNG.BIN`
there — and both are exactly 12,800 bytes, 25 records of 512, with 11,229 of those bytes the same
byte at the same place in both. Eleven of the 25 records are identical end to end. Moraff's World
reads from record 1 and uses eighteen of them; the other game starts at record 0 and uses all 25.
A good half of the two games' corridors are drawn from the same hand-drawn tiles, and what makes
the dungeons different is mostly the numbers going into the hash.

In the code: [myrand](source:c/myrand), [wall_side](source:c/wall_side),
[load_dung_bin](source:c/load_dung_bin), [side](source:ts/mwmap.js/side) and
[bundledMwTileset](source:ts/mw-dungeon.ts/bundledMwTileset).

### Every trap door to a floor drops you on the same square
! EVERY TRAP DOOR TO A FLOOR DROPS YOU ON THE VERY SAME SQUARE!

The landing square is not rolled fresh. The game seeds the C library's generator with the fixed
number 10, asks it for `random(60) + 10` and `random(90) + 10`, and if that square is rock it
tries seed 11, then 12, and so on until one is not.

Since the seeds are fixed, so is the answer. Every trap door in the dungeon that leads to floor 90
puts you on the same square of floor 90, every single time, whichever door you opened and however
many times you use it.

In the code: [the landing](source:c/FUN_2000_a6fa) and
[trapdoorDest](source:ts/mwmap.js/trapdoorDest).

### Three trap door keys nobody can find, for doors that do not exist
! THREE KEYS NOBODY CAN FIND, FOR DOORS THAT ARE NOT THERE!

A trap door is labelled with the floor it leads to and wants the key with that number. The keys
drop from level drainers, and the key you get is for your own floor's group of ten. Twenty flags
are set aside for them.

The floor test that hands one over stops at floor 178, so the keys labelled 180, 190 and 200 can
never be found. It does not matter: the destination is `myrand(...) * 10` and is thrown away
unless it lands between 10 and 179, so no trap door in the game is ever labelled higher than 170
either. Three keys nobody can find, for three doors nobody can meet.

In the code: [monster_killed](source:c/monster_killed),
[trapdoor_target](source:c/trapdoor_target) and
[trapdoor](source:ts/mwmap.js/trapdoor).

### A secret door is a wall on the map and nothing else
! A SECRET DOOR HIDES ONLY FROM THE MAP! WALK STRAIGHT THROUGH!

The two bits that describe a side of a square have four values: wall, door, secret door, open. Only
a wall stops you. A door and a secret door are both walked through without a word.

The whole of the difference is what the automap draws. A door gets the wall's own full line and
then two short bars laid across it and a mark in the middle; a secret door gets the line and
nothing else, which is exactly what a wall gets. So a secret door is not locked, not hidden by a
roll, and not searched for. It is a wall on the map that is not a wall, and walking at it is the
only way to find out.

"You cannot fight through a door", above, is what the four values do to a fight.

In the code: [wall_side](source:c/wall_side), [draw_map_square](source:c/draw_map_square) and
[side](source:ts/mwmap.js/side).

### Changing dungeon throws the map you have explored away
! CHANGE DUNGEON AND EVERY STEP YOU MAPPED IS FORGOTTEN!

Your explored squares are kept in `.DUN` files, one per save slot per block of 32 floors, and they
are a bitmap of where you have been and nothing else — no walls, no monsters, no items. Nothing in
one says which dungeon it belongs to, and nothing needs to: leaving the overworld for a dungeon
whose number is not the one you came out of deletes all eight of the slot's files and blanks the
32 maps in memory.

So the map only survives a trip to the surface if you go back down the same hole. There is no
warning, and the eight `unlink` calls are the same eight a death without a raise dead contract
makes.

Inside those files is a smaller oddity: the bitmap that says which rows are present is built by a
loop that tests its own counter rather than the map, so every row is always marked present. A
`.DUN` file is always `4 + floors * 1116` bytes whether you have seen anything on those rows or
not.

In the code: [save_dun](source:c/save_dun), [load_dun](source:c/load_dun) and
[enter_level](source:c/enter_level).

### The overworld is a picture somebody typed
! THE WHOLE OVERWORLD WAS TYPED OUT BY HAND! SPACES AND O'S AND P'S!

`WORLDMAP.BIN` is 4,096 bytes, a 64 by 64 grid of one byte per region, and it holds exactly three
values: a space, a capital `O` and a capital `P`. They are turned into heights for the landscape
drawing — -20 for a space, 14 for an `O`, 28 for a `P` — so the whole overworld of Moraff's World
is a text picture of sea, hills and mountains, and printing the file 64 columns wide draws it.

In the code: [load_worldmap_bin](source:c/load_worldmap_bin) and
[the world map](source:c/FUN_3000_8235).

### The dungeon number is arithmetic, and it can come out negative
! THE DUNGEON YOU GET IS ARITHMETIC! IT CAN COME OUT NEGATIVE!

Leaving the overworld computes `(cx * cy * cx) / (|cy| + 1) % 31000` from the region you are
standing on and then adds one until that dungeon's surface has a square to come back out through.
It is done in 16-bit integers, so the product wraps, and the numbers you can actually reach run
from about -3,204 to 3,528 — the 31,000 is a modulus that never bites.

A new character starts in dungeon 0 and stands in a region that would give 58, so the starting
dungeon is not a place on the map at all. It is the one the roller writes.

A negative number leaks into the monsters as well. A floor's monsters lean towards a group, and
the group is `(dungeon + 6) % 9`, which comes out negative for a negative dungeon; the drift loop
that would clamp it only runs while a coin flip keeps coming up heads, so half the time it does
not run. The roller then reads the monster table from before its own start. Nothing in front of
the table has ever bracketed a floor the game can reach, so the draw is rejected and rolled again
— it costs a few rolls and nothing else.

In the code: [the world map](source:c/FUN_3000_8235), [surface_feature](source:c/surface_feature),
[surface](source:ts/mwmap.js/surface) and
[floorGroup](source:ts/monsters.ts/floorGroup).

## Town and money

### Seven kinds of money, and only one of them buys anything
! SEVEN KINDS OF MONEY! ONLY ONE OF THEM BUYS A THING!

The record keeps eight counters: jewels in your pocket, jewels in the bank, and piles of copper,
silver, ivory, gold, platinum and jewel stones. The store, the temple, the inn and the boat all
take pocket jewels and none of them will look at a stone.

The bank is the only exchange and it is one way. 200 copper stones make a jewel, 12 silver, 4
ivory, 2 gold; a platinum stone is worth five jewels and a jewel stone one. Nothing turns jewels
back into stones, and the net worth the stats screen prints is pocket plus bank, with the stones
left out of it entirely.

The exchange destroys what does not divide. Each kind is divided by its own rate on its own, the
quotient rounded towards zero, and then all six counters are set to zero whatever the quotient
was: 199 copper stones convert to nothing and are gone. So converting small piles often is
strictly worse than hoarding and converting once. Only four of the six divide at all, since a
platinum stone is worth five jewels and a jewel stone one, so the worst a single visit can burn is
199/200 plus 11/12 plus 3/4 plus a half: a little over three jewels.

In the code: [bank](source:c/bank), [financial_statement](source:c/financial_statement) and
[view_stats](source:c/view_stats).

### The store wants you to have more than the price
! THE STORE WANTS MORE THAN THE PRICE! BRING ONE JEWEL EXTRA!

The test the store makes is `price < money`, not `price <= money`. A stick costs one jewel and
cannot be bought with one jewel in your pocket; you need two. Every price in the shop is really
one jewel higher than the menu says.

The temple, next door, takes exactly what you have and says `SORRY, CAN'T BUY ON CREDIT HERE.`
only when the price is genuinely above your money.

In the code: [store](source:c/store) and [the temple](source:c/FUN_2000_3085).

### The two best things in the game are priced and never sold
! THE TWO FINEST THINGS IN THE GAME HAVE PRICES AND NO SHELF!

The store's tables have seven rows apiece and both menus stop at six. The rows nobody can reach
are the great sword at 9,900 jewels and the titanium suit at 60,000 — the biggest damage die of
any real weapon and the best armour class in the game.

Both can still be found on a kill. They were meant to be bought, and in the game that shipped they
can only be taken off a corpse.

In the code: [store](source:c/store), [WEAPONS](source:ts/monsters.ts/WEAPONS) and
[ARMOUR](source:ts/monsters.ts/ARMOUR).

### A night at the inn heals nothing
! A NIGHT AT THE FLEA BAG INN HEALS NOT ONE HIT POINT!

Ten jewels at the Flea Bag Inn buys back every spell point you have spent, clears every spell
still running — taking back the strength and agility the preparation spells lent you — and hands
over every level your experience has earned since your last stay, all at once.

It does not restore a single hit point. Nothing in the inn touches your health at all: the cures
are the temple's business, and the temple charges for them.

The night is also eight hours added, in seconds, to a 32-bit counter that is not the age field and
that nothing in the game ever reads.

In the code: [inn](source:c/inn), [level_from_experience](source:c/level_from_experience) and
[the level-up](source:c/FUN_3000_e5f5).

### Your money slows you down
! YOUR FORTUNE WEIGHS YOU DOWN! THE MONSTERS GET FREE TURNS!

Every step costs `(100 + what you are carrying - 10 times your agility) / 100 + 1` moves, and
those moves are what buy an adjacent monster its turns. The weight counts your body, your armour,
your weapons — and your coins, at a pound for every sixteen metal stones.

The step only pays it half the time. A coin flip stands in front of the whole business of spending
time, so one step in two costs nothing at all however much you are carrying, and the weight is
worth half of what the arithmetic says.

A character who has been hoarding copper for the exchange rate is walking around slower and being
hit more for it, and the little mouse will eventually notice and tell them to find a bank.

In the code: [recompute_weight](source:c/recompute_weight),
[the step cost](source:c/FUN_2000_9cb8) and [the mouse](source:c/FUN_3000_9383).

## Bugs the game has

### An enchanted suit of armour protects no better than a plain one
! YOUR ENCHANTED ARMOUR LOOKS MAGNIFICENT ON THE INVENTORY SCREEN!

The permanent plus on the armour you are wearing appears nowhere in the sum that decides whether a
monster hits you. Only the suit's own armour class is subtracted, along with the temporary Enchant
Armor bonus, which is a different field.

So the plus is printed on your sheet, and acid destroys it, and that is the whole of what it does.
The weapon's plus, in the same position on the other side of the fight, is added properly. This is
the same bug, in the same place, that Dungeons of the Unforgiven has.

Two more things in the same sum do nothing for a different reason. Your swing adds a byte at
record offset `0x7c7` and a monster's attack subtracts it again; a monster's attack also
subtracts a byte at `0xdd`. Neither byte is written anywhere in the executable — not by the
roller, not by a spell, not by a find. The other game counts a lucky charm in one of those places
and a shield in the other.

In the code: [monster_turn](source:c/monster_turn) and [strike](source:c/strike).

### Escaping the drop menu reads a byte that is not a count
! NEVER PRESS ESCAPE AT THE ARMOUR LIST!! YOU HAVE BEEN WARNED!

Pressing Escape at the list of armour slots hands the drop branch a -1. It subtracts one and uses
the answer as an index, which lands on an unlabelled byte in front of the eight armour counts
rather than on one of them. That byte is zero in every save there has ever been, so the branch
decides you own no such suit and does nothing. The cancel you expect is a bug that happens to
behave.

The branch itself does two separate things: if you own any of the suit it takes one away, and if
you are wearing that suit and now own none of it, it puts you back in your skin. The two tests are
not connected, so a slot that already held nothing still strips you.

The money branch of the same menu is short a line. It offers copper, silver, ivory, gold and
platinum; there are six piles of stones, and the sixth — the jewel stones, which the bank pays
out one for one — is not on it, nor are the jewels in your pocket. You can throw away the copper
you were carrying for weight, and you can never put down anything that matters.

In the code: [drop_item](source:c/drop_item).

### The dig gives up after however many floors were on the stack
! THE DIG GOES DOWN AS FAR AS IT FEELS LIKE! NO TWO ARE ALIKE!

Digging a hole in the floor searches downwards for the first floor whose square under you is not
rock, turning round at floor 124 and again at floor 1, and gives up after a set number of tries by
rescuing you onto any open square it can find.

The counter it compares against is never initialised. How many floors a hole tries before the
rescue is whatever happened to be on the stack at that moment, which makes it one of the few
things in the game that genuinely differs from run to run for no reason at all.

Before any of that, the dig enters the floor it is already standing on. That floor is in the front
slot of the three-floor monster cache and the entering code only recognises the second and third,
so it treats it as somewhere new: all three slots rotate, the oldest is thrown away, and the floor
you have not left yet is stocked with 145 fresh monsters. The floor is then in the cache twice,
under one number, with two different sets of monsters.

In the code: [dig_hole](source:c/dig_hole) and
[generate_section](source:c/generate_section).

### The EXP NEEDED screen is one level out
! THE EXP NEEDED SCREEN IS ONE LEVEL OUT! COUNT IT YOURSELF!

The E key lists what the next several levels will cost. It labels each line with your level plus
one, plus two, and so on, and works the number out for your level plus none, plus one, and so on.

So a level 3 character reads `4)` beside the experience that level 3 wanted — which they already
have — and every figure on the screen belongs to the line above it.

In the code: [experience_for_level](source:c/experience_for_level) and
[experience_needed](source:c/experience_needed).

### Three of the fourteen lessons say nothing at all
! THE LITTLE MOUSE HAS FOURTEEN LESSONS! THREE OF THEM ARE SILENT!

A character below their third level gets a lesson from a little mouse now and then, taken in turn
from a list of fourteen. The routine that prints them has a case for the first eleven and nothing
whatever for the last three.

Those three cases are bare breaks, so nothing at all is drawn: whatever panel was on the screen
stays where it is and the counter moves on. Three steps in fourteen do nothing, and the eleven
real lessons come round in a cycle three slots longer than they need to be.

The fourth lesson, when it does arrive, says `LEFT IS EAST, RIGHT IS WEST`.

In the code: [the lessons](source:c/FUN_3000_8b27) and [the mouse](source:c/FUN_3000_9383).

### The design screen asks for a key it does not read
! THE DESIGN SCREEN LISTS SIX KEYS! ONE OF THEM IS DECORATION!

Designing your own character takes four points off each of the six characteristics and gives you
twenty-four to put back where you like. The screen lists the keys: S, I, W, C, D or L, for
strength, intelligence, wisdom, constitution, agility or luck. The key the code compares against
for agility is A.

The line underneath says AGILITY in the right place, so it is the letter in the prompt that is
wrong. Pressing D does nothing at all, and the screen looks frozen until you guess A. Dungeons of
the Unforgiven's design screen has the identical mistake, letter for letter.

In the code: [designYourOwn](source:ts/character.ts/designYourOwn) and
[roll_char](source:c/roll_char).

### A priest cannot even read about a wizard spell
! YOUR PRIEST MAY NOT EVEN READ ABOUT A WIZARD SPELL!

The spell screen's first menu has eight lines: four to cast with and four that print the
`SPELLS.HLP` description instead. The gate that decides which categories your class may use covers
all eight.

So a priest opening their own spell book cannot look up what a wizard spell does, only cast one
they do not have. The grid behind a help line reads the same four arrays as the casting one as
well, so a spell you do not hold cannot be read about either — the only way to find out what a
spell does is to own it.

The write-scroll menus lose a line of their own. The third of them copies `SELECT ONE OF THE
ABOVE` into the sixth line of its box and then runs the loop that clears the last three, which
clears the line it has just written; and it never clears the fifth line, so the level menu's
`HIT 0 FOR 10'TH LEVEL` is still sitting under the three spells you are choosing between.

In the code: [spell_screen](source:c/spell_screen), [cast_spell](source:c/cast_spell) and
[mwCanCast](source:ts/spells.ts/mwCanCast).

### The teleport stone always lands on the same square
! THE STONE OF TELEPORTATION ALWAYS PUTS YOU ON THE SAME SQUARE!

The stone of teleportation puts you back in the town on the first open square its search finds —
except that the two loops it searches with never stop early. Every open square inside the border
overwrites the one before it, so what you get is the last square searched rather than the first.

It is the same square every time, for every character, in every dungeon whose town has an open
square there.

In the code: [use_magic_item](source:c/use_magic_item).

## Trivia and history

### The file called V, and the same five sums as the other game
! THE GAME OPENS A FILE CALLED V AND ADDS IT UP FIVE WAYS!

The first thing the game does is open a file called `V`, print it on the screen, and add up every
byte in it in five different ways. The five sums have to come to exactly 1, 367, 4, 44,844 and
174. If any one of them is off, a flag is set and the game exits a few calls later, before it ever
shows you the character list.

Dungeons of the Unforgiven does the same thing with the same five numbers, which means the same
file, unchanged, two games apart. And neither of them checks that the file opened at all.

In the code: [check_v_file](source:c/check_v_file).

### The Flea Bag Inn is the other game's Flea Bag Inn
! THE FLEA BAG INN STANDS IN BOTH GAMES, SIGN AND ALL!

Moraff's World has one inn. Its sign reads `WELCOME TO THE FLEA BAG INN`, `A WOODEN SIGN READS:`,
and then the warning to check the bed carefully before lying down and that the management is not
responsible for your possessions.

Dungeons of the Unforgiven has five inns, one per module, and the third of them is the Flea Bag
Inn — with a wooden sign, and the same eight lines. Two of them differ. The fourth names the price
here and promises to make you comfortable there, and the third is the word `ACCOMODATIONS`, which
Moraff's World spells with one M and the other game with two.

In the code: [inn](source:c/inn) and [load_h_bin](source:c/load_h_bin).

### One message nobody can be shown
! ONE MESSAGE IS WRITTEN AND NOBODY CAN EVER BE SHOWN IT!

`H.BIN` holds everything the game says in an eight-line box: the eight quest bosses' warnings in
verse, the little mouse's advice, the town greeting, what the poison and the disease say when they
bite, the magic items, the wishes, and both endings of a death. Thirty-five records, and every one
of them is asked for by number from somewhere in the code.

Except record 28, which says you are near the bottom level of the beginner's version, that
descending further may abruptly complete the game, and that the advanced version can be had by
ringing (800) VGA-GAME. It is the shareware nag, still sitting in the advanced version's own data
file, and nothing anywhere calls for it.

In the code: [load_h_bin](source:c/load_h_bin) and [the arrival greeting](source:c/FUN_2000_248e).

### Insert the game disk
! INSERT THE GAME DISK IN THE DISKETTE DRIVE AND HIT A KEY!

Before the character list the game looks for a file in the current directory, and if it is not
there it puts up a box: insert the game disk in the diskette drive and hit any key, and note that
you can only have one character per game disk on 360K drives.

It then waits in a loop, and the loop watches the keyboard and nothing else. Any key retries the
open, Escape quits, and with a mouse attached the right button quits and the left retries. Nothing
in it looks at the drive, so a disk swapped in while the box is up does nothing until you press
something. It has a whole `H.BIN` record of its own to say `THAT IS NOT THE GAME DISK`. Ten save
slots are numbered files 0 to 9 in the game directory, 2,344 bytes each; the one-character rule is
the floppy's, not the game's.

In the code: [game_disk_prompt](source:c/game_disk_prompt) and
[save_player](source:c/save_player).

### The walls change colour every eleven floors, and the monsters barely notice
! THE WALLS TAKE A NEW COLOUR EVERY ELEVEN FLOORS!

The palette is rebuilt from scratch whenever you enter a floor. Entries 1 to 15 are the same
fifteen colours every time — dark blue through to white, the fifteen the coloured balls are named
after. Entries 16 to 31 are one of eleven wall colour sets, picked by the floor number modulo 11,
and entries 48 to 63 one of seven gradients, picked modulo 7.

The monster pictures use pixel values 1 to 18 and almost nothing else, so of the whole wall set
only entry 18 is ever reached, and it is nearly black in all eleven sets. The dungeon's colour
changes every floor; the monsters standing in it hardly notice.

There is one exception in the whole file. Zeus has nine pixels of value 24, which is another wall
entry and a much brighter one, so those nine pixels are the only thing in any monster picture that
changes colour as you go down.

In the code: [set_palette](source:c/set_palette) and [draw_picture](source:c/draw_picture).

### Four routines that ship and never run
! THERE ARE FOUR ROUTINES IN HERE THAT HAVE NEVER ONCE RUN!

Nothing in the executable calls `random_walk`, which steps up or down while a roll on three keeps
succeeding; or `random_run`, which counts consecutive coin flips won; or `roll_dice`, which is a
proper "roll n dice of d" and sums them. Every damage roll in the shipped game is one die per 40
points of margin, so none of the three was ever used.

Neither is `seeded_pick`, which is an older version of the dungeon hash written as a chain of
reseeds instead of as arithmetic. Dungeons of the Unforgiven carries the same four dead routines,
in the same shapes.

In the code: [random_walk](source:c/random_walk), [random_run](source:c/random_run),
[roll_dice](source:c/roll_dice) and [seeded_pick](source:c/seeded_pick).

### Almost every random number is a reading of the clock
! ALMOST EVERY ROLL IN THIS GAME IS A GLANCE AT THE CLOCK!

There are three ways of getting a random number and two of them reseed constantly. `random_n`,
which drives the monster's to-hit roll, the finds after a kill, every battle spell and the mouse's
advice, reseeds on every single call from a running sum of BIOS tick readings. Your swing reseeds
from the raw tick counter and takes the next number straight out. The monster's attack seeds from
the tick counter plus 100 and then throws that away by calling `random_n`. The stocking has a
fourth habit of its own: it reseeds from the clock plus a running counter before each of the 145
monsters it places, and rolls the square out of that. The trap door landing reseeds from the fixed
number 10.

The one genuinely random thing is anything that rolls twice without a reseed in between: the
damage dice within a single swing, and the depth wander inside the stocking.

That is also why the 145 monsters of a floor come out in diagonal stripes rather than scattered —
consecutive seeds give answers that lie on a line, and the stocking reseeds before each one.

In the code: [random_n](source:c/random_n), [strike](source:c/strike) and
[generate_section](source:c/generate_section).

### The second class is spelled two ways
! THE SECOND CLASS IS SPELLED TWO WAYS! BOTH ARE OFFICIAL!

`ROLL.TXT`, which is where the class descriptions on the character creation screen come from,
calls the second class a WORSHIPER. The table of class names inside the executable, which is what
every other screen in the game prints, calls it a WORSHIPPER.

Whichever you picked, the character sheet disagrees with the menu you picked it from.

In the code: [MW_CLASS_NAMES](source:ts/character.ts/MW_CLASS_NAMES) and
[roll_char](source:c/roll_char).
