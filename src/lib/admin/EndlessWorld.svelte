<!--
  The endless world every endless character rolled from now on is rolled into.

  A world is one number, and it changes when the admin says so and at no other time. What was
  rolled before is left exactly as it was: the worlds already played still have boards of their
  own and the characters in them go on being played there.
-->
<script lang="ts">
  import { loadCurrentEndlessWorld } from '../boards/server';
  import { openNewEndlessWorld } from './server';

  const seedId = $props.id();

  let world = $state<number | null>(null);
  /** The number typed in the box. A number input left empty binds as null, which is the admin
   *  asking the server to draw a world rather than choosing one. */
  let typedSeed = $state<number | null>(null);
  let setting = $state(false);
  let said = $state('');

  void loadCurrentEndlessWorld().then((current) => (world = current));

  async function setANewWorld() {
    setting = true;
    const answer = await openNewEndlessWorld(typedSeed);
    setting = false;
    if (!answer.ok) {
      said = answer.message;
      return;
    }
    said = '';
    typedSeed = null;
    world = answer.body.world;
  }
</script>

<section>
  <h3>Endless world</h3>
  {#if world === null}
    <p class="note">The server has not said which endless world is being rolled into.</p>
  {:else}
    <p class="note">Endless characters are being rolled into world {world}.</p>
  {/if}

  <div class="row">
    <label class="note" for={seedId}>New world:</label>
    <input id={seedId} type="number" min="1" placeholder="Leave empty to draw one" bind:value={typedSeed} />
    <button type="button" onclick={setANewWorld} disabled={setting}>Set a new world</button>
  </div>
  <p class="note">
    An endless character rolled from now on takes the new world. Every one already rolled keeps the world it has.
  </p>

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
    color: var(--warn);
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
