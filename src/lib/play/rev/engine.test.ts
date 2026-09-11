import { describe, expect, it } from 'vitest';
import { blocked } from '../../game/revmap.js';
import { SeededRng } from '../../game/port/rng';
import { formatRevRecord, REV_VALUE_COUNT } from '../../game/rev-port/record';
import { REV_KEY } from './keys';
import { NEEDS_A_CURE } from './pass';
import { REV_GRAB_A_SANDWICH } from './screens';
import { SOUND_OFF, SOUND_ON } from './settings';
import { REV_VALUE, revValue } from './record';
import { REV_CLOCK_TICK, RevGameSession, runRevDungeon, startRevGame } from './engine';
import { revCharacterFile, revRecord } from './test-engine';

/**
 * The V key, which is what these tests spend a pass on when the key itself does not matter.
 *
 * It takes the whole screen and waits for a key of its own (1000:1C4A), so answering it is two
 * presses: the second is eaten by the wait rather than starting a pass of its own.
 */
async function pressStats(session: RevGameSession): Promise<void> {
  session.press(REV_KEY.stats);
  await settled();
  session.press(' '.charCodeAt(0));
  await settled();
}

/** Let the loop take what it has been given and come back to waiting. */
function settled(): Promise<unknown> {
  return new Promise((resolve) => setTimeout(resolve));
}

async function playing(seed = 5, bytes = revRecord()): Promise<{ session: RevGameSession; held: ReturnType<typeof revCharacterFile> }> {
  const held = revCharacterFile(bytes);
  const session = startRevGame(held, new SeededRng(seed));
  void runRevDungeon(session);
  await settled();
  return { session, held };
}

