import { describe, expect, it } from 'vitest';
import { hitChance, toHitTotal } from '../bestiary/to-hit';
import { battleSpellsInEffect } from '../character/record';
import { SPELL_NAMES } from '../editor/spell-names';
import { strike } from '../game/port/combat';
import { savePlayer } from '../game/port/record';
import { newGame, type Game, type PlayerCharacter } from '../game/port/state';
import type { MapSquare } from '../map/game';
import type { StockedMonster } from '../map/stocking';
import {
  ailments,
  engagedMonster,
  magicItems,
  floorMonsterKinds,
  monsterKindSquares,
  spellTimers,
  squareFacts,
  untimedSpells,
} from './panel';

/** A character to read numbers off, with everything the panel looks at at rest. */
function character(overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return { ...newGame().pc, ...overrides };
}

/** The record as bytes, which is what the game's own status block reads. */
function recordView(pc: PlayerCharacter): DataView {
  const bytes = savePlayer(pc, new Uint8Array(0));
  return new DataView(bytes.buffer);
}

/** A repeatable stand-in for Math.random, so a failing sample can be run again. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** An open square of the dungeon with nothing on it. */
function square(overrides: Partial<MapSquare> = {}): MapSquare {
  return { n: 3, s: 3, w: 3, e: 3, solid: false, ladder: 0, chute: 0, trapdoor: -1, town: 0, ...overrides };
}

const labels = (lines: { label: string }[]) => lines.map((line) => line.label);

describe('the spells with a timer', () => {
  it('gives each one the moves it has left', () => {
    const lines = spellTimers(character({ strengthTimer: 58, antiFireTimer: 1, resistDrainTimer: 240 }));
    expect(lines.map((line) => [line.label, line.value])).toEqual([
      ['Strength', '58 moves'],
      ['Resist Level Drain', '240 moves'],
      ['Anti-Fire', '1 move'],
    ]);
    expect(lines[0].note).toBe('+7 Strength while it runs. A cast lasts 60 moves.');
  });

  it('lists nothing for a character with no spell running', () => {
    expect(spellTimers(character())).toEqual([]);
  });

  it('keeps Protection and Power Weapon on the list once their timer has run out', () => {
    const lines = spellTimers(character({ protection: 3, protectionTime: 0, powerWeapon: 2, powerWeaponTime: 0 }));
    expect(lines.map((line) => [line.label, line.value])).toEqual([
      ['Protection, level 3', 'out of moves'],
      ['Power Weapon 2', 'out of moves'],
    ]);
    for (const line of lines) expect(line.note).toContain('Only a night at the inn takes it off you.');
  });

  it('lists the same spells the game\'s own battle-spell box does', () => {
    const pc = character({
      protection: 2,
      protectionTime: 30,
      strengthTimer: 10,
      powerWeapon: 1,
      powerWeaponTime: 40,
      speedTimer: 10,
      slowEnemiesTimer: 10,
      holdMonsterTimer: 10,
      sleepTimer: 10,
      resistDrainTimer: 10,
      resistPoisonTimer: 10,
      resistDiseaseTimer: 10,
      antiColdTimer: 10,
      antiFireTimer: 10,
    });
    expect(spellTimers(pc)).toHaveLength(battleSpellsInEffect(recordView(pc)).length);
    const some = character({ protection: 4, protectionTime: 5, antiColdTimer: 7 });
    expect(spellTimers(some)).toHaveLength(battleSpellsInEffect(recordView(some)).length);
  });

  it('says what every one of them is doing, for the tooltip the map shows', () => {
    const pc = character({
      protection: 2,
      protectionTime: 30,
      strengthTimer: 10,
      powerWeapon: 1,
      powerWeaponTime: 40,
      speedTimer: 10,
      slowEnemiesTimer: 10,
      holdMonsterTimer: 10,
      sleepTimer: 10,
      resistDrainTimer: 10,
      resistPoisonTimer: 10,
      resistDiseaseTimer: 10,
      antiColdTimer: 10,
      antiFireTimer: 10,
    });
    expect(spellTimers(pc).filter((line) => !line.note)).toEqual([]);
  });
});

describe('the poison and disease clocks', () => {
  it('counts the moves until the next point goes, which is one fewer than the record holds', () => {
    const lines = ailments(character({ poison: 450, disease: 12 }));
    expect(lines.map((line) => [line.label, line.value])).toEqual([
      ['Poison', '449 moves to −1 Strength'],
      ['Disease', '11 moves to −1 Constitution'],
    ]);
  });

  it('says a resistance spell is holding the clock', () => {
    const [line] = ailments(character({ poison: 300, resistPoisonTimer: 40 }));
    expect(line).toMatchObject({ label: 'Poison', value: 'held off' });
  });

  it('says nothing about an ailment that has been cured', () => {
    expect(ailments(character({ poison: -1, disease: -1 }))).toEqual([]);
  });
});

