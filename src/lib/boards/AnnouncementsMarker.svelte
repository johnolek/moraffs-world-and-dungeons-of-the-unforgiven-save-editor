<!--
  The mark at the top left of the page saying the run server has announced something this browser
  has not been shown. Clicking it opens the timeline (`AnnouncementTimeline.svelte`), and that is
  what clears it: the announcements are read there.

  The space it stands in is always kept, so the title beside it does not jump sideways when an
  announcement arrives.
-->
<script lang="ts">
  import { announcementsUnread } from './unread.svelte';

  let { onopen }: { onopen: () => void } = $props();

  const LABEL = 'New announcements';
</script>

<div class="slot">
  {#if announcementsUnread()}
    <button type="button" aria-label={LABEL} title={LABEL} onclick={onopen}>
      <span class="glyph" aria-hidden="true">✉</span>
      <span class="dot" aria-hidden="true"></span>
    </button>
  {/if}
</div>

<style>
  .slot {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
  }
  button {
    position: relative;
    display: block;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--accent);
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid var(--accent);
  }
  .glyph {
    font-size: 17px;
    line-height: 24px;
  }
  .dot {
    position: absolute;
    top: 1px;
    right: 0;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--mw-red);
  }
</style>
