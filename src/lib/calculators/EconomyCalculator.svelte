<script lang="ts">
  import { untrack } from 'svelte';
  import { app, watchingCharacterOn } from '../app-state.svelte';
  import type { SaveRecord } from '../game/dotu-files.js';
  import data from '../game/dotu-data.json';
  import { TEMPLE } from '../game/dotu-mech.js';
  import { BOTTOM_LEVEL } from '../game/unfmap.js';
  import BarChart from '../ui/BarChart.svelte';
  import SourceLink from '../source/SourceLink.svelte';
  import SectionHeading from '../ui/SectionHeading.svelte';
  import { changedFields, currentCharacter } from './character';
  import FieldLabel from './FieldLabel.svelte';
  import {
    innBreakEvenChildren,
    moneyPerKill,
    refundShare,
    restCost,
    restCostByLevel,
    STORE_BREAK_EVEN_CHILDREN,
    tableLevels,
    type Rest,
  } from './economy';
  import FloorPicker from './FloorPicker.svelte';

  let level = $state(1);
  let children = $state(0);
  let spMissing = $state(0);
  let hard = $state(false);
  let cls = $state(0);
  let module = $state(0);
  let floor = $state(1);

  const rest = $derived<Rest>({ lev: whole(level, 1), children: whole(children, 0), spMissing: whole(spMissing, 0), hard });
  const cost = $derived(restCost(rest));
  const byLevel = $derived(restCostByLevel(rest, tableLevels(rest.lev)));
  const innBreakEven = $derived(innBreakEvenChildren(rest.lev));
  const money = $derived(moneyPerKill(floor, cls, hard));
  /** The character's own values, as the calculator holds them, kept up with its edits. */
  const seed = $derived.by(() => {
    void watchingCharacterOn('calculators');
    const record = currentCharacter();
    return record ? spenderFrom(record) : null;
  });
  const differs = $derived(changedFields({ level, children, spMissing, hard, cls, module, floor }, seed));

  // Picking a different character starts the calculator from it. Editing the one in hand does
  // not, so an override survives an edit and is marked as changed instead.
  $effect(() => {
    void app.characterId;
    untrack(useCharacter);
  });

  function spenderFrom(record: SaveRecord) {
    return {
      level: record.lev,
      children: record.children,
      spMissing: Math.max(0, record.maxSp - record.sp),
      hard: record.hard !== 0,
      cls: Math.min(6, Math.max(0, record.cls)),
      module: record.module,
      floor: Math.min(Math.max(1, record.level), BOTTOM_LEVEL[record.module]),
    };
  }

  function useCharacter() {
    if (!seed) return;
    level = seed.level;
    children = seed.children;
    spMissing = seed.spMissing;
    hard = seed.hard;
    cls = seed.cls;
    module = seed.module;
    floor = seed.floor;
  }

  /** An empty number input reads as NaN, which would spread through every table. */
  function whole(value: number, least: number): number {
    return Number.isFinite(value) ? Math.max(least, Math.round(value)) : least;
  }

  const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  const number = (value: number) => Math.round(value).toLocaleString();
  const percent = (share: number) => `${(100 * share).toFixed(0)}%`;
  const owed = (value: number) => (value > 0 ? `−${number(value)}` : '0');

  const binLabel = (index: number) => {
    const bin = money.bins[index];
    return bin.from === bin.to ? compact.format(bin.from) : `${compact.format(bin.from)}–${compact.format(bin.to)}`;
  };

  const binTooltip = (index: number) => {
    const bin = money.bins[index];
    const range = bin.from === bin.to ? number(bin.from) : `${number(bin.from)}–${number(bin.to)}`;
    return `${range}: ${bin.percent.toFixed(1)}% of kills`;
  };
</script>

