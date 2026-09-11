import { describe, expect, it } from 'vitest';
import { RunStream, type BatchAnswer, type CharacterSave, type RunBatch, type StreamedSession } from './stream';
import type { RunSession } from './run';

function save(over: Partial<CharacterSave> = {}): CharacterSave {
  return {
    record: 'AAED',
    maps: null,
    slot: 21,
    dead: false,
    leaderboard: 'speedrun',
    createdAt: '2026-09-09T11:00:00.000Z',
    editedAt: '2026-09-09T12:00:00.000Z',
    ...over,
  };
}

function session(over: Partial<RunSession> = {}): RunSession {
  return {
    engine: 'a'.repeat(40),
    game: 'unforgiven',
    mode: 'speedrun',
    leaderboard: 'speedrun',
    sound: null,
    name: 'Grond',
    startedAt: '2026-09-09T12:00:00.000Z',
    seed: 12345,
    record: 'AAEC',
    inputs: [],
    actions: 0,
    time: 0,
    milestones: [],
    edits: 0,
    ...over,
  };
}

/** A sitting whose keys a test pushes, standing in for the game being played. */
function played(index = 0): {
  sitting: StreamedSession;
  press(...keys: number[]): void;
  unpressed(key: number): void;
  discover(maps: string | null): void;
} {
  const inputs: number[] = [];
  let presses = 0;
  let maps: string | null = null;
  return {
    sitting: {
      index,
      log: () => session({ inputs: [...inputs], actions: inputs.length }),
      presses: () => presses,
      save: () => save({ maps }),
    },
    press(...keys) {
      inputs.push(...keys);
      presses += keys.length;
    },
    unpressed(key) {
      inputs.push(key);
    },
    discover(discovered) {
      maps = discovered;
    },
  };
}

/** A server that takes everything, keeping what it was sent. */
function takesEverything(): { post: (batch: RunBatch) => Promise<BatchAnswer>; sent: RunBatch[] } {
  const sent: RunBatch[] = [];
  return {
    sent,
    post: (batch) => {
      sent.push(structuredClone(batch));
      return Promise.resolve({ took: true });
    },
  };
}

