import { bundledDungeon } from '../game/dungeon';
import { showHint } from '../game/port/drops';
import type { Game, ScreenLine } from '../game/port/state';
import { hintOnFloor } from './arrival';
import type { Turn } from './engine';
import { changeModule } from './modules';
import { buildingName } from '../game/port/town';
import { enterBuilding } from './town';

/**
 * The ladders: U to climb one, D to go down one, and the module teleporter waiting at the bottom
 * of the last floor a module has.
 */

/** The snake's answer to U or D on a square with no ladder on it. */
const NO_LADDER = 0x67;

/**
 * check_for_ladder (exe 3000:827f, unf.c "check_for_ladder"): how many floors the ladder on this
 * square goes, down being positive and up negative, and 0 for a square with no ladder.
 */
export function ladderUnder(game: Game): number {
  return bundledDungeon.ladder(game.pc.x, game.pc.y, game.pc.level, game.pc.module);
}

/**
 * draw_ladder_prompt (exe 2000:aa95, unf.c "draw_ladder_prompt"): the box the game puts up on a
 * square with a way out of the floor. A ladder down says which key goes down it; a ladder up and
 * a building both say the other one, since a building in the town is reached by climbing to it.
 */
export function ladderPrompt(ladder: number, building: number): ScreenLine[] | null {
  const reads = ladder !== 0 ? ladder : -building;
  if (reads === 0) return null;
  // FUN_2000_ac9e draws the box at this corner of the big view; the two lines sit ten units in
  // from its left edge and are spread across its 200 units of width.
  const x = LADDER_PROMPT_X + 10;
  const line = (text: string, down: number): ScreenLine => ({
    text,
    x,
    y: LADDER_PROMPT_Y + down,
    spreadTo: LADDER_PROMPT_X + 200,
    font: 0,
    colour: 15,
  });
  // DS:1913 191c, or DS:1902 190a
  return reads > 0
    ? [line('HIT D TO', 0x0f), line('GO DOWN', 0x37)]
    : [line("HIT 'U'", 0x28), line('TO GO UP', 0x50)];
}

/**
 * Where that box goes on the screen the game plays on: FUN_2000_ac9e (exe 2000:ac9e) calls
 * draw_ladder_prompt with this corner when it has drawn the four views.
 */
export const LADDER_PROMPT_X = 0x14a;
export const LADDER_PROMPT_Y = 0x258;

/**
 * movecontrol's 0x75 branch: U climbs the ladder up, or goes into the building the square holds.
 * The game reads the two the same way round, because a building in the town is up a ladder.
 */
export async function goUp(turn: Turn): Promise<void> {
  const { game, session } = turn;
  if (turn.ladder < 0) {
    const to = game.pc.level + turn.ladder;
    session.enterFloor(to);
    hintOnFloor(game);
    game.events.push({ kind: 'ladderTaken', to });
    return;
  }
  if (turn.building !== 0) {
    // The building is counted on the way in rather than on the way out, so that what a player is
    // shown while they are inside one already has it.
    game.events.push({ kind: 'buildingEntered', building: buildingName(game.pc.module, turn.building) });
    await enterBuilding(turn);
    return;
  }
  showHint(game, NO_LADDER);
  game.pressAnyKey();
}

/**
 * movecontrol's 0x64 branch: D goes down the ladder. A ladder that would lead past the bottom
 * floor of the module is the module teleporter instead, which is how a module is left from its
 * deepest floor.
 */
export async function goDown(turn: Turn): Promise<void> {
  const { game, session } = turn;
  if (turn.ladder < 1) {
    showHint(game, NO_LADDER);
    game.pressAnyKey();
    return;
  }
  if (game.rules.bottomLevel(game.pc.module) < game.pc.level + turn.ladder) {
    // The module teleporter stands at the bottom of a module and lands the character in the next
    // module's town, which is floor 0 of it.
    await changeModule(turn, { kind: 'ladderTaken', to: 0 });
    return;
  }
  const to = game.pc.level + turn.ladder;
  session.enterFloor(to);
  hintOnFloor(game);
  game.events.push({ kind: 'ladderTaken', to });
}
