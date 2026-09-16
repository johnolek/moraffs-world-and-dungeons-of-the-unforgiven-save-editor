import { untrack } from 'svelte';
import { latestArrival } from '../boards/announcement-feed.svelte';
import type { ScreenLine } from '../game/port/state';
import {
  announcementBoxLines,
  announcementCarried,
  boxSignature,
  type CarriedAnnouncement,
  type MessageBoxGrid,
} from './announcement-box';

/**
 * The announcement a display is drawing in the game's message box, for as long as it is drawing
 * it.
 *
 * Every display that draws a message box keeps one of these, so nothing is remembered between one
 * sitting and the next: what had already arrived when the display went up counts as read, and the
 * box only ever carries something the player was there to see arrive.
 *
 * @param box the box as the display has it, which is what an announcement goes up over
 * @param grid where that game's box puts a line
 */
export function messageBoxAnnouncement(box: () => readonly ScreenLine[], grid: MessageBoxGrid) {
  const already = untrack(latestArrival);
  let carrying = $state.raw<CarriedAnnouncement | null>(
    already === null ? null : { announcement: already, over: null },
  );

  $effect(() => {
    const arrived = latestArrival();
    const showing = boxSignature(box());
    carrying = announcementCarried(
      untrack(() => carrying),
      arrived,
      showing,
    );
  });

  return {
    /** The lines to draw over the box, and none at all while it is carrying nothing. */
    get lines(): ScreenLine[] {
      return carrying === null || carrying.over === null ? [] : announcementBoxLines(carrying.announcement, grid);
    },
  };
}
