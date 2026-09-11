import { blankMwCharacter, type MwCharacter } from '../../game/mw-port/state';
import { BorlandRng, type Rng } from '../../game/port/rng';
import { MORAFFS_WORLD_MAP, type MapSquare } from '../../map/game';
import { MwGameSession, runMwMoveControl, startMwGame, type MwCharacterFile } from './engine';
import { saveMwPlayer } from './record';

/** A character file that lives in the test rather than on the roster. */
export function mwCharacterFile(overrides: Partial<MwCharacter> = {}): MwCharacterFile & { dead: boolean } {
  const pc: MwCharacter = {
    ...blankMwCharacter(),
    name: 'GRIMWALD',
    hp: 200,
    maxHp: 200,
    str: 30,
    iq: 20,
    wis: 20,
    con: 20,
    dex: 20,
    luck: 20,
    lev: 5,
    ...overrides,
  };
  return {
    bytes: saveMwPlayer(pc, new Uint8Array(0x928)),
    dead: false,
    write(bytes) {
      this.bytes = bytes;
    },
    died() {
      this.dead = true;
    },
  };
}

/**
 * A session with the loop running, waiting for its first key. `arrange` runs before the loop
 * starts, which is where a test puts a monster on the floor: the loop works out what the
 * character is facing before it reads its first key.
 */
export function playingMw(
  file: MwCharacterFile,
  rng: Rng = new BorlandRng(3),
  arrange: (session: MwGameSession) => void = () => {},
): MwGameSession {
  const session = startMwGame(file, rng);
  arrange(session);
  void runMwMoveControl(session);
  return session;
}

/** Let the loop run without pressing anything, for a turn that starts by itself. */
export const settleMw = () => new Promise((resolve) => setTimeout(resolve));

/** Press a key and let the loop get back to waiting for the next one. */
export async function pressMw(session: MwGameSession, key: number): Promise<void> {
  session.press(key);
  await new Promise((resolve) => setTimeout(resolve));
}

/** The first square of a floor that is whatever a test needs it to be. */
export function findMwSquare(
  level: number,
  wanted: (square: MapSquare, x: number, y: number, rows: MapSquare[][]) => boolean,
  dungeon = 0,
): { x: number; y: number } {
  const rows = MORAFFS_WORLD_MAP.floor(level, dungeon);
  for (let y = 1; y < 109; y++) {
    for (let x = 1; x < 79; x++) {
      if (!rows[y][x].solid && wanted(rows[y][x], x, y, rows)) return { x, y };
    }
  }
  throw new Error(`no such square on floor ${level}`);
}
