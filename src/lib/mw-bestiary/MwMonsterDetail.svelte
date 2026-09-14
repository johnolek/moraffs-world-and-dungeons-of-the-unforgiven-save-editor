<!-- One monster of Moraff's World: its numbers, where it turns up and what it takes to hit it. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { watchingCharacterOn, currentEntry } from '../app-state.svelte';
  import MonsterCard from '../bestiary/MonsterCard.svelte';
  import { blockWheel } from '../editor/block-wheel';
  import { MORAFFS_WORLD } from '../editor/games';
  import { percent } from '../ui/format';
  import SectionHeading from '../ui/SectionHeading.svelte';
  import MwMonsterCorridor from './MwMonsterCorridor.svelte';
  import {
    HELD_WEAPONS,
    MONSTERS_PER_FLOOR,
    appearsOn,
    bossFloor,
    depthAtFloor,
    depthRange,
    describeEffects,
    floorGroup,
    groupMonsters,
    hpRange,
    killExperience,
    neverStocked,
    stockingOdds,
    weaponById,
    type MwMonster,
  } from './monsters';
  import { fighterFromRecord, monsterDefence, mwHitChance, toHitTotal, totalNeededFor, type MwFighter } from './to-hit';

  interface Props {
    entry: MwMonster;
    groupLabel: string;
  }

  let { entry, groupLabel }: Props = $props();

  /** The deepest floor the save editor will put a character on. */
  const DEEPEST_FLOOR = 254;
  /** What the worked line falls back to when no Moraff's World character is loaded. */
  const EXAMPLE_FIGHTER: MwFighter = { lev: 20, str: 45, luck: 20, weapon: 6, weaponPlus: 0, gauntlet: 0 };

  /** The character being worked on, when it is one of this game's. */
  function loadedCharacter(): { name: string; fighter: MwFighter; floor: number; dungeon: number } | null {
    const character = currentEntry();
    if (!character || character.game !== MORAFFS_WORLD.id) return null;
    const view = new DataView(character.bytes.buffer, character.bytes.byteOffset, character.bytes.byteLength);
    return {
      name: character.name,
      fighter: fighterFromRecord(character.bytes),
      floor: view.getInt16(0x7b0, true),
      dungeon: view.getInt16(0x7b2, true),
    };
  }

  // The parent keys this card on the monster, so the controls start fresh for each one.
  const startingCharacter = untrack(loadedCharacter);
  let floor = $state(startingFloor());
  let group = $state(floorGroup(startingCharacter?.dungeon ?? 0));
  let swing = $state({ ...(startingCharacter?.fighter ?? EXAMPLE_FIGHTER) });

  /** Where the floor control starts: the boss's own floor, or the character's when the monster
   *  is stocked there, or the shallowest floor it appears on. */
  function startingFloor(): number {
    const boss = bossFloor(entry);
    if (boss !== null) return boss;
    const standing = startingCharacter?.floor ?? 0;
    if (standing > 0 && appearsOn(entry, standing)) return standing;
    return Math.max(1, entry.minFloor);
  }

  // Only while the Monsters tab is the one on screen: a game writes the record back to the roster
  // after every key, and reading the character out of it behind another tab is work for nobody.
  // The starting values above are taken outside this, so a card built while the tab is down still
  // starts from the character.
  const character = $derived(watchingCharacterOn('monsters') ? loadedCharacter() : null);
  const boss = $derived(bossFloor(entry));
  const never = $derived(neverStocked(entry));
  const effects = $derived(describeEffects(entry));
  const stocked = $derived(appearsOn(entry, floor));
  const hp = $derived(hpRange(entry, floor));
  const depths = $derived(depthRange(floor));
  const depth = $derived(depthAtFloor(floor));
  const odds = $derived(stockingOdds(floor, group)[entry.index]);
  const perFloor = $derived(odds * MONSTERS_PER_FLOOR);
  const experience = $derived(killExperience(entry, depth));

  const total = $derived(toHitTotal(swing));
  const damageDie = $derived(weaponById(swing.weapon).damageDie);
  const chance = $derived(mwHitChance(total, entry, floor, damageDie));
  const halfTheTime = $derived(totalNeededFor(0.5, entry, floor));

  const number = (value: number) => Math.round(value).toLocaleString();

  const stats = $derived([
    ['Defense', String(entry.defence)],
    ['Also off your swing', String(entry.extraDefence)],
    ['Off your swing, on to its attack', String(entry.defenceAndAttack)],
    ['Its attack', String(entry.attack)],
    ['Damage die', String(entry.damageDie)],
    ['Hit points per floor', String(entry.hpPerFloor)],
    ['Experience multiplier', `×${entry.expMult}`],
  ]);

  const floorLine = $derived.by(() => {
    if (boss !== null) return `Floor ${boss}, in the middle of it, until you kill it.`;
    if (never) {
      return entry.pictureDrawn
        ? `Never: it wants floor ${entry.minFloor} at the shallowest and floor ${entry.maxFloor} at the deepest.`
        : 'Never: WORLD.PIC has no picture of it, and the game will not stock a monster it cannot draw.';
    }
    const from = Math.max(1, entry.minFloor);
    // main rewrites a maximum over 120 to 254, which is deeper than any floor a character reaches.
    return entry.maxFloor >= DEEPEST_FLOOR
      ? `Floor ${from} and down, as deep as the dungeon goes.`
      : `Floors ${from} to ${entry.maxFloor}.`;
  });

  const shareLine = $derived.by(() => {
    if (boss !== null) return 'One a visit, in the floor’s first monster slot.';
    if (!stocked) return `None — it is not stocked on floor ${floor}.`;
    const many = perFloor < 0.5 ? 'fewer than one' : `about ${Math.round(perFloor)}`;
    return `${many} of the ${MONSTERS_PER_FLOOR}, ${percent(odds)} of them.`;
  });

  function setSwing(field: keyof MwFighter, value: number) {
    swing = { ...swing, [field]: value };
  }

  function typedFloor(event: Event) {
    const typed = Number((event.currentTarget as HTMLInputElement).value);
    if (typed >= 1 && typed <= DEEPEST_FLOOR) floor = typed;
  }
