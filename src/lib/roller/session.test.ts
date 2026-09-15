import { describe, expect, it } from 'vitest';
import type { RollerView } from './session';
import { RecordedRandom, ROLLER_PORT, RollerSession } from './session';

/** The text of everything showing, one string a line. */
function showing(view: RollerView): string[] {
  return view.screen.map((line) => (line.value === undefined ? line.text : line.text + line.value));
}

describe('RecordedRandom', () => {
  it('cuts an integer in 0..n-1 out of each fraction', () => {
    const rng = new RecordedRandom([]);
    for (let i = 0; i < 200; i++) {
      const value = rng.random(6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
    }
  });

  it('is zero for Random(0), the way the game is', () => {
    expect(new RecordedRandom([]).random(0)).toBe(0);
  });

  it('hands the same fractions back the second time round', () => {
    const drawn: number[] = [];
    const first = new RecordedRandom(drawn);
    const rolls = Array.from({ length: 50 }, (_, i) => first.random(i + 2));
    const again = new RecordedRandom(drawn);
    expect(Array.from({ length: 50 }, (_, i) => again.random(i + 2))).toEqual(rolls);
  });
});

describe('RollerSession', () => {
  it('stops on the difficulty menu with the first screen showing', () => {
    const session = new RollerSession(ROLLER_PORT, 20);
    const view = session.view();
    expect(view.question).toBe('difficulty');
    expect(showing(view)[0]).toBe('PLEASE SELECT ONE:');
    expect(view.screen).toHaveLength(13);
  });

  it('walks the questions in the order roll_char asks them', () => {
    const session = new RollerSession(ROLLER_PORT, 20);
    expect(session.view().question).toBe('difficulty');
    session.answer(0);
    expect(session.view().question).toBe('continue');
    session.answer(0);
    expect(session.view().question).toBe('race');
    session.answer(5);
    expect(session.view().question).toBe('keepRerollDesign');
    session.answer(0);
    expect(session.view().question).toBe('name');
    session.answer('BOB');
    expect(session.view().question).toBe('class');
    session.answer(6);
    expect(session.view().question).toBe('continue');
    session.answer(0);
    expect(session.view().question).toBe(null);
    expect(session.view().pc.name).toBe('BOB');
    expect(session.view().pc.cls).toBe(6);
    expect(session.view().pc.race).toBe(5);
  });

  it('keeps the character it showed when the next answer comes in', () => {
    const session = new RollerSession(ROLLER_PORT, 20);
    session.answer(0);
    session.answer(0);
    session.answer(2);
    const rolled = { ...session.view().pc };
    session.answer(0);
    session.answer('SAME');
    session.answer(0);
    const kept = session.view().pc;
    expect([kept.str, kept.iq, kept.wis, kept.con, kept.dex, kept.luck]).toEqual([
      rolled.str,
      rolled.iq,
      rolled.wis,
      rolled.con,
      rolled.dex,
      rolled.luck,
    ]);
    expect(kept.height).toBe(rolled.height);
    expect(kept.weight).toBe(rolled.weight);
    expect(kept.age).toBe(rolled.age);
    expect(kept.sex).toBe(rolled.sex);
  });

  it('shows one screen at a time, the way the game clears between them', () => {
    const session = new RollerSession(ROLLER_PORT, 20);
    session.answer(0);
    const advice = session.view();
    expect(showing(advice)[0]).toBe('CREATING A CHARACTER:');
    expect(showing(advice)).not.toContain('PLEASE SELECT ONE:');
    session.answer(0);
    const race = session.view();
    expect(showing(race)).toContain('RACE SELECTION:');
    expect(showing(race)).not.toContain('CREATING A CHARACTER:');
  });

  it('counts the design points down from twenty-four on the screen itself', () => {
    const session = new RollerSession(ROLLER_PORT, 20);
    session.answer(0);
    session.answer(0);
    session.answer(0);
    session.answer(2);
    expect(session.view().question).toBe('designStat');
    expect(showing(session.view())).toContain('24');
    session.answer(0);
    expect(showing(session.view())).toContain('23');
    expect(showing(session.view())).toContain('CHARACTERISTIC POINTS LEFT: ');
    for (let i = 0; i < 22; i++) session.answer(0);
    expect(showing(session.view())).toContain('1');
    session.answer(0);
    expect(session.view().question).toBe('name');
  });

  it('rolls another character when the design screen is escaped', () => {
    const session = new RollerSession(ROLLER_PORT, 20);
    session.answer(0);
    session.answer(0);
    session.answer(0);
    session.answer(2);
    session.answer(6);
    expect(session.view().question).toBe('keepRerollDesign');
    expect(showing(session.view())).toContain('RACE: HUMANOID');
  });

  it('records the character against the number it was told to use', () => {
    const session = new RollerSession(ROLLER_PORT, 27);
    session.answer(0);
    session.answer(0);
    session.answer(0);
    session.answer(0);
    session.answer('HERO');
    session.answer(0);
    session.answer(0);
    expect(session.view().question).toBe(null);
    expect(session.slot).toBe(27);
  });

  it('leaves the finished character and the class list on the screen at the end', () => {
    const session = new RollerSession(ROLLER_PORT, 20);
    for (const answer of [0, 0, 0, 0, 'HERO', 3, 0]) session.answer(answer);
    const view = session.view();
    expect(view.question).toBe(null);
    expect(showing(view)).toContain('CLASS: WIZARD');
    expect(showing(view)).toContain(`SPELL POINTS: ${view.pc.maxSp}    HEALTH POINTS: ${view.pc.maxHp}`);
    expect(showing(view)).toContain("4) WIZARD: DOESN'T FIGHT WELL BUT GETS MORE SPELLS THAN ANY OTHER CLASS.");
  });

  it('goes back to the first screen when it is restarted', () => {
    const session = new RollerSession(ROLLER_PORT, 20);
    session.answer(0);
    session.answer(0);
    session.answer(3);
    session.restart();
    expect(session.view().question).toBe('difficulty');
    expect(showing(session.view())[0]).toBe('PLEASE SELECT ONE:');
  });
});

describe('a roll started on the wall clock', () => {
  /** The six characteristics, the age and the weight: everything roll_char's dice decide. */
  function rolled(second: number): number[] {
    const session = new RollerSession(ROLLER_PORT, 20, () => second);
    for (const answer of [0, 0, 5, 0, 'HERO', 3, 0]) session.answer(answer);
    const pc = session.view().pc;
    return [pc.str, pc.iq, pc.wis, pc.con, pc.dex, pc.luck, pc.age, pc.weight];
  }

  it('makes the same character twice in one second and another the next', () => {
    expect(rolled(1_757_000_000)).toEqual(rolled(1_757_000_000));
    expect(rolled(1_757_000_001)).not.toEqual(rolled(1_757_000_000));
  });

  it('keeps the second beside the character, which is what the roll is made of', () => {
    const session = new RollerSession(ROLLER_PORT, 20, () => 1_757_000_000);
    expect(session.rolledAt).toBe(1_757_000_000);
    expect(new RollerSession(ROLLER_PORT, 20).rolledAt).toBeNull();
  });

  it('reads the clock again for the character rolled after a restart', () => {
    let second = 1_757_000_000;
    const session = new RollerSession(ROLLER_PORT, 20, () => second);
    second += 1;
    session.restart();
    expect(session.rolledAt).toBe(1_757_000_001);
  });
});
