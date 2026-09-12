# Moraff Tools

Browser tools for **Moraff's World** and **Moraff's Dungeons of the Unforgiven**
(DotU). Everything runs locally in the page; no data is uploaded.

Live at <https://johnolek.github.io/moraffs-world-and-dungeons-of-the-unforgiven-save-editor/>.
The build is a single self-contained HTML file, so it also works opened straight
from disk.

`docs/INDEX.md` says what every document in this repository is for, for the three
games and for this port both.

## DotU map explorer

Every floor of every module, computed on the fly from the dungeon generator
recovered from `unf.exe`, drawn the way the game's own expanded map draws it:
open squares black on dark red, white sides with door bars, yellow diagonals for
ladders and trap doors, a blue star for chutes, coloured squares for the town's
store, temple, bank and inn. Secret doors are dashed and module teleporters
magenta, which the game never shows.

- Pick a module and floor; the header names the section and its boss floor.
- Drag to pan, scroll to zoom, point at a square to see its sides, its feature
  and where it leads.
- Click a ladder, chute or trap door to go to the floor it leads to; the landing
  square is marked.
- Arrow keys move the cursor, PgUp/PgDn change floor, Enter follows.
- Export the floor as a PNG.

## Save editor

The Save Editor tab edits character files of both games.

1. Open the Save Editor tab.
2. Upload your save file (named `1`, `2`, `3`… in Moraff's World, or `21`, `22`,
   `23`… in DotU — one file per character).
3. Edit stats, items, spells, and flags.
4. Download the edited file and overwrite the original.

**Back up your saves first.** Provided as-is, with no guarantee it works for
everything.

### What you can edit

#### Moraff's World

- **Identity** — character name, race, gender, class
- **Level & Experience** — player level, experience points
- **Vitals** — current/max HP, current/max SP, height, naked/loaded weight
- **Stats** — strength, intelligence, wisdom, constitution, agility, luck
- **Money** — jewels in pocket, jewels in bank
- **Stones** — copper, silver, ivory, gold, platinum, jewel
- **Position** — facing direction, X/Y, current floor, module
- **Weapons** — owned flags + enchant levels (8 weapons), currently equipped
- **Armor** — owned flags + enchant levels (8 armors), currently equipped
- **Vitamin Pills** — orange, green, blue, red, white, yellow
- **Afflictions** — disease timer, poison timer
- **Special Items** — potions of healing, stones of teleportation, holy hand
  grenades, stones of seeing, floor sloshers, feather, invisibility, fast move
- **Rings & Worn Items** — rings of regeneration, body armor, ring of
  protection, anti-magic ring, gauntlets
- **Trapdoor Keys** — floors 10–200
- **Spellbook / Scrolls / Wands / Papers** — permanent, preparation, wizard,
  and priest spell lists

#### Dungeons of the Unforgiven

- **Identity** — character name, race, gender, class
- **Level & Experience** — player level, experience points
- **Vitals** — current/max HP, current/max SP, height, naked/loaded weight, age
- **Stats** — strength, intelligence, wisdom, constitution, agility, luck
- **Money & Resources** — rubles in pocket, rubles in bank, culture stock,
  children helped, magic crystals, American dollars
- **Position** — facing direction, X/Y, current floor, module
- **Weapons** — owned flags + enchant levels (8 weapons), currently equipped
- **Armor** — owned flags + enchant levels (8 armors), currently equipped
- **Potions** — orange, green, blue, red, white, yellow
- **Afflictions** — disease timer, poison timer
- **Special Items** — potions of healing, stones of teleportation, nuclear hand
  grenades, stones of seeing, floor sloshers
- **Rings & Worn Items** — rings of regeneration, body armor, ring of
  protection, anti-magic ring, gauntlets
- **Preparation Spells in Effect** — enchant weapon/armor levels, feather, fast
  move, invisibility, preparation strength/agility, super strength/agility
- **Battle Spell Timers** — strength, speed, slow enemies, power weapon,
  protection, resist poison/disease, anti-cold/fire, resist level drain, sleep,
  hold monster
