import { describe, expect, it } from 'vitest';
import { somethingUnread } from './unread.svelte';

const EARLIER = '2026-09-09T21:00:00.000Z';
const LATER = '2026-09-09T22:00:00.000Z';

describe('somethingUnread', () => {
  it('has nothing unread when nothing has been announced', () => {
    expect(somethingUnread(null, null)).toBe(false);
    expect(somethingUnread(null, EARLIER)).toBe(false);
  });

  it('counts anything as unread for a browser that has been shown nothing', () => {
    expect(somethingUnread(EARLIER, null)).toBe(true);
  });

  it('counts an announcement made after the last one seen as unread', () => {
    expect(somethingUnread(LATER, EARLIER)).toBe(true);
  });

  it('counts the announcement last seen, and anything older, as read', () => {
    expect(somethingUnread(EARLIER, EARLIER)).toBe(false);
    expect(somethingUnread(EARLIER, LATER)).toBe(false);
  });

  it('counts anything as unread when the last moment seen is not a date', () => {
    expect(somethingUnread(EARLIER, 'nonsense')).toBe(true);
  });

  it('marks nothing when the newest moment is not a date', () => {
    expect(somethingUnread('nonsense', EARLIER)).toBe(false);
    expect(somethingUnread('nonsense', null)).toBe(false);
  });
});
