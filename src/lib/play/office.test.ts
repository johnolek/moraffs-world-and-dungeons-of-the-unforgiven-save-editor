import { describe, expect, it } from 'vitest';
import { savePlayer } from '../game/port/record';
import { BorlandRng } from '../game/port/rng';
import { BATTLE_TEXT_COLOUR, messageLine } from '../game/port/screens';
import { newGame, type PlayerCharacter } from '../game/port/state';
import { UNFORGIVEN_MAP } from '../map/game';
import { newCharacterFile } from '../roller/save-file';
import { GameSession, runMoveControl, startGame, type CharacterFile } from './engine';
import { KEY } from './keys';

/** "1) SHOW ME THE MESSAGE" of hint 123. */
const READ_THE_MESSAGE = 0x31;

/** A character file that lives in the test rather than in the roster. */
function characterFile(overrides: Partial<PlayerCharacter>): CharacterFile {
  const pc = { ...newGame().pc, name: 'WALKER', ...overrides };
  return {
    bytes: savePlayer(pc, newCharacterFile(pc)),
    write(bytes) {
      this.bytes = bytes;
    },
    died() {},
  };
}

/** Press a key and let the loop get back to waiting for the next one. */
async function press(session: GameSession, key: number): Promise<void> {
  session.press(key);
  await new Promise((resolve) => setTimeout(resolve));
}

/** A square of a floor with a wall to the north and nothing else going on. */
function facingAWall(level: number): { x: number; y: number } {
  const rows = UNFORGIVEN_MAP.floor(level, 0);
  for (let y = 1; y < 100; y++) {
    for (let x = 1; x < 76; x++) {
      const square = rows[y][x];
      if (square.solid || square.n !== 0) continue;
      if (square.ladder !== 0 || square.chute !== 0 || square.trapdoor !== -1) continue;
      return { x, y };
    }
  }
  throw new Error(`no walled-in square on floor ${level}`);
}

describe("the boss's message", () => {
  it('comes with the two hundred and fiftieth step and is read on request', async () => {
    // Floor 5 is in module I's first section, whose Shadow has three taunts to send.
    const start = facingAWall(5);
    const file = characterFile({ level: 5, dir: 0, hp: 30000, maxHp: 30000, ...start });
    const session = startGame(file, new BorlandRng(3));
    void runMoveControl(session);
    for (let step = 0; step < 249; step++) await press(session, KEY.arrowUp);
    // The wall's line is drawn on the strip above the box rather than said into it.
    expect(session.game.screen).toContainEqual(
      messageLine('THE WALL REFUSES TO MOVE', BATTLE_TEXT_COLOUR),
    );
    expect(session.box).toEqual([]);
    await press(session, KEY.arrowUp);
    expect(session.box[0]).toBe('A LITTLE SNAKE HAS A MESSAGE');
    await press(session, READ_THE_MESSAGE);
    // The fade is still running, and it carries the bare stone: no taunt, no panel, no boss, and
    // none of the three lines of the heading on the screen under it.
    const fading = session.view();
    expect(fading.fade).toBe('in');
    expect(fading.bossOffice).toEqual({ section: 1, lines: [], slabOnly: true });
    expect(fading.screen.filter((line) => line.x === 400)).toEqual([]);
    // The taunt's own lines fill the box, and the three that say whose office it came from stand
    // on the screen beside the boss's picture, which is up until a key takes it down.
    expect(session.box).toHaveLength(4);
    expect(session.game.screen).toContainEqual({
      text: 'A MESSAGE FROM',
      x: 400,
      y: 0x1e,
      font: 2,
      colour: 15,
    });
    expect(session.game.screen.filter((line) => line.x === 400).map((line) => line.y)).toEqual([
      0x1e, 0xbe, 0x15e,
    ]);
    // The office carries the same four lines the box is showing, which is what the tablet the
    // routine brings down is drawn with.
    expect(session.bossOffice).toEqual({ section: 1, lines: session.box });
    expect(session.game.pc.bossTaunts[0]).toBe(1);
    await press(session, KEY.arrowUp);
    // The key erases the display, so the three lines go with the office and the dungeon is drawn
    // again rather than the screen staying black.
    expect(session.bossOffice).toBeNull();
    expect(session.game.screen.filter((line) => line.x === 400)).toEqual([]);
    expect(session.game.blackedOut).toBeNull();
    expect(session.box).toEqual([]);
  });
});
