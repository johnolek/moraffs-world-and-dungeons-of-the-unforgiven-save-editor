<script lang="ts">
  import { SCREEN_COLOURS } from '../roller/screen';
  import type { ScreenLine } from '../game/port/state';
  import GameScreen from '../ui/GameScreen.svelte';
  import { messageBoxAnnouncement } from './announcement-box.svelte';
  import { MESSAGE_BAR_BOX, MESSAGE_BOX } from './display';
  import { MESSAGE_BOX_GRID, MESSAGE_BOX_RECT } from './screens';

  /**
   * The game's message box on its own, for the tab showing the top-down map instead of the game's
   * screen: the same corner `Screen.svelte` paints in the bottom right, filled the same way, so
   * what the game says is read where the game says it either way.
   */

  interface Props {
    /** The message box, as `messageBoxScreen` composes it. */
    lines: ScreenLine[];
    /** Whether an announcement the run server makes while the box is up is printed on its bottom
     *  lines (`mode.ts`, `announcement-box.ts`). */
    announcements?: boolean;
  }

  let { lines, announcements = false }: Props = $props();

  /**
   * The announcement the box is carrying, which the tab draws over the box and tells the game
   * nothing about: it is in neither the run log nor anything a replay reads.
   */
  const announcement = messageBoxAnnouncement(() => lines, MESSAGE_BOX_GRID);
  const drawn = $derived(announcements ? [...lines, ...announcement.lines] : lines);

  /** The box in its own units, so every line lands where the game draws it. */
  const WINDOW = {
    x: MESSAGE_BOX_RECT.x,
    y: MESSAGE_BOX_RECT.y,
    width: MESSAGE_BOX_RECT.right - MESSAGE_BOX_RECT.x,
    height: MESSAGE_BOX_RECT.bottom - MESSAGE_BOX_RECT.y,
  };

  /** How far down the box the green bar along its top reaches. */
  const BAR_SHARE = (MESSAGE_BAR_BOX.bottom - MESSAGE_BAR_BOX.top) / WINDOW.height;
</script>

<div
  class="box"
  style:--bar={SCREEN_COLOURS[MESSAGE_BAR_BOX.colour]}
  style:--ground={SCREEN_COLOURS[MESSAGE_BOX.colour]}>
  <div class="bar" style:height="{BAR_SHARE * 100}%"></div>
  <GameScreen lines={drawn} window={WINDOW} />
</div>

<style>
  .box {
    position: relative;
    flex-shrink: 0;
    background: var(--ground);
    border-radius: 6px;
    overflow: hidden;
  }
  .bar {
    position: absolute;
    inset: 0 0 auto;
    background: var(--bar);
  }
  /* The text lies over the box's own ground, so it brings no background or border of its own. */
  .box :global(.screen) {
    position: relative;
    background: none;
    border: none;
    border-radius: 0;
  }
</style>
