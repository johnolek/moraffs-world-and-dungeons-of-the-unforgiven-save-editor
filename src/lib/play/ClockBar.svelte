<!--
  Debug mode's bar of the sawtooth a swing's to-hit roll climbs, which is the site's own drawing
  and nothing the game ever showed.

  `strike` seeds the generator from the machine's tick counter, so the roll of a swing made at any
  moment is settled before the swing is made, and it climbs by about 0.85 of its eighty every tick
  and drops back every 95 of them — five and a bit seconds (`sawtooth.ts`). The bar fills as the
  roll climbs and empties when it wraps, so a player can see when a good moment to swing is
  coming. It stands only while a monster is engaged, which is when a swing has something to land
  on. It takes no clicks and changes nothing: the game, the run log and a replay run exactly
  as they do without it.
-->
<script lang="ts">
  import { linear } from 'svelte/easing';
  import { Tween } from 'svelte/motion';
  import { secondsToTheDrop, swingRoll, SWING_ROLL_VALUES, TICK_MS } from './sawtooth';

  interface Props {
    /** What the tick counter reads now, or null when nothing is being drawn from it. */
    tick: number | null;
    /** Whether the bar stands over the game's own screen, where its type is sized to the picture
     *  rather than the page. */
    overScreen?: boolean;
  }

  let { tick, overScreen = false }: Props = $props();

  const roll = $derived(tick === null ? 0 : swingRoll(tick));
  /**
   * How full the bar is: the roll out of the eighty a swing can draw, eased from one reading to
   * the next so that the fill glides instead of jumping once a tick.
   *
   * The glide takes two ticks. A reading arrives every tick, so the fill is still moving when the
   * next one comes and never stands still waiting on a late timer; the cost is that it runs one
   * tick behind the counter, a hundredth of the climb.
   */
  const filled = Tween.of(() => (roll / SWING_ROLL_VALUES) * 100, {
    duration: 2 * TICK_MS,
    easing: linear,
  });
  /** How long the roll has left to climb before it drops back, as the label prints it. */
  const secondsLeft = $derived(tick === null ? '0.0' : secondsToTheDrop(tick).toFixed(1));
</script>

{#if tick !== null}
  <div class="clock-bar" class:over-screen={overScreen} title="The roll a swing made now would get, out of 80">
    <div class="track"><div class="fill" style:width="{filled.current}%"></div></div>
    <div class="reading">SWING ROLL <span class="roll">{roll}</span> · <span class="seconds">{secondsLeft}</span>s TO THE DROP</div>
  </div>
{/if}

<style>
  .clock-bar {
    pointer-events: none;
    font-size: 11px;
    line-height: 1.3;
    color: #fff;
    text-shadow:
      0 0 4px #000,
      0 1px 2px #000;
  }
  .track {
    height: 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.55);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent-dim, #4a4), var(--accent, #7f7));
  }
  .reading {
    margin-top: 2px;
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
  }
  /* The roll is two digits at most and the seconds three characters, and each stands in a slot
     that wide so that the line keeps its width as they change. */
  .roll,
  .seconds {
    display: inline-block;
    text-align: right;
  }
  .roll {
    width: 2ch;
  }
  .seconds {
    width: 3ch;
  }
  /* Over the game's own screen it is shown at whatever size the 4:3 picture is scaled to, so its
     type is sized in that picture's own terms rather than in pixels; where it stands is the
     screen's to say. */
  .over-screen {
    font-size: clamp(7px, 1.1cqw, 11px);
  }
</style>
