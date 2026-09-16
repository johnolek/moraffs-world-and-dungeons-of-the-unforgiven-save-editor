# The endless dungeon

Dungeons of the Unforgiven bottoms out at floor 105. The endless dungeon carries the same game on
below that, in sections of its own numbered past the twentieth, until floor 30,000 — which is
deeper than anybody is going to walk, and short of the 32,767 a character can be saved standing
on, since the record keeps the floor in a signed 16-bit word at 0x7b4.

None of this is a departure from the port. Every ported function goes on doing exactly what it
did; a game is handed the tables it looks a floor up in (`GameRules`, `src/lib/game/port/rules.ts`)
and these are another set of answers to the same handful of questions. A faithful game never
builds one, and everything a faithful game asks these rules — every module but the deepest one the
character can reach, and every floor above where that module's own fourth section stops — is
answered by passing the question to `FAITHFUL_RULES`.

## The shape

- **`rules.ts`** — the answers: where the dungeon bottoms out, which section a floor belongs to,
  where a section sits, how far its trap doors lead, the level its monsters are rolled around,
  where the keys and the Shadow bosses of the new sections are kept, and what a kill that deep is
  worth. `endlessRules({ hard, seed })` builds one. `hard` decides which module the new floors are
  in — a character rolled under the normal difficulty is turned back at the door of Module V, so
  its endless floors are Module IV's — and `seed` is the world.
- **`monsters.ts`** — the five monsters a new section stands and the theme it stands them under,
  both drawn from the world's seed and the section number.
- **`shadows.ts`** — the Shadows that wander the floors between the section bosses, and what
  killing a Shadow this deep leaves behind.
- **`state.ts`** — what an endless character carries beside the record: the trap door keys, the
  Shadow boss squares and the Shadow kills of the sections the record has no room for, and the
  Shadow wandering the dungeon now. `src/lib/play/README.md` is where that state is written up,
  since it travels with a run.

## One world

A world is one number. Two characters rolled into the same world meet the same monsters in the
same section, and nothing about the character reaches any of these rolls, so a section is the
same section for everybody playing that world. The run server hands the number out
(`GET /worlds/endless/current`), so that everybody rolling at the same time is rolled into the
same dungeon, and the character keeps it for life. `ENDLESS_WORLD_SEED` in `rules.ts` is world 1,
which is what a roll falls back to when the server cannot be reached.

## Where a trap door leads

Sixteen of the 2400 rolls behind a square put a trap door on it, which is between 10 and 35 doors
on a floor of Module V, and the endless floors keep exactly that test. What they do not keep is
the destination: the game lets the roll name the floor the door leads to, and the roll can never
name one past 11,995, so on a dungeon 30,000 floors deep it would have nothing left to say.

An endless door's destination is drawn from the square instead — the same hash the walls and the
ladders come out of — as a multiple of five from floor 5 down to a hundred floors below the
character (John, 2026-09-15). So a door can lead to any floor above and at most a hundred below,
and never to the five floors the character is already in, which is the one destination the game
itself refuses as well. Every destination is a multiple of five because a trap door key is
labelled with the floor it opens and there is one key to every five floors.

The deeper the floor, the more of the dungeon lies above it, so a door on floor 5,000 almost
always leads back up. The ways further down are the ladders, the chutes and the two Descend
spells.

## What a new section is made of

A section past the twentieth draws three things from a generator started from the world's seed and
its own number (`endlessSection` in `monsters.ts`):

- **A section of the game to be drawn as.** Its walls and its palette are one of the game's own
  twenty, because there are twenty sections' worth of wall files and twenty sections' worth of
  palettes and nothing else to draw a floor with. `sectionSource` is which one.
- **Five monsters of its own**, filling the five rows `load_md_bin` (exe 2000:5fec) fills for a
  section: a Shadow boss in slot 22, three regulars in 23 to 25, and a level drainer in 26. Each
  is one of the hundred monsters the game has, taken out of the slot it fills in its own section,
  so a boss is one of the twenty bosses and a drainer one of the twenty drainers. No two of the
  three regulars are the same monster.
- **A theme**, which is what those five do beyond standing there. "Section themes" below is what
  each one is. It is drawn after the five, so which five a section stands does not depend on the
  theme it drew.

A borrowed monster arrives whole: its type row, its level drain, its stat drain, its breath, its
special and its experience multiplier are the bytes the game gave it, so every piece of arithmetic
the game does on a monster is untouched. What changes is what it looks like — and, in a section
whose theme is one of the two breathing ones, what it breathes. It also keeps its own picture,
which lives in the file of the section it came from — `ufmon<N>.pic` — which is why a monster says
which section's file to read and the picture set of the 3-D view reads that file
(`src/lib/play/view3d/browser.ts`).

