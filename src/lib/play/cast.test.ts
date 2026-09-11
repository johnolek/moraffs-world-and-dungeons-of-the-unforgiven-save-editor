import { describe, expect, it } from 'vitest';
import { bundledDungeon } from '../game/dungeon';
import { spellIndex } from '../game/port/inventory';
import { ESCAPE } from '../game/port/screens';
import { savePlayer } from '../game/port/record';
import { BorlandRng, type Rng } from '../game/port/rng';
import { newGame, type PlayerCharacter } from '../game/port/state';
import { UNFORGIVEN_MAP } from '../map/game';
import { newCharacterFile } from '../roller/save-file';
import { facingAMonster, floorSquare, standingOn, startPlaying } from './battle.test-support';
import { GameSession, type CharacterFile } from './engine';
import { KEY } from './keys';

/** A character file that lives in the test rather than in the roster. */
function characterFile(overrides: Partial<PlayerCharacter> = {}): CharacterFile {
  const pc = { ...newGame().pc, name: 'MERLIN', hp: 200, maxHp: 200, ...overrides };
  return {
    bytes: savePlayer(pc, newCharacterFile(pc)),
    write(bytes) {
      this.bytes = bytes;
    },
    died() {},
  };
}

/** A session with the loop running, waiting for its first key. */
function playing(file: CharacterFile, rng: Rng = new BorlandRng(3)): GameSession {
  const session = startPlaying(file, rng);
  return session;
}

/**
 * Press a key and let the loop get back to waiting for the next one.
 *
 * The wait in front of the press is what a player has and a test otherwise does not: the loop
 * reaches the point it is waiting at and puts up whatever it holds the screen with there, and
 * the key then gives that up the way `GameSession.press` gives up any held frame.
 */
async function press(session: GameSession, ...keys: number[]): Promise<void> {
  for (const key of keys) {
    await new Promise((resolve) => setTimeout(resolve));
    session.press(key);
    await new Promise((resolve) => setTimeout(resolve));
  }
}

/** A square of the town with nothing on it. */
function townSquare(): { x: number; y: number } {
  const rows = UNFORGIVEN_MAP.floor(0, 0);
  for (let y = 1; y < 100; y++) {
    for (let x = 1; x < 76; x++) {
      if (rows[y][x].solid) continue;
      if (bundledDungeon.ladder(x, y, 0, 0) !== 0) continue;
      if (bundledDungeon.townFeature(x, y, 0) !== 0) continue;
      if (bundledDungeon.trapdoor(x, y, 0, 0) !== -1) continue;
      return { x, y };
    }
  }
  throw new Error('the town has no free square');
}

/** A wizard standing in the town with `charges` of every spell `owned` names on their wands. */
function wandCarrier(owned: number[], charges: number): CharacterFile {
  const wands = Array.from({ length: 180 }, () => 0);
  for (const index of owned) wands[index] = charges;
  return characterFile({ level: 0, cls: 3, sp: 0, maxSp: 0, wands, ...townSquare() });
}

/** A fighter standing in the town with one sheet of paper of every spell `owned` names. */
function paperCarrier(owned: number[]): CharacterFile {
  const papers = Array.from({ length: 180 }, () => 0);
  for (const index of owned) papers[index] = 1;
  return characterFile({ level: 0, cls: 0, sp: 0, maxSp: 0, papers, ...townSquare() });
}

/** A wizard standing in the town who knows the spells `owned` names. */
function wizard(owned: number[], overrides: Partial<PlayerCharacter> = {}): CharacterFile {
  const spellbook = Array.from({ length: 180 }, () => 0);
  for (const index of owned) spellbook[index] = 1;
  return characterFile({ level: 0, cls: 3, sp: 20, maxSp: 20, spellbook, ...townSquare(), ...overrides });
}

/** The wizard battle spells: Minor Protection on the first line and Pass Wall on the seventh. */
const MINOR_PROTECTION = spellIndex(2, 0, 2);
const PASS_WALL = spellIndex(2, 6, 1);
/** MAGIC ZAP, the second wizard battle spell, which does two damage per level of the caster. */
const MAGIC_ZAP = spellIndex(2, 0, 1);
/** DESCEND, the twelfth preparation spell, which is the fourth line's third slot. */
const DESCEND = spellIndex(1, 3, 2);

/** The keys those spells sit under in the thirty-spell table. */
const SPELL_B = 0x62;
const SPELL_C = 0x63;
const SPELL_L = 0x6c;
const SPELL_T = 0x74;

