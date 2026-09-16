<!--
  Moraff's Revenge in the Play tab: the game's own screen or the top-down map with the lines the
  game prints laid over it, the character's own numbers, and debug mode's panel.
  `../PlayTab.svelte` is everything the three games share.
-->
<script lang="ts">
  import FloorCanvas from '../../map/FloorCanvas.svelte';
  import { MORAFFS_REVENGE_MAP } from '../../map/game';
  import { revStockedMonster } from '../../map/rev-stocking';
  import type { StockedMonster } from '../../map/stocking';
  import { FULL_FLOOR } from '../../map/viewport';
  import PlayTab from '../PlayTab.svelte';
  import { PLAY_GAMES, type PlayStage } from '../games';
  import { mapDrawn, monstersDrawn, panelVisible, readPlaySound, writePlaySound } from '../mode';
  import RevPanel from './RevPanel.svelte';
  import type { RevGameSession, RevPlayView } from './engine';
  import { revArrowRun, revRedrawMs } from './pace';
  import RevScreenCanvas from './screen/RevScreenCanvas.svelte';
  import { revCgaPalette } from './settings';

  type Stage = PlayStage<RevGameSession, RevPlayView>;

  const game = PLAY_GAMES.revenge;

  /** The facing as the map canvas numbers it — 0 north, 1 south, 2 west, 3 east — from the
   *  game's own 1 north, 2 east, 3 south, 4 west (1000:30C7). */
  const CANVAS_FACING = [0, 0, 3, 1, 2];

  /** What the sound checkbox says, which is what the game's own question at DUNSMALL.EXE
   *  1000:0517 asks and what the `O` key does with the answer afterwards. */
  const SOUND_NOTE = 'The game asks on the way in. O turns it off and on again while you play.';

  /** What each mode says about the two ways the arrows move, for the line under the map. */
  const ARROW_NOTE = {
    compass: 'Each arrow faces the way it points and steps that way.',
    turning: 'Up steps the way you face, left and right turn, and down turns around.',
  };

  let canvas = $state.raw<FloorCanvas | null>(null);
  let sound = $state(readPlaySound('revenge'));
  /** How many arrows have arrived in a row, which is what shortens the redraw (`pace.ts`). It is
   *  the tab's own count: nothing the game does reads it and it reaches no run log. */
  let arrowRun = $state(0);

  /** The monsters the map draws, named the way the map explorer names the ones it stocks, so
   *  that both reach the same entry of the Moraff's Revenge bestiary. */
  function asStocked(session: RevGameSession, standing: RevPlayView['monsters']): StockedMonster[] {
    const level = session.game.pc.dungeonLevel;
    return standing.map((monster) =>
      revStockedMonster(monster, level, session.game.monsters.strengths[monster.slot] ?? 0),
    );
  }

  function mapMonsters(stage: Stage): StockedMonster[] {
    const session = stage.session;
    return monstersDrawn(stage.mode, {
      monsters: asStocked(session, stage.view.monsters),
      visible: asStocked(session, stage.view.visible),
      engaged: null,
    });
  }

  /**
   * How long the game's screen takes to appear: the slider, less what the arrows being held down
   * take off it (`pace.ts`).
   */
  function screenRedraw(stage: Stage): number {
    return revRedrawMs(stage.redraw, stage.session.game.enterDelay, arrowRun);
  }

  /**
   * The colours the game's screen is drawn in: the `@` key flips between the two `SCREEN 1`
   * palettes and the `#` key steps the colour behind everything.
   */
  function screenColours(session: RevGameSession) {
    return { palette: revCgaPalette(session.game), background: session.game.background };
  }

  /** The map the floor is drawn from: the squares walked in faithful mode, the whole level in
   *  the other two. */
  function discoveredMap(stage: Stage) {
    const game = stage.session.game;
    const level = game.pc.dungeonLevel;
    return mapDrawn(stage.mode, { discovered: () => game.memory.discovered(level) });
  }

  /** A key on its way to the game, which is also what the redraw's own pace is counted from. */
  function press(session: RevGameSession, key: number) {
    arrowRun = revArrowRun(arrowRun, key);
    session.press(key);
  }

  /** Letting a key go ends the run of arrows, which is where the original's own reset falls: a
   *  pass whose `INKEY$` finds nothing waiting puts the count back to 0 (1000:4260). */
  function onKeyUp(event: KeyboardEvent) {
    if (game.gameKey(event) !== null) arrowRun = 0;
  }

  /** The answer the game asks for on the way in, which is read when a game starts: a game
   *  already running keeps the flag the `O` key leaves it on. */
  function chooseSound(input: HTMLInputElement) {
    writePlaySound('revenge', sound);
    input.blur();
  }
