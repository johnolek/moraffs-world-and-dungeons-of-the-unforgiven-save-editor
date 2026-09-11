import { describe, expect, it } from 'vitest';
import { bundledDungeon } from '../game/dungeon';
import { savePlayer } from '../game/port/record';
import { BorlandRng, type Rng } from '../game/port/rng';
import { newGame, type PlayerCharacter } from '../game/port/state';
import { newCharacterFile } from '../roller/save-file';
import { press, startPlaying } from './battle.test-support';
import { GameSession, type CharacterFile } from './engine';
import { KEY } from './keys';

/** A character file that lives in the test rather than in the roster. */
function characterFile(overrides: Partial<PlayerCharacter> = {}): CharacterFile {
  const pc = { ...newGame().pc, name: 'SHOPPER', hp: 200, maxHp: 200, ...overrides };
  return {
    bytes: savePlayer(pc, newCharacterFile(pc)),
    write(bytes) {
      this.bytes = bytes;
    },
    died() {},
  };
}

/** Type a number a digit at a time and hit Enter, the way typed_name reads one. */
async function type(session: GameSession, amount: string): Promise<void> {
  for (const digit of amount) await press(session, digit.charCodeAt(0));
  await press(session, KEY.enter);
}

/** The town square the given building stands on: 1 store, 2 temple, 3 bank, 4 inn. */
function buildingSquare(building: number): { x: number; y: number } {
  for (let y = 1; y < 100; y++) {
    for (let x = 1; x < 76; x++) {
      if (bundledDungeon.townFeature(x, y, 0) !== building) continue;
      if (bundledDungeon.ladder(x, y, 0, 0) !== 0) continue;
      return { x, y };
    }
  }
  throw new Error(`no building ${building} in the town`);
}

/** A character standing on a building's square, with the loop waiting for its first key. */
function standingOn(
  building: number,
  overrides: Partial<PlayerCharacter> = {},
  rng: Rng = new BorlandRng(3),
): GameSession {
  const file = characterFile({ level: 0, ...buildingSquare(building), ...overrides });
  const session = startPlaying(file, rng);
  return session;
}

describe('the store', () => {
  it('opens its menu when U is pressed on the square', async () => {
    const session = standingOn(1);
    await press(session, KEY.up);
    expect(session.box[0]).toBe('YOU HAVE ENTERED A STORE');
    expect(session.box).toContain('1) WEAPONS');
  });

  it('takes the price of a weapon and hands it over', async () => {
    const session = standingOn(1, { money: 20 });
    await press(session, KEY.up);
    await press(session, 0x31);
    expect(session.box[0]).toBe('PLEASE SELECT A WEAPON:');
    expect(session.box).toContain('MONEY ON HAND: 20');
    await press(session, 0x32);
    expect(session.game.pc.money).toBe(5);
    expect(session.game.pc.weaponsOwned[2]).toBe(1);
    expect(session.box[0]).toBe('EXCELLENT CHOICE!');
  });

  it('turns a purchase down when the money is short', async () => {
    const session = standingOn(1, { money: 14 });
    await press(session, KEY.up);
    await press(session, 0x31);
    await press(session, 0x32);
    expect(session.game.pc.money).toBe(14);
    expect(session.box[0]).toBe('  WHAT DO YOU THINK WE');
  });

  it('buys as much culture stock as the typed rubles cover', async () => {
    const session = standingOn(1, { money: 100, lev: 1, cultureStock: 0 });
    await press(session, KEY.up);
    await press(session, 0x33);
    expect(session.box[0]).toBe('CULTURE STOCK HELPS KEEP YOU');
    expect(session.box).toContain('PRICE PER UNIT: 3');
    await press(session, KEY.escape);
    await type(session, '30');
    expect(session.game.pc.cultureStock).toBe(10);
    expect(session.game.pc.money).toBe(70);
    expect(session.box).toContain('CULTURE STOCK:   10');
  });

  it('leaves the store on Escape', async () => {
    const session = standingOn(1, { money: 20 });
    await press(session, KEY.up);
    await press(session, KEY.escape);
    expect(session.box).toEqual([]);
    await press(session, KEY.up);
    expect(session.box[0]).toBe('YOU HAVE ENTERED A STORE');
  });
});

describe('the temple', () => {
  it('opens its menu when U is pressed on the square', async () => {
    const session = standingOn(2);
    await press(session, KEY.up);
    expect(session.box[0]).toBe('PLEASE SELECT A SPELL');
    expect(session.box).toContain('3) HEAL ALL WOUNDS.....500 RUBLES');
  });

  it('heals all wounds for five hundred rubles', async () => {
    const session = standingOn(2, { money: 600, hp: 10, maxHp: 200 });
    await press(session, KEY.up);
    await press(session, 0x33);
    expect(session.game.pc.hp).toBe(200);
    expect(session.game.pc.money).toBe(100);
  });

  it('cures poison and disease', async () => {
    const session = standingOn(2, { money: 800, poison: 400, disease: 200 });
    await press(session, KEY.up);
    await press(session, 0x34);
    expect(session.game.pc.poison).toBe(-1);
    await press(session, 0x35);
    expect(session.game.pc.disease).toBe(-1);
  });

  it('will not sell a cure on credit', async () => {
    const session = standingOn(2, { money: 9, hp: 10, maxHp: 200 });
    await press(session, KEY.up);
    await press(session, 0x31);
    expect(session.game.pc.hp).toBe(10);
    expect(session.box[0]).toBe("SORRY, CAN'T BUY ON CREDIT");
  });

  it('leaves the temple on Escape', async () => {
    const session = standingOn(2, { money: 600 });
    await press(session, KEY.up);
    await press(session, KEY.escape);
    expect(session.box).toEqual([]);
  });
});

