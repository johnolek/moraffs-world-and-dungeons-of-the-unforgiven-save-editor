<!--
  The run server's own controls, for the one player it answered as an admin.

  Everything here needs the passphrase this browser keeps, and everything here is a page of what
  the server has now rather than of anything the browser remembers, so the tab is not kept mounted
  and opening it asks again. Nobody who is not an admin is offered the tab at all
  (`src/lib/tabs.ts`).
-->
<script lang="ts">
  import { app } from '../app-state.svelte';
  import Characters from './Characters.svelte';
</script>

<div class="admin">
  <h2>Admin</h2>
  <p class="note">The run server's own controls, for {app.admin}.</p>
  <Characters />
</div>

<style>
  .admin {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 16px 24px;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 16px;
    color: var(--ink);
  }
  .note {
    margin: 0 0 16px;
    color: var(--muted);
    font-size: 12px;
  }
</style>
