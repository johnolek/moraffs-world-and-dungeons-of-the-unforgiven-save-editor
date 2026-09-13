import { HELP_COLOURS } from '../game/port/hints';
import { SCREEN_COLOURS } from '../roller/screen';

/**
 * The order the banners cycle the help screens' colours in.
 *
 * The `.uhp` files switch colour every paragraph or two and pick without any pattern, so there is
 * no order of the game's to copy. This one keeps the two that look alike apart: `n` is a golden
 * orange and `o` an orange, and side by side they read as one colour repeated. `w`, the white the
 * screens start in, is left out because none of the files ever asks for it.
 */
const CYCLE = 'rybogn';

/** The colours a banner is drawn in, as CSS, out of the game's own palette. */
export const BANNER_COLOURS: string[] = [...CYCLE].map((code) => SCREEN_COLOURS[HELP_COLOURS[code]]);

/** The colour of the `index`th entry of a Tidbits document, counting from the top of the page. */
export function bannerColour(index: number): string {
  return BANNER_COLOURS[index % BANNER_COLOURS.length];
}