describe('the spells with no timer', () => {
  it('names each one and what it is lending', () => {
    const lines = untimedSpells(character({ tempWeaponPlus: 3, superStrength: 10, protRing: 2 }));
    expect(lines.map((line) => [line.label, line.value])).toEqual([
      ['Enchant Weapon', '+3'],
      ['Super Strength', '+10 Strength'],
      ['Ring of Protection', '+2'],
    ]);
  });

  it('tells the preparation spell from the permanent one by the 1 and the 100', () => {
    const [preparation] = untimedSpells(character({ feather: 1 }));
    const [permanent] = untimedSpells(character({ feather: 100 }));
    expect(preparation.note).toContain('Lasts until a night at the inn.');
    expect(permanent.note).toContain('Lasts for good.');
  });

  it('says what every one of them is doing, for the tooltip the map shows', () => {
    const pc = character({
      tempWeaponPlus: 3,
      tempArmorPlus: 2,
      prepStrength: 4,
      prepAgility: 4,
      superStrength: 10,
      superAgility: 10,
      fastMove: 1,
      feather: 1,
      invisible: 1,
      bodyArmor: 3,
      protRing: 2,
      antiMagicRing: 2,
    });
    expect(untimedSpells(pc).filter((line) => !line.note)).toEqual([]);
  });
});

describe('the charges on what the character carries', () => {
  it('names the spell every count belongs to', () => {
    const wands = Array.from({ length: 180 }, () => 0);
    // The wizard battle list is the third of the four, and its fourth slot is level 2, spell 1.
    wands[2 * 45 + 3] = 7;
    const scrolls = Array.from({ length: 180 }, () => 0);
    scrolls[0] = 2;
    const [wandGroup, scrollGroup, paperGroup] = magicItems(character({ wands, scrolls }));
    expect(wandGroup).toEqual({
      title: 'Wands',
      lines: [{ label: SPELL_NAMES.wizard[3], value: '7', note: 'Wizard, level 2' }],
    });
    expect(scrollGroup.lines).toEqual([{ label: SPELL_NAMES.permanent[0], value: '2', note: 'Permanent, level 1' }]);
    expect(paperGroup.lines).toEqual([]);
  });

  it('shows a count in one of the fifteen slots the game leaves alone', () => {
    const papers = Array.from({ length: 180 }, () => 0);
    papers[45 + 30] = 4;
    const [, , paperGroup] = magicItems(character({ papers }));
    expect(paperGroup.lines).toEqual([{ label: 'Preparation slot 31 (unused)', value: '4' }]);
  });
});

/** A game with one monster standing in slot 3 and the character facing it. */
function facing(pcOverrides: Partial<PlayerCharacter> = {}, monsterLevel = 12): Game {
  const game = newGame({ pc: { level: 6, module: 0, x: 40, y: 50, lev: 20, str: 30, luck: 15, ...pcOverrides } });
  Object.assign(game.monsters[3], { x: 41, y: 50, hp: 90, type: 0, level: monsterLevel });
  game.engaged = 3;
  game.engagedAhead = 3;
  return game;
}

describe('the monster being faced', () => {
  it('is nothing when the character faces nothing', () => {
    expect(engagedMonster(newGame())).toBeNull();
  });

  it('names it and gives its level, its hit points and the most it could have been stocked with', () => {
    const engaged = engagedMonster(facing())!;
    const kind = newGame().monsterKinds[0];
    const stats = newGame().monsterStats[kind.type];
    expect(engaged.name).toBe(kind.name);
    expect(engaged.level).toBe(12);
    expect(engaged.hp).toBe(90);
    // The character is on floor 6 of Module I, and the ceiling follows that floor rather than
    // the level 12 the nudge left the monster at.
    expect(engaged.mostHp).toBe(stats.hpPerLevel * 6 + 1);
  });

  it('works the hit chance out of the same pieces to-hit.ts takes', () => {
    const game = facing({ weapon: 3, gauntlet: 2, luckyCharms: 4, tempWeaponPlus: 1 });
    const pc = game.pc;
    const kind = game.monsterKinds[game.monsters[3].type];
    const stats = game.monsterStats[kind.type];
    const total = toHitTotal({
      lev: pc.lev,
      str: pc.str,
      luck: pc.luck,
      luckyCharms: pc.luckyCharms,
      weaponHit: game.weaponHit[pc.weapon],
      gauntlet: pc.gauntlet,
      weaponPlus: pc.weaponPlus[pc.weapon],
      tempWeaponPlus: pc.tempWeaponPlus,
      hard: false,
    });
    expect(engagedMonster(game)!.hitChance).toBe(
      hitChance(total, 12, stats.defense, stats.speed, game.weaponDamage[pc.weapon]),
    );
  });

  it('swings the Power Weapon die, eight rows further into the weapon table', () => {
    const plain = engagedMonster(facing({ weapon: 1 }))!;
    const powered = engagedMonster(facing({ weapon: 1, powerWeapon: 3 }))!;
    expect(powered.hitChance).toBeGreaterThan(plain.hitChance);
  });

  it('matches the share of swings the port\'s own strike calls hits', () => {
    const game = facing({ weapon: 5 }, 8);
    const counted = engagedMonster(game)!.hitChance;
    const rnd = seeded(20);
    game.rng = { random: (n: number) => Math.trunc(rnd() * n) };
    const swings = 20000;
    let hits = 0;
    for (let swing = 0; swing < swings; swing++) {
      game.monsters[3].hp = 32000;
      if (strike(game) > 0) hits++;
    }
    expect(hits / swings).toBeCloseTo(counted, 2);
  });
});

