<!--
  Everyone of one game: every character the server has verified, living and dead and won together,
  in one table the reader filters and sorts.

  The eight ranked boards each answer one question and hold a reader to it. This holds none: what
  the character is now stands beside how far its run got, every column sorts, and the checkboxes
  above take out what the reader is not looking at. Which leaderboards are showing is the page's
  own picker over this, since that one asks the same question of every board. Who is in the table
  is the server's, `server/everyone.ts`; which of them is on screen and in what order is
  `everyone.ts` beside this.
-->
<script lang="ts">
  import type { Leaderboard, PortedGameId } from '../app-state.svelte';
  import { isLeaderboard, leaderboardLabel } from '../character/leaderboard';
  import { statLabels } from '../character/record';
  import {
    classesOf,
    DEFAULT_SORT,
    filterRows,
    sortRows,
    STAT_SORT_KEYS,
    toggledSort,
    type EveryoneSort,
    type EveryoneSortKey,
  } from './everyone';
  import { loadEveryone, NO_EVERYONE, type LoadedEveryone } from './server';
  import {
    BOARDS_PAGE,
    clockHeading,
    EVERYONE,
    NOTHING_TO_SHOW,
    playTimeWords,
    reachWords,
    statusWords,
    whenWords,
  } from './words';
  import type { EveryoneStatus } from '../../../server/everyone';

  interface Props {
    game: PortedGameId;
    /** The leaderboards to show characters of, which the page's own picker decides. */
    leaderboards: readonly Leaderboard[];
    onopen: (characterId: string) => void;
  }

  const { game, leaderboards, onopen }: Props = $props();

  /** The three things that can have become of a character, in the order the boxes offer them. */
  const STATUSES: { id: EveryoneStatus; label: string }[] = [
    { id: 'alive', label: EVERYONE.alive },
    { id: 'dead', label: EVERYONE.dead },
    { id: 'won', label: EVERYONE.won },
  ];

  let table = $state<LoadedEveryone>(NO_EVERYONE);
  let pickedStatuses = $state<EveryoneStatus[]>(STATUSES.map((status) => status.id));
  let pickedClasses = $state<string[]>([]);
  let sort = $state<EveryoneSort>(DEFAULT_SORT);

  /**
   * Which read the rows on screen came from. A reader who changes the game twice quickly has two
   * reads in the air at once, and the answer to the first must not land on top of the second.
   */
  let latest = 0;

  $effect(() => {
    const now = game;
    const mine = ++latest;
    table = NO_EVERYONE;
    void loadEveryone(now).then((read) => {
      if (mine === latest) table = read;
    });
  });

  const classes = $derived(classesOf(table.rows));

  // A box per class the table actually holds, so a table just read starts with all of them
  // ticked and nobody hidden.
  $effect(() => {
    pickedClasses = classes;
  });

  const showing = $derived(
    sortRows(
      filterRows(table.rows, {
        statuses: new Set(pickedStatuses),
        boards: new Set(leaderboards),
        classes: new Set(pickedClasses),
      }),
      sort,
    ),
  );

  /** Which board a character was rolled for. One rolled for neither has nothing to show, and so
   *  has a board a newer server knows about and this build does not. */
  function boardWords(leaderboard: string | null): string {
    return isLeaderboard(leaderboard) ? leaderboardLabel(leaderboard) : NOTHING_TO_SHOW;
  }
</script>

{#snippet sortable(key: EveryoneSortKey, label: string)}
  <th>
    <button type="button" class="heading" onclick={() => (sort = toggledSort(sort, key))}>
      {sort.by === key ? `${label} ${sort.descending ? '▼' : '▲'}` : label}
    </button>
  </th>
{/snippet}

{#if table.rows.length > 0}
  <div class="picks">
    <div class="pick" role="group" aria-label={EVERYONE.showing}>
      <span class="label">{EVERYONE.showing}</span>
      {#each STATUSES as status}
        <label>
          <input type="checkbox" value={status.id} bind:group={pickedStatuses} />
          <span>{status.label}</span>
        </label>
      {/each}
    </div>
    <div class="pick" role="group" aria-label={EVERYONE.ofClass}>
      <span class="label">{EVERYONE.ofClass}</span>
      {#each classes as cls}
        <label>
          <input type="checkbox" value={cls} bind:group={pickedClasses} />
          <span>{cls}</span>
        </label>
      {/each}
    </div>
  </div>
{/if}

{#if table.rows.length === 0}
  <p class="empty">{table.failed ? BOARDS_PAGE.unreachable : EVERYONE.empty}</p>
{:else if showing.length === 0}
  <p class="empty">{EVERYONE.filteredOut}</p>
{:else}
  <table>
    <thead>
      <tr>
        {@render sortable('player', BOARDS_PAGE.player)}
        {@render sortable('name', BOARDS_PAGE.character)}
        {@render sortable('leaderboard', EVERYONE.board)}
        {@render sortable('status', EVERYONE.status)}
        {@render sortable('cls', EVERYONE.cls)}
        {@render sortable('level', BOARDS_PAGE.level)}
        {@render sortable('hp', EVERYONE.hp)}
        {#each statLabels(game) as label, index}
          {@render sortable(STAT_SORT_KEYS[index], label)}
        {/each}
        {@render sortable('deepest', BOARDS_PAGE.reach)}
        {@render sortable('actions', BOARDS_PAGE.actions)}
        {@render sortable('clock', clockHeading(game))}
        {@render sortable('playMs', BOARDS_PAGE.playTime)}
        {@render sortable('at', EVERYONE.when)}
      </tr>
    </thead>
    <tbody>
      {#each showing as row (row.characterId)}
        <tr>
          <td>{row.player}</td>
          <td>
            <button type="button" class="link" onclick={() => onopen(row.characterId)}>{row.name}</button>
          </td>
          <td>{boardWords(row.leaderboard)}</td>
          <td>{statusWords(row.status, row.playing)}</td>
          <td>{row.now?.cls ?? NOTHING_TO_SHOW}</td>
          <td>{row.level}</td>
          <td>{row.now === null ? NOTHING_TO_SHOW : `${row.now.hp}/${row.now.maxHp}`}</td>
          {#each STAT_SORT_KEYS as key, index (key)}
            <td>{row.now?.stats[index] ?? NOTHING_TO_SHOW}</td>
          {/each}
          <td>{reachWords(game, row.deepest)}</td>
          <td>{row.actions}</td>
          <td>{row.clock}</td>
          <td>{playTimeWords(row.playMs, row.timed)}</td>
          <td>{whenWords(row.at)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 28px;
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
  .pick label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    cursor: pointer;
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
  .heading {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-weight: 600;
    color: inherit;
    cursor: pointer;
  }
  .heading:hover {
    color: var(--ink);
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
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
</style>
