# The endless dungeon

Dungeons of the Unforgiven bottoms out at floor 105. The endless dungeon carries the same game on
below that, in sections of its own numbered past the twentieth, until floor 32767 — which is as
deep as a character can be saved standing, since the record keeps the floor in a signed 16-bit
word at 0x7b4.

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
- **`monsters.ts`** — the five monsters a new section stands, drawn from the world's seed and the
  section number.
- **`state.ts`** — what an endless character carries beside the record: the trap door keys and the
  Shadow boss squares of the sections the record has no room for. `src/lib/play/README.md` is
  where that state is written up, since it travels with a run.

## One world

A world is one number. Two characters rolled into the same world meet the same monsters in the
same section, and nothing about the character reaches any of these rolls, so a section is the
same section for everybody playing that world. `ENDLESS_WORLD_SEED` in `rules.ts` is the world
every endless character is rolled into for now; MORF-513 is where the run server hands the number
out.

## What a new section is made of

A section past the twentieth draws two things from a generator started from the world's seed and
its own number (`endlessSection` in `monsters.ts`):

- **A section of the game to be drawn and described as.** Its walls, its palette and the pages its
  S screen turns are one of the game's own twenty, because there are twenty sections' worth of
  wall files and twenty sections' worth of palettes and nothing else to draw a floor with.
  `sectionSource` is which one.
- **Five monsters of its own**, filling the five rows `load_md_bin` (exe 2000:5fec) fills for a
  section: a Shadow boss in slot 22, three regulars in 23 to 25, and a level drainer in 26. Each
  is one of the hundred monsters the game has, taken out of the slot it fills in its own section,
  so a boss is one of the twenty bosses and a drainer one of the twenty drainers. No two of the
  three regulars are the same monster.

A borrowed monster arrives whole: its type row, its level drain, its stat drain, its breath, its
special and its experience multiplier are the bytes the game gave it, so every piece of arithmetic
the game does on a monster is untouched. What changes is what it looks like. It also keeps its own
picture, which lives in the file of the section it came from — `ufmon<N>.pic` — which is why a
monster says which section's file to read and the picture set of the 3-D view reads that file
(`src/lib/play/view3d/browser.ts`).

Because the five come from all over the game, the words of the S screen are no longer about the
monsters standing on the floor. The screen says so.

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
