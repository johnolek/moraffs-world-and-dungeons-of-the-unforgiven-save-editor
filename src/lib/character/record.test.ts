import { describe, expect, it } from 'vitest';
import type { CurrentCharacter } from '../app-state.svelte';
import { MORAFFS_REVENGE, MORAFFS_WORLD, UNFORGIVEN } from '../editor/games';
import { REV_VALUE_COUNT } from '../game/rev-port/record';
import { REV_ARMOUR_VALUE, REV_VALUE, revPlayerFromValues, saveRevPlayer, setRevValue, type RevPc } from '../play/rev/record';
import {
  battleSpellsInEffect,
  characterFileName,
  characterSlots,
  characterStatus,
  collapsedLine,
  expLabel,
  levelLabel,
  recordName,
  slotFromFileName,
  statLabels,
  withSeparators,
} from './record';

/** A character file with a name and nothing else, which every test then writes its own fields into. */
function file(game: typeof UNFORGIVEN, name: string): { character: CurrentCharacter; view: DataView } {
  const bytes = new Uint8Array(game.fileSize!);
  for (let i = 0; i < name.length; i++) bytes[i] = name.charCodeAt(i);
  return {
    character: { game: game.id, name, slot: 21, bytes },
    view: new DataView(bytes.buffer),
  };
}

/** A Moraff's Revenge character file, written the way the game writes one, from a record of
 *  nothing but the fields the test sets. */
function revengeFile(fill: (pc: RevPc) => void): CurrentCharacter {
  const pc = revPlayerFromValues(Array<number>(REV_VALUE_COUNT).fill(0));
  fill(pc);
  return { game: MORAFFS_REVENGE.id, name: '3.EXE', slot: 3, bytes: saveRevPlayer(pc) };
}

describe('the name in a record', () => {
  it('stops at the zero that ends it', () => {
    const bytes = new Uint8Array(64);
    bytes.set([83, 65, 71, 69, 89, 0, 88]);
    expect(recordName(bytes)).toBe('SAGEY');
  });

  it('is empty for a record that has none', () => {
    expect(recordName(new Uint8Array(64))).toBe('');
  });
});

describe('the file a character came from', () => {
  it('is the slot when the name is a number', () => {
    expect(slotFromFileName('21')).toBe(21);
  });

  it('has no slot when the name is not a number', () => {
    expect(slotFromFileName('sagey.sav')).toBeNull();
  });

  it('is downloaded under the slot when there is one', () => {
    expect(characterFileName(21, 'sagey.sav')).toBe('21');
  });

  it('keeps the name it was loaded under when there is no slot', () => {
    expect(characterFileName(null, 'sagey.sav')).toBe('sagey.sav');
  });
});