</script>

<MonsterCard
  name={entry.name}
  groupLine={groupLabel}
  numbersTitle="Numbers"
  numbers={stats}
  {effects}
  {art}
  {tableNote}
  {body} />

{#snippet art()}
  {#if entry.pictureDrawn}
    <MwMonsterCorridor {entry} {floor} />
  {:else}
    <p class="missing">No picture</p>
  {/if}
{/snippet}

{#snippet tableNote()}
  <p class="note">
    All three of the first numbers come off your swing; the third goes on to its own attack as well.
  </p>
{/snippet}

{#snippet body()}
  <section>
    <SectionHeading title="Where it turns up" />
    <p>{floorLine}</p>
  </section>

  <section>
    <SectionHeading title="On floor {floor}" />
    <div class="pickers">
      <label>
        Floor
        <input type="number" min="1" max={DEEPEST_FLOOR} value={floor} oninput={typedFloor} use:blockWheel />
      </label>
      <label>
        Floor group
        <select value={group} onchange={(event) => (group = Number(event.currentTarget.value))}>
          {#each groupMonsters() as monster, index}
            <option value={index}>{index} · {monster.name}</option>
          {/each}
        </select>
      </label>
    </div>
    <p class="note">
      The group is <code>(dungeon + 6) % 9</code> before it drifts, so a character in dungeon 0 walks floors of group
      6. Two monsters in three on a floor are the group’s own or another of the first nine.
    </p>
    <dl>
      <dt>Hit points</dt>
      <dd>{number(hp[0])}–{number(hp[1])}</dd>
      <dt>How many on a floor</dt>
      <dd>{shareLine}</dd>
      <dt>Its own depth</dt>
      <dd>{depths[0]}–{depths[1]}, and the floor’s own number more often than not</dd>
      <dt>Experience for killing it</dt>
      <dd>{number(experience)} at depth {depth}</dd>
    </dl>
  </section>

  <section>
    <SectionHeading title="Hitting it" />
    <p>
      A swing rolls 0 to 79 and adds your total; every full 40 points it lands over 40 rolls the weapon’s damage die
      once. It takes a total of {number(halfTheTime)} to get past this one half the time on floor {floor}.
    </p>
    <div class="pickers">
      <label>
        Level
        <input
          type="number"
          min="0"
          value={swing.lev}
          oninput={(event) => setSwing('lev', Number(event.currentTarget.value))}
          use:blockWheel />
      </label>
      <label>
        Strength
        <input
          type="number"
          min="0"
          value={swing.str}
          oninput={(event) => setSwing('str', Number(event.currentTarget.value))}
          use:blockWheel />
      </label>
      <label>
        Luck
        <input
          type="number"
          min="0"
          value={swing.luck}
          oninput={(event) => setSwing('luck', Number(event.currentTarget.value))}
          use:blockWheel />
      </label>
      <label>
        Weapon
        <select value={swing.weapon} onchange={(event) => setSwing('weapon', Number(event.currentTarget.value))}>
          {#each HELD_WEAPONS as weapon}
            <option value={weapon.index}>{weapon.name}</option>
          {/each}
        </select>
      </label>
      <label>
        Weapon plus
        <input
          type="number"
          min="0"
          value={swing.weaponPlus}
          oninput={(event) => setSwing('weaponPlus', Number(event.currentTarget.value))}
          use:blockWheel />
      </label>
      <label>
        Gauntlets
        <input
          type="number"
          min="0"
          value={swing.gauntlet}
          oninput={(event) => setSwing('gauntlet', Number(event.currentTarget.value))}
          use:blockWheel />
      </label>
    </div>
    <p>
      A total of {number(total)} against its {number(monsterDefence(entry, floor))} lands {percent(chance)} of your swings.
    </p>
    {#if character}
      <p class="note">
        Started from {character.name}. <button type="button" onclick={() => (swing = { ...character.fighter })}>
          Put them back
        </button>
      </p>
    {:else}
      <p class="note">Load a Moraff’s World character in the Save Editor to start from their numbers.</p>
    {/if}
  </section>
{/snippet}

<style>
  .missing {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 200px;
    height: 150px;
    border: 1px dashed var(--line);
    border-radius: 6px;
    font-size: 12px;
    color: var(--muted);
  }
  .note button {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .pickers {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 12px 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  input,
  select {
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 7px 9px;
    font: inherit;
    width: 9ch;
  }
  select {
    width: auto;
  }
</style>
