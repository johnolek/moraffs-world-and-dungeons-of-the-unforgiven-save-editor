<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { app, type Tab } from './lib/app-state.svelte';
  import { rememberNow, restoreGame, restoreRoster, switchGame } from './lib/character/current';
  import { GAME_CHOICES } from './lib/game-choice';
  import { goToTab, isAppHistoryState, recordTab, type AppHistoryState } from './lib/history';
  import { runServerUrl } from './lib/run-server';
  import { tabGroupsFor, tabIsBuilt, tabsFor } from './lib/tabs';
  import { askWhetherAdmin } from './lib/admin/server';
  import Admin from './lib/admin/Admin.svelte';
  import Monsters from './lib/bestiary/Monsters.svelte';
  import AnnouncementsMarker from './lib/boards/AnnouncementsMarker.svelte';
  import AnnouncementTimeline from './lib/boards/AnnouncementTimeline.svelte';
  import Boards from './lib/boards/Boards.svelte';
  import CharacterPanel from './lib/character/CharacterPanel.svelte';
  import Calculators from './lib/calculators/Calculators.svelte';
  import SaveEditor from './lib/editor/SaveEditor.svelte';
  import Formulas from './lib/formulas/Formulas.svelte';
  import MapExplorer from './lib/map/MapExplorer.svelte';
  import FightTab from './lib/play/FightTab.svelte';
  import Play from './lib/play/Play.svelte';
  import MwPlay from './lib/play/mw/MwPlay.svelte';
  import RevPlay from './lib/play/rev/RevPlay.svelte';
  import MwMonsters from './lib/mw-bestiary/MwMonsters.svelte';
  import RevMonsters from './lib/rev-bestiary/RevMonsters.svelte';
  import NewCharacter from './lib/roller/NewCharacter.svelte';
  import Snake from './lib/snake/Snake.svelte';
  import SourceViewer from './lib/source/SourceViewer.svelte';
  import MwSpellReference from './lib/mw-spells/MwSpellReference.svelte';
  import SpellReference from './lib/spells/SpellReference.svelte';
  import Tidbits from './lib/tidbits/Tidbits.svelte';
  import PixelText from './lib/ui/PixelText.svelte';
  import Segmented from './lib/ui/Segmented.svelte';

  const tabs = $derived(tabsFor(app.game));
  const tabGroups = $derived(tabGroupsFor(app.game));

  /** Every tab that has been on screen, which is what {@link tabIsBuilt} answers from. */
  const opened = new SvelteSet<Tab>();
  $effect(() => {
    opened.add(app.tab);
  });

  /** Whether a tab's contents belong in the page (`src/lib/tabs.ts`). */
  const built = (tab: Tab): boolean => tabIsBuilt(app.tab, opened, tab);

  /** A build with no run server hears no announcements, so there is neither a marker nor a
   *  timeline to open. */
  const announcing = runServerUrl() !== null;
  let readingAnnouncements = $state(false);

  onMount(() => {
    // The Admin tab shows for one player and nobody else, so the server is asked whether the
    // passphrase this browser keeps is an admin's. Everybody else is answered no and never sees
    // that there was a tab.
    const admin = askWhetherAdmin();
    // Read the entry first: restoring the game rewrites it to say which tab that game is showing.
    const state = history.state;
    // The roster is read out of the database, which answers a moment later, so the site puts up
    // its default game and tab and settles on the remembered ones as soon as the answer is in.
    void restoreRoster().then(async () => {
      restoreGame();
      if (isAppHistoryState(state)) {
        // A reload on the Admin tab waits for the server to say whether this browser is an
        // admin's: until it has, that tab is not one the site has, and restoring would give up on
        // it and show the fallback tab instead.
        if (state.tab === 'admin') await admin;
        restore(state);
      }
      recordTab(app);
    });
  });

  function onPopState(event: PopStateEvent) {
    if (isAppHistoryState(event.state)) restore(event.state);
  }

  function restore(state: AppHistoryState) {
    // The entry can name a tab that is not there to go to: one an older build of the site had,
    // or one of the other game's, since the game is not part of what history remembers.
    if (tabs.some((entry) => entry.id === state.tab)) app.tab = state.tab;
    app.mapHistory = app.mapHistory.movedTo(state.index);
  }
</script>

<!-- An edit waits a moment before the roster is written, and a page on its way out would take
     that write with it. -->
<svelte:window onpopstate={onPopState} onpagehide={rememberNow} />

