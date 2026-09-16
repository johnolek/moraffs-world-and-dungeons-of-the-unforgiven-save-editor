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
  import { app } from '../app-state.svelte';
  import { goToTab } from '../history';
  import { helpCycleColour } from '../ui/help-colours';
  import SectionHeading from '../ui/SectionHeading.svelte';
  import { announcementDid, announcementWho } from './announce';
  import { announcementsShowing, older } from './announcement-feed.svelte';
  import { BOARDS_PAGE, whenWords } from './words';
  import type { Announcement } from '../../../server/announcing';

  interface Props {
    /** Fill whatever this is in rather than standing as a column of a fixed width down the side
     *  of the page. */
    fills?: boolean;
    /** Called when a name has been clicked, so that a panel laid over the page can get out of the
     *  way of the run about to be shown underneath it. */
    onopened?: () => void;
  }

  let { fills = false, onopened }: Props = $props();

  const showing = $derived(announcementsShowing());
  let reading = $state(false);

  async function readOlder(): Promise<void> {
    reading = true;
    await older();
    reading = false;
  }

  function openRun(announcement: Announcement): void {
    app.requestedRun = announcement.characterId;
    goToTab(app, 'boards');
    onopened?.();
  }
</script>

<aside class="announcements" class:fills>
  <SectionHeading title={BOARDS_PAGE.announcements} />
  {#if showing.announcements.length === 0}
    <p class="empty">{showing.failed ? BOARDS_PAGE.announcementsUnreachable : BOARDS_PAGE.nothingAnnounced}</p>
  {:else}
    <ul>
      {#each showing.announcements as announcement (announcement.id)}
        <!-- The colour is the announcement's own number counted into the cycle, so it keeps the
             colour it was first drawn in however many newer ones arrive above it. -->
        <li style:--said={helpCycleColour(announcement.id)}>
          <span class="said">
            <button type="button" class="who" onclick={() => openRun(announcement)}
              >{announcementWho(announcement)}</button
            >
            {announcementDid(announcement)}
          </span>
          <span class="when">{whenWords(announcement.at)}</span>
        </li>
      {/each}
    </ul>
    {#if showing.more}
      <button type="button" class="more" onclick={readOlder} disabled={reading}>{BOARDS_PAGE.more}</button>
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
  /* The game's own face, which is drawn from a ten-pixel box. Fifteen puts one and a half screen
     pixels on each game pixel, which is three whole device pixels on a display that draws two to
     the pixel, and a soft edge on one that draws one. */
  .said {
    display: block;
    font-family: var(--font-game);
    font-size: 15px;
    line-height: 1.35;
    color: var(--said);
  }
  .who {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  /* A DOS menu marks what it is on by swapping its colours over, and so does this. */
  .who:hover,
  .who:focus-visible {
    background: var(--said);
    color: #000;
    text-decoration: none;
    outline: none;
  }
  .when {
    display: block;
    margin-top: 2px;
    color: var(--muted);
    font-size: 11px;
  }
  .more {
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .more:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
</style>