describe('sending a run as it is played', () => {
  it('sends the sitting itself with the first batch and not with the ones after it', async () => {
    const game = played();
    const server = takesEverything();
    const stream = new RunStream(game.sitting, server.post);

    game.press(104, 106);
    await stream.send(false);
    game.press(107);
    await stream.send(false);

    expect(server.sent[0].session).toMatchObject({ seed: 12345, record: 'AAEC', engine: 'a'.repeat(40) });
    expect(server.sent[0].sequence).toBe(0);
    expect(server.sent[1].session).toBeUndefined();
    expect(server.sent[1].sequence).toBe(1);
  });

  it('sends only what has been played since the last batch', async () => {
    const game = played();
    const server = takesEverything();
    const stream = new RunStream(game.sitting, server.post);

    game.press(104, 106);
    await stream.send(false);
    game.press(107, 108);
    await stream.send(false);

    expect(server.sent.map((batch) => batch.inputs)).toEqual([
      [104, 106],
      [107, 108],
    ]);
  });

  it('leaves the keys played while a batch was in the air to the next round', async () => {
    const game = played();
    const sent: RunBatch[] = [];
    // Moraff's Revenge writes a tick of its monsters' clock into the log every two hundred
    // milliseconds, so there is always something new to send by the time a batch has gone.
    const stream = new RunStream(game.sitting, (batch) => {
      sent.push(structuredClone(batch));
      game.unpressed(-0x202);
      return Promise.resolve({ took: true });
    });

    game.press(104);
    expect(await stream.send(false)).toEqual({ sent: 'taken' });
    expect(sent).toHaveLength(1);

    expect(await stream.send(false)).toEqual({ sent: 'taken' });
    expect(sent.map((batch) => batch.inputs)).toEqual([[104], [-0x202]]);
  });

  it('sends nothing when nothing has been played', async () => {
    const game = played();
    const server = takesEverything();
    const stream = new RunStream(game.sitting, server.post);

    game.press(104);
    await stream.send(false);

    expect(await stream.send(false)).toEqual({ sent: 'nothing' });
    expect(server.sent).toHaveLength(1);
  });

  it('counts the keys the player pressed rather than the inputs', async () => {
    const game = played();
    const server = takesEverything();
    const stream = new RunStream(game.sitting, server.post);

    game.press(104);
    game.unpressed(70);
    game.unpressed(70);
    await stream.send(false);

    expect(server.sent[0].inputs).toHaveLength(3);
    expect(server.sent[0].pressed).toBe(1);
  });

  it('sends a stretch the server never took again as it was, and what came after it in the next batch', async () => {
    const game = played();
    const server = takesEverything();
    let reachable = false;
    const stream = new RunStream(game.sitting, (batch) =>
      reachable ? server.post(batch) : Promise.resolve({ took: false, refusal: null }),
    );

    game.press(104, 106);
    expect(await stream.send(false)).toEqual({ sent: 'unreachable' });
    game.press(107);
    reachable = true;
    await stream.send(false);

    expect(server.sent.map((batch) => [batch.sequence, batch.inputs])).toEqual([
      [0, [104, 106]],
      [1, [107]],
    ]);
  });

  it('sends the batch whose answer was lost again holding exactly what it held', async () => {
    const game = played();
    const server = takesEverything();
    let answering = false;
    // The server takes and keeps every batch; what goes missing is its answer to the first one.
    const stream = new RunStream(game.sitting, async (batch) => {
      const answer = await server.post(batch);
      return answering ? answer : { took: false, refusal: null };
    });

    game.press(104, 106);
    await stream.send(false);
    game.press(107);
    answering = true;
    await stream.send(false);

    expect(server.sent.map((batch) => [batch.sequence, batch.inputs, batch.pressed])).toEqual([
      [0, [104, 106], 2],
      [0, [104, 106], 2],
      [1, [107], 1],
    ]);
    expect(server.sent[1].session).toEqual(server.sent[0].session);
  });

  it('sends the same sequence again when an answer never came back', async () => {
    const game = played();
    const sent: RunBatch[] = [];
    let answer = false;
    const stream = new RunStream(game.sitting, (batch) => {
      sent.push(structuredClone(batch));
      return Promise.resolve(answer ? { took: true } : { took: false, refusal: null });
    });

    game.press(104);
    await stream.send(false);
    answer = true;
    await stream.send(false);

    expect(sent.map((batch) => batch.sequence)).toEqual([0, 0]);
  });

  it('stops for good once the server has refused the run, and says why it did', async () => {
    const game = played();
    const refused = {
      sent: 'refused',
      words: 'That character belongs to another player.',
      because: 'another-player',
    };
    let asked = 0;
    const stream = new RunStream(game.sitting, () => {
      asked += 1;
      return Promise.resolve({ took: false, refusal: refused.words, because: refused.because });
    });

    game.press(104);
    expect(await stream.send(false)).toEqual(refused);
    game.press(106);
    expect(await stream.send(false)).toEqual(refused);
    expect(asked).toBe(1);
  });

  it('marks the last batch of a run as the end of it', async () => {
    const game = played();
    const server = takesEverything();
    const stream = new RunStream(game.sitting, server.post);

    game.press(104);
    await stream.send(true);

    expect(server.sent[0].ending).toBe(true);
  });

  it('sends a last batch at the end even with nothing played since the one before', async () => {
    const game = played();
    const server = takesEverything();
    const stream = new RunStream(game.sitting, server.post);

    game.press(104);
    await stream.send(false);
    expect(await stream.send(true)).toEqual({ sent: 'taken' });

    expect(server.sent[1]).toMatchObject({ inputs: [], ending: true, sequence: 1 });
  });

  it('sends the sittings played before this one, oldest first', async () => {
    const game = played(2);
    const server = takesEverything();
    const stream = new RunStream(game.sitting, server.post, [
      session({ inputs: [1, 2], actions: 2 }),
      session({ inputs: [3], actions: 3 }),
    ]);

    game.press(104);
    await stream.send(false);

    expect(server.sent.map((batch) => [batch.sessionIndex, batch.sequence, batch.inputs])).toEqual([
      [0, 0, [1, 2]],
      [1, 0, [3]],
      [2, 0, [104]],
    ]);
    // Nobody wrote down how many of those keys were pressed, and a batch on its own has no
    // stretch of time to be judged over.
    expect(server.sent[0].pressed).toBe(0);
  });

  it('sends the sittings before this one in one round however fast the keys arrive', async () => {
    const game = played(2);
    const sent: RunBatch[] = [];
    const stream = new RunStream(
      game.sitting,
      (batch) => {
        sent.push(structuredClone(batch));
        game.unpressed(-0x202);
        return Promise.resolve({ took: true });
      },
      [session({ inputs: [1, 2] }), session({ inputs: [3] })],
    );

    game.press(104);
    await stream.send(false);

    expect(sent.map((batch) => batch.sessionIndex)).toEqual([0, 1, 2]);
  });

  it('holds the sitting being played back until the ones before it have gone', async () => {
    const game = played(1);
    const server = takesEverything();
    let reachable = false;
    const stream = new RunStream(
      game.sitting,
      (batch) => (reachable ? server.post(batch) : Promise.resolve({ took: false, refusal: null })),
      [session({ inputs: [1, 2] })],
    );

    game.press(104);
    expect(await stream.send(false)).toEqual({ sent: 'unreachable' });
    reachable = true;
    await stream.send(false);

    expect(server.sent.map((batch) => batch.sessionIndex)).toEqual([0, 1]);
  });

  it('carries the character as it stands with every batch', async () => {
    const game = played();
    const server = takesEverything();
    const stream = new RunStream(game.sitting, server.post);

    game.press(104);
    await stream.send(false);
    game.press(106);
    await stream.send(false);

    expect(server.sent.map((batch) => batch.save?.record)).toEqual(['AAED', 'AAED']);
  });

  it('carries the maps only when they have changed since the batch before', async () => {
    const game = played();
    const server = takesEverything();
    const stream = new RunStream(game.sitting, server.post);

    game.discover('one floor');
    game.press(104);
    await stream.send(false);
    game.press(106);
    await stream.send(false);
    game.discover('two floors');
    game.press(107);
    await stream.send(false);

    expect(server.sent.map((batch) => batch.save?.maps)).toEqual(['one floor', undefined, 'two floors']);
  });

  it('sends the maps of a character that has discovered none once and no more', async () => {
    const game = played();
    const server = takesEverything();
    const stream = new RunStream(game.sitting, server.post);

    game.press(104);
    await stream.send(false);
    game.press(106);
    await stream.send(false);

    expect(server.sent.map((batch) => batch.save?.maps)).toEqual([null, undefined]);
  });

  it('sends no character with a sitting the server is being caught up on', async () => {
    const game = played(1);
    const server = takesEverything();
    const stream = new RunStream(game.sitting, server.post, [session({ inputs: [1, 2] })]);

    game.press(104);
    await stream.send(false);

    expect(server.sent[0].save).toBeUndefined();
    expect(server.sent[1].save?.record).toBe('AAED');
  });

  it('hands over a batch to send without posting it, for a page on its way out', async () => {
    const game = played();
    const server = takesEverything();
    const stream = new RunStream(game.sitting, server.post);

    game.press(104);
    const batch = stream.next(false);
    expect(batch).not.toBeNull();
    if (batch === null) return;
    stream.took(batch);

    game.press(106);
    await stream.send(false);

    expect(server.sent[0].inputs).toEqual([106]);
    expect(server.sent[0].sequence).toBe(1);
  });
});
