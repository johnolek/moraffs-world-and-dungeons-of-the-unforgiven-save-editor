import { describe, expect, it } from 'vitest';
import { newGame } from '../port/state';
import { clampedToRecord, endlessStateOf, keptEndlessState, restoreEndlessState } from './state';

/** The largest number the record's two hit point fields hold, they being signed words at 0x31 and
 *  0x33, and a number of hit points past it. */
const RECORD_HP_MAX = 32767;
const DEEP_HP = 40000;

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

  it('is the character itself where the record can hold it', () => {
    const played = newGame().pc;
    played.hp = RECORD_HP_MAX;

    expect(clampedToRecord(played)).toBe(played);
  });
});
