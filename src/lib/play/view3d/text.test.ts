import { describe, expect, it } from 'vitest';
import type { ScreenLine } from '../../game/port/state';
import { SCREEN_PIXELS } from '../display';
import { newFrame, type Frame } from './frame';
import { pixelDifference } from './frame.test-support';
import { drawBitmapLine } from './menu-font';
import { drawStrokeScreenLine } from './stroke-font';
import { drawDotuScreenText } from './text';

const screen = SCREEN_PIXELS;

const drawn = (lines: ScreenLine[]): Frame => {
  const frame = newFrame(screen.width, screen.height);
  drawDotuScreenText(frame, screen, lines);
  return frame;
};

/** The pixels one drawer of its own puts on a frame, to compare a screen line against. */
function only(draw: (frame: Frame) => void): Frame {
  const frame = newFrame(screen.width, screen.height);
  draw(frame);
  return frame;
}

const lit = (frame: Frame): number => frame.pixels.reduce((count, pixel) => count + (pixel === 0 ? 0 : 1), 0);

describe('the game screen text', () => {
  it('draws a plain line in the vector font of the 1024 by 768 mode', () => {
    const line: ScreenLine = { text: 'HEALTH POINTS:20 OF 20', x: 0x0a, y: 0x483, font: 0, colour: 8 };
    expect(
      pixelDifference(drawn([line]).pixels, only((frame) => drawStrokeScreenLine(frame, screen, 'dotu', line)).pixels),
    ).toBeNull();
  });

  it('draws a key menu line in the .FNT face the menu asks for', () => {
    const spreadTo = 0x126;
    const line: ScreenLine = { text: ' AST SPELL    ', x: 9, y: 0x07d, font: 2, colour: 8, spreadTo, bitmapFace: true };
    const menu = only((frame) => drawBitmapLine(frame, screen, line));
    expect(pixelDifference(drawn([line]).pixels, menu.pixels)).toBeNull();
    // The two faces are nothing alike: the strokes of the same string cover far more of the screen.
    expect(lit(only((frame) => drawStrokeScreenLine(frame, screen, 'dotu', line)))).toBeGreaterThan(lit(menu));
  });

  it('draws a value beside its label as the second call the game makes', () => {
    const label: ScreenLine = { text: 'STRENGTH: ', x: 0, y: 100, font: 1, colour: 6, value: '25', valueX: 0x212 };
    const both = drawn([label]);
    const alone = drawn([{ text: label.text, x: label.x, y: label.y, font: label.font, colour: label.colour }]);
    expect(lit(both)).toBeGreaterThan(lit(alone));
    const expected = only((frame) => {
      drawStrokeScreenLine(frame, screen, 'dotu', label);
      drawStrokeScreenLine(frame, screen, 'dotu', { ...label, text: '25', x: 0x212 });
    });
    expect(pixelDifference(both.pixels, expected.pixels)).toBeNull();
  });

  it('draws the lines in the order the game drew them', () => {
    const at = (text: string, colour: number): ScreenLine => ({ text, x: 0x0a, y: 0x410, font: 0, colour });
    const over = drawn([at('OOOO', 4), at('OOOO', 8)]);
    expect(
      pixelDifference(over.pixels, only((frame) => drawStrokeScreenLine(frame, screen, 'dotu', at('OOOO', 8))).pixels),
    ).toBeNull();
  });
});