describe('the loop', () => {
  it('starts the character where the record left them', async () => {
    const { session } = await playing();
    // The record's column and row are 10 and 10, counted from one; the view counts from zero.
    expect(session.view().place).toMatchObject({ x: 9, y: 9, level: 0 });
    session.finish();
  });

  it('holds a screen the game asked to be left up, and a key gives up the rest', async () => {
    const { session } = await playing();
    // A session nobody is drawing holds nothing, since there is no screen to hold one on.
    session.onChange = () => {};
    session.press(REV_KEY.sound);
    await settled();
    // 1000:10A5: the loop has run straight past the two seconds and rubbed its own line out...
    expect(session.game.said).toEqual([]);
    // ...and the tab is still showing the screen it was asked to hold.
    expect(session.view().box).toEqual([SOUND_OFF]);
    await pressStats(session);
    expect(session.view().box).not.toContain(SOUND_OFF);
    session.finish();
  });

  it('starts with the sound the answer on the way in asked for, which O still flips', async () => {
    const off = startRevGame(revCharacterFile(), new SeededRng(5), null, false);
    void runRevDungeon(off);
    await settled();
    // 1000:0523: N is what writes a 1 into DGROUP B4BC; Y leaves the 0 it starts as.
    expect(off.game.sound).toBe(1);
    off.onChange = () => {};
    off.press(REV_KEY.sound);
    await settled();
    expect(off.game.sound).toBe(0);
    expect(off.view().box).toEqual([SOUND_ON]);
    off.finish();

    const on = startRevGame(revCharacterFile(), new SeededRng(5), null, true);
    void runRevDungeon(on);
    await settled();
    expect(on.game.sound).toBe(0);
    on.finish();
  });

  it('holds nothing at all for a session nobody is drawing', async () => {
    const { session } = await playing();
    session.press(REV_KEY.sound);
    await settled();
    expect(session.view().box).toEqual([]);
    session.finish();
  });

  it('marks the square underfoot and nothing else', async () => {
    const { session } = await playing();
    session.enterLevel(3);
    await pressStats(session);
    expect(session.game.memory.isKnown(10, 10, 3)).toBe(true);
    expect(session.game.memory.isKnown(11, 10, 3)).toBe(false);
    expect(session.game.memory.isKnown(10, 9, 3)).toBe(false);
    session.finish();
  });

  it('walks the character with the compass arrows and remembers where they went', async () => {
    const { session } = await playing();
    // The compass arrows are the mode Escape asks for; the game starts in the other one.
    session.press(REV_KEY.escape);
    await settled();
    const before = session.view().place;
    session.press(REV_KEY.arrowRight);
    await settled();
    const after = session.view().place;
    expect(after.facing).toBe(2);
    expect(after.x === before.x + 1 || after.x === before.x).toBe(true);
    session.finish();
  });

  it('switches what the arrows do on Escape', async () => {
    const { session } = await playing();
    expect(session.view().arrows).toBe('turning');
    session.press(REV_KEY.escape);
    await settled();
    expect(session.view().arrows).toBe('compass');
    session.finish();
  });

  it('turns rather than steps with the turning arrows the game starts in', async () => {
    const { session } = await playing();
    const before = session.view().place;
    session.press(REV_KEY.arrowRight);
    await settled();
    expect(session.view().place).toMatchObject({ x: before.x, y: before.y, facing: 2 });
    session.finish();
  });

  it('offers the rope on a town building square', async () => {
    const { session } = await playing(5, revRecord({ 23: 7, 24: 3 }));
    expect(session.view().prompt).toBe("There's a rope above. Hit U to climb it.");
    session.finish();
  });

  it('saves the record and comes back on Q', async () => {
    const { session, held } = await playing();
    session.press(REV_KEY.quit);
    await settled();
    expect(session.over).toBe(true);
    expect(held.bytes).not.toBe(undefined);
    // 1000:0D8E and 1000:B5C8: a cleared screen, a blank line and the sign-off on it.
    expect(session.game.cleared).toBe('bare');
    expect(session.view().box).toEqual(['', REV_GRAB_A_SANDWICH]);
    expect(session.game.kept.runs()).toEqual([{ row: 2, column: 1, text: REV_GRAB_A_SANDWICH }]);
    session.finish();
  });

  it('says what a key it has not built would have done', async () => {
    const { session } = await playing();
    session.press(REV_KEY.abandon);
    await settled();
    expect(session.view().box.join(' ')).toContain('NOT BUILT YET');
    session.finish();
  });

  it('opens the spell prompt on C and waits there for the level', async () => {
    const { session } = await playing();
    session.press(REV_KEY.cast);
    await settled();
    expect(session.view().box).toEqual(['WHAT LEVEL SPELL (1-6)?', 'ESC-CAST NO SPELL']);
    session.finish();
  });

  it('casts a spell the character has been taught, one key at a time', async () => {
    // Value 118 is the bitfield of the level-1 spells the dungeon casts, and bit 0 is Cure.
    const { session } = await playing(5, revRecord({ 15: 176 + 2, 22: 6, 118: 1 }));
    session.press(REV_KEY.cast);
    await settled();
    session.press('1'.charCodeAt(0));
    await settled();
    expect(session.view().box).toContain('1) CURE');
    session.press('1'.charCodeAt(0));
    await settled();
    expect(session.game.pc.hp).toBe(17);
    expect(session.game.pc.spellPoints).toBe(5);
    session.finish();
  });
});

describe('the monsters', () => {
  it('stands none of them in the town and forty on a dungeon level', async () => {
    const { session } = await playing();
    expect(session.view().monsters).toHaveLength(0);
    session.enterLevel(3);
    expect(session.view().monsters).toHaveLength(40);
    session.finish();
  });

  it('moves them on a tick of the clock and not on a key', async () => {
    const { session } = await playing();
    session.enterLevel(3);
    const before = session.game.monsters.positions.slice(81, 121);
    session.tick();
    expect(session.game.monsters.positions.slice(81, 121)).not.toEqual(before);
    session.finish();
  });

  it('draws the screen again on a tick that moved one of them', async () => {
    const { session } = await playing();
    session.enterLevel(3);
    let draws = 0;
    session.onChange = () => {
      draws += 1;
    };
    session.tick();
    expect(draws).toBe(1);
    session.finish();
  });

  it('leaves the screen alone on a tick that moved nobody', async () => {
    const { session } = await playing();
    session.enterLevel(3);
    let draws = 0;
    session.onChange = () => {
      draws += 1;
    };
    // The poll moves a monster on a roll of exactly 1, so a generator that only ever rolls 0
    // leaves every one of them where it stands.
    session.game.rng = { random: () => 0 };
    session.tick();
    expect(session.ticks).toBe(1);
    expect(draws).toBe(0);
    session.finish();
  });

  it('rolls nothing at all in the town, which the loop jumps straight past', async () => {
    const { session } = await playing();
    const before = session.game.monsters.positions.slice();
    session.tick();
    expect(session.ticks).toBe(0);
    expect(session.game.monsters.positions).toEqual(before);
    session.finish();
  });
});

