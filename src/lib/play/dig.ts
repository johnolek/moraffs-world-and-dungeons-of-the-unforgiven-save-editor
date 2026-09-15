import { attackTiming } from '../game/port/combat';
import { showHint } from '../game/port/drops';
import { endBattleSpells, passMoment, relocate } from '../game/port/moment';
import {
  BATTLE_TEXT_COLOUR,
  clearMenuBlock,
  clearMessageLine,
  messageLine,
} from '../game/port/screens';
import type { Game } from '../game/port/state';
import type { Turn } from './engine';

/**
 * dig_hole (exe 2000:ba3f, unf.c "dig_hole"): T digs through the floor to whatever is under it.
 *
 * It is refused three quarters of the way down a module, where a Fighter — who has no Relocate
 * or Ascend to fall back on — is moved somewhere else on the floor by way of an apology and
 * everybody else is told the rock is too hard. Digging takes six moments, which the monsters
 * spend walking towards the character without being allowed to swing, and one that reaches them
 * stops the dig.
 */

/** The snake's three answers: the question, the rock that is too hard, and the Fighter's move. */
const DIG_QUESTION = 0x59;
const TOO_DEEP = 0x1d;
const FIGHTER_MOVED = 0x73;

/** The two keys the question takes. */
const DIG = 0x31;

/** How long a monster's attack timer is held at while the digging goes on. */
const HELD_TIMER = -1200;

/** How many moments the digging takes. */
const DIGGING_MOMENTS = 6;

/**
 * The flashing of 'DIGGING... DIGGING...' (exe 2000:bb92 and 2000:bbeb): four times over, the
 * line wiped off for {@link DIG_BLANK_MS} and then drawn again for as long as the run asks.
 *
 * The second run of four is reached only from the top floor down to floor 15 (exe 2000:bbc0
 * tests the floor against 16), and it holds the line half a second longer, so digging near the
 * surface takes twice as long as digging deep.
 */
const DIG_FLASHES = 4;
const DIG_BLANK_MS = 300;
const DIG_LINE_MS = 1500;
const DIG_SHALLOW_LINE_MS = 2000;
const DIG_SECOND_RUN_STOPS_AT = 16;

/** How long the line saying a monster has interrupted the dig stands (exe 2000:bb70). */
const MONSTER_HELPS_MS = 1000;

/** How far down a hole can reach, and where the floors run out. */
const DEEPEST_REACH = 6;

/** One run of four flashes, each one wiping the line off and drawing it again. */
export function digging(game: Game, lineMs: number): void {
  for (let flash = 0; flash < DIG_FLASHES; flash++) {
    clearMessageLine(game);
    if (!game.highSpeed) game.delay(DIG_BLANK_MS);
    game.draw(messageLine('DIGGING... DIGGING...', BATTLE_TEXT_COLOUR)); // DS:1b5c
    if (!game.highSpeed) game.delay(lineMs);
  }
}

export async function digHole(turn: Turn): Promise<void> {
  const { game, session } = turn;
  const pc = game.pc;
  const bottom = game.rules.bottomLevel(pc.module);
  if (Math.trunc((bottom * 3) / 4) < pc.level) {
    if (pc.cls === 0) {
      showHint(game, FIGHTER_MOVED);
      game.pressAnyKey();
      relocate(game);
      // The hole was refused, but the character is standing somewhere else on the floor for it.
      game.events.push({ kind: 'dug', outcome: 'moved' });
      return;
    }
    showHint(game, TOO_DEEP);
    game.pressAnyKey();
    return;
  }
  showHint(game, DIG_QUESTION);
  if ((await session.choice([DIG, 0x32])) !== DIG) return;
  session.box = [];
  game.monsterTimers.fill(HELD_TIMER);
  for (let moment = 0; moment < DIGGING_MOMENTS; moment++) passMoment(game);
  game.monsterTimers.fill(0);
  if (attackTiming(game) !== -1) {
    game.redrawView = true;
    clearMenuBlock(game);
    game.draw(messageLine('A MONSTER WANTS TO HELP', BATTLE_TEXT_COLOUR)); // DS:1b44
    if (!game.highSpeed) game.delay(MONSTER_HELPS_MS);
    // No hole, but the six moments above are spent and the monsters have walked them.
    game.events.push({ kind: 'dug', outcome: 'interrupted' });
    return;
  }
  digging(game, DIG_LINE_MS);
  // DS:1b72 1b89 1ba1
  game.say('BOY THIS IS HARD WORK!', 'THIS IS ONE WAY TO WORK', '  UP A SWEAT!');
  // print_menu_only ends in FUN_2000_4054, which takes a key and then wipes what it showed, so
  // the second run of flashes has the strip to itself.
  await game.key();
  session.wipeMessageBlock();
  if (pc.level < DIG_SECOND_RUN_STOPS_AT) digging(game, DIG_SHALLOW_LINE_MS);
  clearMessageLine(game);
  game.engaged = -1;
  game.recenterMap = true;
  let landing = pc.level;
  do {
    landing += 1;
    if (landing >= pc.level + DEEPEST_REACH || landing >= Math.trunc((bottom * 5) / 6)) break;
  } while (game.solid(pc.x, pc.y, landing, pc.module));
  // Relocate looks for an open square on the floor being left, so this keeps drawing squares
  // until one of them happens to be open on the floor below as well.
  while (game.solid(pc.x, pc.y, landing, pc.module)) relocate(game);
  endBattleSpells(game);
  session.enterFloor(landing);
  game.events.push({ kind: 'dug', outcome: 'hole', to: landing });
}
