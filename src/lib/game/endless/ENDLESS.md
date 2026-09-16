<!--
  The Endless tab's page. `endless-page.test.ts` holds it to the rules seam: every member of
  GameRules is named there against the section of this page that explains it, so a rule added to
  endless mode fails the suite until this page has somewhere to put it.

  Written for somebody playing. README.md beside it is the same ground written for somebody
  building, and is where the detail lives.
-->

## What endless mode is

### The same game, with no bottom

Dungeons of the Unforgiven stops. Module V bottoms out at floor 105, the Shadow Ogeroth is
standing on floor 100, and once he is dead there is nothing below you. Endless mode carries the
same game on past that, in sections of its own, down to floor 30,000.

Everything you already know still holds. The monsters swing on the same timers, the spells do the
same arithmetic, the shops charge the same prices and the trap doors work the same way. A game of
this is a game of Dungeons of the Unforgiven that does not run out of dungeon.

### How you get one

You choose it once, when you roll the character, and never again. An endless character cannot be
made faithful and a faithful one cannot be made endless.

Where the new floors begin depends on the difficulty you rolled under. A character rolled under
the normal difficulty is turned back at the door of Module V, so its endless floors start below
floor 80 in Module IV; a character rolled under I Care How Awful can go through that door, so its
endless floors start below floor 100 in Module V.

### Everybody is in the same dungeon

A world is one number. Two characters rolled into the same world meet the same monsters on the
same floor, in the same colours, under the same theme — nothing about your character reaches any
of those rolls. The run server hands the number out when you roll, so everybody rolling at the
same time is rolled into the same dungeon and the boards are comparing like with like.

## What is different down there

### Sections past the twentieth

The game counts twenty sections, four to a module, and stops. The endless floors carry the count
on: a new section every twenty floors in Module IV, every twenty-five in Module V, each with its
own Shadow boss standing on its last floor.

A new section borrows one of the game's own twenty to be drawn and described as, because there are
twenty sections' worth of wall pictures and twenty palettes and nothing else to draw a floor with.
So the corridors will look familiar. What is standing in them will not.

### Five monsters you have seen before, in colours you have not

Each new section stands five monsters of its own, drawn from the hundred the game has: a Shadow
boss, three regulars and a level drainer. Each one arrives whole — its breath, its drains, its
special, everything it is worth — but taken out of the section it belongs to and dropped into this
one.

Four of the five are then repainted. The game draws a monster through a colour set, and moving a
monster into a set it is never drawn in changes nearly every pixel of it, so you will meet things
you know in colours you have never seen them in. The Shadow boss keeps the colours he came with:
a Shadow is a monster painted black, and painting him again would only give you the monster back.

Because the five come from all over the game, the words on the S screen are no longer about what
is standing on the floor. The screen says so.

### Sections with a theme

Five sections in eight are ordinary. The other three in eight have something wrong with them, and
the S screen tells you which before you go down:

- Everything down here breathes fire.
- Everything down here breathes ice.
- Level drainers are everywhere.
- Poison and disease are everywhere.
- The monsters here stand two levels up.

A theme changes how often the floor reaches for that kind of monster when it is stocking itself,
and the elite one rolls every monster of the section two levels deeper than the floor it stands
on.

### Shadows that wander

One floor in a hundred below the bottom of the game has a Shadow on it that is not anybody's
section boss — one of the game's twenty, standing where it does not belong, carrying something
worth the trip.

Only one is ever up at a time. While it is alive every other floor's draw is passed over, so
walking away and coming back finds it where you left it; once it is dead the floors above the one
it died on will not stand another.

### Monsters that keep growing

In the game a monster's level is one byte, and the floor stops feeding it: a base level over 220
rolls back round to 1, a nudged level over 210 is put back to 1, and a hit point roll stops at
32,000. No floor of the 1993 dungeon is deep enough to hit any of that.

The endless floors are, so none of it applies. A monster is rolled around the floor it stands on
however deep that is, and it is stocked with the hit points that level really calls for. A monster
on floor 4,000 has millions of them.

### What a kill is worth

The game stops counting a monster's level at 130 when it works out the experience. Endless counts
to 3,407, which is as far as the arithmetic reaches before the number stops being a number at all.
So a deep kill really is worth what it looks like it is worth.

### Trap doors and their keys

A trap door leads to any floor above you and no more than a hundred below, so the deeper you are
the more of the dungeon is above you, and a door is a way back rather than a way on. The ways
further down are the ladders, the chutes and the two Descend spells.

Level drainers go on carrying keys at every depth. The game makes a key rarer the deeper the
floor and hands out none at all from floor 200 down; an endless floor hands one out on the odds of
the deepest floor the module has as the game ships it, so a key stays worth finding all the way
down.

### Autokill stops at floor 200

This is the one thing endless takes away.

Autokill is the only attack in the game that never looks at a monster's hit points. It rolls your
mind against the monster's and, winning, simply declares the monster dead — which is worth exactly
as much against something with a million hit points as against a rat. Its odds do not fall away
either: a monster's level grows with the floor at the same rate the spell's own depth bonus does,
so the roll settles near a coin flip at any great depth and stays there however strong you get.

So past floor 200 it does not work. Cast it deeper and it refuses, says why, and costs you nothing
— no spell points and no time. Floor 200 itself still works. In a faithful game the rule never
comes up, the dungeon bottoming out at 105.

Drain Monster looks like the same thing and is not. It will kill a monster whose level is under
your wisdom outright, but it sets that monster's level to zero on the way, and the experience is
worked out from the level — so it pays almost nothing. It is a way out of a fight, not a way to
grow.

## What the 1993 save cannot hold

### Where your real numbers live

The character record is a 16-bit program's memory written to disk. Most of what it holds is a
signed word, a few things are single bytes, and a character who plays long enough runs off the end
of some of them.

Endless keeps your real hit points, your real maximum, and your real counts of rings of
regeneration, lucky charms, hand grenades, stones of seeing and potions beside the record, and
writes a copy back inside the fields that will hold one. So the file is still a save the 1993 game
would load and make sense of — it just shows you pegged at 32,767 hit points and 127 lucky charms.
Pick the character up here and the real numbers come back.

Two things follow. Editing an endless character in the Save Editor throws away whatever stood
above a field, because a record written back at 32,767 reads as a character who really has 32,767.
And a replay carries the same state from sitting to sitting, so a run verified on the server
arrives at the numbers you actually saw.

### What is still not lifted

The six characteristics and the counts the record keeps in a whole word — potions of healing,
stones of teleportation — are the next fields a very long-lived character could run off the end
of. Nothing catches those yet.
