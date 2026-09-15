<!--
  The Boards tab: one game's runs, on whichever board is picked, with the announcements beside
  them. Clicking a run opens its own page here in place of the board.

  Which boards there are and what each one holds is the server's, in `server/boards.ts`, so that
  the two halves never disagree about a board. Nothing of the server's code comes with it: the
  lists are tables of names and words.

  The six boards of finished runs and the two of the living share the picker and nothing else:
  a row of one is a run that has ended and a row of the other is a character still being played,
  so each has its own table.

  The picker opens on everyone rather than on a board, because a ranked board is an answer to a
  question a reader has to have already: seeing who is playing the game at all comes first, and
  the eight boards are behind it. One leaderboard picker stands over the lot: everyone can be read
  across both leaderboards at once, while a ranked board is a ranking of runs played the same way
  and so is one leaderboard or the other.
-->
<script lang="ts">
  import { app, type Leaderboard } from '../app-state.svelte';
  import { leaderboardLabel } from '../character/leaderboard';
  import SectionHeading from '../ui/SectionHeading.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Announcements from './Announcements.svelte';
  import Everyone from './Everyone.svelte';
  import RunPage from './RunPage.svelte';
  import {
    loadBoard,
    loadLiving,
    loadMore,
    loadMoreLiving,
    NO_BOARD,
    type LoadedBoard,
    type LoadedLiving,
  } from './server';
  import {
    BOARDS_PAGE,
    clockHeading,
    EVERYONE,
    NOTHING_TO_SHOW,
    playTimeWords,
    reachWords,
    whenWords,
  } from './words';
  import { BOARDS, BOARD_LEADERBOARDS, isBoardName, LIVING_BOARDS, type BoardName } from '../../../server/boards';

  /** What the picker is showing: everyone, one of the six board names, or one of the two living
   *  boards. */
  type Picked = 'everyone' | BoardName | (typeof LIVING_BOARDS)[number]['name'];

  /** The picker's choices, in the shape the segmented control takes. Everyone comes first and is
   *  what the tab opens on; the rest are the boards, whose words are the server's. */
  const PICKS: { id: Picked; label: string }[] = [
    { name: 'everyone', sorts: EVERYONE.pick },
    ...BOARDS,
    ...LIVING_BOARDS,
  ].map(({ name, sorts }) => ({ id: name as Picked, label: sorts }));

  /** Which leaderboard is being read: one of them, or both at once. */
  type LeaderboardPick = Leaderboard | 'both';

  /** The two leaderboards and both together, as the picker offers them. */
  const LEADERBOARD_CHOICES: { id: LeaderboardPick; label: string }[] = [
    ...BOARD_LEADERBOARDS.map((name) => ({ id: name as LeaderboardPick, label: leaderboardLabel(name) })),
    { id: 'both', label: BOARDS_PAGE.bothLeaderboards },
  ];

  let leaderboard = $state<LeaderboardPick>('both');
  let picked = $state<Picked>('everyone');
  let showing = $state<LoadedBoard>(NO_BOARD);
  let alive = $state<LoadedLiving>(NO_BOARD);
  let reading = $state(false);
  let openRun = $state<string | null>(null);

  /** The picker as it stands: both is there to pick only over everyone, since a ranked board
   *  puts runs played the same way in order and two ways of playing do not rank together. */
  const leaderboardChoices = $derived(
    LEADERBOARD_CHOICES.map((choice) => ({ ...choice, disabled: choice.id === 'both' && picked !== 'everyone' })),
  );

  /** The one leaderboard a ranked board is read for. Picking such a board takes the reader off
   *  both, so this only stands in for a state the page does not stay in. */
  const ranked = $derived<Leaderboard>(leaderboard === 'both' ? 'faithful' : leaderboard);

  /** The leaderboards the table of everyone is cut down to. */
  const leaderboards = $derived<Leaderboard[]>(leaderboard === 'both' ? [...BOARD_LEADERBOARDS] : [leaderboard]);

  const asked = $derived({ game: app.game, leaderboard: ranked, board: picked });

  /** Pick a board, off both leaderboards, since a ranked board is of one of them. */
  function pickBoard(id: Picked): void {
    picked = id;
    if (id !== 'everyone' && leaderboard === 'both') leaderboard = 'faithful';
  }

  /** Which order the living are ranked in, and null when a board of finished runs is showing. */
  const livingSort = $derived(LIVING_BOARDS.find((board) => board.name === picked)?.sortedOn ?? null);

  /**
   * Which read the rows on screen came from. A reader who picks two boards quickly has two reads
   * in the air at once, and the answer to the first must not land on top of the second.
   */
  let latest = 0;

  $effect(() => {
    const now = asked;
    const sort = livingSort;
    const mine = ++latest;
    showing = NO_BOARD;
    alive = NO_BOARD;
    openRun = null;
    if (sort !== null) {
      void loadLiving({ game: now.game, leaderboard: now.leaderboard, sort }).then((read) => {
        if (mine === latest) alive = read;
      });
    } else if (isBoardName(now.board)) {
      void loadBoard({ game: now.game, leaderboard: now.leaderboard, board: now.board }).then((read) => {
        if (mine === latest) showing = read;
      });
    }
  });

  /**
   * The number the board is in order of, where the table has no column of its own for it. The
   * boards of wins are ordered by numbers every row already shows.
   */
  const sortedOn = $derived(BOARDS.find((each) => each.name === picked)?.sortedOn ?? null);
  const extra = $derived(sortedOn === 'deepest' || sortedOn === 'level' ? sortedOn : null);

  async function more(): Promise<void> {
    const now = asked;
    const sort = livingSort;
    reading = true;
    const mine = latest;
    if (sort !== null) {
      const read = await loadMoreLiving(alive, { game: now.game, leaderboard: now.leaderboard, sort });
      if (mine === latest) alive = read;
    } else if (isBoardName(now.board)) {
      const read = await loadMore(showing, { game: now.game, leaderboard: now.leaderboard, board: now.board });
      if (mine === latest) showing = read;
    }
    reading = false;
  }
