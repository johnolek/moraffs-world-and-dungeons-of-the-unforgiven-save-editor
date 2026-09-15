import { describe, expect, it } from 'vitest';
import { BATTLE_TEXT_COLOUR, MENU_X, MESSAGE_LINE_Y } from '../game/port/screens';
import { BorlandRng } from '../game/port/rng';
import { newGame, type Game } from '../game/port/state';
import { characterFile, findSquare, press, startPlaying } from './battle.test-support';
import { digging } from './dig';
import type { GameSession } from './engine';
import { KEY } from './keys';
import type { PlayMode } from './mode';

/** Every screen dig_hole asked to be left up, as the line standing on the message strip. */
function held(game: Game): { line: string | null; ms: number }[] {
  const frames: { line: string | null; ms: number }[] = [];
  game.delay = (ms: number) => {
    const drawn = game.screen.find((line) => line.y === MESSAGE_LINE_Y);
    frames.push({ line: drawn?.text ?? null, ms });
  };
  return frames;
}

const BLANK = { line: null, ms: 300 };
const DIGGING = (ms: number) => ({ line: 'DIGGING... DIGGING...', ms });

describe("the digging line's flashing", () => {
  it('wipes the line off and draws it again, four times over', () => {
    const game = newGame();
    const frames = held(game);
    digging(game, 1500);
    expect(frames).toEqual([
      BLANK, DIGGING(1500),
      BLANK, DIGGING(1500),
      BLANK, DIGGING(1500),
      BLANK, DIGGING(1500),
    ]);
  });

  it('holds the line longer on the second run of four', () => {
    const game = newGame();
    const frames = held(game);
    digging(game, 2000);
    expect(frames.map((frame) => frame.ms)).toEqual([300, 2000, 300, 2000, 300, 2000, 300, 2000]);
  });

  it('draws it where pfont puts it, in the colour every line of a fight is drawn in', () => {
    const game = newGame();
    digging(game, 1500);
    expect(game.screen).toEqual([
      { text: 'DIGGING... DIGGING...', x: MENU_X, y: MESSAGE_LINE_Y, font: 0, colour: BATTLE_TEXT_COLOUR },
    ]);
  });

  it('asks for no delay at all with the high speed option on', () => {
    const game = newGame();
    game.highSpeed = true;
    const frames = held(game);
    digging(game, 1500);
    expect(frames).toEqual([]);
    expect(game.screen.map((line) => line.text)).toEqual(['DIGGING... DIGGING...']);
  });
});

describe('the pauses a mode sits through', () => {
  /** The answer to DO YOU WISH TO DIG A HOLE that starts the digging. */
  const YES = 0x31;
  /** Long enough for the blank each flash opens with to be over: {@link DIG_BLANK_MS} and a
   *  little, so the line the flash draws after it is the one on the screen. */
  const PAST_THE_BLANK_MS = 350;
  const FLASHING = 'DIGGING... DIGGING...';

  /** What the tab draws in the message box, which is where the held screens are drawn over. */
  const boxText = (session: GameSession): string[] => session.view().box.map((line) => line.text);

  const sleep = (ms: number): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, ms));

  /** A Sage on a floor shallow enough to dig through, taken as far as the first run of flashes
   *  and the key that answers the box the game prints over them. */
  async function digIn(mode: PlayMode): Promise<GameSession> {
    const start = findSquare(3, (square) => square.ladder === 0 && square.chute === 0 && square.trapdoor === -1);
    const session = startPlaying(characterFile({ level: 3, dir: 0, ...start, cls: 3 }), new BorlandRng(4));
    session.mode = mode;
    await press(session, KEY.dig);
    await press(session, YES);
    // Every flash opens by wiping the line off, so the line is never up at this point whatever
    // the mode: what the modes differ on is whether the rest of the flashing happens at all.
    expect(boxText(session)).not.toContain(FLASHING);
    return session;
  }

  it('goes on flashing in faithful, whatever the player presses', async () => {
    const session = await digIn('faithful');
    await sleep(PAST_THE_BLANK_MS);
    expect(boxText(session)).toContain(FLASHING);

    await press(session, KEY.escape);

    expect(boxText(session)).toContain(FLASHING);
    session.finish();
  });

  it('goes on flashing in speedrun as well, a run being timed against the original', async () => {
    const session = await digIn('speedrun');
    await sleep(PAST_THE_BLANK_MS);

    await press(session, KEY.escape);

    expect(boxText(session)).toContain(FLASHING);
    session.finish();
  });

  it('gives the rest of the flashing up on a key in debug', async () => {
    const session = await digIn('debug');
    await sleep(PAST_THE_BLANK_MS);
    expect(boxText(session)).toContain(FLASHING);

    await press(session, KEY.escape);

    expect(boxText(session)).not.toContain(FLASHING);
    session.finish();
  });
});
