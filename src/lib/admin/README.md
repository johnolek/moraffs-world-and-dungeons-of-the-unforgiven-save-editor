# The Admin tab

The run server's own controls, on a page instead of in `curl`: every
character the server has with a Delete on each row, the endless world
characters are being rolled into, and making another player an admin.
Behind it are the endpoints under `/admin/` in `server/README.md`, and
nothing here can do anything they cannot.

## Who sees it

Nobody but the admin, and nobody else learns there is a tab.

The endpoints take a passphrase and nothing else — the six words a name
was claimed with or signed in with, which the browser now keeps
(`myPassphrase` in `src/lib/player.ts`). As the page loads, `whoAmI` asks
`GET /admin/me` with those words; a yes puts the name in `app.admin` and
`tabsFor` in `src/lib/tabs.ts` draws the tab, and everybody else is
answered the same 404 a path the server does not know is answered and
has no tab at all. A browser that keeps no words, and a build given no
run server address, ask nobody.

It is asked once a load. A browser that signs in as an admin part-way
through a visit gets the tab the next time the page opens.

Nothing about being an admin is written down in the browser. A player
who stops being one is answered no on their next visit.

## The shape

- **`Admin.svelte`** — the tab, which is the three blocks under a
  heading. It is not kept mounted, for the same reason the Boards tab is
  not: it is a page of what the server has now, so opening it asks
  again.
- **`Characters.svelte`** — every character here, whoever's it is, fifty
  at a time with a More button under them. It is the one list with
  everything in it: a board shows only what a replay has passed and a
  player's roster shows only their own. Delete asks first, naming the
  character, the player and the game, and takes the row out of the list
  once the server says it is gone.
- **`characters.ts`** — which rows the filter box leaves showing, and
  the words for the two columns whose values are the server's own.
  Nothing there draws, so all of it is tested without a browser. The
  filter looks only at the rows read so far, because the server hands
  out a page at a time and has no search of its own.
- **`EndlessWorld.svelte`** — the world endless characters are being
  rolled into, and a number and a button to open a new one. An empty box
  asks the server to draw a world. The new world is only for characters
  rolled from now on; every endless character already rolled keeps the
  one it has, which is what the line under the box says.
- **`Admins.svelte`** — a name and a button. The player has to have
  claimed the name already: this flags a row and does not make one.
- **`server.ts`** — every call, each one carrying the passphrase in an
  `Authorization` header. A refusal comes back as the words the server
  refused with, which is what the blocks show, because the server is
  where the rules about an admin live.

## Which endpoints

`GET /admin/me`, `GET /admin/characters?page=`,
`DELETE /admin/characters/:id`, `POST /admin/admins` and
`POST /admin/worlds/endless`, all of them in `server/README.md`. The
world showing when the tab opens comes from `GET /worlds/endless/current`
through `loadCurrentEndlessWorld` in `src/lib/boards/server.ts`, which is
the same call the character roller makes and needs no passphrase.
