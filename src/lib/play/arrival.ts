import { showHint } from '../game/port/drops';
import { hintOnArrival } from '../game/port/hints';
import type { Game } from '../game/port/state';
import { skipTheNextTick } from './office';

/**
 * FUN_2000_31bc (exe 2000:31bc, unf.c "FUN_2000_31bc"): the hint the snake brings on arriving on
 * a floor, which movecontrol gives after every ladder, trap door and hole.
 *
 * Arriving in the town of module I always gets the one about the coloured squares; arriving on a
 * section boss's floor gets that section's warning while the boss is still alive; otherwise it is
 * one chance in twelve of one of the eight general hints.
 *
 * It also raises the flag that keeps the first step taken on the new floor from counting towards
 * the boss's next message.
 *
 * **Nothing waits for a key here.** Every branch of FUN_2000_31bc is `give_hint(); return;`, and
 * all three of movecontrol's calls to it go straight on — to `load_level_map` at exe 2000:d3e7
 * and to the next statement at the other two. The hint is printed and left standing until
 * something else draws over the message block, the way `give_hint` alone always leaves it.
 */
export function hintOnFloor(game: Game): void {
  skipTheNextTick(game);
  const hint = hintOnArrival(game.pc.module, game.pc.level, game.pc.objective[game.pc.module], game.rng);
  if (hint === null) return;
  game.events.push({ kind: 'hintRead', hint });
  showHint(game, hint);
}
