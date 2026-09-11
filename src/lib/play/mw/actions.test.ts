import { describe, expect, it } from 'vitest';
import { isActionKind, type CastEvent } from '../../game/action';
import { bundledMwDungeon } from '../../game/mw-dungeon';
import { mwSpellBookSlot } from '../../game/mw-port/spells';
import type { MwGame } from '../../game/mw-port/state';
import { mwSetOccupant } from '../../game/mw-port/state';
import type { MwStockedMonster } from '../../game/mw-port/stocking';
import type { Rng } from '../../game/port/rng';
import type { MwGameSession } from './engine';
import { findMwSquare, mwCharacterFile, playingMw, pressMw, settleMw } from './test-engine';
import { MW_KEY } from './keys';

/**
 * What Moraff's World counts as one of a run's actions: the things that happened, pushed onto
 * the game's event list where they happen. `../run.ts` is what adds them up.
 */

/** An Rng whose every roll comes out as high as it can, so a swing lands. */
const highest: Rng = { random: (n) => (n > 1 ? n - 1 : 0) };

/** The actions the game has pushed, oldest first. Everything else on the list — the saves, the
 *  hints, the weight added up again — is not something a run counts. */
function actionsPushed(game: MwGame): string[] {
  return game.events.filter((event) => isActionKind(event.kind)).map((event) => event.kind);
}

/** The spell each cast on the list was of. */
function spellsCast(game: MwGame): CastEvent['spell'][] {
  return game.events.filter((event): event is CastEvent => event.kind === 'cast').map((event) => event.spell);
}

/** A square of the town with nothing on it, so a key is the only thing happening. */
const emptyTown = () =>
  findMwSquare(
    0,
    (square, x, y) =>
      square.n === 3 &&
      square.ladder === 0 &&
      bundledMwDungeon.surface(x, y, 0, 0) === 0 &&
      bundledMwDungeon.trapdoor(x, y, 0, 0) === -1,
  );

/** A character standing on an empty square of the town. */
function inTheTown(overrides: Record<string, unknown> = {}): MwGameSession {
  return playingMw(mwCharacterFile({ floor: 0, dir: 0, ...emptyTown(), ...overrides }));
}

/** MINOR PROTECTION, the second of the three priestly level 1 spells, and the key it sits under
 *  in the grid of thirty. */
const MINOR_PROTECTION = mwSpellBookSlot(3, 1, 1);
const SPELL_B = 0x62;

/** A priest standing in the town who knows that one spell. */
function priestInTheTown(overrides: Record<string, unknown> = {}): MwGameSession {
  const spellbook = Array.from({ length: 180 }, () => 0);
  spellbook[MINOR_PROTECTION] = 1;
  return inTheTown({ cls: 4, sp: 10, maxSp: 10, spellbook, ...overrides });
}

describe('the step', () => {
  it('counts one that moved the character', async () => {
    const session = inTheTown();
    await pressMw(session, MW_KEY.arrowUp);
    expect(actionsPushed(session.game)).toEqual(['stepped']);
  });

  it('counts nothing for one a wall refused, though the arrow still turned the character', async () => {
    const start = findMwSquare(0, (square) => square.n === 0 && square.s === 3 && square.ladder === 0);
    const session = playingMw(mwCharacterFile({ floor: 0, dir: 1, ...start }));
    await pressMw(session, MW_KEY.arrowUp);
    expect(session.view().place).toMatchObject({ x: start.x, y: start.y, dir: 0 });
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts the moment T and the space bar stand still for', async () => {
    const session = inTheTown();
    await pressMw(session, MW_KEY.wait);
    await pressMw(session, MW_KEY.space);
    expect(actionsPushed(session.game)).toEqual(['waited', 'waited']);
  });
});

describe('the ways off a floor', () => {
  it('counts the ladder gone down', async () => {
    const ladder = findMwSquare(3, (square) => square.ladder > 0);
    const session = playingMw(mwCharacterFile({ floor: 3, dir: 0, ...ladder }));
    await pressMw(session, MW_KEY.down);
    expect(actionsPushed(session.game)).toEqual(['ladderTaken']);
  });

  it('counts nothing for U where there is no ladder, which says nothing either', async () => {
    const session = inTheTown();
    await pressMw(session, MW_KEY.up);
    expect(session.box).toEqual([]);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts the trap door gone through', async () => {
    const door = findMwSquare(3, (square, x, y) => bundledMwDungeon.trapdoor(x, y, 3, 0) !== -1 && square.ladder === 0);
    const destination = bundledMwDungeon.trapdoor(door.x, door.y, 3, 0);
    const trapdoorKeys = Array.from({ length: 20 }, () => 0);
    trapdoorKeys[Math.trunc(destination / 10) - 1] = 1;
    const session = playingMw(mwCharacterFile({ floor: 3, dir: 0, ...door, trapdoorKeys }));
    await settleMw();
    await pressMw(session, MW_KEY.trapDoor);
    expect(actionsPushed(session.game)).toEqual(['trapdoorTaken']);
  });

  it('counts nothing for K on a square with no trap door', async () => {
    const session = inTheTown();
    await pressMw(session, MW_KEY.trapDoor);
    expect(session.box[0]).toBe("I DON'T SEE ANY TRAP");
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts the building the town square holds', async () => {
    const inn = findMwSquare(0, (square, x, y) => bundledMwDungeon.surface(x, y, 0, 0) === 4 && square.ladder === 0);
    const session = playingMw(mwCharacterFile({ floor: 0, dir: 0, ...inn }));
    await pressMw(session, MW_KEY.up);
    expect(actionsPushed(session.game)).toEqual(['buildingEntered']);
  });
});