<div class="app">
  <header>
    <div class="title">
      {#if announcing}<AnnouncementsMarker onopen={() => (readingAnnouncements = true)} />{/if}
      <h1><PixelText text="Moraff Tools" scale={2} /></h1>
    </div>
    <nav>
      {#each tabGroups as group}
        <div class="group">
          {#each group as entry}
            <button type="button" class="tab" class:active={app.tab === entry.id} onclick={() => goToTab(app, entry.id)}>{entry.label}</button>
          {/each}
        </div>
      {/each}
    </nav>
    <div class="games">
      <Segmented label="Game" choices={GAME_CHOICES} value={app.game} onpick={switchGame} />
    </div>
  </header>
  {#if app.game === 'moraffsWorld'}
    <p class="game-note">
      Moraff's World has the Map, Play, the Save Editor, the Monsters, Spells, New Character and Source so far. The
      rest is on the way.
    </p>
  {:else if app.game === 'revenge'}
    <p class="game-note">
      Moraff's Revenge has the Map, Play, the Save Editor, the Monsters, Tidbits, New Character and Source so far.
      The rest is on the way.
    </p>
  {/if}
  {#if !app.rosterKept}
    <p class="storage-note">
      Not saving: this browser's storage is full or turned off, so nothing from here on is kept.
    </p>
  {/if}
  <!-- A tab is built the first time it is opened and then stays mounted, so the map view, the
       loaded save and a game in progress all survive switching. A tab nobody has opened is not
       in the page at all. -->
  <main class:hidden={app.tab !== 'map'}>
    {#if built('map')}<MapExplorer />{/if}
  </main>
  <main class:hidden={app.tab !== 'play'}>
    <!-- The three games are three executables with three loops, so each brings its own. -->
    {#if built('play')}
      {#if app.game === 'moraffsWorld'}<MwPlay />{:else if app.game === 'revenge'}<RevPlay />{:else}<Play />{/if}
    {/if}
  </main>
  <!-- The one tab that is not kept mounted: it is a page of what the run server has now, so
       opening it reads the boards and the announcements again rather than showing what they said
       the last time it was looked at. -->
  <main class:hidden={app.tab !== 'boards'}>
    {#if app.tab === 'boards'}<Boards />{/if}
  </main>
  <!-- Dungeons of the Unforgiven's alone, so nothing here asks which game is showing. -->
  <main class:hidden={app.tab !== 'fight'}>
    {#if built('fight')}<FightTab />{/if}
  </main>
  <main class:hidden={app.tab !== 'editor'}>
    {#if built('editor')}<SaveEditor />{/if}
  </main>
  <main class:hidden={app.tab !== 'monsters'}>
    <!-- The two games share the list and the search but not a single fact about a monster, so
         each brings its own database rather than one being taught both. -->
    {#if built('monsters')}
      {#if app.game === 'moraffsWorld'}
        <MwMonsters />
      {:else if app.game === 'revenge'}
        <RevMonsters />
      {:else}
        <Monsters />
      {/if}
    {/if}
  </main>
  <main class:hidden={app.tab !== 'spells'}>
    {#if built('spells')}
      {#if app.game === 'moraffsWorld'}<MwSpellReference />{:else}<SpellReference />{/if}
    {/if}
  </main>
  <main class:hidden={app.tab !== 'calculators'}>
    {#if built('calculators')}<Calculators />{/if}
  </main>
  <main class:hidden={app.tab !== 'formulas'}>
    {#if built('formulas')}<Formulas />{/if}
  </main>
  <main class:hidden={app.tab !== 'tidbits'}>
    {#if built('tidbits')}<Tidbits />{/if}
  </main>
  <main class:hidden={app.tab !== 'snake'}>
    {#if built('snake')}<Snake />{/if}
  </main>
  <main class:hidden={app.tab !== 'roller'}>
    {#if built('roller')}<NewCharacter />{/if}
  </main>
  <main class:hidden={app.tab !== 'source'}>
    {#if built('source')}<SourceViewer />{/if}
  </main>
  <!-- Not kept mounted, for the same reason the boards are not: it is a page of what the server
       has now, so opening it reads the server again. -->
  <main class:hidden={app.tab !== 'admin'}>
    {#if app.tab === 'admin'}<Admin />{/if}
  </main>
  <!-- The game keeps its status block along the bottom of the screen, so the character does too. -->
  <CharacterPanel />
  <!-- The timeline is read from whatever tab the reader is on, so it lies over the whole page
       rather than inside one of them. -->
  {#if readingAnnouncements}
    <AnnouncementTimeline onclose={() => (readingAnnouncements = false)} />
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  /* The title, the tabs and the game switch are too wide for a laptop screen together, so the
     switch drops to a line of its own rather than the labels being squeezed. */
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 28px;
    padding: 14px 24px;
    border-bottom: 1px solid var(--line);
  }
  /* The unread marker sits with the title rather than as a header item of its own, so that the
     wide gaps between the header's parts do not leave it stranded. */
  .title {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 8px;
  }
  h1 {
    margin: 0;
    flex-shrink: 0;
    line-height: 0;
    color: var(--accent);
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 24px;
  }
  .group {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tab {
    padding: 6px 12px;
    white-space: nowrap;
    border: none;
    border-radius: 6px;
    background: none;
    font: inherit;
    font-size: 14px;
    color: var(--muted);
    cursor: pointer;
  }
  .tab:hover {
    color: var(--ink);
  }
  .tab.active {
    color: var(--ink);
    background: var(--panel-2);
  }
  /* The switch itself is `Segmented.svelte`; this only puts it at the far end of the header. */
  .games {
    flex-shrink: 0;
    margin-left: auto;
  }
  .game-note {
    margin: 0;
    padding: 8px 24px;
    border-bottom: 1px solid var(--line);
    color: var(--muted);
    font-size: 13px;
  }
  .storage-note {
    margin: 0;
    padding: 8px 24px;
    border-bottom: 1px solid var(--line);
    color: var(--warn);
    font-size: 13px;
  }
  main {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  main.hidden {
    display: none;
  }
</style>
