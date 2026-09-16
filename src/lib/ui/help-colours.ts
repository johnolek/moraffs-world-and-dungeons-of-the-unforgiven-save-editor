import { HELP_COLOURS } from '../game/port/hints';
import { SCREEN_COLOURS } from '../roller/screen';

/**
 * The order the site cycles the help screens' colours in.
 *
 * The `.uhp` files switch colour every paragraph or two and pick without any pattern, so there is
 * no order of the game's to copy. This one keeps the two that look alike apart: `n` is a golden
 * orange and `o` an orange, and side by side they read as one colour repeated. `w`, the white the
 * screens start in, is left out because none of the files ever asks for it.
 */
const CYCLE = 'rybogn';

/** The colours the cycle runs through, as CSS, out of the game's own palette. */
export const HELP_CYCLE_COLOURS: string[] = [...CYCLE].map((code) => SCREEN_COLOURS[HELP_COLOURS[code]]);

/**
 * The colour at position `index` of the cycle, which repeats for as long as the caller counts.
 *
 * The caller decides what it is counting: the Tidbits banners count down the page, and the
 * announcements count by the number the server gave each one, so that an announcement keeps its
 * colour however many newer ones arrive above it.
 */
export function helpCycleColour(index: number): string {
  return HELP_CYCLE_COLOURS[index % HELP_CYCLE_COLOURS.length];
}
