<!--
  The heads-up display over the top-down map: the monster being fought at the top with a bar of
  its hit points beside it, the spells the character has running down the right edge, and along
  the bottom a bar of dark stone with the health and spell orbs standing in its ends and the
  experience bar between them.

  The map is the site's own view of a game rather than anything the game ever drew, so this is the
  site's own look (John, 2026-09-09). It takes no clicks and changes nothing: the game, the run
  log and a replay run exactly as they do without it.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { HUD_ORB_PX } from './hud';
  import type { PanelLine } from './panel';
  import HudExpBar from './HudExpBar.svelte';
  import HudMonsterBar from './HudMonsterBar.svelte';
  import HudOrb from './HudOrb.svelte';

  interface Props {
    /**
     * The engaged monster's picture, centred at the top. The caller passes it only while a fight
     * is on, and leaves it out altogether for a game whose map draws that picture already.
     */
    closeUp?: Snippet;
    /**
     * The hit points the monster in that close-up has left and the hit points it was stocked
     * with, which the bar beside its picture is drawn from. Left out when no monster is faced.
     */
    closeUpHp?: { now: number; full: number };
    /**
     * The lines debug mode prints over the monster on the game's own screen, which stand over
     * the picture here too. The caller leaves them out in the modes that print none.
     */
    closeUpLines?: string[];
    /**
     * The spells the character has running, each with the moves it has left or what it is
     * standing at, and a note for its tooltip. Left out for a game with no such list.
     */
    spells?: PanelLine[];
    /** The character's hit points and what they can hold. */
    hp: number;
    maxHp: number;
    /** Their spell points and what they can hold; a fighter's maximum is nothing. */
    sp: number;
    maxSp: number;
    /** Their own level and the experience they have earned. */
    level: number;
    exp: number;
    /** The game's own curve: the experience it takes to reach level `level + 1`. */
    needed: (level: number) => number;
    /**
     * How tall the stone bar came out, in pixels, which the caller binds to so that the map
     * under it can keep the character out of the strip the bar hides. It is measured rather than
     * worked out, since the height of the bar is a fraction of the room the stage has.
     */
    barHeight?: number;
  }

  let {
    closeUp,
    closeUpHp,
    closeUpLines,
    spells = [],
    hp,
    maxHp,
    sp,
    maxSp,
    level,
    exp,
    needed,
    barHeight = $bindable(0),
  }: Props = $props();

  let stone = $state.raw<HTMLDivElement | null>(null);

  $effect(() => {
    const bar = stone;
    if (!bar) return;
    // The border box rather than the content box: the lit line along the top edge of the bar is
    // drawn as its border, and it hides the map like the rest of the stone does.
    const observer = new ResizeObserver(([entry]) => (barHeight = entry.borderBoxSize[0].blockSize));
    observer.observe(bar);
    return () => observer.disconnect();
  });
</script>

<div class="hud" style:--orb-cap="{HUD_ORB_PX}px">
  {#if closeUp}
    <div class="close-up">
      {#if closeUpHp}
        <HudMonsterBar value={closeUpHp.now} max={closeUpHp.full} />
      {/if}
      <div class="frame">
        {@render closeUp()}
        {#if closeUpLines && closeUpLines.length > 0}
          <div class="lines">{#each closeUpLines as line}<div>{line}</div>{/each}</div>
        {/if}
      </div>
    </div>
  {/if}
  {#if spells.length > 0}
    <ul class="spells">
      {#each spells as spell}
        <li title={spell.note}>
          <span class="what">{spell.label}</span>
          <span class="left">{spell.value}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="foot">
    <div class="stone" bind:this={stone}></div>
    <div class="row">
      <HudOrb kind="health" value={hp} max={maxHp} />
      <div class="middle"><HudExpBar {level} {exp} {needed} /></div>
      <HudOrb kind="spell" value={sp} max={maxSp} />
    </div>
  </div>
</div>

<style>
  .hud {
    position: absolute;
    inset: 0;
    /* Every click, drag and hover belongs to the map underneath, whatever of the display is
       standing over it. */
    pointer-events: none;
    /* Everything on the bar is a fraction of the orb, so the whole display scales together. The
       map is only as tall as the page gives it, and full-sized orbs on a short one would leave
       more bar than floor, so the height of the stage caps them. */
    --orb-size: min(var(--orb-cap), 26cqh);
    --bar-height: calc(var(--orb-size) * 0.5);
  }
  /* The bar of hit points and the picture side by side, the bar stretched to the height the
     picture's own aspect ratio gives it. */
  .close-up {
    position: absolute;
    left: 50%;
    top: var(--inset);
    transform: translateX(-50%);
    width: min(40%, 340px);
    display: flex;
    align-items: stretch;
    gap: calc(var(--orb-size) * 0.08);
  }
  /* The picture is drawn at the width `PortraitFrame` caps itself at, so the frame fills the
     box the border is on however wide the map is. */
  .frame {
    position: relative;
    flex: 1;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
  }
  /* Inside the top left corner of the picture, which is where the game's own screen prints the
     same lines over the view the monster stands in. The site's own type rather than the game's,
     since nothing else on this display is drawn in the game's. */
  .lines {
    position: absolute;
    left: calc(var(--orb-size) * 0.06);
    top: calc(var(--orb-size) * 0.05);
    right: calc(var(--orb-size) * 0.06);
    font-size: calc(var(--orb-size) * 0.085);
    line-height: 1.3;
    color: #fff;
    text-shadow:
      0 0 4px #000,
      0 1px 2px #000;
  }
  /* What the character has running, up the right edge and clear of both the picture at the top
     and the orb below. The rest of the display takes no clicks; this list takes its own back, so
     that resting on a spell shows what it does. */
  .spells {
    position: absolute;
    right: var(--inset);
    bottom: calc(var(--orb-size) * 1.15);
    max-width: 40%;
    margin: 0;
    padding: 0;
    list-style: none;
    pointer-events: auto;
    font-size: calc(var(--orb-size) * 0.09);
    line-height: 1.35;
    color: #fff;
    text-shadow:
      0 0 4px #000,
      0 1px 2px #000;
  }
  .spells li {
    display: flex;
    justify-content: flex-end;
    gap: 0.6em;
    cursor: help;
  }
  .spells .left {
    opacity: 0.85;
  }
  .foot {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
  }
  /*
    The bar itself: a band of dark stone across the foot of the map, lit along its top edge and
    falling away into the dark at the bottom, with the grain cut across it. It is drawn out of
    gradients rather than a picture, so it costs the page nothing to load.

    It is half the height of an orb, which is what leaves the top half of each orb standing proud
    of it and the bottom half sunk into the stone.
  */
  .stone {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--bar-height);
    background:
      repeating-linear-gradient(114deg, rgba(255, 255, 255, 0.035) 0 2px, rgba(0, 0, 0, 0) 2px 9px),
      linear-gradient(180deg, #2c2c3e 0%, #1a1a28 46%, #09090f 100%);
    border-top: 2px solid var(--line);
    box-shadow:
      inset 0 2px 0 rgba(255, 255, 255, 0.08),
      0 -10px 24px rgba(0, 0, 0, 0.55);
  }
  .row {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: calc(var(--orb-size) * 0.12);
    padding: 0 calc(var(--orb-size) * 0.1);
  }
  .middle {
    flex: 1;
    display: flex;
    justify-content: center;
    /* Centred up the stone between the orbs rather than sitting on the bottom edge of the map. */
    padding-bottom: calc(var(--bar-height) * 0.16);
  }
</style>
