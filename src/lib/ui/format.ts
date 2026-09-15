/** Turning numbers and words into the strings the page shows. */

/** A share of one as a percentage to one decimal place, the way every chance on the site reads:
 *  0.4235 is `42.4%`. */
export function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/**
 * A whole number with its thousands grouped, so a five or six digit one can be read without
 * counting digits: 12345 is `12,345`.
 *
 * The grouping is American whatever the reader's own machine is set to, because the site is
 * written in English and the game's own numbers are printed the way the game printed them.
 */
export function grouped(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Words as a name that is safe in a URL and in a file name on every system: lower case, with
 * every run of anything else turned into a dash and the dashes trimmed off the ends.
 *
 * Words with nothing left in them come back empty, so a caller says what an empty one is called.
 */
export function slugify(words: string): string {
  return words.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