The S screen turns a page for each of the five, and a borrowed monster brings its own page with
it: the four lines of MD.BIN the section it came from describes it in, read out of that section's
row rather than out of the row of the section this one is drawn as. Its picture comes from that
section's file the same way, painted in the colour set the stocking gave it. What the screen has
no row for is the section itself, so the line it opens on says which section the reader is
standing in and leaves it at that.

## Section themes

A theme is about the monsters and nothing else (John, MORF-512). None of them touches the walls,
the trap doors or the ladders, and none of them is a change to anything the engine does: each is
written into the rows `monsterKinds` hands back, into the four tests the type roll makes
(`GameRules.monsterTypeOdds`), or into the level a floor rolls its monsters around — all three of
them answers the rules were already giving.

Module IV's last section is the model. Every one of its five monsters breathes fire, which is what
somebody who played that deep remembers about it long after the names have gone.

Three sections in eight are plain, and each of the five themes has one in eight.

| theme | what it does | what the S screen says |
|---|---|---|
| **plain** | nothing at all | — |
| **fire** | all five rows breathe fire | Everything down here breathes fire. |
| **ice** | all five rows breathe ice | Everything down here breathes ice. |
| **drainers** | another of the game's twenty level drainers takes one of the three regular slots, and the type roll reaches for the section's own drainer one time in five rather than one in fifteen. About a third of such a floor takes a level off the character when it hits — and carries that floor's trap door key when it dies. | Level drainers are everywhere. |
| **afflictions** | the type roll reaches for the eight poison and disease monsters one of the rolls left in three rather than one in twelve, which is about a quarter of the floor. What they take — a point of strength or of constitution every 450 moves — stays taken until a temple or a spell puts it right. | Poison and disease are everywhere. |
| **elites** | every monster of the section's floors is rolled two levels deeper than the floor, so all of them have more hit points, are harder to hit and are worth more. Two levels is felt on the shallowest endless floors and swamped by the floor number further down. | The monsters here stand two levels up. |

A breathing theme sets the breath byte of the rows rather than drawing rows that breathe already,
because there is not enough of the game to draw from: of the twenty Shadow bosses one breathes fire
and one breathes ice, and of the sixty regulars five breathe fire and one breathes ice. Every other
byte of a row is the one the game gave it, so a fire section's monsters are the monsters they were,
breathing.

A faithful game has no themes. `monsterTypeOdds` answers the game's own 20, 7, 15 and 12 for each
of the twenty sections and `sectionNote` answers nothing, which is what leaves MD.BIN's own four
lines standing on the S screen.

## Repainting

The game draws a monster's picture through the colour set in its record: `scale_image2` (exe
4000:4818) adds `colorSet << 4` to every pixel value, so the set decides which run of the palette
the monster is drawn out of. Changing it is the whole of the repaint — the picture is the game's
own, drawn by the game's own drawer, in other colours.

The four monsters that are not the boss are each painted in one of the colour sets the game does
not paint them in, drawn from the same generator. The sets to choose from are 0, 1 and 2: those
are the three the game paints its own monsters in, and they are the three whose run of the palette
`set_palette` (exe 4000:12c3) fills. A monster painted in set 3 or 4 would have most of its pixels
in entries 64 to 79, which are black everywhere outside a shop, and would come out as a silhouette.

Nearly every pixel of a repainted monster comes out a different colour — 90 per cent or more of
the ones that are drawn at all. Two side effects are worth knowing about:

- Pixel value 17 is the record's own colour byte rather than a colour of the picture, and a
  monster whose colour byte is 0 draws nothing at all there. Moving a monster into a set that
  reads that byte can therefore punch holes in it. Most pictures barely use the value; the worst
  in the game is the Wind Elemental at a fifth of its pixels.
- The section's palette is the borrowed section's, so a monster is already being drawn in colours
  its own section never gave it before anything is repainted.

**The Shadow boss keeps the colours he came with.** Every boss in the game is the picture of one
of his section's own monsters drawn with its main colour turned black or turned off altogether,
which is what makes him a shadow rather than a second copy of that monster. A set of his own would
paint him back in.

## How a repainted monster reaches the screen

