<script lang="ts">
  import { untrack } from 'svelte';
  import { app, watchingCharacterOn } from '../app-state.svelte';
  import type { SaveRecord } from '../game/dotu-files.js';
  import data from '../game/dotu-data.json';
  import { BOTTOM_LEVEL } from '../game/unfmap.js';
  import { percent } from '../ui/format';
  import BarChart from '../ui/BarChart.svelte';
  import SourceLink from '../source/SourceLink.svelte';
  import SectionHeading from '../ui/SectionHeading.svelte';
  import { changedFields, currentCharacter } from './character';
  import DropTable from './DropTable.svelte';
  import FieldLabel from './FieldLabel.svelte';
  import { dropTables, WEAPON_NAMES } from './drops';
  import FloorPicker from './FloorPicker.svelte';

  const FIGHTER = 0;
  const MONK = 2;
  /** Levels rarer than this are left off the chart; the level nudge has a very long tail. */
  const RARE_LEVEL = 0.0005;

  let module = $state(0);
  let floor = $state(1);
  let cls = $state(FIGHTER);
  let ownedWeapons = $state<number[]>([]);

  const tables = $derived(dropTables({ module, floor, cls, ownedWeapons }));
  const levels = $derived(tables.levels.filter(([, chance]) => chance >= RARE_LEVEL));
  /** The character's own values, as the calculator holds them, kept up with its edits. */
  const seed = $derived.by(() => {
    void watchingCharacterOn('calculators');
    const record = currentCharacter();
    return record ? hunterFrom(record) : null;
  });
  const differs = $derived(changedFields({ cls, module, floor, ownedWeapons }, seed));

  // Picking a different character starts the calculator from it. Editing the one in hand does
  // not, so an override survives an edit and is marked as changed instead.
  $effect(() => {
    void app.characterId;
    untrack(useCharacter);
  });

  function hunterFrom(record: SaveRecord) {
    return {
      cls: Math.min(6, Math.max(0, record.cls)),
      module: record.module,
      floor: Math.min(Math.max(1, record.level), BOTTOM_LEVEL[record.module]),
      ownedWeapons: WEAPON_NAMES.map((_, index) => index + 1).filter((id) => record.weaponsOwned[id] > 0),
    };
  }

  function useCharacter() {
    if (!seed) return;
    cls = seed.cls;
    module = seed.module;
    floor = seed.floor;
    ownedWeapons = [...seed.ownedWeapons];
  }

  function toggleWeapon(id: number, owned: boolean) {
    ownedWeapons = owned ? [...ownedWeapons, id] : ownedWeapons.filter((other) => other !== id);
  }

</script>

<div class="page">
  <section>
    <SectionHeading title="Where" />
    <div class="fields">
      <FloorPicker bind:module bind:floor changedModule={differs.module} changedFloor={differs.floor} />
    </div>
    <BarChart
      labels={levels.map(([level]) => String(level))}
      values={levels.map(([, chance]) => chance * 100)}
      tooltip={(index) => `Level ${levels[index][0]}: ${percent(levels[index][1])}`}
      xLabel="Level the floor stocks monsters at"
    />
    <p class="note">Only the weapon and armor rolls read the monster's level; everything else reads the floor.</p>
  </section>

  <section>
    <SectionHeading title="Character" />
    <div class="fields">
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
    <SectionHeading title="Weapons">
      <SourceLink ts={{ file: 'src/lib/game/dotu-mech.js', name: 'dropOdds' }} c="drop_weapon" />
    </SectionHeading>
    <div class="owned">
      <span class="owned-label"><FieldLabel text="Already owned" changed={differs.ownedWeapons} /></span>
      {#each WEAPON_NAMES as name, index}
        <label>
          <input
            type="checkbox"
            checked={ownedWeapons.includes(index + 1)}
            onchange={(event) => toggleWeapon(index + 1, event.currentTarget.checked)}
          />
          {name}
        </label>
      {/each}
    </div>
    <DropTable rows={tables.weapons} />
    {#if cls === MONK}
      <p class="note">Monks never find gear.</p>
    {/if}
  </section>

  <section>
    <SectionHeading title="Armor">
      <SourceLink ts={{ file: 'src/lib/game/dotu-mech.js', name: 'dropOdds' }} c="drop_armor" />
    </SectionHeading>
    <DropTable rows={tables.armors} />
    {#if cls === MONK}
      <p class="note">Monks never find gear.</p>
    {:else}
      <p class="note">Armor drops even when you already own one.</p>
    {/if}
  </section>

  <section>
    <SectionHeading title="Items">
      <SourceLink ts={{ file: 'src/lib/game/dotu-mech.js', name: 'dropOdds' }} c="find_item" />
    </SectionHeading>
    <DropTable rows={tables.items} />
    <p class="note">
      YOU FIND check passes {percent(tables.findGate)} of the time on this floor. One check in three finds nothing, and the rest is shared
      equally between the twelve items.
    </p>
    {#if cls === MONK}
      <p class="note">Monks never find gear.</p>
    {/if}
  </section>

  <section>
    <SectionHeading title="Level drainer kills">
      <SourceLink ts={{ file: 'src/lib/calculators/drops.ts', name: 'drainerShare' }} c="kill_monster" />
    </SectionHeading>
    <DropTable rows={tables.drainer} />
    {#if tables.drainerShare > 0}
      <p class="note">
        Only the section's level drainer leaves these, and about one monster in {Math.round(1 / tables.drainerShare)} is one. The key is
        this floor's own, and only drops while you are without it.
      </p>
    {:else}
      <p class="note">This section's drainer takes experience instead of a level, so its kills leave nothing.</p>
    {/if}
  </section>

  <section>
    <SectionHeading title="Spells">
      <SourceLink ts={{ file: 'src/lib/game/dotu-mech.js', name: 'dropOdds' }} c="drop_spellbook" />
    </SectionHeading>
    <DropTable rows={tables.spells} />
    <p class="note">A spell book only teaches you a spell you do not know yet and your class may learn, and scrolls, wands and papers are only rolled when no book was learned.</p>
    {#if cls === FIGHTER}
      <p class="note">Fighters can only read papers.</p>
    {/if}
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
  .owned-label {
    font-size: 12px;
    color: var(--muted);
  }
</style>