</script>

<svelte:window onkeyup={onKeyUp} />

<PlayTab {game} {canvas} {sound} {press} {screen} {place} {afterPlace} {afterModes} {sideFoot} />

{#snippet screen(stage: Stage)}
  {@const view = stage.view}
  {@const gameScreen = stage.display === 'screen' ? stage.session.screen() : null}
  {#if gameScreen}
    {@const colours = screenColours(stage.session)}
    <RevScreenCanvas
      screen={gameScreen}
      palette={colours.palette}
      background={colours.background}
      redraw={screenRedraw(stage)} />
  {:else}
    <FloorCanvas
      bind:this={canvas}
      game={MORAFFS_REVENGE_MAP}
      rows={MORAFFS_REVENGE_MAP.floor(view.place.level, stage.session.game.pc.generation)}
      floor={view.place.level}
      dungeon={stage.session.game.pc.generation}
      monsters={mapMonsters(stage)}
      discovered={discoveredMap(stage)}
      bounds={FULL_FLOOR}
      you={{ x: view.place.x, y: view.place.y, dir: CANVAS_FACING[view.place.facing] ?? 0 }}
      focus={{ x: view.place.x, y: view.place.y, cell: game.cell }}
    />
    <!-- The game's own screen prints all of this on the four message rows at its top left
         (`screen/text.ts`), so this is only for the tab showing the map in its place. -->
    <div class="words">
      {#if view.advice.length > 0}
        <div class="advice">{view.advice.join(' ')}</div>
      {/if}
      {#if view.banner.length > 0}
        <div class="banner">{#each view.banner as line}<div>{line}</div>{/each}</div>
      {/if}
      {#if view.box.length > 0}
        <div class="box">{#each view.box as line}<div>{line}</div>{/each}</div>
      {/if}
      {#if view.prompt}
        <div class="prompt">{view.prompt}</div>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet place(stage: Stage)}
  <span>{stage.view.place.level === 0 ? 'The town' : `Level ${stage.view.place.level}`}</span>
  <!-- The game counts its columns and rows from one, and this line is the game's own numbers. -->
  <span>{stage.view.place.x + 1}, {stage.view.place.y + 1}</span>
  <span>{['', 'North', 'East', 'South', 'West'][stage.view.place.facing] ?? ''}</span>
{/snippet}

{#snippet afterPlace(stage: Stage)}
  {@const pc = stage.session.game.pc}
  <div class="vitals">
    <span>{Math.trunc(pc.hp)} of {Math.trunc(pc.maxHp)} health points</span>
    <span>Level {Math.trunc(pc.level)}</span>
    <span>{Math.trunc(pc.money)} JP</span>
    <span>{Math.trunc(pc.weight)} lb</span>
  </div>
  {#if stage.view.fight}
    <div class="fighting">
      <span>Fighting a level {stage.view.fight.monsterLevel} monster</span>
      <span>{stage.view.fight.hitPoints} hit points left</span>
    </div>
  {/if}
{/snippet}

{#snippet afterModes(stage: Stage)}
  <div class="styles">
    <label>
      <input type="checkbox" bind:checked={sound} onchange={(event) => chooseSound(event.currentTarget)} />
      <span>Sound</span>
      <span class="how">{SOUND_NOTE}</span>
    </label>
  </div>
  <div class="key-note">Arrow keys, which Escape switches between:</div>
  <div class="arrows">{ARROW_NOTE[stage.view.arrows]}</div>
{/snippet}

{#snippet sideFoot(stage: Stage)}
  {#if panelVisible(stage.mode, stage.lock)}
    <RevPanel game={stage.session.game} view={stage.view} />
  {/if}
{/snippet}

<style>
  .words {
    position: absolute;
    left: 10px;
    top: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: none;
    font-family: var(--font-dos);
    font-size: 15px;
    line-height: 1.35;
    white-space: pre-wrap;
  }
  .advice {
    color: #55ff55;
  }
  .banner {
    color: #ffffff;
  }
  .box {
    color: #ffff55;
    background: rgba(0, 0, 0, 0.72);
    padding: 4px 8px;
    border-radius: 6px;
    max-width: 40ch;
  }
  .prompt {
    color: #55ffff;
  }
  .vitals,
  .fighting {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    font-size: 12px;
    color: var(--muted);
  }
  /* The line under the mode radios saying what the arrows do, which is a note rather than a
     control and so is not one of the labelled rows above it. */
  .arrows {
    font-size: 11px;
    color: var(--muted);
    opacity: 0.8;
  }
</style>
