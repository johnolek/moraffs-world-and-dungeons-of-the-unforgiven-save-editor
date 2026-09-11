import { describe, expect, it } from 'vitest';
import { MW_MONSTER_VIEW_CORNERS } from '../../game/mw-port/screens';
import { MW_VIEWS, MW_VIEW_EAST, MW_VIEW_NORTH, MW_VIEW_SOUTH, MW_VIEW_WEST } from './view3d/screen';
import { describeEffects, MONSTERS } from '../../mw-bestiary/monsters';
import { mwDebugMonsterLines } from './debug-screen';
import { mwEngagedMonster } from './panel';
import { BorlandRng } from '../../game/port/rng';
import { findMwSquare, mwCharacterFile, playingMw, pressMw } from './test-engine';
import { MW_SQUARE_EMPTY, mwSetOccupant } from '../../game/mw-port/state';
import type { MwGameSession } from './engine';
import { MW_KEY } from './keys';

/** Move the floor's first monster onto the square the character is facing. */
function standInFront(session: MwGameSession): void {
  const pc = session.game.pc;
  const planted = session.game.monsters[0];
  mwSetOccupant(session.game, planted.x, planted.y, MW_SQUARE_EMPTY);
  planted.x = pc.x;
  planted.y = pc.y - 1;
  mwSetOccupant(session.game, planted.x, planted.y, 0);
}

/** A character fighting one of the floor's monsters, which is what puts numbers over a view. */
async function fighting(): Promise<MwGameSession> {
  const start = findMwSquare(3, (square) => square.n === 3 && square.ladder === 0);
  const session = playingMw(mwCharacterFile({ floor: 3, dir: 0, ...start }), new BorlandRng(7), standInFront);
  await pressMw(session, MW_KEY.escape);
  expect(session.game.engaged).not.toBe(-1);
  return session;
}

describe('the chance debug mode adds over the monster', () => {
  it('prints nothing while nothing is being fought', async () => {
    const session = await fighting();
    session.game.engaged = -1;
    expect(mwDebugMonsterLines(session.game, MW_MONSTER_VIEW_CORNERS.north)).toEqual([]);
  });

  it("prints the panel's own chance, to a tenth of a per cent", async () => {
    const session = await fighting();
    const chance = mwEngagedMonster(session.game)!.hitChance;
    const [line] = mwDebugMonsterLines(session.game, MW_MONSTER_VIEW_CORNERS.north);
    expect(line.text).toBe(`HIT:${(chance * 100).toFixed(1)}%`);
  });

  it("prints the chance the monster's own turn lands, to a tenth of a per cent", async () => {
    const session = await fighting();
    const chance = mwEngagedMonster(session.game)!.hitsYouChance;
    expect(chance).toBeGreaterThan(0);
    const lines = mwDebugMonsterLines(session.game, MW_MONSTER_VIEW_CORNERS.north);
    expect(lines[1].text).toBe(`IT HITS:${(chance * 100).toFixed(1)}%`);
  });

  it("prints what the monster does beyond an ordinary hit, in the bestiary's words", async () => {
    const session = await fighting();
    // A level drainer, so that the monster being fought is one with something to say about it.
    const drainer = MONSTERS.findIndex((monster) => monster.levelDrain > 0);
    session.game.monsters[session.game.engaged].type = drainer;
    const said = describeEffects(MONSTERS[drainer]);
    expect(said[0]).toMatch(/^Drains \d+ level/);
    const lines = mwDebugMonsterLines(session.game, MW_MONSTER_VIEW_CORNERS.north);
    // Every one of the bestiary's words is on the screen, broken across as many lines as the
    // view is wide enough for.
    expect(lines.slice(2).map((line) => line.text).join(' ')).toBe(said.join(' '));
    expect(lines.length).toBeGreaterThan(said.length);
  });

  it('puts it under the hit points, and fits it inside every one of the four views', async () => {
    const session = await fighting();
    session.game.monsters[session.game.engaged].type = MONSTERS.findIndex((monster) => monster.levelDrain > 0);
    const corners = [
      { corner: MW_MONSTER_VIEW_CORNERS.north, view: MW_VIEWS[MW_VIEW_NORTH] },
      { corner: MW_MONSTER_VIEW_CORNERS.south, view: MW_VIEWS[MW_VIEW_SOUTH] },
      { corner: MW_MONSTER_VIEW_CORNERS.west, view: MW_VIEWS[MW_VIEW_WEST] },
      { corner: MW_MONSTER_VIEW_CORNERS.east, view: MW_VIEWS[MW_VIEW_EAST] },
    ];
    for (const { corner, view } of corners) {
      for (const line of mwDebugMonsterLines(session.game, corner)) {
        expect(line.y).toBeGreaterThan(corner.hpY);
        expect(line.y).toBeLessThan(view.bottom);
        expect(line.x).toBeGreaterThanOrEqual(view.left);
        // Twenty-five units a character in the game's smallest font, which is what font 0 is.
        expect(line.x + line.text.length * 25).toBeLessThan(view.right);
      }
    }
  });
});
