<!--
  Every announcement the server has made, in a panel that slides in from the left edge over
  whatever tab the reader is on.

  The list is `Announcements.svelte`, the same one the Boards tab shows down its side, so the two
  read the same way and ask the same store for the older ones. This is the panel around it: the
  backdrop, the close button and the reading being remembered.

  It is laid over the window rather than over a tab, the way `../ui/Overlay.svelte` is with
  `overWindow`, but that one centres its panel and this one is anchored to an edge, so it is a
  panel of its own rather than another setting on that one.
-->
<script lang="ts">
  import { app } from '../app-state.svelte';
  import Announcements from './Announcements.svelte';
  import { latestAnnouncement } from './announcement-feed.svelte';
  import { markAnnouncementsSeen } from './unread.svelte';
  import { BOARDS_PAGE } from './words';

  let { onclose }: { onclose: () => void } = $props();

  const CLOSE_LABEL = 'Close (Esc)';

  let closeButton = $state<HTMLButtonElement | undefined>();

  /** The tabs underneath read their keys off the window, so while this is open they are told the
   *  keyboard is not theirs: Escape shuts the panel rather than meaning what it means to the
   *  game. */
  $effect(() => {
    app.panelOverPage = true;
    return () => (app.panelOverPage = false);
  });

  /** The keyboard goes into the panel as it opens, so that Escape and Tab are the panel's without
   *  the reader having to click into it first. */
  $effect(() => closeButton?.focus());

  /** Whatever is newest while the panel is open has been read, including one that arrives while
   *  the reader is looking at the list. */
  $effect(() => {
    const newest = latestAnnouncement();
    if (newest !== null) markAnnouncementsSeen(newest.at);
  });

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onclose();
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="timeline">
  <!-- The whole backdrop shuts the panel, so a click anywhere off it gets out. -->
  <button type="button" class="dismiss" tabindex="-1" aria-hidden="true" onclick={onclose}></button>
  <div class="panel" role="dialog" aria-modal="true" aria-label={BOARDS_PAGE.announcements}>
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
    <Announcements fills onopened={onclose} />
  </div>
</div>

<style>
  /* Above every other stacking number on the site, including the panels laid over a tab, since
     this is opened from the header whatever the tab below is showing. */
  .timeline {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    background: rgba(0, 0, 0, 0.6);
  }
  .dismiss {
    position: absolute;
    inset: 0;
    border: none;
    background: none;
    cursor: pointer;
  }
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    width: min(420px, 100%);
    height: 100%;
    border-right: 1px solid var(--line);
    background: var(--panel);
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.7);
    animation: slide-in 150ms ease-out;
  }
  @keyframes slide-in {
    from {
      transform: translateX(-100%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .panel {
      animation: none;
    }
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
