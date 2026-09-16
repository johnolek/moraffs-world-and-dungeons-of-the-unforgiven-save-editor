<script lang="ts">
  import { app, currentEntry, type Tab } from '../app-state.svelte';
  import { announcementDid, announcementWho } from '../boards/announce';
  import { latestAnnouncement } from '../boards/announcement-feed.svelte';
  import { agoWords } from '../boards/words';
  import { GAMES, UNFORGIVEN } from '../editor/games';
  import { goToTab } from '../history';
  import { helpCycleColour } from '../ui/help-colours';
  import CharacterList from './CharacterList.svelte';
  import CharacterStats from './CharacterStats.svelte';
  import { EXP_NEEDED_HEADING, expNeededRows } from './exp-needed';
  import { characterStatus, collapsedLine, withSeparators } from './record';
  import { readStored, writeStored } from './storage';

  /** Whether the panel was left folded away, remembered between visits. */
  const COLLAPSED_KEY = 'moraff-tools.character-panel-collapsed';

  /** How often the moment "how long ago" is counted against is read again. */
  const AGO_TICK_MS = 60000;

  let collapsed = $state(readStored(COLLAPSED_KEY) === 'yes');
  let choosing = $state(false);
  let showingExpNeeded = $state(false);

  /** The newest thing the run server has announced, which is on every tab. A build with no run
   *  server has none and shows nothing here. */
  const latest = $derived(latestAnnouncement());
  let now = $state(new Date());

  $effect(() => {
    if (latest === null) return;
    const tick = setInterval(() => (now = new Date()), AGO_TICK_MS);
    return () => clearInterval(tick);
  });

  const character = $derived(currentEntry());
  const status = $derived.by(() => {
    void app.characterVersion;
    return character ? characterStatus(character) : null;
  });
  const game = $derived(GAMES.find((entry) => entry.id === character?.game) ?? null);
  const expRows = $derived(status && showingExpNeeded ? expNeededRows(status.lev, status.hard) : []);
  /** The characters of the game the site is showing; the others are only counted. */
  const ours = $derived(app.roster.filter((entry) => entry.game === app.game));
  const elsewhere = $derived(app.roster.length - ours.length);
  /** The games those other characters belong to, since there are more than two to be under. */
  const elsewhereGames = $derived(
    GAMES.filter((entry) => entry.id !== app.game && app.roster.some((character) => character.game === entry.id)).map(
      (entry) => entry.displayName,
    ),
  );
  const elsewhereLine = $derived(`${elsewhere} more character${elsewhere === 1 ? '' : 's'} under ${elsewhereGames.join(' and ')}.`);

  function toggle() {
    collapsed = !collapsed;
    if (collapsed) {
      choosing = false;
      showingExpNeeded = false;
    }
    writeStored(COLLAPSED_KEY, collapsed ? 'yes' : 'no');
  }

  function show(tab: Tab) {
    goToTab(app, tab);
  }

  function showRun(characterId: string) {
    app.requestedRun = characterId;
    goToTab(app, 'boards');
  }

  function showOnMap() {
    if (!status) return;
    app.requestedPlace = { ...status.place };
    goToTab(app, 'map');
  }

</script>

