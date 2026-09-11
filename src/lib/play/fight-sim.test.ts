import { describe, expect, it } from 'vitest';
import { monsterLevelBase } from '../game/dotu-mech.js';
import { spellIndex } from '../game/port/inventory';
import { SeededRng } from '../game/port/rng';
import { newGame, type PlayerCharacter } from '../game/port/state';
import { UNFORGIVEN_MAP, type MapSquare } from '../map/game';
import { newCharacterFile } from '../roller/save-file';
import { monsterTypeOf } from './floor';
import {
  castFightSpell,
  fightMonster,
  fightOutcome,
  fightSquare,
  fillSpellPoints,
  monsterLevelRange,
  rollFightHp,
  sendInTheMonster,
  settle,
  startFight,
  FIGHT_SPELL_LISTS,
  type FightMonster,
  type FightSetup,
} from './fight-sim';
import { monsterById } from '../map/stocking';
import { KEY } from './keys';

/** The class byte of a Sage, who is the one class allowed both lists of battle spells out of
 *  their own spellbook. A Fighter casts nothing out of one at all. */
const SAGE = 5;

/** A setup with the numbers a test cares about typed into it, the way the form types them. */
function setup(
  overrides: Partial<PlayerCharacter> = {},
  monster: Partial<FightMonster> = {},
): FightSetup {
  const character = { ...newGame().pc, name: 'BRAWLER', ...overrides };
  return {
    record: newCharacterFile(character),
    character,
    monster: { monsterId: 'builtin-0', module: 0, floor: 1, level: 1, hp: 40, ...monster },
  };
}

/** The spell of one of the three lists by the place it stands in the game's own table. */
function spellAt(list: number, level: number, slot: number) {
  const found = FIGHT_SPELL_LISTS[list].spells.find(
    (spell) => spell.level === level && spell.slot === slot,
  );
  if (!found) throw new Error(`no spell at level ${level + 1} slot ${slot + 1} of list ${list}`);
  return found;
}

describe('the square a fight is set on', () => {
  it('is open to the north with nothing under the character', () => {
    const square = fightSquare(3, 0);
    const rows: MapSquare[][] = UNFORGIVEN_MAP.floor(3, 0);
    const under = rows[square.y][square.x];
    expect(under.solid).toBe(false);
    expect(under.n).toBe(3);
    expect(under.ladder).toBe(0);
    expect(under.trapdoor).toBe(-1);
    expect(under.chute).toBe(0);
    expect(rows[square.y - 1][square.x].solid).toBe(false);
  });
});

describe('the levels stock_level could store a monster with', () => {
  it('is the floor’s base level and as far as the nudge reaches either side of it', () => {
    expect(monsterLevelRange(50)).toEqual({ from: 38, to: 62 });
  });

  it('never goes below 1, since a level nudged out of range is put back to 1', () => {
    expect(monsterLevelRange(1)).toEqual({ from: 1, to: 13 });
  });
});

describe('the hit points a monster is sent in with', () => {
  it('are rolled from the floor rather than from the level the monster is stored with', () => {
    const entry = monsterById('builtin-0');
    const base = monsterLevelBase(20, 0);
    const rolled = rollFightHp(entry, base, () => 0.5);
    expect(rolled).toBe(rollFightHp(entry, base, () => 0.5));
    expect(rolled).toBeGreaterThan(rollFightHp(entry, 1, () => 0.5));
  });
});

describe('setting a fight up', () => {
  it('fights with the numbers the form typed, on the floor the monster was picked for', () => {
    const built = setup({ lev: 44, str: 77, luck: 12, maxHp: 300, hp: 300 }, { floor: 7 });
    const session = startFight(built, new SeededRng(1));
    const pc = session.game.pc;
    expect(pc.lev).toBe(44);
    expect(pc.str).toBe(77);
    expect(pc.luck).toBe(12);
    expect(pc.maxHp).toBe(300);
    expect(pc.level).toBe(7);
    expect(pc.module).toBe(0);
    session.finish();
  });

  it('leaves the floor empty until the monster is sent in', () => {
    const session = startFight(setup(), new SeededRng(2));
    expect(session.game.monsters.filter((monster) => monster.hp > 0)).toEqual([]);
    expect(session.game.engaged).toBe(-1);
    expect(fightOutcome(session, false)).toBe('waiting');
    session.finish();
  });

  it('never writes the record it copied the character out of', () => {
    const built = setup({ str: 30 });
    const before = built.record.slice();
    const session = startFight(built, new SeededRng(3));
    session.game.pc.str = 99;
    session.save();
    expect(built.record).toEqual(before);
    expect(session.file.bytes).not.toEqual(before);
    session.finish();
  });
});

