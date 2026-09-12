# Where everything is written down

The documents in this repository cover three DOS games and one browser port of them. This page
says what each one answers, so that nobody has to open six files to find the one that knows.
Sizes are given because some of these are long, and reading the wrong 60 KB is the thing this
page exists to prevent.

## Start here

| I want to know | Read |
|---|---|
| **What the port still does differently from the game** | the three `FAITHFUL-GAPS.md` — one per game, each row naming the address it comes from and whether it is fixed |
| **What the port does differently on purpose** | the last section of each play README, `Where this leaves the original`, plus `The three deliberate departures` in `src/lib/game/port/README.md` |
| What a routine of the original does | `dotu-tools/docs/FUNCTION-CATALOG.md` for Dungeons of the Unforgiven; the other two games have no catalogue yet |
| How a rule or a formula works | the per-game documents below — `UNFORGIVEN-RE-NOTES.md`, `mw-tools/docs/DUNGEON.md`, `rev-tools/docs/MONSTERS.md` |
| Where a routine of the original ended up in the port | `PORTED-FROM.md` in `dotu-tools/docs/` and `mw-tools/docs/`, generated from the port's own citations by `pnpm build:ported`; Moraff's Revenge has none yet |
| Where a piece of the port came from | the doc comment above it: every ported function cites its address and its name in the decompilation |
| How the reverse engineering was done | `dotu-tools/docs/METHOD.md` for the two C games, `rev-tools/docs/BRUN30.md` for the BASIC one |
| Whether the codebase has known problems | `docs/REVIEW-2026-09-08.md`, and the MORF tracker |

## Three things to know before reading any of it

**There are three games, not one.** Dungeons of the Unforgiven (1993, Borland C++, `unf.exe`) and
Moraff's World (1993, Borland C++, `WORLD.EXE`) are decompiled C. Moraff's Revenge (1988, the disk
here is the 1991 build; Microsoft QuickBASIC 3.0, `DUNSMALL.EXE`) is not C at all and is read a
different way. Each game has its own bundle: `dotu-tools/`, `mw-tools/`, `rev-tools/`.

**An address does not say which game it belongs to.** The two C games were built by the same
compiler with the same segment layout, so `2000:9dbc` names a real routine in each of them. Which
game an address means comes from the file it is written in, never from the address. Segment 1000
is the Borland runtime in those two, but it is the whole of Moraff's Revenge.

**Every ported function cites where it came from.** The convention is set out under
`Naming and citations` in `src/lib/game/port/README.md`:

```ts
/** go_away (exe 3000:db1e, unf.c "go_away"). ... */
```

Prose comments also name bare addresses where they explain a decision. Both forms are how a
reader gets from this code back to the game.

## About the original games

### Dungeons of the Unforgiven — `dotu-tools/`

| document | size | what it answers |
|---|---:|---|
| `HANDOFF.md` | 30K | The spec. What the tools are for, the game model, the file formats, and a formula sheet. Start here for the game as a whole. |
| `docs/FUNCTION-CATALOG.md` | 63K | Every one of the 647 routines in `unf.exe`: address, name, size, callers, and what it does where that is known. 199 are named. |
| `docs/PORTED-FROM.md` | 22K | Where the port plays each routine of `unf.exe`, and which routines nothing points at. Generated; do not edit. |
| `docs/UNFORGIVEN-RE-NOTES.md` | 35K | The numbers and formulas recovered from the executable, with each one marked as read from the binary or only from the recovered source. |
| `docs/SCREEN.md` | 19K | What the game's screen is made of, read off a screenshot and the drawing code. |
| `docs/PICTURES.md` | 18K | The 33 `.PIC` files, what is in each, and the two different rules the game scales and draws them by. |
| `docs/MAP-MEMORY.md` | 17K | What the game remembers of a floor, when it writes it down, and which monsters you get to see. |
| `docs/TIDBITS.md` | 17K | Things in the executable nobody would guess from playing, including the copy protection. |
| `docs/CONTEST.md` | 13K | The hundred-dollar contest, and the finding that the game never prints the code it promises. |
| `docs/METHOD.md` | 11K | How a 1993 executable with no symbols was turned into named routines. The techniques, not the results. |
| `docs/FAITHFUL-GAPS.md` | 10K | Everything the port draws or does differently, ordered by how often a player meets it. Most rows say fixed. |
| `decomp/README.md` | 9K | What the decompilation bundle holds and how to read a function header in it. |
| `docs/PORT-PLAN.md` | 8K | The feasibility study written before the port existed. Historical: it asks whether this could be done, and it has been. |
| `docs/FONTS.md` | 2K | The three font files and how they decode. |

