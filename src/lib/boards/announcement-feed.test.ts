import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Announcement } from '../../../server/announcing';
import { announcementsShowing, latestAnnouncement, latestArrival } from './announcement-feed.svelte';

const SERVER = 'https://runs.example.com';

function said(id: number): Announcement {
  return {
    id,
    characterId: 'grond',
    kind: 'level',
    which: id,
    game: 'unforgiven',
    leaderboard: 'speedrun',
    player: 'Moraff',
    name: 'Grond',
    actions: 10,
    time: 20,
    floor: 3,
    dungeon: 1,
    level: id,
    playMs: 1000,
    at: '2026-09-09T21:00:00.000Z',
  };
}

/** `EventSource` as a test can drive it: every feed opened, and what arrives down the newest of
 *  them. */
class FakeEventSource {
  static readonly CLOSED = 2;
  static opened: string[] = [];
  static newest: FakeEventSource | null = null;

  readyState = 1;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    FakeEventSource.opened.push(url);
    FakeEventSource.newest = this;
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  /** The server has announced something down this feed. */
  announce(announcement: Announcement): void {
    this.onmessage?.({ data: JSON.stringify(announcement) } as MessageEvent<string>);
  }
}

const asked: string[] = [];

describe('the announcements the page follows', () => {
  beforeAll(async () => {
    vi.stubEnv('VITE_RUN_SERVER', SERVER);
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url);
      const history = { announcements: [said(8), said(7)], more: true };
      return Promise.resolve(new Response(JSON.stringify(history), { status: 200 }));
    });

    // Both the footer and the panel read the store, and whichever reads it first opens the feed.
    announcementsShowing();
    latestAnnouncement();
    await vi.waitFor(() => expect(announcementsShowing().announcements.length).toBe(2));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('opens one feed and reads the history once, however many places read it', () => {
    expect(FakeEventSource.opened).toEqual([`${SERVER}/feed`]);
    expect(asked).toEqual([`${SERVER}/announcements`]);
  });

  it('shows the history it read, newest first', () => {
    expect(announcementsShowing().announcements.map((each) => each.id)).toEqual([8, 7]);
    expect(announcementsShowing().more).toBe(true);
  });

  it('is asked for the newest one', () => {
    expect(latestAnnouncement()?.id).toBe(8);
  });

  it('has had nothing arrive while only the history has been read', () => {
    expect(latestArrival()).toBe(null);
  });

  it('puts one that arrives down the feed in front of the rest', () => {
    FakeEventSource.newest?.announce(said(9));

    expect(announcementsShowing().announcements.map((each) => each.id)).toEqual([9, 8, 7]);
    expect(latestAnnouncement()?.id).toBe(9);
  });

  it('says which one arrived down the feed', () => {
    expect(latestArrival()?.id).toBe(9);
  });

  it('still has older ones to ask for after one has arrived', () => {
    expect(announcementsShowing().more).toBe(true);
  });
});
