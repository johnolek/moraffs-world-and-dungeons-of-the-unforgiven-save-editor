<!--
  One run, as a row on a board opens it: who played it, what it came to, the milestones it reached,
  the verdict the replay gave, and the run written up in words under all of it.

  Everything here is the server's answer to `GET /runs/:id`. A run is only opened from a board, and
  everything on a board has been verified, so nothing here sends the reader's secret.
-->
<script lang="ts">
  import { isLeaderboard, leaderboardLabel } from '../character/leaderboard';
  import { shortCommit } from '../commit';
  import RunJournal from '../journal/RunJournal.svelte';
  import { isRunGame, RUN_GAMES } from '../play/run';
  import { milestoneLine } from '../play/verify';
  import PixelText from '../ui/PixelText.svelte';
  import { loadRun } from './server';
  import { clockWords, gameName, NOTHING_TO_SHOW, OUTCOMES, playTimeWords, RUN_PAGE, STILL_GOING, VERDICTS } from './words';
  import type { RunAnswer } from '../../../server/http';

  let { characterId, onback }: { characterId: string; onback: () => void } = $props();

  let run = $state<RunAnswer | null>(null);
  let unreachable = $state(false);

  $effect(() => {
    const asked = characterId;
    run = null;
    unreachable = false;
    void loadRun(asked).then((read) => {
      // The reader may have gone back and opened another run while this one was on its way.
      if (asked !== characterId) return;
      if (read === null) unreachable = true;
      else run = read;
    });
  });

  const verdict = $derived(run?.verdict ?? null);

  const board = $derived.by(() => {
    const rolledFor = verdict?.leaderboard;
    return isLeaderboard(rolledFor) ? leaderboardLabel(rolledFor) : NOTHING_TO_SHOW;
  });

  /**
   * The game's own words for its clock, its dungeons and its money, which the summary is written
   * in. A run of a game this build has never heard of came from a newer server and has none.
   */
  const names = $derived(run !== null && isRunGame(run.game) ? RUN_GAMES[run.game] : null);

  /** The milestones in the run log's own words, which is what the Play tab shows and what
   *  `verify-run` prints. A game this build has never heard of has no words for them. */
  const milestones = $derived.by(() => {
    const checked = verdict;
    if (checked === null || !isRunGame(checked.game)) return [];
    const game = checked.game;
    return checked.milestones.map((milestone) => milestoneLine(game, milestone));
  });
</script>

<div class="run">
  <button type="button" class="back" onclick={onback}>{RUN_PAGE.back}</button>
  {#if unreachable}
    <p class="empty">{RUN_PAGE.unreachable}</p>
  {:else if run !== null}
    <h2><PixelText text={run.name} scale={2} /></h2>
    <dl>
      <dt>{RUN_PAGE.player}</dt>
      <dd>{run.player}</dd>
      <dt>{RUN_PAGE.character}</dt>
      <dd>{run.name}</dd>
      <dt>{RUN_PAGE.game}</dt>
      <dd>{gameName(run.game)}</dd>
      <dt>{RUN_PAGE.outcome}</dt>
      <dd>{(run.outcome === null ? undefined : OUTCOMES[run.outcome]) ?? STILL_GOING}</dd>
      {#if verdict !== null}
        <dt>{RUN_PAGE.board}</dt>
        <dd>{board}</dd>
        <dt>{RUN_PAGE.actions}</dt>
        <dd>{verdict.actions}</dd>
        <dt>{RUN_PAGE.clock}</dt>
        <dd>{clockWords(verdict.game, verdict.time)}</dd>
        <dt>{RUN_PAGE.playTime}</dt>
        <dd>{playTimeWords(verdict.playMs, verdict.timed)}</dd>
        <dt>{RUN_PAGE.engines}</dt>
        <dd>{verdict.engines.map(shortCommit).join(', ')}</dd>
        <dt>{RUN_PAGE.verdict}</dt>
        <dd>
          {VERDICTS[verdict.status] ?? verdict.status}
          {#if verdict.reason}
            <span class="why">{verdict.reason}</span>
          {/if}
        </dd>
      {/if}
    </dl>
    <h3>{RUN_PAGE.milestones}</h3>
    {#if milestones.length === 0}
      <p class="empty">{RUN_PAGE.nothingReached}</p>
    {:else}
      <ol class="milestones">
        {#each milestones as milestone, at (at)}
          <li>{milestone}</li>
        {/each}
      </ol>
    {/if}
    <!-- A run whose replay wrote no lines -- a game whose journal has not been written, or a
         verdict reached without a replay -- shows the rest of the page and no timeline. -->
    {#if run.journal !== null && run.journal.entries.length > 0 && names !== null}
      <RunJournal entries={run.journal.entries} reached={run.journal} {names} status={run.character} />
    {/if}
  {/if}
</div>

<style>
  .run {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
  }
  .back {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-size: 13px;
    color: var(--accent-dim);
    cursor: pointer;
  }
  .back:hover {
    color: var(--accent);
  }
  h2 {
    margin: 0;
    color: var(--accent);
  }
  h3 {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--muted);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 16px;
    margin: 0;
    font-size: 13px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .why {
    display: block;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.4;
  }
  .milestones {
    margin: 0;
    padding-left: 20px;
    font-size: 13px;
    line-height: 1.6;
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
</style>
