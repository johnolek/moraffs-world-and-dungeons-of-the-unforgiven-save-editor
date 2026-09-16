<!--
  The name this browser goes by on the run server's boards, claimed from the Play tab.

  Nobody signs up: the browser's secret is the player, and this is the one thing they say about
  themselves. A name is not stuck to the device it was claimed on — the claim is answered with a
  passphrase of six words, shown here the once, and a device with no name of its own says that
  name and those words to become the same player. Beside it all is the opt-out, for a player who
  would rather nothing about their characters left the device at all. A build given no server
  address has no boards to be on, so there is nothing here to show.
-->
<script lang="ts">
  import { askWhetherAdmin } from '../admin/server';
  import { claimName, myName, newPassphrase, offTheBoards, setOffTheBoards, signIn } from '../player';
  import { runServerUrl } from '../run-server';

  const id = $props.id();
  const server = runServerUrl();

  const KEEP_IT = 'Write it down. It is how you use this name on another device, and it will not be shown again.';

  let name = $state('');
  let said = $state('');
  let saving = $state(false);
  let off = $state(offTheBoards());

  /** The name the server has for this browser, or null while it has none. */
  let mine = $state<string | null>(null);

  /** Whether the server has been asked yet. Nothing about names is drawn before it has answered,
   *  or a browser that has a name shows the sign-in form for as long as the asking takes. */
  let asked = $state(false);

  /** The words to show, which is the one moment anybody can read them. */
  let passphrase = $state<string | null>(null);
  let copied = $state(false);
  let words: HTMLElement | null = $state(null);

  let otherName = $state('');
  let otherPassphrase = $state('');
  let signingIn = $state(false);
  let signInSaid = $state('');

  if (server !== null) {
    void myName().then((claimed) => {
      if (claimed !== null) {
        mine = claimed;
        name = claimed;
      }
      asked = true;
    });
  }

  function show(drawn: string) {
    passphrase = drawn;
    copied = false;
  }

  async function save() {
    saving = true;
    const answer = await claimName(name);
    saving = false;
    said = answer.ok ? 'Saved.' : answer.message;
    if (!answer.ok) return;
    name = answer.name;
    mine = answer.name;
    if (answer.passphrase !== null) show(answer.passphrase);
    // The browser now keeps different words from the ones the page load asked the server about,
    // so whether they are an admin's is asked again: the Admin tab comes or goes with the answer.
    void askWhetherAdmin();
  }

  async function useAnotherDevicesName() {
    signingIn = true;
    const answer = await signIn(otherName, otherPassphrase);
    signingIn = false;
    signInSaid = answer.ok ? '' : answer.message;
    if (!answer.ok) return;
    otherName = '';
    otherPassphrase = '';
    name = answer.name;
    mine = answer.name;
    said = 'Signed in.';
    void askWhetherAdmin();
  }

  async function drawANewOne() {
    saving = true;
    const answer = await newPassphrase();
    saving = false;
    if (!answer.ok) {
      said = answer.message;
      return;
    }
    show(answer.passphrase);
    void askWhetherAdmin();
  }

  async function copy() {
    if (passphrase === null) return;
    try {
      await navigator.clipboard.writeText(passphrase);
      copied = true;
    } catch {
      // A browser that will not put anything on the clipboard by itself has the words selected
      // instead, so copying them by hand is one key.
      selectTheWords();
    }
  }

  function selectTheWords() {
    if (words === null) return;
    const range = document.createRange();
    range.selectNodeContents(words);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
</script>

{#if server !== null}
  <div class="board-name">
    <label class="note" for={id}>Name on the boards:</label>
    <div class="row">
      <input {id} type="text" maxlength="24" bind:value={name} oninput={() => (said = '')} />
      <button type="button" onclick={save} disabled={saving || name.trim() === ''}>Save</button>
    </div>
    {#if said}
      <div class="said" role="status">{said}</div>
    {/if}

    {#if passphrase !== null}
      <div class="reveal">
        <div class="note">Your passphrase:</div>
        <div class="words" bind:this={words}>{passphrase}</div>
        <div class="row">
          <button type="button" onclick={copy}>Copy</button>
          <button type="button" onclick={() => (passphrase = null)}>Done</button>
        </div>
        <div class="said" role="status">{copied ? 'Copied.' : KEEP_IT}</div>
      </div>
    {/if}

    {#if asked && mine === null}
      <div class="sign-in">
        <div class="note">Or use a name from another device:</div>
        <input type="text" maxlength="24" placeholder="Name" aria-label="Name" bind:value={otherName} />
        <div class="row">
          <input
            type="text"
            placeholder="Passphrase"
            aria-label="Passphrase"
            bind:value={otherPassphrase}
            oninput={() => (signInSaid = '')}
          />
          <button
            type="button"
            onclick={useAnotherDevicesName}
            disabled={signingIn || otherName.trim() === '' || otherPassphrase.trim() === ''}
          >
            Sign in
          </button>
        </div>
        {#if signInSaid}
          <div class="said" role="status">{signInSaid}</div>
        {/if}
      </div>
    {:else if asked}
      <button class="another" type="button" onclick={drawANewOne} disabled={saving}>New passphrase</button>
    {/if}

    <label class="opt-out">
      <input type="checkbox" bind:checked={off} onchange={() => setOffTheBoards(off)} />
      <span>Keep my runs off the boards</span>
    </label>
  </div>
{/if}

<style>
  .note {
    display: block;
    margin-bottom: 4px;
    color: var(--muted);
    font-size: 12px;
  }
  .row {
    display: flex;
    gap: 4px;
  }
  input {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
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
  .said {
    margin-top: 4px;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.4;
  }
  .reveal,
  .sign-in {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .sign-in > input {
    margin-bottom: 4px;
  }
  .words {
    padding: 6px 8px;
    margin-bottom: 4px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel-2);
    color: var(--ink);
    font-family: ui-monospace, monospace;
    font-size: 13px;
    line-height: 1.4;
    overflow-wrap: anywhere;
    user-select: all;
  }
  .another {
    margin-top: 8px;
  }
  .opt-out {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    color: var(--muted);
    font-size: 12px;
    cursor: pointer;
  }
  .opt-out input {
    flex: none;
    min-width: 0;
    padding: 0;
  }
</style>