describe('the numbers a character can be downloaded as', () => {
  it('gives each game the numbers its own folder has room for', () => {
    expect(characterSlots(UNFORGIVEN.id)).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
    expect(characterSlots(MORAFFS_WORLD.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(characterSlots(MORAFFS_REVENGE.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('names every one of them the way that game names its files', () => {
    expect(characterSlots(MORAFFS_REVENGE.id).map((slot) => characterFileName(slot, '', MORAFFS_REVENGE.id))).toContain('10.EXE');
    expect(characterSlots(UNFORGIVEN.id).map((slot) => characterFileName(slot, '', UNFORGIVEN.id))).toContain('29');
  });
});

describe('the status block of a Dungeons of the Unforgiven character', () => {
  const { character, view } = file(UNFORGIVEN, 'SAGEY');
  view.setInt8(0x2a, 5);
  view.setInt8(0xc0, 1);
  view.setInt8(0x9b, 0);
  view.setInt16(0x7ac, 45, true);
  view.setFloat64(0x7a4, 3708293444646685, true);
  view.setFloat32(0x35, 616, true);
  view.setFloat32(0x39, 648, true);
  view.setInt16(0x31, 5690, true);
  view.setInt16(0x33, 5808, true);
  view.setInt16(0x816, 94, true);
  view.setInt16(0x818, 88, true);
  view.setInt16(0x81a, 63, true);
  view.setInt16(0x81c, 101, true);
  view.setInt16(0x81e, 136, true);
  view.setInt16(0x820, 113, true);
  view.setInt16(0x7b0, 40, true);
  view.setInt16(0x7b2, 50, true);
  view.setInt16(0x7b4, 25, true);
  view.setInt16(0x7b6, 2, true);
  const status = characterStatus(character)!;

  it('reads the name, class and kit', () => {
    expect(status.recordName).toBe('SAGEY');
    expect(status.cls).toBe('Sage');
    expect(status.armor).toBe('LEATHER');
    expect(status.weapon).toBe('FIST');
  });

  it('reads the level, experience, spell points and health points', () => {
    expect(status.lev).toBe(45);
    expect(status.exp).toBe(3708293444646685);
    expect([status.sp, status.maxSp]).toEqual([616, 648]);
    expect([status.hp, status.maxHp]).toEqual([5690, 5808]);
  });

  it('reads the six characteristics under the labels the game gives them', () => {
    expect(status.stats).toEqual([
      { label: 'STR', value: 94 },
      { label: 'INT', value: 88 },
      { label: 'WIZ', value: 63 },
      { label: 'CON', value: 101 },
      { label: 'DEX', value: 136 },
      { label: 'LUCK', value: 113 },
    ]);
  });

  it('reads where the character stands', () => {
    expect(status.place).toEqual({ game: 'unforgiven', x: 40, y: 50, floor: 25, dungeon: 2 });
  });

  it('is on the normal curve until the record says otherwise', () => {
    expect(status.hard).toBe(false);
    const harder = file(UNFORGIVEN, 'TOUGH');
    harder.view.setInt8(0x8f6, 1);
    expect(characterStatus(harder.character)!.hard).toBe(true);
  });
});

describe('the status block of a Moraff’s World character', () => {
  const { character, view } = file(MORAFFS_WORLD, 'HERO');
  view.setInt16(0x7a8, 12, true);
  view.setFloat64(0x858, 1234567, true);
  view.setInt16(0x812, 30, true);
  view.setInt16(0x81c, 44, true);
  const status = characterStatus(character)!;

  it('reads the level and experience from the places Moraff’s World keeps them', () => {
    expect(status.lev).toBe(12);
    expect(status.exp).toBe(1234567);
  });

  it('reads the six characteristics from its own offsets', () => {
    expect(status.stats[0]).toEqual({ label: 'STR', value: 30 });
    expect(status.stats[5]).toEqual({ label: 'LUCK', value: 44 });
  });

  it('has no battle spells', () => {
    expect(status.battleSpells).toEqual([]);
  });

  it('reads the square, floor and dungeon it stands in', () => {
    const { character, view } = file(MORAFFS_WORLD, 'WANDERER');
    view.setInt16(0x7ac, 41, true);
    view.setInt16(0x7ae, 62, true);
    view.setInt16(0x7b0, 17, true);
    view.setInt16(0x7b2, -1500, true);
    expect(characterStatus(character)!.place).toEqual({ game: 'moraffsWorld', x: 41, y: 62, floor: 17, dungeon: -1500 });
  });
});

describe('the status block of a Moraff’s Revenge character', () => {
  const character = revengeFile((pc) => {
    pc.cls = 2;
    pc.stats = [18, 21, 16, 14, 12, 7];
    pc.level = 6;
    pc.experience = 250000;
    pc.spellPoints = 23;
    pc.hp = 41;
    pc.maxHp = 55;
    pc.column = 12;
    pc.row = 9;
    pc.dungeonLevel = 4;
    pc.generation = 3;
    setRevValue(pc, REV_ARMOUR_VALUE, 2);
    setRevValue(pc, REV_VALUE.knife, 1);
    setRevValue(pc, REV_VALUE.mace, 1);
  });
  const status = characterStatus(character)!;

  it('has no name, because the record holds none', () => {
    expect(status.recordName).toBe('');
  });

  it('names the class, the armour worn and every weapon owned', () => {
    expect(status.cls).toBe('Wizard');
    expect(status.armor).toBe('CHAIN');
    expect(status.weapon).toBe('KNIFE MACE');
  });

  it('swings with fists when the character owns no weapon', () => {
    expect(characterStatus(revengeFile(() => {}))!.weapon).toBe('FISTS');
  });

  it('reads the level, experience and health points through the shifts the record keeps them behind', () => {
    expect(status.lev).toBe(6);
    expect(status.exp).toBe(250000);
    expect([status.hp, status.maxHp]).toEqual([41, 55]);
  });

  it('has spell points with no maximum, because the game keeps none', () => {
    expect(status.sp).toBe(23);
    expect(status.maxSp).toBeNull();
  });

  it('reads the six characteristics of this game', () => {
    expect(status.stats).toEqual([
      { label: 'STR', value: 18 },
      { label: 'INT', value: 21 },
      { label: 'WIS', value: 16 },
      { label: 'HEA', value: 14 },
      { label: 'AGI', value: 12 },
      { label: 'LAZ', value: 7 },
    ]);
  });

  it('reads the square as the map numbers it, with the generation for the dungeon', () => {
    expect(status.place).toEqual({ game: 'revenge', x: 11, y: 8, floor: 4, dungeon: 3 });
  });

  it('is nothing at all for bytes that are not a character file', () => {
    expect(characterStatus({ game: MORAFFS_REVENGE.id, name: '3.EXE', slot: 3, bytes: new Uint8Array(4) })).toBeNull();
  });
});

describe('the labels for a game’s six characteristics', () => {
  it('are the ones the two C games print', () => {
    expect(statLabels(UNFORGIVEN.id)).toEqual(['STR', 'INT', 'WIZ', 'CON', 'DEX', 'LUCK']);
    expect(statLabels(MORAFFS_WORLD.id)).toEqual(['STR', 'INT', 'WIZ', 'CON', 'DEX', 'LUCK']);
  });

  it('are Moraff’s Revenge’s own six for it', () => {
    expect(statLabels(MORAFFS_REVENGE.id)).toEqual(['STR', 'INT', 'WIS', 'HEA', 'AGI', 'LAZ']);
  });
});

describe('the battle spells in effect', () => {
  const empty = () => new DataView(new ArrayBuffer(UNFORGIVEN.fileSize!));

  it('lists nothing for a character with no spell running', () => {
    expect(battleSpellsInEffect(empty())).toEqual([]);
  });

  it('names Protection and Power Weapon by their level', () => {
    const view = empty();
    view.setInt8(0x7eb, 3);
    view.setInt8(0x7e8, 2);
    expect(battleSpellsInEffect(view)).toEqual(['PROTECT, LEVEL 3', 'POWER WEAPON 2']);
  });

  it('lists the timed spells in the order the game prints them', () => {
    const view = empty();
    for (const offset of [0x7e2, 0x7e4, 0x7e6, 0x7fa, 0x7f8, 0x7f6, 0x7ee, 0x7f0, 0x7f2, 0x7f4]) {
      view.setInt16(offset, 10, true);
    }
    expect(battleSpellsInEffect(view)).toEqual([
      'STRENGTH',
      'SPEED',
      'SLOW MONSTER',
      'HOLD MONSTER',
      'STOP MONSTER',
      'RESIST DRAIN',
      'RESIST POISON',
      'RESIST DISEASE',
      'ANTI-COLD',
      'ANTI-FIRE',
    ]);
  });

  it('leaves out a spell whose timer has run out', () => {
    const view = empty();
    view.setInt16(0x7e2, 0, true);
    view.setInt16(0x7e4, -1, true);
    expect(battleSpellsInEffect(view)).toEqual([]);
  });
});

describe('big numbers', () => {
  it('get thousands separators', () => {
    expect(withSeparators(3708293444646685)).toBe('3,708,293,444,646,685');
    expect(withSeparators(616)).toBe('616');
  });

  it('are rounded, because the game keeps experience as a decimal', () => {
    expect(withSeparators(1265.6)).toBe('1,266');
  });
});

describe('the level and experience labels', () => {
  it('are written out in full below level 9', () => {
    expect(levelLabel(8) + '8').toBe('LEVEL: 8');
    expect(expLabel(8)).toBe('EXP:');
  });

  it('are one letter each from level 9 on, where the numbers get long', () => {
    expect(levelLabel(9) + '9').toBe('L:9');
    expect(expLabel(45)).toBe('X:');
  });
});

describe('the folded-away line', () => {
  it('names the character and the numbers worth watching', () => {
    const { character, view } = file(UNFORGIVEN, 'SAGEY');
    view.setInt16(0x7ac, 45, true);
    view.setInt16(0x31, 5690, true);
    view.setInt16(0x33, 5808, true);
    view.setFloat32(0x35, 616.5, true);
    view.setFloat32(0x39, 648, true);
    view.setInt16(0x816, 94, true);
    view.setInt16(0x81c, 101, true);
    view.setInt16(0x820, 113, true);
    expect(collapsedLine(characterStatus(character)!, 'SAGEY')).toBe('SAGEY L:45  HP 5690/5808  SP 616/648  STR 94 · CON 101 · LUCK 113');
  });

  it('falls back to what the app calls a character with no name in its record', () => {
    const { character } = file(UNFORGIVEN, '');
    expect(collapsedLine(characterStatus(character)!, 'Rolled character')).toContain('Rolled character');
  });

  it('carries the three characteristics of whichever game the character belongs to', () => {
    const character = revengeFile((pc) => {
      pc.stats = [18, 21, 16, 14, 12, 7];
      pc.level = 6;
      pc.hp = 41;
      pc.maxHp = 55;
      pc.spellPoints = 23;
    });
    expect(collapsedLine(characterStatus(character)!, '3.EXE')).toBe('3.EXE L:6  HP 41/55  SP 23  STR 18 · HEA 14 · LAZ 7');
  });
});
