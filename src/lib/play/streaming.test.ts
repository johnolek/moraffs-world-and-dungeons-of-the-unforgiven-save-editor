import { afterEach, describe, expect, it, vi } from 'vitest';
import { setOffTheBoards } from '../player';
import type { RunSession } from './run';
import { runIsBeingSent, streamRun, type RunMark } from './streaming';
import type { StreamedSession } from './stream';

/** Enough of the browser's Storage to stand in for it. */
function fakeStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => void items.delete(key),
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

/** Enough of `window` for the sender to hang its pagehide listener on, since these tests run
 *  under Node and there is no browser here. */
function fakeWindow(): void {
  vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined });
}

function sitting(): StreamedSession {
  const log: RunSession = {
    engine: 'a'.repeat(40),
    game: 'unforgiven',
    mode: 'speedrun',
    leaderboard: 'speedrun',
    sound: null,
    name: 'Grond',
    startedAt: '2026-09-09T12:00:00.000Z',
    seed: 12345,
    worldSeed: null,
    record: 'AAEC',
    inputs: [104, 106],
    actions: 2,
    time: 4,
    milestones: [],
    edits: 0,
  };
  return {
    index: 0,
    log: () => log,
    presses: () => 2,
    save: () => ({
      record: 'AAED',
      maps: null,
      slot: 21,
      dead: false,
      leaderboard: 'speedrun',
      lock: 'speedrun',
      worldSeed: null,
      createdAt: '2026-09-09T11:00:00.000Z',
      editedAt: '2026-09-09T12:00:00.000Z',
    }),
  };
}

/** What a test's server answers a batch with. */
type Answer = () => Response;

const TAKEN: Answer = () => new Response(JSON.stringify({ received: 0 }), { status: 200 });

/** A sender pointed at a server, and what the Play tab was told. */
function sender(
  answer: Answer = TAKEN,
  over: Partial<Parameters<typeof streamRun>[0]> = {},
): { stop(): void; posts: string[]; marks: RunMark[]; movedOn: number } {
  const posts: string[] = [];
  vi.stubGlobal('fetch', (url: string) => {
    posts.push(url);
    return Promise.resolve(answer());
  });
  const marks: RunMark[] = [];
  const told = { movedOn: 0 };
  const streamer = streamRun({
    characterId: 'k3p9x1-ab12cd',
    session: sitting(),
    earlier: [],
    mode: () => 'faithful',
    onMark: (mark) => marks.push(mark),
    movedOn: () => (told.movedOn += 1),
    ...over,
  });
  if (streamer === null) throw new Error('The build under test has no run server.');
  return {
    stop: () => streamer.stop(),
    posts,
    marks,
    get movedOn() {
      return told.movedOn;
    },
  };
}

/** The sender posts from an async method, so a turn of the microtask queue is what it takes for
 *  a batch to have gone out. */
function settled(): Promise<void> {
  return new Promise((wake) => setTimeout(wake, 0));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** A browser with a store, a window to hang a listener on and a server to send to, which is what
 *  the sender needs before it will do anything at all. */
function browser(): void {
  Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage(), configurable: true, writable: true });
  fakeWindow();
  vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
}

describe('sending a character that is on no board', () => {
  it('sends it all the same, and says it is being saved rather than sent to the boards', async () => {
    browser();
    setOffTheBoards(false);

    const run = sender(TAKEN, { mode: () => 'debug' });
    run.stop();
    await settled();

    expect(run.posts).toEqual(['https://runs.example.com/runs/k3p9x1-ab12cd/batches']);
  });
});

describe('a character played on another device since', () => {
  it('says so and asks for the server’s copy', async () => {
    browser();
    setOffTheBoards(false);
    const movedOn: Answer = () =>
      new Response(JSON.stringify({ error: 'That character has been played on another device since.', because: 'moved-on' }), {
        status: 409,
      });

    const run = sender(movedOn);
    run.stop();
    await settled();

    expect(run.movedOn).toBe(1);
    expect(run.marks[run.marks.length - 1]).toEqual({
      words: 'This character was played elsewhere.',
      note: 'The copy here has been replaced with the one from the boards.',
      tone: 'bad',
    });
  });

  it('shows the words of any other refusal and leaves the copy here alone', async () => {
    browser();
    setOffTheBoards(false);
    const theirs: Answer = () =>
      new Response(JSON.stringify({ error: 'That character belongs to another player.', because: 'another-player' }), {
        status: 409,
      });

    const run = sender(theirs);
    run.stop();
    await settled();

    expect(run.movedOn).toBe(0);
    expect(run.marks[run.marks.length - 1]).toEqual({
      words: 'The boards refused the run.',
      note: 'That character belongs to another player.',
      tone: 'bad',
    });
  });
});

describe('sending a run while the player is off the boards', () => {
  it('sends nothing at all, and says so', async () => {
    browser();
    setOffTheBoards(true);

    const run = sender();
    run.stop();
    await settled();

    expect(run.posts).toEqual([]);
    expect(run.marks[0]).toEqual({
      words: 'Off the boards.',
      note: 'Nothing about this run is being sent.',
      tone: 'plain',
    });
  });

  it('sends once the player is back on them', async () => {
    browser();
    setOffTheBoards(false);

    const run = sender();
    run.stop();
    await settled();

    expect(run.posts).toEqual(['https://runs.example.com/runs/k3p9x1-ab12cd/batches']);
  });
});

describe('whether a run is being sent', () => {
  it('names the character while the game is going and not once it has been left', () => {
    browser();
    const running = sender();

    expect(runIsBeingSent('k3p9x1-ab12cd')).toBe(true);

    running.stop();
    expect(runIsBeingSent('k3p9x1-ab12cd')).toBe(false);
  });

  it('names no character nobody is playing', () => {
    expect(runIsBeingSent('never-played')).toBe(false);
  });
});
