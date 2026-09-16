<!--
  Dungeons of the Unforgiven in the Play tab: the game's own screen or the top-down map, the
  message box beside it, the portrait and the wall, and debug mode's panel. `PlayTab.svelte` is
  everything the three games share.
-->
<script lang="ts">
  import FloorCanvas from '../map/FloorCanvas.svelte';
  import { UNFORGIVEN_MAP } from '../map/game';
  import { FULL_FLOOR } from '../map/viewport';
  import MonsterDetail from '../bestiary/MonsterDetail.svelte';
  import { monsterGroups } from '../bestiary/monsters';
  import { expNeeded } from '../game/port/combat';
  import ForwardView from './ForwardView.svelte';
  import GameScreen from '../ui/GameScreen.svelte';
  import type { ScreenRect } from '../game/port/state';
  import { SCREEN_WINDOW } from './display';
  import MapHud from './MapHud.svelte';
  import MessageBox from './MessageBox.svelte';
  import MonsterCard from './MonsterCard.svelte';
  import Panel from './Panel.svelte';
  import ClockBar from './ClockBar.svelte';
  import { debugMonsterLines } from './debug-screen';
  import { ailments, monsterKindSquares, spellTimers, untimedSpells, type PanelLine } from './panel';
  import { pathToNearestTeleporter } from '../map/path';
  import PlayTab from './PlayTab.svelte';
  import { runServerUrl } from '../run-server';
  import Portrait from './Portrait.svelte';
  import Screen from './Screen.svelte';
  import type { GameSession, PlayView } from './engine';
  import { PLAY_GAMES, type PlayStage } from './games';
  import { compassKeys } from './keys';
  import { MOVEMENT_STYLES, readMovementStyle, writeMovementStyle, type MovementStyle } from './movement';
  import {
    ANNOUNCEMENTS_LABEL,
    CLOCK_RESEED_LABEL,
    CLOCK_RESEED_NOTE,
    debugDrawn,
    mapDrawn,
    monstersDrawn,
    dungeonNumbersVisible,
    panelVisible,
    readPlayAnnouncements,
    readPlayClockReseed,
    readPlayForwardView,
    writePlayAnnouncements,
    writePlayClockReseed,
    writePlayForwardView,
    zoomMapMonsters,
    type PlayMode,
  } from './mode';
  import { sectionDrawn } from './view-scene';

  type Stage = PlayStage<GameSession, PlayView>;

  const game = PLAY_GAMES.unforgiven;

  let canvas = $state.raw<FloorCanvas | null>(null);
  /** How much of the foot of the map the heads-up display's bar of stone hides, which the map
   *  keeps the character clear of. */
  let hudBarHeight = $state(0);
  let style = $state<MovementStyle>(readMovementStyle('unforgiven'));
  /** Whether the map draws the game's forward-facing 3-D view where the picture of the monster
   *  being fought stands. */
  let forwardView = $state(readPlayForwardView(game.id));
  /** Whether a game started from here reseeds from the clock the way the original does. Faithful
   *  and speedrun always do; this is debug mode's own switch. */
  let clockReseed = $state(readPlayClockReseed(game.id));
  /** Whether an announcement the run server makes while the game is being played is printed in
   *  the game's own message box. */
  let announcements = $state(readPlayAnnouncements(game.id));
  /** There are no announcements to print in a build that was given no run server, so the switch
   *  for them is not offered there. */
  const announcementsOffered = runServerUrl() !== null;
  /** The kind of monster picked out of the debug panel's list, which both maps ring until it is
   *  clicked again. */
  let highlightedMonsterId = $state.raw<string | null>(null);
  /** Whether debug mode's button asking for the way to the nearest teleporter is on, and whether
   *  that route may cast Pass Wall. */
  let routingToTeleporter = $state(false);
  let routePassWall = $state(false);
  /**
   * The monster whose details debug mode has open, by the id the Monsters tab keys it by. An id
   * rather than the monster itself, since the catalogue entry is what the card is drawn from and
   * what was clicked is only where it stood.
   */
  let openMonsterId = $state<string | null>(null);

  /**
   * The map the floor is drawn from: in faithful mode the one the character has discovered, and
   * none in the other two, where the whole floor is drawn.
   */
  function discoveredMap(stage: Stage) {
    return mapDrawn(stage.mode, stage.session.memory);
  }

  /**
   * What the zoom map on the game's own screen knows: in faithful the map the character had
   * discovered when the loop last drew the screen, and in the other two every square, since those
   * are the modes that show the whole floor.
   */
  function zoomMap(stage: Stage) {
    const floor = stage.view.screenFloor;
    return mapDrawn(stage.mode, { discovered: () => floor.discovered }) ?? { known: () => true, knownOnArrival: () => true };
  }

  /**
   * The kind of monster the maps ring. Only debug mode has the list that picks one, so leaving
   * debug mode takes the ring off without forgetting which kind was picked.
   */
  function highlightedKind(mode: PlayMode): string | null {
    return debugDrawn(mode) ? highlightedMonsterId : null;
  }

  /**
   * The way to the nearest teleporter, worked out afresh from the square the character is
   * standing on, so the route follows them as they walk it. It is null when no teleporter can be
   * reached and undefined while the button is off, which is what tells the panel's two answers
   * apart.
   */
  function teleporterRoute(stage: Stage) {
    if (!routingToTeleporter || !debugDrawn(stage.mode)) return undefined;
    return pathToNearestTeleporter(stage.view.rows, stage.view.place, UNFORGIVEN_MAP.area, routePassWall);
  }

  /** The catalogue entry that id names, and the heading of the list it is under, which is what
   *  the Monsters tab puts over its own card. */
  const openMonster = $derived.by(() => {
    if (openMonsterId === null) return null;
    for (const group of monsterGroups()) {
      const entry = group.monsters.find((monster) => monster.id === openMonsterId);
      if (entry) return { entry, groupLabel: group.label };
    }
    return null;
  });

  /**
   * The keyboard belongs to the details while they are up: no key reaches the game, and only
   * Escape is taken off the page, so the controls inside the card can still be typed in and
   * tabbed between.
   */
  function takeKey(event: KeyboardEvent): boolean {
    if (openMonsterId === null) return false;
    if (event.key !== 'Escape') return true;
    openMonsterId = null;
    event.preventDefault();
    return true;
  }

  /**
   * Whether the game has taken the display over with a screen of pictures — the X key's map, the
   * tablet, a town building, the boss's office, the module tunnel, the S key's monsters. The map
   * has nowhere to draw any of them, so the game's own screen covers it for as long as one is up.
   */
  function pictureScreen(view: PlayView): boolean {
    return (
      view.expandedMap ||
      view.tablet !== null ||
      view.sectionScreen !== null ||
      view.buildingScreen !== null ||
      view.bossOffice !== null ||
      view.tunnel !== null
    );
  }

  /**
   * Whether what the game has put up is only lines on a display it has cleared: the character
   * sheet, the help pages, the spell tables and the rest of what `view.screen` holds. Those are
   * laid over the map rather than covering it, so the floor stays in sight while they are read.
   */
  function textScreen(view: PlayView): boolean {
    return view.screen.length > 0 && !pictureScreen(view);
  }

  /** Where on the game's 4:3 screen the rectangle it blacked out stands, as shares of it, for the
   *  patch of black the text is read on. */
  function clearedPatch(rect: ScreenRect) {
    return {
      left: `${(rect.x / SCREEN_WINDOW.width) * 100}%`,
      top: `${(rect.y / SCREEN_WINDOW.height) * 100}%`,
      width: `${((rect.right - rect.x) / SCREEN_WINDOW.width) * 100}%`,
      height: `${((rect.bottom - rect.y) / SCREEN_WINDOW.height) * 100}%`,
    };
  }

  /** The monsters the game's own 3-D views would draw, which is what both the game's screen and
   *  the map's forward view show. */
  function monstersInView(stage: Stage) {
    return monstersDrawn(stage.mode, { ...stage.view.screenFloor, engaged: stage.view.engaged });
  }

  /** Every spell the character has running, the ones counting down first, for the list the map's
   *  heads-up display shows. It is the same reading of the record the panel beside the map makes. */
  function spellsRunning(stage: Stage): PanelLine[] {
    const pc = stage.session.game.pc;
    return [...spellTimers(pc), ...untimedSpells(pc)];
  }

  /** The poison and the disease in the character: what colours the health orb, and the lines
   *  beside it saying what each clock is counting down to. */
  function afflictions(stage: Stage) {
    const pc = stage.session.game.pc;
    return { poisoned: pc.poison > 0, diseased: pc.disease > 0, lines: ailments(pc) };
  }

  /** A key on its way to the game. Under Moraff's World's arrows an arrow becomes the turn and
   *  the step that come to the same thing here, and the loop reads them one after the other. */
  function press(session: GameSession, key: number) {
    const keys = style === UNFORGIVEN_MAP.id ? [key] : compassKeys(key, session.game.pc.dir);
    for (const one of keys) session.press(one);
  }

  /** The style is picked with the mouse, and the arrow keys belong to the game rather than to a
   *  radio button, so the control hands the keyboard back as soon as it has been answered. */
  function chooseStyle(input: HTMLInputElement) {
    writeMovementStyle('unforgiven', style);
    input.blur();
  }

  /** The same for the switch that puts the 3-D view over the map. */
  function chooseForwardView(input: HTMLInputElement) {
    writePlayForwardView(game.id, forwardView);
    input.blur();
  }

  /** The same for the switch that prints announcements in the message box. */
  function chooseAnnouncements(input: HTMLInputElement) {
    writePlayAnnouncements(game.id, announcements);
    input.blur();
  }

  /** And for debug mode's switch over the clock, which the next game started reads. */
  function chooseClockReseed(input: HTMLInputElement) {
    writePlayClockReseed(game.id, clockReseed);
    input.blur();
  }
