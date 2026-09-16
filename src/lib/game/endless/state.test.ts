import { describe, expect, it } from 'vitest';
import { newGame } from '../port/state';
import {
  clampedToRecord,
  endlessStateOf,
  isKeptEndlessState,
  keptEndlessState,
  restoreEndlessState,
} from './state';

/** The largest number the record's two hit point fields hold, they being signed words at 0x31 and
 *  0x33, and a number of hit points past it. */
const RECORD_HP_MAX = 32767;
const DEEP_HP = 40000;

/** The largest number one of the record's item counts holds, they being single signed bytes, and
 *  a pile of loot past it. */
const RECORD_ITEM_MAX = 127;
const DEEP_PILE = 200;

/**
 * What an endless character carries beside its record, written down and read back, which is what
 * it takes to put a character down mid-run and go on playing it tomorrow.
 */
describe('the state kept beside an endless character', () => {
  it('is nothing at all for a character nothing has happened to', () => {
    expect(keptEndlessState(newGame().pc)).toEqual({ keys: [], bossSquares: [] });
  });

  it('carries the keys and the bosses of a character across a write and a read', () => {
    const played = newGame().pc;
    endlessStateOf(played).keys.add(44);
    endlessStateOf(played).bossSquares.set(23, { x: 12, y: 34 });

    const started = newGame().pc;
    restoreEndlessState(started, keptEndlessState(played));

    expect([...endlessStateOf(started).keys]).toEqual([44]);
    expect(endlessStateOf(started).bossSquares.get(23)).toEqual({ x: 12, y: 34 });
  });

  it('carries the Shadow bosses a character has killed, and none for one who has killed none', () => {
    const played = newGame().pc;
    expect(keptEndlessState(played).bossesKilled).toBeUndefined();
    endlessStateOf(played).bossesKilled.add(23);

    const started = newGame().pc;
    restoreEndlessState(started, keptEndlessState(played));

    expect([...endlessStateOf(started).bossesKilled]).toEqual([23]);
  });

  it('leaves the character it was read into carrying nothing else', () => {
    const started = newGame().pc;
    endlessStateOf(started).keys.add(7);

    restoreEndlessState(started, { keys: [44], bossSquares: [] });

    expect([...endlessStateOf(started).keys]).toEqual([44]);
  });

  it('carries the hit points the record has no room for, and only those', () => {
    const played = newGame().pc;
    played.hp = DEEP_HP;
    played.maxHp = DEEP_HP;
    expect(keptEndlessState(played)).toMatchObject({ hp: DEEP_HP, maxHp: DEEP_HP });

    played.hp = RECORD_HP_MAX;
    expect(keptEndlessState(played).hp).toBeUndefined();
    expect(keptEndlessState(played).maxHp).toBe(DEEP_HP);
  });

  it('carries the item counts the record has no room for, and only those', () => {
    const played = newGame().pc;
    played.luckyCharms = DEEP_PILE;
    played.regenRings = DEEP_PILE;
    played.grenades = DEEP_PILE;
    played.seeingStones = DEEP_PILE;
    played.potions = [0, DEEP_PILE, 0, 0, 0, 0];

    expect(keptEndlessState(played)).toMatchObject({
      luckyCharms: DEEP_PILE,
      regenRings: DEEP_PILE,
      grenades: DEEP_PILE,
      seeingStones: DEEP_PILE,
      potions: [0, DEEP_PILE, 0, 0, 0, 0],
    });

    played.luckyCharms = RECORD_ITEM_MAX;
    played.potions = [0, RECORD_ITEM_MAX, 0, 0, 0, 0];
    expect(keptEndlessState(played).luckyCharms).toBeUndefined();
    expect(keptEndlessState(played).potions).toBeUndefined();
    expect(keptEndlessState(played).grenades).toBe(DEEP_PILE);
  });

  it('puts the item counts back over the ones the record came with', () => {
    const started = newGame().pc;
    started.luckyCharms = RECORD_ITEM_MAX;
    started.potions = [0, RECORD_ITEM_MAX, 0, 0, 0, 0];

    restoreEndlessState(started, {
      keys: [],
      bossSquares: [],
      luckyCharms: DEEP_PILE,
      potions: [0, DEEP_PILE, 0, 0, 0, 0],
    });

    expect(started.luckyCharms).toBe(DEEP_PILE);
    expect(started.potions).toEqual([0, DEEP_PILE, 0, 0, 0, 0]);
  });

  it('leaves the character the six potions the record holds, whatever arrives', () => {
    const started = newGame().pc;

    restoreEndlessState(started, { keys: [], bossSquares: [], potions: [1, 2, 3, 4, 5, 6, 7, 8] });

    expect(started.potions).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('puts the hit points back over the ones the record came with', () => {
    const started = newGame().pc;
    started.hp = RECORD_HP_MAX;
    started.maxHp = RECORD_HP_MAX;

    restoreEndlessState(started, { keys: [], bossSquares: [], hp: DEEP_HP, maxHp: DEEP_HP });

    expect([started.hp, started.maxHp]).toEqual([DEEP_HP, DEEP_HP]);
  });

  it('leaves a character alone where the state carries no hit points', () => {
    const started = newGame().pc;
    started.hp = 200;

    restoreEndlessState(started, { keys: [], bossSquares: [] });

    expect(started.hp).toBe(200);
  });
});

describe('the record written for an endless character', () => {
  it('holds the hit points the record can hold, and leaves the character alone', () => {
    const played = newGame().pc;
    played.hp = DEEP_HP;
    played.maxHp = DEEP_HP + 1;

    const forTheRecord = clampedToRecord(played);

    expect([forTheRecord.hp, forTheRecord.maxHp]).toEqual([RECORD_HP_MAX, RECORD_HP_MAX]);
    expect([played.hp, played.maxHp]).toEqual([DEEP_HP, DEEP_HP + 1]);
  });

  it('holds the item counts the record can hold, and leaves the character alone', () => {
    const played = newGame().pc;
    played.luckyCharms = DEEP_PILE;
    played.regenRings = DEEP_PILE;
    played.grenades = DEEP_PILE;
    played.seeingStones = DEEP_PILE;
    played.potions = [0, DEEP_PILE, 0, 0, 0, 0];

    const forTheRecord = clampedToRecord(played);

    expect(forTheRecord.luckyCharms).toBe(RECORD_ITEM_MAX);
    expect(forTheRecord.regenRings).toBe(RECORD_ITEM_MAX);
    expect(forTheRecord.grenades).toBe(RECORD_ITEM_MAX);
    expect(forTheRecord.seeingStones).toBe(RECORD_ITEM_MAX);
    expect(forTheRecord.potions).toEqual([0, RECORD_ITEM_MAX, 0, 0, 0, 0]);
    expect(played.luckyCharms).toBe(DEEP_PILE);
    expect(played.potions).toEqual([0, DEEP_PILE, 0, 0, 0, 0]);
  });

  it('is the character itself where the record can hold it', () => {
    const played = newGame().pc;
    played.hp = RECORD_HP_MAX;
    played.luckyCharms = RECORD_ITEM_MAX;

    expect(clampedToRecord(played)).toBe(played);
  });
});

/**
 * The state a character arrives carrying when it is picked up on a second device, which comes off
 * the open internet and is read before anything is done with it.
 */
describe('a state read off a request or a roster answer', () => {
  it('takes what an endless character writes down', () => {
    const played = newGame().pc;
    endlessStateOf(played).keys.add(44);
    endlessStateOf(played).bossSquares.set(23, { x: 12, y: 34 });

    expect(isKeptEndlessState(keptEndlessState(played))).toBe(true);
  });

  it('takes one carrying the hit points the record has no room for', () => {
    const played = newGame().pc;
    played.hp = DEEP_HP;
    played.maxHp = DEEP_HP;

    expect(isKeptEndlessState(keptEndlessState(played))).toBe(true);
  });

  it('refuses something that is not a state at all', () => {
    expect(isKeptEndlessState(null)).toBe(false);
    expect(isKeptEndlessState('keys')).toBe(false);
    expect(isKeptEndlessState({})).toBe(false);
  });

  it('refuses a key that is not a floor number', () => {
    expect(isKeptEndlessState({ keys: ['44'], bossSquares: [] })).toBe(false);
  });

  it('refuses a boss square that does not say which section it belongs to', () => {
    expect(isKeptEndlessState({ keys: [], bossSquares: [{ x: 12, y: 34 }] })).toBe(false);
  });

  it('refuses hit points that are not a number', () => {
    expect(isKeptEndlessState({ keys: [], bossSquares: [], bossesKilled: ['23'] })).toBe(false);
    expect(isKeptEndlessState({ keys: [], bossSquares: [], hp: '40000' })).toBe(false);
    expect(isKeptEndlessState({ keys: [], bossSquares: [], maxHp: null })).toBe(false);
  });

  it('takes one carrying the item counts the record has no room for', () => {
    const played = newGame().pc;
    played.luckyCharms = DEEP_PILE;
    played.potions = [0, DEEP_PILE, 0, 0, 0, 0];

    expect(isKeptEndlessState(keptEndlessState(played))).toBe(true);
  });

  it('refuses an item count that is not a number', () => {
    expect(isKeptEndlessState({ keys: [], bossSquares: [], luckyCharms: '200' })).toBe(false);
    expect(isKeptEndlessState({ keys: [], bossSquares: [], grenades: null })).toBe(false);
    expect(isKeptEndlessState({ keys: [], bossSquares: [], potions: 200 })).toBe(false);
    expect(isKeptEndlessState({ keys: [], bossSquares: [], potions: [1, '2'] })).toBe(false);
  });
});
