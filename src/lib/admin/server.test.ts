import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app-state.svelte';
import {
  askWhetherAdmin,
  flagAnotherAdmin,
  forgetCharacter,
  loadCharacters,
  openNewEndlessWorld,
  whoAmI,
} from './server';

/** A browser holding the words, or holding none. `player.ts` reads them straight out of the
 *  store, so the store is the whole of what has to stand in for a browser here. */
function browserKeeping(passphrase: string | null): void {
  const items = new Map<string, string>();
  if (passphrase !== null) items.set('moraff-tools.passphrase', passphrase);
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      get length() {
        return items.size;
      },
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      key: (index: number) => [...items.keys()][index] ?? null,
      removeItem: (key: string) => void items.delete(key),
      setItem: (key: string, value: string) => void items.set(key, value),
    },
    configurable: true,
    writable: true,
  });
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

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  app.admin = null;
});

describe('whoAmI', () => {
  it('says the name the server knows the admin by, and says the words in a header', async () => {
    browserKeeping('acid acorn acre afar affix aged');
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    const { calls } = fakeServer(200, { admin: true, name: 'John' });

    expect(await whoAmI()).toBe('John');
    expect(calls[0].url).toBe('https://runs.example.com/admin/me');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      'Bearer acid acorn acre afar affix aged',
    );
  });

  it('is nobody when the words are nobody’s, which the server answers as no such endpoint', async () => {
    browserKeeping('these six words are not anybody');
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(404, { error: 'No such endpoint: /admin/me' });

    expect(await whoAmI()).toBeNull();
  });

  it('is nobody, and asks nobody, when the browser keeps no words', async () => {
    browserKeeping(null);
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    const { calls } = fakeServer(200, { admin: true, name: 'John' });

    expect(await whoAmI()).toBeNull();
    expect(calls).toEqual([]);
  });

  it('is nobody, and asks nobody, in a build with no run server', async () => {
    browserKeeping('acid acorn acre afar affix aged');
    vi.stubEnv('VITE_RUN_SERVER', '');
    const { calls } = fakeServer(200, { admin: true, name: 'John' });

    expect(await whoAmI()).toBeNull();
    expect(calls).toEqual([]);
  });

  it('is nobody when the server cannot be reached', async () => {
    browserKeeping('acid acorn acre afar affix aged');
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    expect(await whoAmI()).toBeNull();
  });
});

describe('holding the answer where the tabs read it', () => {
  it('names the admin, so the Admin tab is drawn without the page being loaded again', async () => {
    browserKeeping('acid acorn acre afar affix aged');
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(200, { admin: true, name: 'John' });

    await askWhetherAdmin();

    expect(app.admin).toBe('John');
  });

  it('takes the name away again when the words have stopped being an admin’s', async () => {
    browserKeeping('acid acorn acre afar affix aged');
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(404, { error: 'No such endpoint: /admin/me' });
    app.admin = 'John';

    await askWhetherAdmin();

    expect(app.admin).toBeNull();
  });
});

describe('the list of every character here', () => {
  it('asks for the page it was given', async () => {
    browserKeeping('acid acorn acre afar affix aged');
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    const { calls } = fakeServer(200, { page: 2, rows: [], more: false });

    expect(await loadCharacters(2)).toEqual({ ok: true, body: { page: 2, rows: [], more: false } });
    expect(calls[0].url).toBe('https://runs.example.com/admin/characters?page=2');
  });
});

describe('forgetting a character', () => {
  it('deletes it by id, whatever the id has in it', async () => {
    browserKeeping('acid acorn acre afar affix aged');
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    const { calls } = fakeServer(200, { forgotten: 'a b' });

    expect(await forgetCharacter('a b')).toEqual({ ok: true, body: { forgotten: 'a b' } });
    expect(calls[0].url).toBe('https://runs.example.com/admin/characters/a%20b');
    expect(calls[0].init.method).toBe('DELETE');
  });

  it('hands back the words the server refused with', async () => {
    browserKeeping('acid acorn acre afar affix aged');
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(404, { error: 'No character here has that name.' });

    expect(await forgetCharacter('nobody')).toEqual({
      ok: false,
      message: 'No character here has that name.',
    });
  });
});

describe('opening a new endless world', () => {
  it('says the number the admin chose', async () => {
    browserKeeping('acid acorn acre afar affix aged');
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    const { calls } = fakeServer(200, { world: 77 });

    expect(await openNewEndlessWorld(77)).toEqual({ ok: true, body: { world: 77 } });
    expect(calls[0].url).toBe('https://runs.example.com/admin/worlds/endless');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe('{"seed":77}');
  });

  it('asks the server to draw one when the admin chose no number', async () => {
    browserKeeping('acid acorn acre afar affix aged');
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    const { calls } = fakeServer(200, { world: 512 });

    expect(await openNewEndlessWorld(null)).toEqual({ ok: true, body: { world: 512 } });
    expect(calls[0].init.body).toBe('{}');
  });
});

describe('making another player an admin', () => {
  it('sends the name and answers with the one that stands', async () => {
    browserKeeping('acid acorn acre afar affix aged');
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    const { calls } = fakeServer(200, { admin: 'Moraff' });

    expect(await flagAnotherAdmin('moraff')).toEqual({ ok: true, body: { admin: 'Moraff' } });
    expect(calls[0].url).toBe('https://runs.example.com/admin/admins');
    expect(calls[0].init.body).toBe('{"name":"moraff"}');
  });

  it('hands back the words the server refused a name nobody holds with', async () => {
    browserKeeping('acid acorn acre afar affix aged');
    vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
    fakeServer(404, { error: 'Nobody here has that name.' });

    expect(await flagAnotherAdmin('Nobody At All')).toEqual({
      ok: false,
      message: 'Nobody here has that name.',
    });
  });
});
