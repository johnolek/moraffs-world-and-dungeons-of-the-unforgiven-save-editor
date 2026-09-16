import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenLine } from '../game/port/state';
import { TimedScreens } from './timed';

const line = (text: string): ScreenLine => ({ text, x: 0x3a2, y: 0x301, font: 0, colour: 8 });

const texts = (lines: ScreenLine[]): string[] => lines.map((drawn) => drawn.text);

describe('TimedScreens', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the live screen while the game has asked for nothing', () => {
    const timed = new TimedScreens(() => {});
    expect(timed.holding).toBe(false);
    expect(texts(timed.showing([line('YOU KILLED IT!')]))).toEqual(['YOU KILLED IT!']);
  });

  it('takes a wiped rectangle off the screens it is holding', () => {
    const timed = new TimedScreens(() => {});
    const onTheBlock = (text: string): ScreenLine => ({ text, x: 0x3a2, y: 0x379, font: 0, colour: 15 });
    timed.hold([line('YOU KILLED IT!'), onTheBlock('IT HAS 50 HEALTH POINTS LEFT')], 1000);
    timed.hold([onTheBlock('IT HAS 40 HEALTH POINTS LEFT')], 1000);
    // The rectangle FUN_2000_2820 wipes, which is the eight lines and not the strip above them.
    timed.wipe(0x398, 0x324, 0x640, 0x4b0);
    expect(texts(timed.showing([]))).toEqual(['YOU KILLED IT!']);
    vi.advanceTimersByTime(1000);
    expect(texts(timed.showing([]))).toEqual([]);
  });

  it('shows each held screen for its own delay and then hands the screen back', () => {
    const timed = new TimedScreens(() => {});
    const live = [line('GOOD NEWS...')];
    timed.hold([line('YOU KILLED IT!')], 1050);
    timed.hold([], 750);
    timed.hold([line('YOU FIND...')], 3000);
    expect(texts(timed.showing(live))).toEqual(['YOU KILLED IT!']);
    vi.advanceTimersByTime(1049);
    expect(texts(timed.showing(live))).toEqual(['YOU KILLED IT!']);
    vi.advanceTimersByTime(1);
    expect(texts(timed.showing(live))).toEqual([]);
    vi.advanceTimersByTime(750);
    expect(texts(timed.showing(live))).toEqual(['YOU FIND...']);
    vi.advanceTimersByTime(3000);
    expect(timed.holding).toBe(false);
    expect(texts(timed.showing(live))).toEqual(['GOOD NEWS...']);
  });

  it('keeps the screen it was handed rather than a reference to it', () => {
    const timed = new TimedScreens(() => {});
    const live = [line('YOU KILLED IT!')];
    timed.hold(live, 1050);
    live.length = 0;
    expect(texts(timed.showing(live))).toEqual(['YOU KILLED IT!']);
  });

  it('gives up every remaining delay at once when a key releases it', () => {
    const timed = new TimedScreens(() => {});
    const live = [line('NOTHING! (HIT ANY KEY)')];
    timed.hold([line('YOU KILLED IT!')], 1050);
    timed.hold([line('YOU FIND...')], 3000);
    timed.release();
    expect(timed.holding).toBe(false);
    expect(texts(timed.showing(live))).toEqual(['NOTHING! (HIT ANY KEY)']);
  });

  it('tells the tab to draw as each screen comes up and as the last one goes', () => {
    let draws = 0;
    const timed = new TimedScreens(() => {
      draws += 1;
    });
    timed.hold([line('YOU KILLED IT!')], 1050);
    expect(draws).toBe(1);
    vi.advanceTimersByTime(1050);
    expect(draws).toBe(2);
  });

  it('ignores a delay of nothing, which is what the high speed option leaves behind', () => {
    const timed = new TimedScreens(() => {});
    timed.hold([line('YOU FIND...')], 0);
    expect(timed.holding).toBe(false);
  });

  it("holds the boss's office without the taunt on it while the fade brings it up", () => {
    const timed = new TimedScreens(() => {});
    const read = { section: 4, lines: ['I HAVE BEEN WATCHING YOU', 'AND I AM NOT IMPRESSED', '', 'THE SHADOW'] };
    timed.hold([], 448, { fade: 'in', bossOffice: { section: 4, lines: [] } });
    expect(timed.showingBossOffice(read)).toEqual({ section: 4, lines: [] });
    expect(timed.showingFade()).toBe('in');
    vi.advanceTimersByTime(448);
    expect(timed.showingBossOffice(read)).toBe(read);
    expect(timed.showingFade()).toBeNull();
  });

  it('leaves the office the game has now to a frame that is about something else', () => {
    const timed = new TimedScreens(() => {});
    const read = { section: 4, lines: ['THE SHADOW'] };
    timed.hold([line('YOU KILLED IT!')], 1050);
    expect(timed.showingBossOffice(read)).toBe(read);
  });
});
