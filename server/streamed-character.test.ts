import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RosterEntry } from '../src/lib/app-state.svelte';
import {
  deviceIsAhead,
  entryFromServer,
  readServerRoster,
  readServerRun,
} from '../src/lib/character/server-roster';
import type { RunSession } from '../src/lib/play/run';
import { RunStream, type BatchAnswer, type RunBatch, type StreamedSession } from '../src/lib/play/stream';
import { createRunServer } from './http';
import type { Sql } from './sql';
import { openTestDatabase } from './test-sql';

/**
 * A character played into the server through the sender and read back out through the roster.
 *
 * The two halves are written apart — the site shapes a batch, the server keeps it and hands a
 * roster back — and nothing else here puts them together over a real connection. What this asks
 * is that a character sent by the code the browser runs comes back as the character the browser
 * reads, record, maps and chain, since a field that only one of the two halves believes in would
 * otherwise be missed by both sets of tests.
 */

const CHARACTER = 'k3p9x1-ab12cd';
const ENGINE = 'a'.repeat(40);
const SECRET = 'A'.repeat(43);
const MAPS = '{"0:1":"AQID"}';

/** Enough of the browser's Storage for the secret the site sends. */
function fakeStorage(): Storage {
  const items = new Map<string, string>([['moraff-tools.player-secret', SECRET]]);
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

function sitting(index: number, inputs: number[]): RunSession {
  return {
    engine: ENGINE,
    game: 'unforgiven',
    mode: 'faithful',
    leaderboard: 'faithful',
    sound: null,
    name: 'GRIM',
    startedAt: `2026-09-09T1${index}:00:00.000Z`,
    seed: 12345 + index,
    worldSeed: null,
    record: 'AAEC',
    inputs,
    actions: inputs.length,
    time: inputs.length,
    milestones: [],
    edits: 0,
  };
}

describe('a character streamed to the server and read back off it', () => {
  let sql: Sql;
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    sql = await openTestDatabase();
    server = createRunServer({ allowedOrigin: 'https://johnolek.github.io' }, sql);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage(), configurable: true, writable: true });
    vi.stubEnv('VITE_RUN_SERVER', origin);
    await fetch(`${origin}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ name: 'John' }),
    });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise<void>((resolve, reject) => {
      server.close((thrown) => (thrown ? reject(thrown) : resolve()));
    });
    await sql.close();
  });

  /** The sender as the Play tab starts it, posting to the server over HTTP. */
  function sender(log: RunSession, earlier: RunSession[]): RunStream {
    const streamed: StreamedSession = {
      index: earlier.length,
      log: () => log,
      presses: () => log.inputs.length,
      save: () => ({
        record: 'CQgHBg==',
        maps: MAPS,
        slot: 7,
        dead: false,
        leaderboard: 'faithful',
        lock: 'faithful',
        worldSeed: null,
        createdAt: '2026-09-08T09:00:00.000Z',
        editedAt: '2026-09-09T12:00:00.000Z',
      }),
    };
    return new RunStream(streamed, (batch) => post(batch), earlier);
  }

  async function post(batch: RunBatch): Promise<BatchAnswer> {
    const response = await fetch(`${origin}/runs/${CHARACTER}/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify(batch),
    });
    if (response.ok) return { took: true };
    const said = (await response.json()) as { error?: string; because?: string };
    return { took: false, refusal: said.error ?? null, because: said.because ?? null };
  }

  it('comes back as the character the browser put on its roster', async () => {
    expect(await sender(sitting(0, [104, 106]), []).send(false)).toEqual({ sent: 'taken' });
    // A second sitting, which sends the first again to catch the server up on it.
    expect(await sender(sitting(1, [107]), [sitting(0, [104, 106])]).send(false)).toEqual({ sent: 'taken' });

    const roster = await readServerRoster();

    expect(roster).toHaveLength(1);
    const character = roster![0];
    expect(character).toMatchObject({
      id: CHARACTER,
      game: 'unforgiven',
      name: 'GRIM',
      slot: 7,
      dead: false,
      leaderboard: 'faithful',
      createdAt: '2026-09-08T09:00:00.000Z',
      editedAt: '2026-09-09T12:00:00.000Z',
      record: 'CQgHBg==',
      maps: MAPS,
      leasedElsewhere: false,
    });
    // The roster leaves the keys out and counts them instead, since a chain of Moraff's Revenge
    // is megabytes and every page load would carry every character's.
    expect(character.run.map((session) => session.inputCount)).toEqual([2, 1]);
    expect(character.run.map((session) => session.inputs)).toEqual([[], []]);

    // The device that played it keeps the keys it holds, since the counts say they are the same
    // keys, and is not behind its own run: what came back is what it sent.
    const played = { run: [sitting(0, [104, 106]), sitting(1, [107])], journal: [] } as unknown as RosterEntry;
    const entry = entryFromServer(character, played);
    expect(Array.from(entry!.bytes)).toEqual([9, 8, 7, 6]);
    expect(entry!.run.map((session) => session.inputs)).toEqual([[104, 106], [107]]);
    expect(deviceIsAhead(entry!.run, character.run)).toBe(false);
  });

  it('hands the keys of the chain over when they are asked for', async () => {
    const run = await readServerRun(CHARACTER);

    expect(run?.map((session) => session.inputs)).toEqual([[104, 106], [107]]);
    expect(run?.[0]).toMatchObject({ seed: 12345, record: 'AAEC', engine: ENGINE });
  });

  it('refuses a sitting played from a copy of the character the run has gone past', async () => {
    const elsewhere: RunSession = { ...sitting(1, [111]), startedAt: '2026-09-10T08:00:00.000Z', seed: 999 };

    const sent = await sender(elsewhere, [sitting(0, [104, 106])]).send(false);

    expect(sent).toEqual({
      sent: 'refused',
      words: 'That character has been played on another device since.',
      because: 'moved-on',
    });
  });
});
