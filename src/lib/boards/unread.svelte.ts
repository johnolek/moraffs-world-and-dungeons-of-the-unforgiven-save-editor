/**
 * Whether the reader has been shown the newest announcement, which is what the marker in the
 * header is on.
 *
 * The decision is a function of two moments and nothing else, so that what counts as unread can be
 * tested without a browser or a feed.
 */

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
