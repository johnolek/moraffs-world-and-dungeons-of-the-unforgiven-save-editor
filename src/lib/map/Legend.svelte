<script lang="ts">
  import type { MapFloorSummary } from '../game/floor-summary';
  import SectionHeading from '../ui/SectionHeading.svelte';
  import type { MapGame, MapSquare } from './game';
  import { GLYPH_LABELS } from './labels';
  import LegendSample from './LegendSample.svelte';
  import type { LegendKind } from './marks';

  interface Props {
    game: MapGame;
    /** Counts shown under each entry. */
    summary: MapFloorSummary;
    /** Label of the entry whose squares stay marked until it is clicked again or cleared. */
    pinned: string | null;
    /** Squares of this floor a loaded explored map has seen, or null when none is loaded. */
    exploredCount: number | null;
    onhover: (kind: LegendKind | null) => void;
    onpin: (label: string | null, kind: LegendKind | null) => void;
  }

  let { game, summary, pinned, exploredCount, onhover, onpin }: Props = $props();

  function toggle(label: string, kind: LegendKind) {
    if (pinned === label) onpin(null, null);
    else onpin(label, kind);
  }

  /** A square drawn beside a legend entry. The building number is written into both games'
   *  fields, so whichever one the game reads gives the sample the right colour. */
  function sample(overrides: Partial<MapSquare>, building = 0): MapSquare {
    return { n: 3, s: 3, w: 3, e: 3, solid: false, ladder: 0, chute: 0, falseFloor: false, trapdoor: -1, town: building, surface: building, ...overrides };
  }

  /** Whether the entry is the trap door one, and this floor is a floor that can have them:
   *  Dungeons of the Unforgiven puts none in a town, Moraff's World does. */
  function isTrapdoor(kind: LegendKind): boolean {
    return kind.kind === 'glyph' && kind.glyph === 'trapdoor' && (summary.floor > 0 || summary.trapdoors > 0);
  }

  const entries = $derived<{ label: string; square: MapSquare; kind: LegendKind; count: number }[]>([
    { label: 'Open square', square: sample({ n: 0, s: 0 }), kind: { kind: 'open' }, count: summary.open },
    { label: 'Door', square: sample({ n: 1, s: 0 }), kind: { kind: 'side', side: 1 }, count: summary.doors },
    ...(game.features.secretDoors
      ? [{ label: 'Secret door', square: sample({ n: 2, s: 0 }), kind: { kind: 'side', side: 2 } as LegendKind, count: summary.secretDoors }]
      : []),
    ...(game.modules ? [{ label: 'Teleporter', square: sample({ n: 4, s: 0 }), kind: { kind: 'side', side: 4 } as LegendKind, count: summary.teleporterSquares }] : []),
    { label: GLYPH_LABELS.down, square: sample({ n: 0, s: 0, ladder: 1 }), kind: { kind: 'glyph', glyph: 'down' }, count: summary.down },
    { label: GLYPH_LABELS.up, square: sample({ n: 0, s: 0, ladder: -1 }), kind: { kind: 'glyph', glyph: 'up' }, count: summary.up },
    ...(game.features.trapdoors
      ? [{ label: GLYPH_LABELS.trapdoor, square: sample({ n: 0, s: 0, trapdoor: 5 }), kind: { kind: 'glyph', glyph: 'trapdoor' } as LegendKind, count: summary.trapdoors }]
      : []),
    { label: GLYPH_LABELS.chute, square: sample({ n: 0, s: 0, chute: 1 }), kind: { kind: 'glyph', glyph: 'chute' }, count: summary.chutes },
    ...(game.features.falseFloors
      ? [{ label: GLYPH_LABELS.falseFloor, square: sample({ n: 0, s: 0, falseFloor: true }), kind: { kind: 'glyph', glyph: 'falseFloor' } as LegendKind, count: summary.falseFloors }]
      : []),
    ...game.buildings.map(({ label }, index) => ({
      label,
      square: sample({ n: 0, s: 0 }, index + 1),
      kind: { kind: 'town', building: index + 1 } as LegendKind,
      count: summary.town[index],
    })),
    ...(exploredCount === null
      ? []
      : [{ label: 'Explored', square: sample({ n: 0, s: 0 }), kind: { kind: 'explored' } as LegendKind, count: exploredCount }]),
  ]);

  const present = $derived(entries.filter(({ count }) => count > 0));
  const absent = $derived(entries.filter(({ count }) => count === 0));

  const trapdoorDestinations = $derived(
    Object.entries(summary.trapdoorDests)
      .map(([floor, count]) => ({ floor: Number(floor), count, label: `to ${floor} (${count})` }))
      .sort((a, b) => a.floor - b.floor),
  );
</script>

<section>
  <SectionHeading title="Legend">
    {#if pinned}
      <button class="clear" onclick={() => onpin(null, null)}>Clear</button>
    {/if}
  </SectionHeading>
  <ul class="entries">
    {#each present as { label, square, kind, count }}
      <li class:wide={isTrapdoor(kind)}>
        <button
          type="button"
          class="entry"
          class:pinned={pinned === label}
          onpointerenter={() => onhover(kind)}
          onpointerleave={() => onhover(null)}
          onclick={() => toggle(label, kind)}
        >
          <LegendSample {square} {game} explored={kind.kind === 'explored'} />
          <span class="text">
            <span>{label}</span>
            <span class="count">{count}</span>
          </span>
        </button>
        {#if isTrapdoor(kind)}
          <ul class="destinations">
            {#each trapdoorDestinations as { floor, label }}
              <li>
                <button
                  type="button"
                  class="destination"
                  class:pinned={pinned === label}
                  onpointerenter={() => onhover({ kind: 'trapdoorTo', floor })}
                  onpointerleave={() => onhover(null)}
                  onclick={() => toggle(label, { kind: 'trapdoorTo', floor })}
                >
                  {label}
                </button>
              </li>
            {/each}
          </ul>
          {#if summary.trapdoorLanding}
            <p class="landing">Trap doors to this floor land at {summary.trapdoorLanding[0]}, {summary.trapdoorLanding[1]}.</p>
          {/if}
        {/if}
      </li>
    {/each}
  </ul>
  {#if absent.length}
    <h3 class="absent-heading">Not present on this floor</h3>
    <ul class="entries absent">
      {#each absent as { label, square, kind }}
        <li>
          <span class="entry">
            <LegendSample {square} {game} explored={kind.kind === 'explored'} />
            <span class="text">{label}</span>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .clear {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 11px;
    color: var(--muted);
    text-transform: none;
    letter-spacing: 0;
    cursor: pointer;
  }
  .clear:hover {
    color: var(--ink);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .entries {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 12px;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .destinations {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 6px;
    margin: 2px 0 0 26px;
  }
  .destination {
    padding: 2px 4px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .destination:hover {
    background: var(--panel-2);
    color: var(--ink);
  }
  .destination.pinned {
    background: var(--panel-2);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .landing {
    margin: 4px 0 0 30px;
    font-size: 12px;
    color: var(--muted);
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 8px;
    width: calc(100% + 8px);
    padding: 2px 4px;
    margin: 0 -4px;
    white-space: nowrap;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .text {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }
  .count {
    color: var(--muted);
  }
  button.entry:hover {
    background: var(--panel-2);
  }
  .entry.pinned {
    background: var(--panel-2);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .absent-heading {
    margin: 10px 0 6px;
    font-size: 11px;
    font-weight: normal;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .absent .entry {
    color: var(--muted);
    opacity: 0.55;
    cursor: default;
  }
</style>