Everything that draws a monster — the 3-D view, the thumbnail on the map, the portrait beside the
screen — looks it up in the catalogue (`src/lib/bestiary/monsters.ts`) by an id. So the repaint is
written into the id: `recolouredId` makes `section-7-25-set1` out of `section-7-25`, and
`monsterById` hands back that monster painted in set 1. Nothing else has to know that the endless
dungeon exists.

The rows the game keeps loaded for a section carry that id (`MonsterKind.id`), which is how the
stocking knows what it has rolled and how the drawing knows what is standing there.

## Wandering Shadows

One floor in a hundred below the bottom of the game has a Shadow wandering it (John, MORF-504):
one of the game's own twenty Shadow bosses, standing on a floor that is nobody's boss floor. Which
floors of a world have one, and which Shadow it is, are drawn from the world's seed and the floor
and from nothing else, so everybody's floor 433 holds the same Shadow and a replay of a run works
the floor out again from the world the log names rather than being told (`shadows.ts`).

It stands where a section's own boss stands: slot 0 of the floor's monster table, in row 22 —
which is what the deepest-Shadow board recognises a Shadow by (`deepestShadowKilled`,
`server/boards.ts`) — rolled at the level the floor rolls its monsters around and with a boss's
hit points, on a square of the middle fifty of each axis. The square is remembered the way a
section boss's is, so coming back to the floor finds it roughly where it was left.

Only one is alive at a time, and that is the character's own business rather than the world's:
while one is standing, every other floor's draw is passed over, and once it is killed only the
floors below the one it fell on can stand another. So the dungeon hands out Shadows at the pace
the character kills them rather than at the pace it falls down trap doors, which is the same
thing the endless record measures — the deepest floor a Shadow was killed on.

The last floor of a section is passed over altogether, since that section's own Shadow boss is
standing on it.

## What a Shadow leaves behind

Killing a Shadow below the bottom of the game — one that wanders, or the boss of an endless
section — hands over what it was carrying, drawn from the world and the floor the same way:

- **Between one and twenty potions**, in one colour or spread over several. The potions are the
  loot worth carrying home: each of the six raises one of the character's characteristics and
  drops another (`src/lib/play/potions.ts`), and a characteristic is what the to-hit total and the
  number of damage dice are counted off, so a pile of them is how much deeper the character can
  go.
- **An orb, from about one Shadow in three**, which puts a plus of 200, 300 or 500 on the weapon
  in hand. The character keeps the better of the plus it had and the plus the orb brings. The
  game's own orbs stop at the plus 101 the Shadow Ogeroth hands over for finishing the twenty
  sections.

Everything in the pile is pushed as a `found` event, so the run journal and the summary count what
a Shadow was worth, and the message box says what fell out of it.

`kill_monster` has a reward written for each of the twenty sections the game has and nothing for a
twenty-first, so a Shadow deeper than that is handed to the rules instead (`GameRules.deepShadows`).
A faithful game has none of them and never reaches it.

An endless section's own Shadow boss is killed for good: the kill goes beside the record with the
keys and the squares, since the record's one byte a module has a bit for each of the module's four
sections and no more.

## The game's limits

Dungeons of the Unforgiven is a 16-bit program, and its character record is a 16-bit program's
memory written to disk. Nearly every number it keeps is a signed word, a few are single bytes, and
two are floating point. A character who goes on playing past the bottom of the game reaches some
of those limits, so this is every one of them: what the game does when a number passes its field,
what the port does, and whether a faithful game keeps it.

The short answer is that **the port almost never reproduces a wrap**. Every number the engine
works on is a plain JavaScript number, so nothing overflows while the game is being played; the
only place a field of the character record bites is `savePlayer`
(`src/lib/game/port/record.ts`), which writes it with `setInt16` and `setInt8`. The monster
limits below are the exception: those the port does keep, because the stocking keeps them. The original wraps the moment the arithmetic happens. That
difference is a faithful gap, and it is written down as one in
`dotu-tools/docs/FAITHFUL-GAPS.md`; it is not something this section fixes.

### The character