describe('sending the monster in', () => {
  it('stands it in front of the character with the kind, level and hit points that were asked for', async () => {
    const built = setup({}, { monsterId: 'section-1-24', floor: 3, level: 6, hp: 55 });
    const session = startFight(built, new SeededRng(4));
    await sendInTheMonster(session, built.monster);
    const planted = fightMonster(session);
    expect(planted.type).toBe(monsterTypeOf('section-1-24'));
    expect(planted.level).toBe(6);
    expect(planted.hp).toBe(55);
    expect(planted.x).toBe(session.game.pc.x);
    expect(planted.y).toBe(session.game.pc.y - 1);
    session.finish();
  });

  it('leaves the loop fighting it, and it alone', async () => {
    const built = setup();
    const session = startFight(built, new SeededRng(5));
    await sendInTheMonster(session, built.monster);
    expect(session.game.engaged).toBe(0);
    expect(session.game.monsters.filter((monster) => monster.hp > 0)).toHaveLength(1);
    expect(fightOutcome(session, true)).toBe('fighting');
    session.finish();
  });

  it('sends nothing in when there is rock in front of the character', async () => {
    const built = setup();
    const session = startFight(built, new SeededRng(11));
    // The top row of the floor: north of it is off the map, which is turned down the way rock is.
    session.game.pc.y = 0;
    expect(await sendInTheMonster(session, built.monster)).toBe(false);
    expect(session.game.monsters.filter((monster) => monster.hp > 0)).toEqual([]);
    session.finish();
  });

  it('is dead once its hit points have run out', async () => {
    const built = setup({}, { hp: 1 });
    const session = startFight(built, new SeededRng(6));
    await sendInTheMonster(session, built.monster);
    fightMonster(session).hp = 0;
    expect(fightOutcome(session, true)).toBe('monsterDead');
    session.finish();
  });
});

describe('a spell button', () => {
  it('casts a preparation spell through the game’s own spell code', async () => {
    const session = startFight(setup({ cls: SAGE, sp: 10, maxSp: 10 }), new SeededRng(7));
    // The second spell of the preparation list's first line is ENCHANT WEAPON LEVEL 1, which
    // set_temp_weapon_plus writes a 1 into.
    await castFightSpell(session, spellAt(0, 0, 1));
    expect(session.game.pc.tempWeaponPlus).toBe(1);
    expect(session.game.pc.sp).toBe(9);
    session.finish();
  });

  it('casts a battle spell the character’s class is allowed', async () => {
    const session = startFight(setup({ cls: SAGE, sp: 10, maxSp: 10 }), new SeededRng(8));
    // The third spell of the wizard list's first line is MINOR PROTECTION, which is protection
    // level 1 for sixty moves.
    await castFightSpell(session, spellAt(1, 0, 2));
    expect(session.game.pc.protection).toBe(1);
    // The spell leaves what it said standing, and the moment the cast costs is only spent once
    // that box has been given the key it waits for.
    expect(session.box[0]).toBe('YOUR BODY BEGINS TO SHIMMER');
    session.press(KEY.escape);
    await settle();
    // Sixty moves, less the one the cast itself spends.
    expect(session.game.pc.protectionTime).toBe(59);
    session.finish();
  });

  it('gives the copy the spell in its book, since the menu ignores one it does not have', async () => {
    const built = setup({ cls: SAGE, sp: 10, maxSp: 10 });
    const session = startFight(built, new SeededRng(9));
    const spell = spellAt(0, 0, 1);
    expect(built.character.spellbook[spellIndex(spell.type, spell.level, spell.slot)]).toBe(0);
    await castFightSpell(session, spell);
    expect(session.game.pc.spellbook[spellIndex(spell.type, spell.level, spell.slot)]).toBe(1);
    session.finish();
  });

  it('refuses the spell when there are no points for it, and casts it once they are filled', async () => {
    const session = startFight(setup({ cls: SAGE, sp: 0, maxSp: 10 }), new SeededRng(10));
    await castFightSpell(session, spellAt(0, 0, 1));
    expect(session.game.pc.tempWeaponPlus).toBe(0);
    fillSpellPoints(session);
    await castFightSpell(session, spellAt(0, 0, 1));
    expect(session.game.pc.tempWeaponPlus).toBe(1);
    session.finish();
  });
});

describe('the spells a fight has buttons for', () => {
  it('are the preparation and the two battle lists, and not the permanent one', () => {
    expect(FIGHT_SPELL_LISTS.map((list) => list.title)).toEqual([
      'Preparation spells',
      'Wizard battle spells',
      'Priest battle spells',
    ]);
  });

  it('leaves out the ones that would end the fight by walking away from it', () => {
    const named = FIGHT_SPELL_LISTS.flatMap((list) => list.spells.map((spell) => spell.name));
    expect(named).not.toContain('PASS WALL');
    expect(named).not.toContain('RELOCATE');
    expect(named).not.toContain('MAJOR DESCEND');
    expect(named).toContain('HEAL ALL WOUNDS');
    expect(named).toContain('AUTOKILL');
  });
});
