import type { Announcement } from '../../../server/announcing';
import { runServerUrl } from '../run-server';
import { browserFeed, followFeed, merged, prepended } from './feed';
import { loadAnnouncements, loadOlderAnnouncements, NO_ANNOUNCEMENTS, type LoadedAnnouncements } from './server';

/**
 * The announcements the whole page is following: one feed and one history, however many places on
 * the page are showing them.
 *
 * The footer shows the newest one on every tab and the Boards tab shows the history down the side.
 * Each opening a feed of its own would be two connections to one server for one reader, and two
 * lists that could disagree about what the newest announcement is.
 *
 * The feed opens the first time anything reads this and is never closed: the Boards tab is not
 * kept mounted, so closing the feed when that panel goes away would leave the footer deaf for the
 * rest of the visit.
 *
 * The feed goes up before the history is asked for, so that an announcement made while the history
 * is on its way is not missed. The two overlap for that moment and it is shown once.
 *
 * The file is not named `announcements.svelte.ts` because macOS reads file names without their
 * case: an import of `./announcements.svelte` there finds `Announcements.svelte`, the panel, and
 * hands back a component.
 */

let showing = $state<LoadedAnnouncements>(NO_ANNOUNCEMENTS);
let following = false;

/** Every announcement read so far, newest first, whether there are older ones to ask for, and
 *  whether the last call failed. */
export function announcementsShowing(): LoadedAnnouncements {
  follow();
  return showing;
}

/** The newest announcement, or nothing when none has been read yet or the server could not be
 *  reached. */
export function latestAnnouncement(): Announcement | null {
  return announcementsShowing().announcements[0] ?? null;
}

/** Add the announcements behind the oldest one showing to the end of it. */
export async function older(): Promise<void> {
  showing = await loadOlderAnnouncements(showing);
}

function follow(): void {
  if (following) return;
  following = true;
  const server = runServerUrl();
  if (server === null) return;
  followFeed(browserFeed(server), (announcement) => {
    showing = { ...showing, announcements: prepended(showing.announcements, announcement) };
  });
  void loadAnnouncements().then((history) => {
    showing = { ...history, announcements: merged(showing.announcements, history.announcements) };
  });
}
