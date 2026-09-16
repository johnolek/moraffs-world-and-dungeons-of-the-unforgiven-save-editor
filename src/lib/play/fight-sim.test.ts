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
  fightJournal,
  fightSquare,
  fightSummary,
  fightSummaryLines,
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
import type { GameEvent } from '../game/port/state';
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

  it('starts with the spells a night at the inn would have ended already ended', () => {
    const built = setup({
      str: 40,
      dex: 30,
      tempWeaponPlus: 6,
      tempArmorPlus: 4,
      prepStrength: 5,
      superAgility: 10,
      protection: 3,
      protectionTime: 200,
      strengthTimer: 150,
      holdMonsterTimer: 90,
      antiFireTimer: 60,
    });
    const session = startFight(built, new SeededRng(11));
    const pc = session.game.pc;
    expect(pc.tempWeaponPlus).toBe(0);
    expect(pc.tempArmorPlus).toBe(0);
    expect(pc.prepStrength).toBe(0);
    expect(pc.superAgility).toBe(0);
    expect(pc.protection).toBe(0);
    expect(pc.protectionTime).toBe(0);
    expect(pc.strengthTimer).toBe(0);
    expect(pc.holdMonsterTimer).toBe(0);
    expect(pc.antiFireTimer).toBe(0);
    // Every spell that was lending a characteristic hands it back as it ends: 5 from the
    // preparation Strength and 7 from the battle one, and 10 from Super Agility.
    expect(pc.str).toBe(40 - 5 - 7);
    expect(pc.dex).toBe(30 - 10);
    session.finish();
  });

  it('cures the poison and the disease, which no spell on the Fight tab could cure', () => {
    const built = setup({ poison: 3, disease: 12 });
    const session = startFight(built, new SeededRng(13));
    expect(session.game.pc.poison).toBe(-1);
    expect(session.game.pc.disease).toBe(-1);
    session.finish();
  });

  it('keeps the permanent spells, which are as much the character as their armor', () => {
    const built = setup({ bodyArmor: 4, protRing: 3, antiMagicRing: 2, invisible: 100, feather: 100 });
    const session = startFight(built, new SeededRng(12));
    const pc = session.game.pc;
    expect(pc.bodyArmor).toBe(4);
    expect(pc.protRing).toBe(3);
    expect(pc.antiMagicRing).toBe(2);
    expect(pc.invisible).toBe(100);
    expect(pc.feather).toBe(100);
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
    await castFightSpell(session, spellAt(0, 0, 1), true);
    expect(session.game.pc.tempWeaponPlus).toBe(1);
    expect(session.game.pc.sp).toBe(9);
    session.finish();
  });

  it('casts a battle spell the character’s class is allowed', async () => {
    const session = startFight(setup({ cls: SAGE, sp: 10, maxSp: 10 }), new SeededRng(8));
    // The third spell of the wizard list's first line is MINOR PROTECTION, which is protection
    // level 1 for sixty moves.
    await castFightSpell(session, spellAt(1, 0, 2), true);
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
    await castFightSpell(session, spell, true);
    expect(session.game.pc.spellbook[spellIndex(spell.type, spell.level, spell.slot)]).toBe(1);
    session.finish();
  });

  it('refuses the spell once the monster is in and there are no points for it', async () => {
    const session = startFight(setup({ cls: SAGE, sp: 0, maxSp: 10 }), new SeededRng(10));
    await castFightSpell(session, spellAt(0, 0, 1), true);
    expect(session.game.pc.tempWeaponPlus).toBe(0);
    fillSpellPoints(session);
    await castFightSpell(session, spellAt(0, 0, 1), true);
    expect(session.game.pc.tempWeaponPlus).toBe(1);
    session.finish();
  });

  it('casts a spell there are no points for while the monster is still to come', async () => {
    const session = startFight(setup({ cls: SAGE, sp: 0, maxSp: 10 }), new SeededRng(14));
    // ENCHANT WEAPON LEVEL 1 costs a point, and the copy has none.
    await castFightSpell(session, spellAt(0, 0, 1), false);
    expect(session.game.pc.tempWeaponPlus).toBe(1);
    expect(session.game.pc.sp).toBe(0);
    session.finish();
  });

  it('leaves the spell points where the form left them, however many spells are cast', async () => {
    const session = startFight(setup({ cls: SAGE, sp: 4, maxSp: 10 }), new SeededRng(15));
    await castFightSpell(session, spellAt(0, 0, 1), false);
    await castFightSpell(session, spellAt(0, 0, 0), false);
    expect(session.game.pc.sp).toBe(4);
    session.finish();
  });

  it('leaves them where they were when the game refuses the spell for the class', async () => {
    // A Fighter is turned away before the list menu is even drawn, so nothing is cast and the
    // points lent for the cast have to come back all the same.
    const session = startFight(setup({ cls: 0, sp: 4, maxSp: 10 }), new SeededRng(16));
    await castFightSpell(session, spellAt(0, 0, 1), false);
    expect(session.game.pc.tempWeaponPlus).toBe(0);
    expect(session.game.pc.sp).toBe(4);
    session.finish();
  });

  it('is free again when "Again" casts the same spells into a fresh fight', async () => {
    const built = setup({ cls: SAGE, sp: 1, maxSp: 10 });
    const first = startFight(built, new SeededRng(17));
    await castFightSpell(first, spellAt(0, 1, 0), false);
    expect(first.game.pc.sp).toBe(1);
    first.finish();
    const replayed = startFight(built, new SeededRng(17));
    await castFightSpell(replayed, spellAt(0, 1, 0), false);
    expect(replayed.game.pc.sp).toBe(1);
    expect(replayed.game.pc.prepStrength).toBe(first.game.pc.prepStrength);
    replayed.finish();
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

  it('leaves out the ones that would leave the fight exactly as they found it', () => {
    const named = FIGHT_SPELL_LISTS.flatMap((list) => list.spells.map((spell) => spell.name));
    expect(named).not.toContain('DETECT LEVEL');
    expect(named).not.toContain('DETECT POSITION');
    expect(named).not.toContain('CURE POISON');
    expect(named).not.toContain('CURE DISEASE');
  });

  it('keeps every battle spell, the resistances included', () => {
    const battle = FIGHT_SPELL_LISTS.slice(1).flatMap((list) => list.spells.map((spell) => spell.name));
    // Monsters breathe fire and cold and drain levels while a fight is going on, so the spells
    // that hold those off are as much a part of one as the spells that do damage.
    expect(battle).toContain('ANTI-FIRE');
    expect(battle).toContain('ANTI-COLD');
    expect(battle).toContain('RESIST LEVEL DRAIN');
    expect(battle).toContain('RESIST POISON');
    expect(battle).toContain('RESIST DISEASE');
  });
});