| limit | what the game does | what the port does | faithful keeps it |
|---|---|---|---|
| **Hit points and their maximum**, 0x31 and 0x33, signed words | Both live in words in the data segment, so passing 32,767 reads as a negative number, and `movecontrol`'s test at 2000:c474 finds hit points below zero and ends the game. A character who heals past the limit dies of it. | Plain numbers in play, so they grow as far as they like; `savePlayer` wraps them into the two words, and the character comes back from the save dead. | Yes, as it stands: faithful mode wraps on the save rather than on the arithmetic, which is the gap above. **Endless lifts this**: the real numbers go beside the record and the bytes get a copy brought back inside the words. |
| **Spell points and their maximum**, 0x35 and 0x39, 32-bit floats | These are the only two numbers of the record the game keeps as floats. There is no word to overflow; whole numbers stay exact to 16,777,216. | The same float fields, written back by `savePlayer` unchanged. | Yes. There is nothing to lift: a character's maximum grows by at most a few dozen a level and the level count stops at 1000, so spell points are nowhere near where a float loses whole numbers. |
| **Experience**, 0x7a4, a 64-bit float | The one double in the record. `exp_value` (exe 3000:a0fa) is what could make it useless rather than the field: it stops counting a monster's level at 130. | The same double. The cap is a rule (`GameRules.experienceCap`). | Yes. The endless rules already raise the cap to 3407, the level where `5 * 1.23 ** level` stops being a number a double holds. |
| **Experience level**, 0x7ac, a signed word | `gain_level` counts up from zero and gives up at 1000, so the level never approaches the word. | The same loop (`gainLevel`, `src/lib/game/port/levels.ts`). | Yes, and nothing to lift. |
| **The floor and the deepest floor reached**, 0x7b4 and 0x8f9, signed words | The game's own deepest floor is 105, so the word is never close. | The same words. | Yes, and the endless dungeon stays inside it: `ENDLESS_BOTTOM` is 30,000, which is out of anybody's reach and short of the 32,767 a character can be saved standing on. |
| **Rubles in pocket and in the bank**, 0x454 and 0x458, signed 32-bit | Neither has a cap of its own, so both would wrap at 2,147,483,647. | The same. | Yes. An endless character grinding long enough reaches it; nothing here lifts it. |
| **Greater-American Dollars**, 0x470, signed 32-bit | Capped by the game at 2,000,000,000, and one find at 107,000,000 (`drop_money`, exe 4000:6aca). Both are rules somebody chose, not the field. | `DOLLARS_CAP` and `MONEY_FIND_CAP` in `src/lib/game/port/drops.ts`. | Yes. |
| **The six characteristics, potions of healing, stones of teleportation**, signed words | A puffball moves a characteristic by one and a drop adds one item; nothing caps any of them, so 32,768 of anything wraps. | Plain numbers in play, wrapped by the save. | Yes. Out of reach in the game; an endless character could in principle reach it. Not lifted here. |
| **Rings of regeneration, lucky charms, grenades, stones of seeing** (0x7ca to 0x7cd) **and the six potions** (0x15d), signed bytes | A drop adds one and nothing caps them, so the hundred and twenty-eighth reads as -128. | Plain numbers in play, wrapped by the save. | Yes, and this is the *first* limit an endless character meets, well before any word: a Shadow hands over up to twenty potions at a time. **Endless lifts it**, the same way it lifts the hit points — the real counts go beside the record and the bytes get a copy pegged at 127. |
| **The trap door keys** (0x822) and **the Shadow boss squares** (0x855, 0x8a5) | 36 key flags reaching floor 179, and eight squares a module. | Already answered beside the record rather than in it, since the endless dungeon has more floors and more sections than either table holds (`state.ts`). | Yes — the faithful rules read and write the record's own tables. |
| **The beaten-boss flags**, 0x849, one byte a module with four bits used | One bit per section of the module, set by `kill_monster` (exe 3000:b12d) as each boss dies. | The stocking asks the rules whether a section's boss is dead rather than reading the byte itself (`GameRules.bossBeaten`), and the faithful rules read the same bit the game reads. | Yes. **Endless lifts it**: the sections past the twentieth have no bit of their own, so their kills go in the state beside the record and their bosses stay dead. |

The save editor is a separate matter. It bounds every field it offers to the range of the type the
record holds it in (`INT_RANGES`, `src/lib/editor/fields.ts`), which is right for a tool whose job
is handing back files the 1993 game will load, and the endless dungeon does not change it.

### A monster

A monster is never written to a file here: the original keeps a floor's 145 slots in the
character's `?MON.MAP`, and the port has no such file (`src/lib/play/README.md`'s departures). So
a monster's limits are only the ones the stocking imposes, and widening them is a matter of the
numbers alone.

