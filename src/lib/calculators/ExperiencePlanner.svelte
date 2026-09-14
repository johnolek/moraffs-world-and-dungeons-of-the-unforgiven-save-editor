<script lang="ts">
  import { untrack } from 'svelte';
  import { app, characterVersionOn } from '../app-state.svelte';
  import type { SaveRecord } from '../game/dotu-files.js';
  import data from '../game/dotu-data.json';
  import { BOTTOM_LEVEL } from '../game/unfmap.js';
  import SourceLink from '../source/SourceLink.svelte';
  import SectionHeading from '../ui/SectionHeading.svelte';
  import { changedFields, currentCharacter } from './character';
  import FieldLabel from './FieldLabel.svelte';
  import { drainCost, killRows, levelProgress, type Stats } from './experience';
  import FloorPicker from './FloorPicker.svelte';

  let level = $state(1);
  let exp = $state(0);
  let hard = $state(false);
  let target = $state(2);
  let module = $state(0);
  let floor = $state(1);
  let stats = $state<Stats>({ cls: 0, con: 10, luck: 10, wis: 10, iq: 10 });

  const character = $derived({ level: whole(level, 1), exp: whole(exp, 0), hard });
  const progress = $derived(levelProgress(character, whole(target, 1)));
  const kills = $derived(killRows(module, floor, progress));
  const drain = $derived(drainCost(character, stats));
  /** The character's own values, as the calculator holds them, kept up with its edits. */
  const seed = $derived.by(() => {
    void characterVersionOn('calculators');
    const record = currentCharacter();
    return record ? plannerFrom(record) : null;
  });
  const differs = $derived(changedFields({ level, exp, hard, target, module, floor, ...stats }, seed));

  // Picking a different character starts the calculator from it. Editing the one in hand does
  // not, so an override survives an edit and is marked as changed instead.
  $effect(() => {
    void app.characterId;
    untrack(useCharacter);
  });

  function plannerFrom(record: SaveRecord) {
    return {
      level: record.lev,
      exp: record.exp,
      hard: record.hard !== 0,
      target: record.lev + 1,
      module: record.module,
      floor: Math.min(Math.max(1, record.level), BOTTOM_LEVEL[record.module]),
      cls: Math.min(6, Math.max(0, record.cls)),
      con: record.con,
      luck: record.luck,
      wis: record.wis,
      iq: record.iq,
    };
  }

  function useCharacter() {
    if (!seed) return;
    level = seed.level;
    exp = seed.exp;
    hard = seed.hard;
    target = seed.target;
    module = seed.module;
    floor = seed.floor;
    stats = { cls: seed.cls, con: seed.con, luck: seed.luck, wis: seed.wis, iq: seed.iq };
  }

  /** An empty number input reads as NaN, which would spread through every table. */
  function whole(value: number, least: number): number {
    return Number.isFinite(value) ? Math.max(least, Math.round(value)) : least;
  }

  const number = (value: number) => Math.round(value).toLocaleString();
  const killCount = (count: number | null) => (count === null ? 'never' : count.toLocaleString());
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
        <FieldLabel text="Experience" changed={differs.exp} />
        <input type="number" min="0" step="any" bind:value={exp} />
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
        <FieldLabel text="Intelligence" changed={differs.iq} />
        <input type="number" bind:value={stats.iq} />
      </label>
      <label>
        <FieldLabel text="Wisdom" changed={differs.wis} />
        <input type="number" bind:value={stats.wis} />
      </label>
      <label>
        <FieldLabel text="Luck" changed={differs.luck} />
        <input type="number" bind:value={stats.luck} />
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
    <SectionHeading title="Levels">
      <SourceLink ts={{ file: 'src/lib/game/dotu-mech.js', name: 'expToReach' }} c="exp_needed" />
    </SectionHeading>
    <div class="fields">
      <label>
        <FieldLabel text="Target level" changed={differs.target} />
        <input type="number" min="1" bind:value={target} />
      </label>
    </div>
    <table>
      <thead>
        <tr><th>Level</th><th>XP to reach</th><th>Still needed</th></tr>
      </thead>
      <tbody>
        {#each progress.rows as row}
          <tr>
            <td>{row.level}</td>
            <td>{number(row.xpToReach)}</td>
            <td>{row.stillNeeded === 0 ? '—' : number(row.stillNeeded)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="note">Levels are only awarded when you rest at the inn.</p>
  </section>

  <section>
    <SectionHeading title="Kills on this floor">
      <SourceLink ts={{ file: 'src/lib/game/dotu-mech.js', name: 'expValue' }} c="exp_value" />
    </SectionHeading>
    <div class="fields">
      <FloorPicker bind:module bind:floor changedModule={differs.module} changedFloor={differs.floor} />
    </div>
    <table>
      <thead>
        <tr><th>Monster</th><th>XP per kill</th><th>Kills to next level</th><th>Kills to target</th></tr>
      </thead>
      <tbody>
        {#each kills as row}
          <tr>
            <td>{row.monster.name}</td>
            <td>{number(row.xpPerKill)}</td>
            <td>{killCount(row.killsToNextLevel)}</td>
            <td>{killCount(row.killsToTarget)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section>
    <SectionHeading title="Level drain" />
    <table>
      <tbody>
        <tr><td>Experience after the drain</td><td>{number(drain.newExp)}</td></tr>
        <tr><td>Experience lost</td><td>{number(drain.expLost)}</td></tr>
        <tr><td>Maximum HP lost</td><td>{drain.hpLost[0]}–{drain.hpLost[1]}</td></tr>
        <tr><td>Spell points lost</td><td>{drain.spLost}</td></tr>
      </tbody>
    </table>
    <p class="note">A drained level leaves you with the least experience the level below allows, and takes back the hit points and spell points that level gave you.</p>
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
</style>
