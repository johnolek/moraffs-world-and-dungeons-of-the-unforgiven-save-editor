import { describe, expect, it } from 'vitest';
import { isActionKind, type CastEvent } from '../game/action';
import { bundledDungeon } from '../game/dungeon';
import { spellIndex } from '../game/port/inventory';
import { BorlandRng, type Rng } from '../game/port/rng';
import type { Game } from '../game/port/state';
import {
  characterFile,
  facingAMonster,
  findSquare,
  innSquare,
  inTheTown,
  press,
  standingOn,
  startPlaying,
} from './battle.test-support';
import type { GameSession } from './engine';
import { KEY } from './keys';

/**
 * What Dungeons of the Unforgiven counts as one of a run's actions: the things that happened,
 * pushed onto the game's event list where they happen. `run.ts` is what adds them up.
 */

/**
 * A generator that rolls the lowest number it can, so a key's own answer is the only thing
 * moving. Only the town can be played with one: stocking a dungeon floor draws squares until it
 * finds a free one, and every draw from this comes back the same.
 */
const lowest: Rng = { random: () => 0 };

/** The actions the game has pushed, oldest first. Everything else on the list — the saves, the
 *  hints, the floors loaded — is not something a run counts. */
function actionsPushed(game: Game): string[] {
  return game.events.filter((event) => isActionKind(event.kind)).map((event) => event.kind);
}

/** The spell each cast on the list was of. */
function spellsCast(game: Game): CastEvent['spell'][] {
  return game.events.filter((event): event is CastEvent => event.kind === 'cast').map((event) => event.spell);
}

/** MINOR PROTECTION, the third slot of the first line of the wizard battle spells, and the key
 *  it sits under in the table of thirty. */
const MINOR_PROTECTION = spellIndex(2, 0, 2);
const SPELL_C = 0x63;

/** A wizard standing in the town who knows that one spell. */
function wizardInTheTown(): GameSession {
  const spellbook = Array.from({ length: 180 }, () => 0);
  spellbook[MINOR_PROTECTION] = 1;
  return inTheTown(lowest, { cls: 3, sp: 20, maxSp: 20, spellbook });
}

describe('the step', () => {
  it('counts one that moved the character', async () => {
    const session = inTheTown(lowest);
    await press(session, KEY.arrowUp);
    expect(actionsPushed(session.game)).toEqual(['stepped']);
  });

  it('counts nothing for one a wall refused, which spends no moment', async () => {
    const session = standingOn(0, findSquare(0, (square) => square.n === 0 && square.s === 3));
    await press(session, KEY.arrowUp);
    expect(session.box).toEqual([]);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts nothing for a turn, which costs the character nothing', async () => {
    const session = inTheTown(lowest);
    await press(session, KEY.arrowLeft);
    await press(session, KEY.arrowRight);
    await press(session, KEY.arrowDown);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts the moment Enter stands still for', async () => {
    const session = inTheTown(lowest);
    await press(session, KEY.enter);
    expect(actionsPushed(session.game)).toEqual(['waited']);
  });
});

describe('the ways off a floor', () => {
  it('counts the ladder gone down', async () => {
    const session = standingOn(2, findSquare(2, (square) => square.ladder > 0));
    await press(session, KEY.down);
    expect(actionsPushed(session.game)).toEqual(['ladderTaken']);
  });

  it('does not stop for a key on the hint the snake brings on arriving', async () => {
    // Floor 5 of module I is a section boss's, and arriving on one with that boss still alive
    // always gets its warning, so this is an arrival certain to print a hint and not the town's,
    // whose stone tablet waits for a key of its own.
    const session = standingOn(4, findSquare(4, (square) => square.ladder === 1));
    await press(session, KEY.down);
    expect(session.game.pc.level).toBe(5);
    expect(session.box.join(' ')).not.toBe('');

    // FUN_2000_31bc is give_hint and a return, so the loop is already waiting for the next key
    // rather than for one to take the hint away: an arrow turns the character there and then.
    const facing = session.game.pc.dir;
    await press(session, KEY.arrowLeft);
    expect(session.game.pc.dir).not.toBe(facing);
  });

  it('counts nothing for U where there is no ladder', async () => {
    const session = standingOn(3, findSquare(3, (square) => square.ladder === 0 && square.chute === 0 && square.trapdoor === -1));
    await press(session, KEY.up);
    expect(session.box[0]).toContain('THERE IS NO LADDER HERE');
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts the trap door gone through', async () => {
    const door = findSquare(3, (square) => square.trapdoor >= 0 && square.ladder === 0);
    const keys = Array.from({ length: 36 }, () => 0);
    keys[Math.trunc(bundledDungeon.trapdoor(door.x, door.y, 3, 0) / 5)] = 1;
    const session = standingOn(3, door, { keys });
    await press(session, KEY.trapDoor);
    expect(actionsPushed(session.game)).toEqual(['trapdoorTaken']);
  });

  it('counts nothing for K on a square with no trap door', async () => {
    const session = standingOn(3, findSquare(3, (square) => square.trapdoor === -1 && square.ladder === 0 && square.chute === 0));
    await press(session, KEY.trapDoor);
    expect(session.box[0]).toBe("I DON'T SEE ANY TRAP");
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts the building the town square holds', async () => {
    const session = standingOn(0, innSquare(), { money: 100 });
    await press(session, KEY.up);
    expect(actionsPushed(session.game)).toEqual(['buildingEntered']);
  });
});