| limit | what the game does | what the port does | faithful keeps it |
|---|---|---|---|
| **Hit points**, the slot's two bytes | `stock_level` (exe 2000:671e) caps a roll at 32,000, and the pair is read back unsigned, so the cap keeps the word out of trouble with room to spare. | `stockedHp` (`src/lib/bestiary/roll.ts`) caps at `GameRules.monsterHpMax`. | Yes: the faithful rules answer 32,000. **Endless lifts it** to the largest whole number a double holds, since the port writes no monster record for the cap to protect. |
| **The stored level**, the slot's sixth byte | The jitter is done on the byte itself, so it counts round at 256; the byte is then read unsigned and a level over 210 is put back to 1 (exe 2000:6fdf and 2000:7005). The base level is only written into the byte at all when it is under 221. | `nudgeLevel` counts the jitter round `GameRules.monsterLevelWrap` and puts a level over `GameRules.monsterLevelMax` back to 1. | Yes: the faithful rules answer 256 and 210. **Endless lifts both** — no wrap at all, and a top level as deep as the dungeon goes. |
| **The attack timers**, `Game.monsterTimers` | Seconds until each slot's next swing, a word in the data segment. | An `Int16Array`, which is the same word. | Yes, and nothing to lift: the values are a handful of seconds. |

### What endless lifts, and how

These are lifted two different ways.

**A monster's numbers are lifted by the rules**, because a monster only ever lives in memory here.
`GameRules` carries `monsterHpMax` and `monsterLevelWrap` beside the `monsterLevelMax` it already
had. The faithful rules answer 32,000, 256 and 210, which is exactly what the executable's own
tables answer; the endless rules answer numbers nothing is ever folded back by, so a monster of
floor 4,000 stands at the level and the hit points that floor calls for.

**The character's own numbers are lifted by the state beside the record**, because the record has
to stay a record. An endless character's hit points and maximum go into `KeptEndlessState`
whenever they have grown past what the record's two words hold, and so do its rings of
regeneration, its lucky charms, its hand grenades, its stones of seeing and its six potions
whenever they have grown past the single byte the record keeps each of those counts in. The bytes
get a copy brought back inside every one of those fields (`clampedToRecord`). The file is still a
save Dungeons of the Unforgiven would load and make sense of — it shows a character pegged at
32,767 hit points and 127 lucky charms. When the character is picked up again the state's numbers
are put back over the record's, so the sitting carries on with what the character really has. A
replay carries the same state from sitting to sitting, so a run verified on the server arrives at
the same numbers the player saw.

One thing the clamp cannot do is tell a player's edit apart from its own work. The save editor
shows an endless character pegged at what each field holds, and a record written back from it at
those numbers reads as the character really having them, so whatever stood above a field is lost.
Editing a record from outside the game already makes a sitting unverifiable, so this only ever
costs a character nobody is putting on a board.

Nothing else is lifted. The six characteristics and the counts the record keeps in a whole word —
potions of healing, stones of teleportation — are the next fields an endless character could run
off the end of, and lifting them would be the same piece of work again.

### What endless takes away

One thing goes the other way.

**Autokill stops working past floor 200.** It is the only attack in the game that never looks at a
monster's hit points: it rolls the character's mind against the monster's and, winning, simply
declares the monster dead. Every other way of killing something is worth less the deeper the floor,
because the floors stock monsters with more and more hit points, and this one is worth exactly the
same at every depth.

Its own odds do not save it either. The roll is
`random(monsterLevel + random(speed)) < random(charLevel + random(iq + wis)) + random(floor)`, and
an endless monster's level is `floor + 15 * module` — which grows one for one with the floor, at
exactly the rate the character's own depth roll grows. So the two sides of the roll pull apart at
the same speed, the character's level and mind become a rounding error once the floor is in the
thousands, and the odds settle a little under a half and stay there for the rest of the dungeon.
A permanent coin flip that deletes anything is not something a character should be able to lean on
for twenty-nine thousand floors.

So `GameRules.autokillDeepestFloor` is 200 for an endless game and null for a faithful one, and
`autokill` (`src/lib/game/port/magic.ts`) reads it. Cast deeper than that, the spell refuses and
says so in a box whose wording is the port's own; because it reports failure, `cast_a_spell`
charges nothing for it, so a player who forgets loses no spell points and no time. Floor 200 still
works. The game's own dungeon bottoms out at 105, so a faithful game never meets the rule at all.

Drain Monster looks like the same problem and is not. It kills a monster whose level is under the
caster's wisdom outright, with no roll at all, and wisdom has no cap — but it sets the monster's
level to zero on the way, and a kill's experience is worked out from that level, so the kill pays
almost nothing. It is a way out of a fight rather than a way to grow, which is what Go Away is
too (John, 2026-09-16).
