<script lang="ts">
  import { app } from '../app-state.svelte';
  import { goToTab } from '../history';
  import { sourceFiles, type SourceFile } from '../source/ports';
  import { helpCycleColour } from '../ui/help-colours';
  import PixelText from '../ui/PixelText.svelte';
  import { TIDBITS_FILES } from './files';
  import { parseTidbits, searchTidbits, type Inline, type LinkTarget } from './markdown';

  const all = $derived(parseTidbits(TIDBITS_FILES[app.game] ?? ''));

  /** Each entry's banner colour, worked out from where it sits in the whole document rather than
   *  in what the search has left, so the colours do not shuffle as the box is typed in. */
  const colours = $derived(
    new Map(all.flatMap((section) => section.entries).map((entry, index) => [entry.id, helpCycleColour(index)])),
  );

  let search = $state('');

  const sections = $derived(searchTidbits(all, search));

  function jumpTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** The file an entry names by its bare name, as the Source tab keys it: by its whole path.
   *  Each game has its own port, so the same bare name is a different file under each. */
  function sourceFile(name: string): SourceFile | null {
    return sourceFiles(app.game).find((file) => file.endsWith(`/${name}`)) ?? null;
  }

  function open(target: LinkTarget): void {
    if (target.kind === 'formula') {
      app.requestedFormula = target.id;
      goToTab(app, 'formulas');
      return;
    }
    if (target.kind === 'decompiled') {
      app.requestedSource = { kind: 'c', name: target.name };
      goToTab(app, 'source');
      return;
    }
    if (target.kind === 'port') {
      const file = sourceFile(target.file);
      if (!file) return;
      app.requestedSource = { kind: 'ts', file, name: target.name };
      goToTab(app, 'source');
    }
  }
</script>

<!--
  Written without a break between the tags: whitespace in the template would come out as a space
  in the middle of a sentence, in front of the full stop that follows a link.
-->
{#snippet run(nodes: Inline[])}{#each nodes as node}{#if node.kind === 'code'}<code
        >{node.text}</code
      >{:else if node.kind === 'bold'}<strong>{node.text}</strong>{:else if node.kind === 'link'}{@const target =
        node.target}{#if target.kind === 'url'}<a
          href={target.href}
          target="_blank"
          rel="noreferrer">{node.text}</a
        >{:else}<button type="button" class="link" onclick={() => open(target)}>{node.text}</button
        >{/if}{:else}{node.text}{/if}{/each}{/snippet}

<div class="tidbits">
  <div class="index">
    <input type="search" placeholder="Search tidbits" bind:value={search} />
    <nav class="scroll">
      {#each sections as section}
        <h3>{section.title}</h3>
        <ul>
          {#each section.entries as entry}
            <li><button type="button" onclick={() => jumpTo(entry.id)}>{entry.title}</button></li>
          {/each}
        </ul>
      {/each}
      {#if sections.length === 0}
        <p class="empty">No tidbits match.</p>
      {/if}
    </nav>
  </div>
  <div class="entries">
    {#each sections as section}
      <section>
        <h2 id={section.id}><PixelText text={section.title} scale={2} /></h2>
        {#each section.entries as entry}
          <article id={entry.id}>
            {#if entry.banner}
              <p class="banner" style:color={colours.get(entry.id)}>{entry.banner}</p>
            {/if}
            <h3>{entry.title}</h3>
            {#each entry.blocks as block}
              {#if block.kind === 'paragraph'}
                <p>{@render run(block.content)}</p>
              {:else}
                <ul>
                  {#each block.items as item}
                    <li>{@render run(item)}</li>
                  {/each}
                </ul>
              {/if}
            {/each}
          </article>
        {/each}
      </section>
    {/each}
    {#if sections.length === 0}
      <p class="empty">No tidbits match.</p>
    {/if}
  </div>
</div>

<style>
  .tidbits {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .index {
    width: 300px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-right: 1px solid var(--line);
    background: var(--panel);
  }
  input {
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 7px 9px;
    font: inherit;
    font-size: 13px;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
  nav h3 {
    position: sticky;
    top: 0;
    margin: 12px 0 2px;
    padding: 4px 0;
    background: var(--panel);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  nav h3:first-child {
    margin-top: 0;
  }
  nav ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  nav li button {
    display: block;
    width: 100%;
    padding: 4px 6px;
    border: none;
    border-radius: 4px;
    background: none;
    font: inherit;
    font-size: 13px;
    text-align: left;
    color: var(--muted);
    cursor: pointer;
  }
  nav li button:hover {
    color: var(--ink);
    background: var(--panel-2);
  }
  .entries {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0 24px 40px;
  }
  section {
    margin-bottom: 28px;
  }
  .entries h2 {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: 0 0 14px;
    padding: 20px 0 8px;
    background: var(--bg);
    line-height: 0;
    color: var(--accent);
    border-bottom: 1px solid var(--line);
    scroll-margin-top: 0;
  }
  article {
    max-width: 92ch;
    margin-bottom: 16px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 6px;
    scroll-margin-top: 50px;
  }
  .banner {
    margin: 0 0 6px;
    font-family: var(--font-game);
    font-size: 20px;
    line-height: 1.3;
  }
  article h3 {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--muted);
  }
  article p {
    margin: 0 0 10px;
    font-size: 14px;
    line-height: 1.6;
  }
  article p:last-child {
    margin-bottom: 0;
  }
  article ul {
    margin: 0 0 10px;
    padding-left: 20px;
    font-size: 14px;
    line-height: 1.6;
  }
  article ul:last-child {
    margin-bottom: 0;
  }
  code {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 12px;
    color: var(--mw-cyan);
  }
  a,
  .link {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: var(--mw-cyan);
    text-decoration: none;
    cursor: pointer;
  }
  a:hover,
  .link:hover {
    text-decoration: underline;
  }
  .entries .empty {
    padding-top: 20px;
  }
  .empty {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }
</style>
