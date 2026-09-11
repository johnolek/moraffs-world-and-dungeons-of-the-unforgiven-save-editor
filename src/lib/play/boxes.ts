import type { GameSession } from './engine';

/**
 * The boxes a ported function prints, one after another.
 *
 * The game keeps one buffer of eight strings at DS:c694 and every box it shows fills all eight,
 * so nothing of the box before ever shows through; {@link GameSession.showBox} is where one box
 * goes up. What is here is the several boxes one call can print.
 */

/**
 * The boxes a ported function printed, one array of lines each.
 *
 * print_menu_only (exe 2000:309e) shows eight lines and waits for a key, so a function that
 * prints three boxes stops three times over. Nothing in the port is asynchronous and none of it
 * can wait, so all three are printed at once; this keeps them apart so that the play side can
 * show them one after another.
 */
export function boxesOf(session: GameSession, print: () => void): string[][] {
  const game = session.game;
  const boxes: string[][] = [];
  const said = game.say;
  game.say = (...lines: string[]) => {
    boxes.push(lines);
    said(...lines);
  };
  try {
    print();
  } finally {
    game.say = said;
  }
  return boxes;
}

/**
 * Every box a ported function printed, shown in turn, each one waiting for a key, and whatever
 * the function itself handed back.
 */
export async function printMenus<T>(session: GameSession, print: () => T): Promise<T> {
  let result!: T;
  const boxes = boxesOf(session, () => {
    result = print();
  });
  for (const box of boxes) {
    session.showBox(box);
    await session.game.key();
  }
  session.wipeMessageBlock();
  return result;
}

/**
 * The same, except that the last box stays up: the inn prints four boxes in a row and reads its
 * menu key off the last of them, so that one is not waited on twice.
 */
export async function printMenusEndingInAMenu(
  session: GameSession,
  print: () => void,
): Promise<void> {
  const boxes = boxesOf(session, print);
  for (const box of boxes.slice(0, -1)) {
    session.showBox(box);
    await session.game.key();
  }
  session.showBox(boxes[boxes.length - 1] ?? []);
}

/**
 * The boxes an asynchronous ported function prints, each waiting for a key of its own.
 *
 * kill_monster (exe 3000:b12d) prints several in a row and stops at every one of them, and it
 * asks menus of its own in between, so it cannot be run to the end and unpacked afterwards the
 * way {@link printMenus} runs a synchronous one. A box is queued as it is printed instead and
 * the queue is emptied wherever the function next waits for a key: the boxes before that wait
 * take a key each, and the box the wait itself belongs to is left standing for it.
 */
export async function printMenusWhile(
  session: GameSession,
  print: () => Promise<void>,
): Promise<void> {
  const game = session.game;
  const said = game.say;
  const askedKey = game.key;
  const askedChoice = game.choice;
  const queued: string[][] = [];
  const showEach = async (): Promise<void> => {
    for (let box = queued.shift(); box !== undefined; box = queued.shift()) {
      session.showBox(box);
      await askedKey();
    }
  };
  const showBeforeAWait = async (): Promise<void> => {
    const standing = queued.pop();
    await showEach();
    if (standing !== undefined) session.showBox(standing);
  };
  game.say = (...lines: string[]) => {
    queued.push(lines);
    said(...lines);
  };
  game.key = async () => {
    await showBeforeAWait();
    return askedKey();
  };
  game.choice = async (allowed: number[]) => {
    await showBeforeAWait();
    return askedChoice(allowed);
  };
  try {
    await print();
  } finally {
    game.say = said;
    game.key = askedKey;
    game.choice = askedChoice;
  }
  await showEach();
  session.wipeMessageBlock();
}
