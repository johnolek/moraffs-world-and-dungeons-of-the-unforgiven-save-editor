import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  claimName,
  myName,
  myPassphrase,
  newPassphrase,
  offTheBoards,
  playerSecret,
  setOffTheBoards,
  signIn,
} from './player';

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

function useStorage(storage: Storage | undefined): Storage | undefined {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  return storage;
}

/** A server that answers every call the same way, and the calls it was handed. */
function fakeServer(status: number, body: unknown): { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });
  return { calls };
}

function headerOf(init: RequestInit, name: string): string | undefined {
  return (init.headers as Record<string, string> | undefined)?.[name];
}

afterEach(() => {
  useStorage(undefined);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('playerSecret', () => {
  it('makes a secret of 32 bytes on first use and keeps it', () => {
    const storage = useStorage(fakeStorage())!;

    const secret = playerSecret();

    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storage.getItem('moraff-tools.player-secret')).toBe(secret);
    expect(playerSecret()).toBe(secret);
  });

  it('makes a fresh one when the browser keeps nothing', () => {
    useStorage(undefined);

    expect(playerSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('replaces something in the key that is not a secret', () => {
    const storage = useStorage(fakeStorage())!;
    storage.setItem('moraff-tools.player-secret', 'nonsense');

    expect(playerSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('the opt-out from the boards', () => {
  it('is off until the player says otherwise', () => {
    useStorage(fakeStorage());

    expect(offTheBoards()).toBe(false);
  });

  it('is kept beside the secret, and comes back the next visit', () => {
    const storage = useStorage(fakeStorage())!;

    setOffTheBoards(true);

    expect(storage.getItem('moraff-tools.off-the-boards')).toBe('yes');
    expect(offTheBoards()).toBe(true);
  });

  it('is taken out of the store again when the player comes back on to the boards', () => {
    const storage = useStorage(fakeStorage())!;
    setOffTheBoards(true);

    setOffTheBoards(false);

    expect(storage.getItem('moraff-tools.off-the-boards')).toBeNull();
    expect(offTheBoards()).toBe(false);
  });

  it('is off in a browser that keeps nothing', () => {
    useStorage(undefined);

    setOffTheBoards(true);

    expect(offTheBoards()).toBe(false);
  });
});

describe('the passphrase this browser keeps', () => {
  it('is nothing until the browser has learned one', () => {
    useStorage(fakeStorage());

    expect(myPassphrase()).toBeNull();
  });

  it('is the words a claim that made a player was handed', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(200, { name: 'Moraff', passphrase: 'acid acorn acre afar affix aged' });

    await claimName('Moraff');

    expect(myPassphrase()).toBe('acid acorn acre afar affix aged');
  });

  it('is the words a sign-in proved, since the server cannot say them again', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(200, { name: 'Moraff' });

    await signIn('Moraff', 'acid acorn acre afar affix aged');

    expect(myPassphrase()).toBe('acid acorn acre afar affix aged');
  });

  it('is the newly drawn words once the player draws some', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(200, { passphrase: 'bold botch bough bound bowl boxcar' });

    await newPassphrase();

    expect(myPassphrase()).toBe('bold botch bough bound bowl boxcar');
  });

  it('is left alone by a sign-in the server refused', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(401, { error: 'That name and passphrase do not go together.' });

    await signIn('Moraff', 'wrong words here at all');

    expect(myPassphrase()).toBeNull();
  });
});

describe('claimName', () => {
  it('does nothing and says so when the build has no server', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', '');
    const { calls } = fakeServer(200, { name: 'Moraff' });

    expect(await claimName('Moraff')).toEqual({ ok: false, message: expect.any(String) });
    expect(calls).toEqual([]);
  });

  it('sends the name with the secret and answers with the name that stands', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    const { calls } = fakeServer(200, { name: 'Moraff' });

    expect(await claimName('Moraff')).toEqual({ ok: true, name: 'Moraff', passphrase: null });
    expect(calls[0].url).toBe('https://runs.example.com/players');
    expect(headerOf(calls[0].init, 'Authorization')).toBe(`Bearer ${playerSecret()}`);
    expect(calls[0].init.body).toBe('{"name":"Moraff"}');
  });

  it('carries the passphrase back when the claim made a player', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(200, { name: 'Moraff', passphrase: 'acid acorn acre afar affix aged' });

    expect(await claimName('Moraff')).toEqual({
      ok: true,
      name: 'Moraff',
      passphrase: 'acid acorn acre afar affix aged',
    });
  });

  it('shows the words the server refused with', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(409, { error: 'That name is taken.' });

    expect(await claimName('Moraff')).toEqual({ ok: false, message: 'That name is taken.' });
  });

  it('says so when the server cannot be reached', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    expect(await claimName('Moraff')).toEqual({ ok: false, message: expect.any(String) });
  });
});

describe('myName', () => {
  it('is the name the server has for this secret', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    const { calls } = fakeServer(200, { name: 'Moraff' });

    expect(await myName()).toBe('Moraff');
    expect(calls[0].url).toBe('https://runs.example.com/players/me');
    expect(headerOf(calls[0].init, 'Authorization')).toBe(`Bearer ${playerSecret()}`);
  });

  it('is nothing when the secret has claimed no name', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(404, { error: 'This device has no name yet.' });

    expect(await myName()).toBeNull();
  });

  it('is nothing, and asks nobody, when the build has no server', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', '');
    const { calls } = fakeServer(200, { name: 'Moraff' });

    expect(await myName()).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('signIn', () => {
  it('says the name and the passphrase, and answers with the name that stands', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    const { calls } = fakeServer(200, { name: 'Moraff' });

    expect(await signIn('Moraff', 'acid acorn acre afar affix aged')).toEqual({
      ok: true,
      name: 'Moraff',
      passphrase: null,
    });
    expect(calls[0].url).toBe('https://runs.example.com/players/sign-in');
    expect(headerOf(calls[0].init, 'Authorization')).toBe(`Bearer ${playerSecret()}`);
    expect(calls[0].init.body).toBe('{"name":"Moraff","passphrase":"acid acorn acre afar affix aged"}');
  });

  it('shows the words the server refused with', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(401, { error: 'That name and passphrase do not go together.' });

    expect(await signIn('Moraff', 'wrong words here at all')).toEqual({
      ok: false,
      message: 'That name and passphrase do not go together.',
    });
  });
});

describe('newPassphrase', () => {
  it('asks the server for one and answers with the words', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    const { calls } = fakeServer(200, { passphrase: 'acid acorn acre afar affix aged' });

    expect(await newPassphrase()).toEqual({ ok: true, passphrase: 'acid acorn acre afar affix aged' });
    expect(calls[0].url).toBe('https://runs.example.com/players/passphrase');
    expect(headerOf(calls[0].init, 'Authorization')).toBe(`Bearer ${playerSecret()}`);
  });

  it('shows the words the server refused with', async () => {
    useStorage(fakeStorage());
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(403, { error: 'This device has no name yet.' });

    expect(await newPassphrase()).toEqual({ ok: false, message: 'This device has no name yet.' });
  });
});
