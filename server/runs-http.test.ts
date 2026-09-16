import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { publishEngine } from './engines';
import { createRunServer, type RunAnswer } from './http';
import type { RunBatch } from './runs';
import type { Sql } from './sql';
import { openTestDatabase } from './test-sql';

const ENGINE = 'a'.repeat(40);

/** Two secrets shaped the way the site makes them: 32 bytes base64url, which is 43 characters. */
const MINE = 'A'.repeat(43);
const THEIRS = 'B'.repeat(43);
const UNNAMED = 'C'.repeat(43);
/** A second browser of John's own, signed in with his passphrase. */
const MY_OTHER = 'D'.repeat(43);

const CHARACTER = 'k3p9x1-ab12cd';
/** A character rolled for no board, so nothing about it is ever replayed or checked. */
const PRIVATE = 'p7r2w9-cd56ef';
/** A character the server hears about through an edit rather than through a run. */
const EDITED = 'e5t8u2-gh78ij';

/** The one line the build below writes about every run it replays. */
const STEPPED = { at: 2, floor: 3, module: 0, text: 'Stepped north', event: { kind: 'stepped', dir: 0 } };

/** A build small enough to read, which passes whatever run it is handed and writes one line of
 *  journal about it. */
function fakeEngine(): Uint8Array {
  return Buffer.from(
    `export const ENGINE_COMMIT = '${ENGINE}';\n` +
      `export function verifyRun(log) {\n` +
      `  const newest = log.sessions[log.sessions.length - 1];\n` +
      `  return Promise.resolve({\n` +
      `    status: 'verified', reason: null, notes: [], game: newest.game, name: newest.name,\n` +
      `    mode: newest.mode, leaderboard: newest.leaderboard, sessions: log.sessions.length,\n` +
      `    engine: { played: [newest.engine], build: ENGINE_COMMIT },\n` +
      `    claimed: { actions: newest.actions, time: newest.time, milestones: [] },\n` +
      `    replayed: { actions: newest.actions, time: newest.time, milestones: [] }, ending: null,\n` +
      `    journal: ${JSON.stringify([STEPPED])},\n` +
      `  });\n` +
      `}\n`,
  );
}

function batch(over: Partial<RunBatch> = {}): RunBatch {
  return {
    sessionIndex: 0,
    sequence: 0,
    inputs: [104, 106],
    pressed: 2,
    ending: false,
    claims: { mode: 'speedrun', actions: 2, time: 4, edits: 0, milestones: [] },
    save: {
      record: 'AAED',
      maps: null,
      slot: 21,
      dead: false,
      leaderboard: 'speedrun',
      lock: 'speedrun',
      worldSeed: null,
      endless: null,
      createdAt: '2026-09-08T09:00:00.000Z',
      editedAt: '2026-09-09T12:00:00.000Z',
    },
    ...over,
  };
}

const header = {
  seed: 12345,
  engine: ENGINE,
  game: 'unforgiven',
  leaderboard: 'speedrun',
  sound: null,
  name: 'Grond',
  startedAt: '2026-09-09T12:00:00.000Z',
  record: 'AAEC',
};

