<script lang="ts">
  import { app, type RosterEntry } from '../app-state.svelte';
  import { chooseCharacter, forgetCharacter, renameCharacter, restoreCharacterImport } from './current';
  import { characterTypeWords } from './leaderboard';
  import { characterStatus } from './record';

  interface Props {
    /** The characters to list, which is always one game's worth of the roster. */
    entries: RosterEntry[];
    /** Which of them the site is working on, marked in the list. */
    currentId: string | null;
    /** Called after a character has been picked, for a caller that folds the list away again. */
    onpicked?: () => void;
  }

  let { entries, currentId, onpicked }: Props = $props();

  /** The character whose name is being typed over, if any. */
  let renaming = $state<string | null>(null);
  let typedName = $state('');

  /** The level in the list is read out of the record, which changes under it as the current
   *  character is edited. */
  const levelOf = (entry: RosterEntry) => {
    void app.characterVersion;
    return characterStatus(entry)?.lev ?? 0;
  };
  const editedOn = (when: string) => new Date(when).toLocaleDateString();

  function choose(id: string) {
    chooseCharacter(id);
    onpicked?.();
  }

  function startRename(entry: RosterEntry) {
    renaming = entry.id;
    typedName = entry.name;
  }

  function commitRename() {
    if (renaming) renameCharacter(renaming, typedName);
    renaming = null;
  }

  function onRenameKey(event: KeyboardEvent) {
    if (event.key === 'Enter') commitRename();
    if (event.key === 'Escape') renaming = null;
  }

  function remove(entry: RosterEntry) {
    if (confirm(`Remove ${entry.name} from this browser?`)) forgetCharacter(entry.id);
  }

  function focusInput(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<table class="chooser">
  <thead>
    <tr><th>Character</th><th>Level</th><th>Number</th><th>From</th><th>Type</th><th>Edited</th><th></th></tr>
  </thead>
  <tbody>
    {#each entries as entry (entry.id)}
      <tr class:current={entry.id === currentId}>
        <td>
          {#if renaming === entry.id}
            <input class="rename" bind:value={typedName} onkeydown={onRenameKey} onblur={commitRename} use:focusInput />
          {:else}
            <button type="button" class="link" onclick={() => choose(entry.id)}>{entry.name}</button>
          {/if}
        </td>
        <td>{levelOf(entry)}{entry.dead ? ' · dead' : ''}</td>
        <td>{entry.slot ?? '—'}</td>
        <td>{entry.importedBytes ? 'imported' : 'rolled'}</td>
        <td>{characterTypeWords(entry.leaderboard, entry.lock)}</td>
        <td>{editedOn(entry.editedAt)}</td>
        <td class="actions">
          <button type="button" class="link" onclick={() => startRename(entry)}>Rename</button>
          {#if entry.importedBytes}
            <button type="button" class="link" onclick={() => restoreCharacterImport(entry.id)}>Restore the import</button>
          {/if}
          <button type="button" class="link" onclick={() => remove(entry)}>Remove</button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .chooser {
    margin-bottom: 10px;
    border-collapse: collapse;
    font-size: 12px;
    color: var(--muted);
  }
  .chooser th {
    text-align: left;
    font-weight: 600;
    padding: 3px 16px 3px 0;
    border-bottom: 1px solid var(--line);
  }
  .chooser td {
    padding: 4px 16px 4px 0;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  .chooser tr.current td {
    color: var(--ink);
  }
  .chooser .actions {
    display: flex;
    gap: 12px;
  }
  .rename {
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--accent-dim);
    border-radius: 4px;
    padding: 2px 6px;
    font: inherit;
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