describe('the square the character stands on', () => {
  it('says which floor a trap door leads to and whether the key is in hand', () => {
    const withoutKey = squareFacts(newGame({ pc: { level: 6 } }), square({ trapdoor: 20 }));
    expect(withoutKey[0]).toMatchObject({ label: 'Trap door', value: 'to floor 20' });
    expect(withoutKey[0].note).toContain('level drainer');
    const keys = Array.from({ length: 36 }, () => 0);
    keys[4] = 1;
    const withKey = squareFacts(newGame({ pc: { level: 6, keys } }), square({ trapdoor: 20 }));
    expect(withKey[0].note).toBe('You have the key it is labelled with.');
  });

  it('says which floor a chute drops to', () => {
    expect(squareFacts(newGame({ pc: { level: 6 } }), square({ chute: 9 }))[0]).toMatchObject({
      label: 'Chute',
      value: 'drops to floor 9',
    });
  });

  it('says where a ladder goes, counting from the floor the character is on', () => {
    const game = newGame({ pc: { level: 6 } });
    expect(squareFacts(game, square({ ladder: 2 }))[0]).toEqual({ label: 'Ladder', value: 'down to floor 8' });
    expect(squareFacts(game, square({ ladder: -3 }))[0]).toEqual({ label: 'Ladder', value: 'up to floor 3' });
    expect(squareFacts(newGame({ pc: { level: 1 } }), square({ ladder: -1 }))[0]).toEqual({
      label: 'Ladder',
      value: 'up to the town',
    });
  });

  it('names the town building on the square', () => {
    const game = newGame({ pc: { level: 0 } });
    expect(labels(squareFacts(game, square({ town: 4 })))).toEqual(['Inn']);
  });

  it('says nothing about a square with nothing on it', () => {
    expect(squareFacts(newGame({ pc: { level: 6 } }), square())).toEqual([]);
  });
});

describe('the monsters on the floor', () => {
  it('names every kind on the floor, the nearest first, with how many there are', () => {
    const game = newGame({ pc: { x: 40, y: 50, level: 6 } });
    const drawn: StockedMonster[] = [
      { slot: 0, x: 50, y: 50, monsterId: 'builtin-0', level: 4, hp: 10 },
      { slot: 1, x: 41, y: 52, monsterId: 'builtin-1', level: 5, hp: 10 },
      { slot: 2, x: 40, y: 49, monsterId: 'builtin-1', level: 7, hp: 10 },
    ];
    for (const monster of drawn) Object.assign(game.monsters[monster.slot], { type: monster.slot === 0 ? 0 : 1 });
    expect(floorMonsterKinds(game, drawn)).toEqual([
      {
        monsterId: 'builtin-1',
        name: game.monsterKinds[1].name,
        count: 2,
        lowestLevel: 5,
        highestLevel: 7,
        nearest: 1,
      },
      {
        monsterId: 'builtin-0',
        name: game.monsterKinds[0].name,
        count: 1,
        lowestLevel: 4,
        highestLevel: 4,
        nearest: 10,
      },
    ]);
  });

  it('names the section boss however far off he is standing', () => {
    const game = newGame({ pc: { x: 1, y: 1, level: 5 } });
    const drawn: StockedMonster[] = [
      { slot: 0, x: 60, y: 60, monsterId: 'section-1-22', level: 9, hp: 10 },
      { slot: 1, x: 2, y: 1, monsterId: 'builtin-0', level: 4, hp: 10 },
      { slot: 2, x: 3, y: 1, monsterId: 'builtin-1', level: 5, hp: 10 },
    ];
    for (const monster of drawn) Object.assign(game.monsters[monster.slot], { type: monster.slot === 0 ? 22 : monster.slot - 1 });
    const listed = floorMonsterKinds(game, drawn);
    expect(listed.map((kind) => kind.name)).toEqual([
      game.monsterKinds[0].name,
      game.monsterKinds[1].name,
      'SHADOW GARGALON',
    ]);
    expect(listed[2].nearest).toBe(118);
  });
});

describe('the kind picked out of the list', () => {
  const drawn: StockedMonster[] = [
    { slot: 0, x: 10, y: 10, monsterId: 'builtin-0', level: 4, hp: 10 },
    { slot: 1, x: 20, y: 20, monsterId: 'builtin-1', level: 5, hp: 10 },
    { slot: 2, x: 30, y: 30, monsterId: 'builtin-0', level: 6, hp: 10 },
  ];

  it('is every square a monster of that kind stands on', () => {
    expect(monsterKindSquares(drawn, 'builtin-0')).toEqual([
      { x: 10, y: 10, label: null },
      { x: 30, y: 30, label: null },
    ]);
  });

  it('rings nothing while no kind is picked', () => {
    expect(monsterKindSquares(drawn, null)).toEqual([]);
  });
});