describe('the dig', () => {
  it('counts nothing for the question backed out of', async () => {
    const start = findMwSquare(3, (square) => square.ladder === 0);
    const session = playingMw(mwCharacterFile({ floor: 3, dir: 0, ...start }));
    await pressMw(session, MW_KEY.down);
    expect(session.box[0]).toBe('DO YOU WISH TO DIG A HOLE');
    await pressMw(session, 0x32);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts nothing where the floor is solid rock', async () => {
    const start = findMwSquare(130, (square) => square.ladder === 0);
    const session = playingMw(mwCharacterFile({ floor: 130, dir: 0, ...start }));
    await pressMw(session, MW_KEY.down);
    expect(session.box[0]).toBe('THE FLOOR SEEMS TO BE MADE');
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts the dig a monster interrupted, whose six moments are spent', async () => {
    const start = findMwSquare(0, (square) => square.n === 3 && square.ladder === 0);
    const session = playingMw(mwCharacterFile({ floor: 0, dir: 0, ...start }), highest, (ready) => {
      const placed: MwStockedMonster = { ...ready.game.monsters[0], x: start.x, y: start.y - 1, hp: 4000, type: 1, depth: 3 };
      Object.assign(ready.game.monsters[0], placed);
      mwSetOccupant(ready.game, placed.x, placed.y, 0);
    });
    await pressMw(session, MW_KEY.down);
    await pressMw(session, 0x31);
    expect(session.game.screen.some((line) => line.text === 'A MONSTER WANTS TO HELP')).toBe(true);
    expect(actionsPushed(session.game)).toEqual(['dug']);
  });

  it('counts the hole once it has been dug', async () => {
    const start = findMwSquare(3, (square) => square.ladder === 0);
    const session = playingMw(mwCharacterFile({ floor: 3, dir: 0, ...start }));
    await pressMw(session, MW_KEY.down);
    await pressMw(session, 0x31);
    // A monster that reached the character stops the dig, which the test above is about.
    if (session.game.screen.some((line) => line.text === 'A MONSTER WANTS TO HELP')) {
      expect(actionsPushed(session.game)).toEqual(['dug']);
      return;
    }
    await pressMw(session, MW_KEY.escape);
    expect(session.view().place.floor).not.toBe(3);
    expect(actionsPushed(session.game)).toEqual(['dug']);
  });
});

describe('the swing', () => {
  it('counts one taken at the monster in front of the character', async () => {
    const start = findMwSquare(0, (square) => square.n === 3 && square.ladder === 0);
    const session = playingMw(
      mwCharacterFile({ floor: 0, dir: 0, weapon: 6, str: 80, luck: 80, lev: 40, ...start }),
      highest,
      (ready) => {
        const placed: MwStockedMonster = { ...ready.game.monsters[0], x: start.x, y: start.y - 1, hp: 4000, type: 1, depth: 3 };
        Object.assign(ready.game.monsters[0], placed);
        mwSetOccupant(ready.game, placed.x, placed.y, 0);
      },
    );
    await pressMw(session, MW_KEY.fight);
    expect(actionsPushed(session.game)).toEqual(['swung']);
  });

  it('counts nothing for F with nothing to fight, which spends no time', async () => {
    const session = inTheTown();
    await pressMw(session, MW_KEY.fight);
    expect(session.box).toEqual([]);
    expect(actionsPushed(session.game)).toEqual([]);
  });
});

describe('the spell screen', () => {
  it('counts the spell the grid picked', async () => {
    const session = priestInTheTown();
    await pressMw(session, MW_KEY.cast);
    await pressMw(session, 0x34);
    await pressMw(session, SPELL_B);
    expect(session.game.pc.protectionLevel).toBe(1);
    expect(actionsPushed(session.game)).toEqual(['cast']);
  });

  it('names the spell that was cast, and where it was cast from', async () => {
    const session = priestInTheTown();
    await pressMw(session, MW_KEY.cast);
    await pressMw(session, 0x34);
    await pressMw(session, SPELL_B);
    expect(spellsCast(session.game)).toEqual([
      { game: 'moraffsWorld', category: 3, levelIndex: 0, slot: 1, source: 'spellPoints', name: 'MINOR PROTECTION' },
    ]);
  });

  it('counts nothing for the grid opened and left', async () => {
    const session = priestInTheTown();
    await pressMw(session, MW_KEY.cast);
    await pressMw(session, 0x34);
    await pressMw(session, MW_KEY.escape);
    expect(session.game.pc.sp).toBe(10);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts nothing for a fighter turned away before the menu is drawn', async () => {
    const session = priestInTheTown({ cls: 0 });
    await pressMw(session, MW_KEY.cast);
    expect(session.box[0]).toBe('FIGHTERS CAN ONLY CAST');
    expect(actionsPushed(session.game)).toEqual([]);
  });
});

