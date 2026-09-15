<!--
  One of the two orbs in the bottom corners of the map: a round glass vessel with the character's
  hit points or spell points standing in it, which fills and drains rather than jumping.

  Nothing here is a port of anything the games draw. It is the site's own look, over the site's
  own map (John, 2026-09-09).
-->
<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { Tween } from 'svelte/motion';
  import { grouped } from '../ui/format';
  import { HUD_TWEEN_MS, orbFill } from './hud';

  interface Props {
    /** Which of the two this is, which picks its colours and the word under its numbers. */
    kind: 'health' | 'spell';
    /** What the character has now. */
    value: number;
    /** What they can hold; an orb with no maximum at all is drawn empty. */
    max: number;
  }

  let { kind, value, max }: Props = $props();

  const LABEL = { health: 'Health', spell: 'Spell' };

  const fill = Tween.of(() => orbFill(value, max), { duration: HUD_TWEEN_MS, easing: cubicOut });
</script>

<div class="orb {kind}">
  <div class="liquid" style:height="{fill.current * 100}%"></div>
  <div class="glass"></div>
  <div class="numbers">
    <span class="count">{grouped(Math.trunc(value))} / {grouped(Math.trunc(max))}</span>
    <span class="what">{LABEL[kind]}</span>
  </div>
</div>

<style>
  /* The rim, the highlight and the lettering are all fractions of the orb, so an orb drawn
     smaller on a short map is the same orb rather than a thin-rimmed one. */
  .orb {
    position: relative;
    width: var(--orb-size);
    height: var(--orb-size);
    border-radius: 50%;
    overflow: hidden;
    background: #05040a;
    border: calc(var(--orb-size) * 0.03) solid var(--line);
    /* The dark ring and the shadow under it are what seat the orb in the stone of the bar. */
    box-shadow:
      0 0 0 2px rgba(0, 0, 0, 0.75),
      0 6px 16px rgba(0, 0, 0, 0.6);
  }
  .health {
    --liquid-top: #ff4a4a;
    --liquid-bottom: #6d0b0b;
    --meniscus: #ffb0b0;
  }
  .spell {
    --liquid-top: #4a8cff;
    --liquid-bottom: #0d1f66;
    --meniscus: #b0cdff;
  }
  .liquid {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(to top, var(--liquid-bottom), var(--liquid-top));
    /* The lighter line where the liquid meets the air. */
    box-shadow: inset 0 calc(var(--orb-size) * 0.03) 0 var(--meniscus);
  }
  /* The curve of the glass over the liquid: a highlight up on the left and the dark the sphere
     falls away into at its rim. */
  .glass {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.32), rgba(255, 255, 255, 0) 46%);
    box-shadow: inset 0 0 calc(var(--orb-size) * 0.19) rgba(0, 0, 0, 0.8);
  }
  .numbers {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(var(--orb-size) * 0.02);
    font-family: var(--font-dos);
    color: #fff;
    text-shadow: 0 0 4px #000, 0 1px 2px #000;
  }
  .count {
    font-size: calc(var(--orb-size) * 0.16);
    line-height: 1;
  }
  .what {
    font-size: calc(var(--orb-size) * 0.11);
    line-height: 1;
    opacity: 0.85;
  }
</style>
