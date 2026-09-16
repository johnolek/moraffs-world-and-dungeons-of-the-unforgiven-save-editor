<!--
  The announcements beside the boards: everything the server has said, newest first, with each new
  one arriving as it is made.

  The feed itself is `announcement-feed.svelte.ts`, which the footer reads as well, so the page
  follows one feed however many places on it are showing announcements. It goes on being followed
  after this panel has gone away with the tab.

  It is also the whole of what the slide-out timeline shows (`AnnouncementTimeline.svelte`), which
  is what `fills` is for: one list, drawn beside the boards or filling a panel laid over the page.
-->
<script lang="ts">
  import SectionHeading from '../ui/SectionHeading.svelte';
  import { announcementWords } from './announce';
  import { announcementsShowing, older } from './announcement-feed.svelte';
  import { BOARDS_PAGE, whenWords } from './words';

  interface Props {
    /** Fill whatever this is in rather than standing as a column of a fixed width down the side
     *  of the page. */
    fills?: boolean;
  }

  let { fills = false }: Props = $props();

  const showing = $derived(announcementsShowing());
  let reading = $state(false);

  async function readOlder(): Promise<void> {
    reading = true;
    await older();
    reading = false;
  }
</script>

<aside class="announcements" class:fills>
  <SectionHeading title={BOARDS_PAGE.announcements} />
  {#if showing.announcements.length === 0}
    <p class="empty">{showing.failed ? BOARDS_PAGE.announcementsUnreachable : BOARDS_PAGE.nothingAnnounced}</p>
  {:else}
    <ul>
      {#each showing.announcements as announcement (announcement.id)}
        <li>
          <span class="said">{announcementWords(announcement)}</span>
          <span class="when">{whenWords(announcement.at)}</span>
        </li>
      {/each}
    </ul>
    {#if showing.more}
      <button type="button" onclick={readOlder} disabled={reading}>{BOARDS_PAGE.more}</button>
    {/if}
    {#if showing.failed}
      <p class="empty">{BOARDS_PAGE.announcementsUnreachable}</p>
    {/if}
  {/if}
</aside>

<style>
  .announcements {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    width: 320px;
    flex-shrink: 0;
    padding: 16px;
    border-left: 1px solid var(--line);
    background: var(--panel);
    overflow-y: auto;
  }
  /* In a panel of its own there is no board beside it to be divided from, and the panel decides
     how wide the list is. */
  .announcements.fills {
    width: auto;
    flex: 1;
    min-height: 0;
    border-left: none;
    background: none;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
  }
  .said {
    display: block;
    font-size: 13px;
    line-height: 1.4;
  }
  .when {
    display: block;
    margin-top: 2px;
    color: var(--muted);
    font-size: 11px;
  }
  button {
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
</style>