/** ENCHANT WEAPON LEVEL 1 and WRITE SCROLL TO LEVEL 3, the first line of the permanent list. */
const ENCHANT_WEAPON = spellIndex(0, 0, 0);
const WRITE_SCROLL = spellIndex(0, 0, 2);

/** The lines of every screen the game has drawn, for asking what is on it. */
/** Everything the tab draws in the game's own font: the message box, and any screen the game has
 *  taken the whole display over with. */
const screenText = (session: GameSession): string[] =>
  [...session.view().box, ...session.view().screen].map((line) => line.text);

describe('casting from the spellbook', () => {
  it('casts the spell the menus pick and charges its level in spell points', async () => {
    const session = playing(wizard([MINOR_PROTECTION]));
    await press(session, KEY.cast);
    expect(screenText(session)).toContain('3) WIZARD BATTLE SPELLS');
    await press(session, 0x33);
    expect(screenText(session).some((text) => text.includes('MINOR PROTECTION'))).toBe(true);
    await press(session, SPELL_C);
    expect(session.game.pc.protection).toBe(1);
    expect(session.game.pc.sp).toBe(19);
    // What the spell printed about itself waits for a key, and the cast is only over once it
    // has been given one.
    expect(session.box[0]).toBe('YOUR BODY BEGINS TO SHIMMER');
    await press(session, KEY.escape);
    // The spell lasts 60 moves and the moment the cast itself costs is the first of them.
    expect(session.game.pc.protectionTime).toBe(59);
  });

  it('spends the ten seconds a battle spell takes', async () => {
    const session = playing(wizard([MINOR_PROTECTION]));
    await press(session, KEY.cast, 0x33, SPELL_C, KEY.escape);
    expect(session.view().seconds).toBe(10);
  });

  it('shows what the character has none of as NOT YET FOUND and will not cast it', async () => {
    const session = playing(wizard([MINOR_PROTECTION]));
    await press(session, KEY.cast, 0x33);
    expect(screenText(session).some((text) => text.includes('NOT YET FOUND'))).toBe(true);
    // 'A' is Sleep, which this wizard does not have; the menu goes on waiting.
    await press(session, 0x61);
    expect(session.game.pc.sleepTimer).toBe(0);
    await press(session, SPELL_C);
    expect(session.game.pc.protection).toBe(1);
  });

  it('turns a fighter away before it draws a menu', async () => {
    const session = playing(wizard([MINOR_PROTECTION], { cls: 0 }));
    await press(session, KEY.cast);
    expect(session.box).toEqual([
      'FIGHTERS CAN ONLY CAST',
      '  SPELLS BY USING MAGIC',
      '  PAPER. KEEP LOOKING.',
    ]);
    expect(screenText(session)).not.toContain('1) PERMANENT SPELLS');
  });

  it('refuses a permanent spell anywhere but the town', async () => {
    const session = playing(wizard([MINOR_PROTECTION], { level: 3 }));
    await press(session, KEY.cast, 0x31);
    expect(session.box[0]).toBe('THESE SPELLS TAKE ONE MONTH');
  });

  it('refuses a spell there are not the points for', async () => {
    const session = playing(wizard([PASS_WALL], { sp: 3 }));
    await press(session, KEY.cast, 0x33, SPELL_T);
    expect(session.box[0]).toBe('YOU DO NOT HAVE ENOUGH');
    expect(session.game.pc.sp).toBe(3);
  });

  it('backs out of the type menu, and out of the spell table', async () => {
    const session = playing(wizard([MINOR_PROTECTION]));
    // Escaping the type menu leaves it on the screen, exactly as the original does: nothing
    // wipes the menu column until the next thing drawn in it.
    await press(session, KEY.cast, KEY.escape);
    expect(screenText(session)).not.toContain('SELECT A SPELL-SPELLS USE ONE SPELL POINT PER LEVEL:');
    await press(session, KEY.cast, 0x33, KEY.escape);
    expect(screenText(session).some((text) => text.includes('MINOR PROTECTION'))).toBe(false);
    expect(session.game.pc.protection).toBe(0);
  });

  it('lands on the new floor when the spell moves the character', async () => {
    const session = playing(wizard([DESCEND]));
    await press(session, KEY.cast, 0x32, SPELL_L);
    expect(session.view().place.floor).toBe(1);
    expect(session.game.pc.level).toBe(1);
    // load_level_map stocks the floor arrived on, so the monsters are the new floor's.
    expect(session.view().monsters.length).toBeGreaterThan(0);
    expect(session.view().seconds).toBe(1);
  });

  it('reads a spell description off the help list', async () => {
    // A help list ignores a key for a spell the character has none of, the same as the list it
    // is a copy of, so only a spell they own can be looked up.
    const session = playing(wizard([spellIndex(2, 0, 0)]));
    await press(session, KEY.cast, 0x37, 0x61);
    expect(screenText(session)).toContain('HIT A KEY WHEN FINISHED');
    expect(screenText(session).some((text) => text.includes('SLEEP'))).toBe(true);
    await press(session, KEY.enter);
    expect(session.game.pc.sp).toBe(20);
  });

  it('leaves what a damage spell did to the monster standing for a key', async () => {
    const spellbook = Array.from({ length: 180 }, () => 0);
    spellbook[MAGIC_ZAP] = 1;
    const session = await facingAMonster(new BorlandRng(3), { cls: 3, sp: 20, maxSp: 20, spellbook });
    const monster = session.game.monsters[0];
    const before = monster.hp;
    await press(session, KEY.cast, 0x33, SPELL_B);
    expect(monster.hp).toBe(before - (session.game.pc.lev * 2 + 2));
    expect(session.box).toEqual([
      'WISPS OF COLORFUL LIGHT',
      '   GATHER TOGETHER AND ZAP',
      `   THE MONSTER FOR ${before - monster.hp}`,
      '   POINTS OF DAMAGE!',
    ]);
  });

  it('swaps the two layouts of the spell table and ends the spell', async () => {
    const session = playing(wizard([MINOR_PROTECTION]));
    await press(session, KEY.cast, 0x33, 0x35);
    expect(session.miniSpellMenu).toBe(true);
    expect(screenText(session).some((text) => text.includes('MINOR PROTECTION'))).toBe(false);
    await press(session, KEY.cast, 0x33);
    expect(screenText(session)).toContain('5) SWITCH TO LARGE, SLOW, CAST SPELL MENU');
  });
});

