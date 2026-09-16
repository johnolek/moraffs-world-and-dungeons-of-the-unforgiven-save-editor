<script lang="ts">
  import { percent } from '../ui/format';
  import type { Game } from '../game/port/state';
  import { routeWords, type Route } from '../map/path';
  import { SCREEN_COLOURS } from '../roller/screen';
  import type { PlayView } from './engine';
  import {
    ailments,
    chaseDistance,
    engagedMonster,
    floorMonsterKinds,
    magicItems,
    spellTimers,
    squareFacts,
    SQUARE_NOTE,
    untimedSpells,
    type PanelLine,
  } from './panel';

  interface Props {
    game: Game;
    /** What the tab is drawing. A fresh one arrives after every action, and reading it is what
     *  sends the panel back to the record for the numbers below. */
    view: PlayView;
    /** The kind of monster picked out of the list, which both maps ring, or null while none is
     *  picked. */
    highlighted?: string | null;
    /** Whether the button asking for the way to the nearest teleporter is on. */
    routing?: boolean;
    /** Whether that route is allowed to cast Pass Wall, the way the map explorer's is. */
    routePassWall?: boolean;
    /** The route that button found, null when there is none to be had, and undefined while the
     *  button is off. */
    route?: Route | null | undefined;
    /**
     * Whether the sections about the dungeon are drawn beside the ones about the character
     * ({@link dungeonNumbersVisible}).
     *
     * An endless character is shown what it is carrying and what it has running, so that it can
     * be put down for a week and picked up again, and none of what is waiting on the floor.
     */
    dungeonNumbers: boolean;
  }

  let {
    game,
    view,
    highlighted = $bindable(null),
    routing = $bindable(false),
    routePassWall = $bindable(false),
    route = undefined,
    dungeonNumbers,
  }: Props = $props();

  // A route of no steps at all is the character standing beside the teleporter, which is the
  // arrival the button is turned off by.
  $effect(() => {
    if (route && route.steps === 0) routing = false;
  });

  /** What the game keeps to itself about the character: what it is carrying, what it has running,
   *  what is wrong with it, and how long it has been down here. */
  const own = $derived.by(() => {
    const pc = game.pc;
    return {
      timers: spellTimers(pc),
      untimed: untimedSpells(pc),
      ailing: ailments(pc),
      items: magicItems(pc).filter((group) => group.lines.length > 0),
      seconds: Math.round(view.seconds),
    };
  });

  /**
   * What the game keeps to itself about the dungeon, or null where it is not being shown.
   *
   * It is worked out only when it is drawn. Reading the floor costs something on every action —
   * `floorMonsterKinds` walks every monster standing on it — and a mode that is not shown any of
   * this should not be paying for it, nor holding it anywhere it could be shown by accident.
   */
  const dungeon = $derived.by(() => {
    if (!dungeonNumbers) return null;
    const place = view.place;
    return {
      engaged: engagedMonster(game),
      square: squareFacts(game, view.rows[place.y][place.x]),
      kinds: floorMonsterKinds(game, view.monsters),
      onTheFloor: view.monsters.length,
      chase: chaseDistance(place.floor),
    };
  });


  /** The one level every monster of a kind was stocked at, or the range they cover. */
  const levels = (low: number, high: number) => (low === high ? `level ${low}` : `levels ${low}-${high}`);
</script>

<!-- The game's own colours: entry 7 of its palette for a number, entry 6 for one that is
     counting down to something unpleasant, and entry 15 for a monster's name. -->
