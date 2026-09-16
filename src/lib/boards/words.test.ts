import { describe, expect, it } from 'vitest';
import { agoWords } from './words';

const NOW = new Date('2026-09-16T12:00:00Z');

/** A moment the given number of minutes before {@link NOW}, as the server sends one. */
function minutesBefore(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60000).toISOString();
}

describe('how long ago something was said', () => {
  it('is just now under a minute', () => {
    expect(agoWords(minutesBefore(0.9), NOW)).toBe('just now');
  });

  it('counts the minutes', () => {
    expect(agoWords(minutesBefore(1), NOW)).toBe('1 minute ago');
    expect(agoWords(minutesBefore(59), NOW)).toBe('59 minutes ago');
  });

  it('counts the hours', () => {
    expect(agoWords(minutesBefore(60), NOW)).toBe('1 hour ago');
    expect(agoWords(minutesBefore(60 * 23), NOW)).toBe('23 hours ago');
  });

  it('counts the days', () => {
    expect(agoWords(minutesBefore(60 * 24), NOW)).toBe('1 day ago');
    expect(agoWords(minutesBefore(60 * 24 * 6), NOW)).toBe('6 days ago');
  });

  it('is the date it happened on once it is a week old', () => {
    const week = minutesBefore(60 * 24 * 7);

    expect(agoWords(week, NOW)).toBe(new Date(week).toLocaleDateString());
  });

  it('is just now when the moment is ahead of the reader by a little', () => {
    expect(agoWords(minutesBefore(-2), NOW)).toBe('just now');
  });

  it('is the moment as it came when it is not one', () => {
    expect(agoWords('whenever', NOW)).toBe('whenever');
  });
});