it('is the tick input, not a key', () => {
  expect(REV_CLOCK_TICK).toBeLessThan(0);
});

describe('the town', () => {
  it('has ladders down of its own, which D takes', async () => {
    // (15, 5) of the town is one of its ten ladders down, and spans two levels.
    const { session } = await playing(5, revRecord({ 23: 15, 24: 5 }));
    expect(session.view().prompt).toContain('D-GO DOWN');
    session.press(REV_KEY.down);
    await settled();
    expect(session.view().place.level).toBe(2);
    session.finish();
  });

  it('climbs the rope into the Flea Bag Inn and takes the ten jewel pieces', async () => {
    const { session } = await playing(5, revRecord({ 23: 7, 24: 3, 19: 223 + 40 }));
    session.press(REV_KEY.up);
    await settled();
    expect(session.view().box.join(' ')).toContain('Flea Bag Inn');
    session.press('Y'.charCodeAt(0));
    await settled();
    expect(Math.trunc(session.game.pc.money)).toBe(30);
    session.finish();
  });

  it('throws a character out of the Kings Inn who cannot pay for it', async () => {
    const { session } = await playing(5, revRecord({ 23: 18, 24: 17 }));
    session.press(REV_KEY.up);
    await settled();
    session.press('Y'.charCodeAt(0));
    await settled();
    expect(session.view().box.join(' ')).toContain('gaurd throws you out');
    session.finish();
  });
});

describe('a fight', () => {
  /** Stand the character on a dungeon level with a monster on their own square. */
  async function beside(): Promise<RevGameSession> {
    const { session } = await playing(9, revRecord({ 25: 2, 23: 10, 24: 10, 142: 1 }));
    session.enterLevel(2);
    session.game.monsters.grid[22 * 10 + 10] = 41;
    session.game.monsters.positions[41] = 32 * 10 + 10;
    // A key of no consequence takes the loop round to the top, where the fight opens.
    await pressStats(session);
    return session;
  }

  it('opens when a monster reaches the character', async () => {
    const session = await beside();
    expect(session.view().fight).not.toBeNull();
    expect(session.view().fight?.slot).toBe(41);
    session.finish();
  });

  it('opens when the character walks at a monster, which is how one is usually met', async () => {
    const { session } = await playing(9, revRecord({ 25: 2, 23: 10, 24: 10, 142: 1 }));
    session.enterLevel(2);
    const pc = session.game.pc;
    session.game.monsters.grid[22 * pc.row + pc.column] = 0;
    // The one of the four sides of the character's square the level's wall rule leaves open.
    const sides = [
      { facing: 1, kind: 1, asked: { column: pc.column, row: pc.row }, to: { column: pc.column, row: pc.row - 1 } },
      { facing: 2, kind: 2, asked: { column: pc.column + 1, row: pc.row }, to: { column: pc.column + 1, row: pc.row } },
      { facing: 3, kind: 1, asked: { column: pc.column, row: pc.row + 1 }, to: { column: pc.column, row: pc.row + 1 } },
      { facing: 4, kind: 2, asked: { column: pc.column, row: pc.row }, to: { column: pc.column - 1, row: pc.row } },
    ];
    const open = sides.find((side) => !blocked(side.kind, side.asked.column, side.asked.row, 2, pc.generation));
    expect(open).toBeDefined();
    pc.facing = open!.facing;
    session.game.monsters.grid[22 * open!.to.row + open!.to.column] = 41;
    session.game.monsters.positions[41] = 32 * open!.to.row + open!.to.column;

    session.press(REV_KEY.arrowUp);
    await settled();

    expect([pc.column, pc.row]).toEqual([open!.to.column, open!.to.row]);
    expect(session.view().fight?.slot).toBe(41);
    session.finish();
  });

  it('takes a swing with the sword the character owns', async () => {
    const session = await beside();
    const before = session.view().fight!.hitPoints;
    session.press(REV_KEY.sword);
    await settled();
    expect(session.view().banner.join(' ')).toMatch(/YOU DID/);
    const after = session.view().fight;
    expect(after === null || after.hitPoints < before).toBe(true);
    session.finish();
  });

  it('refuses a weapon the character does not own', async () => {
    const session = await beside();
    session.press(REV_KEY.mace);
    await settled();
    expect(session.view().box.join(' ')).toContain('YOU DO NOT HAVE THAT');
    session.finish();
  });

  it('keeps the rest of the level moving while the prompt is up', async () => {
    const session = await beside();
    const before = session.game.monsters.positions.slice(41, 81);
    session.tick();
    expect(session.game.monsters.positions.slice(41, 81)).not.toEqual(before);
    session.finish();
  });
});