</script>

<div class="boards">
  <div class="board">
    {#if openRun !== null}
      <RunPage characterId={openRun} onback={() => (openRun = null)} />
    {:else}
      <SectionHeading title={BOARDS_PAGE.heading} />
      <div class="picks">
        <div class="pick">
          <span class="label">{BOARDS_PAGE.leaderboard}</span>
          <Segmented
            label={BOARDS_PAGE.leaderboard}
            choices={leaderboardChoices}
            value={leaderboard}
            onpick={(id) => (leaderboard = id)}
            wrap />
        </div>
        <div class="pick">
          <span class="label">{BOARDS_PAGE.board}</span>
          <Segmented label={BOARDS_PAGE.board} choices={PICKS} value={picked} onpick={pickBoard} wrap />
        </div>
      </div>
      {#if picked === 'everyone'}
        <Everyone game={app.game} {leaderboards} onopen={(id) => (openRun = id)} />
      {:else if livingSort !== null}
        {#if alive.rows.length === 0}
          <p class="empty">{alive.failed ? BOARDS_PAGE.unreachable : BOARDS_PAGE.noneAlive}</p>
        {:else}
          <table>
            <thead>
              <tr>
                <th>{BOARDS_PAGE.rank}</th>
                <th>{BOARDS_PAGE.player}</th>
                <th>{BOARDS_PAGE.character}</th>
                <th>{BOARDS_PAGE.level}</th>
                <th>{BOARDS_PAGE.reach}</th>
                <th>{BOARDS_PAGE.actions}</th>
                <th>{clockHeading(asked.game)}</th>
                <th>{BOARDS_PAGE.playingNow}</th>
                <th>{BOARDS_PAGE.lastHeard}</th>
              </tr>
            </thead>
            <tbody>
              {#each alive.rows as row, at (row.characterId)}
                <tr>
                  <td>{at + 1}</td>
                  <td>{row.player}</td>
                  <td>
                    <button type="button" class="link" onclick={() => (openRun = row.characterId)}>{row.name}</button>
                  </td>
                  <td>{row.level}</td>
                  <td>{reachWords(asked.game, row.deepest)}</td>
                  <td>{row.actions}</td>
                  <td>{row.clock}</td>
                  <td>{row.playing ? BOARDS_PAGE.beingPlayed : NOTHING_TO_SHOW}</td>
                  <td>{whenWords(row.heardAt)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if alive.more}
            <button type="button" class="more" onclick={more} disabled={reading}>{BOARDS_PAGE.more}</button>
          {/if}
          {#if alive.failed}
            <p class="empty">{BOARDS_PAGE.unreachable}</p>
          {/if}
        {/if}
      {:else if showing.rows.length === 0}
        <p class="empty">{showing.failed ? BOARDS_PAGE.unreachable : BOARDS_PAGE.empty}</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>{BOARDS_PAGE.rank}</th>
              <th>{BOARDS_PAGE.player}</th>
              <th>{BOARDS_PAGE.character}</th>
              {#if extra !== null}
                <th>{extra === 'deepest' ? BOARDS_PAGE.reach : BOARDS_PAGE.level}</th>
              {/if}
              <th>{BOARDS_PAGE.actions}</th>
              <th>{clockHeading(asked.game)}</th>
              <th>{BOARDS_PAGE.playTime}</th>
              <th>{BOARDS_PAGE.finished}</th>
            </tr>
          </thead>
          <tbody>
            {#each showing.rows as row, at (row.characterId)}
              <tr>
                <td>{at + 1}</td>
                <td>{row.player}</td>
                <td>
                  <button type="button" class="link" onclick={() => (openRun = row.characterId)}>{row.name}</button>
                </td>
                {#if extra !== null}
                  <td>{extra === 'deepest' ? reachWords(asked.game, row.deepest) : row.level}</td>
                {/if}
                <td>{row.actions}</td>
                <td>{row.clock}</td>
                <td>{playTimeWords(row.playMs, row.timed)}</td>
                <td>{row.at === null ? NOTHING_TO_SHOW : whenWords(row.at)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if showing.more}
          <button type="button" class="more" onclick={more} disabled={reading}>{BOARDS_PAGE.more}</button>
        {/if}
        {#if showing.failed}
          <p class="empty">{BOARDS_PAGE.unreachable}</p>
        {/if}
      {/if}
    {/if}
  </div>
  <Announcements />
</div>

<style>
  .boards {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .board {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
    padding: 16px 24px;
    overflow: auto;
  }
  /* The board picker takes several lines of its own, so each picker gets a line of the page's
     whole width rather than the two sharing one. */
  .picks {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    gap: 8px;
  }
  .pick {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
  }
  .label {
    color: var(--muted);
    font-size: 12px;
  }
  table {
    border-collapse: collapse;
    font-size: 13px;
    color: var(--muted);
  }
  th {
    text-align: left;
    font-weight: 600;
    padding: 3px 16px 3px 0;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  td {
    padding: 4px 16px 4px 0;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  .link {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: var(--accent-dim);
    cursor: pointer;
  }
  .link:hover {
    color: var(--accent);
  }
  .more {
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .more:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
</style>