### Moraff's World — `mw-tools/`

| document | size | what it answers |
|---|---:|---|
| `docs/DUNGEON.md` | 38K | The bulk of the game: how the dungeon is generated, what is on a square, the monsters, combat, spells, pictures and money. |
| `docs/PORTED-FROM.md` | 18K | Where the port plays each routine of `WORLD.EXE`, and which routines nothing points at. Generated; do not edit. |
| `docs/MAP-MEMORY.md` | 17K | What the game remembers of a floor and what the automap draws for it. |
| `docs/SCREEN.md` | 14K | The game's screen, read off screenshots and a screen recording. |
| `docs/ROLLER.md` | 12K | `roll_char`, the only routine that makes a character, read line by line. |
| `decomp/README.md` | 11K | What the decompilation bundle holds. |
| `docs/FAITHFUL-GAPS.md` | 6K | What the port still does differently. |

There is no function catalogue for this game. `mw-tools/decomp/functions.txt` lists all 580
routines with sizes and callers, and 122 of them outside the runtime have names, but none has a
description.

### Moraff's Revenge — `rev-tools/`

| document | size | what it answers |
|---|---:|---|
| `docs/SURVEY.md` | 41K | What every file in the game folder is, what the toolchain is, how far a decompilation can go, and what the data files hold. Start here. |
| `docs/BRUN30.md` | 36K | How a compiled QuickBASIC program calls its run-time, the run-time routines named, and several stretches of the game listed out. This is how to read this game at all. |
| `docs/DUNGEON.md` | 35K | Where the maze is — nowhere; it is generated — and how. |
| `docs/MONSTERS.md` | 19K | What the main loop does while you stand there, and what happens when a monster is met. |
| `docs/MAP-MEMORY.md` | 18K | What the game remembers of a floor. |
| `decomp/README.md` | 8K | What the bundle holds, and why `dunsmall.c` is not the thing to read. |
| `docs/FAITHFUL-GAPS.md` | 7K | What the port still does differently. |
| `docs/SCREEN.md` | 4K | The game's two screen modes, read off screenshots. |

Read the thunk-aware listing from `rev-tools/reference/list_basic.py`, not the Ghidra output in
`decomp/dunsmall.c`. There is no routine list for this game at all.

## About this port

| document | size | what it answers |
|---|---:|---|
| `src/lib/play/README.md` | 62K | `movecontrol`, the loop Dungeons of the Unforgiven is played in, and everything that hangs off it. The longest document here and the one the Play tab rests on. |
| `src/lib/play/rev/README.md` | 30K | The same for Moraff's Revenge, whose loop and clock work unlike the other two. |
| `src/lib/play/mw/README.md` | 20K | The same for Moraff's World. |
| `src/lib/game/port/README.md` | 14K | Dungeons of the Unforgiven's rules, function by function, and the rules the port itself is written under — naming, citations, and the three deliberate departures. |
| `src/lib/game/mw-port/README.md` | 11K | Moraff's World's rules, function by function. |
| `src/lib/boards/README.md` | 6K | The leaderboard pages over the run server. |
| `src/lib/journal/README.md` | 3K | A run written up in words, as the Play tab and the boards both show it. |
| `server/README.md` | 42K | The run server: what it answers, the database, how a run is verified, and how it is deployed. |

The three files under `src/lib/tidbits/` — `TIDBITS.md` (53K), `MW-TIDBITS.md` (52K) and
`REVENGE-TIDBITS.md` (42K) — are not documentation about the code. They are the content the
Tidbits tab shows, and each begins with instructions for adding to it.

## One-offs

| document | size | what it answers |
|---|---:|---|
| `docs/REVIEW-2026-09-08.md` | 39K | A ten-sweep read of the whole codebase on 8 September 2026, filed as MORF-265. Real bugs, refactoring opportunities, and a fact-check of every Tidbits page. Historical: the items it filed have mostly been done. |

## The two pages at the root

`README.md` is for somebody who wants to use the tools. `CLAUDE.md` is the working agreement: the
workflow, the deploy map, the commands, and the rules about what may be edited and what may not.
Read `CLAUDE.md` before changing anything.
