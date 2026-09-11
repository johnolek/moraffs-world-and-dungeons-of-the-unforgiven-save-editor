import { bundledDungeon } from '../game/dungeon';
import { clearMenuBlock, MENU_X } from '../game/port/screens';
import type { Game, ScreenLine } from '../game/port/state';
import type { Turn } from './engine';

/**
 * The chutes: a square that drops the character to a floor below it the moment they stand on
 * one, with no key to press and nothing to be done about it.
 */

/**
 * The three lines the fall is announced on (exe 2000:b58a, 2000:b5b3 and 2000:b5c4): plain pfont
 * calls down the message column, 0x28 apart rather than the 0x32 a menu line steps by, and all
 * three in colour 5.
 */
const CHUTE_Y = [0x329, 0x351, 0x379];
const CHUTE_COLOUR = 5;

/** How long the first line stands alone: exe 2000:b599, and the high speed option only shortens
 *  this one rather than skipping it. */
const SINKING_MS = 1500;
const SINKING_MS_HIGH_SPEED = 500;

const chuteLine = (text: string, index: number): ScreenLine => ({
  text,
  x: MENU_X,
  y: CHUTE_Y[index],
  font: 0,
  colour: CHUTE_COLOUR,
});

/**
 * detect_chute (exe 2000:b5ea, unf.c "detect_chute"): the floor the chute on this square drops
 * to, or the floor the character is already on when the square has no chute.
 */
export function chuteUnder(game: Game): number {
  const chute = bundledDungeon.chute(game.pc.x, game.pc.y, game.pc.level, game.pc.module);
  return chute;
}

/**
 * chute (exe 2000:b532, unf.c "chute"): fall. The character lands on the same square of a lower
 * floor, and the game saves them where they land.
 *
 * "UH OH... A SINKING FEELING..." stands on its own for a second and a half before the other two
 * lines join it, which is the whole of the fall as the player feels it.
 */
export async function fallDownChute(turn: Turn, destination: number): Promise<void> {
  const { game, session } = turn;
  if (destination === game.pc.level) return;
  game.events.push({ kind: 'chuteTaken', from: { x: game.pc.x, y: game.pc.y }, to: destination });
  session.enterFloor(destination);
  session.save();
  clearMenuBlock(game);
  game.draw(chuteLine('UH OH... A SINKING FEELING...', 0)); // DS:1a9e
  game.delay(game.highSpeed ? SINKING_MS_HIGH_SPEED : SINKING_MS);
  game.draw(chuteLine('YOU HAVE FALLEN DOWN A CHUTE!', 1)); // DS:1abc
  game.draw(chuteLine('  HIT ANY KEY TO CONTINUE...', 2)); // DS:1ada
  // erase_message_block (exe 4000:430e) again, on its own this time (exe 2000:b5d3): whatever was
  // typed while the character was falling is thrown away, so the wait is for a key pressed after
  // the words are up.
  session.flushKeys();
  await session.key();
  session.wipeMessageBlock();
  game.redrawView = true;
}
