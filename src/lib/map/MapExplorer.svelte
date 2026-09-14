<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app, watchingCharacterOn, currentEntry, type GameId } from '../app-state.svelte';
  import { characterStatus } from '../character/record';
  import { readStored, writeStored } from '../character/storage';
  import { floorBounds, summarizeMapFloor } from '../game/floor-summary';
  import { sectionInfo } from '../game/sections';
  import { isAppHistoryState, type AppHistoryState } from '../history';
  import { forEachShownSquare, isOnMap } from './area';
  import { downloadFloorPng } from './export-png';
  import { describeExplored, describeNote, describeSquare, featureLine } from './describe';
  import { addExploredFloors, exploredCounts, isExplored, staleFloorWarning, type ExploredFloors } from './explored';
  import ExploredMaps from './ExploredMaps.svelte';
  import FloorCanvas, { type Tooltip } from './FloorCanvas.svelte';
  import FloorMonsters from './FloorMonsters.svelte';
  import { floorsOf, hasDungeon, MAP_GAMES, type MapGame } from './game';
  import { jumpTarget, squareFeature, teleporterTargets, type Destination } from './floor-info';
  import { FLOOR_MAX, FLOOR_MIN, samePlace, type MapPlace } from './history';
  import { keyAction } from './keyboard';
  import { MODULE_NUMERALS } from './labels';
  import Legend from './Legend.svelte';
  import Notable from './Notable.svelte';
  import { dungeonLookup, notableSquares, squareNotes } from './notes';
  import { shortestPath, type Route } from './path';
  import { randomOpenSquare } from './relocate';
  import Selection from './Selection.svelte';
  import { squaresOfKind, type LegendKind, type Mark } from './marks';
  import SquareInfo from './SquareInfo.svelte';
  import { monsterAt, type StockedMonster } from './stocking';
  import { twinsOf, type TwinFloor } from './twins';
  import { boundsIncluding, type Point } from './viewport';
  import WallTexture from './WallTexture.svelte';
  import { nearestOpenSquare, stepFrom } from './you';

  /** No file loaded, which is every floor until one is dropped on the panel. */
  const NO_EXPLORED_FLOORS: ExploredFloors = new Map();

  // The id rather than the game itself: assigning an object to a `$state` variable wraps it in a
  // new proxy every time, which Svelte counts as a change even when it is the same game, and
  // that would re-run every effect reading it on each move of the map.
  let gameId = $state<GameId>(app.game);
  const game = $derived(MAP_GAMES[gameId]);
  let dungeon = $state(rememberedDungeon(MAP_GAMES[app.game]));
  let floor = $state(0);
  /** Lets the map be pointed at floors the dungeon does not have, the way the game's own
   *  16-bit floor variable can be. */
  let anyFloor = $state(false);
  let cursor = $state<Point | null>(null);
  /** Where the party stands. Every way of changing floor moves it, so it is always on the
   *  floor being looked at, or nowhere at all. */
  let you = $state<Point | null>(null);
  let highlight = $state<Point | null>(null);
  let legendHover = $state<LegendKind | null>(null);
  let legendPinned = $state<{ label: string; kind: LegendKind } | null>(null);
  let monsterHover = $state<string | null>(null);
  let monsterPinned = $state<string | null>(null);
  let selected = $state<Point | null>(null);
  /** undefined: not asked yet; null: asked, nothing reachable. */
  let route = $state<Route | null | undefined>(undefined);
  /** Stocked floors by "game:dungeon:floor", kept while other floors are browsed. The game
   *  keeps only the three floors most recently visited; nothing here is thrown away. */
  let stocked = $state(new Map<string, StockedMonster[]>());
  /** Explored floors from the files dropped on the map, by {@link exploredMapKey}. Nothing is
   *  stored, so a reload starts with none. */
  let exploredFiles = $state(new Map<string, ExploredFloors>());
  /** Why the files last dropped could not be read. */
  let exploredErrors = $state<string[]>([]);
  let floorCanvas: FloorCanvas;

  const floors = $derived(floorsOf(game, dungeon));
  const floorRange = $derived(anyFloor ? { lowest: FLOOR_MIN, highest: FLOOR_MAX } : { lowest: 0, highest: game.bottomFloor(dungeon) });
  const rows = $derived(game.floor(floor, dungeon));
  const summary = $derived(summarizeMapFloor(game, rows, floor, dungeon));
  const lookup = $derived(dungeonLookup(game, dungeon));
  const notable = $derived(notableSquares(lookup, floor, rows, game.area));
  // The sections, the twin floors and the monsters all belong to Dungeons of the Unforgiven's
  // five modules, and mean nothing about a numbered Moraff's World dungeon.
  const section = $derived(game.modules ? sectionInfo(dungeon, floor) : null);
  const twins = $derived(game.modules ? twinsOf(dungeon, floor) : []);
  const stockKey = $derived(`${game.id}:${dungeon}:${floor}`);
  const monsters = $derived(stocked.get(stockKey) ?? []);
  const beyondMapMonsters = $derived(monsters.filter((monster) => !isOnMap(monster, game.area)));
  /** Fit frames the floor the game shows plus whatever monsters were stocked beyond it. */
  const bounds = $derived(boundsIncluding(floorBounds(rows, game.area.rows), beyondMapMonsters));
  const exploredKey = $derived(exploredMapKey(game, dungeon));
  const explored = $derived(exploredFiles.get(exploredKey) ?? NO_EXPLORED_FLOORS);
  const exploredHere = $derived(explored.get(floor) ?? null);
  const exploredCount = $derived(exploredHere ? exploredCounts(rows, exploredHere, game.area) : { seen: 0, rock: 0 });
  const cursorSquare = $derived(cursor ? (rows[cursor.y]?.[cursor.x] ?? null) : null);
  const cursorFeature = $derived(cursor && cursorSquare ? squareFeature(game, dungeon, floor, cursorSquare, cursor.x, cursor.y) : null);
  const cursorDescription = $derived(cursor && cursorSquare ? describeSquare(cursorSquare, cursorFeature, cursor.x, cursor.y, game, dungeon) : null);
  const cursorNotes = $derived(
    cursor && cursorSquare && isOnMap(cursor, game.area) ? squareNotes(lookup, floor, cursorSquare, cursor.x, cursor.y).map(describeNote) : [],
  );
  const cursorExplored = $derived(
    cursor && cursorSquare && exploredHere && game.exploredMaps && isExplored(exploredHere, cursor.x, cursor.y)
      ? describeExplored(cursorSquare.solid, game.dungeonName(dungeon), game.exploredMaps)
      : null,
  );
  const cursorMonster = $derived(cursor ? monsterAt(monsters, cursor.x, cursor.y) : null);
  const selectedMonster = $derived(selected ? monsterAt(monsters, selected.x, selected.y) : null);
  const selectedMonsterLine = $derived(selectedMonster && game.stocking ? game.stocking.describe(selectedMonster) : null);
  const tooltip = $derived<Tooltip | null>(
    cursorDescription
      ? {
          title: `${cursor!.x}, ${cursor!.y}`,
          feature: featureLine(cursorDescription),
          monster: cursorMonster && game.stocking ? game.stocking.describe(cursorMonster) : null,
          notes: cursorNotes,
        }
      : null,
  );
  const teleporterModules = $derived(selected && game.modules && game.routeTo.matches(rows[selected.y][selected.x]) ? teleporterTargets(dungeon) : []);
  /** Whether anything on this floor is worth routing to. */
  const floorHasTarget = $derived.by(() => {
    let found = false;
    forEachShownSquare(rows, game.area, (square) => {
      if (!square.solid && game.routeTo.matches(square)) found = true;
    });
    return found;
  });
  /** What the map marks: whichever of the legend and the monster list the pointer is over,
   *  and otherwise the one entry a click pinned. */
  const marked = $derived<{ from: 'legend'; kind: LegendKind } | { from: 'monsters'; monsterId: string } | null>(
    legendHover
      ? { from: 'legend', kind: legendHover }
      : monsterHover
        ? { from: 'monsters', monsterId: monsterHover }
        : legendPinned
          ? { from: 'legend', kind: legendPinned.kind }
          : monsterPinned
            ? { from: 'monsters', monsterId: monsterPinned }
            : null,
  );
  const marks = $derived(
    !marked ? [] : marked.from === 'legend' ? squaresOfKind(rows, floor, marked.kind, game.area) : squaresOfMonster(marked.monsterId),
  );

  /** Where each game's map was left, so switching games comes back to it rather than to
   *  whatever floor the other game was showing. */
  const left = new Map<GameId, MapPlace>();

  onMount(() => {
    const state = history.state;
    // The header has not chosen a game yet at this point, so the entry's own game is taken
    // with it; whichever game the header settles on then switches the map if it has to.
    if (isAppHistoryState(state) && state.map) applyPlace(state.map);
  });

  // The header switches games under the map. Each game's map keeps its own place.
  $effect(() => {
    const chosen = app.game;
    untrack(() => showGame(chosen));
  });

  function showGame(chosen: GameId) {
    if (chosen === game.id) return;
    left.set(game.id, here(highlight));
    // A pinned monster type names one game's monster, so the other game cannot mark it, and
    // the errors belong to the files that were dropped on the game being left.
    monsterPinned = null;
    exploredErrors = [];
    const start = { game: chosen, dungeon: rememberedDungeon(MAP_GAMES[chosen]), floor: 0, square: null, you: null };
    applyPlace(left.get(chosen) ?? start);
  }

  /** The number a game's map comes back to. Dungeons of the Unforgiven picks its five modules
   *  from a list, so only a game whose number is typed has one worth remembering. */
  function rememberedDungeon(forGame: MapGame): number {
    const stored = forGame.dungeonStorageKey ? Number(readStored(forGame.dungeonStorageKey)) : NaN;
    return hasDungeon(forGame, stored) ? stored : forGame.defaultDungeon;
  }

  /** The browser structured-clones what it stores, and Svelte's state proxies cannot be cloned, so
   *  the place is snapshotted into plain objects first. */
  function entry(index: number, place: MapPlace): AppHistoryState {
    return $state.snapshot({ kind: 'moraff-tools', tab: app.tab, index, map: place });
  }

  /** Where the map is looking now, for a history entry that is being written or compared. */
  function here(square: Point | null): MapPlace {
    return { game: game.id, dungeon, floor, square, you };
  }

  /** Go to another floor and leave a history entry behind, so the browser's Back button returns to
   *  `fromSquare` on the floor being left. Nothing is recorded while another tab is showing:
   *  Back and Forward belong to the tabs then, not to the map. */
  function travel(place: MapPlace, fromSquare: Point | null) {
    if (app.tab === 'map') {
      history.replaceState(entry(app.mapHistory.current, here(fromSquare)), '');
      history.pushState(entry(app.mapHistory.current + 1, place), '');
      app.mapHistory = app.mapHistory.pushed();
    }
    applyPlace(place);
  }

  function applyPlace(place: MapPlace) {
    gameId = place.game;
    if (game.dungeonStorageKey) writeStored(game.dungeonStorageKey, String(place.dungeon));
    // A place can name a floor the dungeon does not have, and only the override shows one.
    if (place.floor < 0 || place.floor > game.bottomFloor(place.dungeon)) anyFloor = true;
    dungeon = place.dungeon;
    floor = place.floor;
    you = place.you ?? null;
    highlight = place.square;
    clearSelection();
    if (place.square) {
      cursor = place.square;
      floorCanvas.reveal(place.square);
    } else if (cursor && !isOnMap(cursor, game.area)) {
      // A game switch keeps the cursor, and another game's floor can be smaller than the square it
      // was left on.
      cursor = null;
    }
  }

  // The character panel can send the party to the square its character stands on.
  $effect(() => {
    const place = app.requestedPlace;
    if (!place) return;
    app.requestedPlace = null;
    const wanted = MAP_GAMES[place.game];
    if (!hasDungeon(wanted, place.dungeon)) return;
    const square = place.x >= 0 && place.y >= 0 && isOnMap(place, wanted.area) ? { x: place.x, y: place.y } : null;
    travel({ game: place.game, dungeon: place.dungeon, floor: place.floor, square, you: square }, cursor);
  });

  // A played character who walks into another dungeon (the gate on the Play tab, saved with S)
  // takes the map with them, the way a loaded save opens the map on its own dungeon.
  $effect(() => {
    void watchingCharacterOn('map');
    const entry = currentEntry();
    if (!entry || entry.game !== game.id) return;
    const place = characterStatus(entry)?.place;
    if (!place || place.dungeon === untrack(() => dungeon) || !hasDungeon(game, place.dungeon)) return;
    const square = place.x >= 0 && place.y >= 0 && isOnMap(place, game.area) ? { x: place.x, y: place.y } : null;
    untrack(() => travel({ game: game.id, dungeon: place.dungeon, floor: place.floor, square, you: square }, cursor));
  });

  /** Only an entry naming somewhere else moves the map. Every entry carries the map's place,
   *  including the ones a tab switch pushed, and stepping through those must leave it alone. */
  function onPopState(event: PopStateEvent) {
    const place = isAppHistoryState(event.state) ? event.state.map : undefined;
    // A place belonging to the other game is left alone: the header chooses which game is
    // showing, and stepping through history is not allowed to change that under it.
    if (!place || place.game !== game.id || samePlace(place, here(highlight))) return;
    applyPlace(place);
  }

  function changeDungeon(event: Event) {
    showDungeon(Number((event.currentTarget as HTMLSelectElement).value));
  }

  /** Enter is how a typed dungeon number is expected to be taken; on its own the box waits to
   *  lose focus. */
  function takeDungeonOnEnter(event: KeyboardEvent) {
    if (event.key === 'Enter') typeDungeon(event);
  }

  function typeDungeon(event: Event) {
    const typed = Math.trunc(Number((event.currentTarget as HTMLInputElement).value));
    if (!Number.isFinite(typed)) return;
    const chosen = Math.max(game.dungeons.lowest, Math.min(game.dungeons.highest, typed));
    if (chosen !== dungeon) showDungeon(chosen);
  }

  function showDungeon(chosen: number) {
    const level = anyFloor ? floor : Math.min(floor, game.bottomFloor(chosen));
    travel({ ...here(null), dungeon: chosen, floor: level, you: youOn(chosen, level) }, cursor);
  }

  /** A twin is always a floor its own module has, so the override is left alone. */
  function goToTwin(twin: TwinFloor) {
    travel({ ...here(null), dungeon: twin.module, floor: twin.floor, you: youOn(twin.module, twin.floor) }, cursor);
  }

  function changeFloor(event: Event) {
    showFloor(Number((event.currentTarget as HTMLSelectElement).value));
  }

  /** Enter is how a typed floor is expected to be taken; on its own the box waits to lose focus. */
  function takeFloorOnEnter(event: KeyboardEvent) {
    if (event.key === 'Enter') typeFloor(event);
  }

  function typeFloor(event: Event) {
    const typed = Math.trunc(Number((event.currentTarget as HTMLInputElement).value));
    if (!Number.isFinite(typed)) return;
    const level = Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, typed));
    if (level !== floor) showFloor(level);
  }

  /** Turning the override off brings the map back to a floor the dungeon has. */
  function toggleAnyFloor(event: Event) {
    anyFloor = (event.currentTarget as HTMLInputElement).checked;
    if (anyFloor) return;
    const level = Math.max(0, Math.min(game.bottomFloor(dungeon), floor));
    if (level !== floor) showFloor(level);
  }

  function showFloor(level: number) {
    travel({ ...here(null), floor: level, you: youOn(dungeon, level) }, cursor);
  }

  /** Changing floor walks the party to the nearest square it can stand on. It stays nowhere
   *  if it was nowhere. */
  function youOn(where: number, level: number): Point | null {
    return you && nearestOpenSquare(game.floor(level, where), you, game.area);
  }

  /** Moving yourself by hand also rewrites the current history entry, so Back and Forward
   *  bring you back to this spot rather than to wherever the last travel left you. */
  function standAt(square: Point) {
    you = square;
    if (app.tab !== 'map') return;
    history.replaceState(entry(app.mapHistory.current, here(highlight)), '');
  }

  function imHere() {
    if (selected) standAt(selected);
  }

  function pick(square: Point) {
    cursor = square;
    floorCanvas.reveal(square);
  }

  function stockThisFloor() {
    if (game.stocking) stocked = new Map(stocked).set(stockKey, game.stocking.stock(rows, dungeon, floor));
  }

  /**
   * Which loaded files shade a floor. Dungeons of the Unforgiven's file names say which module
   * the character walked, so a character's whole set can be dropped at once and each module is
   * shaded with its own; the other two games' names say nothing about the dungeon, so their
   * files shade whichever one is being looked at.
   */
  function exploredMapKey(forGame: MapGame, forDungeon: number): string {
    return forGame.exploredMaps?.namesDungeon ? `${forGame.id}:${forDungeon}` : forGame.id;
  }

  /** Reads the explored maps given onto the map, naming whichever of them cannot be read. */
  async function loadExploredFiles(files: File[]) {
    const maps = game.exploredMaps;
    if (!maps) return;
    const loaded = new Map(exploredFiles);
    const errors: string[] = [];
    for (const file of files) {
      try {
        const read = maps.read(file.name, new Uint8Array(await file.arrayBuffer()));
        const key = exploredMapKey(game, read.dungeon ?? dungeon);
        loaded.set(key, addExploredFloors(loaded.get(key) ?? NO_EXPLORED_FLOORS, read));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    exploredFiles = loaded;
    exploredErrors = errors;
  }

  /** Only what the panel is showing is cleared, which for Dungeons of the Unforgiven is the
   *  module being looked at rather than every module a file was loaded for. */
  function clearExploredFiles() {
    exploredFiles = new Map(exploredFiles).set(exploredKey, new Map());
    exploredErrors = [];
  }

  /** How the floor picker names a floor, marking the ones a loaded explored map has seen
   *  squares on. */
  function floorLabel(level: number): string {
    const name = level === 0 ? '0 · Town' : String(level);
    return explored.has(level) ? `${name} · explored` : name;
  }

  function clearMonsters() {
    const rest = new Map(stocked);
    rest.delete(stockKey);
    stocked = rest;
  }

  function squaresOfMonster(monsterId: string): Mark[] {
    return monsters.filter((monster) => monster.monsterId === monsterId).map(({ x, y }) => ({ x, y, label: null }));
  }

  /** The map marks one thing at a time, so pinning from the legend drops a pinned monster
   *  type and the other way round. */
  function pinLegendEntry(label: string | null, kind: LegendKind | null) {
    legendPinned = label && kind ? { label, kind } : null;
    if (legendPinned) monsterPinned = null;
  }

  function pinMonster(monsterId: string | null) {
    monsterPinned = monsterId;
    if (monsterPinned) legendPinned = null;
  }

  function clearSelection() {
    selected = null;
    route = undefined;
  }

  /** Taking a teleporter lands the party somewhere random in the destination town. */
  function takeTeleporter(module: number) {
    const landing = randomOpenSquare(game.floor(0, module), Math.random);
    travel({ ...here(landing), dungeon: module, floor: 0, you: landing }, selected);
  }

  function routeToTarget(passWall: boolean) {
    if (selected) route = shortestPath(rows, selected, game.routeTo.matches, game.area, passWall);
  }

  function stepFloor(delta: number) {
    const level = Math.max(floorRange.lowest, Math.min(floorRange.highest, floor + delta));
    if (level !== floor) showFloor(level);
  }

  /** An arrow key walks you one square. With nobody on the floor yet, the first press puts you
   *  down beside the cursor instead of moving. */
  function walk(dx: number, dy: number) {
    if (!you) {
      const start = nearestOpenSquare(rows, cursor ?? { x: game.area.columns >> 1, y: game.area.rows >> 1 }, game.area);
      if (start) arriveAt(start);
      return;
    }
    const next = stepFrom(rows, you, dx, dy, game.area);
    if (next) arriveAt(next);
  }

  function arriveAt(square: Point) {
    standAt(square);
    pick(square);
  }

  /** U and D take the ladder, chute or trap door you are standing on, in the direction the key
   *  names: a chute and a trap door only ever go down. */
  function climb(direction: 'up' | 'down') {
    const from = you ?? cursor;
    if (!from) return;
    const target = jumpTarget(game, dungeon, floor, rows[from.y][from.x], from.x, from.y);
    if (!target) return;
    if (direction === 'up' ? target.floor >= floor : target.floor <= floor) return;
    jumpTo(target, from);
  }

  function onKeydown(event: KeyboardEvent) {
    if (app.tab !== 'map') return;
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    const action = keyAction(event.key);
    if (!action) return;
    event.preventDefault();
    switch (action.kind) {
      case 'walk':
        walk(action.dx, action.dy);
        break;
      case 'climb':
        climb(action.direction);
        break;
      case 'floor':
        stepFloor(action.delta);
        break;
      case 'zoom':
        action.direction > 0 ? floorCanvas.zoomIn() : floorCanvas.zoomOut();
        break;
    }
  }

  /** Clicking a ladder, chute or trap door goes to the floor it leads to and marks the landing
   *  square; clicking any other open square selects it. A monster standing on the square comes
   *  first either way: a click on a monster is aimed at the monster, not at the floor below it. */
  function follow(square: Point) {
    const monster = monsterAt(monsters, square.x, square.y);
    const target = monster ? null : jumpTarget(game, dungeon, floor, rows[square.y][square.x], square.x, square.y);
    if (!target) {
      if (!rows[square.y][square.x].solid) {
        selected = square;
        route = undefined;
      }
      return;
    }
    jumpTo(target, square);
  }

  /** Going where a ladder, chute or trap door leads puts you on the landing square. */
  function jumpTo(target: Destination, from: Point) {
    const landing = { x: target.x, y: target.y };
    travel({ ...here(landing), floor: target.floor, you: landing }, from);
  }
</script>

<svelte:window onkeydown={onKeydown} onpopstate={onPopState} />

<div class="explorer">
  <div class="map">
    <div class="floor-header">
      <div class="place">
        <span class="where">{game.dungeonName(dungeon)} · {floor === 0 ? 'Town' : `Floor ${floor}`}</span>
        {#if game.modules}
          <span class="section">
            {#if section}
              Section {section.section} · {section.bossName} on floor {section.bossFloor}
            {:else}
              Section ?
            {/if}
          </span>
        {/if}
      </div>
    </div>
    <div class="viewport">
      {#if twins.length}
        <div
          class="twins"
          title="The map hash gives these modules the same pattern for every block on this floor; ladders, chutes, trap doors and buildings still differ."
        >
          Same walls as
          {#each twins as twin, index}{index > 0 ? ', ' : ''}<button type="button" class="link" onclick={() => goToTwin(twin)}
              >Module {MODULE_NUMERALS[twin.module]} {twin.floor === 0 ? 'town' : `floor ${twin.floor}`}</button
            >{/each}
        </div>
      {/if}
      <FloorCanvas
        bind:this={floorCanvas}
        {game}
        {rows}
        {floor}
        {dungeon}
        {monsters}
        {bounds}
        explored={exploredHere}
        bind:cursor
        {highlight}
        {you}
        {marks}
        {selected}
        route={route ?? null}
        {tooltip}
        onselect={follow}
      />
      <div class="controls">
        <div class="pickers">
          <label>
            <span>{game.dungeonNoun}</span>
            {#if game.modules}
              <select value={dungeon} onchange={changeDungeon}>
                {#each MODULE_NUMERALS as numeral, index}
                  <option value={index}>{numeral}</option>
                {/each}
              </select>
            {:else}
              <input
                type="number"
                min={game.dungeons.lowest}
                max={game.dungeons.highest}
                step="1"
                value={dungeon}
                onchange={typeDungeon}
                onkeydown={takeDungeonOnEnter}
              />
            {/if}
          </label>
          <label>
            <span>Floor</span>
            {#if anyFloor}
              <input type="number" min={FLOOR_MIN} max={FLOOR_MAX} step="1" value={floor} onchange={typeFloor} onkeydown={takeFloorOnEnter} />
            {:else}
              <select value={floor} onchange={changeFloor}>
                {#each floors as level}
                  <option value={level}>{floorLabel(level)}</option>
                {/each}
              </select>
            {/if}
          </label>
          <label class="toggle">
            <input type="checkbox" checked={anyFloor} onchange={toggleAnyFloor} />
            <span>Any floor</span>
          </label>
          <button class="ghost" onclick={() => stepFloor(-1)} disabled={floor === floorRange.lowest}>▲ Floor up</button>
          <button class="ghost" onclick={() => stepFloor(1)} disabled={floor === floorRange.highest}>▼ Floor down</button>
          <button class="ghost" onclick={() => history.back()} disabled={!app.mapHistory.canGoBack}>◀ Back</button>
          <button class="ghost" onclick={() => history.forward()} disabled={!app.mapHistory.canGoForward}>Forward ▶</button>
        </div>
        <div class="zoom">
          <button class="ghost" onclick={() => floorCanvas.zoomOut()} title="Zoom out">−</button>
          <button class="ghost" onclick={() => floorCanvas.zoomIn()} title="Zoom in">+</button>
          <button class="ghost" onclick={() => floorCanvas.fit()}>Fit</button>
          <button class="ghost" onclick={() => downloadFloorPng(rows, floor, dungeon, game, exploredHere)}>Export PNG</button>
        </div>
      </div>
    </div>
  </div>
  <aside class="panel">
    <p class="hint">
      Drag to pan, scroll to zoom. Arrow keys walk you across the floor, U and D take the ladder, chute or trap
      door you stand on, PgUp/PgDn change floor.
    </p>
    <SquareInfo description={cursorDescription} notes={cursorNotes} explored={cursorExplored} />
    <Selection
      {selected}
      {route}
      monster={selectedMonster}
      monsterLine={selectedMonsterLine}
      routeNoun={game.routeTo.noun}
      {floorHasTarget}
      {teleporterModules}
      onroute={routeToTarget}
      onhere={imHere}
      onclear={clearSelection}
      ontake={takeTeleporter}
    />
    {#if game.stocking}
      <FloorMonsters
        {game}
        stocking={game.stocking}
        {dungeon}
        {floor}
        {monsters}
        pinned={monsterPinned}
        onstock={stockThisFloor}
        onclear={clearMonsters}
        onhover={(monsterId) => (monsterHover = monsterId)}
        onpin={pinMonster}
      />
    {/if}
    {#if game.exploredMaps}
      <ExploredMaps
        files={game.exploredMaps}
        floors={explored}
        errors={exploredErrors}
        warning={staleFloorWarning(exploredCount.rock, game, dungeon)}
        onfiles={loadExploredFiles}
        onclear={clearExploredFiles}
      />
    {/if}
    <WallTexture game={game.id} {dungeon} {floor} />
    <Legend
      {game}
      {summary}
      exploredCount={explored.size ? exploredCount.seen : null}
      pinned={legendPinned?.label ?? null}
      onhover={(kind) => (legendHover = kind)}
      onpin={pinLegendEntry}
    />
    <Notable {notable} onpick={pick} />
  </aside>
</div>

<style>
  .explorer {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .map {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .floor-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 16px;
    font-size: 13px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }
  .place {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  .where {
    color: var(--ink);
    font-weight: 600;
  }
  .section {
    color: var(--muted);
  }
  /* Floats over the map like the controls do, so the notice coming and going never moves the
     floor buttons under a click. */
  .twins {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 2;
    max-width: 320px;
    padding: 8px 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--muted);
  }
  .twins .link {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: var(--mw-cyan);
    cursor: pointer;
  }
  .twins .link:hover {
    text-decoration: underline;
  }
  .viewport {
    flex: 1;
    min-height: 0;
    position: relative;
  }
  .panel {
    width: 280px;
    flex-shrink: 0;
    border-left: 1px solid var(--line);
    background: var(--panel);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
  }
  .controls {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 2;
    width: 250px;
    padding: 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .pickers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  select,
  input[type='number'] {
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 7px 9px;
    font: inherit;
    min-width: 0;
  }
  .toggle {
    grid-column: 1 / -1;
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .zoom {
    display: flex;
    gap: 6px;
  }
  .hint {
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--muted);
  }
  button.ghost {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 5px 10px;
    font: inherit;
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
  }
  button.ghost:hover:not(:disabled) {
    color: var(--ink);
    border-color: var(--accent);
  }
  button.ghost:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
