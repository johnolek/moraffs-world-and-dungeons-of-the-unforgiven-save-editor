<!--
  The panel a tab reads one thing's details in, laid over whatever the tab was showing.

  The Spells tab reads a spell's description this way — over the grid rather than under it, so
  that a spell picked from the bottom line does not have to be scrolled to — and the Play tab's
  debug mode reads a monster's the same way. The parent has to be positioned, since the panel
  fills it.

  A panel holding a whole form rather than one thing's details can be taller than the tab it is
  opened from, and `overWindow` is for that: it lays the panel over the window instead, where
  there is more room than the tab has.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** What the panel is about, for anything reading the page aloud. */
    label: string;
    onclose: () => void;
    /** Lay the panel over the whole window rather than over the tab alone, and give it most of
     *  the window's height. */
    overWindow?: boolean;
    /** The close button, so that a caller can put the keyboard on it as the panel opens. */
    closeButton?: HTMLButtonElement;
    children: Snippet;
  }

  let { label, onclose, overWindow = false, closeButton = $bindable(), children }: Props = $props();

  const CLOSE_LABEL = 'Close (Esc)';
</script>

<div class="overlay" class:over-window={overWindow}>
  <button type="button" class="dismiss" tabindex="-1" aria-hidden="true" onclick={onclose}></button>
  <div class="detail" role="dialog" aria-label={label}>
    <button
      type="button"
      class="close"
      aria-label={CLOSE_LABEL}
      title={CLOSE_LABEL}
      bind:this={closeButton}
      onclick={onclose}
    >
      X
    </button>
    <div class="detail-scroll">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.75);
  }
  /* The whole backdrop shuts the panel, so a click anywhere off it gets out. */
  .dismiss {
    position: absolute;
    inset: 0;
    border: none;
    background: none;
    cursor: pointer;
  }
  .detail {
    position: relative;
    display: flex;
    flex-direction: column;
    width: min(900px, 100%);
    max-height: 100%;
    border: 1px solid var(--mw-green);
    border-radius: 6px;
    background: var(--panel);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
  }
  /* Over the window the panel is anchored to the viewport, so its height is the window's rather
     than the tab's, which is the whole point of opening it this way. The stacking number is
     above every other one on the site, so nothing further down the page paints over it: the
     character panel along the foot of the page is positioned and would otherwise. */
  .overlay.over-window {
    position: fixed;
    z-index: 10;
  }
  /* A fixed height rather than a ceiling, so the panel does not jump about as a form inside it
     moves from a short step to a long one. */
  .overlay.over-window .detail {
    height: 90vh;
  }
  .detail-scroll {
    overflow-y: auto;
    padding: 16px 20px 20px;
  }
  /* A DOS menu marks what it is on by swapping its colours over, and so does this. */
  .close {
    position: absolute;
    top: 8px;
    right: 10px;
    padding: 0 6px;
    border: none;
    border-radius: 3px;
    background: none;
    font-family: var(--font-dos);
    font-size: 24px;
    line-height: 1.1;
    color: var(--mw-red);
    cursor: pointer;
  }
  .close:hover,
  .close:focus-visible {
    background: var(--mw-red);
    color: #000;
  }
  .close:focus-visible {
    outline: 2px solid var(--accent);
  }
</style>
