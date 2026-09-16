# Run server

One Node process that answers HTTP on a port, keeps everything in Postgres, and
allows the site's origin. It answers `GET /health`, the players endpoints, the
two runs endpoints, the player's characters, the admin's own endpoints, the
boards, the boards of the living, everyone and the announcements below, which is
[MORF-367](https://projects.johnoleksowicz.com/projects/MORF/items/MORF-367).

It also serves the tools themselves at `GET /`, so its domain is somewhere to
play as well as somewhere the site talks to, which is
[MORF-405](https://projects.johnoleksowicz.com/projects/MORF/items/MORF-405).
That is the only path the page is at: the site never changes the URL, so every
other path the server does not know is a 404 as it always was.

It lives in this repository so one commit is one engine build: the code that
will replay a run to check it is the same code the site played it with.

## The database

Everything is in Postgres: the players, the characters, the sittings and the
stretches of keys, the verdicts, the announcements and the engine builds
themselves. The box the server runs on keeps nothing, so the container can be
rebuilt or moved with no volume under it.

It wants a role and a database of its own, and makes everything else itself:

```sql
CREATE ROLE moraff LOGIN PASSWORD 'something';
CREATE DATABASE moraff_runs OWNER moraff;
```

The server makes a schema called `moraff` inside that database the first time it
starts and puts all its tables there, so the database may hold whatever else is
kept in it and nothing of this server's lands in `public`. Every connection is
opened with `search_path` set to that schema, which is why no query names it.

The schema is a directory of numbered files, `server/migrations/`. Each runs
once, inside a transaction, and its name goes in `schema_migrations`; a start
runs only the files the database has not seen, so a deploy needs no migration
step of its own. A file that has been applied is never edited afterwards —
a change to the schema is a new file with the next number.

## Build and run

Node 24 or later.

```bash
pnpm build:server     # bundles server/ into dist-server/main.mjs
pnpm build:engine     # bundles the engine into server/engines/<commit>/engine.mjs
pnpm publish:engine   # puts that build in the database
pnpm start:server     # runs dist-server/main.mjs
```

The build is one self-contained file: the migrations and the Postgres client are
read into it, and only Node's own modules are imported at run time.

The page it serves at its root is not in that file. `pnpm build` writes it to
`dist/index.html` — one file with the whole site inlined, the same one GitHub
Pages is given — and the image carries it beside the bundle. It is read once at
start, and a server that finds none there starts anyway and leaves its root the
404 it would otherwise be. That is what a checkout that has never built the site
is, and what the tests are.

## Configuration

| Variable            | Default                      | What it is                                      |
| ------------------- | ---------------------------- | ----------------------------------------------- |
| `DATABASE_URL`      | none, and it must be set     | The Postgres to keep everything in, e.g. `postgres://moraff:something@127.0.0.1:5432/moraff_runs` |
| `RUN_SERVER_PORT`   | `3580`                       | The port to answer on, behind the proxy          |
| `RUN_SERVER_ORIGIN` | `https://johnolek.github.io` | The site's origin, which browsers are told may read the answers |
| `ADMIN_PLAYER`      | none, and then nobody is an admin | The name of the player to make an admin at start, e.g. `John` |

There is no default for `DATABASE_URL`: a server with nowhere to keep anything
says so and stops, rather than starting and connecting to whatever is nearest.

A page served from `http://localhost` on any port is allowed as well, so
`pnpm dev` can talk to a server running on the same machine.

Checking it is up:

```bash
curl http://127.0.0.1:3580/health
# {"ok":true,"engineCommit":"<the commit it was built from>","engines":["<and the ones it keeps>"]}
```

`engineCommit` is how you tell which build is deployed, and `engines` is every
commit it can replay a run played on: a run can only be replayed by the engine
that played it, so the server has to be able to name what it is carrying. A
commit ending in `-dirty` was built from a working tree with changes in it and
nobody can check that build out again.

## Players

Nobody signs up. The site makes each browser a random 32-byte secret, written
base64url, and sends it as `Authorization: Bearer <secret>`; the server keeps
only its SHA-256, so it can recognise a secret it is handed and cannot hand one
out. Names go first come and are compared without regard to case.

One name can be played from several browsers. Every secret that has been let in
is a row of `player_secrets` pointing at the player, and a second device gets a
row of its own by saying the name and the passphrase below.

| Endpoint                   | What it does                                                     |
| -------------------------- | ---------------------------------------------------------------- |
| `POST /players`            | `{ "name": "..." }` claims the name for that secret, or renames it. 200 with the name that stands, and with `passphrase` beside it when the claim made a player; 409 when another player holds the name, 400 when the name or the secret is not one. |
| `GET /players/me`          | 200 with `{ "name": "..." }`, or 404 when that secret has claimed no name. |
| `POST /players/sign-in`    | `{ "name": "...", "passphrase": "..." }` joins that secret to the player who holds the name. 200 with the name, 401 when the name or the passphrase is wrong, 409 when the device has a name of its own already, 429 when too much has been guessed at lately. |
| `POST /players/passphrase` | Draws that secret's player a new passphrase, which retires the one they had. 200 with `{ "passphrase": "..." }`, 403 when the device has claimed no name. |

A name is 2 to 24 characters of ASCII letters, digits, spaces and `. _ - '`,
trimmed, which rules out every control character and everything a page would
have to escape to show. Two names that differ only in case are one name: the
unique index is on `lower(name)` and every lookup folds the same way.

Losing the browser's storage loses that secret, and nothing here gets it back;
what gets the name back is the passphrase, said from any browser at all.

### The passphrase

A claim that made a player is answered with six words drawn at random, and that
answer is the only time anybody can read them: what is kept is a scrypt hash of
them under a salt of that player's own, so the server can recognise the words it
is handed and nobody holding a copy of the database can say them. The words are
compared folded to lower case with the spacing evened out, so however somebody
types the six words off a piece of paper is the same passphrase.

A player who claimed their name before any of this existed has no passphrase
at all, and `POST /players/passphrase` from the device they claimed it on is how
they get one.

The words come from the EFF's short wordlist #1 — 1,296 short words picked to be
easy to say, spell and tell apart — which is `server/wordlist.txt`, kept exactly
as it is published at <https://www.eff.org/dice> by the Electronic Frontier
Foundation under CC BY 3.0 US. Six words out of 1,296 is near enough 62 bits.

A wrong name and a wrong passphrase are one answer on purpose: telling somebody
guessing which half they had right tells them which half to keep guessing at.

Five wrong tries in a quarter of an hour and the rest are turned away with a 429
without being looked at. A failure counts against the name it was tried at and
against the address it came from, so neither one name guessed at from a hundred
machines nor one machine working through a hundred names gets far. It is all in
memory (`server/attempts.ts`) rather than a table: a restart forgets every
failure, which is a few free tries for anybody guessing during a deploy.

That address is the first hop of `X-Forwarded-For` where the request carries
one, because Coolify's proxy is what the socket belongs to and every request
arrives from it; where there is no such header it is the socket's own address. A
server reached with nothing in front of it is handed that header by whoever
asked and could be told anything, which is why nothing but the slowing down of
guesses is decided by it.

## Runs

A run arrives while it is being played rather than whole at the end. The site
sends what has been played every five seconds and when the game is left, and
the server stamps each stretch as it lands. That is the whole reason for the
shape: the page a run is played in is the player's own, so it cannot be asked
how long the run took, and the stamps are an answer the server owns.

| Endpoint                      | What it does                                                     |
| ----------------------------- | ---------------------------------------------------------------- |
| `POST /runs/:id/batches`      | Takes one stretch of a run. 200 with `{ "received": <sequence> }`, 403 when the device has claimed no name, 409 when the character belongs to another player, is being played on another device, has been played on somewhere else since, or a sequence comes back holding another stretch, 400 when the body is not a batch or names a sitting the server was never told about. A refusal carries `because` beside the words, which is what the site acts on. |
| `GET /runs/:id`               | The character, who played it, the sittings it was played in with the engine build each names, how it ended, the verdict on it with the milestones the replay reached, the journal the replay wrote with how far the run had got by the end of it, and whether another device of the player's is playing it now. The journal is the verdict's for a run that has ended and the last snapshot's for a character still being played, and it goes out once rather than inside the verdict as well. A run a replay has passed is anybody's to read: that is a verified verdict for a run that has ended, and a verified snapshot for one still being played, which is what a row on a board of the living opens. A run nothing has been checked about, one that failed and one that could not be checked take the secret of the player whose run it is. 404 when nothing has been played under that id. |

`:id` is the id of a roster entry in somebody's browser. The character is made
known by its first batch and belongs to the player whose secret sent it, so
nothing is registered anywhere and no second player can send for it.

A batch is the keys played since the last one, how many of them the player
pressed, what the sitting claims to have come to, and the character itself; the
first batch of a sitting carries the seed, the engine commit and the record a
replay starts from. The sequence is the site's count of the batches of that
sitting, and the server keeps one stretch under each sequence. A batch whose
answer was lost is sent again under the same number holding the same keys, and
is recognised rather than played twice; everything played while it was in the
air goes in the batch after it rather than being folded into it, since the
server would take the sequence it already holds and the difference would be
gone. A sequence that comes back holding another stretch is refused, and
nothing about the run changes.

A batch that carries its own sitting is a different matter, because it always
carries that sitting from its first key: the first batch of a game holds
everything played so far, and a sitting the server was never told about goes as
one batch of the whole thing. Every new sitting sends the ones before it that
way, since the device cannot know which of them the server was ever told about.
So where the server already holds that sitting, what is new about the batch is
only the keys beyond the ones already kept, and they go in as a stretch of
their own after them. Anything else about a sitting already here — another
seed, another moment, keys that do not go on from the ones here — is a second
run of the same character played somewhere else, and is refused as having moved
on.

### The character, and the lease

Every batch of the sitting being played carries the character as the device
holds it now: the record, the squares it has discovered, and the rest of what a
roster shows about it. The chain says how the character got where it is, but
reading that back is a replay of every sitting it has ever been played in, so
the character itself rides along with the keys and the newest one sent is what
another device picks it up from. The maps are left out of a batch whose maps are
the ones the batch before it carried, since they are by far the biggest thing
there and most keys change nothing about them.

The stretch of keys and the character go in together, in one transaction on one
connection, with the character's row locked for the length of it. They are two
halves of one fact — this is the character, and these are the keys that brought
it here — and a server that took one without the other would hand the next
device a character its run cannot be followed to.

That lock is also what makes two devices playing one character one after the
other rather than two racing sets of statements, and the lease is what stops
them playing it at once. A batch leases the character to the device that sent it
— named by the SHA-256 of that device's secret, the same hash a player is
recognised by — for **half a minute** past its arrival, which is six times the
sending interval. A batch from another device inside that lease is refused 409
`leased`; once it has lapsed the next device to send takes it over. The site
asks `GET /runs/:id` before it starts a game so that the second device is told
rather than finding out five seconds in.

### Play time

The run's wall clock is the sum of the gaps between the batches of one sitting,
counting a gap only when it is no longer than **three times the sending
interval**, which is 15 seconds. Anything longer is time the player had left the
game and counts for nothing, which is what makes a speedrun of a character that
takes twenty hours possible at all. The first batch of a sitting has no batch
before it, so the stretch of play in front of it — at most one interval, and
everything played before the server was ever told about the character — counts
for nothing either.

A stretch carrying more keys than anybody could have pressed in the time it
covers — more than **20 a second**, over its gap and a second's grace — takes
the run off the wall-clock board and leaves everything else about it alone: it
keeps its actions, its milestones and its verdict. The grace is there because
the last batch of a run goes the moment the character dies, right behind the one
before it.

Only presses are counted, not inputs: a held Ctrl-F swings on its own, Moraff's
Revenge's clock ticks are inputs of the log too, and a run played on the clock
writes a reading of the machine's tick counter in front of every input it makes.
Nobody pressed any of those.

### The verdict

The batch that ends a run — a death or a win — is answered at once and the run
goes in a line to be replayed behind it, because replaying a long run takes
seconds. The site asks `GET /runs/:id` until the verdict is there.

Only a run there is something to rank is checked at all. Every character of a
player with a name is kept here, and most of them are nobody's competition: one
rolled for no board is played for its own sake, and debug is the mode with the
game's hidden numbers on the screen. Those get their saves and no verdict, so
nothing is replayed for them and nothing is announced about them, and the site
knows not to wait for a verdict that is not coming.

Each sitting is replayed by the engine build it names, and the server walks the
chain between them, carrying what the run had come to and the record the
sitting before it ended with from one build to the next. So a run played across
several commits is checked by the engines that really played it. A build
deployed before it could replay a single sitting can only be handed a whole
chain: where the chain names one of those, all of it goes through the build of
its newest sitting in one piece, and the verdict's notes say which of the two
happened. A run any sitting of which names an engine not kept
here is unverifiable rather than failed. `eligible` is whether the run may go on
a board at all: verified, and with no record ever written into the character
from outside the game.

A run of Dungeons of the Unforgiven may be played on the clock, and its keys then
arrive with readings of the machine's tick counter among them. The game reseeds
its generator from that counter before a swing, the way the original does, so
what the swing rolled is the reading rather than the next number of any sequence,
and no replay could reach it from the seed and the keys alone. A reading rides in
a stretch of keys as an input of its own — one at or below -0x1000, with the tick
as the distance below it, counted in 1/18.2 of a second from the moment the
sitting began — so nothing here handles it specially: it is kept, put back into
the log and handed to the engine with every other input. A run whose readings
were altered on the way fails its replay exactly as one with an altered key does.

A character may also have been rolled to play the endless dungeon, whose floors
go on below the bottom of the module the game itself stops at. Two things about
such a run are no part of its keys. One is the world it was rolled into, the
number that decides which of the game's twenty sections each endless section
borrows its monsters and its look from: it is a column on the character's row,
sent with the character on every batch, and written into every sitting of the log
the engine is handed, since a character plays its whole run in the world it was
rolled into. The other is what the character carries that its 2695-byte record
has no room for — the trap door keys found below floor 179, and the squares the
Shadow bosses of the sections past the twentieth were left on. That is a column
on the character's row as well, and it is there for one reason: it is what the
next device the player signs in on is handed, the way the record is. The verdict
is not read off it. Replaying a sitting hands back what the character was
carrying when it ended, and the walk along the chain hands that to the next
sitting the way it hands over the record, so a device that sent a state its keys
do not account for fails its own next sitting rather than passing one.

### The journal

The verdict keeps the run written up in words as well, in `journal`: everything
the run did, one line at a time, with how far the run had got when each was
written. That is what a run's page shows as its timeline. A run log carries no
journal — a replay of the log writes the same lines again, which is the whole
reason the site leaves it out of the export — so what a reader sees is the
engine's own account of the run rather than anything the site said about it.

The summary under the timeline is not kept here. It is a fold of the journal
and the two numbers the verdict already carries, and folding it means the
game's own names for its monsters, its spells and its money, which is the
engine; this server keeps no engine of its own and loads one per commit. So the
site folds it out of the journal, the same way `pnpm verify-run` does.

## The characters

A character belongs to the player rather than to the browser it was rolled in.
Sign in on a second device with the name and the passphrase and the roster is
there: every character with its record, the squares it has discovered and the
chain of sittings it has been played in. The device keeps its own copy, so play
goes on with the server unreachable and catches up when it is back.

| Endpoint                             | What it does                                      |
| ------------------------------------ | ------------------------------------------------- |
| `GET /players/me/characters`         | Every character of that player, oldest first: the newest record and maps any device of theirs sent, what a roster shows about each, the chain of sittings it has been played in with how many keys each holds, and whether another device of theirs is playing it now. 403 when the device has claimed no name. |
| `GET /players/me/characters/:id/run` | The whole chain of one of their characters with the keys of every sitting, which is what the roster above leaves out. 200 with `{ "run": [...] }`, 403 when the device has claimed no name, 404 when no character of theirs has that id. |
| `PUT /players/me/characters/:id`     | Takes one character as the device holds it now — the same character a batch carries, with the game and the name beside it — and makes it known where the server has never been told about it. 200 with `{ "kept": "<id>" }`, 403 when the device has claimed no name, 409 when the character belongs to another player or is being played on another device, 400 when the body is not a character. |
| `DELETE /players/me/characters/:id`  | Forgets one for good: its run, the verdict on it and whatever was announced about it go with it. 404 when no character of that player's has that id, which is also what a character of somebody else's is answered with. |

A character reaches this list by being played, since the first batch of a
sitting is what makes one known here, or by being sent on its own with the PUT
above, which is what a device does with an edit made in the Save Editor while
no game is running. Without that the edit would wait for the next sitting and be
lost if another device played the character first.

That PUT respects the lease and never takes it. A character another device is
playing at this moment is having its record written by that device after every
key, so an edit landing in the middle of that would be written over by the next
batch; the device is told 409 and the edit stands where it was made. A device
playing a character sends nothing this way at all, since its batches are
already carrying the character.

The roster carries the chain without the keys of its sittings. Moraff's Revenge
writes an input for every tick of its monsters' clock, five a second while the
game is open, so a chain of it is megabytes and a roster of them is worse; and
nothing on a page load reads a key. What goes instead is how many keys each
sitting holds, which is all the merge on the site's side compares: the server's
copy stands unless the device holds keys the server has never been sent, and a
sitting is told apart by its seed and its moment.
`src/lib/character/server-roster.ts` is that half.

A character rolled to play the endless dungeon carries the world it was rolled
into here too, and the roster hands it back, so a player who signs in on a second
device plays it in the same dungeon rather than in the first world. A device that
names no world leaves the one here, the way it does with the mode a character is
locked to: both are decided at the roll and never again.

What such a character carries in that world comes back on the roster as well,
beside the record it was written with, so the second device picks the character
up holding the keys and the boss squares it really holds. That one does change as
the character is played, so every save writes it over; a save that carries none
leaves what is here, which is what a device on an older build sends.

A device asks for the keys of one character at a time, and only for the two
things that need them: playing that character on, since a new sitting sends the
ones before it, and exporting the run. Asked for that way the chain comes back
as the log the site wrote, put back together out of the sittings and the
stretches of keys that arrived.

## The admin

One player may look at every character here and delete anybody's. That is a flag on their row
and nothing else: an admin is a player like any other, with a name, characters and a passphrase.

`ADMIN_PLAYER` names them, and the server flags that player's row every time it starts, so John
is recognised on a database nobody has opened by hand and on one restored from a backup. The
player has to have claimed the name first — this flags a row and does not make one — and a start
that finds nobody by that name says so in the log and flags nobody. Setting it up is two steps:

1. Claim the name in the Play tab, if it has not been claimed on this server already.
2. Set `ADMIN_PLAYER` to that name in the application's configuration and redeploy.

A second admin is flagged by the first, through the endpoint below, and nothing takes the flag off
again but the database.

| Endpoint                      | What it does                                                     |
| ----------------------------- | ---------------------------------------------------------------- |
| `GET /admin/me`               | 200 with `{ "admin": true, "name": "..." }` when the words are an admin's. It is how the site knows whether to draw the Admin tab, and it is cheap so that every page load may ask. |
| `GET /admin/characters`       | Every character here, whoever's it is, the newest first, fifty to a page: the player's name and the character's, the game, the board or the mode it was rolled for, whether it is alive, dead or has won, and when the server last heard from it. `?page=` for the ones after the first, counting from one. |
| `DELETE /admin/characters/:id` | Forgets one for good, whoever it belongs to: its run, the verdict on it and whatever was announced about it go with it. 404 when no character here has that id. |
| `POST /admin/admins`          | `{ "name": "..." }` makes that player an admin as well. 404 when nobody here has the name. |
| `POST /admin/worlds/endless`  | `{ "seed": n }` opens a new endless world, and a body that names no seed asks the server to draw one. 200 with `{ "world": n }`, 400 when the seed is not a whole number between 1 and 2^31-1. |

An admin says their **passphrase** and nothing else:

```bash
curl -H 'Authorization: Bearer six little words go here' https://runs.example.com/admin/characters
```

The six words are something to read off a piece of paper into curl on any machine, where the
secret a player is otherwise recognised by lives in one browser's storage and is nothing anybody
can type. Which admin is asking is worked out from the words themselves, so there is no name to
say. Drawing a new passphrase in the Play tab retires the admin's as well as their sign-in's.

Everything under `/admin/` answers a caller who is not an admin exactly what a path this server
does not know answers: `404 No such endpoint: …`. Nothing there says that these endpoints exist,
that a character exists, or that the words said were nearly right. Guesses are slowed down the way
guesses at a sign-in are and counted with them, and the admin endpoints share one name to be
counted against, so five wrong tries from anywhere leave them unreachable for a quarter of an
hour — John's own tries included.

Every admin action is written into `admin_actions` as it is done: who did it, what they did, and
what they did it to, named the way the action names it — the character's id, the player's name. An
admin deletes other people's characters for good, and that row is what is left to say so.

## The boards

| Endpoint                               | What it does                                      |
| -------------------------------------- | ------------------------------------------------- |
| `GET /boards/:game/:leaderboard/:board` | One page of one board, fifty runs to a page. `?page=` for the ones after the first, counting from one. `?world=` for an endless board, which is read for one world and answers for the world being played now where the query names none. 404 when the three parts do not name a board there is, 400 when `page` is not a page number or `world` is not a world. |
| `GET /boards/:game/endless/worlds`      | The endless worlds of that game there are boards for: `{ "game": ..., "current": n, "worlds": [n, ...] }`, the world being played now first and then every world some character of that game stands on a board in, the newest first. 404 when the game is not one the site plays. |

`:game` is `unforgiven`, `moraffsWorld` or `revenge`; `:leaderboard` is
`faithful`, `speedrun` or `endless`. A path that names anything else is a 404
rather than an empty board, since a board with nothing on it means nobody has
played it yet and that is a different answer.

`server/boards.ts` is where the rules about the boards live, so that the site
can name them the same way when it draws them. The game as it shipped has six:

| Board     | What stands on it                                   |
| --------- | --------------------------------------------------- |
| `actions` | Wins, fewest actions first                          |
| `clock`   | Wins, least on the game's own clock first           |
| `wall`    | Wins, least time played first                       |
| `deepest` | Every run, furthest first, then fewest actions      |
| `level`   | Every run, highest level first, then fewest actions |
| `deaths`  | Deaths, newest first                                |

The endless dungeon has three of its own, and none of the boards of wins, since
a dungeon with no bottom is never won:

| Board     | What stands on it                                            |
| --------- | ------------------------------------------------------------ |
| `deepest` | Every run, deepest Shadow killed first, then fewest actions   |
| `level`   | Every run, highest level first, then fewest actions           |
| `kills`   | Every run, most monsters killed first, then fewest actions    |

The three ways of playing are never mixed: they are different games to play, so
runs of one say nothing about runs of another. A run's board is the one its
character was rolled for and locked to for life, and a character rolled for no
board is on none of them. Only a run that came out verified with no record
written into it from outside the game is on a board at all, which is what
`eligible` on its verdict says.

An endless board is cut finer still: it is one world as well as one game, since
a world decides which of the game's twenty sections each endless section
borrows its monsters from and two worlds stand different monsters on the same
floor. Which world that is comes from the `worlds` table below.

Every board's rows are the same shape — the player's name and the character's,
the actions, the game's clock, the play time and whether it may be believed,
how far the run got, the highest level it reached, how it ended and when — and
the board says which of those it was put in order of. Two runs with the same
number stand in the order they were played.

`wall` holds only a run the server watched: one played with the server
unreachable and sent afterwards comes to no play time at all, and would
otherwise top a board of the fastest wins with a run nobody timed.

How far a run got is not the same number in all three games. Moraff's Revenge
has one dungeon and seventy floors of it, so a run of it is measured by the
floor the character stood on; the other two are measured by the module or the
dungeon reached, and a run that never left the one it started in stands at 0,
which is Module I and the town. The highest level is the highest a run levelled
to, and a character that never gained a level stands at 0: what it was rolled
at is no part of the run.

An endless run is measured by the deepest floor it killed a Shadow monster on,
which goes in the same column. It is not the deepest floor the character stood
on, because reaching a floor down there costs nothing: a trap door drops a
character hundreds of floors in one step, and a board of the deepest floor
reached would be won by whoever fell furthest before dying. Killing the Shadow
of the section is the hardest thing a floor asks for, so a floor counts once
its Shadow is dead. That number and the count of kills are read off the journal
the replay wrote, which is where a kill and the floor it happened on stand
together.

## The endless worlds

A world is one number. Two characters rolled into the same one meet the same
monsters on the same floor and see the same sections, which is why a board of
the endless dungeon is one world's own.

| Endpoint                        | What it does                                    |
| ------------------------------- | ----------------------------------------------- |
| `GET /worlds/endless/current`   | `{ "world": n }`, the world a character rolled now is rolled into. Anybody may ask. |

Every world there has been is a row of `worlds`, and the newest row is the one
being rolled into. It changes when the admin says so and at no other time:
`POST /admin/worlds/endless` is the only thing that writes a row, there is no
schedule, and nothing rolls a new world over anybody's head. The first row is
world 1, which nobody set — it is the world every endless character rolled
before any of this was rolled into, so those characters stand on the board of
the world they were really played in.

A character takes the world at the roll and keeps it for life. So the worlds
before are still played, still replayed by the server, and still have boards of
their own, and setting a new one takes nothing away from anybody: it only
decides where the next roll goes.

The roller asks for the world when the endless type is picked, and a roller that
cannot reach the server rolls the character into world 1 and says so on the page
— `ENDLESS_WORLD_SEED` in `src/lib/game/endless/rules.ts` is that number, and it
is the site's fallback and nothing else.

## The boards of the living

Who is alive right now: the characters of one game and board that are still
being played, ranked by the level they have reached and by how far they have
got.

| Endpoint                                      | What it does                                    |
| --------------------------------------------- | ----------------------------------------------- |
| `GET /boards/:game/:leaderboard/living`       | One page of the living, fifty characters to a page. `?sort=level` or `?sort=deepest`, and a request naming neither is asking for the level. `?page=` for the ones after the first, counting from one. `?world=` for the endless dungeon, the same way a ranked board takes one. 404 when the game and the board are not ones there are, 400 when `sort` is not one of the two, `page` is not a page number or `world` is not a world. |

A character reaches this board by being played and leaves it by dying, by
winning or by the player forgetting it, since a run that has ended has a
verdict of its own and stands on the boards above.

Where it stands is not what the site says. The chain it has played so far is
replayed by the engine build that played it, the same way an ended run is, and
the level and the depth the board shows are what that replay reached. A
character whose replay failed or could not be checked is off the board
altogether.

Every row carries the player's name and the character's, the level and the
reach the replay found, the actions and the game's own clock, whether a device
is playing that character at this moment — its lease not having lapsed — and
when the server last heard from it, which is when the newest batch carrying the
character landed.

### How often a chain is replayed

Replaying is the engine playing a whole run through from its first key, and it
manages about eight hundred keys a second: an hour at Dungeons of the
Unforgiven is a few thousand keys and replays in seconds, while a chain played
all day takes a minute. Doing that after every five-second batch would leave
the server time for nothing else. So a chain is replayed again only when a
batch has arrived past the one the last replay took in, and then only when one
of two things holds:

- the site claims a level or a depth past the one the last replay found, which
  is the only kind of change the board shows; or
- the snapshot is more than **two minutes** old.

The claims are a reason to look and never what goes on the board. They are not
read at all for a character whose last replay did not pass: such a character is
off the board whatever the site says about it, so the two minutes are soon
enough. An endless character claims no depth of the kind its board shows — the
deepest Shadow it killed is in the journal a replay writes and in nothing a
sitting claims — so its chain is replayed again on the level or on the two
minutes alone.

These replays share the line the verdicts are done in, one at a time, so a
chain long enough to take longer than two minutes only keeps that line busy
rather than piling replays on top of each other. The board says when each
character was last heard from, so a snapshot that has fallen behind is plain to
see.

A snapshot keeps the journal of the run so far the way a verdict keeps the
journal of a run that has ended, rewritten by each replay, so a row on a board
of the living opens a page with a timeline on it too.

## Everyone

Every character of one game in one answer, whatever has become of it. The eight
boards above each rank the runs by one number, so seeing who is playing a game
at all means reading all eight; this is the same people in one table for the
site to filter and sort.

| Endpoint                     | What it does                                     |
| ---------------------------- | ------------------------------------------------ |
| `GET /boards/:game/everyone` | Every character of that game the server has checked, in one answer. 404 when the game is not one the site plays. |

Who is in it is who is on the eight boards put together: a run that has ended
with a verdict of verified that may go on a board, and a character still being
played whose chain the replay passed. A run nothing has verified is nobody's to
read but the player's, the same as a run's own page. Faithful and speedrun are
side by side here, since the point is who is playing rather than who is
winning, and every row says which board its character was rolled for so the
site can put them back into two.

Every row carries the player's name and the character's, the board it was
rolled for, whether it is alive or dead or has won, whether a device is playing
it at this moment, the level and the reach a replay found, the actions and the
game's own clock, the play time of a run that has ended, and when — which is
when the run ended, or when the server last heard from a character still being
played.

Beside all that is what the character is now: its class, its health points and
its six characteristics, read out of the newest record any device sent for it.
That record is the device's own bytes, so it may be missing altogether, too
short, or of a game this build cannot read; any of those shows as nothing for
that character rather than failing the table.

There is no paging. The reader sorts the whole table by whichever column they
like, and half a table cannot be sorted.

## The announcements

When a run comes out verified and may go on a board, the server announces the
few things about it worth stopping to read that have not been announced for
that character before: a boss beaten, the twentieth level and every fifth past
it, the hundredth kill and then the five hundredth, the thousandth, the two
thousand five hundredth and the five thousandth, one of the twelve rare things
`find_item` turns up, a floor an endless character has taken a Shadow deeper
than it ever had before, and how the run ended. A chain carries every milestone
the character has ever reached and the journal is the whole run written up, so
a run checked again repeats most of them and only what is new is said.

Nothing is announced any more for a module, a dungeon or a floor reached: a
character reaches dozens of those over a run, and the feed is read on every
page of the site. A character still being played has no outcome yet, and what
it has reached is announced without one rather than being held back until it
dies or wins. Nothing at all is announced about a run that could not be checked
or that had a record written into it from outside the game: that is the
player's own business and not news.

| Endpoint                             | What it does                                      |
| ------------------------------------ | ------------------------------------------------- |
| `GET /feed`                          | Server-sent events. Nothing on connecting; one `data:` line per announcement from then on. |
| `GET /announcements?before=&limit=`  | The announcements already made, newest first. `before` is the oldest id the reader already has and `limit` is 1 to 50, fifty by default. 400 when either is not a number. |

The history is paged by id rather than by a page number, because announcements
are made while somebody is reading and a page number would show one twice or
skip one as they arrive. `more` says whether there is anything behind the page.

A row carries fields and no sentence: `kind` (`win`, `death`, `boss`, `level`,
`kills`, `find` or `shadow`), `which` — which boss, which level, which kill
count, a find's place in `ANNOUNCED_FINDS` in `server/boards.ts`, which floor a
Shadow was killed on — the game and the board, the player's name and the
character's, the actions, the game's clock, where the character stood and what
it had reached, and the run's play time. `dungeon` and `floor` are two more
kinds the table holds rows of, from when they were still written. How an
announcement reads is the site's, in `src/lib/boards/announce.ts`, so that
changing the words is a change to the site and not to what is already stored
here.

A page is left open for hours, which is longer than anything in between will
hold a silent connection for, so a comment goes down every feed every 25
seconds. The answer also carries `X-Accel-Buffering: no`, which is nginx's word
for passing it straight on rather than holding each announcement until the next
one fills a buffer.

## Engine builds

A run says which commit of the engine it was played on, and a character's run
can cross several of them as the site is rebuilt. Replaying a session with
anything but its own engine shows nothing, so the server keeps a build of the
engine for every commit it has ever deployed, one row of the `engines` table per
commit: the commit, when it was built, and the bundle itself.

`pnpm build:engine` writes `server/engines/<commit>/engine.mjs` for the commit
the working tree is on, and `pnpm publish:engine` puts that file in the
database:

```bash
pnpm build:engine
DATABASE_URL=postgres://… pnpm publish:engine
```

The deployed server does that for its own commit every time it starts, so a
container carrying `server/engines/<its commit>/engine.mjs` needs no separate
step: it finds the file beside itself, `dist-server/main.mjs` and
`server/engines/` both being under the repository's root, and publishes it if
the table has not got it.

A build is loaded by importing it as a `data:` URL, which is how a module comes
out of the database and into the process without ever being written to the
container's disk. It is held in memory from then on, since every run of that
commit is replayed by it.

Nothing is ever taken out of the table. Deleting a build makes every run played
on it unreplayable and there is no getting its verdict back; publishing the same
commit's build twice does nothing at all, since it is the same build and the
row that is there stands.

A tree with changes in it builds into `<commit>-dirty`. Such a build is refused
by `publish:engine` and the server replays nothing with one: nobody can check
that tree out again to see what it was. So a dirty build is fine to make and try
on your own machine, and never reaches the database.

## Deploying with Coolify

Coolify builds the image from this repository and runs it. There is no volume
and nothing kept on the box: everything, the engine builds included, is in the
Postgres `DATABASE_URL` names, and the backup is the Postgres backup below.

The `Dockerfile` at the root is the whole build. It installs with the lockfile,
runs `pnpm build:server`, `pnpm build:engine` and `pnpm build`, and keeps
`dist-server/`, the one `server/engines/<commit>/` that build made, and
`dist/index.html` — all three in the place this repository has them in, which is
how the started server finds its own engine build and its own page beside itself.
One commit is the server, the engine it replays with and the page it serves, so
a deploy can never leave one of the three behind.

The application, made once:

- **Source**: this repository, branch `main`.
- **Build pack**: Dockerfile.
- **Port**: 3580, which is the port the image exposes and the server's default.
- **Domain**: whatever John points at it, say `https://runs.example.com`. That
  domain is where the tools are played as well as where the site talks to.
  Coolify's proxy terminates HTTPS and the server never sees a certificate.
- **Health check**: `GET /health` on that port. The image carries one already,
  so Coolify's own only has to agree with it if it is turned on at all.
- **No volume**, no persistent storage, no command to run after a deploy.

The variables. `VITE_RUN_SERVER` is a **build** variable, because the page is
built here; the other four are read when the server starts:

| Variable            | What to set it to                                  |
| ------------------- | -------------------------------------------------- |
| `DATABASE_URL`      | The Postgres, as the container reaches it (below)  |
| `RUN_SERVER_PORT`   | `3580`, or leave it out for the same thing         |
| `RUN_SERVER_ORIGIN` | `https://johnolek.github.io`                       |
| `ADMIN_PLAYER`      | The name John claimed in the Play tab               |
| `VITE_RUN_SERVER`   | The domain, `https://runs.example.com`             |

`RUN_SERVER_ORIGIN` is the GitHub Pages copy of the site and not this domain.
The page served from the server's own domain asks the same origin it came from,
which is not a thing a browser applies CORS to at all, so it needs no entry
there; the Pages copy is a different origin and does.

### Reaching the Postgres

`DATABASE_URL` is the one that takes a decision, because `127.0.0.1` inside a
container is the container. Two addresses reach a Postgres on the same host, and
John picks whichever is true of his:

- **A Postgres Coolify runs itself** is a container on a docker network, and its
  service name is its host name:
  `postgres://moraff:something@<service>:5432/moraff_runs`. The server has to be
  on that network, which Coolify arranges when the database and the application
  are resources of the same project.
- **A Postgres running on the host** is reached at `host.docker.internal` where
  the docker on that box provides it, and otherwise at the address of the docker
  bridge, usually `172.17.0.1`, or the host's own address on its network. That
  Postgres has to be listening on the address in question — `listen_addresses`
  in `postgresql.conf`, which is `localhost` by default and hears nothing from a
  container — and `pg_hba.conf` has to allow the container's subnet.

Either way the role and the database are made by hand first, as under "The
database" above; the server makes its own schema and runs its own migrations the
first time it starts.

### The commit the image says it is

A container's `/health` names the commit its image was built from:

```bash
curl https://runs.example.com/health
# {"ok":true,"engineCommit":"<the commit>","engines":["<and the ones it keeps>"]}
```

A build context has no git in it, so `vite.config.ts` reads that commit from the
`SOURCE_COMMIT` build argument.

**Coolify does not pass that argument unless it is asked to.** It is off by
default — Configuration, Advanced, *Include Source Commit in Build* — because
a commit that changes every deploy is a build cache that is never reused. This
image wants it anyway: a build with no commit calls itself `unknown`, and the
server refuses to publish an engine under a name that is not a commit, so
nothing that plays on that deploy can ever be replayed or verified.

`unknown` at `/health` means the argument never arrived: turn that on, look for
`--build-arg SOURCE_COMMIT=` in the deploy's build log, and make sure no build
argument of that name has been set by hand in the application's configuration to
something else. What the cache costs is only the source copy and the three
builds — the install below it is reused, which is
[MORF-406](https://projects.johnoleksowicz.com/projects/MORF/items/MORF-406).

### What a redeploy does

A deploy builds a new image and starts it in place of the old one. The new
container runs whatever migration files the database has not seen, and publishes
its own commit's engine build into the `engines` table beside every build
already there, so a run played on last month's site is still replayed by the
engine that played it. Nothing is ever taken out and nothing is copied by hand.

The old container is stopped with SIGTERM, which is what the server waits for to
finish the requests in hand and let go of the database.

Coolify starts the new container before it stops the old one and waits for the
image's own `HEALTHCHECK` to pass, so a deploy does not take the domain down.
Three settings would stop it doing that, and all three are left alone: **Ports
Mappings** stays empty, since two containers cannot publish one host port;
**Consistent Container Names** stays off and **Custom Container Name** stays
empty, since two containers cannot share a name. **Stop Grace Period** under
Configuration, Advanced, Operations is the half minute the old container has to
drain, which is longer than it needs.

The one thing to keep in mind writing a migration: for those few seconds the old
code is running against the new schema. Add tables and nullable columns rather
than renaming or dropping anything the code already deployed still reads.

Browsers pick the new page up on their next visit. It goes out under
`Cache-Control: no-cache` and a tag of its own bytes, so a browser asks every
time and is answered with a 304 and no page whenever nothing has changed.

### Compression through the proxy

The page is one file with the whole site inlined — about 5.9 MB, or 1.9 MB
gzipped — and the server sends it as it is. Squeezing it is the proxy's job:
Coolify puts a compression middleware in front, which is a per-application
setting, and nothing says so when it is off. The page simply becomes a 5.9 MB
download.

So check it, once, after the first deploy:

```bash
curl -sI -H 'Accept-Encoding: gzip' https://runs.example.com/ | grep -i content-encoding
# content-encoding: gzip
```

Nothing there means the middleware is off. Turn it on in the application's
configuration rather than changing anything here.

### The feed through the proxy

`GET /feed` is one answer held open for as long as somebody leaves the page up,
with an announcement written into it as each is made. A proxy that buffered it
would hold each announcement back until enough of them filled a buffer, and the
boards would look dead. Traefik, which is what Coolify puts in front, passes a
stream straight through and needs nothing set for this.

If announcements never arrive, or the connection is dropped every minute or so:

```bash
curl -N https://runs.example.com/feed
```

That should print a comment line at once and another every 25 seconds. If the
comments arrive and announcements do not, something in front is buffering:
check that `X-Accel-Buffering: no` and `Content-Type: text/event-stream` are
still on the answer as it comes out of the proxy, and if Coolify has been put
behind nginx or Caddy instead, that the buffering is turned off there.

## The site's two halves

The site is served from two places against the one server, and each is built
where it is served from.

**The server's own domain.** The image builds the page and carries it, so this
half moves with the server and needs nothing of GitHub's. Its address is the
`VITE_RUN_SERVER` build variable in the application's configuration.

**GitHub Pages.** Built by GitHub Actions from the same repository. Its address
is the repository variable `RUN_SERVER_URL` — Settings, Secrets and variables,
Actions, Variables — which `.github/workflows/deploy.yml` hands to the build as
`VITE_RUN_SERVER`:

1. Set `RUN_SERVER_URL` to the domain, `https://runs.example.com`.
2. Push `main`, and the site that deploys has the address in it.

A build given no address at all has no Boards tab and sends nothing anywhere,
and every other tool works exactly as it always has. So either half can be
deployed long before the server is, and the tab appears the first time that half
is built after its address is set.

`RUN_SERVER_ORIGIN` on the server is the other half of the Pages one: it is the
origin the browser is told may read the answers, and it has to be where that
copy really is, `https://johnolek.github.io`. The copy served from the server's
own domain asks the origin it was served from, which a browser does not apply
CORS to, so it is allowed without being named anywhere.

## Backups

The Postgres backup is the backup. Everything the server has ever been sent and
everything computed from it — including the engine builds runs are replayed
with — is in the `moraff` schema of `DATABASE_URL`, and nothing at all is
written to the box it runs on.

```bash
pg_dump --schema=moraff moraff_runs > "moraff-runs-$(date +%F).sql"
```

A lost engine build is the one thing that comes back without a backup: check its
commit out and run `pnpm build:engine` and `pnpm publish:engine`. Everything else
is gone if the database is.