describe('walking away from a fight', () => {
  it('ends it and writes what is left of the monster back into the file', async () => {
    const { session } = await playing(9, revRecord({ 25: 2, 23: 10, 24: 10, 142: 1 }));
    session.enterLevel(2);
    session.game.monsters.grid[22 * 10 + 10] = 41;
    session.game.monsters.positions[41] = 32 * 10 + 10;
    await pressStats(session);
    session.press(REV_KEY.sword);
    await settled();
    const fight = session.game.fight;
    if (!fight) {
      session.finish();
      return;
    }
    const left = fight.hitPoints;
    // Step off the square, whichever way the walls allow.
    for (const arrow of [REV_KEY.arrowUp, REV_KEY.arrowDown, REV_KEY.arrowLeft, REV_KEY.arrowRight]) {
      session.press(arrow);
      await settled();
      if (session.game.fight === null) break;
    }
    expect(session.game.fight).toBeNull();
    expect(session.game.monsters.strengths[41]).toBe(Math.round(left));
    session.finish();
  });
});

describe('a disease', () => {
  it('takes a characteristic off the character as they play, one every hundredth key', async () => {
    const { session } = await playing(5, revRecord({ 144: 1 }));
    const pc = session.game.pc;
    const points = () => pc.stats.reduce((total, stat) => total + stat, 0);
    const before = points();

    // The count starts at 1 and the drain lands as it reaches 100, so the ninety-ninth key is
    // the one that costs a point.
    for (let key = 0; key < 98; key++) {
      await pressStats(session);
    }
    expect(points()).toBe(before);

    await pressStats(session);

    expect(points()).toBe(before - 1);
    expect(revValue(pc, REV_VALUE.disease)).toBe(100);
    expect(session.view().box).toContain(NEEDS_A_CURE);
    session.finish();
  });

  it('costs a character without one nothing at all', async () => {
    const { session } = await playing(5);
    const pc = session.game.pc;
    const before = pc.stats.slice();
    for (let key = 0; key < 120; key++) {
      await pressStats(session);
    }
    expect(pc.stats).toEqual(before);
    expect(revValue(pc, REV_VALUE.disease)).toBe(0);
    session.finish();
  });
});

describe('the rings of health', () => {
  it('heal a character as they walk and not as they stand still', async () => {
    const { session } = await playing(5, revRecord({ 14: 376 + 40, 15: 176 + 10, 38: 2 }));
    const pc = session.game.pc;
    expect(pc.hp).toBe(10);

    // The statistics screen comes back through the loop's own re-entry, which holds them back.
    await pressStats(session);
    expect(pc.hp).toBe(10);

    for (const arrow of [REV_KEY.arrowUp, REV_KEY.arrowDown, REV_KEY.arrowLeft, REV_KEY.arrowRight]) {
      const before = session.view().place;
      session.press(arrow);
      await settled();
      const after = session.view().place;
      // A wall holds them back the same way; only the arrow that steps heals.
      if (after.x === before.x && after.y === before.y) {
        expect(pc.hp).toBe(10);
        continue;
      }
      expect(pc.hp).toBe(12);
      session.finish();
      return;
    }
    throw new Error('no arrow stepped, so the healing was never asked for');
  });
});