/** The monster of a scripted fight, as every event that names one names it. */
const GHOUL = { type: 3, level: 12, name: 'GHOUL' };

/** A fight the game could have pushed: two swings, a blow, a breath, a drainer and a puffball,
 *  and the spell that finished it. */
const SCRIPTED: GameEvent[] = [
  { kind: 'met', monster: GHOUL, slot: 0 },
  { kind: 'cast', spell: { game: 'unforgiven', type: 1, level: 0, slot: 1, source: 'spellPoints', name: 'ENCHANT WEAPON LEVEL 1' } },
  { kind: 'swung', weapon: 'SWORD', monster: GHOUL, damage: 14 },
  { kind: 'swung', weapon: 'SWORD', monster: GHOUL, damage: 0 },
  { kind: 'hit', monster: GHOUL, damage: 9, breath: null },
  { kind: 'hit', monster: GHOUL, damage: 0, breath: null },
  { kind: 'hit', monster: GHOUL, damage: 21, breath: 1 },
  { kind: 'levelLost', levels: 2, level: 10, monster: GHOUL },
  { kind: 'experienceDrained', experience: 400, monster: GHOUL },
  { kind: 'statChanged', stat: 'STRENGTH', by: -1, monster: GHOUL },
  { kind: 'statChanged', stat: 'LUCK', by: 1, monster: GHOUL },
  { kind: 'cast', spell: { game: 'unforgiven', type: 2, level: 9, slot: 2, source: 'spellPoints', name: 'AUTOKILL' } },
  { kind: 'spellDamaged', monster: GHOUL, damage: 300 },
  { kind: 'killed', monster: GHOUL, experience: 1200 },
];