describe('the dig', () => {
  it('counts nothing for the question backed out of', async () => {
    const session = standingOn(3, findSquare(3, (square) => square.ladder === 0 && square.chute === 0 && square.trapdoor === -1), { cls: 3 });
    await press(session, KEY.dig);
    expect(session.box[0]).toBe('DO YOU WISH TO DIG A HOLE');
    await press(session, 0x32);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts nothing where the floor is too deep to dig through', async () => {
    const session = standingOn(20, findSquare(20, (square) => square.ladder === 0 && square.chute === 0 && square.trapdoor === -1), { cls: 3 });
    await press(session, KEY.dig);
    expect(session.box[0]).toBe('  THE FLOOR SEEMS TO BE MADE');
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts the move the game makes for a Fighter too deep to dig', async () => {
    const start = findSquare(20, (square) => square.ladder === 0 && square.chute === 0 && square.trapdoor === -1);
    const session = standingOn(20, start, { cls: 0 });
    await press(session, KEY.dig);
    expect(session.box[0]).toBe('  SINCE YOU ARE A WORTHLESS');
    expect(session.game.pc).not.toMatchObject(start);
    expect(actionsPushed(session.game)).toEqual(['dug']);
  });

  it('counts the dig a monster interrupted, whose six moments are spent', async () => {
    const session = await facingAMonster(lowest);
    await press(session, KEY.dig);
    await press(session, 0x31);
    expect(session.view().box.map((line) => line.text)).toContain('A MONSTER WANTS TO HELP');
    expect(actionsPushed(session.game)).toEqual(['dug']);
  });

  it('counts the hole once it has been dug', async () => {
    const start = findSquare(3, (square) => square.ladder === 0 && square.chute === 0 && square.trapdoor === -1);
    const session = startPlaying(characterFile({ level: 3, dir: 0, ...start, cls: 3 }), new BorlandRng(3));
    await press(session, KEY.dig);
    await press(session, 0x31);
    // A monster that reached the character stops the dig, which the test above is about.
    if (session.view().box.map((line) => line.text).includes('A MONSTER WANTS TO HELP')) {
      expect(actionsPushed(session.game)).toEqual(['dug']);
      return;
    }
    await press(session, KEY.escape);
    expect(session.view().place.floor).toBeGreaterThan(3);
    expect(actionsPushed(session.game)).toEqual(['dug']);
  });
});

describe('the swing', () => {
  it('counts one taken at the monster being fought', async () => {
    const session = await facingAMonster(lowest);
    await press(session, KEY.fight);
    expect(actionsPushed(session.game)).toEqual(['swung']);
  });

  it('counts nothing for F with nothing to fight, which spends no moment', async () => {
    const session = inTheTown(lowest);
    await press(session, KEY.fight);
    expect(session.box[0]).toBe('YOU MUST BE STANDING NEXT TO A');
    expect(actionsPushed(session.game)).toEqual([]);
  });
});

describe('the spell', () => {
  it('counts the one the menus picked', async () => {
    const session = wizardInTheTown();
    await press(session, KEY.cast);
    await press(session, 0x33);
    await press(session, SPELL_C);
    expect(session.game.pc.protection).toBe(1);
    expect(actionsPushed(session.game)).toEqual(['cast']);
  });

  it('names the spell that was cast, and where it was cast from', async () => {
    const session = wizardInTheTown();
    await press(session, KEY.cast);
    await press(session, 0x33);
    await press(session, SPELL_C);
    expect(spellsCast(session.game)).toEqual([
      { game: 'unforgiven', type: 2, level: 0, slot: 2, source: 'spellPoints', name: 'MINOR PROTECTION' },
    ]);
  });

  it('counts nothing for the spell table opened and left', async () => {
    const session = wizardInTheTown();
    await press(session, KEY.cast);
    await press(session, 0x33);
    await press(session, KEY.escape);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts nothing for a spell there are not the points for', async () => {
    const spellbook = Array.from({ length: 180 }, () => 0);
    spellbook[MINOR_PROTECTION] = 1;
    const session = inTheTown(lowest, { cls: 3, sp: 0, maxSp: 20, spellbook });
    await press(session, KEY.cast);
    await press(session, 0x33);
    await press(session, SPELL_C);
    expect(session.box[0]).toBe('YOU DO NOT HAVE ENOUGH');
    expect(actionsPushed(session.game)).toEqual([]);
  });
});