describe('the bank', () => {
  it('opens its menu when U is pressed on the square', async () => {
    const session = standingOn(3);
    await press(session, KEY.up);
    expect(session.box[0]).toBe("WELCOME TO MORAFF'S SECOND");
    expect(session.box).toContain('2) DEPOSIT MONEY');
  });

  it('takes a deposit and gives it back', async () => {
    const session = standingOn(3, { money: 500, bank: 0 });
    await press(session, KEY.up);
    await press(session, 0x32);
    await type(session, '300');
    expect(session.game.pc.money).toBe(200);
    expect(session.game.pc.bank).toBe(300);
    expect(session.box).toContain('RUBLES IN BANK:  300');
    await press(session, KEY.escape);
    await press(session, 0x33);
    await type(session, '100');
    expect(session.game.pc.money).toBe(300);
    expect(session.game.pc.bank).toBe(200);
  });

  it('moves the whole balance when the amount typed is bigger than it', async () => {
    const session = standingOn(3, { money: 40, bank: 0 });
    await press(session, KEY.up);
    await press(session, 0x32);
    await type(session, '900');
    expect(session.game.pc.money).toBe(0);
    expect(session.game.pc.bank).toBe(40);
  });

  it('changes a hundred dollars into a ruble and will not be robbed', async () => {
    const session = standingOn(3, { money: 0, dollars: 250 });
    await press(session, KEY.up);
    await press(session, 0x31);
    expect(session.game.pc.money).toBe(2);
    expect(session.game.pc.dollars).toBe(50);
    await press(session, KEY.escape);
    await press(session, 0x34);
    expect(session.box[0]).toBe("  I DIDN'T LET YOU ROB THE");
  });

  it('leaves the bank on Escape', async () => {
    const session = standingOn(3);
    await press(session, KEY.up);
    await press(session, KEY.escape);
    expect(session.box).toEqual([]);
  });
});

describe('the inn', () => {
  it('shows the sign, the bill and the offer of a room', async () => {
    const session = standingOn(4, { lev: 2, money: 100, cultureStock: 7 });
    await press(session, KEY.up);
    expect(session.box[0]).toBe('WELCOME TO THE HELL HOLE INN');
    await press(session, KEY.escape);
    expect(session.box[0]).toBe('  WHEN YOU STAY AT AN INN, YOU');
    await press(session, KEY.escape);
    expect(session.box).toContain('AGING: 4');
    expect(session.box).toContain('YOU HAVE (UNITS): 7');
    await press(session, KEY.escape);
    expect(session.box).toContain('COST 26 RUBLES.');
    expect(session.box).toContain('1) STAY AND REST FOR A WHILE');
  });

  it('ends a preparation spell and hands over the level the experience has earned', async () => {
    const session = standingOn(4, {
      lev: 1,
      money: 100,
      str: 15,
      prepStrength: 1,
      exp: 100000,
      cultureStock: 10,
      crystals: 10,
      sp: 0,
      maxSp: 5,
    });
    await press(session, KEY.up);
    await press(session, KEY.escape);
    await press(session, KEY.escape);
    await press(session, KEY.escape);
    await press(session, 0x31);
    expect(session.game.pc.prepStrength).toBe(0);
    expect(session.game.pc.str).toBe(10);
    expect(session.game.pc.lev).toBeGreaterThan(1);
    expect(session.game.pc.sp).toBe(5);
    expect(session.game.pc.crystals).toBe(5);
    expect(session.game.pc.money).toBe(89);
    // level_up_screen (exe 3000:955f) congratulates the new level on the snake's stone tablet
    // rather than in the message box.
    expect(session.view().tablet?.[0]).toBe('A little snake says:');
    expect(session.view().tablet?.join(' ')).toContain('Congratulat');
    expect(session.box).toEqual([]);
  });

  it('throws out a character who cannot pay', async () => {
    const session = standingOn(4, { lev: 1, money: 3 });
    await press(session, KEY.up);
    await press(session, KEY.escape);
    await press(session, KEY.escape);
    await press(session, KEY.escape);
    await press(session, 0x31);
    expect(session.box[0]).toBe('THREE BIG THUGS BEAT YOU');
    expect(session.game.pc.money).toBe(3);
  });

  it('runs for your life on the second entry', async () => {
    const session = standingOn(4, { lev: 1, money: 100 });
    await press(session, KEY.up);
    await press(session, KEY.escape);
    await press(session, KEY.escape);
    await press(session, KEY.escape);
    await press(session, 0x32);
    expect(session.box).toEqual([]);
    expect(session.game.pc.money).toBe(100);
  });
});

describe("the picture of the building the character is in", () => {
  it('goes up on the store and changes with the shelf being looked at', async () => {
    const session = standingOn(1, { money: 20 });
    expect(session.buildingScreen).toBeNull();
    await press(session, KEY.up);
    expect(session.buildingScreen?.file).toBe('store.pic');
    await press(session, 0x31);
    expect(session.buildingScreen?.file).toBe('weaponry.pic');
    await press(session, KEY.escape);
    await press(session, 0x32);
    expect(session.buildingScreen?.file).toBe('armoury.pic');
  });

  it('is the temple, the bank and the inn on their own squares', async () => {
    for (const [building, file] of [
      [2, 'temple.pic'],
      [3, 'bank.pic'],
      [4, 'inn.pic'],
    ] as const) {
      const session = standingOn(building, { money: 500, lev: 1 });
      await press(session, KEY.up);
      expect(session.buildingScreen?.file).toBe(file);
    }
  });

  it('comes down again when the character leaves', async () => {
    const session = standingOn(1, { money: 20 });
    await press(session, KEY.up);
    await press(session, KEY.escape);
    expect(session.buildingScreen).toBeNull();
  });
});