describe('what a fight came to', () => {
  it('is added up from the events the game pushed', () => {
    expect(fightSummary(SCRIPTED, { seconds: 140, outcome: 'monsterDead' })).toEqual({
      swings: 2,
      hits: 1,
      damageDealt: 14,
      // The blow that missed is no blow, and the breath is a blow like any other.
      blows: 2,
      damageTaken: 30,
      breaths: 1,
      breathDamage: 21,
      levelsDrained: 2,
      experienceDrained: 400,
      // A point taken and a point handed back.
      statsDrained: 0,
      spells: ['ENCHANT WEAPON LEVEL 1', 'AUTOKILL'],
      // The two swings and the two casts; nothing else on the list is one of a run's actions.
      moves: 4,
      seconds: 140,
      outcome: 'monsterDead',
    });
  });

  it('says what it came to in words, and leaves out whatever came to nothing', () => {
    expect(fightSummaryLines(fightSummary(SCRIPTED, { seconds: 140, outcome: 'monsterDead' }))).toEqual([
      'Swung 2 times, hit 1 and missed 1',
      'Took 14 hit points off the monster',
      'Was hit 2 times for 30',
      'Was breathed on 1 time for 21',
      'Lost 2 levels',
      'Lost 400 experience to a drainer',
      'Cast 2 spells: ENCHANT WEAPON LEVEL 1, AUTOKILL',
      'Spent 4 moves and 140 seconds',
    ]);
  });

  it('says how long a fight nobody landed a blow in took, and nothing else', () => {
    expect(fightSummaryLines(fightSummary([], { seconds: 0, outcome: 'characterDead' }))).toEqual([
      'Spent 0 moves and 0 seconds',
    ]);
  });
});

describe('the full log of a fight', () => {
  it('is every line of it, in the words a run’s journal uses', () => {
    const lines = fightJournal(SCRIPTED, { floor: 7, module: 0 });
    expect(lines.map((entry) => entry.text)).toEqual([
      'Came face to face with a Level 12 GHOUL',
      'Cast ENCHANT WEAPON LEVEL 1 from spell points',
      'Swung the SWORD at a Level 12 GHOUL and hit for 14',
      'Swung the SWORD at a Level 12 GHOUL and missed',
      'The GHOUL hit you for 9',
      'The GHOUL missed',
      'The GHOUL breathed FIRE on you for 21',
      'The GHOUL drained 2 levels, down to level 10',
      'The GHOUL drained 400 experience',
      'Lost a point of STRENGTH',
      'Gained a point of LUCK',
      'Cast AUTOKILL from spell points',
      'The spell hit a Level 12 GHOUL for 300',
      'Killed a Level 12 GHOUL for 1200 experience',
    ]);
  });

  it('counts the moves as it goes, so a line says how far into the fight it happened', () => {
    const lines = fightJournal(SCRIPTED, { floor: 7, module: 0 });
    // The first cast is the fight's first move; the two swings are the second and third.
    expect(lines.map((entry) => entry.at).slice(0, 5)).toEqual([0, 1, 2, 3, 3]);
    expect(lines.every((entry) => entry.floor === 7 && entry.module === 0)).toBe(true);
  });
});
