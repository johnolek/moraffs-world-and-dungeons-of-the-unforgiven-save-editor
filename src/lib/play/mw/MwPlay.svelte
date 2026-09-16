<!--
  Moraff's World in the Play tab: the game's own screen or the top-down map with the four corners
  of that screen laid over it, and debug mode's panel. `../PlayTab.svelte` is everything the three
  games share.
-->
<script lang="ts">
  import FloorCanvas from '../../map/FloorCanvas.svelte';
  import { MORAFFS_WORLD_MAP } from '../../map/game';
  import { FULL_FLOOR } from '../../map/viewport';
  import GameScreen from '../../ui/GameScreen.svelte';
  import { MW_SCREEN_COLOURS } from '../../roller/screen';
  import MwMonsterDetail from '../../mw-bestiary/MwMonsterDetail.svelte';
  import { MONSTERS, monsterGroups } from '../../mw-bestiary/monsters';
  import MapHud from '../MapHud.svelte';
  import MonsterCard from '../MonsterCard.svelte';
  import MwPanel from './MwPanel.svelte';
  import MwPortrait from './MwPortrait.svelte';
  import MwScreen from './MwScreen.svelte';
  import PlayTab from '../PlayTab.svelte';
  import { runServerUrl } from '../../run-server';
  import { bundledMwDungeon } from '../../game/mw-dungeon';
  import { experienceNeeded } from '../../game/mw-port/levels';
  import { MW_DIG_PROMPT } from './view3d/screen';
  import type { ScreenLine } from '../../game/port/state';
  import type { MwGameSession, MwPlayView } from './engine';
  import { PLAY_GAMES, type PlayStage } from '../games';
  import { mwFacingArrow, mwStepKey, mwTurn } from './keys';
  import { MOVEMENT_STYLES, readMovementStyle, writeMovementStyle, type MovementStyle } from '../movement';
  import {
    ANNOUNCEMENTS_LABEL,
    debugDrawn,
    mapDrawn,
    monstersDrawn,
    panelVisible,
    readPlayAnnouncements,
    writePlayAnnouncements,
    zoomMapMonsters,
  } from '../mode';

  import {
    mwCharacteristicLines,
    mwKeyMenuLines,
    mwMonsterViewCorner,
    mwMonsterViewSideLines,
    mwMonsterViewSides,
    mwStatusLines,
    MW_MONSTER_VIEW_CORNERS,
    MW_NORTH_VIEW,
    MW_SCREEN,
    MW_STATUS_BLOCK,
  } from '../../game/mw-port/screens';
  import { mwCorner, mwInMessageBox, MW_CORNER_WIDTH, MW_MESSAGE_BOX } from './screens';
  import { mwDebugMonsterLines } from './debug-screen';

  type Stage = PlayStage<MwGameSession, MwPlayView>;

  const game = PLAY_GAMES.moraffsWorld;

  /** How tall a line of the body font is: the message box steps this far between its own. */
  const LINE_HEIGHT = MW_MESSAGE_BOX.step;

  /** The top and bottom edges of the view ahead, which are the two the values are printed on. */
  const MONSTER_TOP = {
    x: MW_NORTH_VIEW.x,
    y: MW_NORTH_VIEW.y,
    width: MW_NORTH_VIEW.right - MW_NORTH_VIEW.x,
    height: LINE_HEIGHT,
  };

  /** The character's own numbers and the six characteristics, side by side along the bottom. */

  let canvas = $state.raw<FloorCanvas | null>(null);
  /** How much of the foot of the map the heads-up display's bar of stone hides, which the map
   *  keeps the character clear of. */
  let hudBarHeight = $state(0);
  let style = $state<MovementStyle>(readMovementStyle('moraffsWorld'));
  /** Whether an announcement the run server makes while the game is being played is printed in
   *  the game's own message box. */
  let announcements = $state(readPlayAnnouncements(game.id));
  /** There are no announcements to print in a build that was given no run server, so the switch
   *  for them is not offered there. */
  const announcementsOffered = runServerUrl() !== null;
  /**
   * The monster whose details debug mode has open, by the id the Monsters tab keys it by, which
   * for this game is its place in the monster table.
   */
  let openMonsterId = $state<string | null>(null);

  /** A screen with a line outside the corner the message box lives in is one the game has taken
   *  the whole display over with; one that fits is drawn in that corner with the rest of it. */
  function screenTakesOver(view: MwPlayView): boolean {
    return !view.screen.every(mwInMessageBox);
  }

  function corner(view: MwPlayView) {
    return mwCorner(screenTakesOver(view) ? [] : view.screen, view.banner, view.box);
  }

  /**
   * Which of the four views the monster being faced stands in, which is where its numbers go.
   * The top-down map has only the one picture, so that one keeps taking the view ahead's corner.
   */
  function monsterCorner(stage: Stage) {
    const engaged = stage.view.engaged;
    if (engaged == null || stage.display === 'map') return MW_MONSTER_VIEW_CORNERS.north;
    return mwMonsterViewCorner(stage.session.game, engaged.x, engaged.y);
  }

  /** Its level, its hit points and what killing it is worth, printed around that view. */
  /**
   * Everything the game prints on the play screen, each line where the game prints it: the
   * message box down the left, the menu of keys down the right, the numbers along the bottom, the
   * line under the two stacked views, and the three values of every monster standing beside the
   * character.
   */
  function screenLines(stage: Stage): ScreenLine[] {
    const view = stage.view;
    const game = stage.session.game;
    return [
      ...corner(view).lines,
      ...mwKeyMenuLines(view.sound),
      ...mwStatusLines(game),
      ...mwCharacteristicLines(game),
      // The same three values for every monster standing beside the character, which the game
      // draws over all four views at once.
      ...mwMonsterViewSideLines(game),
      // The chance the next swing lands, which debug mode adds under the hit points the game
      // prints for itself.
      ...(debugDrawn(stage.mode) && view.engaged != null
        ? mwDebugMonsterLines(game, monsterCorner(stage))
        : []),
      ...(view.prompt === null
        ? []
        : [
            {
              text: view.prompt,
              x: MW_DIG_PROMPT.left,
              y: MW_DIG_PROMPT.y,
              font: 0,
              colour: MW_DIG_PROMPT.colour,
              spreadTo: MW_DIG_PROMPT.right,
            },
          ]),
      // A screen the game has taken the whole display over with is drawn last, at the game's own
      // coordinates, the way the game draws it over everything else it has on the screen.
      ...(screenTakesOver(view) ? view.screen : []),
    ];
  }

  /** The catalogue entry that id names, and the heading of the list it is under, which is what
   *  the Monsters tab puts over its own card. */
  const openMonster = $derived.by(() => {
    if (openMonsterId === null) return null;
    const entry = MONSTERS[Number(openMonsterId)];
    if (!entry) return null;
    const group = monsterGroups().find((one) => one.monsters.includes(entry));
    return { entry, groupLabel: group?.label ?? '' };
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

  /** A key on its way to the game. Under Dungeons of the Unforgiven's arrows the up arrow steps
   *  the way the character faces and the other three turn them where they stand. */
  function press(session: MwGameSession, key: number) {
    const arrow = style === MORAFFS_WORLD_MAP.id ? null : mwFacingArrow(key, session.game.pc.dir);
    if (!arrow) session.press(key);
    else if (arrow.step) session.press(mwStepKey(arrow.dir));
    else mwTurn(session, arrow.dir);
  }

  /** The switch is picked with the mouse, and the keyboard belongs to the game rather than to a
   *  checkbox, so the control hands it back as soon as it has been answered. */
  function chooseAnnouncements(input: HTMLInputElement) {
    writePlayAnnouncements(game.id, announcements);
    input.blur();
  }

  /** The style is picked with the mouse, and the arrow keys belong to the game rather than to a
   *  radio button, so the control hands the keyboard back as soon as it has been answered. */
  function chooseStyle(input: HTMLInputElement) {
    writeMovementStyle('moraffsWorld', style);
    input.blur();
  }
</script>

<PlayTab {game} {canvas} {press} {takeKey} {screen} {afterSwitch} {place} {afterModes} {sideFoot} />

<!-- The box an announcement is printed in is drawn by the game's own screen. On the map it is one
     of the corners laid over the map, which carries nothing of the site's, so the switch stands
     while the screen does. -->
{#snippet afterSwitch(stage: Stage)}
  {#if announcementsOffered && stage.display === 'screen'}
    <label class="side-switch">
      <input
        type="checkbox"
        bind:checked={announcements}
        onchange={(event) => chooseAnnouncements(event.currentTarget)} />
      <span>{ANNOUNCEMENTS_LABEL}</span>
    </label>
  {/if}
{/snippet}

<!-- The game's own screen, which both displays draw: the stage in the screen display, and over
     the map while the game has taken the display over with a page of its own. -->
{#snippet gameScreen(stage: Stage)}
  {@const view = stage.view}
  {@const discovered = mapDrawn(stage.mode, stage.session.memory)}
  <MwScreen
    rows={view.rows}
    place={view.place}
    monsters={monstersDrawn(stage.mode, view)}
    height={stage.session.game.pc.height}
    ladderAt={(x, y) => bundledMwDungeon.ladder(x, y, view.place.floor, view.place.dungeon)}
    surfaceFeatureAt={(x, y) => bundledMwDungeon.surface(x, y, view.place.floor, view.place.dungeon)}
    discovered={discovered ?? { known: () => true, knownOnArrival: () => true }}
    mapMonsters={zoomMapMonsters(stage.mode, view)}
    lines={screenLines(stage)}
    messageBox={corner(view).lines}
    {announcements}
    cleared={screenTakesOver(view)}
    expandedMap={view.expandedMap}
    barCorners={mwMonsterViewSides(stage.session.game).map((side) => side.corner)}
    onmonster={(monster) => (openMonsterId = monster.monsterId)}
    redraw={stage.redraw}
  />
{/snippet}

{#snippet screen(stage: Stage)}
  {@const view = stage.view}
  {@const monsters = monstersDrawn(stage.mode, view)}
  {@const discovered = mapDrawn(stage.mode, stage.session.memory)}
  {#if stage.display === 'screen'}
    <div class="game-screen">{@render gameScreen(stage)}</div>
  {:else}
    {@const cornerLines = corner(view)}
    <FloorCanvas
      bind:this={canvas}
      game={MORAFFS_WORLD_MAP}
      rows={view.rows}
      floor={view.place.floor}
      dungeon={view.place.dungeon}
      {monsters}
      {discovered}
      bounds={FULL_FLOOR}
      you={{ x: view.place.x, y: view.place.y, dir: view.place.dir }}
      focus={{ x: view.place.x, y: view.place.y, cell: game.cell }}
      coveredBottom={hudBarHeight}
    />
    {#if cornerLines.lines.length > 0}
      <div class="corner top-left" style:--share={MW_CORNER_WIDTH / MW_SCREEN.width}>
        <GameScreen
          lines={cornerLines.lines}
          window={{ x: 0, y: 0, width: MW_CORNER_WIDTH, height: cornerLines.height }}
          colours={MW_SCREEN_COLOURS} />
      </div>
    {/if}
    <div class="corner top-right" style:--share={MONSTER_TOP.width / MW_SCREEN.width}>
      {#if view.prompt}
        <!-- FUN_2000_a9bd (WORLD.EXE 2000:a9bd) prints this one in colour 5. -->
        <div class="status" style:color={MW_SCREEN_COLOURS[5]}>{view.prompt}</div>
      {/if}
    </div>
    <!-- The map is the site's own view, so the game's status blocks and its corner picture of the
         monster give way to the heads-up display (John, 2026-09-09). -->
    {#snippet closeUp()}
      <MwPortrait monster={view.engaged} floor={view.place.floor} />
    {/snippet}
    <MapHud
      bind:barHeight={hudBarHeight}
      closeUp={view.engaged ? closeUp : undefined}
      closeUpHp={view.engaged ? { now: view.engaged.hp, full: view.engagedFullHp } : undefined}
      closeUpLines={[...view.engagedViewLines, ...(debugDrawn(stage.mode) ? view.engagedDebugLines : [])]}
      hp={view.hp}
      maxHp={view.maxHp}
      sp={view.sp}
      maxSp={view.maxSp}
      level={view.level}
      exp={view.exp}
      needed={experienceNeeded} />
    <!-- With the map in the views' place there is nowhere on it to draw a page the game has
         taken the display over with, so the game's own screen covers the map instead,
         letterboxed the way the screen display shows it. -->
    {#if screenTakesOver(view)}
      <div class="overlay">{@render gameScreen(stage)}</div>
    {/if}
  {/if}
  {#if openMonster}
    <MonsterCard
      monsterId={String(openMonster.entry.index)}
      name={openMonster.entry.name}
      onclose={() => (openMonsterId = null)}
      detail={monsterDetail}
    />
  {/if}
{/snippet}

{#snippet place(stage: Stage)}
  <span>{stage.view.place.floor === 0 ? 'The surface' : `Floor ${stage.view.place.floor}`}</span>
  <span>Dungeon {stage.view.place.dungeon}</span>
  <span>{stage.view.place.x}, {stage.view.place.y}</span>
  <span>{['North', 'South', 'West', 'East'][stage.view.place.dir]}</span>
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
  {#if panelVisible(stage.mode)}
    <MwPanel game={stage.session.game} view={stage.view} />
  {/if}
{/snippet}

<!-- Keyed on the monster, the way the Monsters tab keys its own card, so the floor and swing
     controls inside it start fresh for each one. -->
{#snippet monsterDetail()}
  {#key openMonsterId}
    <MwMonsterDetail entry={openMonster!.entry} groupLabel={openMonster!.groupLabel} />
  {/key}
{/snippet}

<style>
  /* The small, quiet switch under the display switch, drawn the way the mode radios above it
     draw their own controls. */
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
  /* The four corners of the game's own screen, laid over the map the way it lays them over the
     3-D views: the message box top left, the monster faced top right, the character's own block
     bottom left and the characteristics bottom right.

     All four are one screen in the game, so each is given the share of the map's width it has of
     that screen's 1600 and they all come out at the same size. */
  .corner {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: calc((100% - 2 * var(--inset)) * var(--share));
    pointer-events: none;
  }
  .top-left {
    left: var(--inset);
    top: var(--inset);
  }
  .top-right {
    right: var(--inset);
    top: var(--inset);
    align-items: flex-end;
  }
  /* The strips FUN_2000_8728 clears before it prints, so that white on a light monster reads. */
  .status {
    padding: 6px 10px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.8);
    font-family: var(--font-dos);
    font-size: 20px;
    line-height: 1.1;
    text-align: right;
  }
  /* The game's screen keeps its own 4:3 shape and sits in the middle of the space the map had. */
  .game-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: var(--inset);
  }
  .game-screen :global(.screen),
  .overlay :global(.screen) {
    width: min(100%, calc((100cqh - 2 * var(--inset)) * 4 / 3));
    max-height: 100%;
  }
</style>
