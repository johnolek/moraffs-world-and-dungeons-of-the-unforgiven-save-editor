import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardRow, LivingRow } from '../../../server/boards';
import type { EveryoneRow } from '../../../server/everyone';
import {
  loadAnnouncements,
  loadBoard,
  loadEveryone,
  loadLiving,
  loadMore,
  loadMoreLiving,
  loadOlderAnnouncements,
  loadRun,
  NO_ANNOUNCEMENTS,
  type BoardAsked,
  type LivingAsked,
} from './server';

const ASKED: BoardAsked = { game: 'unforgiven', leaderboard: 'speedrun', board: 'actions' };
const ALIVE: LivingAsked = { game: 'unforgiven', leaderboard: 'speedrun', sort: 'level' };

function row(name: string): BoardRow {
  return {
    characterId: name,
    player: 'Moraff',
    name,
    actions: 100,
    clock: 30,
    playMs: 5000,
    timed: true,
    deepest: 2,
    level: 7,
    kills: 9,
    outcome: 'win',
    at: '2026-09-09 21:00:00',
  };
}

function livingRow(name: string): LivingRow {
  return {
    characterId: name,
    player: 'Moraff',
    name,
    level: 7,
    deepest: 2,
    actions: 100,
    clock: 30,
    playing: true,
    heardAt: '2026-09-09 21:00:00',
  };
}

function everyoneRow(name: string): EveryoneRow {
  return {
    characterId: name,
    player: 'Moraff',
    name,
    leaderboard: 'speedrun',
    status: 'alive',
    playing: false,
    level: 7,
    deepest: 2,
    actions: 100,
    clock: 30,
    playMs: 0,
    timed: false,
    at: '2026-09-09 21:00:00',
    now: { cls: 'Sage', hp: 40, maxHp: 55, stats: [18, 21, 16, 14, 12, 7] },
  };
}

/** A server that answers each call in turn, and the paths it was asked for. */
function answering(...answers: (unknown | 'unreachable')[]): { asked: string[] } {
  const asked: string[] = [];
  let at = 0;
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url);
    const answer = answers[Math.min(at++, answers.length - 1)];
    if (answer === 'unreachable') return Promise.reject(new Error('nothing there'));
    return Promise.resolve(new Response(JSON.stringify(answer), { status: 200 }));
  });
  return { asked };
}

