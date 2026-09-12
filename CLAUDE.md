# Moraff Tools

Workflow: work-on-main

Tracker project: MORF (https://projects.johnoleksowicz.com/projects/MORF). Item
work is prefixed `MORF-n:` with the item URL at the bottom of the commit message;
the chunked feature loop applies: one approved chunk per commit series, then
present the next chunk's plan and wait.

`docs/INDEX.md` is the index to every document here: what each one answers, how
long it is, and which of the three games it is about. Read it before going looking.

## Deploy map

- Push to `main` → GitHub Actions runs the tests, builds `dist/`, and deploys it to
  GitHub Pages at
  https://johnolek.github.io/moraffs-world-and-dungeons-of-the-unforgiven-save-editor/
  The build takes the run server's address from the repository variable
  `RUN_SERVER_URL`; without it the site has no Boards tab and sends nothing.
- Push to `main` → Coolify rebuilds the run server from the root `Dockerfile` and
  deploys it, but only if John has turned automatic deploys on for it; otherwise
  the server changes when he presses deploy in Coolify. That image also builds the
  site and serves it at the server's own root, so the domain is a second place to
  play; its address comes from the `VITE_RUN_SERVER` build variable.
  `server/README.md` is the setup.
- No other branch deploys. Never push without being asked.

## Commands

```bash
pnpm test     # vitest
pnpm check    # svelte-check
pnpm build    # single-file dist/index.html
pnpm dev

pnpm build:server  # dist-server/main.mjs, the run server
pnpm build:ported  # the two PORTED-FROM.md pages, from the port's citations
pnpm start:server  # run it
pnpm dev:all       # the site and the server together on the local Postgres
```

## Layout and rules

- `dotu-tools/HANDOFF.md` is the spec. Port the reference code faithfully; never
  re-derive a formula.
- `src/lib/game/*.js` are verbatim copies of `dotu-tools/reference/`; a test diffs
  them. Edit the bundle first, then copy. Types live in the sibling `.d.ts` files.
- The map explorer, the Play tab, the save editor, the monsters and the character
  roller cover all three games; the spells cover DotU and Moraff's World; the fight simulator,
  the calculators, the formulas and the snake are DotU's alone.
- The Boards tab (`src/lib/boards/`) covers all three games and shows only in a build given
  a run server address (`VITE_RUN_SERVER`); `server/boards.ts` is the only server module the
  site may import a value from. The run server serves the built page at `/` when the image
  carries one (`server/site.ts`); a checkout that has not built the site leaves that a 404.
- The Tidbits tab follows the game switch: a game has one when
  `src/lib/tidbits/files.ts` names a file for it and `src/lib/tabs.ts` lists the
  tab for it.
- `server/` is the run server, one Node process on `node:http` and a Postgres it
  reaches through `server/sql.ts`, built by `vite.server.config.ts`; its tests run
  under the same `pnpm test` against PGlite and need no database on the machine,
  and `server/README.md` is how it is deployed. It replays a run with the engine
  that played it, so `pnpm build:engine` bundles the engine into
  `server/engines/<commit>/` and `pnpm publish:engine` puts that build in the
  database, which the deployed server also does for its own commit at start.
- Test files share workers (`isolate: false`), so they share one module registry.
  Two rules follow, and breaking either gives a test that passes alone and fails
  perhaps half the time in a full run:
  - Never import anything from a `*.test.ts` file. Importing a test file runs it,
    so its tests are declared again in the importer. Shared helpers go in a
    `test-*.ts` module beside it, which the vitest globs do not collect
    (`src/lib/play/mw/test-engine.ts`, `server/test-sql.ts`).
  - Never `vi.mock` a module. By the time a file registers one, another file may
    already have loaded a module that imports the real thing, and that copy keeps
    it. Spy on the shared module object instead, and restore it afterwards:
    `const spy = vi.spyOn(speaker, 'playTones')` with an `afterAll` that calls
    `spy.mockRestore()` (`src/lib/play/mw/sound.test.ts`).
- A server test gets its database from `openTestDatabase()`, which starts PGlite
  from a copy of an already migrated one rather than building a fresh one, because
  building one costs most of a second. Adding a migration needs nothing: the copy
  is made once per worker from whatever `server/migrations/` holds.
- Real game folders live in `~/games/4unf for claude/` (DotU), `~/games/mworld/`
  (Moraff's World) and `~/games/rev2/` (Moraff's Revenge); never modify them and
  never commit copies of saves or executables. Tests use synthetic buffers.
