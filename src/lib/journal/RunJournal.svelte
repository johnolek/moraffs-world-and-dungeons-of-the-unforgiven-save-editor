<!--
  A run read as words: what it came to at the top, and under it the timeline of everything that
  happened, in the stretches it happened in.

  It is handed the entries and nothing else, so the Play tab draws the journal the roster kept
  beside a character's sittings and a run's page on the Boards tab draws the one the server's
  replay wrote. Whether a run is one to show at all is `lock.ts`, which the Play tab asks; a run
  on a board is on the Boards tab because it has ended.
-->
<script lang="ts">
  import Segmented from '../ui/Segmented.svelte';
  import type { JournalEntry } from '../play/journal';
  import { summarizeJournal, summarySections, SUMMARY_HEADINGS, type RunClockTotals, type SummaryNames } from '../play/summary';
  import { journalGroups } from './grouping';
  import { JOURNAL, placeHeading } from './words';

  interface Props {
    /** Every line of the run, oldest first: the sittings one after another. */
    entries: readonly JournalEntry[];
    /** How far the whole run had got, which the entries do not carry. */
    reached: RunClockTotals;
    /** The game's own words for its clock, its dungeons and its money. */
    names: SummaryNames;
  }

  let { entries, reached, names }: Props = $props();

  /** The parts the summary can be read as: the whole run, or one of its modules. */
  const WHOLE_RUN = 'all';

  /** Which part the reader has picked, which is the whole run until they pick a module. */
  let part = $state<string>(WHOLE_RUN);

  /** The modules the run actually reached, in the order it reached them. */
  const modules = $derived([...new Set(entries.map((entry) => entry.module))].sort((one, other) => one - other));

  const parts = $derived([
    { id: WHOLE_RUN, label: JOURNAL.wholeRun },
    ...modules.map((module) => ({ id: String(module), label: names.dungeonName(module) })),
  ]);

  /** The lines the summary is folded from: all of them, or one module's. */
  const counted = $derived(part === WHOLE_RUN ? entries : entries.filter((entry) => String(entry.module) === part));

  /**
   * One module's lines say nothing about how long the character spent in it, so a summary of one
   * is handed no clock at all rather than the whole run's.
   */
  const sections = $derived(
    summarySections(summarizeJournal(counted, part === WHOLE_RUN ? reached : null), names),
  );
  const groups = $derived(journalGroups(entries));

  /** The parts of the summary that are open when the reader has said nothing: what the run came
   *  to and the fighting, which are the two worth reading first. */
  const OPEN_AT_FIRST: readonly string[] = [SUMMARY_HEADINGS.run, SUMMARY_HEADINGS.monsters];

  /** Which sections the reader has opened or closed, by heading. Kept for the same reason the
   *  timeline's stretches are: the journal is redrawn after every key of a game being played. */
  let opened = $state.raw<ReadonlyMap<string, boolean>>(new Map());

  function isOpen(heading: string): boolean {
    return opened.get(heading) ?? OPEN_AT_FIRST.includes(heading);
  }

  function open(heading: string, yes: boolean): void {
    const next = new Map(opened);
    next.set(heading, yes);
    opened = next;
  }

  const allOpen = $derived(sections.every((section) => isOpen(section.heading)));

  function openEvery(): void {
    opened = new Map(sections.map((section) => [section.heading, !allOpen]));
  }

  /**
   * The stretches the reader has folded open or shut, by where each comes in the run. A stretch
   * they have said nothing about follows the default: the newest open and the rest folded away.
   *
   * It is kept because the journal is redrawn after every key of a game being played now, and a
   * stretch the reader opened would otherwise fold itself away again as the run grew.
   */
  let folded = $state.raw<ReadonlyMap<number, boolean>>(new Map());

  function fold(at: number, open: boolean): void {
    const next = new Map(folded);
    next.set(at, open);
    folded = next;
  }
</script>

<div class="journal">
  <h3>{JOURNAL.summary}</h3>
  {#if entries.length === 0}
    <p class="empty">{JOURNAL.nothing}</p>
  {:else}
    <div class="picks">
      {#if modules.length > 1}
        <Segmented label={JOURNAL.whichPart} choices={parts} value={part} onpick={(id) => (part = id)} wrap />
      {/if}
      <button type="button" class="open-every" onclick={openEvery}>
        {allOpen ? JOURNAL.collapseAll : JOURNAL.expandAll}
      </button>
    </div>
    {#each sections as section (section.heading)}
      <details
        class="part"
        open={isOpen(section.heading)}
        ontoggle={(event) => open(section.heading, event.currentTarget.open)}>
        <summary>{section.heading}</summary>
        <ul class="summary">
          {#each section.lines as line, at (at)}
            <li>{line}</li>
          {/each}
        </ul>
      </details>
    {/each}
    <h3>{JOURNAL.timeline}</h3>
    <div class="timeline">
      {#each groups as group, at (at)}
        <details
          open={folded.get(at) ?? at === groups.length - 1}
          ontoggle={(event) => fold(at, event.currentTarget.open)}>
          <summary>{placeHeading(group.floor, group.module, names.dungeonName)}</summary>
          <ol>
            {#each group.entries as entry, line (line)}
              <li><span class="at">{entry.at}</span>{entry.text}</li>
            {/each}
          </ol>
        </details>
      {/each}
    </div>
  {/if}
</div>

<style>
  .journal {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  h3 {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--muted);
  }
  .picks {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .open-every {
    padding: 4px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: none;
    font: inherit;
    font-size: 12px;
    color: var(--muted);
    cursor: pointer;
  }
  .open-every:hover {
    color: var(--ink);
  }
  .part > summary {
    font-size: 12px;
  }
  .summary {
    margin: 0;
    padding-left: 18px;
    font-size: 12px;
    line-height: 1.6;
  }
  /* A long run is thousands of lines, so the timeline scrolls inside its own box rather than
     making the column it sits in as tall as the run. */
  .timeline {
    max-height: 320px;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 8px;
  }
  summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--accent-dim);
  }
  summary:hover {
    color: var(--accent);
  }
  details + details {
    margin-top: 4px;
  }
  ol {
    margin: 4px 0 8px;
    padding: 0;
    list-style: none;
    font-size: 12px;
    line-height: 1.5;
  }
  li {
    display: flex;
    gap: 8px;
  }
  /* How many actions the run had spent when the line was written. */
  .at {
    flex: none;
    min-width: 4ch;
    text-align: right;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
</style>
