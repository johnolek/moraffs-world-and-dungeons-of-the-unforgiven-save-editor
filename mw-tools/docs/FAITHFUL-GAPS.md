# What faithful mode still does differently

Moraff's World, read against `decomp/mw.c` in September 2026 (MORF-201).
`dotu-tools/docs/FAITHFUL-GAPS.md` says what this list is and is not, and has Dungeons of the
Unforgiven's own; `rev-tools/docs/FAITHFUL-GAPS.md` has Moraff's Revenge's. The departures the
port makes on purpose are the last section of `src/lib/play/mw/README.md` and are not repeated
here.

## The list

| what the player sees or feels | where it comes from | state |
|---|---|---|
| **The game makes four noises and the port makes none.** A rising chirp when your blow lands, a falling one when a monster hits you, a two-note chime when a monster dies, a 1.4-second dirge when you die — the same four cues, at the same frequencies, as Dungeons of the Unforgiven. The chime and the dirge both start *before* their words appear. | `FUN_2000_5bb6` (2000:5bb6) from `strike`, `FUN_2000_6123` (2000:6123) from `monster_turn`, `FUN_3000_d4d9` (3000:d4d9) first in `monster_killed`, `FUN_2000_722c` (2000:722c) first in the death routine. All gate on DS:119f, the O key's own flag. | fixed under MORF-227 |
| **The level, hit points and kill value of every monster beside you** stand over all four views at once, not just the one you face. | `movecontrol` calls `FUN_2000_8728` (2000:8728) per occupied side; `FUN_2000_8b3f` (2000:8b3f) calls `FUN_2000_892d` (2000:892d) per side. | fixed |
| **A fight reads out over about a second.** A swing blanks its strip for a tenth of a second first, so swinging twice with the same result still blinks; a monster's attack clears its strip and waits 110 ms before printing. Death holds the killing message 1300 ms first, and a jammed door holds 350 ms. | `strike` 2000:5bef, `monster_turn` 2000:615c through `FUN_2000_7fb1` (2000:7fb1), `movecontrol` 2000:aad5, `monster_killed` 3000:d51c. | fixed under MORF-229. The holds `monster_turn` ends on — 100 ms on a miss, 350 ms on a hit, 1260 ms for a puffball — went in with MORF-228, since they are what keeps two monsters' messages apart |
| **The town's buildings are marked on the ceiling of their square in the 3-D views**, and on the surface a way up is not marked at all: floor 0 throws the ladder away and reads `surface_feature` instead, negated. The port had it the other way round. | `FUN_3000_2796` 3000:302b. | fixed |
| **DIGGING... DIGGING... flashes**, four times and four more above floor 16, seven to sixteen seconds of it. | `dig_hole` 2000:a2e5 and 2000:a37c. | fixed |
| **The chute's first line stands on its own** for a second and a half. | `chute` 2000:9dbc. | fixed |
| **The little mouse's advice is colour-coded** — a different colour for each of the eight pieces — **and stands in the bottom half of the box**, rows 5 to 8, not the top. | `FUN_3000_9383` 3000:9383 and `FUN_3000_8b27` 3000:8b27. The port's own comment in `advice.ts` says the lines go down the right-hand panel; x is 0, so that is wrong too. | fixed under MORF-230, the comment with it |
| **The little mouse never speaks on the step after a floor has greeted the character.** Arriving raises a flag; the next step spends it and says nothing. | `FUN_2000_248e` (2000:248e) sets DS:11e5 as its first statement, whether or not it goes on to show anything; `movecontrol` (mw.c 14806) clears it in place of calling `FUN_3000_9383`. | fixed under MORF-299 |
| **Two of the little mouse's fourteen lessons are held back.** The one that says monsters live in the dungeon is only drawn while the character is standing in the town, and a Fighter is never told to cast a cure. Either way the lesson still spends its turn: that step says nothing. | `FUN_3000_8b27` case 4 tests DS:c8a2, the floor; case 7 tests DS:c11c, the class. The counter at DS:4482 is stepped by `FUN_3000_9383` before the case runs. | fixed under MORF-298 |
| **The expanded map points at the level's quest boss** — GO NORTH / SOUTH / EAST / WEST in red — and blinks the character's square through the whole palette rather than through sixteen colours. | `FUN_2000_a8d7` 2000:a8d7 from the X branch; the wider blink is `FUN_2000_7d00` 2000:7d00. | fixed under MORF-231, which ports the X screen itself, and the blink under MORF-448: `MwScreen.svelte` turns a canvas of its own over that square through the whole palette, a pass of the wait at a time |
| **The map cursor blinks** through sixteen colours as fast as the machine runs. | `FUN_2000_7c8a` 2000:7c8a. | fixed under MORF-448, the same way MORF-221 answered Dungeons of the Unforgiven's arrow: a canvas over the square rather than a repaint of the screen, stepped at the one pace the site counts a pass of a busy loop at |
| The town buildings' menus have no picture behind them. | `store`, `inn`, `bank`, `FUN_2000_3085`. | not a gap — `draw_picture` (3000:0105) has three callers and none of them is a town routine, so there is no picture to draw. The README said otherwise and is corrected |
| The attract screen: the title, monsters rushing the screen out of the distance, and the credits, on a loop. | `FUN_3000_b1d6` 3000:b1d6 from `main`. | not worth it — the port has no attract mode to put it in |
| A menu shown with a negative period takes itself down instead of waiting. No caller passes it. | `FUN_2000_1d0b` 2000:1d0b. | not worth it |
| `FUN_3000_b89b` is a key-interruptible wait with no callers. | 3000:b89b. | not worth it — dead in the original too |

## Two things worth knowing

**There is no skull here.** Dungeons of the Unforgiven paints one over a monster the moment it
dies; WORLD.PIC has no such image, and `monster_killed` (3000:d51c) calls `draw_picture` zero
times. It plays its chime, prints YOU KILLED IT! and blanks the slot. The monster simply stops
being drawn, which is what the port already does.

**`draw_picture` has four call sites in the whole executable** — the monster right ahead
(mw.c 18509), the monster on any other square and the two ladder marks (`FUN_3000_2796`), and the
title screen. Every image the game draws in play, the port now has and draws. There is no corpse,
no explosion, no town interior and no item picture anywhere in the file.
