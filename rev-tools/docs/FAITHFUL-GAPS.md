# What faithful mode still does differently

Moraff's Revenge, read against the annotated BASIC of `DUNSMALL.EXE` in September 2026 (MORF-201).
`python3 rev-tools/reference/list_basic.py DUNSMALL.EXE <offset> <length>` prints any routine
below. `dotu-tools/docs/FAITHFUL-GAPS.md` says what this list is and is not; the departures the
port makes on purpose are the last section of `src/lib/play/rev/README.md`.

Everything left here is a matter of the screen but for one row. The three entries that were rules
of the game — a disease costing a characteristic as you walk, rings of health healing you as you
walk, and the three timed potions wearing off — are ported (MORF-232, MORF-233 and MORF-300); a
fourth turned up while the death screen was being ported and is the row before the last.

## The list

| what the player sees or feels | where it comes from | state |
|---|---|---|
| **The dead monster's picture stays under YOU KILLED IT!!** Both that and HIT RETURN are printed straight across the close-up, and nothing rubs the picture out until the treasure clears the screen. The port takes the picture away the instant the monster dies. | `LOCATE 16,24` at 1000:A4C7/A4D8 and `LOCATE 17,26` at 1000:A4F9, over the close-up at (225, 112). 1000:6BAF sees the emptied slot and returns without erasing; the only routine that blanks that box, 1000:58F7, is never reached from the kill. | fixed under MORF-234 |
| **A fight is written straight over the map.** The hit line and the damage land on rows 11 and 10 in the middle of the screen, the monster's answer and every drain run down from row 20, and MONSTER BLOCKS WAY appears above the FRONT box. The port collects the lot into the message rows at the top. | 1000:8D00–8DDE and 1000:8D5D / 8D91 / 8DBE; 1000:9DAF, 9DC1, 9DE8 and the drains at 9E7C, 9EC6, 9F05, 9F28, 9F34; 1000:33EA and 1000:340C. | fixed under MORF-235 |
| **Almost every message is held on the screen** — two seconds for SOUND ON, NOT ENOUGH SPELL POINTS, a wand with no effect and what a battle item did; four for the fountain, the locate spell and every refusal in the store, the temple and the inns; eight back to back when the Flea Bag Inn makes you sick. The port prints and carries on. | 1000:2F1A is `T=TIMER: WHILE TIMER-T < 2: WEND` and 1000:2F35 calls it twice. Sites listed on the item, the four seconds a disease drain holds its line for (1000:40EB) among them. | fixed under MORF-238, and the four seconds in the A key (1000:1941) under MORF-440 |
| **The V and M keys take the whole screen.** V is a full character sheet — the armour worn, the weapons owned, six padded columns and the disease warning — and waits for a key. The port prints eight lines into the box and carries on, and the armour, the weapons and the disease line never appear. | V: CLS 1000:19F7, the sheet to 1000:1C41, the wait at 1000:1C4A, the redraw at 1000:1C69. M: CLS 1000:3B16, list to 1000:3D6E, wait 1000:3D70, redraw 1000:3D79. | fixed under MORF-237 |
| **Three potions put a banner in the middle-top** while they last, and the fight rubs each out as its timer runs down. None of the three lines exists in the port. | 1000:7F43, printing at 1000:7F7D / 7F96 / 7FAF; blanked at 1000:8601, 8663, 86CA. | fixed under MORF-236 |
| **The screen goes black and is taken over** by the treasure after a kill, by death, by quitting and by the pause key, and three of those lines are missing outright — the reincarnation line and the two the game jokes with while it saves. The coin list also loses four of its seven lines on the drawn screen. | Treasure CLS 1000:A890, magic table 1000:AC87 and AC90; death CLS 1000:A016 with the reincarnation at 1000:A160; quit CLS 1000:0D8E with the two lines at 1000:B5C8–B5F7; pause 1000:7FFE. | fixed under MORF-239 |
| **The game has music**: a march at the temple, a dirge on death, a hymn at the Kings Inn, and a loading tune. All of it background, so nothing stops for it. With the sound off the Kings Inn still waits four seconds where the hymn would have been. | One PLAY statement, 1000:05E2, through 1000:05CB; the tunes at 1000:05A0, 05AC, 05B8, played from 1000:2543, 1000:A013, 1000:1FC9; the silent stand-in at 1000:05BF. | fixed under MORF-240, but for the loading tune, which this port has no loading screen to play over |
| **Holding an arrow speeds the game up** and a different key puts it back. | The wait at 1000:4127–4169, which is `delay - INT(delay / 6) * <the arrows so far>` and is dropped altogether past three arrows (1000:410F); the count at 1000:4208–4260 (DGROUP B5FA), which any of the four arrows adds to. | fixed under MORF-241, as a fraction off the tab's own redraw: the original's wait belongs to ground already walked, where it also skips the redraw, and the port always draws |
| **The three potions timed against `TIMER` never wear off.** The thirteen points of agility a potion of speed hands over and the shield of fifteen a potion of shielding puts up last the rest of the run, where the game takes them back as each hundred seconds runs out. | The fight's own poll, 1000:85BA to 1000:86DF. 1000:85F9 zeroes the fire, 1000:8655 the shielding with the shield at DGROUP B706, and 1000:86B4 the speed with the thirteen points of agility at 1000:86BC. | fixed under MORF-300 |
| **A death does not take the two spells a fight casts on the character off.** Eleven points of agility for Speed and seven off the strength the swing roll reads for Strength, whatever the step counter says. | 1000:A05A to 1000:A0A1, between YOU'RE DEAD and the rolls; the fight's own poll is 1000:0A4F and the town's routine for the other two spells is 1000:1C93. | fixed under MORF-301 |
| Standing on the fountain flushes the keyboard on every pass of the loop. | 1000:087C into 1000:3D83, which calls the eighteen-`INKEY$` flush at 1000:2FCB first. | not worth it — nothing a player can see, and the port has no keyboard buffer to drain |

## Three things worth knowing

**There is no flashing, no blinking and no colour cycling anywhere.** No sprite drawn and undrawn,
no XOR `PUT`, no palette animation, no two-colour redraw loop. The `PUT` actions are the two
constants 3 and 0xFF03/0xFF00, each used once per picture per redraw.

**`PSET` does not appear in the module at all**, despite `rev-tools/docs/SCREEN.md` mentioning it —
everything is `LINE`. There is exactly one `CIRCLE` (1000:52E1, the chute marker) and exactly two
`PAINT`s (1000:6638 and 1000:6851, the door slabs), and the port draws all three. Of the 46 `LINE`
sites, every one is inside a block the port already ports.

**1000:3FFC is the per-key routine, not just the fight entry.** Every key comes back through it:
most by the loop's own re-entry at 1000:0636, a step by the tail the four move routines share
(1000:33CB), a wall by the branch each of them refuses on, a turn by the top of the pass
(1000:0627), and C, P, T and W by calling it themselves. The one key that never reaches it is a
step a monster stood in the way of (1000:33EA). That is why the disease drain and the rings'
healing are felt on every single step.
