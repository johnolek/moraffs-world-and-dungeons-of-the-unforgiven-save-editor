import { arriveSquare, leaveSquare } from '../game/port/moment';
import { BATTLE_TEXT_COLOUR, clearMessageLine, messageLine } from '../game/port/screens';
import { monsterAt } from '../game/port/state';
import type { Turn } from './engine';
import { changeModule } from './modules';
import { randomEventsTick } from './office';

/**
 * Turning and stepping: the four arrow keys, and the step movecontrol resolves at the end of
 * every pass round its loop.
 *
 * The character faces 0 north, 1 south, 2 west or 3 east. The original writes each turn out as
 * four comparisons rather than working it out, and the tables here are those comparisons.
 */

/** Which way the character ends up facing after each of the three turns. They are exported
 *  because both games' key modules work out from them which turn an arrow is asking for: either
 *  game can be played with either game's arrows. */
export const AROUND = [1, 0, 3, 2];
export const LEFT = [2, 3, 1, 0];
export const RIGHT = [3, 2, 0, 1];

/** What a square's side reads when a module teleporter stands in it (exe 2000:c22d). */
const MODULE_TELEPORTER = 4;

/** How long a jammed door's line is left on the screen: the delay at exe 2000:dcef and 2000:dd1c,
 *  0x15e. Nothing in the game shortens it. */
const JAMMED_MS = 350;

/** movecontrol, case 0 of its arrow switch: the down arrow turns the character round. */
export function turnAround(turn: Turn): void {
  turn.game.pc.dir = AROUND[turn.game.pc.dir];
  turn.game.redrawView = true;
}

/** movecontrol, case 5 of its arrow switch, and the Home key: turn to the left. */
export function turnLeft(turn: Turn): void {
  turn.game.pc.dir = LEFT[turn.game.pc.dir];
  turn.game.redrawView = true;
}

/** movecontrol, case 3 of its arrow switch, and Page Up: turn to the right. */
export function turnRight(turn: Turn): void {
  turn.game.pc.dir = RIGHT[turn.game.pc.dir];
  turn.game.redrawView = true;
}

/**
 * movecontrol's -0x48 branch: the up arrow asks for a step the way the character faces. The
 * original raises a flag and turns it into a step at the end of the loop, which comes to the
 * same thing, since nothing between the two changes which way the character is facing.
 */
export function stepForward(turn: Turn): void {
  const dir = turn.game.pc.dir;
  turn.step = {
    dx: dir === 2 ? -1 : dir === 3 ? 1 : 0,
    dy: dir === 0 ? -1 : dir === 1 ? 1 : 0,
  };
}

/**
 * The end of movecontrol's loop: the step the key asked for, if the square ahead will have it.
 *
 * A module teleporter takes the character to another module; a wall refuses; a monster standing
 * in the way stops the step, and says so when the two squares have a door between them. Anything
 * else — an open side, a door, a secret door — is walked through, and the step spends a moment.
 */
export async function resolveStep(turn: Turn): Promise<void> {
  const { game, step } = turn;
  const pc = game.pc;
  // movecontrol runs random_events_tick once a key has asked for a step, before the step is
  // taken and whether or not the square ahead turns out to allow it.
  if (step.dx !== 0 || step.dy !== 0) await randomEventsTick(turn);
  const side = sideStepped(turn);
  if (side === MODULE_TELEPORTER) {
    await changeModule(turn, { kind: 'stepped', dir: pc.dir });
    return;
  }
  if (side === 0) {
    // exe 2000:dc66: the wall says so on the strip above the message box, in the colour every
    // line of a fight is drawn in, and nothing waits or holds the screen afterwards. The line
    // stands there until something else is drawn on that strip.
    clearMessageLine(game);
    game.draw(messageLine('THE WALL REFUSES TO MOVE', BATTLE_TEXT_COLOUR)); // DS:1f1f
    return;
  }
  if (monsterAt(game, pc.x + step.dx, pc.y + step.dy) !== -1) {
    // exe 2000:dcbe: a door or a secret door with a monster behind it says so on the strip above
    // the message box, in the colour every line of a fight is drawn in, and the line is left
    // standing there once the delay is up. The next thing drawn on that strip is what takes it
    // off; movecontrol itself wipes nothing where it reads the player's key.
    if (side === 1 || side === 2) {
      clearMessageLine(game);
      // DS:1f38 and DS:1f4b
      const jammed = side === 1 ? 'THE DOOR IS JAMMED' : 'THE SECRET DOOR IS JAMMED';
      game.draw(messageLine(jammed, BATTLE_TEXT_COLOUR));
      game.delay(JAMMED_MS);
    }
    return;
  }
  // Taking a step in front of the monster being fought usually gives it a fresh interval to
  // wait out, which is the same roll attack_timing makes on meeting one. The test the original
  // writes is that the two halves of the step differ, and since only one of them is ever
  // anything but zero, that means a step was taken at all.
  if (game.engaged !== -1 && step.dy !== step.dx) {
    // The first of the three is a Random call (exe 2000:dd45) and the other two are written
    // inline, so only the first reseeds.
    if (
      game.randomCall(3) !== 0 ||
      (pc.invisible !== 0 && game.rng.random(pc.level + Math.trunc(pc.level / 2)) > pc.lev)
    ) {
      game.monsterTimers[game.engaged] = game.rng.random(pc.dex + 20);
    }
  }
  // Each of the four branches below refuses a step off the edge of the floor, so what says the
  // step happened -- and with it the moment arriveSquare spends -- is the character being
  // somewhere else afterwards.
  const from = { x: pc.x, y: pc.y };
  if (step.dy < 0 && pc.y > 0) {
    leaveSquare(game);
    pc.y -= 1;
    pc.mapCursorY -= 1;
    arriveSquare(game);
    if (pc.mapCursorY < 1) game.recenterMap = true;
  }
  if (step.dy > 0 && pc.y < game.rows) {
    leaveSquare(game);
    pc.y += 1;
    pc.mapCursorY += 1;
    arriveSquare(game);
    if (pc.mapCursorY > game.areaRows - 2) game.recenterMap = true;
  }
  if (step.dx > 0 && pc.x < game.columns) {
    leaveSquare(game);
    pc.x += 1;
    pc.mapCursorX += 1;
    arriveSquare(game);
    if (pc.mapCursorX > game.areaColumns - 2) game.recenterMap = true;
  }
  if (step.dx < 0 && pc.x > 0) {
    leaveSquare(game);
    pc.x -= 1;
    pc.mapCursorX -= 1;
    arriveSquare(game);
    if (pc.mapCursorX < 1) game.recenterMap = true;
  }
  if (pc.x !== from.x || pc.y !== from.y) game.events.push({ kind: 'stepped', dir: pc.dir });
  if (pc.maxHp < pc.hp) pc.hp = pc.maxHp;
}

/**
 * The side of the square the step goes through, or -1 when no step was asked for. The original
 * reads all four before it takes a key and picks between them here.
 */
function sideStepped(turn: Turn): number {
  const { sides, step } = turn;
  if (step.dy < 0) return sides.n;
  if (step.dy > 0) return sides.s;
  if (step.dx > 0) return sides.e;
  if (step.dx < 0) return sides.w;
  return -1;
}
