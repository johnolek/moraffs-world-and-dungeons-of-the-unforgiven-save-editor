import { killMonster } from '../game/port/kills';
import { printMenusWhile } from './boxes';
import type { GameSession } from './engine';
import { drawnMonsters } from './floor';

/**
 * movecontrol (exe 2000:c308, unf.c "movecontrol") at 2000:db6d: the check the loop makes once
 * the key has been dealt with and before it resolves the step.
 *
 * A monster being fought whose hit points have run out is killed here rather than wherever they
 * ran out, so a swing, a spell and a hand grenade all end the same way. `kill_monster` is what
 * hands over the experience, the drops and a section boss's reward, and it asks its own menus.
 *
 * The skull and crossbones goes on first (exe 2000:dafb), painted into the rectangle the view
 * drew the monster in, and stands there until the loop draws the views again.
 *
 * Every box kill_monster prints stops for a key, and the drops ask menus in between, so the kill
 * is run through {@link printMenusWhile} rather than straight through.
 */
export async function killTheDead(session: GameSession): Promise<void> {
  const game = session.game;
  if (game.engaged === -1 || game.monsters[game.engaged].hp >= 1) return;
  // The original paints the skull only where a monster really was drawn, which it knows from the
  // rectangle draw_3d_view kept for that view (exe 3000:2756 blanks it when the square is empty).
  const drawn = drawnMonsters(game).find((monster) => monster.slot === game.engaged);
  if (drawn) session.killed = { dir: game.enemyDir, monsterId: drawn.monsterId };
  await printMenusWhile(session, () => killMonster(game));
  // The repeat-fight flag comes down with the monster (exe 2000:dbe3), so Ctrl-F swings at one
  // monster rather than at whatever walks up next.
  session.repeatFight = false;
}