describe('streaming a run over HTTP', () => {
  let sql: Sql;
  let server: Server;
  let origin: string;

  async function claim(secret: string, name: string): Promise<{ passphrase?: string }> {
    const response = await fetch(`${origin}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ name }),
    });
    return response.json() as Promise<{ passphrase?: string }>;
  }

  async function signIn(secret: string, name: string, passphrase: string): Promise<void> {
    await fetch(`${origin}/players/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ name, passphrase }),
    });
  }

  function send(secret: string, sent: RunBatch, character = CHARACTER): Promise<Response> {
    return fetch(`${origin}/runs/${character}/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(sent),
    });
  }

  beforeAll(async () => {
    sql = await openTestDatabase();
    await publishEngine(sql, ENGINE, fakeEngine());
    server = createRunServer({ allowedOrigin: 'https://johnolek.github.io' }, sql);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const mine = await claim(MINE, 'John');
    await claim(THEIRS, 'Somebody');
    await signIn(MY_OTHER, 'John', mine.passphrase ?? '');
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((thrown) => (thrown ? reject(thrown) : resolve()));
    });
    await sql.close();
  });

  it('takes a batch and says which sequence it now has', async () => {
    const response = await send(MINE, batch({ session: header }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: 0 });
  });

  it('refuses a batch from a device that has claimed no name', async () => {
    const response = await send(UNNAMED, batch({ session: header }), 'nameless-1');

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('This device has no name yet.');
  });

  it('refuses a batch for a character another player is playing', async () => {
    const response = await send(THEIRS, batch({ sequence: 1 }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('That character belongs to another player.');
  });

  it('refuses a stretch sent again under a sequence it holds, with something else in it', async () => {
    const response = await send(MINE, batch({ inputs: [104, 106, 107], pressed: 3 }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('That stretch of the run arrived before, holding something else.');
  });

  it('takes a stretch sent again holding what it held the first time', async () => {
    const response = await send(MINE, batch({ session: header }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: 0 });
  });

  it('refuses a body that is not a batch', async () => {
    const response = await send(MINE, { sequence: 'first' } as unknown as RunBatch);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('That is not a batch of a run.');
  });

  it('refuses a batch for a character the player is playing on another device', async () => {
    const response = await send(MY_OTHER, batch({ sequence: 1, inputs: [107], pressed: 1 }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'That character is being played on another device.',
      because: 'leased',
    });
  });

  it('tells a device that the character it is about to play is being played elsewhere', async () => {
    const response = await fetch(`${origin}/runs/${CHARACTER}`, { headers: { Authorization: `Bearer ${MY_OTHER}` } });

    expect((await response.json()).leasedElsewhere).toBe(true);
  });

  it('tells the device playing it that nothing else is', async () => {
    const response = await fetch(`${origin}/runs/${CHARACTER}`, { headers: { Authorization: `Bearer ${MINE}` } });

    expect((await response.json()).leasedElsewhere).toBe(false);
  });

  it('shows the player their own run before it has been checked', async () => {
    const response = await fetch(`${origin}/runs/${CHARACTER}`, { headers: { Authorization: `Bearer ${MINE}` } });

    expect(response.status).toBe(200);
    const run = await response.json();
    expect(run).toMatchObject({ id: CHARACTER, game: 'unforgiven', name: 'Grond', player: 'John', verdict: null });
    expect(run.sessions).toEqual([
      { index: 0, engine: ENGINE, startedAt: '2026-09-09T12:00:00.000Z', actions: 2, time: 4 },
    ]);
  });

  it('shows a character still being played to anybody once its chain has been replayed', async () => {
    const run = await untilAnybodyMayRead();

    expect(run).toMatchObject({ id: CHARACTER, player: 'John', outcome: null, verdict: null });
    // The timeline of a character still being played is the one the last replay of the chain so
    // far wrote, since there is no verdict yet to take one from.
    expect(run.journal).toEqual({ entries: [STEPPED], actions: 2, time: 4 });
  });

  it('keeps a run nothing has been checked about to the player whose run it is', async () => {
    await send(THEIRS, batch({ session: { ...header, leaderboard: null } }), PRIVATE);

    const response = await fetch(`${origin}/runs/${PRIVATE}`, { headers: { Authorization: `Bearer ${MINE}` } });

    expect(response.status).toBe(403);
  });

  it('replays the run when its last batch arrives, and shows the verdict to anybody', async () => {
    const ended = await send(MINE, batch({ sequence: 1, ending: true, claims: { mode: 'speedrun', actions: 12, time: 30, edits: 0, milestones: [{ kind: 'death', which: 0, actions: 12, time: 30, floor: 3 }] } }));
    expect(ended.status).toBe(200);

    const run = await untilVerdict();

    expect(run.outcome).toBe('death');
    expect(run.finishedAt).not.toBeNull();
    expect(run.verdict).toMatchObject({ status: 'verified', actions: 12, time: 30, eligible: true });
    expect(run.verdict?.milestones).toEqual([]);
    expect(run.journal).toEqual({ entries: [STEPPED], actions: 12, time: 30 });
    // The journal goes out once, on its own, rather than inside the verdict as well.
    expect(Object.keys(run.verdict ?? {})).not.toContain('journal');
  });

  it('refuses keys for a character it has seen die', async () => {
    const response = await send(MINE, batch({ sequence: 2, inputs: [107], pressed: 1 }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'That character has already died.', because: 'dead' });
  });

  it("hands a signed-in device the player's whole roster", async () => {
    const response = await fetch(`${origin}/players/me/characters`, {
      headers: { Authorization: `Bearer ${MY_OTHER}` },
    });

    expect(response.status).toBe(200);
    const { characters } = await response.json();
    expect(characters).toHaveLength(1);
    expect(characters[0]).toMatchObject({ id: CHARACTER, name: 'Grond', record: 'AAED', slot: 21 });
    // What a chain is rebuilt out of is `roster.test.ts`; what this asks is that the sitting came
    // back through the endpoint at all.
    expect(characters[0].run[0]).toMatchObject({ seed: 12345, record: 'AAEC', engine: ENGINE });
  });

  it('leaves the keys of every sitting out of the roster and counts them instead', async () => {
    const response = await fetch(`${origin}/players/me/characters`, {
      headers: { Authorization: `Bearer ${MY_OTHER}` },
    });

    const { characters } = await response.json();
    expect(characters[0].run[0]).toMatchObject({ inputCount: 4 });
    expect(characters[0].run[0]).not.toHaveProperty('inputs');
  });

  it('hands the keys of one character’s chain over when they are asked for', async () => {
    const response = await fetch(`${origin}/players/me/characters/${CHARACTER}/run`, {
      headers: { Authorization: `Bearer ${MY_OTHER}` },
    });

    expect(response.status).toBe(200);
    const { run } = await response.json();
    expect(run[0]).toMatchObject({ seed: 12345, inputs: [104, 106, 104, 106] });
  });

  it('hands over no chain for a character of another player’s', async () => {
    const response = await fetch(`${origin}/players/me/characters/${CHARACTER}/run`, {
      headers: { Authorization: `Bearer ${THEIRS}` },
    });

    expect(response.status).toBe(404);
  });

  it('hands no roster to a device that has claimed no name', async () => {
    const response = await fetch(`${origin}/players/me/characters`, {
      headers: { Authorization: `Bearer ${UNNAMED}` },
    });

    expect(response.status).toBe(403);
  });

  it('leaves a character of another player where it is', async () => {
    const response = await fetch(`${origin}/players/me/characters/${CHARACTER}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${THEIRS}` },
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('No character of yours has that name here.');
  });

  it('forgets a character of the player’s own', async () => {
    const response = await fetch(`${origin}/players/me/characters/${CHARACTER}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${MINE}` },
    });

    expect(response.status).toBe(200);
    const roster = await fetch(`${origin}/players/me/characters`, { headers: { Authorization: `Bearer ${MINE}` } });
    expect((await roster.json()).characters).toEqual([]);
  });

  it('says there is no such run for a character nobody has played here', async () => {
    const response = await fetch(`${origin}/runs/never-played`);

    expect(response.status).toBe(404);
  });

  it('takes a character edited with no game running and puts it on the roster', async () => {
    const response = await putCharacter(MINE, EDITED);

    expect(response.status).toBe(200);
    const roster = await fetch(`${origin}/players/me/characters`, { headers: { Authorization: `Bearer ${MINE}` } });
    expect((await roster.json()).characters).toMatchObject([
      { id: EDITED, game: 'unforgiven', name: 'Editor', record: 'CQkJ', run: [] },
    ]);
  });

  it('takes no character from a device that has claimed no name', async () => {
    const response = await putCharacter(UNNAMED, EDITED);

    expect(response.status).toBe(403);
  });

  /** A character sent on its own, the way the site sends one edited with no game running. */
  function putCharacter(secret: string, characterId: string): Promise<Response> {
    return fetch(`${origin}/players/me/characters/${characterId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        game: 'unforgiven',
        name: 'Editor',
        save: {
          record: 'CQkJ',
          maps: null,
          slot: 21,
          dead: false,
          leaderboard: null,
          createdAt: '2026-09-08T09:00:00.000Z',
          editedAt: '2026-09-09T13:00:00.000Z',
        },
      }),
    });
  }

  /**
   * The replay of a chain still being played happens behind the answer to the batch that asked
   * for it, so the run is asked for without a secret until it comes back, which is what a reader
   * following a board of the living does.
   */
  async function untilAnybodyMayRead(): Promise<RunAnswer> {
    for (let tries = 0; tries < 50; tries++) {
      const response = await fetch(`${origin}/runs/${CHARACTER}`);
      if (response.status === 200) return response.json() as Promise<RunAnswer>;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('The chain was never replayed.');
  }

  /** The replay happens behind the answer to the last batch, so the run is asked for until the
   *  verdict is there, which is what the site does too. */
  async function untilVerdict(): Promise<RunAnswer> {
    for (let tries = 0; tries < 50; tries++) {
      const response = await fetch(`${origin}/runs/${CHARACTER}`);
      if (response.status === 200) {
        const run = (await response.json()) as RunAnswer;
        if (run.verdict !== null) return run;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('The run was never given a verdict.');
  }
});
