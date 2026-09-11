<!--
  Dungeons of the Unforgiven in the Play tab: the game's own screen or the top-down map, the
  message box beside it, the portrait and the wall, and debug mode's panel. `PlayTab.svelte` is
  everything the three games share.
-->
<script lang="ts">
  import FloorCanvas from '../map/FloorCanvas.svelte';
  import { UNFORGIVEN_MAP } from '../map/game';
  import { FULL_FLOOR } from '../map/viewport';
  import WallTexture from '../map/WallTexture.svelte';
  import MonsterDetail from '../bestiary/MonsterDetail.svelte';
  import { monsterGroups } from '../bestiary/monsters';
  import { expNeeded } from '../game/port/combat';
  import MapHud from './MapHud.svelte';
  import MessageBox from './MessageBox.svelte';
  import MonsterCard from './MonsterCard.svelte';
  import Panel from './Panel.svelte';
  import { monsterKindSquares } from './panel';
  import { pathToNearestTeleporter } from '../map/path';
  import PlayTab from './PlayTab.svelte';
  import Portrait from './Portrait.svelte';
  import Screen from './Screen.svelte';
  import type { GameSession, PlayView } from './engine';
  import { PLAY_GAMES, type PlayStage } from './games';
  import { compassKeys } from './keys';
  import { MOVEMENT_STYLES, readMovementStyle, writeMovementStyle, type MovementStyle } from './movement';
  import {
    debugDrawn,
    mapDrawn,
    monstersDrawn,
    panelVisible,
    sidePicturesVisible,
    zoomMapMonsters,
    type PlayMode,
  } from './mode';

  type Stage = PlayStage<GameSession, PlayView>;

  const game = PLAY_GAMES.unforgiven;

  let canvas = $state.raw<FloorCanvas | null>(null);
  /** How much of the foot of the map the heads-up display's bar of stone hides, which the map
   *  keeps the character clear of. */
  let hudBarHeight = $state(0);
  let style = $state<MovementStyle>(readMovementStyle('unforgiven'));
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
   * Whether the game has taken the display over with a screen of its own, which is when the map
   * gives way to the game's own drawing of that screen.
   *
   * The screens the port draws for itself are named one by one; everything else the game covers
   * the display with — the help, the V screen, the pages behind the P key — is lines drawn on a
   * screen it has cleared, which is what `view.screen` holds.
   */
  function screenTakesOver(view: PlayView): boolean {
    return (
      view.screen.length > 0 ||
      view.expandedMap ||
      view.tablet !== null ||
      view.sectionScreen !== null ||
      view.buildingScreen !== null ||
      view.bossOffice !== null ||
      view.tunnel !== null
    );
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
</script>

<PlayTab {game} {canvas} {press} {takeKey} {screen} {place} {afterRun} {afterModes} {sideFoot} />

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
    viewsFrom={view.viewsFrom}
    monsters={monstersDrawn(stage.mode, { ...view.screenFloor, engaged: view.engaged })}
    box={view.box}
    screen={view.screen}
    screenCleared={view.screenCleared}
    discovered={zoomMap(stage)}
    mapMonsters={zoomMapMonsters(stage.mode, view.screenFloor)}
    highlightMonsterId={kind}
    routeSquares={route?.squares ?? []}
    debug={debugDrawn(stage.mode)}
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
    redraw={stage.redraw} />
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
      <Portrait monster={facing} module={view.place.module} floor={view.place.floor} />
    {/snippet}
    <MapHud
      bind:barHeight={hudBarHeight}
      closeUp={facing ? closeUp : undefined}
      closeUpHp={facing ? { now: facing.hp, full: view.engagedFullHp } : undefined}
      closeUpLines={debugDrawn(stage.mode) ? view.engagedDebugLines : []}
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
    {#if screenTakesOver(view)}
      <div class="overlay">{@render gameScreen(stage)}</div>
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

{#snippet place(stage: Stage)}
  <span>{stage.view.place.floor === 0 ? 'Town' : `Floor ${stage.view.place.floor}`}</span>
  <span>Module {stage.view.place.module + 1}</span>
  <span>{stage.view.place.x}, {stage.view.place.y}</span>
  <span>{['North', 'South', 'West', 'East'][stage.view.place.dir]}</span>
{/snippet}

{#snippet afterRun(stage: Stage)}
  {#if stage.display === 'map'}
    <MessageBox lines={stage.view.box} />
  {/if}
{/snippet}

{#snippet afterModes()}
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
  {#if sidePicturesVisible(stage.display)}
    <WallTexture game={UNFORGIVEN_MAP.id} dungeon={stage.view.place.module} floor={stage.view.place.floor} />
  {/if}
  {#if panelVisible(stage.mode)}
    <Panel
      game={stage.session.game}
      view={stage.view}
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
