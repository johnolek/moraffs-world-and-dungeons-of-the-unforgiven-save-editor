<script lang="ts">
  import { untrack } from 'svelte';
  import { app, watchingCharacterOn } from '../app-state.svelte';
  import { goToTab } from '../history';
  import { currentCharacter } from '../calculators/character';
  import { weaponById } from '../calculators/combat';
  import {
    expValue,
    monsterAttackInterval,
    monsterHpRange,
    monsterLevelBase,
    sleepChance,
  } from '../game/dotu-mech.js';
  import { sectionInfo } from '../game/sections';
  import { MODULE_NUMERALS } from '../map/labels';
  import SourceLink from '../source/SourceLink.svelte';
  import { percent } from '../ui/format';
  import BarChart from '../ui/BarChart.svelte';
  import SectionHeading from '../ui/SectionHeading.svelte';
  import { binHp, hpDistribution, levelDistribution } from './distribution';
  import LevelControl from './LevelControl.svelte';
  import MonsterCard from './MonsterCard.svelte';
  import MonsterCorridor from './MonsterCorridor.svelte';
  import { describeEffects, homeFloor, isPuffball, stockingOdds, whereItAppears, type Monster } from './monsters';
  import { hitChance, toHitTotal, totalNeededToBeatDefense, type ToHitFighter } from './to-hit';

  interface Props {
    entry: Monster;
    groupLabel: string;
  }

  let { entry, groupLabel }: Props = $props();

  /** The resistance spell that halves each kind of breath; acid has none. */
  const BREATH_RESISTS = ['Anti-Fire', 'Anti-Cold', '', 'Resist Disease', 'Resist Poison'];
  /** Levels rarer than this are left out of the chart; the nudge has a very long tail. */
  const RARE_LEVEL = 0.0005;
  /** The game's weapon table starts with the fist, which every character can swing. */
  const FIST = weaponById(0);
  /** The character the worked line falls back to when the save editor holds no character. */
  const EXAMPLE_FIGHTER: ToHitFighter = { lev: 30, str: 40, luck: 20, weaponHit: FIST.hit, hard: false };

  // The parent keys this component on the monster, so the controls start fresh each time.
  const home = untrack(() => homeFloor(entry));
  let module = $state(home.module);
  let floor = $state(home.floor);
  let baseLevel = $state(monsterLevelBase(home.floor, home.module));

  /** The Fight tab, set up against this monster on the floor being read about here. */
  function fightIt() {
    app.requestedFight = { monsterId: entry.id, module, floor };
    goToTab(app, 'fight');
  }

  // The floor control only offers floors of the module the monster appears in, and every one of
  // those belongs to a section.
  const section = $derived(sectionInfo(module, floor)!);
  const sectionNumber = $derived(entry.origin.kind === 'section' ? entry.origin.section : section.section);
  const effects = $derived(describeEffects(entry));
  const appearance = $derived(whereItAppears(entry));
  const odds = $derived(stockingOdds(entry));

  const hpRange = $derived(monsterHpRange(entry.type.hpPerLevel, baseLevel, entry.isBoss, sectionNumber));
  const experience = $derived(Math.round(expValue(baseLevel, entry.expMult)));
  // The distributions only depend on the base level, which the level control has already worked out.
  const levels = $derived(levelDistribution(baseLevel).filter(({ p }) => p >= RARE_LEVEL));
  const hpBars = $derived(binHp(hpDistribution(entry, baseLevel)));
  const hpLabels = $derived(hpBars.map(({ from, to }) => (from === to ? String(from) : `${from}\u2013${to}`)));

  const stats = $derived([
    ['Defense', String(entry.type.defense)],
    ['Damage die', String(entry.type.damageDie)],
    ['HP per level', String(entry.type.hpPerLevel)],
    ['Speed', String(entry.type.speed)],
    ['Experience', `×${entry.expMult}`],
  ]);

  const floorLines = $derived(
    appearance.ranges.map((range) => {
      const floors = range.from === range.to ? `floor ${range.from}` : `floors ${range.from}–${range.to}`;
      return `Module ${MODULE_NUMERALS[range.module]}, ${floors}`;
    }),
  );


  const halfTheTime = $derived(totalNeededToBeatDefense(0.5, baseLevel, entry.type.defense, entry.type.speed));
  const nineSwingsInTen = $derived(totalNeededToBeatDefense(0.9, baseLevel, entry.type.defense, entry.type.speed));

  /**
   * The current character, as the pieces of a swing and its die, or null when there is none —
   * and null as well while the player is on another tab, since a game writes the record back to
   * the roster after every key and working a swing out for nobody to see is work for nobody.
   */
  const yours = $derived.by(() => {
    if (!watchingCharacterOn('monsters')) return null;
    const record = currentCharacter();
    if (!record) return null;
    const fighter: ToHitFighter = {
      lev: record.lev,
      str: record.str,
      luck: record.luck,
      luckyCharms: record.luckyCharms,
      weaponHit: weaponById(record.weapon).hit,
      gauntlet: record.gauntlet,
      weaponPlus: record.weaponPlus[record.weapon] ?? 0,
      tempWeaponPlus: record.tempWeaponPlus,
      hard: record.hard !== 0,
    };
    return { name: record.name.trim(), fighter, damageDie: weaponById(record.weapon).damageDie };
  });

  const workedLine = $derived.by(() => {
    const fighter = yours?.fighter ?? EXAMPLE_FIGHTER;
    const damageDie = yours?.damageDie ?? FIST.damageDie;
    const chance = percent(hitChance(toHitTotal(fighter), baseLevel, entry.type.defense, entry.type.speed, damageDie));
    if (yours) {
      return (
        `${yours.name}, level ${fighter.lev.toLocaleString()} with Strength ${fighter.str.toLocaleString()} ` +
        `and Luck ${fighter.luck.toLocaleString()}, hits it ${chance} of the time.`
      );
    }
    return (
      `A level ${fighter.lev.toLocaleString()} fighter with Strength ${fighter.str.toLocaleString()} ` +
      `and Luck ${fighter.luck.toLocaleString()}, on normal difficulty with a fist, hits it ${chance} of the time.`
    );
  });