<div
  class="panel"
  style:--number={SCREEN_COLOURS[7]}
  style:--number-bad={SCREEN_COLOURS[6]}
  style:--number-name={SCREEN_COLOURS[15]}>
  {#snippet rows(lines: PanelLine[], bad = false)}
    <dl>
      {#each lines as line}
        <div class="row">
          <dt>{line.label}</dt>
          <dd class:bad>{line.value}</dd>
          {#if line.note}<p class="note">{line.note}</p>{/if}
        </div>
      {/each}
    </dl>
  {/snippet}

  {#if dungeon}
    {#if dungeon.engaged}
      {@const engaged = dungeon.engaged}
      <section>
        <h3>What you are up against</h3>
        <p class="name">{engaged.name}</p>
        {@render rows([
          { label: 'Level', value: String(engaged.level) },
          { label: 'Hit points', value: `${engaged.hp} of at most ${engaged.mostHp}` },
          { label: 'Your next swing lands', value: percent(engaged.hitChance) },
        ])}
        <p class="note">
          The chance counts out the eighty rolls a swing makes, and calls a swing that gets past
          the monster but rolls no damage a miss, the way the game does.
        </p>
      </section>
    {/if}

    <section>
      <h3>This square</h3>
      {#if dungeon.square.length > 0}
        {@render rows(dungeon.square)}
      {:else}
        <p class="empty">Nothing but floor.</p>
      {/if}
      <p class="note">{SQUARE_NOTE}</p>
    </section>

    <section>
      <h3>This floor</h3>
      {@render rows([{ label: 'Monsters left alive', value: String(dungeon.onTheFloor) }])}
      <div class="route">
        <button type="button" class:picked={routing} onclick={() => (routing = !routing)}>
          Path to nearest teleporter
        </button>
        <label class="toggle">
          <input type="checkbox" bind:checked={routePassWall} />
          <span>Allow Pass Wall</span>
        </label>
      </div>
      {#if route}
        <p class="note">{routeWords(route)}</p>
      {:else if route === null}
        <p class="note">No teleporter reachable from here.</p>
      {/if}
      {#if dungeon.kinds.length > 0}
        <h4>Every monster on this floor</h4>
        <ol class="kinds">
          {#each dungeon.kinds as kind}
            <li>
              <button
                type="button"
                class:picked={highlighted === kind.monsterId}
                onclick={() => (highlighted = highlighted === kind.monsterId ? null : kind.monsterId)}>
                <span class="kind-name">{kind.name}</span>
                <span class="kind-facts">
                  {kind.count} on the floor &middot; {levels(kind.lowestLevel, kind.highestLevel)} &middot;
                  nearest {kind.nearest} away
                </span>
              </button>
            </li>
          {/each}
        </ol>
        <p class="note">Click a kind to ring every one of them on both maps.</p>
      {/if}
      <p class="note">
        A monster within {dungeon.chase} squares walks towards you; further off it stays where it
        is.
      </p>
    </section>
  {/if}

  {#if own.ailing.length > 0}
    <section>
      <h3>Poison and disease</h3>
      {@render rows(own.ailing, true)}
    </section>
  {/if}

  <section>
    <h3>Spells with a timer</h3>
    {#if own.timers.length > 0}
      {@render rows(own.timers)}
    {:else}
      <p class="empty">None running.</p>
    {/if}
  </section>

  {#if own.untimed.length > 0}
    <section>
      <h3>Spells with no timer</h3>
      {@render rows(own.untimed)}
    </section>
  {/if}

  <section>
    <h3>Charges you carry</h3>
    {#if own.items.length > 0}
      {#each own.items as group}
        <h4>{group.title}</h4>
        {@render rows(group.lines)}
      {/each}
    {:else}
      <p class="empty">No wand, scroll or paper with a charge on it.</p>
    {/if}
  </section>

  <section>
    <h3>Game time</h3>
    {@render rows([
      { label: 'Spent down here', value: `${own.seconds} second${own.seconds === 1 ? '' : 's'}` },
    ])}
  </section>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  h3 {
    margin: 0;
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }
  h4 {
    margin: 6px 0 0;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
  }
  .name {
    margin: 0;
    font-family: var(--font-dos);
    font-size: 24px;
    line-height: 1;
    color: var(--number-name);
  }
  dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    column-gap: 10px;
    align-items: baseline;
  }
  dt {
    font-size: 12px;
    color: var(--ink);
  }
  dd {
    margin: 0;
    font-family: var(--font-dos);
    font-size: 19px;
    line-height: 1;
    color: var(--number);
    text-align: right;
    white-space: nowrap;
  }
  dd.bad {
    color: var(--number-bad);
  }
  .note {
    grid-column: 1 / -1;
    margin: 1px 0 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--muted);
  }
  .empty {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .route {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }
  .route button {
    background: none;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 3px 7px;
    cursor: pointer;
    color: var(--ink);
    font: inherit;
    font-size: 12px;
  }
  .route button.picked {
    border-color: var(--accent);
    color: var(--accent);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
  }
  .kinds {
    margin: 2px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kinds button {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 1px 4px;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .kinds button:hover {
    border-color: var(--line);
  }
  .kinds button.picked {
    border-color: var(--accent);
    background: rgba(255, 255, 255, 0.06);
  }
  .kind-name {
    display: block;
    font-family: var(--font-dos);
    font-size: 17px;
    line-height: 1.2;
    color: var(--number-name);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kind-facts {
    display: block;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.3;
  }
</style>
