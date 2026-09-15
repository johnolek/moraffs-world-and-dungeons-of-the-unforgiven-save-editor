# Playing the game

`movecontrol` (exe 2000:c308), the loop Dungeons of the Unforgiven is played in, and everything
that hangs off it. The rules of `src/lib/game/port/README.md` hold here too: every function is a
cited port of the function it came from, bugs and all, and where this port declines to do
something the original does, a comment says so.

## The shape

* **`engine.ts`** — `GameSession`, `startGame`, `runMoveControl` and the key table. The session
  holds the `Game`, the floor the character is standing on, the monsters it is stocked with, and
  the keyboard the loop waits on.
* **`keys.ts`** — the byte `movecontrol` dispatches on for every key, and the browser key events
  they come from.
* **`session.ts`** — `KeyedSession`, which is the part of all three sessions that is not a port
  of anything: the key queue and the wait the tab settles, the run log every key the game read is
  written into, the record the save editor can write while the game is being played, the save and
  the death. `GameSession` extends it and keeps what is this game's own — the timed frames, the
  message box, the plaque, the tablet and the repeat-fight flag. Three hooks are per game:
  `readRecord`, `writeRecord`, and `placeEdited`, which is where a record written from outside
  leaves the character standing.
* **`loop.ts`** — how all three games' loops are started, and the one thing they share besides the
  tab. A loop is an async function nobody awaits, so an error thrown inside one would otherwise be
  a rejected promise with nothing attached to it: the tab would freeze on its last drawing and a
  replay would quietly stop taking keys. `runPlayLoop` catches it, ends the session with the
  message on it, and the tab says the game stopped and why.
* **One file per thing a key does** — `move.ts`, `ladders.ts`, `trapdoor.ts`, `chute.ts`,
  `dig.ts`, `modules.ts`, `quit.ts`, `help.ts`, `town.ts`, `fight.ts`, `kill.ts`, `items.ts`,
  `gear.ts`, `potions.ts`, `manual.ts`, `misc.ts` — so that two people can add two keys without
  touching the same file.
* **`cast.ts`, `spellScreens.ts`, `pockets.ts`, `potions.ts`** — the spell and item screens:
  `cast_a_spell` for C and I, the two lists of spells in effect for 1 and 2, the V and E screens,
  the P key, and the six potions behind the I key's fourth line.
* **`gear.ts`** — the eight-line menu of what the character owns that A, W and the enchant spells
  all build, and the classes each row is refused to. **`manual.ts`** — the S key.
  **`misc.ts`** — M, O, G, X and Z. **`section-screen.ts`** — the pictures on the S key's screen.
  **`building.ts`** — the picture of the store, temple, bank or inn the character has walked into,
  which takes the whole display over for as long as they are dealing with it.
  **`plaque.ts`** — the HIT ANY KEY plaque every message box waits behind.
  **`tunnel.ts`** — the tunnel a module teleporter rushes at the player and the welcome printed
  on it.
* **`floor.ts`** — `load_level_map` and `stock_level`: arriving on a floor and the three-floor
  memory that decides whether its monsters are rolled again. **`memory.ts`** — the other half of
  arriving on a floor: the map the character has discovered, which is the same engine in both
  games and so is shared with Moraff's World.
* **`screens.ts`** — where the message box stands on the screen and what is in it, which is the
  eight lines of `menuLine` in `src/lib/game/port/screens.ts` drawn in the same place a menu is.
  **`MessageBox.svelte`** is that box drawn
  on its own, for the tab showing the map instead of the screen. **`boxes.ts`** is the rest of it: the several boxes a ported
  function printed shown one after another, since `print_menu_only` waits for a key after each of
  them — `printMenus` for a synchronous function and `printMenusWhile` for one that asks menus of
  its own halfway through. A function that draws down the message column *and* holds
  the screen between its lines — `chute.ts` is the one — draws them itself instead, since a frame
  keeps what `pfont` put on the screen and not what is in the box. A fight draws its own: `strike`,
  `print_battle_hp_info` and `defend` all call `pfont` and none of them waits, so they go through
  `game.draw` rather than through any of these.
* **`arrival.ts`** — the hint the snake brings on arriving on a floor. **`office.ts`** — the step
  count `random_events_tick` keeps, and the taunt the section boss sends every 250 of them.
* **`PlayTab.svelte`, `games.ts`, `play-tab.css`** — the Play tab itself, which all three games
  are played in: the landing page, the map or the game's own screen, the switch, the mode radios,
  the run block and the over-box. Everything that is not the same in all three comes in as a
  snippet — the screen, the place line, the numbers each game shows beside it, its own arrow
  controls and its panel — or as a row of the `PLAY_GAMES` table: how a game is started, what its
  loop is called, what a browser key means to it, and where on the floor its view says the
  character is standing. The look is a plain stylesheet rather than a scoped one, because scoped
  styles do not reach snippets written in another component; where one value has to serve all
  three it is this game's. The run block's milestones are the whole chain's, so the line shows the
  last four of them and a chip counting the ones before it, which names them all on hover. Under
  the run block is the mark saying whether the run is reaching the run server and what the replay
  made of it (`streaming.ts`).
* **`BoardName.svelte`** — under the mode radios: the name this browser goes by on the run
  server's boards, and the opt-out. Nobody signs up, so a name is claimed with the device secret
  `src/lib/player.ts` makes and keeps; the field shows the name that secret already holds and the
  server's own words when the name belongs to somebody else. A claim that made a player is
  answered with a passphrase of six words, which the box under the field shows the once with a
  Copy button — the words are selected instead where a browser will not copy for a page — and
  never again, since the server keeps only their hash. A browser with no name of its own has a
  name-and-passphrase form beside the claim field, which is how a name claimed on another device
  is played from this one; a browser that has a name has the control that draws a new passphrase
  and retires the old. A build given no server address has no boards to be on and shows nothing.