beforeEach(() => {
  vi.stubEnv('VITE_RUN_SERVER', 'https://runs.example.com');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('reading a board', () => {
  it('asks for the first page of the board named', async () => {
    const server = answering({ rows: [row('Grond')], page: 1, more: true });

    const board = await loadBoard(ASKED);

    expect(server.asked).toEqual(['https://runs.example.com/boards/unforgiven/speedrun/actions?page=1']);
    expect(board).toMatchObject({ page: 1, more: true, failed: false });
    expect(board.rows.map((each) => each.name)).toEqual(['Grond']);
  });

  it('adds the next page to the end of what is showing', async () => {
    answering({ rows: [row('Grond')], page: 1, more: true });
    const first = await loadBoard(ASKED);
    const server = answering({ rows: [row('Thok')], page: 2, more: false });

    const both = await loadMore(first, ASKED);

    expect(server.asked).toEqual(['https://runs.example.com/boards/unforgiven/speedrun/actions?page=2']);
    expect(both.rows.map((each) => each.name)).toEqual(['Grond', 'Thok']);
    expect(both).toMatchObject({ page: 2, more: false });
  });

  it('leaves the rows showing alone when the next page cannot be read', async () => {
    answering({ rows: [row('Grond')], page: 1, more: true });
    const first = await loadBoard(ASKED);
    answering('unreachable');

    const after = await loadMore(first, ASKED);

    expect(after.rows.map((each) => each.name)).toEqual(['Grond']);
    expect(after).toMatchObject({ page: 1, failed: true });
  });

  it('has nothing to show and says so when the server cannot be reached at all', async () => {
    answering('unreachable');

    expect(await loadBoard(ASKED)).toEqual({ rows: [], page: 0, more: false, failed: true });
  });

  it('has nothing to show in a build with no server', async () => {
    vi.stubEnv('VITE_RUN_SERVER', '');
    const server = answering({ rows: [], page: 1, more: false });

    expect((await loadBoard(ASKED)).failed).toBe(true);
    expect(server.asked).toEqual([]);
  });
});

describe('reading a board of the living', () => {
  it('asks for the first page in the order named', async () => {
    const server = answering({ rows: [livingRow('Grond')], page: 1, more: true });

    const board = await loadLiving(ALIVE);

    expect(server.asked).toEqual(['https://runs.example.com/boards/unforgiven/speedrun/living?sort=level&page=1']);
    expect(board).toMatchObject({ page: 1, more: true, failed: false });
    expect(board.rows.map((each) => each.name)).toEqual(['Grond']);
  });

  it('adds the next page to the end of what is showing', async () => {
    answering({ rows: [livingRow('Grond')], page: 1, more: true });
    const first = await loadLiving(ALIVE);
    const server = answering({ rows: [livingRow('Thok')], page: 2, more: false });

    const both = await loadMoreLiving(first, ALIVE);

    expect(server.asked).toEqual(['https://runs.example.com/boards/unforgiven/speedrun/living?sort=level&page=2']);
    expect(both.rows.map((each) => each.name)).toEqual(['Grond', 'Thok']);
  });

  it('has nothing to show and says so when the server cannot be reached', async () => {
    answering('unreachable');

    expect(await loadLiving(ALIVE)).toEqual({ rows: [], page: 0, more: false, failed: true });
  });
});

describe('reading everyone', () => {
  it('asks for the whole table of that game', async () => {
    const server = answering({ game: 'unforgiven', rows: [everyoneRow('Grond'), everyoneRow('Thok')] });

    const table = await loadEveryone('unforgiven');

    expect(server.asked).toEqual(['https://runs.example.com/boards/unforgiven/everyone']);
    expect(table.rows.map((each) => each.name)).toEqual(['Grond', 'Thok']);
    expect(table.failed).toBe(false);
  });

  it('has nothing to show and says so when the server cannot be reached', async () => {
    answering('unreachable');

    expect(await loadEveryone('unforgiven')).toEqual({ rows: [], failed: true });
  });
});

describe('opening a run', () => {
  it('asks the server for that character', async () => {
    const server = answering({ id: 'grond', name: 'Grond', player: 'Moraff' });

    const run = await loadRun('grond');

    expect(server.asked).toEqual(['https://runs.example.com/runs/grond']);
    expect(run).toMatchObject({ name: 'Grond' });
  });

  it('brings back the journal the replay wrote, for the page to draw the timeline from', async () => {
    const stepped = { at: 2, floor: 3, module: 0, text: 'Stepped north', event: { kind: 'stepped', dir: 0 } };
    answering({ id: 'grond', name: 'Grond', player: 'Moraff', journal: { entries: [stepped], actions: 12, time: 30 } });

    const run = await loadRun('grond');

    expect(run?.journal).toEqual({ entries: [stepped], actions: 12, time: 30 });
  });

  it('is nothing when the run is not there', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{"error":"No such run."}', { status: 404 })));

    expect(await loadRun('nobody')).toBeNull();
  });
});

describe('reading the announcements', () => {
  const said = (id: number) => ({ id, kind: 'level', which: id, name: 'Grond', player: 'Moraff' });

  it('asks for the newest ones first', async () => {
    const server = answering({ announcements: [said(9), said(8)], more: true });

    const history = await loadAnnouncements();

    expect(server.asked).toEqual(['https://runs.example.com/announcements']);
    expect(history.announcements.map((each) => each.id)).toEqual([9, 8]);
    expect(history.more).toBe(true);
  });

  it('asks for what is behind the oldest one showing', async () => {
    answering({ announcements: [said(9), said(8)], more: true });
    const first = await loadAnnouncements();
    const server = answering({ announcements: [said(7)], more: false });

    const more = await loadOlderAnnouncements(first);

    expect(server.asked).toEqual(['https://runs.example.com/announcements?before=8']);
    expect(more.announcements.map((each) => each.id)).toEqual([9, 8, 7]);
  });

  it('asks for the newest ones when there is nothing showing to be behind', async () => {
    const server = answering({ announcements: [], more: false });

    await loadOlderAnnouncements(NO_ANNOUNCEMENTS);

    expect(server.asked).toEqual(['https://runs.example.com/announcements']);
  });
});
