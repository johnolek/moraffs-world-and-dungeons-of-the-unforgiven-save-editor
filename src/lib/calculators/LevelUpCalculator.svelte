<script lang="ts">
  import { untrack } from 'svelte';
  import { app, characterVersionOn } from '../app-state.svelte';
  import type { SaveRecord } from '../game/dotu-files.js';
  import data from '../game/dotu-data.json';
  import SourceLink from '../source/SourceLink.svelte';
  import SectionHeading from '../ui/SectionHeading.svelte';
  import { changedFields, currentCharacter } from './character';
  import FieldLabel from './FieldLabel.svelte';
  import { allClassRolls, levelUpRoll, type LevelUpStats } from './levelup';

  let stats = $state<LevelUpStats>({ cls: 0, con: 10, luck: 10, wis: 10, iq: 10 });

  const rolled = $derived<LevelUpStats>({
    cls: whole(stats.cls, 0, 6),
    con: whole(stats.con, 0),
    luck: whole(stats.luck, 0),
    wis: whole(stats.wis, 0),
    iq: whole(stats.iq, 0),
  });
  const roll = $derived(levelUpRoll(rolled));
  const everyClass = $derived(allClassRolls(rolled));
  /** The character's own values, as the calculator holds them, kept up with its edits. */
  const seed = $derived.by(() => {
    void characterVersionOn('calculators');
    const record = currentCharacter();
    return record ? statsFrom(record) : null;
  });
  const differs = $derived(changedFields(stats, seed));

  // Picking a different character starts the calculator from it. Editing the one in hand does
  // not, so an override survives an edit and is marked as changed instead.
  $effect(() => {
    void app.characterId;
    untrack(useCharacter);
  });

  function statsFrom(record: SaveRecord): LevelUpStats {
    return {
      cls: Math.min(6, Math.max(0, record.cls)),
      con: record.con,
      luck: record.luck,
      wis: record.wis,
      iq: record.iq,
    };
  }

  function useCharacter() {
    if (seed) stats = { ...seed };
  }

  /** An empty number input reads as NaN, which would spread through both tables. */
  function whole(value: number, least: number, most = Number.MAX_SAFE_INTEGER): number {
    return Number.isFinite(value) ? Math.min(most, Math.max(least, Math.round(value))) : least;
  }

  const range = (hp: [number, number]) => `${hp[0]}–${hp[1]}`;
</script>

<div class="page">
  <section>
    <SectionHeading title="Character" />
    <div class="fields">
      <label>
        <FieldLabel text="Class" changed={differs.cls} />
        <select bind:value={stats.cls}>
          {#each data.classes as entry}
            <option value={entry.id}>{entry.name}</option>
          {/each}
        </select>
      </label>
      <label>
        <FieldLabel text="Constitution" changed={differs.con} />
        <input type="number" bind:value={stats.con} />
      </label>
      <label>
        <FieldLabel text="Luck" changed={differs.luck} />
        <input type="number" bind:value={stats.luck} />
      </label>
      <label>
        <FieldLabel text="Wisdom" changed={differs.wis} />
        <input type="number" bind:value={stats.wis} />
      </label>
      <label>
        <FieldLabel text="Intelligence" changed={differs.iq} />
        <input type="number" bind:value={stats.iq} />
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
    <SectionHeading title="One level">
      <SourceLink ts={{ file: 'src/lib/game/dotu-mech.js', name: 'levelGain' }} c="gain_level" />
    </SectionHeading>
    <table>
      <tbody>
        <tr><td>HP gain</td><td>{range(roll.hp)}</td></tr>
        <tr><td>Average HP gain</td><td>{roll.averageHp}</td></tr>
        <tr><td>SP gain</td><td>{roll.sp}</td></tr>
      </tbody>
    </table>
    <p class="note">
      Every point of the range is as likely as every other. A level drainer rolls the same formula again with your stats as they are then
      and takes the result off both maximums, so a level gained with better stats is worth more than the one taken back.
    </p>
  </section>

  <section>
    <SectionHeading title="All classes" />
    <table>
      <thead>
        <tr><th>Class</th><th>HP gain</th><th>SP gain</th></tr>
      </thead>
      <tbody>
        {#each everyClass as entry}
          <tr class:here={entry.cls === roll.cls}>
            <td>{entry.name}</td>
            <td>{range(entry.hp)}</td>
            <td>{entry.sp}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="note">The same constitution, luck, wisdom and intelligence, rolled for each class.</p>
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
  tr.here td {
    color: var(--accent);
  }
</style>