</script>

<MonsterCard
  name={entry.name}
  groupLine={groupLabel}
  numbersTitle="Stats"
  numbers={stats}
  {effects}
  {art}
  {aboveNumbers}
  {body} />

{#snippet art()}
  <MonsterCorridor {entry} {module} {floor} section={section.section} part={section.part} />
{/snippet}

{#snippet aboveNumbers()}
  <section>
    <SectionHeading title="Type" />
    <p class="quote">{entry.type.text}</p>
    <p class="note">Type {entry.type.type}</p>
  </section>
{/snippet}

{#snippet body()}
  {#if entry.description}
    <section>
      <SectionHeading title="Description" />
      <p>{entry.description}</p>
    </section>
  {/if}

  <section>
    <SectionHeading title="Where it appears" />
    <ul class="floors">
      {#each floorLines as line}
        <li>{line}</li>
      {/each}
    </ul>
    {#if odds === null}
      <p class="note">One per boss floor, until you collect the section's reward.</p>
    {:else}
      <p class="note">{percent(odds)} of the monsters stocked on a floor.</p>
    {/if}
  </section>

  <section>
    <SectionHeading title="At level {baseLevel}" />
    <LevelControl {entry} bind:module bind:floor bind:baseLevel />
    <dl>
      <dt>Hit points</dt>
      <dd>{hpRange[0].toLocaleString()}–{hpRange[1].toLocaleString()}</dd>
      <dt>Experience</dt>
      <dd>{isPuffball(entry) ? 'None' : experience.toLocaleString()}</dd>
      <dt>Seconds between attacks</dt>
      <dd>{monsterAttackInterval(entry.type.speed)}</dd>
      <dt>Sleep</dt>
      <dd>
        Works on it {percent(sleepChance(baseLevel))} of the time.
        <SourceLink ts={{ file: 'src/lib/game/port/magic.ts', name: 'sleepMonster' }} c="sleep_monster" />
      </dd>
      {#if entry.breath > 0}
        <dt>Breath damage</dt>
        <dd>
          {baseLevel}–{2 * baseLevel - 1}{BREATH_RESISTS[entry.breath - 1]
            ? `, halved by ${BREATH_RESISTS[entry.breath - 1]}`
            : ''}
        </dd>
      {/if}
    </dl>

    <div class="to-hit">
      <p class="note">
        Hitting it
        <SourceLink ts={{ file: 'src/lib/bestiary/to-hit.ts', name: 'hitChance' }} c="strike" />
      </p>
      <p>
        A to-hit total of {halfTheTime.toLocaleString()} gets past its defense half the time; {nineSwingsInTen.toLocaleString()}
        nine swings in ten.
      </p>
      <p>
        Your total is 2 × level + Strength (counted twice, plus 25 over 25, on normal difficulty) + Luck + weapon and
        gauntlet bonuses.
      </p>
      <p>{workedLine}</p>
      <div>
        <button type="button" class="fight" onclick={fightIt}>Fight it</button>
      </div>
    </div>

    <div class="charts">
      <BarChart
        labels={hpLabels}
        values={hpBars.map(({ p }) => p * 100)}
        tooltip={(index) => `${hpLabels[index]} HP: ${percent(hpBars[index].p)}`}
        xLabel="Hit points"
      />
      <BarChart
        labels={levels.map(({ level }) => String(level))}
        values={levels.map(({ p }) => p * 100)}
        tooltip={(index) => `Level ${levels[index].level}: ${percent(levels[index].p)}`}
        xLabel="Level it is stocked at"
      />
    </div>
  </section>
{/snippet}

<style>
  .quote {
    margin: 0;
    color: var(--mw-cyan);
    font-size: 13px;
  }
  .to-hit {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 16px;
  }
  .fight {
    margin-top: 4px;
    padding: 5px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: transparent;
    font: inherit;
    font-size: 13px;
    color: var(--muted);
    cursor: pointer;
  }
  .fight:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .charts {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-top: 20px;
  }
</style>
