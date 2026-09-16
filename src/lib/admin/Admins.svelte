<!--
  Making another player an admin.

  An admin may look at every character here and delete anybody's, and being one is a flag on a
  player's row and nothing else. The player has to have claimed their name already, and nothing
  takes the flag off again but the database itself.
-->
<script lang="ts">
  import { flagAnotherAdmin } from './server';

  const nameId = $props.id();

  let typedName = $state('');
  let flagging = $state(false);
  let said = $state('');

  async function makeAnAdmin() {
    flagging = true;
    const answer = await flagAnotherAdmin(typedName);
    flagging = false;
    if (!answer.ok) {
      said = answer.message;
      return;
    }
    said = `${answer.body.admin} is an admin now.`;
    typedName = '';
  }
</script>

<section>
  <h3>Admins</h3>
  <p class="note">
    An admin sees every character here and can delete anybody's. The player has to have claimed their name already,
    and nothing takes it off again but the database.
  </p>

  <div class="row">
    <label class="note" for={nameId}>Player:</label>
    <input
      id={nameId}
      type="text"
      maxlength="24"
      placeholder="Name on the boards"
      bind:value={typedName}
      oninput={() => (said = '')}
    />
    <button type="button" onclick={makeAnAdmin} disabled={flagging || typedName.trim() === ''}>Make an admin</button>
  </div>

  {#if said}
    <p class="said" role="status">{said}</p>
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
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  input {
    width: 200px;
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
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