describe('the armor and the weapon', () => {
  it('counts a suit actually put on', async () => {
    const session = inTheTown({ cls: 0, armorOwned: [1, 1, 0, 0, 0, 0, 0, 0], armor: 0 });
    await pressMw(session, MW_KEY.armor);
    await pressMw(session, 0x32);
    expect(session.game.pc.armor).toBe(1);
    expect(actionsPushed(session.game)).toEqual(['gearSwitched']);
  });

  it('counts nothing for the menu backed out of', async () => {
    const session = inTheTown({ cls: 0, armorOwned: [1, 1, 0, 0, 0, 0, 0, 0], armor: 0 });
    await pressMw(session, MW_KEY.armor);
    await pressMw(session, MW_KEY.escape);
    expect(session.game.pc.armor).toBe(0);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts nothing for picking the suit already being worn', async () => {
    const session = inTheTown({ cls: 0, armorOwned: [1, 1, 0, 0, 0, 0, 0, 0], armor: 0 });
    await pressMw(session, MW_KEY.armor);
    await pressMw(session, 0x31);
    expect(session.game.pc.armor).toBe(0);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts nothing for picking the weapon already in hand', async () => {
    const session = inTheTown({ cls: 0, weaponsOwned: [1, 1, 0, 0, 0, 0, 0, 0], weapon: 0 });
    await pressMw(session, MW_KEY.weapon);
    await pressMw(session, 0x31);
    expect(session.game.pc.weapon).toBe(0);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts nothing for a class that may not wear what it picked', async () => {
    const session = inTheTown({ cls: 3, armorOwned: [1, 1, 0, 0, 0, 0, 0, 0], armor: 0 });
    await pressMw(session, MW_KEY.armor);
    await pressMw(session, 0x32);
    expect(session.game.pc.armor).toBe(0);
    expect(actionsPushed(session.game)).toEqual([]);
  });
});

describe('what the L key throws away', () => {
  it('counts the weapon dropped', async () => {
    const session = inTheTown({ weaponsOwned: [1, 0, 2, 0, 0, 0, 0, 0] });
    await pressMw(session, MW_KEY.loseItem);
    await pressMw(session, 0x32);
    await pressMw(session, 0x33);
    expect(session.game.pc.weaponsOwned[2]).toBe(1);
    expect(actionsPushed(session.game)).toEqual(['dropped']);
  });

  it('counts nothing for the fists a character can never put down', async () => {
    const session = inTheTown({ weaponsOwned: [1, 0, 0, 0, 0, 0, 0, 0] });
    await pressMw(session, MW_KEY.loseItem);
    await pressMw(session, 0x32);
    await pressMw(session, 0x31);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts nothing for a slot the character owns nothing in', async () => {
    const session = inTheTown({ weaponsOwned: [1, 0, 0, 0, 0, 0, 0, 0] });
    await pressMw(session, MW_KEY.loseItem);
    await pressMw(session, 0x32);
    await pressMw(session, 0x34);
    expect(actionsPushed(session.game)).toEqual([]);
  });
});

describe('the I key', () => {
  it('counts the pill swallowed', async () => {
    const session = inTheTown({ pills: [0, 0, 0, 2, 0, 0], con: 20, wis: 20 });
    await pressMw(session, MW_KEY.useItem);
    await pressMw(session, 0x34);
    await pressMw(session, 0x34);
    expect(session.game.pc.pills[3]).toBe(1);
    expect(actionsPushed(session.game)).toEqual(['itemUsed']);
  });

  it('counts nothing for a colour the character has none of', async () => {
    const session = inTheTown({ pills: [0, 0, 0, 0, 0, 0] });
    await pressMw(session, MW_KEY.useItem);
    await pressMw(session, 0x34);
    await pressMw(session, 0x31);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts nothing for the item menu backed out of', async () => {
    const session = inTheTown({ pills: [1, 1, 1, 1, 1, 1] });
    await pressMw(session, MW_KEY.useItem);
    await pressMw(session, MW_KEY.escape);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts the magic item spent', async () => {
    const session = inTheTown({ healingPotions: 1, hp: 10 });
    await pressMw(session, MW_KEY.useItem);
    await pressMw(session, 0x35);
    await pressMw(session, 0x32);
    expect(session.game.pc.healingPotions).toBe(0);
    expect(actionsPushed(session.game)).toEqual(['itemUsed']);
  });
});

describe('the keys that only put something on the screen', () => {
  it('counts nothing at all', async () => {
    const session = inTheTown();
    for (const key of [MW_KEY.viewStats, MW_KEY.expNeeded, MW_KEY.pockets, MW_KEY.money, MW_KEY.expandMap, MW_KEY.zoomView, MW_KEY.save, MW_KEY.sound, MW_KEY.escape]) {
      await pressMw(session, key);
      await pressMw(session, MW_KEY.escape);
    }
    expect(actionsPushed(session.game)).toEqual([]);
  });
});
