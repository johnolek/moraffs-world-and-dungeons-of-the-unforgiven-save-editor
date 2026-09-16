<!--
  Every character the run server has, whoever's it is, and a way to delete any of them.

  It is the one list with everything in it: a board shows only what a replay has passed and a
  player's own roster shows only their own. The server hands out fifty at a time, and the filter
  box looks at what has been read so far, so a character further back is reached by pressing More.
-->
<script lang="ts">
  import type { AdminCharacterRow } from '../../../server/admins';
  import { gameName, whenWords } from '../boards/words';
  import { characterStatusWords, characterTypeWords, charactersMatching } from './characters';
  import { forgetCharacter, loadCharacters } from './server';

  const filterId = $props.id();

  let rows = $state<AdminCharacterRow[]>([]);
  let page = $state(0);
  let more = $state(false);
  let reading = $state(false);
  let said = $state('');
  let typed = $state('');

  const showing = $derived(charactersMatching(rows, typed));

  void readAPage();

  async function readAPage() {
    reading = true;
    const answer = await loadCharacters(page + 1);
    reading = false;
    if (!answer.ok) {
      said = answer.message;
      return;
    }
    said = '';
    rows = [...rows, ...answer.body.rows];
    page = answer.body.page;
    more = answer.body.more;
  }

  async function forget(row: AdminCharacterRow) {
    const warning =
      `Delete ${row.name}, ${row.player}'s character in ${gameName(row.game)}, from the server?` +
      ' Its run, the verdict on it and everything announced about it go too, and none of it comes back.';
    if (!confirm(warning)) return;
    const answer = await forgetCharacter(row.characterId);
    if (!answer.ok) {
      said = answer.message;
      return;
    }
    said = '';
    rows = rows.filter((one) => one.characterId !== row.characterId);
  }
</script>

<section>
  <h3>Characters</h3>
  <p class="note">Every character the server has, whoever's it is, the newest first.</p>

  <div class="row">
    <label class="note" for={filterId}>Filter:</label>
    <input id={filterId} type="text" placeholder="Player or character" bind:value={typed} />
  </div>
  <p class="note">The filter looks at the characters read so far. Press More to reach further back.</p>

  {#if said}
    <p class="said" role="status">{said}</p>
  {/if}

  {#if showing.length > 0}
    <table>
      <thead>
        <tr><th>Player</th><th>Character</th><th>Game</th><th>Type</th><th>Status</th><th>Last heard</th><th></th></tr>
      </thead>
      <tbody>
        {#each showing as row (row.characterId)}
          <tr>
            <td>{row.player}</td>
            <td>{row.name}</td>
            <td>{gameName(row.game)}</td>
            <td>{characterTypeWords(row.type)}</td>
            <td>{characterStatusWords(row.status)}</td>
            <td>{whenWords(row.lastHeard)}</td>
            <td><button type="button" class="link" onclick={() => forget(row)}>Delete</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else if !reading}
    <p class="note">{rows.length === 0 ? 'The server has no characters at all.' : 'No character read so far matches.'}</p>
  {/if}

  {#if reading}
    <p class="note">Reading…</p>
  {:else if more}
    <button type="button" onclick={readAPage}>More</button>
  {/if}
</section>

<style>
  section {
    margin-bottom: 28px;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 14px;
    color: var(--ink);
  }
  .note {
    margin: 0 0 8px;
    color: var(--muted);
    font-size: 12px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .row .note {
    margin: 0;
  }
  .said {
    margin: 0 0 8px;
    color: var(--warn);
    font-size: 12px;
  }
  input {
    min-width: 0;
    padding: 4px 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 13px;
  }
  button {
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  table {
    margin-bottom: 10px;
    border-collapse: collapse;
    font-size: 12px;
    color: var(--muted);
  }
  th {
    text-align: left;
    font-weight: 600;
    padding: 3px 16px 3px 0;
    border-bottom: 1px solid var(--line);
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
</style>
