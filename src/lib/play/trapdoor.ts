import { bundledDungeon } from '../game/dungeon';
import type { Game } from '../game/port/state';
import { hintOnFloor } from './arrival';
import type { Turn } from './engine';

/**
 * The trap doors, and the town's four buildings, which are the two things the function catalog
 * has the wrong way round: `town_features` (exe 2000:bd32) is the trap door on a square and
 * `trapdoor` (exe 2000:9cba) is the building on one.
 */

/**
 * town_features (exe 2000:bd32, unf.c "town_features"): the floor a trap door on this square
 * leads to, and -1 for a square with no trap door.
 */
export function trapdoorUnder(game: Game): number {
  return bundledDungeon.trapdoor(game.pc.x, game.pc.y, game.pc.level, game.pc.module);
}

/**
 * trapdoor (exe 2000:9cba, unf.c "trapdoor"): the building on this square of the town — 1 store,
 * 2 temple, 3 bank, 4 inn — and 0 for a square with none.
 */
export function buildingUnder(game: Game): number {
  return bundledDungeon.townFeature(game.pc.x, game.pc.y, game.pc.module);
}

/**
 * explain_trapdoor (exe 2000:be3d, unf.c "explain_trapdoor"): the box a trap door puts up every
 * pass round movecontrol's loop, which is either how to use it or how to find the key. Returns
 * whether the character has that key, which is what decides whether K does anything.
 *
 * The keyhole is labelled with the floor the door leads to. The original appends one more string
 * after the number that the decompilation dropped.
 */
export function explainTrapdoor(game: Game, destination: number): boolean {
  // DS:2519: the box goes with the character's next step off the square (FUN_2000_bcb6).
  game.boxLeavesWithSquare = true;
  const held = game.rules.keys.flag(game.pc, destination) !== 0;
  if (!held) {
    // DS:1baf 1bcc, DS:1be4 1bfc 1c16 1c2d 1c46 1c5d
    game.say(
      '  YOU HAVE FOUND A TRAP DOOR',
      `WITH A KEYHOLE LABELED ${destination}`,
      '  UNFORTUNATELY, YOU DO',
      'NOT HAVE THE CORRECT KEY.',
      '  THIS KEY CAN ONLY BE',
      'FOUND BY KILLING A LEVEL',
      'DRAINER NEAR THE LEVEL',
      'THIS TRAP DOOR LEADS TO.',
    );
    return false;
  }
  // DS:1baf 1bcc, DS:06f0, DS:1c76 1c8f 1ca6
  game.say(
    '  YOU HAVE FOUND A TRAP DOOR',
    `WITH A KEYHOLE LABELED ${destination}`,
    '',
    'TO USE THE KEY YOU FOUND',
    "EARLIER, HIT 'K' TO GO",
    'THROUGH THE DOOR...',
  );
  return true;
}

/**
 * movecontrol's 0x6b branch: K opens the trap door and drops the character onto the one square
 * every trap door to that floor lands on.
 */
export function goThroughTrapDoor(turn: Turn): void {
  const { game, session } = turn;
  if (turn.trapdoor < 1) {
    // DS:1ce8 1cfd, DS:06f0, DS:1a56
    game.say("I DON'T SEE ANY TRAP", '  DOOR HERE. KEEP SEARCHING', '', '      HIT ANY KEY...');
    game.pressAnyKey();
    return;
  }
  const from = { x: game.pc.x, y: game.pc.y };
  const [x, y] = bundledDungeon.trapdoorDest(turn.trapdoor, game.pc.module);
  game.pc.x = x;
  game.pc.y = y;
  game.pc.level = turn.trapdoor;
  hintOnFloor(game);
  session.enterFloor(turn.trapdoor);
  game.events.push({ kind: 'trapdoorTaken', from, to: turn.trapdoor });
}