<section class="character-panel">
  <div class="body">
    {#if expRows.length > 0}
      <!-- The game's own EXP NEEDED screen, on the black it prints its screens on. -->
      <div class="exp-needed">
        <div class="line">{EXP_NEEDED_HEADING}</div>
        {#each expRows as row}
          <div class="line">{row.level}) {withSeparators(row.exp)}</div>
        {/each}
      </div>
    {/if}

    {#if choosing}
      {#if ours.length > 0}
        <CharacterList entries={ours} currentId={character?.id ?? null} onpicked={() => (choosing = false)} />
      {/if}
      {#if elsewhere > 0}
        <p class="elsewhere">{elsewhereLine}</p>
      {/if}
    {/if}
    {#if !character || !status}
      {#if app.roster.length > 0}
        <div class="identity">
          <button type="button" class="link" onclick={() => (choosing = !choosing)}>Characters ({ours.length})</button>
        </div>
      {/if}
      <div class="status empty">
        <span class="line">
          NO CHARACTER.
          <button type="button" class="dos-link" onclick={() => show('editor')}>LOAD A SAVE</button>
          OR
          <button type="button" class="dos-link" onclick={() => show('roller')}>ROLL ONE</button>.
        </span>
      </div>
    {:else if collapsed}
      <div class="status">
        <span class="line green">{collapsedLine(status, character.name)}</span>
      </div>
    {:else}
      <div class="identity">
        <strong>{character.name}</strong>
        {#if character.dead}<span class="dead">Dead</span>{/if}
        <span>{status.cls}</span>
        {#if game}<span>{game.displayName}</span>{/if}
        {#if character.slot !== null}<span>Character {character.slot}</span>{/if}
        <button type="button" class="link" onclick={() => show('editor')}>Edit in Save Editor</button>
        <button type="button" class="link" onclick={() => show('roller')}>Roll another</button>
        <button type="button" class="link" onclick={showOnMap}>Show on map</button>
        {#if character.game === UNFORGIVEN.id}
          <button type="button" class="link" onclick={() => (showingExpNeeded = !showingExpNeeded)}>Exp needed</button>
        {/if}
        <button type="button" class="link" onclick={() => (choosing = !choosing)}>Characters ({ours.length})</button>
      </div>
      <CharacterStats {status} />
    {/if}
  </div>

  {#if latest}
    <p class="latest" style:--said={helpCycleColour(latest.id)}>
      <span class="said">
        <button type="button" class="who" onclick={() => showRun(latest.characterId)}
          >{announcementWho(latest)}</button
        >
        {announcementDid(latest)}
      </span>
      <span class="ago">{agoWords(latest.at, now)}</span>
    </p>
  {/if}

  {#if character && status}
    <button type="button" class="chevron" aria-label={collapsed ? 'Show the whole character' : 'Fold the character away'} onclick={toggle}>
      {collapsed ? '▴' : '▾'}
    </button>
  {/if}
</section>

<style>
  .dead {
    padding: 1px 8px;
    border-radius: 999px;
    background: #5a1020;
    color: #ffd9df;
    font-size: 12px;
  }
  .character-panel {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 16px;
    flex-wrap: wrap;
    padding: 10px 44px 10px 24px;
    border-top: 1px solid var(--line);
  }
  /* The character keeps the width it would have taken on its own and the announcement has what is
     left over, so no announcement is long enough to move anything about the character. Where the
     two of them do not fit, the announcement drops to a line of its own underneath. */
  .body {
    flex: 0 1 auto;
  }
  .latest {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 8px;
    flex: 1 1 0;
    min-width: 16em;
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  /* The same size the announcements down the side of the boards are drawn at. */
  .latest .said {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-family: var(--font-game);
    font-size: 15px;
    color: var(--said);
  }
  .latest .who {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  /* A DOS menu marks what it is on by swapping its colours over, and so does this. */
  .latest .who:hover,
  .latest .who:focus-visible {
    background: var(--said);
    color: #000;
    text-decoration: none;
    outline: none;
  }
  .latest .ago {
    flex: none;
  }
  /* The game's own status block: a green panel with the numbers in a DOS terminal face. */
  .status {
    display: inline-flex;
    gap: 26px;
    padding: 5px 12px 7px;
    border: 2px solid #17a017;
    border-radius: 4px;
    background: #0a6a0a;
  }
  .line {
    font-family: var(--font-dos);
    font-size: 20px;
    line-height: 1.15;
    white-space: nowrap;
    color: var(--ink);
  }
  .green {
    color: var(--mw-green);
  }
  .dos-link {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: var(--mw-cyan);
    text-decoration: underline;
    cursor: pointer;
  }
  .empty .line {
    color: var(--mw-green);
  }
  .identity {
    display: flex;
    margin-bottom: 8px;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 13px;
    color: var(--muted);
  }
  .identity strong {
    color: var(--ink);
    font-size: 14px;
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
  .exp-needed {
    display: inline-block;
    margin-bottom: 10px;
    padding: 8px 16px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #000;
    color: var(--mw-green);
  }
  .exp-needed .line {
    color: var(--mw-green);
  }
  .elsewhere {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 12px;
  }
  .chevron {
    position: absolute;
    top: 8px;
    right: 12px;
    padding: 2px 8px;
    border: none;
    background: none;
    color: var(--muted);
    font-size: 14px;
    cursor: pointer;
  }
  .chevron:hover {
    color: var(--ink);
  }
</style>
