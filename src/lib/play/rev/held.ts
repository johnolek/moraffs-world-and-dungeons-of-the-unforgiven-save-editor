import type { Frame } from '../view3d/frame';

/**
 * The screens Moraff's Revenge leaves up for a moment, as something a browser tab can keep to.
 *
 * 1000:2F1A is the whole of the game's wait:
 *
 * ```
 * T = TIMER: WHILE TIMER - T < 2: WEND
 * ```
 *
 * and 1000:2F35 calls it twice, so every message the game holds is held for two seconds or for
 * four. Inside that loop the game reads no keys, draws nothing and touches nothing of the
 * character's: the wait is only ever about giving the player time to read what is on the screen.
 * That is what makes it safe to keep here. The port's loop runs straight past the wait, and the
 * screen as it stood at that moment is kept as a frame; the frames are shown in turn, each for
 * as long as the call asked for, and a key gives up whatever is left — which is where the
 * original would have been by the time it looked at the keyboard again.
 *
 * A frame is the drawn screen rather than the game it was drawn from, because the port works the
 * whole screen out afresh from the game every time it draws and the game has moved on by then.
 * It is also what freezes the level: the monsters' clock goes on running while a frame is up
 * (`clock.ts`), so they walk about behind a screen that does not show it, the way the original's
 * busy loop leaves the screen alone.
 *
 * The other two games hold their frames in `../timed.ts`. That class holds a list of drawn lines
 * along with Dungeons of the Unforgiven's stone tablet, Moraff's World's banner strip and the
 * palette fades, and its `wipe` reaches into those lines; this game has none of them and a screen
 * of colour indexes rather than lines, so what the two share is the queue and the timer.
 */

/** 1000:2F1A: how long the game holds a message it wants read, in milliseconds. */
export const REV_TWO_SECONDS = 2000;

/** 1000:2F35: the same wait twice over, which is what the longer messages get. */
export const REV_FOUR_SECONDS = 4000;

/** One screen the game asked to be left up, and how long for. */
interface RevHeldFrame {
  screen: Frame;
  ms: number;
  /**
   * The message lines and the fight's lines as they stood when the frame was taken.
   *
   * They are already drawn into the frame. They are kept beside it as well because the tab can
   * show the site's own map instead of the game's screen, and a message held for two seconds
   * there has to last the two seconds too.
   */
  box: string[];
  banner: string[];
}

export class RevHeldScreens {
  /** The frames still to show, oldest first. The one being shown is not among them. */
  private queue: RevHeldFrame[] = [];
  private current: RevHeldFrame | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Everything waiting for the screen to come back to the game: see {@link drained}. */
  private waiting: (() => void)[] = [];

  /** @param changed tell the tab to draw, which is how a frame reaches the screen. */
  constructor(private readonly changed: () => void) {}

  /** Whether a frame is being shown, so that the live screen is not what the tab draws. */
  get holding(): boolean {
    return this.current !== null;
  }

  /** The game has drawn something and asked for the screen to be left as it is. */
  hold(screen: Frame, ms: number, box: string[], banner: string[]): void {
    if (ms <= 0) return;
    this.queue.push({ screen, ms, box: box.slice(), banner: banner.slice() });
    if (this.current === null) this.next();
  }

  /**
   * Resolved once no frame is being held, which is where the game can look at the keyboard
   * again. It is what a key read waits on outside debug (`KeyedSession.key`).
   */
  drained(): Promise<void> {
    if (this.current === null) return Promise.resolve();
    return new Promise((wake) => this.waiting.push(wake));
  }

  /** The frame the tab is to draw, or null when the screen is the game's own as it stands. */
  showing(): Frame | null {
    return this.current?.screen ?? null;
  }

  /** The same for the two lists of words, for a tab that is showing its own map instead. */
  showingBox(box: string[]): string[] {
    return this.current?.box ?? box;
  }

  showingBanner(banner: string[]): string[] {
    return this.current?.banner ?? banner;
  }

  /** A key has been pressed: the rest of the frames are given up at once. */
  release(): void {
    if (this.current === null) return;
    this.stop();
    this.changed();
  }

  /** Drop the timer without drawing, for a session that is finished with. */
  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.queue = [];
    this.wakeWhoeverIsWaiting();
  }

  /** Show the next frame, or hand the screen back to the game when there are none left. */
  private next(): void {
    this.current = this.queue.shift() ?? null;
    if (this.current === null) {
      this.timer = null;
      this.wakeWhoeverIsWaiting();
      this.changed();
      return;
    }
    this.timer = setTimeout(() => this.next(), this.current.ms);
    this.changed();
  }

  /** The screen is the game's own again, so every key read held behind it goes on. A session
   *  that was stopped wakes them too, or a loop it dropped would wait for ever. */
  private wakeWhoeverIsWaiting(): void {
    const waiting = this.waiting;
    this.waiting = [];
    for (const wake of waiting) wake();
  }
}