describe('the screen the spell table is drawn on', () => {
  /** cast_a_spell's own two fills: the top of the screen for the big table (exe 2000:ee34) and
   *  the whole message column for the miniature one (exe 2000:e26e). */
  const LARGE = { x: 0, y: 0, right: 0x640, bottom: 0x21c };
  const MINI = { x: 0x398, y: 0x2ff, right: 0x640, bottom: 0x4b0 };

  it('blacks the top of the screen out under the big table and nothing else', async () => {
    const session = playing(wizard([MINOR_PROTECTION]));
    await press(session, KEY.cast, 0x33);
    expect(session.view().screenCleared).toEqual(LARGE);
  });

  it('brings the screen back when the table goes away', async () => {
    const session = playing(wizard([MINOR_PROTECTION]));
    await press(session, KEY.cast, 0x33, ESCAPE);
    expect(session.view().screenCleared).toBe(null);
    expect(session.view().screen).toEqual([]);
  });

  it('brings it back when a spell is cast off the table as well', async () => {
    const session = playing(wizard([MINOR_PROTECTION]));
    await press(session, KEY.cast, 0x33, SPELL_C);
    expect(session.game.pc.protection).toBe(1);
    expect(session.view().screenCleared).toBe(null);
  });

  it('blacks the message column out under the miniature table instead', async () => {
    const session = playing(wizard([MINOR_PROTECTION]));
    // The 5 key switches layouts and ends the cast, so the table has to be asked for again.
    await press(session, KEY.cast, 0x33, 0x35);
    await press(session, KEY.cast, 0x33);
    expect(session.view().screenCleared).toEqual(MINI);
  });

  it('leaves a screen whose own fill the port does not know blacking the whole display out', async () => {
    const session = playing(wizard([MINOR_PROTECTION]));
    await press(session, KEY.help);
    // movecontrol fades the play screen away before it builds the help (`fade.ts`), so the tab
    // is still showing that while the help itself is already on the game's own screen.
    expect(session.game.screen.length).toBeGreaterThan(0);
    expect(session.game.blackedOut).toBe(null);
  });
});