* **`Play.svelte`** — this game's snippets: the game's screen or the top-down map, the message
  box, the two pictures and the panel. **`display.ts`, `Screen.svelte`** — the screen itself: the boxes `movecontrol` fills, the
  key menu, the zoom map, the status block and everything the game has printed, over the four
  views of `view3d/`. **`zoom-map.ts`** — the little map in the corner, which is the same routine
  in both C games (`drawsquare` here, `draw_map_square` in Moraff's World) and so is shared with
  them, with a row of a table apiece for the few numbers they differ over.
* **`panel.ts`, `Panel.svelte`, `Portrait.svelte`** — the numbers the game keeps and never
  prints, beside the map, and the picture of the monster in front of the character, which the
  map's heads-up display (`MapHud.svelte`) shows at the top of the map.
  **`PortraitFrame.svelte`** is the box that picture sits in, which Moraff's World shares; each
  game hands its own picture in as a snippet.
* **`hud.ts`, `MapHud.svelte`, `HudOrb.svelte`, `HudExpBar.svelte`, `HudMonsterBar.svelte`** —
  what the map draws over itself: the monster being fought centred at the top, the spells the
  character has running up the right edge, the poison and the disease in them up the left, and
  along the foot a bar of dark stone with a health orb and a spell orb standing in its ends and an
  experience bar between them. The health orb's liquid is a duller, darker red while a poison is
  in the character and a green while a disease is, and with both in them the poison fills its left
  half and the disease its right. The spell list is
  `panel.ts`'s own lines, the ones the panel beside the map already reads, so resting on a spell
  shows the same word about it that the panel prints. None of it is a port of anything. The map is the site's own view of a game rather
  than a screen any game ever drew, so this is the site's own look; it takes no clicks and reads
  the games' numbers without writing any, so the game, the run log and a replay are the same with
  it and without it. `hud.ts` is the arithmetic: how full an
  orb stands, and which stretch of a game's experience curve the bar draws. A level is only
  handed over at an inn, so a character can walk around with the experience for several they have
  not been given; the bar steps on to the next stretch for each one and a badge names the level it
  has reached. The numbers come off the view rather than off the character, since the character is
  a plain object the game writes in place and nothing on the page would redraw when a blow lands;
  everything on the bar is drawn as a fraction of an orb, and a map with little height to give
  gets smaller orbs, so the bar never has more stone on it than the map has floor. Nothing on it
  takes a click: the map underneath is dragged and hovered through it. The bar measures itself and
  hands the map its height, which `FloorCanvas.svelte` takes as `coveredBottom`: the strip the bar
  hides is not canvas the character can be seen on, so a step towards the foot of the map moves
  the map while they are still in the open rather than once they are behind the stone. The lists
  are the one part of the display that takes the pointer back, since a tooltip needs it.

  Two more things go with the close-up. `HudMonsterBar.svelte` is a vertical vessel of the same
  glass down its left, filling to the hit points the monster was stocked with and draining on the
  orbs' own tween; it is shown in every mode, because the game's own message box already prints
  the hit points a monster has left after every swing. Over the picture stand the lines debug mode
  prints over the monster on the game's own screen — `debugMonsterLines` here and
  `mw/debug-screen.ts`'s `mwDebugMonsterLines` — in the site's own type, under `debugDrawn(mode)`
  and so in no other mode. Both are read off the view (`engagedFullHp` and `engagedDebugLines`)
  for the same reason the character's own numbers are, and the hit points a monster was stocked
  with are remembered by `floor.ts` and `mw/floor.ts`, since a monster's record holds only the hit
  points it has left; a monster that arrived on a floor from anywhere else has the first hit
  points seen for it taken as its mark.

  Moraff's World takes all of this. Moraff's Revenge takes none of it: its record keeps no maximum
  spell points, its map draws no monster, and the experience a kill is worth sits in a pot the
  game does not add up until the character has slept somewhere.

## The run

A character's run is every sitting at the game it has been played in, written down as it is
played, so that a claimed ending can be checked by playing it again rather than believed.
`run.ts` is all of it and nothing in it draws, so it runs under Node as well as in a tab.

* **A session** — one sitting: the character's record as that sitting began, the seed its
  generator was started from, the commit the engine was built from, and every input in order,
  with the actions, the game's clock and the milestones it claims. That is the whole of one
  game: both games are turn based and every random number comes from the one generator, so the
  same three things put through the same engine make the same game again.
* **The chain** — the sessions of a character's run, oldest first, each starting from the record
  the one before it left behind. The count of actions and the game's own clock run on through the
  lot, so leaving the game and playing the character again goes on from where the count stood
  rather than starting it over, and a milestone is stamped with what the whole run had spent when
  it was reached. `RunRecorder` is handed what the run had come to `before` this session, and
  `runTotals` adds a chain up.
* **Where it is kept** — on the roster entry (`RosterEntry.run`) in the page, in the browser's
  database beside the record and the squares the character has discovered
  (`src/lib/character/roster-db.svelte.ts`), and, for a player who has claimed
  a name, on the run server, which is what puts the roster on their other devices. A signed-in
  page merges the two at startup and the server's copy stands, except where this device holds keys
  the server has never been sent; `src/lib/character/server-roster.ts` is that rule and
  `restoreRoster` is where it happens. The roster the server hands over carries how many keys each
  sitting holds rather than the keys themselves — a Moraff's Revenge chain is megabytes and every
  page load would carry every character's — so a chain another device played arrives with none of
  them, and `bringRunKeysHere` fetches the character's own before the two things that need them:
  playing it on, and exporting the run. The session being
  played is the last of the chain, written again wherever the record is written, which is after
  every key: the record and that one session go into the store together and nothing else on the
  roster is touched, so a tab closed in the middle of a game loses nothing and the next session
  starts from a record the run can be followed to. The loop writes it down once more where it
  comes back, since a death is the last thing a run has to say and the game saves no record over
  it.
* **The inputs** are what the game *read*, not what the player pressed, which is why they are
  taken in `GameSession.key` rather than in `press`: a key typed while the character is swinging
  is thrown away by the flush at the end of the swing and the game never sees it. Ctrl-F's own
  swings, which the loop takes without reading the keyboard, are written down where the loop
  takes them, and Moraff's World's turn where the character stands, which is no key of that
  game's, is an input of its own. Those two are `unpressed` rather than `input`, because nobody
  pressed them: `RunRecorder.presses` is the count of the keys a person really did press, which
  is what the run server holds a run to a human speed by, and it is no part of the log.
* **The clock** — Dungeons of the Unforgiven reseeds its generator from the machine's tick
  counter before a swing, before every `Random` call and before every monster it puts down on a
  fresh floor, the way the original does (section 8 of
  `dotu-tools/docs/UNFORGIVEN-RE-NOTES.md`), so what a swing rolls is that reading rather than the
  next number of any sequence. A run played that way is started with a tick counter —
  `sittingClock`, which counts 1/18.2 of a second from the moment the sitting began, off
  `performance.now()` — and reads it before every input it writes down, putting the reading in the
  log ahead of that input, the way Moraff's Revenge keeps the ticks its monsters move on: an input
  at or below `CLOCK_TICK_INPUT` is a reading and the tick is how far below it sits, which no key
  and no turn input comes near. The game is handed that reading as its `Game.clock` for the whole
  of the input it is handling, and is rolled with `BorlandRng`, since what the original gets out
  of a reseed is Borland's generator answering the counter. A replay is played on a counter made
  of the log's own readings, handed back in the order they were taken, so it rolls what the player
  rolled. Whether a sitting is played on the clock is the `tickCounter` its `RunRecorder` is
  started with; nothing hands one over yet, so every run played here today is played off the
  clock and its log holds nothing but keys.
* **The actions** — the things that happened to the character or to the world, which is the
  number a leaderboard orders runs by. What counts is what the game did rather than what the
  player typed: opening the spell menu and backing out is nothing and the spell cast through it
  is one, K on a square with no trap door is nothing and going through one is one. Every handler
  that does the thing pushes an event where it happens, and `src/lib/game/action.ts` is the list
  of the kinds all three games push. A step into a wall and a swing at nothing are refused before
  either turn-based game spends a moment on them, so neither is an action; in Moraff's Revenge,
  which is not turn based, the rule is simply whether the thing happened.
* **The milestones** — a boss killed, a level gained, a module or dungeon moved to, a death, the
  win, each with the action count and the game time it happened at. The three the ported routines
  alone know about arrive as `game.events`; the module or dungeon is read from the game itself, so
  every way of changing one is caught.
* **`replayRun(session, before)`** builds a game from the session and presses its keys in order,
  and hands back the place, the clock, the actions and the milestones it ended with, along with
  the record the game itself last wrote — which is the record the roster is left holding, and so
  the one the next session of the chain has to start from. A replay never raises the repeat-fight
  flag, since those swings are in the log already.
* **`RUN_GAMES`** is the one table of what a run needs of the game it was played in: the loop that
  replays it, the game's own words for its clock and its own name for a dungeon. A game with a
  line here can be recorded, replayed and checked, and nothing that does any of the three knows
  which games there are.
* **The journal** — everything the run did, in words, one line per thing that happened
  (`journal.ts`). The games push their events with the numbers on them
  (`src/lib/game/journal-events.ts`, and each game's own union for the kinds only it has), and
  each game has one function that turns one of those into the line a player would say about it,
  with the game's own names for its monsters, its spells, its items and its places:
  `unforgivenJournal` here, `moraffsWorldJournal` in `mw/journal.ts` and `moraffsRevengeJournal`
  in `rev/journal.ts`. Every line is one case of one of those switches, so what a run of a game
  says is changed in one place; what the three share -- which way a step went, what a spell was
  cast out of, how a monster and a floor are named -- is exported from `journal.ts` for the other
  two to use. `RunRecorder` keeps the entries
  as it drains the events, stamped with the action count, the floor and the module they happened
  at; a game with no line writer in `RUN_GAMES` keeps none. The journal is no part of the log —
  a replay pushes the same events and writes the same journal, which is how the run server has a
  run's journal without being handed one — and the roster keeps it beside each session all the
  same, in the `journal` store of the browser's database, so a character's timeline is there to
  read without a replay. The foot of the tab's side column is where it is read: the summary and
  the timeline of the whole run, the sittings run together, drawn by `src/lib/journal/`. A
  character rolled for one of the boards shows a line saying the journal opens when the run ends,
  until the character is dead or has beaten the game; `lock.ts` there is that rule.
* **The summary** — the journal folded into what the run came to (`summary.ts`): the steps, the
  experience gained and drained, the levels either way, the deepest floor and the furthest
  module, the money found and the money spent building by building, the wands and scrolls made
  and the charges and items spent, the vitamin pills the two Moraff games turn up, Moraff's
  Revenge's breaths of fire and its drinks from the fountain of youth, and for each kind of
  monster the fights, the swings, the damage both ways and the kills. `RUN_GAMES` lends it each
  game's own words for its clock, its dungeons and its money, so a run of Moraff's World is
  counted in jewels where one of Dungeons of the Unforgiven is counted in rubles. `summarizeJournal` is the fold and `summaryLines` is every word
  of it, so the Play tab, the verifier and the run server say the same thing about the same run.
  A fight is counted where the character came to face a monster, so walking away from one and
  back to it is the fight they were already in and turning to another and back is a fight of its
  own.
* **`export-run.ts`** is the download — the whole chain, which is what Export run hands over —
  and it is the one part of this that touches the page; the clicking of a link is
  `src/lib/download.ts`, where every download on the site goes.

The engine commit comes from `__ENGINE_COMMIT__`, which `vite.config.ts` defines from `git
rev-parse HEAD`; vitest reads the same config, so a test sees it too.

## Checking a run

`verify.ts` is the verdict: `verifyRun(log)` replays every session of the chain, each from the
record it says it began with and counting on from what the sessions before it came to, and says
whether what comes back is what the log claims.

`verifySession` is one session of that — the replay, the comparison with what the session claims,
and the check that it starts from the record it was handed — and `verifyRun` is the walk along the
chain between them. The run server calls it a session at a time, because it keeps an engine build
per commit and a chain's sessions have to be replayed by the builds they were played on.

* **Verified** — every session spent the same actions, its clock reached the same number, and it
  reached the same milestones in the same order, each at the same action count, clock and floor;
  and every session started from the record the replay of the one before it ended with, byte for
  byte. That second check is what stops a run being padded with a session of somebody else's
  character, or with the same session twice. The verdict carries the run's totals and the ending
  as well: where the character stood, whether they are alive, dead or have won, and a SHA-256 of
  the record the run ended with.
* **Failed** — the first thing that differs, in words, milestone by milestone, naming the session
  it was in for a run played in more than one sitting; or the session that does not start where
  the one before it ended.
* **Unverifiable** — nothing can be said either way. A run is only replayable from its own
  beginning to its own end, and a record the Save Editor wrote while the game was being played is
  not in the log: each session counts those as `edits`, and a run with any in any of its sessions
  is unverifiable rather than failed. So is a run whose replay stopped: a loop that throws is caught by `loop.ts` and raised
  again where the replay ends, and the verdict carries the message it stopped on, since a log
  the engine could not play through says nothing about whether the log is honest.
* **A note** — an engine commit that is not this build's, or one ending in `-dirty`. That is a
  warning and not a failure: the two engines may well agree, and a replay that reproduces the run
  says they did. `-dirty` is noted even where the two strings are identical, since a tree with
  changes in it is not described by the commit it sits on and two such trees can hold different
  code.

The verdict carries the journal the replays wrote, and the report ends with the run's summary
folded from it — what the run was, rather than only whether it is honest.

`pnpm verify-run <run.json>` is the same check from a command line, with no browser: it builds
`src/cli/verify-run.ts` for Node through `vite.verify.config.ts`, which defines
`__ENGINE_COMMIT__` the way the site's build does, and prints the verdict. It exits 0 for a run
that is what it claims to be, 1 for one that is not or cannot be checked, and 2 when there is no
file to read. Nothing the command imports touches Svelte or the page.

`fixtures/` holds one recorded run per game and one character played twice, played headless with
seeds of their own, which the tests verify and the command can be tried on. The three
one-session files are in the shape a log had before a run was a chain, and are left that way on
purpose: a log somebody kept from then still has to read, as a chain of one. A fixture that stops
verifying is the engine having changed a game under runs already played in it; when that change
is meant, write them again with `WRITE_RUN_FIXTURES=1 pnpm test src/lib/play/verify.test.ts` —
which puts all four in the chain shape and stamps them with this build's commit, so the three
older ones have to be put back the way they were afterwards with only the numbers that moved
taken from what was written.

## Sending a run to the server

A run is sent to the run server while it is being played rather than posted whole at the end,
because the server measures how long the run took and can only measure what it sees. The server's
half of this is `server/README.md`.

* **`stream.ts`** is what a batch holds, and nothing in it touches the browser: the keys played
  since the last batch it built, how many of them the player pressed, what the sitting claims to
  have come to, the character itself, and, the first time, the seed, the engine commit and the
  record a replay starts from. A batch that failed to go is kept as it was built and goes again as
  it was, so a flush after a stretch with no server sends several batches, oldest first. The
  sittings the character was played in before this one go first, one batch each holding the whole
  sitting, since the device cannot know which of them the server was ever told about; the server
  adds whatever keys of such a sitting it has not got and takes the rest as arriving twice.
* **The character on the batch** is the record as it stands, the squares it has discovered and the
  rest of what the roster shows about it (`characterSave` in `streaming.ts`). The chain says how
  the character got where it is, but reading that back is a replay of every sitting it has ever
  been played in, so the character rides along with the keys and the newest one sent is what
  another device picks it up from. The maps are left out of a batch whose maps are the ones the
  batch before it carried: they are by far the biggest thing on the wire and most keys change
  nothing about them. Where they are kept beside the character is
  `src/lib/character/maps.ts`, which holds them in the page while the game is being played and
  writes the row behind it, since a game in the middle of a turn has nothing to wait on a database
  with.
* **A character changed with no game running** goes to the server on its own, through
  `PUT /players/me/characters/:id` (`keepCharacterOnServer` in
  `src/lib/character/server-roster.ts`), as soon as the change is written down here. Otherwise an
  edit made in the Save Editor would wait for the next sitting and be lost if another device
  played the character first. It rides the same pause an edit is written on, so a burst of typing
  is one send, and it is skipped while a run of that character is being sent — those batches are
  already carrying the character (`runIsBeingSent` in `streaming.ts`).
* **The sequence** is the site's count of the batches of a sitting, and the server holds a stretch
  under its sequence. A batch whose answer was lost is sent again under the same number holding
  the same keys, so the server recognises it rather than playing it twice, and everything played
  since goes in the batch after it. A sequence that comes back holding something else is refused:
  one of the two halves has lost track of the run.
* **`streaming.ts`** is the part that touches the browser: a batch every five seconds, one more
  when the game is left, one that outlives a page on its way out, and the last one at a death or a
  win. Every character of a player with a name goes, so that it is there on whatever device they
  sign in on next — one rolled for no board, and one played in debug, which is the mode with the
  game's hidden numbers on the screen. Only a character rolled for a board and played in a mode
  that counts is checked and ranked, so only those wait for a verdict; the rest are told they were
  saved. A build given no server address does none of it. The mark the Play tab shows in its side
  column — sending, saving, not answering, refused, off the boards, and the verdict — is here too,
  since every one of those words is about what became of the sending.
* **One device at a time.** A character is leased to the device that last sent a batch for it, for
  half a minute, and the Play tab asks the server before it starts a game rather than letting the
  player find out five seconds in that the character is being played elsewhere. A batch refused
  because the server holds a newer run of the character — another device carried it on while this
  one was away — is the one refusal the tab does something about: it takes the server's copy of
  the character over the one here and says so.
* **The opt-out** is `offTheBoards` in `src/lib/player.ts`, kept beside the device secret and off
  until the player ticks the box in `BoardName.svelte`. It is what it says: nothing at all leaves
  the device, so a player who opts out keeps their characters in this browser and nowhere else.
  The sender asks before every batch rather than once when the game starts, so turning it on stops
  the sending part-way through a run and turning it off sends from then on. What was played
  meanwhile goes in the next batch, and the gap in front of that batch is longer than the server
  counts as play, so that stretch is untimed the way every stretch the server never saw is.
* **The shapes on the wire** are `stream.ts`'s, and `server/runs.ts` imports them, so the two
  halves agree about a batch in one place.
* **Where a sent run ends up** is the Boards tab, `src/lib/boards/`: the server's boards, its feed
  of announcements, and a page for any run standing on one.

## Waiting for a key

The original blocks on `getch` in the middle of its loop. A browser cannot, so the `Game` grew
two ways of asking, both promises, and everything that reads the keyboard is `async`:

```ts
const key = await game.key();              // getch (exe 4000:417b)
const chosen = await game.choice([0x31]);  // get_choice (exe 2000:2d93): '1', or Escape
```

`GameSession.press(key)` is what settles them; the Play tab calls it from its keydown handler.
A key pressed while nothing is waiting is queued, four deep. The queue is `KeyedSession`'s
(`session.ts`) and so is the wait, since all three games wait the same way; what this game adds
is the repeat-fight flag, which `key` puts down before it looks at the queue — a key already
typed stops the character swinging as surely as one the loop waited for — and `waitForTheKey`,
where Ctrl-F's own swing is taken without reading the keyboard at all.

A ported function that is **not** async — a spell, a fight — cannot wait, so `game.pressAnyKey()`
(`mgetch_message`, exe 4000:418d) only remembers that a key is owed. `await session.settle()` in
the loop is where it is taken; call it after anything that might have printed a box.

## Adding a key

`KEY_HANDLERS` in `engine.ts` is one entry per byte, and each names the function of the game it
runs:

```ts
[KEY.fight]: { c: 'strike', run: swingAtMonster },
```

Write the handler in its own file, taking the `Turn`, and swap it in. The `Turn` is what
`movecontrol` works out about the square before it reads a key — the ladder under the character,
the trap door, the town building, and `retdwall2` for the four sides — plus `step`, which is how
a handler asks for a step: set `turn.step = { dx, dy }` and the loop resolves it afterwards, the
way the original resolves the flag the up arrow raises.

Every key the original dispatches on has an entry and every one of them runs.

## Showing a screen

Two things text goes through, and both end up on the game's own screen, at the coordinates the
game drew them at:

* **The message box** — eight lines down the right with a bar above them (exe 2000:2f5d, and
  `dotu-tools/docs/SCREEN.md` for what it looks like). `game.say(...lines)` puts them there,
  which is `print_menu_only`, and they stand until something paints over them: the next box, a
  menu drawn down the same column, or one of the two wipes. `game.pressAnyKey()` after it is the
  wait the original does, and that wait (exe 2000:4054) is one of the wipes — a box that asks for
  a key is taken down by the key it is given. The others are the block the banner leaves when its
  monster is gone (exe 2000:c613) and whatever a ported function wipes itself. What movecontrol
  does *not* do is wipe where it reads the player's key, so a message the game never waited on
  stays in the box while the character walks on. The strings live on the game as `menuBox`, which
  is its own DS:c694, so `clearMenuBlock` takes them with it.
* **A screen** — `game.draw(line)` and `game.eraseScreen()`, which are `pfont` and
  `erase_menu_block`. `help.ts` is the worked example: draw, `await game.key()`, erase.
* **The plaque behind the wait** — `plaque.ts` and `FUN_2000_3e73` (exe 2000:3e73). The wait a box
  asks for is not a bare `getch`: `FUN_2000_4054` blanks a rectangle beside the status block, holds
  the screen with that hole in it for 330 ms, and draws a little stone plaque on it — a slab of the
  section's wall material with HIT ANY KEY NOW cut across it and four ten-pixel bands round it.
  Those bands are exclusive-ORed into the screen in the palette's gradient bank, and
  `FUN_2000_2a2e` rotates that bank once for every poll of the keyboard, which sets them crawling.
  `session.plaque` says how far along that wait the screen is; the delay is a display timer like
  the frames are and is kept in `timed.ts` with them.
* **The crawl**, which is that rotation and is not the plaque's alone. `FUN_4000_3b44` (exe
  4000:3b44) turns palette entries 96 to 255 by one, and the game makes that turn every time it
  polls the keyboard: `movecontrol`'s own wait (exe 2000:c308), the plaque's `FUN_2000_2a2e`, and
  `FUN_2000_2d93` while a menu waits for its choice. Because the rotation is of the palette,
  everything painted out of the bank moves together — the walls' distance shading, a teleporter's
  face, the plaque's frame — and it stops the moment a key is handled, because the game is drawing
  rather than waiting. `Screen.svelte` repaints the whole screen in the turned palette, so it runs
  only where the painted frame has a pixel out of the bank on it (`holdsGradientBank`, scanned once
  per paint) and waits out a top-down wipe rather than painting over it. The one departure is the
  pace: the original's is one turn per pass of a busy loop and so is the machine's, and the port
  uses `GRADIENT_STEPS_PER_SECOND` in `plaque.ts`, which is also what the X key's flickering square
  and the module tunnel's 150 turns step at.
* **A screen fading in or out** — `session.fadeScreen('in' | 'out')` and `fade.ts`, which are
  `FUN_4000_5b91` (exe 4000:5b91) and `FUN_4000_5c25` (exe 4000:5c25): the DAC walked toward the
  palette out of black in 64 steps, or down toward black in 60, with 7 ms between the steps. Two
  screens run them — the snake's stone tablet, which comes up out of black and fades away again
  when its key arrives, and the play screen, which the H key fades away before it builds the help
  (exe 2000:cddc). It is a held frame like a delay's, so the loop runs straight past it and a key
  gives up the rest; the frame carries the tablet as well as the lines, since the game has already
  put the tablet away by the time the fade runs. The tab draws the fade by painting the frame
  again in a stepped palette (`Screen.svelte`), which is the plaque's own path: the DAC steps
  every component by one, so a picture falls away to its brightest colours rather than dimming
  evenly the way a transparency would.
* **A screen the game leaves up for a moment** — `game.delay(ms)`, which is the `delay` at
  1000:2789 the original busy-waits in. The screen as it stands at that call is kept as a frame
  by `timed.ts`, and the frames are shown in turn for as long as each asked for, so a kill's
  four messages arrive one after another rather than the last one alone. Nothing about the game
  waits: the loop runs straight past. Any key gives up the frames still to come. The message box
  the tab draws is the one the game has now rather than the one the frame was kept with, so a box
  going up takes the eight lines off the frames as well; the strip above them is left, which is
  what keeps a kill's own line showing over the box its drop printed.

`screens.ts` is where the two are put back together, since the game does not keep them apart on
the screen: `messageBoxScreen` is what stands in the message box — the eight lines the last box or
menu filled, and over them whatever `pfont` has drawn inside the box's own rectangle, which is
where the battle banner stands, where a kill puts "YOU KILLED IT!", a drop puts "GOOD NEWS...", a
monster's swing puts what it did, and a swing of the character's own puts the blow and the
monster's hit points.

The banner and the blow stand together because of what each of them wipes. Everything that fills
the eight lines wipes the whole block first, so a line drawn there means the block was filled
again and the box does not show. `strike` and `print_battle_hp_info` are the two exceptions: each
wipes only the strip its own lines stand on, so the banner is still there around them and a box
that was up loses only the lines those strips cover.

**The battle banner is drawn, not said.** `engagement_timing` (exe 2000:b782) wipes the eight
lines with `FUN_2000_2820` and draws four of its own over them, and `print_battle_hp_info` draws
the fifth; a box put up afterwards wipes them all off again. `movecontrol` draws it in exactly
two places, and `GameSession` keeps to both: straight after the four views (exe 2000:cbed), so a
banner only ever appears on a pass the views were drawn on, and at the top of a pass where
`defend` has printed a box over it and raised DS:c649 (exe 2000:c602). A banner with nothing
standing ahead of the character any more takes the whole block with it (exe 2000:c613). So a
monster that walks up to a character standing still is not named until they move, turn or are
hit — which is what the original does.

A third thing is neither: **the stone tablet**, which is `tablet.ts` and `FUN_3000_9026` (exe
3000:9026). The little snake's four-line messages — the greeting on reaching the town and the
congratulations for a rank gained — are read off a slab of the section's own wall material laid
across the middle of an otherwise black screen, not out of the message box. `game.tablet(...lines)`
is where those go; the session keeps them as `session.tablet`, the tab draws the slab and its
lines in place of everything else, and the key `FUN_3000_9026` waits for is owed the way
`pressAnyKey`'s is and taken in `settle`. `load_level_map` puts the town's up before `movecontrol`
has run a pass, so the loop takes that key before its first. The section boss's taunt is a tablet
too and is not this one: `boss_office_message` (exe 3000:6c9d) blanks the whole display, sets
DS:2412 to 3 so that the slab comes down 0xfa lower, and lays the boss's own panel over the top of
it, so `office.ts` and `boss-office.ts` draw that screen rather than `session.tablet`. The key it
waits for erases the display again, which is what takes its three printed lines off the screen and
leaves `movecontrol` to draw the dungeon afresh. The port keeps the four lines in the message box
as well, where the column beside the map reads them.

The S key's screen is a third. `section-screen.ts` and `manual.ts` are the two halves of
`monster_manual` (exe 3000:c39d): five panels of the section's own wall material across the bottom
of the screen with the section's five monsters standing in them, A to E in their corners, DEAD over
the first panel when that section's Shadow boss is already dead, and the tablet's slab lifted to
the top of the screen for the four lines of MD.BIN the letters turn between. `session.sectionScreen`
is what carries it to the tab. Every line of the big font on it is drawn twice, a fat dark stroke
and a thin bright one over it; a screen line is one line at one place, so the fat pass is drawn with
the pictures and the thin one is the line `manual.ts` prints.

The X key is the other screen of its own. `misc.ts` fills the display with the floor's map and
`display.ts` draws it, at seven pixels a square over the whole eighty by a hundred and ten, with
`FUN_2000_bf91`'s way to the section boss beside it. The character's own square is refilled in a
new colour on every poll of the keyboard (exe 2000:d2fe), so it walks the palette from entry 0 and
round again; that is a little canvas of its own over `expandedMarkerRect`, beside the arrow's, at
the crawl's pace.

Taking a module teleporter is a fourth: `FUN_4000_771b` (exe 4000:771b) fills the screen with
black and draws an outline for every inset from the middle out to the edge, in colours that fall
away with the distance and with the four corner pixels of each in a second colour, so the flat
picture reads as a tunnel with diagonals running into it. `tunnel.ts` is the drawing and
`GameSession.crossToModule` the order: the tunnel, 150 turns of the gradient bank over it,
"WELCOME TO MODULE" and the module's numeral in the big font, and the plaque's own wait. The
tunnel then stays as the backdrop while the arrival box is read, since nothing paints over it
until `movecontrol` comes round and draws the screen again. Two departures are on
`crossToModule`: the original throws away everything typed while the bank turns, and the port
lets such a key give up the rest of the tunnel the way a key gives up any held screen; and by the
code the key that answers the welcome would answer the arrival box's wait as well, since
`FUN_2000_4054` reads the keyboard without draining it, but the real game leaves that box standing
with its plaque up, so the port takes a key for each. The SORRY! screen for a module that is not
installed is not built, since all five ship here.

`screenTakenOver` is the rest of what was drawn, which is the help, the V screen,
the monster manual, the pages behind the P key and the spell table, all of which draw across the
four 3-D views.

Each of those is drawn on black: the game fills the part of the screen it is about to draw on with
colour 0 first. Most of those fills are lost in the decompilation, so the tab blacks the whole
display out behind such a screen. `clearToBlack` in `src/lib/game/port/screens.ts` is for the ones
that are not — `cast_a_spell` fills the top 0x21c of the screen for its big spell table and the
whole message column for the miniature one — and it leaves the rectangle on the game as
`blackedOut`, which the view carries as `screenCleared` and the tab blacks out instead of the
display. Any other wipe takes that rectangle down again, which is how the screen comes back: the
original repaints it from `movecontrol`, and the port draws a fresh one every time the tab draws.

Both are painted into the frame the four 3-D views are drawn on, by `view3d/text.ts`, in the
faces the game itself draws them in: the vector font of `view3d/stroke-font.ts` for every line at
1024 by 768, and the .FNT glyphs of `view3d/menu-font.ts` for the key menu's own words. The
render script draws with the same function, so a PNG of the screen and the tab are the same
picture. With the top-down map shown in the screen's place there is no frame to paint on, so the
message box beside it is `MessageBox.svelte` and a screen that has taken the display over is a
`GameScreen`, both of them in the web font; only such a screen covers the map, since the views it
draws across are not there to draw it on.

A menu is a screen and a `choice`:

```ts
showHint(game, TELEPORTER_MENU);                // the lines the menu prints
const chosen = await session.choice([0x31, 0x32, 0x33]);
```

### How fast a screen appears

The Redraw speed slider on `ScreenSwitch.svelte` is the tab drawing a screen the way a machine
slow enough to watch drew one, over the time the slider is set to, Instant at one end and two
seconds at the other. The choice sits beside the mode and the display in `mode.ts`, one per game,
and it is display only — the frame is worked out and finished before any of it is shown, so the
game, the monsters' clock and the run log come out the same whatever it is set to.

Dungeons of the Unforgiven's screen appears the way the game drew it. While the slider asks for
a slow redraw the frame keeps a journal of every paint made on it, in order — a rectangle
filled, a line, a row of a scaled picture, a column of a wall face, a glyph — and the canvas
replays the journal, each paint copied once the pixels before it have had their share of the
time (`view3d/journal.ts`, with the copying in `view3d/canvas.ts`). The order is movecontrol's:
the map window and the boxes first, then the four views as `draw_3d_view` paints them — forward
from the character's square, the wall ahead and then the sides, and back again far to near —
then the lines printed. Moraff's World and Moraff's Revenge keep a plainer reveal, from the top
row down, which `view3d/wipe.ts` is the arithmetic of.

The views are also drawn only when no key is waiting, as `movecontrol` draws them (it tests
kbhit before the drawing), so keys typed ahead leave the four views as they were while the map
follows every step; the views catch up once the keyboard is idle. The engine keeps the square and
the facing they were last drawn from (`viewsFrom` on the view) and the screen draws them from
there.

Three things about it are decisions rather than arithmetic:

* **A frame that arrives mid-reveal takes over** rather than waiting: a journal starts again
  from its first paint, and a top-down wipe carries on from where its cursor stands, round the
  bottom and back, so that no row is left showing a screen the game had already moved on from.
  Typing faster than the reveal therefore never queues screens up.
* **What no paint covers goes up at the end.** A frame starts black and a line the game has
  taken off the screen is simply not drawn, so the journal names none of those pixels; the whole
  frame is copied once its last paint is down.
* **A frame the game holds is a frame** (`timed.ts`, and `rev/held.ts`), so a message left up for
  two seconds appears the same way everything else does. Two things are still painted whole: a
  fade repaints many times a second of its own accord and would undo a reveal as it started, and
  a canvas that goes off the page finishes what it was drawing at once, which is the rule the
  arrow's flash and the two animations already keep. The crawl repaints as often and does the
  opposite, since it runs on nearly every screen of the dungeon: it leaves a reveal alone until
  it is done.

## A fight

`fight.ts` is the F key, one swing, and Ctrl-F, which keeps swinging. `kill.ts` is the check
movecontrol makes at 2000:db6d, between the key and the step: a monster being fought whose hit
points have run out is killed there, whatever took them down, so a spell and a hand grenade end
the same way as a swing. `kill_monster` asks its own menus — what to do with a dropped weapon or
suit of armor, and which weapon a section boss's orb is used on — through `game.choice`, and the
drops, the money and the levels all hang off it. Every box it prints in between waits for a key,
which is what `printMenusWhile` is for.

A monster whose hit points have run out gets a skull and crossbones painted over it first (exe
2000:dafb), into the rectangle the view drew its picture in — whichever of the four views the
monster was standing in, which DS:049d names — and it stands there through every box the kill
prints and every message it holds. `dotu-tools/docs/SCREEN.md` has where the rectangle comes
from; `session.killed` is what carries it to the tab, and the loop clears it where the original
clears DS:049d. The frames the kill's delays leave up carry the skull as it stood when each was
taken, since the original's own screen keeps it there as surely as it keeps the words beside it,
and a kill that asks no menu would otherwise be past it before the tab had drawn it once.

The character's own death is asked about next (2000:dbe9), and the step the key asked for is
resolved after that, so a key that killed the character never takes the step it wanted.

The keys the player presses while the character is swinging are thrown away by `flushKeys`, which
is the flush the original does at the end of every swing. That is also what stops Ctrl-F: reading
the keyboard at all puts the repeat-fight flag down.

## The Fight tab

`fight-sim.ts` and `FightTab.svelte` are a fight on its own, without the walk to it: a copy of a
character off the roster with its numbers typed over, one monster of a chosen kind, level and hit
points standing in front of them, and the same engine between the two. Nothing in it is a port of
anything — the original has no such screen — and it reuses the Play tab whole: `Screen.svelte` for
the screen, `Panel.svelte` for the numbers the game never prints, and `runMoveControl` for the
fight itself.

Four things about it are decisions rather than arithmetic:

* **It is set on a dungeon floor and not in the town**, although the town is where
  `battle.test-support.ts` puts its fights. `call_check_eng` (exe 2000:a319) hands out no attacks
  at all while the character stands on floor 0, so a town fight is one-sided. The floor is one the
  monster can really be stocked on, which is what makes the section the game loads its monster
  table from the monster's own.
* **The floor is emptied first.** `load_level_map` stocks 145 monsters and a fight wants one, so
  the rest go; an empty floor is the floor a character who had killed them all would be standing
  on.
* **The monster arrives on a second press.** cast_a_spell refuses a preparation spell with a
  monster engaged (exe DS:206f) and `movecontrol` engages one on its first pass, so a monster put
  down at the start would be a monster no preparation spell could be cast against.
* **A spell button presses the player's own keys** — C, the list's digit and the spell's letter —
  so the spell is cast_a_spell's and nothing here works out what a spell does. The copy is given
  the spell in its book first, since the menu ignores the key for a spell the character has none
  of and goes on waiting for another. Before the monster is sent in the spell's cost is lent to
  the copy for the length of the cast and put back afterwards, so setting a fight up costs no
  spell points — the same spell off a scroll or a wand would have cost none either. Once the
  fight is on the copy pays, and the game refuses what it cannot afford. The tab holds its screen
  where it was for the three keys, so the list menu and the spell table do not flash past.

The session carries no `RunRecorder`, so nothing fought here is written down as a run, and its
`CharacterFile` writes nowhere: `died` does nothing, so a character killed in the simulator is
not marked dead on the roster.

**What a fight came to** is `fightSummary`, which adds up the events the game pushed: the swings
and what they landed, the blows and breaths the monster answered with, the levels, experience and
characteristics a drainer took, the spells cast, and the moves and seconds spent. It reads the
session's whole event list rather than a slice of it, because a fresh fight starts with an empty
list and a clock at nought, so everything on it belongs to this fight — the spells cast while
setting it up included. `fightSummaryLines` is the words, and the tab prints them beside the
screen as soon as either of the two is dead. A run's summary (`summary.ts`) does not serve here:
it is folded per kind of monster over a whole run and counts the walking and the shopping a
fight has none of.

**Every finished fight is kept** in `fight-history.svelte.ts`, a module-level list that lives for
as long as the page does and is written nowhere else — not to the roster, not to the browser's
storage, not to the run server. A fight is kept with the character as the form had typed them,
the monster it was fought against, the spells cast before the monster came in, and the summary,
so that changing one number and fighting again leaves the two side by side. The tab shows a table
of every fight kept against the monster the form has picked, the most recent first, with a Delete
on each row and a Clear for the lot; the character's columns are `FIGHT_COLUMNS`, which is the
setup form's own fields, so the table and the form say the same words for the same number. A
fight left before the monster was ever sent in is not a fight and is not kept.

**The full log** is `fightJournal`, which turns the fight's events into lines with the run
journal's own `journalEntry` and `unforgivenJournal` (`journal.ts`), so a fight reads in the words
a run reads in. Each line is stamped with how many moves into the fight it happened rather than
with a run's action count, since nothing fought here is part of a run. The tab folds the lines
away behind a "Full log" under the summary and under each kept fight's row.
`src/lib/journal/RunJournal.svelte` is not reused for it: that component prints a run's own
summary in a run's words and groups its lines by the floor they happened on, and a fight has one
summary of its own and one floor.

## The moment

`passMoment` (exe 2000:a53c) is in `src/lib/game/port/moment.ts` with the two halves of a step it
belongs between:

```ts
leaveSquare(game);      // FUN_2000_bcb6: off the occupancy grid
pc.x += 1;
arriveSquare(game);     // FUN_2000_bce5: back on it, the regeneration rings, the seconds a step
                        // costs half the time, then passMoment
```

A key that costs the character time calls those; a key that only opens a screen does not. The
loop runs nothing of its own afterwards, exactly as the original does not: the moment belongs to
the action.

## The floor

`session.enterFloor(level)` is `load_level_map`: it generates the floor from
`src/lib/map/game.ts`'s descriptor, loads the section's monster descriptions and stocks it. It
also marks where the character has landed — `MapMemory.markArrival`, which says why — since the
map the tab draws behind an arrival's box would otherwise be blank.
Stocking is `src/lib/map/stocking.ts`, which is already a port of `stock_level` and is the only
one — the game's three-floor memory around it lives in `FloorMonsters`, so coming back up a
ladder finds the monsters where they were left.

A game played on the clock stocks the way the original does as well. `stock_level` starts its
generator again before every try at a monster's square, from the tick counter plus the slot and
the number of tries the floor has taken (exe 2000:6979), and seeds that close together answer with
numbers that climb in a straight line, so such a floor holds its monsters in diagonal stripes
rather than scattered about. `floor.ts` hands that reseed to the stocking; the map explorer and a
game with no clock hand none and get the even spread.

The monsters the map draws are worked out from the occupancy grid (`drawnMonsters`), so a monster
that has been killed and taken off the grid stops being drawn without anything else being told.

## Play modes

`mode.ts` is how much of the game a tab shows, which the browser remembers for each game and
which both tabs offer as three radio buttons:

* **faithful**, which is what a game is played in until the player says otherwise — nothing the
  game itself does not show. The map is the one the character has discovered (`memory.ts`), drawn
  the way the game's own map draws it: an unknown square is nothing at all, a secret door and a
  module teleporter are plain walls, and a chute is marked only once the floor has been left and
  come back to. No panel of hidden numbers, and no monster but the ones the four 3-D views drew
  this turn, plus the one being fought, which the game names itself.
* **speedrun** — the whole floor, so that a run need not be planned against the maps elsewhere
  on this site, but only the monsters faithful marks, since the monsters are rolled afresh every
  game, and still none of the hidden numbers.
* **debug** — everything: the whole floor, every monster on it, the panel of numbers below, and
  the three things below that the other two modes never show.

### What debug mode shows on the game's own screen

None of this is a port of anything — no game ever drew any of it — so it belongs to debug mode
alone, and it goes onto the game's own screen rather than into a box over it. Moraff's Revenge is
left out of all three: its map draws seven-pixel cells in four colours, where a picture would be
mush, and its monster records carry nothing beyond a name, a level and what it hits with.

* **A monster's picture on the map in the corner.** `zoom-thumbnails.ts` shrinks the picture the
  3-D view draws that monster with to a square of palette entries with a hole where the picture
  has none, and `zoom-monsters.ts` draws it in the middle of the monster's cell. A pixel of the
  cell is left showing at every edge, so the square's four walls, its door ticks and its four
  corner dots are all still readable around the picture: on the ten-pixel cells of the map beside
  the views that is eight pixels a side, and on the seven-pixel cells of the map the X key fills
  the screen with it is five. A monster the bundle has no picture for keeps the plain red square.
  Each game's store (`monster-thumbnails.ts`) shrinks one picture once per kind and size and keeps
  it for the life of the tab, since the tab draws the whole frame again on every keypress.
* **What the monster being fought does beyond an ordinary hit**, under the numbers already over
  the view it stands in: the drains, the breath, the poison, the disease and the rest of what the
  29-byte record carries. The words are `describeEffects`, which is what the Monsters tab says
  about the same monster, so the two pages never describe one monster two ways. The tab's
  sentences are wider than either game's view, so they are broken on the spaces between words at
  the width the view leaves — about fifty characters in Dungeons of the Unforgiven's forward view
  and about eighteen in each of Moraff's World's four.
* **A monster's full details, from a click on its picture.** The click is scaled back to the
  game's own pixels and read off whichever map is up (`zoomMapMonsterAt`), and what opens is the
  Monsters tab's own card for that monster, in the panel the Spells tab reads a spell in
  (`ui/Overlay.svelte`), with a button through to the tab itself. The whole cell answers rather
  than the picture's own pixels, since a cell is ten pixels of a screen the tab scales down to
  fit. Nothing here touches the game or the run log: the keyboard belongs to the card while it is
  up, so no key reaches the loop, and Escape shuts it.

A revealed floor stops at the rock. Dungeons of the Unforgiven's `solidcheck` and Moraff's
World's `is_solid` (WORLD.EXE 3000:a854) both call a square rock when it has a wall on all four
sides, and nothing can ever stand on one, so neither game's own map holds one: the map on the
game's screen and the top-down map both leave them blank, and a revealed floor looks like a
walked one rather than a lattice of cells. Moraff's Revenge has no rock to leave out — a ladder,
a chute or a Potion of Relocation can put the character on a square walled on all four sides —
so its revealed level draws every one of them.

Four functions are all a tab asks of it: `panelVisible(mode)`, `monstersDrawn(mode, view)`,
`mapDrawn(mode, memory)`, which hands `FloorCanvas` the discovered map or nothing, and
`sidePicturesVisible(display)`.

The swatch of the floor's wall texture stands beside the map, where nothing else draws it. With
the game's own screen on the stage the views draw it on every wall already, so every mode
leaves it off until the map is chosen. The monster in front of the character is the map's own
heads-up display's (`MapHud.svelte`), centred at the top of the map, since the map is the
site's view and the game's screen is the game's (John, 2026-09-09).

A switch under the display's own — standing there only while the map is up, and remembered the
way the other switches are (`mode.ts`) — draws the game's forward-facing 3-D view in that same
frame instead of the picture (`ForwardView.svelte`). It is `renderView`, the port of
`draw_3d_view`, on the scene `view-scene.ts` builds for the game's own four views, so the
corridor, the monster standing one square ahead and the skull over a kill are the game's own
drawing and not anything of the site's; the bar of that monster's hit points goes on standing
beside it. The coin flip that mirrors a monster comes from a generator seeded on the number of
the drawing, so the view spends none of the game's own random numbers and a replay is untouched.

A screen of pictures is the game's own either way. The map has nowhere to put the S key's screen,
the module teleporter's tunnel, the tablet, the boss's office or the X key's map, so for as long
as one is up `Screen.svelte` covers the map with it, letterboxed at 4:3, and the map is back the
moment the game takes it down. Both displays draw that screen from the one snippet in
`Play.svelte`, so they cannot come to show it differently; Moraff's World does the same with
`MwScreen.svelte` for every screen of its own.

A page that is only lines on a display the game has cleared — the character sheet, the help pages,
the spell tables — is laid over the map rather than covering it (John, 2026-09-15). `Play.svelte`
prints `view.screen` through `ui/GameScreen.svelte` in the same 4:3 window, over a wash that dims
the map without hiding it, and blacks out the rectangle `view.screenCleared` names so that a
partial fill like the spell table's is as black here as it is on the game's own screen. A screen
whose rectangle the port does not know fills the whole display in the game, and here the wash
stands in for it. The message box in the column beside the map goes on showing the box's own lines
throughout one of these; a screen of pictures carries the box itself, so the column leaves it off.

The mode belongs to the tab, and each session carries the one it is being played in as
`session.mode`, so that anything keeping a record of a run can say which mode it was played in.
Nothing the game does reads it.

## The side panel

`session.view()` is what the tab draws, and it is where the panel of numbers looks:

| field | what it is |
| --- | --- |
| `place` | where the character is standing and which way they face |
| `hp`, `maxHp`, `sp`, `maxSp` | the hit points and spell points, and what they can hold |
| `level`, `exp` | the level the character has been given and the experience they have earned |
| `rows` | the floor, as the map descriptor generates it |
| `monsters` | every monster standing on the floor, for the map |
| `box` | the message box: its eight lines and the bar above them |
| `screen` | the screen the game has taken the display over with |
| `fade` | the palette fade the tab is running over it (`fade.ts`), or none |
| `prompt` | the ladder or doorway box |
| `seconds` | game time spent, which `call_check_eng` counts |
| `engaged` | the monster being faced, with its level and hit points |
| `ahead` | that monster is the one straight ahead, which is when the game draws its picture |
| `over`, `dead` | the loop has come back |

`session.game` is the whole `Game` for anything else — the spell timers, the poison and disease
clocks, the wand and scroll counts are all fields of `session.game.pc`.

`panel.ts` is where those are read, one function per block the panel shows, each of them pure and
each naming the function of the game its number comes from: the moves left on every battle spell
in `view_battle_spells`' own order, the spells in effect that have no timer, the poison and
disease clocks `pass_moment` counts down, the charges on every wand, scroll and paper, the
engaged monster with the chance a swing lands from `src/lib/bestiary/to-hit.ts`, what the square
underfoot holds, and the monsters nearest by. The view arrives fresh after every action, and
reading it is what sends the panel back to the record.

## What is not built yet

Nothing. Every key movecontrol dispatches on is answered. The one that is about the screen rather
than the game — Z, which swaps the four views and the zoom map for one view of what is ahead
filling the screen — says what the game would have done, since this port draws the four views
only.

## Where this leaves the original

* **Random numbers from a seed of the run's own.** `SeededRng` in `src/lib/game/port/rng.ts`,
  which is mulberry32 under the game's own `Random(n)`, per the port's third departure. The seed
  is drawn once when the game starts and kept in the run log with every key that follows
  (`run.ts`), so a run can be played again exactly. A test hands the session its own seed.
* **No clock in the game.** The game is turn based: a moment passes per action and nothing
  happens while the player thinks, and the seconds `call_check_eng` counts are game time and are
  kept exactly. The `delay` calls the original busy-waits in are about the screen alone, so those
  the port has are kept as a display timer (`timed.ts`); the flashes while a hole is dug are kept
  as well, on the one line above the message box the original draws them on.
* **The coin flip that mirrors the monster ahead is the number of the drawing.** `draw_3d_view`
  mirrors the picture of the monster being fought on `rand() * 2 / 0x8000` (exe 3000:2323), drawn
  fresh for every view of every drawing. The tab draws the screen again whenever anything about
  it changes, so spending the game's own generator there would put a run's numbers out of step
  with its log. `GameSession.drawViews` counts the drawings the original would have made
  instead — `movecontrol` draws the four views only where the redraw flag is up or the character
  has moved, which is a step, a turn or an arrival and never a swing — and `Screen.svelte` works
  the four flips out from that number alone, so a monster turns to face the other way exactly
  when the game would have turned it and nothing of the game is spent.
* **The screen is the game's own.** `display.ts` and `Screen.svelte` draw what `movecontrol`
  draws — the four 3-D views, the key menu, the zoom map, the battle-spell box, the message box
  and the status block, each where the game puts it. Debug mode swaps the whole thing for the
  top-down map of the floor and the panel of numbers, which is the only place on the site a floor
  can be read square by square while it is being walked. The zoom map shows the squares the
  character has discovered in faithful and every square in the other two modes.
* **No `?MON.MAP`.** The original reads the floor a character is loaded onto out of their monster
  map file; a browser has none, so a floor is stocked afresh on arrival.
* **The `.DUN` is a row beside the character.** The explored maps are written and read where the
  original writes and reads them — when the character crosses out of the 32 floors in memory, when
  the module changes, and on Q — so a death still loses everything learned since the last of
  those, exactly as it does in DOS. What the browser keeps is a row of the `maps` store of its
  database, keyed by the character's id, holding one bitmap per floor in the game's own row bytes,
  so the Save Editor's download of the record is still the record alone.
* **The character file is the roster entry.** `save_player` writes the record back through
  `CharacterFile.write`, which is the real 2,697-byte file with its checksum, so a character can
  be downloaded and played on in DOS. Death writes nothing, neither the record nor the map, which
  is what the original does; the roster marks the entry instead.
* **The four noises the game makes are made.** `src/lib/speaker.ts` is the PC speaker: one
  square-wave oscillator, because channel 2 of the 8253 holds one frequency at a time.
  `src/lib/game/port/sound.ts` is the game's four wrappers around it — the sweep up when the
  blow lands, the sweep down when the monster's does, the chime over a dead monster and the dirge
  over a dead character — each called where the original calls it and each asking the sound
  switch DS:022b first. The speaker is opened on the first key pressed in the tab, since a
  browser will not start audio that nothing the player did asked for, and a session nobody is
  listening to — a replay, the verifier under Node — never opens one. Nothing waits for a sound
  to finish, exactly as nothing waits for a held frame.
* **The settings menus set almost nothing.** Two of the thirteen switches behind O and G are
  rules of the game rather than of the screen — the high speed option at DS:00c3 and the sound
  switch at DS:022b, both of which the port keeps. The rest are the palette, the mouse, the menu
  highlighting and the 3-D views, and each of those says so in a box.
* **The two hidden keys are left out**: 0xfb turns saving off and 0xfe hands out ten hit points.
