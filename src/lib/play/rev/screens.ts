import type { RevClearedScreen, RevGame } from './state';
import type { RevTownDesk } from './town';

/**
 * The screens the game takes the whole display over with.
 *
 * A `CLS` in `SCREEN 1` blacks the screen out and puts the cursor at 1, 1, and nothing draws the
 * dungeon again until the redraw at the end of the pass (1000:4275). So between the two, what is
 * on the screen is exactly what has been printed since, and `game.cleared` is that state.
 */

/** 1000:A890, A016, 0D8E, 7FFE and AC87: the screen is blacked out. */
export function revClearScreen(game: RevGame, keeping: RevClearedScreen = 'bare'): void {
  game.cleared = keeping;
  game.kept.clear();
  game.said = [];
}

/**
 * Which of the two places a redraw is reached from, which the routine reads as DGROUP B538.
 *
 * A key that takes the whole display over sets the flag to 1 on its way in — 1000:0E73 for the
 * magic list, 1000:0EE5 for the pause — and the redraw at the end of an ordinary pass puts it
 * back to 0 before it draws anything (1000:4317). So it is 1 exactly where a screen of that
 * kind is being given back, and 0 everywhere else.
 */
export type RevRedraw = 'afterAPass' | 'afterAScreen';

/** How many directions the compass has, which is what an offset that has gone round comes back
 *  by (1000:582C). */
const COMPASS = 4;

/**
 * The dungeon is drawn over whatever was cleared (1000:4275), and the arrow legend and the four
 * 3-D views with it (1000:593C).
 *
 * The routine leaves a number in the compiler's scratch cell, which is how far round the
 * compass the four arrows are drawn from where they belong, and it takes one of three paths:
 *
 * * 1000:5965: a screen is being given back on the level already drawn, so the views on the
 *   screen still stand and the arrows go back exactly where they were. The offset is 0.
 * * 1000:581C: the character is standing on the square the views were drawn from, so again only
 *   the arrows move, by however far the character has turned since they were drawn.
 * * Otherwise the views are scanned and drawn again (1000:59B9), which writes nothing in the
 *   cell and leaves whatever the last thing to use it put there.
 *
 * The statistics screen is the one caller that does not come through here: it writes the 0
 * itself (1000:1C5D) and then draws the arrows alone (1000:1C6C). Nothing it does can change the
 * level, so the first path's answer is the same one.
 */
export function revDrawTheDungeonAgain(game: RevGame, after: RevRedraw): void {
  game.cleared = null;
  game.kept.clear();
  const pc = game.pc;
  const drawn = game.lastDrawn;
  const sameLevel = drawn.level === pc.dungeonLevel;
  if (after === 'afterAScreen' && sameLevel) {
    game.scratch = 0;
    return;
  }
  if (sameLevel && drawn.column === pc.column && drawn.row === pc.row) {
    const turned = drawn.facing - pc.facing;
    game.scratch = turned < 0 ? turned + COMPASS : turned;
    return;
  }
  game.lastDrawn = {
    level: pc.dungeonLevel,
    column: pc.column,
    row: pc.row,
    facing: pc.facing,
  };
}

/**
 * `PRINT line;`, which leaves the cursor at the end of the line instead of starting a new row.
 *
 * The bank's two prompts end with the semicolon (1000:23FB and 2427), which is what puts the
 * digits beside the question rather than under it, and so does the line the temple plays its
 * march after (1000:253D).
 */
export function revSayKeepingTheCursor(game: RevGame, line: string): void {
  game.said.push(line);
  game.kept.printKeepingTheCursor(line);
}

/** 1000:020B, printed by 1000:C5B0: what a screen that has taken the display over waits with. */
export const REV_HIT_ANY_KEY = 'Hit any key';

/** Where it is printed: `LOCATE 25, <DGROUP B796> + 10` (1000:C5B0). B796 is 25 only while the
 *  help's 80-column screen is up (1000:C349) and 0 everywhere else, so here it is column 10. */
const HIT_ANY_KEY_ROW = 25;
const HIT_ANY_KEY_COLUMN = 10;

/**
 * 1000:2F3C: the prompt, the wait, and `SCREEN 1` put back afterwards.
 *
 * It is a plain blocking read (1000:2F71 through 1000:C5CC), so nothing walks about while it is
 * up, the same way nothing walks while a building's menu is waiting.
 */
export async function revHitAnyKey(game: RevGame, desk: RevTownDesk): Promise<void> {
  game.kept.printAt(HIT_ANY_KEY_ROW, HIT_ANY_KEY_COLUMN, REV_HIT_ANY_KEY);
  // The prompt has a `LOCATE` of its own, so it does not go through `say`, which would put it
  // wherever the cursor happened to be; the box the tab draws is told about it separately.
  game.said.push(REV_HIT_ANY_KEY);
  await desk.key();
}

/** 1000:B5E2 and B5F1: the two lines the game signs off with. */
export const REV_GRAB_A_SANDWICH = "Why don't you go grab a sandwich?";
export const REV_BETTER_LUCK = '   Better luck next time!';

/**
 * 1000:B5C8: the blank line and the sign-off, printed while `1.NUM` and `2.NUM` are written.
 *
 * Which of the two it is comes off DGROUP B734, and one place in the whole program writes it:
 * 1000:A22E, the death that has run out of raises, sets it to 1 just before calling this. So a
 * character who quits is told to go and get something to eat and a dead one is wished better
 * luck.
 *
 * The two monster files it writes are the state of the disk in the original; this port starts
 * every session from the shipped tables instead, which `README.md` has as a departure of its
 * own, so only the words are here.
 */
export function revSayGoodbye(game: RevGame, dead: boolean): void {
  game.say('', dead ? REV_BETTER_LUCK : REV_GRAB_A_SANDWICH);
}
