<!--
  How to add a tidbit
  -------------------
  Put a `### Some title` under one of the `## Section` headings, then a `! ` line straight under
  the title with the banner on it, then write a paragraph or two.

  The banner is the line shown above the title in the game's own font and in one of the colours
  its help screens use. Write it the way Steve Moraff wrote his: shouting, in capitals, at the
  reader. It has to be the very next line after the `###`, with no blank line between, or it is
  read as an ordinary paragraph.

  Blank lines separate paragraphs, a line starting `- ` is a list item, `backticks` make inline
  code and **stars** make bold. Every paragraph has to sit under a `###`; anything written
  between a `##` and the first `###` under it is dropped.

  Links are ordinary Markdown, `[text](https://example.com/)`. Three link forms point inside
  this app instead of at the web:

      [text](source:ts/magic.ts/writeScrollOrWand)   a function of the TypeScript port
      [text](source:c/write_scroll_or_wand)          a function of the decompiled game
      [text](formula:spell-cost)                     an entry of the Formulas tab

  The file names come from the Source tab and the ids from src/lib/formulas/formulas.ts; a
  test checks that every link in this file still points at something.

  That is the whole of the Markdown this file understands. Nothing else is a heading, and a
  link to anything but an http address is shown as plain text.
-->

## Exploits and shortcuts

### A priest can write wizard scrolls, and a wizard priest ones
! YOUR PRIEST CAN WRITE WIZARD SCROLLS!! NOBODY IS STOPPING YOU!

Write Scroll and Enchant Wand ask three questions in a row: which spell book, which level, and
which of the three spells on that line. The first menu draws the book your class cannot cast as
a row of dashes and gives it no mouse hot-spot, so it reads as switched off. It is not. The
keyboard is still listening, and typing the number for the other book writes the scroll or
charges the wand without a word of complaint.

That matters more than it sounds. A priest has no real damage spell until very deep, and a
wizard has no cure at all; a wand holds five charges of whatever you put in it and does not care
whose list the spell came from. Fighters can do it too, off a menu that on the face of it offers
them nothing.

In the code: [writeScrollOrWand](source:ts/magic.ts/writeScrollOrWand) and
[write_scroll_or_wand](source:c/write_scroll_or_wand).

### Swing on the beat
! THERE ARE GOOD MOMENTS TO SWING AND BAD ONES!

Your to-hit roll is not random. Every swing reseeds the random number generator from the PC's
tick counter and then takes the very first number out of it, and the generator answers
consecutive seeds with numbers that climb steadily rather than jumping about. The result is a
sawtooth: the roll walks up from 0 to 79 at about 0.85 per tick and wraps round every 5.2
seconds of real time, over and over, for as long as the game is running.

So there are good moments to attack and bad ones, on a five-second cycle, and nothing on screen
tells you which is which. Only the first roll of the swing follows the clock; the damage dice
after it move fast enough to look random.