describe('the armor and the weapon', () => {
  it('counts a suit actually put on', async () => {
    const session = inTheTown(lowest, { cls: 0, armorOwned: [1, 1, 0, 0, 0, 0, 0, 0], armor: 0 });
    await press(session, KEY.armor);
    await press(session, 0x32);
    expect(session.game.pc.armor).toBe(1);
    expect(actionsPushed(session.game)).toEqual(['gearSwitched']);
  });

  it('counts nothing for the menu backed out of', async () => {
    const session = inTheTown(lowest, { cls: 0, armorOwned: [1, 1, 0, 0, 0, 0, 0, 0], armor: 0 });
    await press(session, KEY.armor);
    await press(session, KEY.escape);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts nothing for picking the suit already being worn', async () => {
    const session = inTheTown(lowest, { cls: 0, armorOwned: [1, 1, 0, 0, 0, 0, 0, 0], armor: 0 });
    await press(session, KEY.armor);
    await press(session, 0x31);
    expect(session.game.pc.armor).toBe(0);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts nothing for a class that may not wear what it picked', async () => {
    const session = inTheTown(lowest, { cls: 3, armorOwned: [1, 1, 0, 0, 0, 0, 0, 0], armor: 0 });
    await press(session, KEY.armor);
    await press(session, 0x32);
    expect(session.game.pc.armor).toBe(0);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts the weapon actually taken up', async () => {
    const session = inTheTown(lowest, { cls: 0, weaponsOwned: [1, 1, 0, 0, 0, 0, 0, 0], weapon: 0 });
    await press(session, KEY.weapon);
    await press(session, 0x32);
    expect(session.game.pc.weapon).toBe(1);
    expect(actionsPushed(session.game)).toEqual(['gearSwitched']);
  });

  it('counts nothing for picking the weapon already in hand', async () => {
    const session = inTheTown(lowest, { cls: 0, weaponsOwned: [1, 1, 0, 0, 0, 0, 0, 0], weapon: 0 });
    await press(session, KEY.weapon);
    await press(session, 0x31);
    expect(session.game.pc.weapon).toBe(0);
    expect(actionsPushed(session.game)).toEqual([]);
  });
});

describe('what the L key throws away', () => {
  it('counts the money dropped', async () => {
    const session = inTheTown(lowest, { money: 500 });
    await press(session, KEY.loseItem);
    await press(session, 0x33);
    await press(session, 0x31);
    expect(session.game.pc.money).toBe(0);
    expect(actionsPushed(session.game)).toEqual(['dropped']);
  });

  it('counts nothing for the menu backed out of', async () => {
    const session = inTheTown(lowest, { money: 500 });
    await press(session, KEY.loseItem);
    await press(session, KEY.escape);
    expect(session.game.pc.money).toBe(500);
    expect(actionsPushed(session.game)).toEqual([]);
  });
});

describe('the I key', () => {
  it('counts the potion drunk', async () => {
    const potions = [0, 2, 0, 0, 0, 0];
    const session = inTheTown(lowest, { potions });
    await press(session, KEY.useItem);
    await press(session, 0x34);
    await press(session, 0x31);
    expect(session.game.pc.potions[1]).toBe(1);
    expect(actionsPushed(session.game)).toEqual(['itemUsed']);
  });

  it('counts nothing for a colour the character has none of', async () => {
    const session = inTheTown(lowest, { potions: [0, 0, 0, 0, 0, 0] });
    await press(session, KEY.useItem);
    await press(session, 0x34);
    await press(session, 0x31);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts nothing for the item menu backed out of', async () => {
    const session = inTheTown(lowest, { potions: [0, 2, 0, 0, 0, 0] });
    await press(session, KEY.useItem);
    await press(session, KEY.escape);
    expect(actionsPushed(session.game)).toEqual([]);
  });

  it('counts the magic item spent', async () => {
    const session = inTheTown(lowest, { healingPotions: 1, hp: 10 });
    await press(session, KEY.useItem);
    await press(session, 0x35);
    await press(session, 0x32);
    expect(session.game.pc.healingPotions).toBe(0);
    expect(actionsPushed(session.game)).toEqual(['itemUsed']);
  });
});

describe('the keys that only put something on the screen', () => {
  it('counts nothing at all', async () => {
    const session = inTheTown(lowest);
    for (const key of [KEY.viewStats, KEY.expNeeded, KEY.pockets, KEY.money, KEY.expandMap, KEY.zoomView, KEY.viewPrepSpells, KEY.viewBattleSpells]) {
      await press(session, key);
      await press(session, KEY.escape);
    }
    expect(actionsPushed(session.game)).toEqual([]);
  });
});