<div class="page">
  <section>
    <SectionHeading title="Character" />
    <div class="fields">
      <label>
        <FieldLabel text="Level" changed={differs.level} />
        <input type="number" min="1" bind:value={level} />
      </label>
      <label>
        <FieldLabel text="Children helped" changed={differs.children} />
        <input type="number" min="0" bind:value={children} />
      </label>
      <label>
        <FieldLabel text="Spell points missing" changed={differs.spMissing} />
        <input type="number" min="0" bind:value={spMissing} />
      </label>
      <label>
        <FieldLabel text="Difficulty" changed={differs.hard} />
        <select bind:value={hard}>
          <option value={false}>Normal</option>
          <option value={true}>I can handle anything!</option>
        </select>
      </label>
      <label>
        <FieldLabel text="Class" changed={differs.cls} />
        <select bind:value={cls}>
          {#each data.classes as entry}
            <option value={entry.id}>{entry.name}</option>
          {/each}
        </select>
      </label>
    </div>
    <div class="load">
      <button type="button" class="ghost" disabled={!seed} onclick={useCharacter}>Use the character's values</button>
      {#if !seed}
        <span class="note">Load a Dungeons of the Unforgiven save in the Save Editor to fill these in.</span>
      {/if}
    </div>
  </section>

  <section>
    <SectionHeading title="One rest at the inn">
      <SourceLink ts={{ file: 'src/lib/game/dotu-mech.js', name: 'innCost' }} c="flea_inn" />
    </SectionHeading>
    <table>
      <thead>
        <tr><th></th><th>Units</th><th>Each</th><th>Rubles</th></tr>
      </thead>
      <tbody>
        <tr><td>Room</td><td>—</td><td>—</td><td>{number(cost.room)}</td></tr>
        <tr>
          <td>Culture stock<SourceLink ts={{ file: 'src/lib/game/dotu-mech.js', name: 'stockPrice' }} c="g_store" /></td>
          <td>{number(cost.stockUnits)}</td>
          <td>{number(cost.stockUnitPrice)}</td>
          <td>{number(cost.stock)}</td>
        </tr>
        <tr>
          <td>Magic crystals<SourceLink ts={{ file: 'src/lib/game/dotu-mech.js', name: 'crystalPrice' }} c="g_store" /></td>
          <td>{number(cost.crystalUnits)}</td>
          <td>{number(cost.crystalUnitPrice)}</td>
          <td>{number(cost.crystals)}</td>
        </tr>
        <tr><td>Refund</td><td>—</td><td>—</td><td>{owed(cost.refund)}</td></tr>
        <tr><td>Total</td><td>—</td><td>—</td><td>{number(cost.total)}</td></tr>
      </tbody>
    </table>
    <p class="note">
      A stay uses one crystal per missing spell point, and the stock only keeps you from aging: run out and you age by the shortfall.
    </p>
  </section>

  <section>
    <SectionHeading title="By level" />
    <table>
      <thead>
        <tr><th>Level</th><th>Room</th><th>Culture stock</th><th>Magic crystals</th><th>Refund</th><th>Total</th></tr>
      </thead>
      <tbody>
        {#each byLevel as row}
          <tr class:here={row.lev === rest.lev}>
            <td>{row.lev}</td>
            <td>{number(row.room)}</td>
            <td>{number(row.stock)}</td>
            <td>{number(row.crystals)}</td>
            <td>{owed(row.refund)}</td>
            <td>{number(row.total)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="note">The same {rest.children} children, {rest.spMissing} missing spell points and difficulty, priced at each level.</p>
  </section>

  <section>
    <SectionHeading title="Helping children" />
    <p class="note">Helping {number(innBreakEven)} children makes the room as cheap as it gets at this level.</p>
    <p class="note">
      Helping {STORE_BREAK_EVEN_CHILDREN} children makes the store refund as generous as it gets: half of what you spend on stock and
      crystals. You have {rest.children}, which gets {percent(refundShare(rest.children))} back.
    </p>
    <p class="note">A child costs 100 rubles at the temple, and the discount is worth {number(rest.lev)} rubles a night at this level.</p>
  </section>

  <section>
    <SectionHeading title="Temple">
      <SourceLink ts={{ file: 'src/lib/game/dotu-mech.js', name: 'TEMPLE' }} c="temple" />
    </SectionHeading>
    <table>
      <tbody>
        {#each TEMPLE as [service, price]}
          <tr><td>{service}</td><td>{number(price)}</td></tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section>
    <SectionHeading title="Money per kill">
      <SourceLink ts={{ file: 'src/lib/game/dotu-mech.js', name: 'rollMoney' }} c="drop_money" />
    </SectionHeading>
    <div class="fields">
      <FloorPicker bind:module bind:floor changedModule={differs.module} changedFloor={differs.floor} />
    </div>
    <table>
      <tbody>
        <tr><td>Expected</td><td>{number(money.expected)}</td></tr>
        <tr><td>Middle of the sample</td><td>{number(money.median)}</td></tr>
      </tbody>
    </table>
    <BarChart
      labels={money.bins.map((_, index) => binLabel(index))}
      values={money.bins.map((bin) => bin.percent)}
      tooltip={binTooltip}
      xLabel="Dollars from one kill"
    />
    <p class="note">
      Bars are 20,000 sampled kills in ranges that widen as the payouts do, since the roll multiplies three random numbers together. The
      leftmost bar is the {money.nothingPercent.toFixed(1)}% that pay nothing.
    </p>
    <p class="note">Kills pay Greater American Dollars, which the bank turns into rubles at 100 to 1. Only the floor matters, not the module.</p>
  </section>
</div>

<style>
  .load {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 14px;
  }
  .load .note {
    margin: 0;
  }
  .fields {
    margin-bottom: 14px;
  }
  tr.here td {
    color: var(--accent);
  }
</style>
