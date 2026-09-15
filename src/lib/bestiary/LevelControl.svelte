<script lang="ts">
  import { monsterLevelBase } from '../game/dotu-mech.js';
  import { blockWheel } from '../editor/block-wheel';
  import { MODULE_NUMERALS } from '../map/labels';
  import { allowedFloors, allowedModules, type Monster } from './monsters';
  import { FAITHFUL_RULES } from '../game/port/rules';

  interface Props {
    entry: Monster;
    /** 0-based. */
    module: number;
    floor: number;
    /** What the floor is worth before the random nudge; typed directly for a built-in. */
    baseLevel: number;
    /** Lets the level be typed for any monster, not just a built-in. */
    freeLevel?: boolean;
  }

  let { entry, module = $bindable(), floor = $bindable(), baseLevel = $bindable(), freeLevel = false }: Props = $props();

  const modules = $derived(allowedModules(entry));
  const floors = $derived(allowedFloors(entry, module));
  // Only built-ins are stocked deep enough for a level the module and floor cannot reach,
  // unless the caller wants the level typed whatever the monster is.
  const levelIsFree = $derived(freeLevel || entry.origin.kind === 'builtin');

  function pickModule(event: Event) {
    module = Number((event.currentTarget as HTMLSelectElement).value);
    const allowed = allowedFloors(entry, module);
    pickFloorNumber(allowed.includes(floor) ? floor : allowed[0]);
  }

  function pickFloor(event: Event) {
    pickFloorNumber(Number((event.currentTarget as HTMLSelectElement).value));
  }

  function pickFloorNumber(level: number) {
    floor = level;
    baseLevel = monsterLevelBase(floor, module);
  }

  function typeLevel(event: Event) {
    const typed = Number((event.currentTarget as HTMLInputElement).value);
    if (typed >= 1 && typed <= FAITHFUL_RULES.monsterLevelMax) baseLevel = typed;
  }
</script>

<div class="pickers">
  <label>
    Module
    {#if modules.length > 1}
      <select value={module} onchange={pickModule}>
        {#each modules as index}
          <option value={index}>{MODULE_NUMERALS[index]}</option>
        {/each}
      </select>
    {:else}
      <span class="fixed">{MODULE_NUMERALS[module]}</span>
    {/if}
  </label>
  <label>
    Floor
    {#if floors.length > 1}
      <select value={floor} onchange={pickFloor}>
        {#each floors as level}
          <option value={level}>{level}</option>
        {/each}
      </select>
    {:else}
      <span class="fixed">{floor}</span>
    {/if}
  </label>
  <label>
    Level
    {#if levelIsFree}
      <input type="number" min="1" max={FAITHFUL_RULES.monsterLevelMax} value={baseLevel} oninput={typeLevel} use:blockWheel />
    {:else}
      <span class="fixed">{baseLevel}</span>
    {/if}
  </label>
</div>

<style>
  .pickers {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  select,
  input {
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 7px 9px;
    font: inherit;
  }
  .fixed {
    padding: 7px 0;
    color: var(--ink);
  }
</style>
