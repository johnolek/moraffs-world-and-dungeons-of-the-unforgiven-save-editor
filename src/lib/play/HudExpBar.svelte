<!--
  The experience bar along the bottom of the map, between the two orbs: how far the character
  stands between the level they are on and the next one.

  A level is only handed over at an inn, so once the next one has been earned the bar moves on to
  the level after it and a badge says which one it is now filling towards.
-->
<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { Tween } from 'svelte/motion';
  import { grouped } from '../ui/format';
  import { expBar, HUD_TWEEN_MS } from './hud';

  interface Props {
    /** The character's own level. */
    level: number;
    /** The experience they have earned. */
    exp: number;
    /** The game's own curve: the experience it takes to reach level `level + 1`. */
    needed: (level: number) => number;
  }

  let { level, exp, needed }: Props = $props();

  const HEADING = 'Experience';

  const bar = $derived(expBar({ level, exp, needed }));
  const fill = Tween.of(() => bar.fill, { duration: HUD_TWEEN_MS, easing: cubicOut });
</script>

<div class="exp">
  <div class="heading">
    <span>{HEADING}</span>
    <span>{grouped(Math.round(exp))} / {grouped(Math.round(bar.to))}</span>
  </div>
  <div class="track">
    <div class="fill" style:width="{fill.current * 100}%"></div>
    {#if bar.ahead}
      <span class="badge">Level {bar.toLevel}</span>
    {/if}
  </div>
</div>

<style>
  /* The bar and its lettering are fractions of the orbs it stands between, so the whole foot of
     the map is drawn at one size. */
  .exp {
    display: flex;
    flex-direction: column;
    gap: calc(var(--orb-size) * 0.04);
    width: 100%;
    max-width: calc(var(--orb-size) * 3.5);
  }
  .heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-family: var(--font-dos);
    font-size: calc(var(--orb-size) * 0.13);
    color: var(--ink);
    text-shadow: 0 1px 2px #000;
  }
  .track {
    position: relative;
    height: calc(var(--orb-size) * 0.16);
    border: 1px solid var(--line);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.72);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: linear-gradient(to right, var(--accent-dim), var(--accent));
  }
  .badge {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 0 calc(var(--orb-size) * 0.06);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.8);
    font-family: var(--font-dos);
    font-size: calc(var(--orb-size) * 0.11);
    line-height: calc(var(--orb-size) * 0.14);
    color: var(--accent);
    white-space: nowrap;
  }
</style>
