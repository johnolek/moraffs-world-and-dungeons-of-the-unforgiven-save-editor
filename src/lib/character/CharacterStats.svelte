<!--
  A character's numbers as the game's own status block draws them: armour and weapon, level and
  experience, spell and health points down the left, and the six characteristics two to a row
  down the right, with the battle spells still running in a box of their own.

  It is handed a `CharacterStatus` and nothing else, so the panel at the top of the site draws
  the character being worked on and a run's journal draws the character who played it.
-->
<script lang="ts">
  import { expLabel, levelLabel, withSeparators, type CharacterStatus } from './record';

  interface Props {
    status: CharacterStatus;
  }

  let { status }: Props = $props();

  const points = (value: number) => String(Math.trunc(value));
</script>

<div class="boxes">
  <div class="status">
    <div class="left">
      <div class="line cyan">ARMOR:{status.armor} &nbsp; WEAPON:{status.weapon}</div>
      <div class="line yellow">{levelLabel(status.lev)}{status.lev} &nbsp; {expLabel(status.lev)}{withSeparators(status.exp)}</div>
      <div class="line green">SPELL POINTS:{points(status.sp)}{status.maxSp === null ? '' : ` OF ${points(status.maxSp)}`}</div>
      <div class="line green">HEALTH POINTS:{status.hp} OF {status.maxHp}</div>
    </div>
    <div class="stats">
      {#each [0, 2, 4] as first}
        <div class="line red">
          {#each status.stats.slice(first, first + 2) as stat}
            <span class="stat">{stat.label}:{stat.value}</span>
          {/each}
        </div>
      {/each}
    </div>
  </div>
  {#if status.battleSpells.length > 0}
    <div class="spells">
      <div class="line heading">CURRENT BATTLE SPELLS IN EFFECT</div>
      <div class="spell-lines">
        {#each status.battleSpells as spell}
          <div class="line">{spell}</div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .boxes {
    display: flex;
    align-items: flex-start;
    gap: 18px;
    flex-wrap: wrap;
  }
  /* The game's own status block: a green panel with the numbers in a DOS terminal face. */
  .status {
    display: inline-flex;
    gap: 26px;
    padding: 5px 12px 7px;
    border: 2px solid #17a017;
    border-radius: 4px;
    background: #0a6a0a;
  }
  .stats {
    /* The game starts the characteristics beside the level, a line below the top of the box. */
    margin-top: 1.15em;
  }
  .spells {
    padding: 5px 12px 7px;
    border: 2px solid #a01717;
    border-radius: 4px;
    background: #6a0a0a;
  }
  .spell-lines {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 20px;
  }
  .line {
    font-family: var(--font-dos);
    font-size: 20px;
    line-height: 1.15;
    white-space: nowrap;
    color: var(--ink);
  }
  .heading {
    color: var(--accent);
  }
  .cyan {
    color: var(--mw-cyan);
  }
  .yellow {
    color: var(--accent);
  }
  .green {
    color: var(--mw-green);
  }
  .red {
    color: var(--mw-red);
  }
  .stat {
    display: inline-block;
    min-width: 5.5em;
  }
</style>
