import type { AdminCharacterRow } from '../../../server/admins';
import { isLeaderboard, leaderboardLabel } from '../character/leaderboard';
import { NOTHING_TO_SHOW } from '../boards/words';

/**
 * What the admin's list of every character makes of the rows the server sends: which of them the
 * filter box leaves showing, and the words for the two columns whose values are the server's own.
 *
 * Nothing here draws, so all of it can be read and tested without a browser.
 */

/**
 * The characters the filter box leaves showing.
 *
 * The server hands out a page at a time and has no search of its own, so this looks only at the
 * rows read so far: a character further back than the reader has loaded is not found until More
 * has been pressed enough times to reach it. Both names are looked at, because the player's name
 * and the character's are both things somebody remembers about a character they want gone.
 */
export function charactersMatching(rows: AdminCharacterRow[], typed: string): AdminCharacterRow[] {
  const looking = typed.trim().toLowerCase();
  if (looking === '') return rows;
  return rows.filter(
    (row) => row.player.toLowerCase().includes(looking) || row.name.toLowerCase().includes(looking),
  );
}

/** What a character was rolled for: the board its runs go on, or the mode it is locked to where it
 *  is on no board. A word this build has never heard of came from a newer server and is shown as
 *  it was sent. */
export function characterTypeWords(type: string | null): string {
  if (type === null) return NOTHING_TO_SHOW;
  return isLeaderboard(type) ? leaderboardLabel(type) : type;
}

/** What has become of a character. */
const STATUS_WORDS: Record<string, string> = { alive: 'Alive', dead: 'Dead', won: 'Won' };

export function characterStatusWords(status: string): string {
  return STATUS_WORDS[status] ?? status;
}
