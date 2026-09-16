import { showHint } from '../game/port/drops';
import type { Game } from '../game/port/state';
import { bossOfficeTaunt, readBossOfficeMessage } from '../game/port/town';
import type { GameSession, Turn } from './engine';

/**
 * random_events_tick (exe 3000:6e85, unf.c "random_events_tick"), which movecontrol runs once a
 * key has asked for a step.
 *
 * Most of what it does is roll for one of the notes the game drops under a monster — the tour a
 * new character is given and the eight warnings after it — which this port does not show. What
 * is left of it here is the count it keeps: every two hundred and fiftieth step the little snake
 * brings the message the section's boss has sent, and the rest of the function is skipped that
 * time round.
 */

/** How many steps apart the boss's messages are: the 0xfa the step count is taken modulo. */
const STEPS_BETWEEN_MESSAGES = 0xfa;

/** get_choice on hint 123's two entries: 1 reads the message, 2 tells the snake to get lost. */
const READ_IT = 0x31;
const MESSAGE_MENU = [READ_IT, 0x32];

/**
 * The two counts movecontrol and random_events_tick keep in the data segment: DS:2414, the steps
 * taken, and DS:0273, the step after an arrival that does not count. The character record has no
 * room for either, so they are kept beside the game they belong to.
 */
const counts = new WeakMap<Game, { steps: number; skipOneStep: boolean }>();

function countsOf(game: Game): { steps: number; skipOneStep: boolean } {
  const count = counts.get(game) ?? { steps: 0, skipOneStep: false };
  counts.set(game, count);
  return count;
}

/**
 * FUN_2000_31bc (exe 2000:31bc): arriving on a floor raises the flag that keeps movecontrol from
 * running the tick for the first step taken there.
 */
export function skipTheNextTick(game: Game): void {
  countsOf(game).skipOneStep = true;
}

/** random_events_tick, and movecontrol's own test of the flag an arrival raised. */
export async function randomEventsTick(turn: Turn): Promise<void> {
  const count = countsOf(turn.game);
  if (count.skipOneStep) {
    count.skipOneStep = false;
    return;
  }
  count.steps += 1;
  if (count.steps % STEPS_BETWEEN_MESSAGES !== 0) return;
  count.steps = 0;
  await bossOfficeMessage(turn.session);
}

/**
 * boss_office_message (exe 3000:6c9d, unf.c "boss_office_message"): the taunt a section's Shadow
 * boss sends while it is still alive, which the snake offers and only shows if it is asked to.
 *
 * Reading it takes the display over. erase_menu_block (exe 4000:42b4) blanks it, the stone tablet
 * comes down across the bottom with the four lines of the taunt on it, and the boss stands in a
 * panel of the section's wall material with three lines of the big font beside it saying whose
 * office the message is from (`boss-office.ts`). The key the routine waits for at the end erases
 * the display again, which is what takes the three lines off it and leaves movecontrol to draw
 * the dungeon afresh.
 *
 * The screen arrives out of black. FUN_3000_9026 (exe 3000:9026) blacks the DAC before it draws
 * the slab and fades it back up afterwards, and it skips both only for the monster manual, which
 * is the 2 in DS:2412 (exe 3000:9076 and 3000:911d); the taunt's 3 gets the fade. The four lines
 * are cut into the stone after that fade, so they are not part of what comes up. Nothing else
 * ends this screen: the pause, the key wait and the fade out at the bottom of the routine are all
 * skipped for a tablet moved off the middle of the screen (exe 3000:92e1), and the taunt's is
 * dropped by 0xfa.
 *
 * The port also keeps the four lines in the message box, where the column beside the map reads
 * them; the original has them on the tablet alone.
 */
async function bossOfficeMessage(session: GameSession): Promise<void> {
  const game = session.game;
  const tablet = bossOfficeTaunt(game);
  if (tablet === null) return;
  showHint(game, 123);
  const chosen = await session.choice(MESSAGE_MENU);
  if (chosen !== READ_IT) return;
  const section = game.rules.sectionOf(game.pc.module, game.pc.level);
  const lines = readBossOfficeMessage(game, tablet);
  session.bossOffice = { section, lines };
  session.fadeScreen('in', { bossOffice: { section, lines: [] } });
  await game.key();
  session.bossOffice = null;
  game.eraseScreen();
  session.box = [];
}
