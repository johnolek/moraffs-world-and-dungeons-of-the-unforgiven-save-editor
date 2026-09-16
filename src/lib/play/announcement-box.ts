import type { Announcement } from '../../../server/announcing';
import { announcementWords } from '../boards/announce';
import type { ScreenLine } from '../game/port/state';

/**
 * An announcement from the run server, written as lines of the game's own message box.
 *
 * Nothing here belongs to any game: it is the tab drawing over the box the game has printed, at
 * the display layer and nowhere else. The engine is never told, the run log never hears of it,
 * and a replay of the run draws none of it.
 */

/** How many of the box's lines an announcement may take. */
export const ANNOUNCEMENT_ROWS = 2;

/** What the end of a sentence too long for those lines is replaced with. */
const CUT = '...';

/** Where a game's message box would put a line, which is all this file needs to know of it. */
export interface MessageBoxGrid {
  /** How many lines the box holds. */
  rows: number;
  /** How many characters a line holds at the font's own spacing. */
  columns: number;
  /** The box's line on that row, in the font and the colour the game draws its own in. */
  line(text: string, row: number): ScreenLine;
}

/**
 * The words broken into at most {@link ANNOUNCEMENT_ROWS} lines of that many characters, the last
 * of them cut short when there is more sentence than room.
 *
 * A word longer than a line is left whole and over-long: both games squeeze a line that will not
 * fit rather than breaking it, so the renderer already has an answer for one.
 */
export function announcementRows(words: string, columns: number): string[] {
  const rows: string[] = [];
  let row = '';
  let dropped = false;
  for (const word of words.split(/\s+/).filter((one) => one !== '')) {
    if (row === '') {
      row = word;
    } else if (row.length + 1 + word.length <= columns) {
      row = `${row} ${word}`;
    } else if (rows.length + 1 === ANNOUNCEMENT_ROWS) {
      dropped = true;
      break;
    } else {
      rows.push(row);
      row = word;
    }
  }
  if (row !== '') rows.push(row);
  if (dropped) rows[rows.length - 1] = cutShort(rows[rows.length - 1], columns);
  return rows;
}

/** The row with the mark of a cut on its end, made room for where the row is already full. */
function cutShort(row: string, columns: number): string {
  const kept = row.length + CUT.length <= columns ? row : row.slice(0, Math.max(columns - CUT.length, 0));
  return kept + CUT;
}

/**
 * An announcement as lines of a message box.
 *
 * It goes on the bottom rows of the box. All three games fill a box from the top — the eight
 * strings of the buffer are drawn in order from `MESSAGE_BOX_LINES_TOP` down (`messageBoxLines` in
 * `screens.ts`, `mwMessageBoxLines` in `mw/screens.ts`) — and most boxes are a line or two, so the
 * bottom of the box is the part the game has printed nothing on. A box that has filled all eight
 * of its lines is written over until the game next prints, which takes the announcement off.
 *
 * The words are the ones the footer and the timeline show, in upper case: the games print in
 * upper case and have no lower-case letters to print in.
 */
export function announcementBoxLines(announcement: Announcement, box: MessageBoxGrid): ScreenLine[] {
  const rows = announcementRows(announcementWords(announcement).toUpperCase(), box.columns);
  return rows.map((text, index) => box.line(text, box.rows - rows.length + index));
}

/** An announcement the message box is showing, or has shown. */
export interface CarriedAnnouncement {
  announcement: Announcement;
  /** The box it went up over, or null once the game has printed and it has gone. */
  over: string | null;
}

/**
 * What the box holds, as one string, so that a box built afresh out of the same lines every turn
 * counts as the box that was already up.
 */
export function boxSignature(lines: readonly ScreenLine[]): string {
  return lines.map((line) => `${line.x},${line.y},${line.text}`).join('\n');
}

/**
 * The announcement the message box is carrying now.
 *
 * One stays up until the game prints in the box, which is what `over` is for: it is the box the
 * announcement went up over, and a box that no longer matches it is the game having written
 * something the player asked for and is waiting to read. An announcement taken off this way does
 * not come back, since it is still the newest one to have arrived.
 *
 * @param carrying what the box was carrying, or null when it was carrying nothing
 * @param arrived the newest announcement to have come down the feed, or null while none has
 * @param box {@link boxSignature} of the box as it stands
 */
export function announcementCarried(
  carrying: CarriedAnnouncement | null,
  arrived: Announcement | null,
  box: string,
): CarriedAnnouncement | null {
  if (arrived === null) return carrying;
  if (carrying === null || carrying.announcement.id !== arrived.id) return { announcement: arrived, over: box };
  if (carrying.over === null || carrying.over === box) return carrying;
  return { ...carrying, over: null };
}
