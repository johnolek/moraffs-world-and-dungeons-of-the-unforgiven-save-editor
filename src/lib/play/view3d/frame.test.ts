import { describe, expect, it } from 'vitest';
import { clearFrame, drawLine, fillRect, newFrame, notePaint, pixelAt, toRgba } from './frame';

describe('the screen the view is drawn on', () => {
  it('starts black', () => {
    const frame = newFrame(4, 3);
    expect(frame.pixels).toHaveLength(12);
    expect([...frame.pixels]).toEqual(Array(12).fill(0));
  });

  it('fills a rectangle with both edges included', () => {
    const frame = newFrame(5, 4);
    fillRect(frame, 1, 1, 3, 2, 7);
    expect([...frame.pixels]).toEqual([0, 0, 0, 0, 0, 0, 7, 7, 7, 0, 0, 7, 7, 7, 0, 0, 0, 0, 0, 0]);
  });

  it('takes a rectangle given corner-first either way round', () => {
    const frame = newFrame(5, 4);
    fillRect(frame, 3, 2, 1, 1, 7);
    expect(pixelAt(frame, 2, 1)).toBe(7);
    expect(pixelAt(frame, 0, 1)).toBe(0);
  });

  it('clips a rectangle that runs off the screen', () => {
    const frame = newFrame(4, 3);
    fillRect(frame, -5, -5, 1, 1, 9);
    expect([...frame.pixels]).toEqual([9, 9, 0, 0, 9, 9, 0, 0, 0, 0, 0, 0]);
  });

  it('turns palette indices into opaque RGBA', () => {
    const frame = newFrame(2, 1);
    frame.pixels[1] = 2;
    const rgba = [...toRgba(frame, [
      [0, 0, 0],
      [1, 1, 1],
      [255, 128, 0],
    ])];
    expect(rgba).toEqual([0, 0, 0, 255, 255, 128, 0, 255]);
  });

  it('writes into a buffer it is handed rather than making one', () => {
    const frame = newFrame(2, 1);
    frame.pixels[0] = 1;
    const out = new Uint8ClampedArray(new ArrayBuffer(8));
    const rgba = toRgba(frame, [[0, 0, 0], [10, 20, 30]], out);
    expect(rgba).toBe(out);
    expect([...out]).toEqual([10, 20, 30, 255, 0, 0, 0, 255]);
  });

  it('leaves a colour off the end of the palette black', () => {
    const frame = newFrame(2, 1);
    frame.pixels[1] = 5;
    expect([...toRgba(frame, [[7, 7, 7]])]).toEqual([7, 7, 7, 255, 0, 0, 0, 255]);
  });
});

describe('the journal of paints', () => {
  it('is kept only by a frame that asked for one', () => {
    const frame = newFrame(4, 3);
    fillRect(frame, 0, 0, 1, 1, 7);
    expect(frame.journal).toBeUndefined();
  });

  it('notes a rectangle fill and a line, clipped to the frame and in order', () => {
    const frame = newFrame(4, 3);
    frame.journal = [];
    fillRect(frame, 3, 2, 1, 1, 7);
    drawLine(frame, 0, 0, 9, 0, 5);
    expect(frame.journal).toEqual([
      { left: 1, top: 1, right: 3, bottom: 2 },
      { left: 0, top: 0, right: 3, bottom: 0 },
    ]);
  });

  it('does not note a paint that lies off the frame', () => {
    const frame = newFrame(4, 3);
    frame.journal = [];
    notePaint(frame, 10, 10, 12, 12);
    expect(frame.journal).toEqual([]);
  });
});

describe('clearing a frame to draw on it again', () => {
  it('blacks every pixel', () => {
    const frame = newFrame(4, 3);
    fillRect(frame, 0, 0, 3, 2, 7);

    clearFrame(frame);

    expect([...frame.pixels]).toEqual(Array.from({ length: 12 }, () => 0));
  });

  it('is the same buffer, which is the point of it', () => {
    const frame = newFrame(4, 3);
    const pixels = frame.pixels;

    expect(clearFrame(frame).pixels).toBe(pixels);
  });

  it('drops the journal rather than emptying it, since a reveal still holds the array', () => {
    const frame = newFrame(4, 3);
    frame.journal = [];
    notePaint(frame, 0, 0, 1, 1);
    const held = frame.journal;

    clearFrame(frame);

    expect(frame.journal).toBeUndefined();
    expect(held).toHaveLength(1);
  });
});