- **Trapdoor Keys** — floors 0–100
- **Spellbook / Scrolls / Wands / Papers** — permanent, preparation, wizard,
  and priest spell lists
- **Misc** — difficulty, fill HP/SP on load

## Development

Svelte 5, TypeScript, Vite and Vitest, managed with pnpm.

```bash
pnpm install
pnpm dev          # dev server
pnpm test         # unit tests
pnpm check        # svelte-check / TypeScript
pnpm build        # dist/index.html, one self-contained file

pnpm verify-run <run.json>   # check a run downloaded from a Play tab
pnpm build:server            # dist-server/main.mjs, the run server
pnpm start:server            # run it
pnpm dev:all                 # the site and the server together on the local Postgres
```

`verify-run` plays a run's log through the engine again and says whether it
reaches what the log claims — the actions, the game's clock and every milestone
in order — with where it ended and a hash of the record it ended with. A log is
every session the character has been played in, so it checks each of them in
turn and that each one starts from the record the one before it ended with. It
exits 0 for a run that is what it claims to be, 1 for one that is not or that
cannot be checked, and 2 when there is no file to read. There are recorded runs
to try it on in `src/lib/play/fixtures/`.

Layout:

- `server/` — the run server: one Node process that takes runs from the Play tab,
  checks them by replaying them, keeps the leaderboards and announces what a
  checked run came to, with its own README for building, configuring and
  deploying it. It is in this repository so that one commit is one engine build.
- `src/lib/boards/` — the Boards tab: the run server's boards and its feed of
  announcements, and a page for any run on them. All three games have it, and
  only a build given a server address (`VITE_RUN_SERVER`) shows it at all.
- `src/lib/game/` — the DotU dungeon generator and file parsers, verbatim copies
  of `dotu-tools/reference/`. A test keeps them byte-identical; change the bundle
  first, then copy.
- `dotu-tools/` — the reverse-engineering bundle: `HANDOFF.md` is the spec for the
  fan tools, with docs, static game data, regression fixtures, the Python
  reference implementation and the rendered game pictures.
- `dotu-tools/decomp/` — the decompiled game: all 647 functions of `unf.exe` as
  Ghidra recovered them, carrying the names the docs use, with the function and
  string indexes and the scripts that produced them. The executable is not
  included.
- `src/lib/editor/` — the save editor: a typed field schema per game and a Svelte
  component per field kind.
- `src/lib/roller/` — the New Character tab. One `RollerSession` runs all three
  rollers: it answers the port's questions from the answers given so far, throws
  when it runs out of them, and rolls again from the top with the same random
  numbers when the next one comes in. What is one game's rather than another's is
  a port table — `ROLLER_PORT`, `MW_ROLLER_PORT` and `REV_ROLLER_PORT`, each
  saying how to start that game's roller, how to run it and what its screen shows
  — and, in `NewCharacter.svelte`, a table of what the tab does with what it
  rolls: the file names, the record writers, the sheet and how the menus are
  answered.
- `src/lib/bestiary/` — the Monsters tab all three games mount, and each game's own
  numbers beside it in `mw-bestiary/` and `rev-bestiary/`. `MonsterDatabase.svelte`
  is the two panes, `MonsterCard.svelte` the card the picked monster is drawn on —
  the picture, the name, the numbers table and the effects — and each game hands it
  the rest of its card as snippets. Their shared look is in `monster-card.css`
  rather than the shell's own `<style>`, because Svelte scopes styles to the
  component the markup is written in and those snippets are written in each game's.

Pushing `main` builds, tests and deploys to GitHub Pages.

## Credits

The Dungeons of the Unforgiven character file format was reverse engineered and
documented by **Spectere** and **Bag of Magic Food** — see the
[DOS Game Modding Wiki](https://moddingwiki.shikadi.net/wiki/Dungeons_of_the_Unforgiven_Player_Character).

The dungeon generator, monster and drop mechanics, and file formats in
`dotu-tools/` were recovered from `unf.exe` and verified against real explored-map
files; see `dotu-tools/docs/METHOD.md`.