In the code: [strike](source:ts/combat.ts/strike), [strike](source:c/strike) and
[your swing](formula:strike). Borland's generator is a plain
[linear congruential generator](https://en.wikipedia.org/wiki/Linear_congruential_generator),
which is why consecutive seeds give answers that lie on a straight line.

### Keep your best weapon in hand under a Power Weapon
! NEVER PUT DOWN YOUR BEST WEAPON FOR A SPELL!

A Power Weapon spell replaces the damage die and nothing else. The to-hit bonus, the permanent
plus and the swing speed all still come from whatever is actually in your hand, so casting Power
Weapon with a knife out throws away the Great Sword's bonus for no reason at all.

The die you get is also a row better than the spell's name suggests. The game looks it up eight
rows past the power weapon level it just wrote, and row eight is already POWER WEAPON 1, so
Power Weapon I swings the 129-point die of Power Weapon 2 and Power Weapon III swings the
399-point die of Power Weapon 4, which no spell was ever meant to reach.

In the code: [strike](source:ts/combat.ts/strike) and
[powerWeapon](source:ts/magic.ts/powerWeapon).

### Permanent spells are free off a scroll
! PERMANENT MAGIC FOR NOTHING!! JUST READ THE SCROLL!

Casting a permanent spell out of your spell book takes its level off your maximum spell points
for good. That is the price of the improvement, and it is the reason nobody casts the deep ones.
Cast the very same spell off a scroll, a wand or a spell paper and the game does not charge you:
the deduction is made by the caster, only for a spell cast from memory, and the improvement
lands either way.

Writing the scroll is itself a permanent spell and costs its own level, but the deepest Write
Scroll is level 4 and it will write a scroll of anything up to level 10. Extra 25 Health Points
costs 9 maximum spell points from the book and 4 through a scroll, every time.

In the code: [permanentList](source:ts/magic.ts/permanentList) and
[what casting costs](formula:spell-cost).

### Sleep is the one spell a Shadow boss cannot refuse
! EVEN A SECTION BOSS MUST SLEEP!!

A Shadow boss stops Go Away, Autokill, Drain Monster, Hold Monster and the hand grenades, and
prints its taunt instead. That is the whole list. Sleep never asks whether the monster is a boss,
so it works, and a sleeping boss does not swing at you.

The odds are the same as against anything else: certain against a monster of level 3 or below,
and three chances in its level after that. Against a boss with several thousand hit points, a
spell that buys you free swings is worth more than a spell that does damage.

In the code: [sleepMonster](source:ts/magic.ts/sleepMonster),
[bossImmuneCheck](source:ts/magic.ts/bossImmuneCheck),
[boss_immune_check](source:c/boss_immune_check) and [Sleep](formula:sleep).

### Two strength spells run at once
! STACK BOTH STRENGTH SPELLS! PLUS FIFTEEN AND NOT A WORD OF COMPLAINT!

The preparation Strength gives +5 and Super Strength gives +10, and they are kept in two
different fields, so both can be up at the same time for +15 until you next rest. Neither
refuses because the other is running; each only refuses when its own field already holds its own
number.

In the code: [prepStrength](source:ts/magic.ts/prepStrength) and
[superStrength](source:ts/magic.ts/superStrength).

## Combat

### A big swing rolls the damage die several times
! ONE MIGHTY SWING ROLLS THE DICE AGAIN AND AGAIN!

The to-hit roll is not pass or fail. Everything you bring to the swing is added up, the
monster's level and its armour and speed are taken off, and then the game rolls your weapon's
damage die once for every full 40 points the total sits above 40. A total of 200 rolls the die
four times. That is why a character who has outgrown a floor kills in one blow: it is the same
swing, cashed several times over.

The monster hitting back works the same way, on a threshold of 32 with 40 coming off each time.

In the code: [strike](source:ts/combat.ts/strike), [defend](source:ts/combat.ts/defend),
[how often a swing connects](formula:hit-chance) and
[what goes into your to-hit total](formula:to-hit-total).

### The damage cap is a cliff, not a ceiling
! HIT TOO HARD AND THE DUNGEON TAKES IT ALL BACK!

Near the end of the monster's attack there is a line that looks like a cap on four times the
floor number. What it actually writes is the floor number. A hit that comes to four times the
floor gets through untouched; a hit one point bigger is cut all the way down to the floor number.

On floor 90 that is the difference between taking 360 and taking 90. The biggest hits in the
game are the ones you barely feel.

It only applies while the floor is deeper than your character level. The line sits inside the
block that adds the deep-floor rolls, so a character who has caught up with the floor is never
near it, and it is not the last word either: after it come the cap of 3 on a level-0 character,
the halving under level 3, and the breath weapon, which throws the number away and rolls its own.

In the code: [defend](source:ts/combat.ts/defend) and
[the monster hitting back](formula:defend).

### One monster attack in four is thrown away
! ONE MONSTER SWING IN FOUR NEVER LANDS! LUCKY YOU!

After the dice are rolled, one attack in four discards the whole total and replaces it with a
small roll based on the floor. That roll can come out zero, so a monster that landed a solid hit
does nothing at all a quarter of the time on shallow floors.

In the code: [defend](source:ts/combat.ts/defend).

### Poison and disease are a clock, not a condition
! POISON IS A CLOCK, NOT A WOUND! IT TICKS FOR 450 MOVES!

Being poisoned does not take hit points. It sets a counter to 450 moves, and every 450 moves
after that it takes a point of strength; disease does the same to constitution. Neither can take
you below 1, so they never kill you, they only grind you down.

Resist Poison and Resist Disease do not cure anything either. They stop the counter running
while they are up, and it carries on from where it was when they lapse. The temple and the cure
spells are the only things that clear it.

In the code: [poison and disease](formula:poison-disease) and
[drainsAndAilments in defend](source:c/defend).

### A life drainer always takes 30 experience
! THE DRAINER NAMES ONE NUMBER AND TAKES ANOTHER! ALWAYS 30!

When an experience drainer hits you the message names a number out of the monster's own record.
The subtraction uses a constant of 30 instead. Every experience drainer in the game happens to
carry -30, so the two agree, by luck rather than by design.

Monsters that drain whole levels are a different matter: they take the levels, write your
experience back down to exactly what the level below is worth, and take back the hit points and
spell points that level gave you.

In the code: [defend](source:ts/combat.ts/defend), [goDownLevel](source:ts/combat.ts/goDownLevel)
and [what the next level costs](formula:exp-needed).

### Acid breath eats the armour you are wearing
! ACID EATS YOUR ARMOUR RIGHT OFF YOUR BACK!!

Acid is the only attack in the game that takes something away. It does its damage, sets the
permanent plus on the suit you have on to zero, removes one of that suit from what you own, and
leaves you standing in your skin. Anti-Fire and Anti-Cold halve their kinds of breath; there is
no anti-acid.

In the code: [defend](source:ts/combat.ts/defend) and [breath](formula:breath).

## Magic

### Fast Move and Invisibility are two rolls, not one
! TWO SPELLS, TWO CHANCES TO SKIP THE MONSTERS ENTIRELY!

Neither spell does anything to you. Each gives the moment a one-in-four chance of ending before
the monsters have moved: the game rolls, and on a 1 nothing steps and nothing attacks. They are
two separate rolls with two separate returns, so running both is better than running either. A
moment survives both only nine times in sixteen.

The two sit either side of the poison and disease countdown. Fast Move's roll comes first, so a
quarter of the moments it eats are moments the ailment clock does not tick either. Invisibility's
comes after, and pauses nothing.

Invisibility has a second job that no description mentions. When a monster first engages you the
game rolls for who acts first, and one time in three the monster simply does. With Invisibility up
that is not the end of it: a roll on one and a half times the floor number, and if it beats your
character level the monster is put back to waiting on your agility instead. Deep in the dungeon it
nearly always beats it.

In the code: [passMoment](source:ts/moment.ts/passMoment) and
[attackTiming](source:ts/combat.ts/attackTiming).

### Youth costs you a tenth of everything
! YOUTH IS NOT FREE! IT QUIETLY EATS A TENTH OF YOUR EXPERIENCE!

Youth sets your age back to 20, which matters because the game ages you and old characters lose
statistics. The price is not printed anywhere: it multiplies your experience by 0.9, and that is
the whole of the spell. Cast on a deep floor it is a fortune.

Your level does not move. Nothing in the game ever takes a level off you for having too little
experience; the only thing that reads the number is the check at the inn for whether you have
earned the next one. So the cost is not a level lost, it is a level put further away.

In the code: [youth](source:ts/magic.ts/youth) and
[what the next level costs](formula:exp-needed).

### Drain Monster kills pay level-0 experience
! DRAIN MONSTER EMPTIES THEM OUT AND PAYS YOU NOTHING FOR IT!

Drain Monster takes your wisdom off the monster's level, and a monster whose level is below your
wisdom is emptied outright: level 0, no hit points, dead. The trouble is that the experience a
kill pays is worked out from the monster's level after the draining, so what you get is what a
level-0 monster is worth: six times the monster's own multiplier, which for the ordinary run of
them is between 6 and 30. A level 60 monster with an ordinary multiplier would have paid over a
million; drained, it pays 6.

The spell also prints nothing at all when it works, which is why it feels like a dud.

In the code: [drainMonster](source:ts/magic.ts/drainMonster),
[drain_monster](source:c/drain_monster) and [what a kill is worth](formula:exp-value).

### Ascend works two floors deeper than it admits
! ASCEND GOES DEEPER THAN IT PROMISES! TWO WHOLE FLOORS!

The three Ascend spells refuse to work deep in the dungeon, and the message says they do not
work below floor 64. The test is deeper than that: it asks whether the floor is over 65, so
floor 65 still works and floor 66 is the first one that does not.

In the code: [ascend](source:ts/magic.ts/ascend) and
[majorAscend](source:ts/magic.ts/majorAscend).

### Feather leaves your gear behind
! FEATHER FORGETS YOUR BODY AND REMEMBERS EVERY SUIT YOU OWN!

Feather sets your own body weight to zero and stops there. Everything you own is then added back
on: every suit of armour, every weapon, whether or not you are using it. A well equipped
character is carrying most of their weight in gear, so the spell that is supposed to make you
light barely moves the number.

Note the "own", not "carry". Selling the spare weapons in your pack speeds you up as much as the
spell does.

In the code: [computeWeight](source:ts/magic.ts/computeWeight),
[compute_weight](source:c/compute_weight) and [how long a step takes](formula:move-seconds).

### The permanent enchantments set the plus, they do not add to it
! NEVER ENCHANT A FINE WEAPON WITH A CHEAP SPELL!!

Enchant Weapon writes its plus over whatever the weapon already had. Casting the level 1 version,
worth +1, on a weapon already carrying +4 takes it back down to +1. The same goes for Enchant
Armor. Cast the deepest one you have and never a shallower one afterwards.

The Shadow bosses' rewards write the same number, so the +101 the Great Shadow Ogeroth puts on a
weapon is one permanent Enchant Weapon away from being +5 again. The preparation-list Enchant
Weapon and Enchant Armor are safe. They keep their plus in a slot of their own, wiped when the
spell wears off, and they never touch the item's own number. On a weapon that slot is added on top
of the weapon's own plus when you swing. On armour it stands alone, because the sum that decides
whether a monster hits you never reads the armour's own plus at all.

In the code: [enchantWeaponPerm](source:ts/magic.ts/enchantWeaponPerm),
[enchantArmorPerm](source:ts/magic.ts/enchantArmorPerm),
[setTempWeaponPlus](source:ts/magic.ts/setTempWeaponPlus) and [strike](source:ts/combat.ts/strike).

### Fast Big Cure has a hidden 20
! FAST BIG CURE HIDES A BONUS 20! IT CAN NEVER BE WASTED!

Fast Big Cure heals a roll on four times your wisdom and then adds 20, capped at 90. The 20 is
in no description anywhere. It means the spell can never be a waste: even the worst roll gives
20 hit points back, where its slower cousin Big Cure starts from 50 and caps at 150.

In the code: [fastBigCure](source:ts/magic.ts/fastBigCure), [bigCure](source:ts/magic.ts/bigCure)
and [what the cures heal](formula:cures).

### Go Away never fails
! GO AWAY NEVER FAILS! NOT ONCE, NOT EVER!

The help text for Go Away talks about the monster's level against yours. There is no such test
anywhere in the spell. Against anything except a Shadow boss it works every single time, which
makes it the cheapest way out of a fight you cannot win.

In the code: [goAway](source:ts/magic.ts/goAway) and [go_away](source:c/go_away).

### Major Descend works on the bottom floor
! MAJOR DESCEND WILL TAKE YOU OFF THE BOTTOM OF THE WORLD!

Descend refuses to go deeper than the bottom of the module. Major Descend's version of the same
test is one number out, so on the bottom floor it goes through, and the ten-floor drop is then
clamped back to the floor you are already on. The spell reports success, spends its points and
drops you on a random open square of the same floor. It is a Relocate that costs more.

In the code: [majorDescend](source:ts/magic.ts/majorDescend) and
[descend](source:ts/magic.ts/descend).

### The resistances are absolute while they last
! RESIST POISON IS NOT A CHANCE! IT IS A PROMISE!

Resist Poison, Resist Disease and Resist Level Drain are not chances. While the timer is running
the poisoning, the disease and the drain do not happen at all, with no roll anywhere, and the
matching breath weapon does half damage. There is no level or depth at which they start to leak.

Each cast adds 60 moves to the timer rather than replacing it, so casting one again while it is
up is not wasted.

In the code: [resistPoison](source:ts/magic.ts/resistPoison),
[resistDrain](source:ts/magic.ts/resistDrain) and [defend](source:ts/combat.ts/defend).

### Pass Wall can find nowhere, and that one is free
! PASS WALL SOMETIMES COSTS YOU NOTHING AT ALL!

Pass Wall looks 2 to 19 squares along the direction you chose and takes the first square that is
on the map, is not rock and has no monster standing on it. If there is no such square it does
nothing, and it costs you nothing either. Spell points, and scroll, wand and paper charges, are
taken only after the effect reports that it worked, so Pass Wall pointed at the edge of the map,
or cancelled at the direction menu, is free. The spells that do charge you for failing are the
ones that acted and then lost a roll, like Autokill.

In the code: [passWall](source:ts/magic.ts/passWall), [pass_wall](source:c/pass_wall) and
[cast_a_spell](source:c/cast_a_spell).

## Monsters

### Everything more than a few steps away is standing still
! THE MONSTERS ONLY WAKE UP WHEN YOU GET CLOSE!

A monster only moves if the two axes' distances add to less than `floor / 10 + 10`, and even then
only four times in five. That is nine squares on floor 1 and nineteen on floor 100, and it is
measured straight across the grid, through any wall in the way, so a monster on the far side of a
partition counts as close. Anything further away stands exactly where it was placed, for as long
as the floor stays in memory.

When it does move it takes one step toward you, trying the x-axis first, left or right depending
on which side of it you are on, and only if that step is blocked does it try the step up or down.
It never steps away and never goes around anything, so it closes the horizontal gap first and the
vertical one afterwards. Doors and secret doors do not stop it; only solid rock does. A monster
already level with you whose sideways step is walled off has nothing left to try, and stands
there forever.

In the code: [pass_moment](source:c/pass_moment).

### Every monster you kill becomes the same garbage can
! EVERY MONSTER YOU SLAY BECOMES A GIANT GARBAGE CAN!!

A dead monster is not removed. Its slot is rewritten in place as a Giant Garbage Can, type 0,
level 0, no hit points at all, and moved to x 100, y 100, off the side of an 80-wide floor. The
square it died on is cleared.

But the occupancy grid is 80 by 110 kept as one run of bytes, indexed `y * 80 + x` with no range
check, and two routines rebuild the whole grid from the monster list: resuming a saved game, and
stepping back onto the floor you just left. A dead monster lands at byte 8100, which reads back as
the square x 20, y 101. Every corpse on the floor piles onto that one square.

The game kills whatever you are facing the moment its hit points drop below one, so a can with
none dies before you swing. It pays 18 experience every time, on every floor, and still rolls all
seven drops. Two of them scale with the floor, the money and the "you find" item. The weapon and
the armour do not scale with anything: the slot is emptied before the drops are rolled and both
of those roll against the level of the monster in the slot, which is now zero, so every kill in
the game rolls them at the odds of a level-0 monster.

A puffball is the same thing without the fight: it does not hit, it moves one of your statistics
up or down, and then it runs exactly this code on itself.

In the code: [kill_monster](source:c/kill_monster), [puffball in defend](source:c/defend),
[the grid](source:c/set_monster_map) and [what a kill is worth](formula:exp-value).

### The monsters are laid out in diagonal stripes
! THE MONSTERS LINE UP IN STRIPES! LEARN THEM AND HUNT THEM!

A floor's 145 monsters are placed one after another, and the generator is reseeded from the tick
counter before each one. Consecutive seeds give answers that lie on a line, so from one monster
to the next the column tends to rise by about 2 and the row to fall by about 2. A freshly
stocked floor holds its monsters in parallel diagonal lines.

Because everything outside your bubble never moves, those stripes survive as long as the floor
is cached. It is also why the layout of a floor depends only on what the clock read when it was
stocked, and why two floors stocked moments apart can look identical.

In the code: [stockFloor](source:ts/stocking.ts/stockFloor) and
[the 145 monsters on a floor](formula:stocking).

### The last three sections double their boss
! THE LAST THREE BOSSES ARE TWICE THE MONSTER! BEWARE!!

A Shadow boss already gets 20 extra hit points for each level of the floor it guards, on top of
a normal monster's roll. In
sections 18, 19 and 20 the whole total is then doubled, after the bonus rather than before it.
That is the wall the Module V bosses put up, and it is not your imagination.

In the code: [rollHp](source:ts/roll.ts/rollHp) and
[why a Shadow boss takes so long](formula:boss-hp).

### Beat the bosses in order, or a reward takes one back
! KILL THE BOSSES IN ORDER, OR YOUR REWARD IS A PUNISHMENT!

Killing a section's Shadow boss pays a fixed reward, and ten of the twenty are written into a
number rather than added to it. The fourth boss of Module I sets a suit of armour you own to +25
and the fourth of Module IV sets one to +50. The fourth boss of Module II sets a weapon to +25 and
the Great Shadow Ogeroth at the end of Module V sets one to +101. Module II's first three bosses
set the Body Armor level, the gauntlets and the Ring of Protection to 9, 12 and 15, and Module
IV's first three set the same three to 25, 50 and 50.

Take them in order and every one is a step up. Take Module IV's bosses before Module II's and the
25, 50 and 50 become 9, 12 and 15. The armour and weapon rewards ask which item to put the plus
on and will not go on until you name one you own, so a character with a spare weapon or suit can
park the weaker reward on that. A monk, who owns nothing but skin and a fist, gets no such choice:
the +50 skin from Module IV is +25 skin the moment Module I's last boss dies.

In the code: [kill_monster](source:c/kill_monster).

### The garbage cans float
! THE GARBAGE CANS FLOAT ON THE WATER! WHAT A SIGHT!

In the three water sections the built-in monsters are drawn 140 rows tall instead of 200, and
the water overlay is drawn over the bottom of the picture. The cans and puffballs are not
hovering; their feet are underneath the water.

### The Shadow bosses are holes in the shape of another monster
! A SHADOW BOSS WEARS ANOTHER MONSTER'S FACE!!

Every Shadow boss shares its picture with the first regular monster of its section. Shadow
Ogeroth is the Ogeroth, Shadow Vulture is the Vulture Of Death, Shadow Evil God is Zeus. What
differs by the tint colour alone is the picture. The two records are not the same at all: every
Shadow boss carries special 100, type 5 and an experience multiplier of 16 where the regular
monster has its own, and several of them drop the regular's level drain, stat drain or breath
weapon on the way.

The boss's tint is exactly the value the picture drawer reads as "do not draw this pixel", so a
Shadow boss is not a dark version of the monster. It is that monster with every tinted pixel
missing and the corridor showing through the gaps. All twenty of them work this way, ten by
having a tint that matches their colour set and ten by having no tint at all.

In the code: [scale_image2](source:c/scale_image2) and
[which monster turns up](formula:monster-kind).

### The last boss's reward is the only one not in a text file
! THE FINAL REWARD IS WRITTEN NOWHERE BUT IN THE GAME ITSELF!

Killing a section's Shadow boss prints what you have won and points you at the next one. The
nineteenth of them, for the boss on floor 75, ends `NOW FIND THE SHADOW OGEROTH ON LEVEL 100. IT
IS UNBELIEVABLY POWERFUL...`

That is where the run stops. `UH.BIN` carries nineteen reward messages for twenty sections, and
the twentieth boss has none in any of the three text files. The three screens the Shadow Ogeroth
gets are string constants inside the executable, handed straight to the printer: the body turning
into a tiny cat that scurries away promising to be back, the Mighty Orb of Explosive Weapon
Enhancement that puts +101 on a weapon of your choosing, and the invitation to go on wandering or
to start again with a different character.

Every other boss in the game can be given something else to say by editing a text file. The last
one cannot.

In the code: [kill_monster](source:c/kill_monster) and [allHints](source:ts/hints.ts/allHints).

## Map and travel

### There is no map, anywhere
! THERE IS NO MAP! THE DUNGEON IS BUILT FRESH UNDER YOUR FEET!

The game ships no dungeon and saves none. Every question about a square, from whether there is a
wall between here and there to whether this is where a ladder stands, is answered by pushing the
column, the row, the floor and the module through one piece of arithmetic and taking a
remainder. The same question always gets the same answer, so floor 12 of Module I is laid out
identically in your game, in a stranger's game and in the 1993 screenshots.

Walls come from 25 stamped patterns, and a pattern is 32 squares by 32. A sixteen-by-sixteen
block of the floor takes whichever quarter of one the parity of its column and row picks out, so
a whole floor is 25 patterns rearranged four ways each, which is why corridors feel repetitive
without ever quite repeating. A square is rock exactly when all four of its sides came out as
walls, which leaves about two fifths of a floor open: 40 per cent on average, and between 29 and
47 depending on the floor.

In the code: [myrand](source:ts/unfmap.js/myrand), [myrand](source:c/myrand),
[why every dungeon is the same](formula:map-hash) and
[walls, doors and secret doors](formula:map-sides).

### Every trap door on a floor drops you on the same square
! EVERY TRAP DOOR ON A FLOOR DROPS YOU ON THE VERY SAME SQUARE!

The landing square is not rolled fresh. The game seeds the generator with 10, asks for
`random(60) + 10` and `random(90) + 10`, and if that square is solid it tries seed 11, then 12,
and so on. Since the seeds are fixed, so is the answer, and the same handful of squares comes up
again and again: column 17, row 93 on 109 of the game's 325 floors, column 18, row 93 on 87 more,
and column 18, row 92 and column 16, row 94 between them on most of what is left.

In the code: [where a trap door lands you](formula:trap-door-landing) and
[trap doors and the floors they reach](formula:trap-doors).

### Ladders and chutes are just more arithmetic
! THE LADDERS ARE NOT PLACED! THEY ARE CALCULATED!

A ladder stands on roughly one square in 27 and a chute on five in `230 - floor / 3`, both
answered by the same hash that draws the walls. Nothing is stored, nothing is placed; the game
simply asks the square whether it is a ladder each time it draws it.

In the code: [ladders up and down](formula:ladders) and [chutes](formula:chutes).

### Module II's town is Module I's town with the buildings moved
! THE SECOND TOWN IS THE FIRST TOWN WITH THE SIGNS SWAPPED!

Walk into the second module's town and the streets are the ones you already know: every wall,
every door and every secret door across the whole floor stands where it does in the first
module's town. What moved is the buildings. Module I's town holds 60 stores, 50 temples, 42 banks
and 51 inns, Module II's holds 51, 54, 55 and 39, and 402 of the squares you can walk on hold
something different in one town than in the other. The ladders down moved too, since a town's
ladders depend on the floors underneath it, and those are ordinary dungeon floors with nothing in
common.

On the town floor the only part of the hash that knows which module you are in comes to
`7 * 13 * (module + 15)` plus the remainder of `13 * 27` over `module + 15`, counting the modules
from zero: 1,371 for Module I and 1,471 for Module II, exactly 100 apart. Walls take one of 25
patterns per sixteen-by-sixteen block, and 100 is a multiple of 25, so every block of the two
towns draws the same pattern. Buildings take a remainder of 60 from the same hash, and 100 is not
a multiple of 60, so the shops land elsewhere.

Modules III and V are paired the other way about. Their numbers are 180 apart, which 60 divides
and 25 does not, so those two towns have every store, temple, bank and inn on the same square and
not one block that draws the same wall pattern. That is not the same as having no wall in common:
25 patterns is a small deck, and two thirds of the wall sides still come out the same in both,
with three fifths of the squares agreeing on whether they are rock. What is gone is the
block-for-block match. No other pair of towns shares either.

In the code: [myrand](source:ts/unfmap.js/myrand),
[why every dungeon is the same](formula:map-hash) and
[where the buildings are](formula:town-buildings).

### Seventeen floors are dealt the same walls twice
! SEVENTEEN FLOORS ARE DEALT THE VERY SAME WALLS TWICE!

The wall pattern of every sixteen-by-sixteen block is a remainder of 25 taken from the hash, and
the module enters the hash through two terms that do not depend on the block. On a floor where
those terms come out, for two modules, to numbers a multiple of 25 apart, every block draws the
same pattern in both, and the two floors are identical wall for wall over the whole area the game
shows. It happens seventeen times over fifteen floor numbers, since floors 8 and 22 are each dealt
twice to different pairs, and twice in three modules at once:

- Modules I and II: the towns. Modules I, II and V: floor 3. Modules I and III: floors 10 and 22.
- Modules II and V: floor 8. Modules II, IV and V: floor 13. Modules II and III: floors 15 and 43.
  Modules II and IV: floor 16.
- Modules III and IV: floors 2 and 8. Modules III and V: floors 7, 33 and 53.
- Modules IV and V: floors 22, 47 and 56.

Everything laid on top of the walls, the ladders, chutes, trap doors and town buildings, is rolled
from other remainders and differs between them. The map explorer says so under the floor's name
and links across.

In the code: [TWIN_FLOORS](source:ts/twins.ts/TWIN_FLOORS), [myrand](source:ts/unfmap.js/myrand)
and [why every dungeon is the same](formula:map-hash).

## Town and money

### Two kills in the same second pay exactly the same
! KILL TWO IN ONE SECOND AND THEY PAY YOU TWICE THE SAME!

The money a kill drops is generated after reseeding from the wall clock, which only ticks once a
second. Kill two monsters inside the same second and both hand you the same number of dollars,
to the dollar, however different the monsters were.

In the code: [rollMoney](source:ts/dotu-mech.js/rollMoney), [drop_money](source:c/drop_money)
and [the money a kill pays](formula:money).

### The two best items in the game are priced and never sold
! THE TWO FINEST ITEMS IN THE GAME HAVE PRICES AND NO SHELF!

The store tables carry a price for the Great Sword, 9,900, and for the Titanium suit, 60,000.
Neither is on any menu: the shop's keys stop at 6, one short of both. They were meant to be
bought, and in the game that shipped they can only be found.

In the code: [what drops when you kill something](formula:drop-odds).

### Helping children is the only discount in town
! HELP THE CHILDREN AND THE MERCHANTS REMEMBER YOU KINDLY!

Each needy child you have helped at the temple, at 100 rubles a time, gives one per cent back on
culture stock and magic crystals, and the refund stops at half the price. Fifty children is the
whole discount; the fifty-first buys nothing. Weapons and armour are never discounted at all.

The inn gives a different discount from the same count: every child takes your character level
off the bill. That is worth having early and worth nothing later, because the room price grows
with the fourth power of your level and the discount only grows with the level itself.

In the code: [the discount for helping children](formula:store-refund),
[a night at the inn](formula:inn-cost) and [what the temple charges](formula:temple).

### Nobody starts with anything in the bank
! YOUR SECOND FORTUNE IS NOT MONEY! IT IS CRYSTALS AND STOCK!

Every class but the fighter gets a second roll of starting wealth at the end of character
creation, twice your luck plus a roll on five times it. It is not money. It goes into the magic
crystal count, and crystals are what the inn burns to give spell points back, one crystal for one
point, so a caster whose luck came out in the twenties can start with a hundred-odd spell points'
worth of refills. A fighter, who has no spell points to buy back, is given neither the roll nor
the crystals.

The bank balance is a field of its own two places earlier in the same record, at 0x458 where the
crystals are at 0x46c, and nothing in the roller ever writes it. Every character in the game, on
either difficulty, walks into town with an empty account.

In the code: [rollChar](source:ts/character.ts/rollChar),
[the price of a magic crystal](formula:crystal-price) and
[what a night at the inn does to you](formula:inn-night).

### Five inns, and the sign is the only difference
! A NIGHT IN OUR HORRIBLE HOTEL MIGHT NOT KILL YOU!

Every module has its own inn. Module I has the HELL HOLE INN, whose tin sign explains that A
NIGHT IN OUR HORRIBLE HOTEL MIGHT NOT KILL YOU. PLEASE KEEP VALUABLES IN BED WITH YOU. After it
come the SLACKER HOTEL on paper, the FLEA BAG INN on wood and the MOTEL 6.5 on plastic, and
Module V has the MORAFF INN on a golden sign, where IF YOU HAVE ANY PROBLEMS, LET US KNOW AND THE
MAINTAINANCE DIRECTOR WILL BE PUT TO DEATH.

The sign is the whole of the difference. The price of the room, the year it takes off you and the
spell points it buys back all come from your level and the children you have helped, and the only
thing the inn asks the module for is which of the five signs to hang up.

In the code: [innSignHint](source:ts/hints.ts/innSignHint),
[what a night at the inn costs](formula:inn-cost) and
[what a night at the inn does to you](formula:inn-night).

## Bugs the game has

### The lucky charm nothing gives you
! THE LUCKY CHARM IS READY AND WAITING! NOBODY WILL GIVE YOU ONE!

A lucky charm is read on every swing you make and every attack made on you, and adds its count
straight to the roll. Nothing in the game hands one out. The field sits in the save file being
read, for ever, at zero.

In the code: [strike](source:ts/combat.ts/strike) and [defend](source:ts/combat.ts/defend).

### The monster cache forgets which dungeon you are in
! THE MONSTERS FOLLOW YOU BETWEEN MODULES! WE CALL IT ATMOSPHERE!

The game keeps three floors' worth of monsters in memory at a time, filed by floor number alone
with no note of which module they came from. Walk floor 5 of Module I and then floor 5 of Module
II in the same session and it can hand you the first one's monsters.

That includes the boss. A floor whose monsters came from somewhere else has no boss standing on
the square the save file says the boss is on.

### GO EAST, for ever
! GO EAST! GO EAST! GO EAST! KEEP GOING EAST!!

The homing message points at the square the save file remembers the section's boss on. If the
boss is not actually there, and the cache above is one way to arrange that, the message keeps
pointing at an empty square and never changes. The manual's advice for this is real: `FIX`
deletes every `.MAP` file and runs `f_bug.exe`, which puts the special monster back.

### Go Away can drop a monster inside solid rock
! GO AWAY PUTS THEM SOMEWHERE ELSE! SOMETIMES INSIDE A WALL!

Go Away rolls a new square for the monster and then checks whether it is solid before accepting
it. It checks the wrong square: it asks about the square **you** are standing on, not the one the
monster just landed on. You are never standing in rock, so the check always passes on the first
roll, and the monster can end up sealed inside a wall where nothing can ever reach it.

In the code: [goAway](source:ts/magic.ts/goAway) and [go_away](source:c/go_away).

### Priest Protection is Minor Protection again
! THE PRIEST'S PROTECTION IS EVERY BIT AS GOOD AS THE CHEAP ONE!

The priest's level 5 Protection asks for protection level 1, which is what the level 1 Minor
Protection asks for. Both take 2 off a monster's attack roll. The wizard's Protection, on the
same level, asks for level 2 and takes off 8.

So the priest's protection goes 2, then 2 again, then straight to Major Protection's 18 three
levels later, and casting the level 5 spell over the level 1 one buys nothing at all.

In the code: [priestBattle](source:ts/magic.ts/priestBattle),
[protection](source:ts/magic.ts/protection) and
[what protection is worth](formula:protection).

### The anti-magic ring does nothing
! THE ANTI-MAGIC RING IS ON YOUR SHEET FOR ALL TO ADMIRE!

The Anti-Magic Ring is bought with four permanent spells, stored in the save file, shown on your
character sheet, and refused by the spell when you already have a better one. No line anywhere in
the game ever reads the field back. It protects against nothing at all.

The spell levels give it away as unfinished: the ring goes 1, 2, 3 and then straight to 5, with
no level 4 anywhere in the list.

In the code: [setAntiMagicRing](source:ts/magic.ts/setAntiMagicRing) and
[permanentList](source:ts/magic.ts/permanentList).

### An enchanted suit of armour protects no better than a plain one
! YOUR ENCHANTED ARMOUR LOOKS MAGNIFICENT ON THE CHARACTER SHEET!

The permanent plus on the armour you are wearing appears nowhere in the sum that decides whether
a monster hits you. It is printed on your sheet, and acid destroys it, and that is the whole of
what it does. The temporary Enchant Armor preparation writes a different field, and that one is
subtracted properly.

In the code: [defend](source:ts/combat.ts/defend) and
[setTempArmorPlus](source:ts/magic.ts/setTempArmorPlus).

### Escaping the enchantment menu cancels the spell by accident
! NEVER PRESS ESCAPE AT THE WEAPON LIST!! YOU HAVE BEEN WARNED!

Pressing escape at the weapon list of Enchant Weapon hands the spell back -1. It subtracts one
and uses the answer as an index, which lands on an unlabelled byte of the save record instead of
on a weapon. That byte is zero in every save there has ever been, so the spell decides you own no
such weapon and stops. The cancel you expect is a bug that happens to behave.

In the code: [enchantWeaponPerm](source:ts/magic.ts/enchantWeaponPerm).

### Monsters are stocked into rows nothing can reach
! THERE ARE MONSTERS IN ROWS NO ADVENTURER WILL EVER WALK!

The dungeon generator fills a grid 80 columns by 110 rows. The game only ever draws and walks 79
columns by 104 rows. Column 79 and rows 104 to 109 are real, hold real open squares, and the
stocking routine drops monsters into them quite happily, where nothing can reach them and they
can never reach you. The map explorer counts how many of a floor's 145 went there.

In the code: [MAP_ROWS](source:ts/area.ts/MAP_ROWS),
[beyondMapCount](source:ts/stocking.ts/beyondMapCount) and
[the part of a floor you can reach](formula:map-area).

### Every character starts at level 0
! EVERY HERO BEGINS AT LEVEL 0! EVEN THE MIGHTY ONES!

Character creation wipes all 2,695 bytes of the record to zero before it rolls anything, and
nothing in the roller ever writes the level back. Whatever race and class you pick, you leave the
screen at level 0 with no experience. That is not only a number on the sheet: your to-hit total
counts your level twice, so the first level you earn is worth two points on every swing you will
ever make.

Levels are handed out at the inn and nowhere else, so you stay at level 0 until you have earned
99 experience and paid for a room, or 126 experience on "I can handle anything". Until then you
are the cheapest customer in town, because the room and the culture stock a stay eats are both
worked out from your level: ten rubles for the night and no stock whatsoever.

In the code: [rollChar](source:ts/character.ts/rollChar),
[blankPlayerCharacter](source:ts/character.ts/blankPlayerCharacter) and
[when a level is actually granted](formula:level-for-exp).

### The easy setting's spell point bonus never happens
! NORMAL DIFFICULTY PROMISES EXTRA SPELL POINTS! DO NOT COUNT THEM!

Normal difficulty is meant to buy a character two things at the roll that "I can handle anything"
does not get: 25 extra health points and half again as many spell points. Only the health points
arrive. The line that multiplies the spell points by 1.5 sits above the class table that works the
spell points out, so it runs at a moment when the total is still zero, and it is guarded by a test
that skips it while the total is zero, so it does not even multiply the zero. The class table then
writes the real figure over the top of it.

Two wizards with the same wisdom and intelligence therefore start with exactly the same spell
points whichever difficulty they were rolled on. Everything else the setting buys is real, and
there is more of it than the roll screen says: every swing you take adds your strength a second
time, and 25 more on top if it is over 25; every money drop adds a roll on 7,000 rubles; magic
crystals cost a third off; the starting purse is 500-odd rubles better and can be thousands
better; and the next level always costs 1.4 times the last rather than twice it. The bill for all
that comes at the end, where the teleporter out of Module IV refuses to carry an easy character
into Module V.

In the code: [rollChar](source:ts/character.ts/rollChar) and
[what the next level costs](formula:exp-needed).

### The design screen asks for a key it does not read
! THE DESIGN SCREEN LISTS SIX KEYS! ONE OF THEM IS DECORATION!

Designing your own character takes four points off each of the six characteristics and gives you
twenty-four to put back wherever you like. The screen lists the keys for them: S, I, W, C, D or
L, for strength, intelligence, wisdom, constitution, agility or luck. The key the code compares
against for agility is A.

D is what the menu one screen earlier took for designing a character at all, which is presumably
where it came from. Pressing it here does nothing: an unrecognised key is thrown away and the
game goes back to waiting, so the screen looks frozen until you guess A, or point the mouse at
the line and click instead.

In the code: [designYourOwn](source:ts/character.ts/designYourOwn) and
[roll_char](source:c/roll_char).

### The snake greets you by how deep you have been, not by how good you are
! THE SNAKE JUDGES YOU BY HOW DEEP YOU HAVE BEEN, NOT HOW GOOD!

The greeting for walking into town is picked by the deepest floor you have ever reached, and your
level does not come into it. Below floor 4 it is `'Hail novice adventurer! You are still a wimp!
Keep trying.'`, and it works up through ten of them; from floor 100 the snake has nothing left to
say and the tablet does not come up at all.

The depth it reads is a running maximum, raised to the current floor as you walk. It sits inside
the character record at offset 0x8f9, and the save writes the whole 2,695-byte block, so it goes
to disk and comes back with the character. The only adventurer the snake calls a wimp is one who
has never been below floor 4. A level 1 character who took a chute to floor 40 by accident is
`no longer the weakest player in the world!` for good.

In the code: [townTablet](source:ts/hints.ts/townTablet) and
[FUN_3000_9488](source:c/FUN_3000_9488).

## Trivia and history

### The file called v
! THE GAME OPENS A FILE CALLED V BEFORE IT DOES ANYTHING ELSE!

The very first thing the registered game does is open a file called `v`, print it in yellow as
the note about verifying your registration, and add up every byte in it in five different ways.
The five sums have to come to exactly 1, 367, 4, 44,844 and 174. If any one of them is off, a
flag is set and the game quietly exits a few calls later, before it ever shows you the character
list. Delete `v`, or change so much as a character in it, and the game just stops.

There is no check that the file opened. If `v` is missing altogether the game reads memory
instead, starting at the Borland copyright string, and keeps going until it happens to meet a
`~` byte.

### intro.txt is a joke at your expense
! YOU MAY DELETE INTRO.TXT! CHANGING IT IS UNFORGIVABLE!

The whole of `intro.txt` reads: you can remove this file, but modifying it is an "Unforgivable"
action. It is a wink at the check above, and nothing reads it. The shareware nag screen that
tells you to delete it is still compiled into the registered game, and nothing calls that
either.

### A message hidden from the hex editor
! A MESSAGE HIDDEN FROM PRYING EYES, PUT BACK TOGETHER AS YOU QUIT!

The quit screen prints PLEASE DO NOT DISTRIBUTE THIS GAME. That sentence appears nowhere in the
file. It is stored as three scrambled fragments and put back together at run time by adding 2 to
every character and turning backticks into spaces, so a `strings` dump never sees it and neither
does anyone hunting for something to patch. It is a
[Caesar shift](https://en.wikipedia.org/wiki/Caesar_cipher) of 2, and it is the only string in
the game treated that way.

### The launcher's secret handshake
! THE LAUNCHER KNOWS A SECRET WORD! THE GAME WILL NOT START WITHOUT IT!

`UNFORGIV.EXE` is not the game. It is a video mode picker, and it starts the real game with the
arguments `~ T <mode> <chipset>`. `UNF.EXE` checks that the first argument is `~` and otherwise
prints "Type `UNFORGIV' to start this game" and quits. The second argument decides whether the
mouse is looked for at all, the digit is the resolution and the last number is the SVGA chipset
for the three highest modes.

### The walls are painted by a routine of their own
! THE WALLS HAVE A PAINTER ALL TO THEMSELVES!

Wall textures look as though they go through the monster drawer, and they do not. They have a
texture mapper to themselves with its own colour rule, and the routine that calls it writes the
tint before every face: 12 for a plain wall face, and 15, 1 or 0 for the others. Nothing about
the last monster you looked at reaches it.

What the walls do inherit is the section. Their base is a number nothing in the executable ever
writes, so it keeps the 16 it starts at, and a wall is always drawn in palette entries 16 to 31,
which are the section's own wall colours. That is why the same corridor is green stone in
section 1 and red brick in section 6.

### The sign nobody has ever read
! STEP THROUGH THIS TELEPORTER! NO ONE EVER HAS!

Image 2 of every wall picture file is a sign reading STEP THROUGH THIS TELEPORTER. The
teleporters are commented out of the recovered source code, which had people wondering whether
they shipped at all; the sign is proof that they did.

The pictures themselves are a
[run-length code](https://en.wikipedia.org/wiki/Run-length_encoding) with a 201-entry row table
and 5-bit colours, and the monster file starts with the two ladder pictures before any monster.

In the code: [where the teleporters are](formula:teleporter-sides) and
[where a teleporter drops you](formula:teleporter-landing).

### The .uhp files are the help screens, not the hints
! THE UHP FILES ARE SMARTY'S HELP SCREENS, NOT HIS HINTS!

`0.uhp` through `29.uhp` in the game folder read like the snake's material, and they are not it.
They are the F1 help screens, and the game opens one every time you ask for help: the menu the
snake called Smarty puts up turns the key you pressed into a topic number, and the reader builds
the name `<n>.uhp` and prints the file a character at a time. A letter of `rgbynow` in the text
is a colour code rather than a character, taken out and used to colour the line it sits in, which
makes them the only one of the three files that comes in more than one colour.

What the snake actually says is in `UH.BIN`, 138 messages of eight lines. What the stone tablet
says is in `UH2.BIN`, 86 of four: the town greetings, the congratulations for a level, the
bosses' taunts.

In the code: [readHelpScreen](source:ts/hints.ts/readHelpScreen),
[giveHint](source:ts/hints.ts/giveHint) and [tabletMessage](source:ts/hints.ts/tabletMessage).

### The help screen with no key to press
! ONE HELP SCREEN HAS NO KEY! IT IS WAITING THERE STILL!

The F1 menu is twenty-eight lines in two columns, and between them they open twenty-eight of the
twenty-nine `.uhp` files in the game folder. The one nothing opens is `18.uhp`, and it is the
options help: the same text as `16.uhp`, which the O line opens, laid out as one long page
instead of two with HIT ANY KEY TO CONTINUE in the middle.

The numbering has a hole in it as well. The files run 0 to 18 and then 20 to 29. There is no
`19.uhp`, and nothing goes looking for one.

In the code: [HELP_TOPICS](source:ts/hints.ts/HELP_TOPICS) and
[HELP_FILES](source:ts/hints.ts/HELP_FILES).

### Five messages nobody can be shown
! FIVE MESSAGES ARE WRITTEN AND NOBODY CAN EVER BE SHOWN THEM!

Every message in `UH.BIN` and `UH2.BIN` is asked for by number from somewhere in the game, except
five.

`UH.BIN` 30 announces an arrival: YOU SENSE THE APPROACH OF A NEW UNIVERSE THAT SEEMS TO BUZZ
WITH POWER. The teleporter that carries a character from one module to the next ended up with two
other messages, and this one was left where it was.

Three more are the sales pitch. While a character is under level 3 the game's random-events tick
puts up a tutorial tablet now and then, one of fourteen cases of a switch, and the last three
cases are written out with nothing in them: PLEASE REGISTER THIS GAME, MODULES 2,3,4, AND 5 ARE
NOW AVAILABLE! and the one about the monsters waiting in them. The registered game carries all
three and can never print any of them.

The fifth is TRY NOT TO DIE, IT'S BAD FOR YOUR HEALTH, which is shown when a field that is 56 on
every character ever rolled turns out to be -1.

In the code: [allHints](source:ts/hints.ts/allHints),
[FUN_3000_6b8a](source:c/FUN_3000_6b8a) and
[random_events_tick](source:c/random_events_tick).

### The intro demo has its own dungeon
! THE WANDERING DEMO HERO HAS A DUNGEON OF HIS VERY OWN!

`010.DUN` and `011.DUN` are explored-map files for the character that wanders around during the
attract mode. They are deliberately not valid game maps.

### Room for a game five times the size
! THERE IS ROOM IN HERE FOR A GAME FIVE TIMES THE SIZE!!

The game is full of tables built for content that never arrived. The spell arrays reserve 15
levels per book where only 10 exist. The boss position table has room for 8 sections per module
and uses 4. The trap door key list runs to floor 179 where the game stops at 105. The
monster-level formula has a special case for depths no module can reach. The monster record even
has a "worth no experience at all" case that no monster uses.

### Code that ships and never runs
! THERE IS CODE IN THIS GAME THAT HAS NEVER ONCE RUN!

An older version of the dungeon hash is still in the file, written as a chain of reseeds rather
than as arithmetic, and nothing calls it. So are three dice helpers: a proper "roll N dice of M"
function, a bounded random walk, and one that counts coin flips until tails. Every damage roll
in the shipped game is one die per 40 points, so none of the three was ever used. There is also
an older picture loader, an older map-square drawer and two large drawing routines with no
callers.

### Almost every random number is a reading of the clock
! ALMOST EVERY ROLL IN THIS GAME IS A GLANCE AT THE CLOCK!

The game has three ways of getting a random number and two of them reseed constantly. `Random`,
which drives the find-item roll, the spell book and scroll and wand rolls, Sleep, Autokill, Go
Away, relocation and the explosion damage, reseeds itself on every single call from a running
sum of clock readings. Combat reseeds from the raw tick counter. The trap door landing reseeds
from the fixed number 10.

The one genuinely random thing in the game is anything that rolls twice without a reseed in
between: the level nudges inside stocking after the first monster, and the damage dice within a
single swing.

In the code: [Random](source:c/Random) and [the port's own generator](source:ts/rng.ts/random).

### Your sex is rolled, and nothing ever reads it
! THE GAME ROLLS YOUR SEX AND THEN NEVER THINKS OF IT AGAIN!

The roller asks six questions and rolls everything else. Sex is one of the rolled things, a coin
flip taken in the same breath as the age, the height and the weight and printed underneath them.
You are never asked, and designing your own character does not offer it either, so the only way
to get the one you wanted is to reject the roll and roll a whole new character, six fresh
characteristics and all.

The field is written there and read in exactly two places afterwards, both of which put a word on
a screen: the roll screen itself and the character sheet. No spell, monster, shopkeeper or price
anywhere in the game looks at it.

In the code: [rollCharacteristics](source:ts/character.ts/rollCharacteristics) and
[showRolledCharacter](source:ts/character.ts/showRolledCharacter).

### The race table you choose from is wrong in two rows
! THE RACE TABLE IS AVERAGES, NOT PROMISES! TWO ROWS ARE WRONG!

The race screen is a page of `UROLL.TXT` printed as it stands, and its numbers are averages
rather than the table the game rolls from. The roll starts each characteristic at the race's own
figure and then hands out sixty points one at a time to whichever of the six a d6 picks, so on
average a race gets ten of everything on top of its figure. Six of the eight rows match the
executable exactly. Two do not.

The humanoid's row reads 14 in all six columns where the game rolls around 15, so the plainest
race in the game is a point better than advertised at everything. The bigger gap is the midget's
intelligence, printed as 18 where the game rolls around 25. That is the characteristic a wizard
and a mage count double when their starting spell points are worked out, and the midget already
has the highest total of any race on the menu; the file makes it look like a luck specialist and
it is a caster.

In the code: [rollCharacteristics](source:ts/character.ts/rollCharacteristics) and
[rollChar](source:ts/character.ts/rollChar).

### The contest the menu will not let you enter
! ONE HUNDRED DOLLARS TO THE FIRST IN THE WORLD!! THE MENU SAYS NO!

`UROLL.TXT` describes three difficulties. The third is a contest: play Module I from beginning to
end without ever saving, defeat the Shadow Demon Queen, and the first person in the world to ring
MoraffWare with the code you are given wins a hundred dollars.

The registered game reads the three lines that announce it out of the file and drops them without
printing them, so the menu on screen simply stops after option 2, and the twelve-line page of
contest rules behind it is read and dropped in the same way. The menu does translate a 3 into the
contest answer, and then rejects it for being out of range. Everything behind the menu is
finished: there is a contest flag, the routine that writes a character to disk returns without
doing anything at all while it is set, so the no-saving rule is enforced rather than trusted, and
the character sheet has a line calling you a contestant where an ordinary character is told they
are still alive. And the play loop has a hidden key that sets the flag anyway, right beside one
that hands out ten hit points: byte 251, which is most likely Alt and 251 on the number pad.

The flag lives past the end of the character record, so it is never saved and is clear again on
every launch. While it is set the game writes nothing to disk at all, character creation
included, so a contestant exists only in memory; the one way out is the quit key, which warns
that quitting disqualifies you, clears the flag and only then saves.

And nothing hands out the code. Killing the Shadow Demon Queen with the flag set does exactly
what killing her without it does: the same hint and the same +25 armour enhancement, and the
word CODE appears nowhere in the executable. The contest named the 1993 shareware Module I; the
only build on hand is the registered one from 1996, which drops nothing else from the shareware
version, so a code screen would still be in it if one had ever been written. The whole search is
in `dotu-tools/docs/CONTEST.md`.

In the code: [rollChar](source:ts/character.ts/rollChar), [roll_char](source:c/roll_char) and
[movecontrol](source:c/movecontrol).
