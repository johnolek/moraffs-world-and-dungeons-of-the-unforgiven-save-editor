import { readStored, writeStored } from '../character/storage';
import { latestAnnouncement } from './announcement-feed.svelte';

/**
 * Whether the reader has been shown the newest announcement, which is what the marker in the
 * header is on.
 *
 * The decision is a function of two moments and nothing else, so that what counts as unread can be
 * tested without a browser or a feed.
 *
 * How far the reader has read is kept in the browser rather than on the server: the run server
 * knows a player by a passphrase, and somebody reading announcements has not been asked for one.
 * That means it is per browser, and a reader on a second device starts from nothing there.
 */

/** Where this browser keeps the moment of the newest announcement it has been shown. */
const SEEN_KEY = 'moraff-tools.announcements-seen';

/** Read once as the page loads, and kept here after that so that the marker goes away the moment
 *  the timeline is opened. */
let seenAt = $state<string | null>(readStored(SEEN_KEY));

/** Whether to show the marker: the newest announcement the page is following is newer than the
 *  newest this browser has been shown. */
export function announcementsUnread(): boolean {
  return somethingUnread(latestAnnouncement()?.at ?? null, seenAt);
}

/** Remember that the reader has been shown the announcement made at that moment. A browser that
 *  will not keep it shows the marker again on the next visit, which is the harmless way round. */
export function markAnnouncementsSeen(at: string): void {
  seenAt = at;
  writeStored(SEEN_KEY, at);
}

/**
 * Whether there is an announcement the reader has not been shown yet.
 *
 * A browser that has never opened the timeline has seen nothing, so any announcement at all is
 * unread. Anything may write to the store, so a last-seen moment that is not a date is treated the
 * same way. A newest moment that is not a date is left alone: there is nothing to compare it
 * against, and a marker nobody can clear is worse than no marker.
 *
 * @param newestAt when the newest announcement showing was made, or null when there is none
 * @param lastSeenAt when the newest announcement this browser was shown was made, or null when it
 *   has been shown none
 */
export function somethingUnread(newestAt: string | null, lastSeenAt: string | null): boolean {
  if (newestAt === null) return false;
  const newest = new Date(newestAt).getTime();
  if (Number.isNaN(newest)) return false;
  if (lastSeenAt === null) return true;
  const seen = new Date(lastSeenAt).getTime();
  return Number.isNaN(seen) || newest > seen;
}