describe('casting out of an item', () => {
  it('takes a charge off the wand instead of a spell point', async () => {
    const session = playing(wandCarrier([MINOR_PROTECTION], 3));
    await press(session, KEY.useItem);
    expect(session.box).toContain('2) WAND');
    await press(session, 0x32, 0x33, SPELL_C);
    expect(session.game.pc.protection).toBe(1);
    expect(session.game.pc.wands[MINOR_PROTECTION]).toBe(2);
    expect(session.game.pc.sp).toBe(0);
  });

  it('lets a fighter cast a wizard spell off a sheet of paper', async () => {
    const session = playing(paperCarrier([MINOR_PROTECTION]));
    await press(session, KEY.cast);
    expect(session.box[0]).toBe('FIGHTERS CAN ONLY CAST');
    // print_menu_only waits for a key, so one is owed before the next one is the game's again.
    await press(session, KEY.escape);
    await press(session, KEY.useItem, 0x33, 0x33, SPELL_C);
    expect(session.game.pc.protection).toBe(1);
    expect(session.game.pc.papers[MINOR_PROTECTION]).toBe(0);
  });

  it('turns a fighter away from a wand, which only paper gets past', async () => {
    const session = playing(characterFile({ level: 0, cls: 0, ...townSquare() }));
    await press(session, KEY.useItem, 0x32);
    expect(session.box).toContain('FIGHTERS CAN ONLY CAST');
  });

  it('opens the potion menu on the fourth line', async () => {
    const session = playing(wandCarrier([], 0));
    await press(session, KEY.useItem, 0x34);
    expect(session.box).toContain('PRESS 1-6 TO TAKE A POTION:');
  });

  it('closes the menu on escape', async () => {
    const session = playing(wandCarrier([MINOR_PROTECTION], 1));
    await press(session, KEY.useItem, KEY.escape);
    expect(session.game.pc.wands[MINOR_PROTECTION]).toBe(1);
  });
});

describe('the time each of the two cast keys spends', () => {
  /** What a battle spell costs, and a monster's attack timer before the cast is paid for. */
  const BATTLE_SPELL_SECONDS = 10;
  const TIMER = 15;

  /** A wizard on a dungeon floor with Minor Protection both in their book and on a wand, so the
   *  same spell can be cast either way. Only a dungeon floor has monsters for call_check_eng and
   *  pass_moment to move: the town has none. */
  function castingOnAFloor(level: number): GameSession {
    const wands = Array.from({ length: 180 }, () => 0);
    wands[MINOR_PROTECTION] = 3;
    const spellbook = Array.from({ length: 180 }, () => 0);
    spellbook[MINOR_PROTECTION] = 1;
    return standingOn(level, floorSquare(level), { cls: 3, sp: 20, maxSp: 20, wands, spellbook });
  }

  /** Move the monster in slot 0 onto `at`, which is where the test wants to watch it from. */
  function plantMonster(session: GameSession, at: { x: number; y: number }): number {
    const slot = 0;
    const planted = session.game.monsters[slot];
    session.game.monsterMap[planted.y * 80 + planted.x] = 0xff;
    planted.x = at.x;
    planted.y = at.y;
    session.game.monsterMap[at.y * 80 + at.x] = slot;
    return slot;
  }

  /** An open square a few paces from `from`: too far for call_check_eng, which only gives the
   *  four squares beside the character anything, and near enough for pass_moment to walk. */
  function nearbySquare(level: number, from: { x: number; y: number }): { x: number; y: number } {
    const rows = UNFORGIVEN_MAP.floor(level, 0);
    for (let y = 1; y < 100; y++) {
      for (let x = 1; x < 76; x++) {
        const away = Math.abs(x - from.x) + Math.abs(y - from.y);
        if (away >= 3 && away <= 5 && !rows[y][x].solid) return { x, y };
      }
    }
    throw new Error(`nothing open near the character on floor ${level}`);
  }

  it('gives a wand cast to the monsters and moves none of them', async () => {
    const session = castingOnAFloor(1);
    const at = nearbySquare(1, session.game.pc);
    const slot = plantMonster(session, at);
    session.game.monsterTimers[slot] = TIMER;
    const before = session.view().seconds;
    await press(session, KEY.useItem, 0x32, 0x33, SPELL_C, KEY.escape);
    expect(session.game.pc.protection).toBe(1);
    expect(session.view().seconds).toBe(before + BATTLE_SPELL_SECONDS);
    // The I key spends the seconds and passes no moment, so the monster is where it was and has
    // only been charged for the ten seconds the cast took.
    expect(session.game.monsters[slot]).toMatchObject(at);
    expect(session.game.monsterTimers[slot]).toBe(TIMER - BATTLE_SPELL_SECONDS);
  });

  it('lets a moment go by for the same spell cast out of the book', async () => {
    const session = castingOnAFloor(1);
    const slot = plantMonster(session, nearbySquare(1, session.game.pc));
    session.game.monsterTimers[slot] = TIMER;
    await press(session, KEY.cast, 0x33, SPELL_C, KEY.escape);
    expect(session.game.pc.protection).toBe(1);
    // pass_moment starts every monster near the character on nought before it walks them.
    expect(session.game.monsterTimers[slot]).toBe(0);
  });

  it('runs the engagement check for a cast given up on out of the item menu', async () => {
    const session = castingOnAFloor(1);
    const pc = session.game.pc;
    const slot = plantMonster(session, { x: pc.x, y: pc.y - 1 });
    // A pass round the loop with a key nothing is bound to, which is where attack_timing meets
    // the monster and starts its timer; the timer the test wants goes on afterwards.
    await press(session, KEY.escape);
    session.game.monsterTimers[slot] = -1;
    const before = session.view().seconds;
    await press(session, KEY.useItem, 0x32, KEY.escape);
    // The I key asks nothing about the seconds, so escaping the spell list still hands nought of
    // them to call_check_eng, and a monster already owed an attack takes it.
    expect(session.game.monsterTimers[slot]).toBeGreaterThan(0);
    expect(session.view().seconds).toBe(before);
  });
});

