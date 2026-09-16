# The Boards tab

The site's pages over the run server: one game's characters, either all of them
at once or on whichever ranked board is picked — the boards of runs that have
ended and the two of the characters still being played — a page for any run on
them, and the announcements the server has made, with each new one arriving as
it happens. The announcements are the one part of this that is not the tab's
alone: the newest one shows in the footer on every tab, off the same feed.

Which boards there are depends on the way of playing: the game as it shipped has
six, and the endless dungeon has three of its own and no boards of wins, since a
dungeon with no bottom is never won. An endless board is read for one world at a
time as well, so picking Endless puts a world picker up beside the board picker.

None of it exists without a server. The address is fixed when the page is built
(`VITE_RUN_SERVER`, `src/lib/run-server.ts`), and a build made without one is not
offered the tab at all — `tabsFor` in `src/lib/tabs.ts` is where that is decided.
Everything else about the tab follows the game switch the way the others do.

## The shape

- **`Boards.svelte`** — the tab. The leaderboard toggle, the board picker, the
  world picker the endless boards have, the table, and the run's own page in
  place of the board once a row is clicked. It is not kept mounted the way the
  other tabs are: it is a page of what the server has now, so opening it reads
  the boards again. The boards of the living share the picker with the ranked
  ones and have a table of their own, because a row of one is a run that has
  ended and a row of the other is a character still being played: a level and a
  reach in place of a play time and a finish, with a mark for whoever is playing
  right now and when each was last heard from. Everyone
  is the picker's first choice and what the tab opens on; while it is picked the
  leaderboard toggle offers Both, which is the two ways of playing the game as it
  shipped — an endless character is playing another dungeon and is read on its
  own. A board the leaderboard picked does not have takes the reader back to
  everyone.
- **`Everyone.svelte`** — one table of every character of the game the server
  has checked, whatever has become of it. A ranked board answers one question
  and holds the reader to it; this asks none, so the checkboxes above take out
  what they are not looking at and every column heading sorts. Beside how far a
  run got is what the character is now — its class, its health points and its
  six characteristics — read out of the record the server holds for it.
- **`everyone.ts`** — which rows the ticked boxes leave showing and what order
  they stand in. Nothing draws in it, so the whole of that is testable without a
  browser. A group only hides a row it has a box for, and the sort is stable, so
  two characters standing equally keep the order the server sent.
- **`RunPage.svelte`** — one run: who played it, what it came to, the engine
  builds it was played on, its milestones and the verdict the replay gave, and
  under all of it the run written up in words. That last block is
  `src/lib/journal/`, the same one the Play tab shows: the summary at the top
  and the timeline under it, grouped by the floor each stretch happened on. The
  server sends the journal the replay wrote and how far the run had got by the
  end of it; the summary is folded here, so the words a run is described in are
  the site's own wherever it is read. A run of a game this build has never heard
  of came from a newer server and has no words to fold it into, so it shows the
  rest of the page and no journal.
- **`Announcements.svelte`** — the panel down the side, which draws what the
  store below is holding and asks it for the older ones.
- **`announcement-feed.svelte.ts`** — the announcements the whole page is
  following, in one module store. It opens the feed the first time anything
  reads it, asks for the history second so that a run announced while the
  history is on its way is not missed, and is never closed: the footer
  (`src/lib/character/CharacterPanel.svelte`) shows the newest announcement on
  every tab, and the Boards tab is not kept mounted, so a feed that closed with
  this panel would leave the footer deaf for the rest of the visit. One feed for
  the page also means the footer and the panel cannot disagree about what the
  newest announcement is.
- **`server.ts`** — every call to the run server, each one a shape a page can
  draw. A call that could not be made leaves what is on screen where it is and
  says so, so an unreachable server does not empty a board.
- **`feed.ts`** — following the feed. `EventSource` retries a connection that
  drops on its own and says nothing until it has given up altogether, so a
  moment's outage is left to the browser and only an abandoned feed is opened
  again here. What the browser does is behind `FeedWiring` so that the
  reconnecting can be read and tested without one.
- **`announce.ts`** — what an announcement says. The server sends fields and no
  sentence, so this is the one place a row becomes words. Every sentence names
  the character and the player, because an announcement is read on its own among
  other people's runs.
- **`words.ts`** — every fixed word these pages show, and the few turns of
  phrase they put the server's numbers into: how long a run was played, what the
  game's clock counts in, when something happened, how long ago it was said
  where there is only room for that, how far a run got in the currency of the
  board it stands on, and how one endless world is named.

## What comes from the server

The six boards of the game as it shipped are `BOARDS` in `server/boards.ts`, the
endless dungeon's three are `ENDLESS_BOARDS` and `boardsOf` is which a way of
playing has; the two of the living are `LIVING_BOARDS` beside them. All of it is
imported straight from there, so that the two halves never disagree about what a
board holds or what it is called, and so are `hasBoard`, which says whether a
leaderboard has a board, and `CURRENT_ENDLESS_WORLD`, the world the picker opens
on before the server has answered with the worlds there are. `ANNOUNCED_FINDS`
comes from there too: it is the finds a `find` announcement can name, and its
order is what such an announcement's `which` counts in. The row shapes come
the same way. None of the server's code comes with them: the board lists are
tables of names and words, and everything else is a type, which is gone by the
time anything is built.

That is the rule to keep: `server/boards.ts` is the only server module anything
here may import a value from, and it is safe because it reaches nothing but the
tables a board is read from. Every other module there opens the database, the
filesystem or a port, and importing a value from one would pull Node into the
site's bundle.

`server/everyone.ts` is one of those others, so what comes from it is its types
alone — the row and the answer the endpoint sends — and no value at all.

The words a run's own milestones read as are not here either — `milestoneLine`
in `src/lib/play/verify.ts` is what the Play tab and `verify-run` already use for
them.

## Which endpoints

`server/README.md` is the whole list. These pages use seven of them:
`GET /boards/:game/:leaderboard/:board`,
`GET /boards/:game/:leaderboard/living`, `GET /boards/:game/endless/worlds`,
`GET /boards/:game/everyone`, `GET /runs/:id`, `GET /announcements` and
`GET /feed`. The first two take `?world=` on an endless board. None of them
carries the reader's secret: everything on a board has been through a replay
that passed it, and such a run is anybody's to read — a character still being
played included, once its chain has been replayed.
