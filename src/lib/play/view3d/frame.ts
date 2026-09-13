import type { Rgb } from '../../game/dotu-pic.js';

/**
 * The screen the 3-D view is drawn on: one palette index per pixel, the way the game's own video
 * memory held it. Nothing here touches the DOM, so the same code runs under vitest and Node.
 */
export interface Frame {
  width: number;
  height: number;
  /** `height * width` palette indices, row by row. */
  pixels: Uint8Array;
  /**
   * The rectangles the frame was painted in, in the order they were painted, for a tab that
   * wants to show the screen appearing the way the game drew it (`journal.ts`). A frame has one
   * only while such a tab has asked for it; the paints below note nothing otherwise.
   */
  journal?: PaintRect[];
}

/** One rectangle a paint wrote, both edges included, clipped to the frame. */
export interface PaintRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Note a rectangle just painted on a frame that keeps a journal; a rectangle off the frame or
 *  empty is not a paint. */
export function notePaint(frame: Frame, left: number, top: number, right: number, bottom: number): void {
  const journal = frame.journal;
  if (!journal) return;
  const x1 = Math.max(0, Math.min(left, right));
  const x2 = Math.min(frame.width - 1, Math.max(left, right));
  const y1 = Math.max(0, Math.min(top, bottom));
  const y2 = Math.min(frame.height - 1, Math.max(top, bottom));
  if (x1 > x2 || y1 > y2) return;
  journal.push({ left: x1, top: y1, right: x2, bottom: y2 });
}

export const newFrame = (width: number, height: number): Frame => ({
  width,
  height,
  pixels: new Uint8Array(width * height),
});

/**
 * A frame ready to be drawn on again: every pixel black and the journal dropped.
 *
 * A screen is three quarters of a megabyte, and building a new one for every step down a corridor
 * hands the browser enough rubbish to collect every few steps, which the player feels as a stutter.
 * A caller that draws a whole screen at a time keeps its frames and clears them with this instead.
 * The journal is dropped rather than emptied because a reveal already under way is still reading
 * the array it was given.
 */
export function clearFrame(frame: Frame): Frame {
  frame.pixels.fill(0);
  frame.journal = undefined;
  return frame;
}

/** The colour at a pixel, for a test that wants to name one. */
export const pixelAt = (frame: Frame, x: number, y: number): number => frame.pixels[y * frame.width + x];

/** Fill a rectangle, clipped to the frame. `fill_rect` (exe 4000:2a36) with its edges included. */
export function fillRect(frame: Frame, left: number, top: number, right: number, bottom: number, colour: number): void {
  const x1 = Math.max(0, Math.min(left, right));
  const x2 = Math.min(frame.width - 1, Math.max(left, right));
  const y1 = Math.max(0, Math.min(top, bottom));
  const y2 = Math.min(frame.height - 1, Math.max(top, bottom));
  for (let y = y1; y <= y2; y++) frame.pixels.fill(colour, y * frame.width + x1, y * frame.width + x2 + 1);
  notePaint(frame, x1, y1, x2, y2);
}

/** Set one pixel, ignoring anything off the screen. The game's own drivers mostly do not clip. */
export function plot(frame: Frame, x: number, y: number, colour: number): void {
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return;
  frame.pixels[y * frame.width + x] = colour;
}

/** `draw_line` (exe 5000:07eb): a Bresenham line, both ends included. */
export function drawLine(frame: Frame, x1: number, y1: number, x2: number, y2: number, colour: number): void {
  let x = Math.round(x1);
  let y = Math.round(y1);
  const endX = Math.round(x2);
  const endY = Math.round(y2);
  notePaint(frame, x, y, endX, endY);
  const stepX = x < endX ? 1 : -1;
  const stepY = y < endY ? 1 : -1;
  const spanX = Math.abs(endX - x);
  const spanY = -Math.abs(endY - y);
  let error = spanX + spanY;
  for (;;) {
    plot(frame, x, y, colour);
    if (x === endX && y === endY) return;
    const twice = 2 * error;
    if (twice >= spanY) {
      error += spanY;
      x += stepX;
    }
    if (twice <= spanX) {
      error += spanX;
      y += stepY;
    }
  }
}

/**
 * The palette as one opaque RGBA word per index, so the pass below writes a whole pixel with a
 * single store.
 *
 * The words are built by writing the bytes and reading them back as 32-bit numbers, which puts
 * the components in whatever order this machine reads a word in and clamps them exactly the way
 * writing them one at a time would have.
 */
function rgbaLookup(palette: Rgb[]): Uint32Array {
  const bytes = new Uint8ClampedArray(256 * 4);
  for (let index = 0; index < 256; index++) {
    const [r, g, b] = palette[index] ?? [0, 0, 0];
    bytes[index * 4] = r;
    bytes[index * 4 + 1] = g;
    bytes[index * 4 + 2] = b;
    bytes[index * 4 + 3] = 255;
  }
  return new Uint32Array(bytes.buffer);
}

/**
 * The frame as RGBA bytes, ready for an `ImageData` or a PNG.
 *
 * `out` is written in place when it is given, which is how the screens keep one buffer for the
 * life of the canvas instead of leaving three megabytes behind on every keypress. It has to be
 * the frame's own size, and its bytes are all overwritten.
 */
export function toRgba(frame: Frame, palette: Rgb[], out?: Uint8ClampedArray<ArrayBuffer>): Uint8ClampedArray<ArrayBuffer> {
  const pixels = frame.pixels;
  const target = out ?? new Uint8ClampedArray(new ArrayBuffer(pixels.length * 4));
  const lookup = rgbaLookup(palette);
  const words = new Uint32Array(target.buffer, target.byteOffset, pixels.length);
  for (let at = 0; at < pixels.length; at++) words[at] = lookup[pixels[at]];
  return target;
}
