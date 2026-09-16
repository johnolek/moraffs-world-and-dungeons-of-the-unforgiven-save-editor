import type { ScreenLine } from '../game/port/state';
import type { BossOffice } from './boss-office';
import type { Fade } from './fade';

/**
 * The delays both games hold a drawn message for — delay (exe 1000:2789) in Dungeons of the
 * Unforgiven and delay (WORLD.EXE 1000:22a2) in Moraff's World — as something a browser tab can
 * keep to.
 *
 * The original stops dead inside those calls: it is not reading the keyboard, no monster moves
 * and nothing about the character changes, so the pause is only ever about what is on the screen.
 * That is what makes it safe to keep here. The game logic runs straight through, and every time
 * it asks for a delay the screen as it stands at that moment is kept as a frame; the frames are
 * then shown in turn, each for as long as the call asked for. Nothing the timer does reaches the
 * game or the loop — it only decides which of the screens the game has already drawn is the one
 * the tab draws now.
 */

/** One screen the game asked to be left up, and how long for. */
interface Frame {
  screen: ScreenLine[];
  ms: number;
  /**
   * What stood in the strip at the top left of Moraff's World's screen when the frame was taken.
   * That strip is not part of the screen the game draws through `print_text` here, so a frame
   * carries it separately; a frame with none shows whatever the game has in it now.
   */
  banner?: string[];
  /**
   * The stone tablet that was on Dungeons of the Unforgiven's screen when the frame was taken,
   * for the same reason: it is a screen of its own rather than a set of drawn lines, and the
   * fade that takes it down runs after the game has already put it away.
   */
  tablet?: string[] | null;
  /**
   * The Shadow boss's office that was on the screen when the frame was taken
   * (`boss-office.ts`), for the same reason the tablet is here: the fade that brings the office
   * up out of black runs over a frame whose office has none of the taunt's words on it, so the
   * words appear when the frame is released rather than rising with the stone.
   */
  bossOffice?: BossOffice | null;
  /** The palette fade this frame is the screen for (`fade.ts`), or none. */
  fade?: Fade;
}

/** What a frame carries beside the lines on the screen. */
export type FrameExtras = Pick<Frame, 'banner' | 'tablet' | 'bossOffice' | 'fade'>;

export class TimedScreens {
  /** The frames still to show, oldest first. The one being shown is not among them. */
  private queue: Frame[] = [];
  private current: Frame | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The one pause that is not a frame: see {@link after}. */
  private pause: ReturnType<typeof setTimeout> | null = null;

  /** @param changed tell the tab to draw, which is how a frame reaches the screen. */
  constructor(private readonly changed: () => void) {}

  /** Whether a frame is being shown, so that the live screen is not what the tab draws. */
  get holding(): boolean {
    return this.current !== null;
  }

  /** The game has drawn something and asked for the screen to be left as it is. */
  hold(screen: ScreenLine[], ms: number, extras: FrameExtras = {}): void {
    if (ms <= 0) return;
    this.queue.push({
      screen: screen.map((line) => ({ ...line })),
      ms,
      banner: extras.banner?.slice(),
      tablet: extras.tablet?.slice(),
      bossOffice: extras.bossOffice,
      fade: extras.fade,
    });
    if (this.current === null) this.next();
  }

  /** What the tab draws: the frame being shown, or the screen the game has now. */
  showing(screen: ScreenLine[]): ScreenLine[] {
    return this.current === null ? screen : this.current.screen;
  }

  /** The same for the strip a fight writes on, for a frame that was taken with one of its own. */
  showingBanner(banner: string[]): string[] {
    return this.current?.banner ?? banner;
  }

  /** The same for the stone tablet, which a fade holds on the screen after the game has put it
   *  away. */
  showingTablet(tablet: string[] | null): string[] | null {
    return this.current?.tablet ?? tablet;
  }

  /** The same for the Shadow boss's office, which the fade that brings it out of black holds on
   *  the screen without the taunt's words on it. */
  showingBossOffice(office: BossOffice | null): BossOffice | null {
    return this.current?.bossOffice ?? office;
  }

  /** The fade the frame being shown is the screen for, or null when nothing is fading. */
  showingFade(): Fade | null {
    return this.current?.fade ?? null;
  }

  /**
   * Take every line inside a rectangle off the frames as well as off the screen.
   *
   * A frame is a picture of a screen the game has already moved on from, and the tab draws the
   * message box the game has *now* over it. So a wipe that the box the tab is drawing made has to
   * reach the frames too, or the tab draws a line the game took away underneath a box that was
   * never behind it.
   */
  wipe(x0: number, y0: number, x1: number, y1: number): void {
    const outside = (line: ScreenLine): boolean =>
      !(line.x >= x0 && line.x < x1 && line.y >= y0 && line.y < y1);
    if (this.current !== null) this.current.screen = this.current.screen.filter(outside);
    for (const frame of this.queue) frame.screen = frame.screen.filter(outside);
  }

  /**
   * A key has been pressed: the rest of the delays are given up at once and the screen the game
   * has now is what shows, which is where the original would have been by the time it looked at
   * the keyboard again.
   */
  release(): void {
    if (this.current === null) return;
    this.stop();
    this.changed();
  }

  /**
   * The other pause the original holds the screen for, which changes what is on it rather than
   * keeping what was: `FUN_2000_3e73` (exe 2000:3e73) blanks the HIT ANY KEY plaque's rectangle,
   * counts 330 ms out in `delay` (exe 1000:2789) with that hole in the screen, and draws the
   * plaque on it afterwards.
   *
   * It lives here because it is a display timer like the frames are — the game runs straight past
   * it — and because a session that is finished with then drops it along with them. Only one is
   * ever running, so a second replaces the first.
   */
  after(ms: number, then: () => void): void {
    this.cancelAfter();
    this.pause = setTimeout(() => {
      this.pause = null;
      then();
    }, ms);
  }

  /** Give up a pause that has not finished, because what it was waiting to show is not wanted. */
  cancelAfter(): void {
    if (this.pause !== null) clearTimeout(this.pause);
    this.pause = null;
  }

  /** Drop the timers without drawing, for a session that is finished with. */
  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.queue = [];
    this.cancelAfter();
  }

  /** Show the next frame, or hand the screen back to the game when there are none left. */
  private next(): void {
    this.current = this.queue.shift() ?? null;
    if (this.current === null) {
      this.timer = null;
      this.changed();
      return;
    }
    this.timer = setTimeout(() => this.next(), this.current.ms);
    this.changed();
  }
}