describe('the menus a spell puts up of its own', () => {
  it('walks Pass Wall the way the direction menu picks', async () => {
    const rows = UNFORGIVEN_MAP.floor(0, 0);
    const start = townSquare();
    while (rows[start.y][start.x + 2].solid) start.x += 1;
    const session = playing(wizard([PASS_WALL], { ...start }));
    await press(session, KEY.cast, 0x33, SPELL_T);
    expect(session.box).toContain('3) EAST (RIGHT)');
    await press(session, 0x33);
    expect(session.view().place.x).toBe(start.x + 2);
    expect(session.game.pc.sp).toBe(13);
  });

  it('gives the spell up when the direction menu is escaped, and charges nothing', async () => {
    const session = playing(wizard([PASS_WALL]));
    const start = session.view().place.x;
    await press(session, KEY.cast, 0x33, SPELL_T, KEY.escape);
    expect(session.view().place.x).toBe(start);
    expect(session.game.pc.sp).toBe(20);
  });

  it('puts the plus Enchant Weapon carries on the weapon its menu picks', async () => {
    const weaponsOwned = [1, 0, 1, 0, 0, 0, 0, 0];
    const session = playing(wizard([ENCHANT_WEAPON], { weaponsOwned }));
    await press(session, KEY.cast, 0x31, 0x61);
    // The second slot is empty and reads as dashes; the third holds a weapon and is picked.
    expect(screenText(session)).toContain('2) --------');
    await press(session, 0x33);
    expect(session.game.pc.weaponPlus[2]).toBe(1);
    // A permanent spell cast out of the book costs its level twice: once now, and once off the
    // spell points the character will ever have again.
    expect(session.game.pc.sp).toBe(19);
    expect(session.game.pc.maxSp).toBe(19);
  });

  it('writes the scroll the three Write Scroll menus pick', async () => {
    const session = playing(wizard([WRITE_SCROLL]));
    await press(session, KEY.cast, 0x31, 0x63);
    expect(screenText(session)).toContain('PLEASE SELECT A TYPE OF SPELL:');
    await press(session, 0x31);
    expect(screenText(session)).toContain('MAXIMUM LEVEL: 3');
    await press(session, 0x32);
    expect(screenText(session)).toContain('2) RELOCATE');
    await press(session, 0x32);
    expect(session.game.pc.scrolls[spellIndex(1, 1, 1)]).toBe(1);
    expect(session.box).toContain('THE SCROLL HAS BEEN');
  });

  it('goes back a menu from the level menu and from the slot menu', async () => {
    const session = playing(wizard([WRITE_SCROLL]));
    await press(session, KEY.cast, 0x31, 0x63, 0x31, 0x31);
    expect(screenText(session)).toContain('4) PREVIOUS MENU');
    await press(session, 0x34);
    expect(screenText(session)).toContain('MAXIMUM LEVEL: 3');
    await press(session, KEY.escape);
    expect(screenText(session)).toContain('PLEASE SELECT A TYPE OF SPELL:');
    await press(session, KEY.escape);
    expect(session.game.pc.sp).toBe(20);
  });
});
