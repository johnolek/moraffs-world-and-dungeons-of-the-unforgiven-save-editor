import { showHint } from '../game/port/drops';
import { relocate } from '../game/port/moment';
import type { JournalEvent } from '../game/journal-events';
import type { Turn } from './engine';

/**
 * change_module (exe 2000:c0a5, unf.c "change_module"): the module teleporter, the wall the
 * character walks into that leads out of one module and into the next.
 *
 * Module I only goes onward and module V only back; in between the snake asks which. A character
 * rolled under the normal difficulty is turned back at the door of module V. Whatever happens,
 * the character arrives in the new module's town on a random open square.
 *
 * The crossing itself is a screen of its own: `tunnel.ts` draws it and `GameSession.crossToModule`
 * is the order the original does it in.
 *
 * The screen the original shows for a module that is not installed — SORRY! and a telephone
 * number to buy it on — is not built, since all five ship here.
 */

/** The snake's teleporter menu, the refusal at module V's door, and the arrival. */
const TELEPORTER_MENU = 0x7d;
const TOO_EASY = 0x68;
const ARRIVED = 0x6b;

/** The three keys the teleporter menu takes: onward, retreat, stay. */
const ONWARD = 0x31;
const RETREAT = 0x32;
const STAY = 0x33;

/** The module the extended episodes end at, which normal difficulty may not enter. */
const LAST_MODULE = 4;

/**
 * Take the teleporter. Returns whether the character went anywhere.
 *
 * movecontrol is what loads the new module's town in the original, off that answer; here the
 * loading is done at the end of this function instead, since the snake's greeting waits for a key
 * and only a caller that can wait could take it.
 *
 * `took` is the action the run counts for the crossing, which is whichever of the two ways of
 * reaching the teleporter was used. It is pushed as the crossing begins rather than when it is
 * over, so the count already has it while the crossing screen is up.
 */
export async function changeModule(
  turn: Turn,
  took: Extract<JournalEvent, { kind: 'stepped' | 'ladderTaken' }>,
): Promise<boolean> {
  const { game, session } = turn;
  const pc = game.pc;
  let direction = 0;
  if (pc.module === 0) direction = 1;
  else if (pc.module === LAST_MODULE) direction = -1;
  else {
    showHint(game, TELEPORTER_MENU);
    const chosen = await session.choice([ONWARD, RETREAT, STAY]);
    if (chosen === ONWARD) direction = 1;
    else if (chosen === RETREAT) direction = -1;
    else return false;
  }
  if (pc.hard === 0 && pc.module === LAST_MODULE - 1 && direction === 1) {
    showHint(game, TOO_EASY);
    game.pressAnyKey();
    return false;
  }
  game.events.push(took);
  // FUN_4000_771b is called with the module being arrived in, before the module index changes.
  await session.crossToModule(pc.module + direction);
  pc.level = 0;
  pc.module += direction;
  game.events.push({ kind: 'dungeonReached', dungeon: pc.module });
  relocate(game);
  session.save();
  showHint(game, ARRIVED);
  game.pressAnyKey();
  // The arrival box and its plaque are drawn on the tunnel, which nothing paints over until
  // movecontrol comes round and draws the screen again. That is after this box's own key, so the
  // key is taken here rather than at the top of the loop and the tunnel comes down with it.
  await session.settle();
  session.tunnel = null;
  // change_module hands back the moment the arrival box has its key, and it is movecontrol that
  // loads the new module's town afterwards (unf.c "movecontrol", the two `change_module()` calls),
  // so the snake's greeting is read after the arrival box rather than behind it.
  session.enterFloor(0);
  await session.settle();
  return true;
}