</script>

<PlayTab {game} {canvas} {press} {takeKey} {screen} {afterSwitch} {place} {afterRun} {afterModes} {sideFoot} />

<!-- The game's own screen, which both displays draw: the stage in the screen display, and over
     the map while the game has taken the display over with a screen of its own. -->
{#snippet gameScreen(stage: Stage)}
  {@const view = stage.view}
  {@const route = teleporterRoute(stage)}
  {@const kind = highlightedKind(stage.mode)}
  <Screen
    game={stage.session.game}
    rows={view.screenFloor.rows}
    place={view.place}
    status={view.status}
    viewsFrom={view.viewsFrom}
    monsters={monstersInView(stage)}
    box={view.box}
    screen={view.screen}
    screenCleared={view.screenCleared}
    discovered={zoomMap(stage)}
    mapMonsters={zoomMapMonsters(stage.mode, view.screenFloor)}
    highlightMonsterId={kind}
    routeSquares={route?.squares ?? []}
    debug={debugDrawn(stage.mode)}
    tick={stage.tick}
    onmonster={(monster) => (openMonsterId = monster.monsterId)}
    prompt={view.prompt}
    killed={view.killed}
    viewsDrawn={view.viewsDrawn}
    expandedMap={view.expandedMap}
    tablet={view.tablet}
    sectionScreen={view.sectionScreen}
    buildingScreen={view.buildingScreen}
    bossOffice={view.bossOffice}
    tunnel={view.tunnel}
    plaque={view.plaque}
    fade={view.fade}
    redraw={stage.redraw}
    {announcements} />
{/snippet}

{#snippet screen(stage: Stage)}
  {@const view = stage.view}
  {@const route = teleporterRoute(stage)}
  {@const monsters = monstersDrawn(stage.mode, view)}
  {@const kind = highlightedKind(stage.mode)}
  {#if stage.display === 'screen'}
    {@render gameScreen(stage)}
  {:else}
    <FloorCanvas
      bind:this={canvas}
      game={UNFORGIVEN_MAP}
      rows={view.rows}
      floor={view.place.floor}
      dungeon={view.place.module}
      {monsters}
      marks={monsterKindSquares(monsters, kind)}
      route={route ?? null}
      discovered={discoveredMap(stage)}
      bounds={FULL_FLOOR}
      you={{ x: view.place.x, y: view.place.y, dir: view.place.dir }}
      focus={{ x: view.place.x, y: view.place.y, cell: game.cell }}
      coveredBottom={hudBarHeight}
    />
    <!-- The same monster the picture beside the map shows: the one standing straight ahead,
         which is the one the game has a picture of on its own screen. -->
    {@const facing = view.ahead ? view.engaged : null}
    {#snippet closeUp()}
      <Portrait
        monster={facing}
        section={sectionDrawn(stage.session.game.rules, view.place.module, view.place.floor)} />
    {/snippet}
    <!-- The game's own forward view in the same frame, which draws the monster ahead itself. -->
    {#snippet forward()}
      <ForwardView
        game={stage.session.game}
        rows={view.screenFloor.rows}
        place={view.place}
        viewsFrom={view.viewsFrom}
        monsters={monstersInView(stage)}
        killed={view.killed}
        viewsDrawn={view.viewsDrawn} />
    {/snippet}
    <!-- The sawtooth a swing's to-hit roll climbs, under the picture, in debug mode alone, and
         only while a monster is engaged. -->
    {#snippet clockBar()}
      <ClockBar tick={stage.tick} />
    {/snippet}
    <MapHud
      bind:barHeight={hudBarHeight}
      closeUp={forwardView ? forward : facing ? closeUp : undefined}
      closeUpHp={facing ? { now: facing.hp, full: view.engagedFullHp } : undefined}
      closeUpLines={debugDrawn(stage.mode) ? debugMonsterLines(stage.session.game, stage.tick).map((line) => line.text) : []}
      underCloseUp={stage.tick === null || view.engaged === null ? undefined : clockBar}
      spells={spellsRunning(stage)}
      afflictions={afflictions(stage)}
      hp={view.hp}
      maxHp={view.maxHp}
      sp={view.sp}
      maxSp={view.maxSp}
      level={view.level}
      exp={view.exp}
      needed={(level) => expNeeded(stage.session.game, level)} />
    {#if view.prompt}
      <div class="prompt">{#each view.prompt as line}<div>{line.text}</div>{/each}</div>
    {/if}
    <!-- The game draws these across the four views; with the map in their place there is nowhere
         on it to put them, so the game's own screen covers the map for as long as one of them is
         up, letterboxed the way the screen display shows it. -->
    {#if pictureScreen(view)}
      <div class="overlay">{@render gameScreen(stage)}</div>
    {:else if textScreen(view)}
      <!-- Lines on a cleared display instead: they are printed where the game prints them, on a
           4:3 window over the map, and the map is dimmed rather than covered. -->
      <div class="text-screen">
        <div class="window">
          {#if view.screenCleared}
            {@const patch = clearedPatch(view.screenCleared)}
            <div
              class="cleared"
              style:left={patch.left}
              style:top={patch.top}
              style:width={patch.width}
              style:height={patch.height}>
            </div>
          {/if}
          <GameScreen lines={view.screen} window={SCREEN_WINDOW} />
        </div>
      </div>
    {/if}
  {/if}
  {#if openMonster}
    <MonsterCard
      monsterId={openMonster.entry.id}
      name={openMonster.entry.name}
      onclose={() => (openMonsterId = null)}
      detail={monsterDetail}
    />
  {/if}
{/snippet}

<!-- The 3-D view is the map's own, so the switch for it only stands there while the map does.
     The announcements go in the message box, which both displays draw. -->
{#snippet afterSwitch(stage: Stage)}
  {#if stage.display === 'map'}
    <label class="side-switch">
      <input
        type="checkbox"
        bind:checked={forwardView}
        onchange={(event) => chooseForwardView(event.currentTarget)} />
      <span>3-D view over the map</span>
    </label>
  {/if}
  {#if announcementsOffered}
    <label class="side-switch">
      <input
        type="checkbox"
        bind:checked={announcements}
        onchange={(event) => chooseAnnouncements(event.currentTarget)} />
      <span>{ANNOUNCEMENTS_LABEL}</span>
    </label>
  {/if}
{/snippet}

{#snippet place(stage: Stage)}
  <span>{stage.view.place.floor === 0 ? 'Town' : `Floor ${stage.view.place.floor}`}</span>
  <span>Module {stage.view.place.module + 1}</span>
  <span>{stage.view.place.x}, {stage.view.place.y}</span>
  <span>{['North', 'South', 'West', 'East'][stage.view.place.dir]}</span>
{/snippet}

<!-- The box beside the map stands in for the one the game draws in the corner of its own
     screen. While a screen of the game's own covers the map — a store, the temple, the boss's
     office, the module tunnel — that screen carries the box already, so the side column would be
     saying the same lines a second time. -->
{#snippet afterRun(stage: Stage)}
  {#if stage.display === 'map' && !pictureScreen(stage.view)}
    <MessageBox lines={stage.view.box} {announcements} />
  {/if}
{/snippet}

{#snippet afterModes(stage: Stage)}
  {#if debugDrawn(stage.mode)}
    <label class="switch">
      <input type="checkbox" bind:checked={clockReseed} onchange={(event) => chooseClockReseed(event.currentTarget)} />
      <span>{CLOCK_RESEED_LABEL}</span>
      <span class="how">{CLOCK_RESEED_NOTE}</span>
    </label>
  {/if}
  <div class="key-note">Arrow keys:</div>
  <div class="styles">
    {#each MOVEMENT_STYLES as choice}
      <label>
        <input type="radio" value={choice.id} bind:group={style} onchange={(event) => chooseStyle(event.currentTarget)} />
        <span>{choice.label}</span>
        <span class="how">{choice.how}</span>
      </label>
    {/each}
  </div>
{/snippet}

{#snippet sideFoot(stage: Stage)}
  {#if panelVisible(stage.mode, stage.lock)}
    <Panel
      game={stage.session.game}
      view={stage.view}
      dungeonNumbers={dungeonNumbersVisible(stage.mode)}
      bind:highlighted={highlightedMonsterId}
      bind:routing={routingToTeleporter}
      bind:routePassWall
      route={teleporterRoute(stage)} />
  {/if}
{/snippet}

<!-- Keyed on the monster, the way the Monsters tab keys its own card, so the level and floor
     controls inside it start fresh for each one. -->
{#snippet monsterDetail()}
  {#key openMonsterId}
    <MonsterDetail entry={openMonster!.entry} groupLabel={openMonster!.groupLabel} />
  {/key}
{/snippet}

<style>
  /* Debug mode's switch over the clock, laid out the way the mode radios above it are: the box,
     its label, and the line about it under both. */
  .switch {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0 8px;
    margin-bottom: 10px;
    font-size: 13px;
    cursor: pointer;
  }
  .switch input {
    margin: 0;
    accent-color: var(--accent);
  }
  .switch .how {
    grid-column: 2;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.4;
  }
  /* The small, quiet switches under the display switch, drawn the way the one above draws its
     own checkbox. */
  .side-switch {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    color: var(--muted);
    font-size: 12px;
    cursor: pointer;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.85);
    padding: var(--inset);
  }
  /* The game's screen keeps its own 4:3 shape in the middle of the room the map had, which is
     the stage's own height less what the overlay puts around it. */
  .overlay :global(.screen) {
    width: min(100%, calc((100cqh - 2 * var(--inset)) * 4 / 3));
  }
  /* The wash the map is read through while a screen of lines stands over it. It takes no clicks,
     so the map can still be dragged and hovered underneath. */
  .text-screen {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    padding: var(--inset);
    pointer-events: none;
  }
  /* The same 4:3 window the game's own screen keeps, so every line lands where the game put it. */
  .text-screen .window {
    position: relative;
    width: min(100%, calc((100cqh - 2 * var(--inset)) * 4 / 3));
  }
  /* The rectangle the game filled with black before it printed. A screen whose rectangle the port
     does not know fills the whole display in the game, and there the wash stands in for it so
     that the map still shows. */
  .text-screen .cleared {
    position: absolute;
    background: #000;
  }
  /* The lines lie over the map and the black patch, so they bring no ground of their own. The
     window is the screen's own 1600 by 1200, which leaves no room under the lowest line for the
     tails of its letters; they hang over the map rather than being cut off. */
  .text-screen :global(.screen) {
    position: relative;
    background: none;
    border: none;
    border-radius: 0;
    overflow: visible;
  }
  .prompt {
    position: absolute;
    left: 12px;
    top: 12px;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.8);
    font-family: var(--font-dos);
    font-size: 20px;
    line-height: 1.1;
    color: #fff;
  }
</style>
