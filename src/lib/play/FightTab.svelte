<!--
  The Fight tab: one monster, a copy of a character, and the game's own loop between them.

  The setup form is above the game's screen and the outcome is beside it. Everything the fight
  itself is made of is `fight-sim.ts`; everything it is drawn with belongs to the Play tab
  already — `Screen.svelte` for the screen, `Panel.svelte` for the numbers the game never
  prints, and `PlayRoster.svelte` for choosing who fights.
-->
<script lang="ts">
  import { app, watchingCharacterOn, currentEntry, keysGoTo } from '../app-state.svelte';
  import {
    allowedFloors,
    allowedModules,
    homeFloor,
    monsterGroups,
  } from '../bestiary/monsters';
  import { blockWheel } from '../editor/block-wheel';
  import { CLASS_NAMES } from '../editor/games';
  import { monsterLevelBase } from '../game/dotu-mech.js';
  import { ARMOR_NAMES, WEAPON_NAMES } from '../game/port/drops';
  import { loadPlayer } from '../game/port/record';
  import { SeededRng } from '../game/port/rng';
  import type { PlayerCharacter } from '../game/port/state';
  import { MODULE_NUMERALS } from '../map/labels';
  import { monsterById } from '../map/stocking';
  import PixelText from '../ui/PixelText.svelte';
  import { isTyping } from '../ui/keys';
  import { armSpeaker } from '../speaker';
  import type { GameSession, PlayView } from './engine';
  import type { JournalEntry } from './journal';
  import {
    castFightSpell,
    fightJournal,
    fightOutcome,
    fightSummary,
    fightSummaryLines,
    fillSpellPoints,
    monsterLevelRange,
    rollFightHp,
    sendInTheMonster,
    startFight,
    FIGHT_FIELDS,
    FIGHT_SPELL_LISTS,
    type FightFieldKey,
    type FightMonster,
    type FightOutcome,
    type FightSpell,
    type FightSummary,
    spellsCast,
    FIGHT_COLUMNS,
    FIGHT_OUTCOMES,
  } from './fight-sim';
  import { forgetFight, forgetFights, keepFight, keptFights } from './fight-history.svelte';
  import { gameKey } from './keys';
  import Panel from './Panel.svelte';
  import PlayRoster from './PlayRoster.svelte';
  import Screen from './Screen.svelte';

  /** The kind the monster picker starts on, which is the first of the game's own table. */
  const FIRST_MONSTER = 'builtin-0';

  /** The zoom map and the four views draw the whole floor here: a fight is not a walk through a
   *  dungeon, so there is nothing to have discovered. */
  const WHOLE_FLOOR = { known: () => true, knownOnArrival: () => true };

  /** Something the setup did to the character before or during a fight, which is what "Again"
   *  does again. */
  type FightAction = { kind: 'spell'; spell: FightSpell } | { kind: 'fill' };

  const character = $derived.by(() => {
    void watchingCharacterOn('fight');
    return currentEntry();
  });
  const ours = $derived(character !== null && character.game === 'unforgiven');

  /** The copy of the record the form edits, and which character it was taken from. */
  let copiedFrom = $state.raw<string | null>(null);
  let copy = $state<PlayerCharacter | null>(null);

  const firstHome = homeFloor(monsterById(FIRST_MONSTER));
  const firstBase = monsterLevelBase(firstHome.floor, firstHome.module);
  let monsterId = $state(FIRST_MONSTER);
  let module = $state(firstHome.module);
  let floor = $state(firstHome.floor);
  let level = $state(firstBase);
  let hp = $state(rollFightHp(monsterById(FIRST_MONSTER), firstBase));

  let session = $state.raw<GameSession | null>(null);
  let view = $state.raw<PlayView | null>(null);
  let done = $state.raw<FightAction[]>([]);
  /** Whether the monster has been sent in, so that an empty slot before it arrives is not read
   *  as a monster already killed. */
  let sent = $state(false);
  /** The monster this session was set up for, which is the one sent in however the form has been
   *  changed since. */
  let built = $state.raw<FightMonster | null>(null);
  /** The character this session was set up with, for the same reason. */
  let fought = $state.raw<PlayerCharacter | null>(null);
  /** The spells that had been cast when the monster was sent in, by name. */
  let prepared = $state.raw<string[]>([]);
  /** Whether this fight has been kept already, so that it is kept once however often the tab
   *  draws it. */
  let recorded = false;
  /** Whether the last attempt to send the monster in found rock in front of the character. */
  let blocked = $state(false);
  /**
   * Whether a spell button is in the middle of its keys, which holds the screen where it was.
   *
   * A cast is three keys with the loop let run between them, so without this the tab would draw
   * the list menu and the spell table on the way past and the player would watch them flash by.
   */
  let casting = false;

  const entry = $derived(monsterById(monsterId));
  const modules = $derived(allowedModules(entry));
  const floors = $derived(allowedFloors(entry, module));
  const baseLevel = $derived(monsterLevelBase(floor, module));
  const levels = $derived(monsterLevelRange(baseLevel));
  /** The view is read as well as the session, since the session itself is never replaced and
   *  a fresh view is what says the game has moved on. */
  const outcome: FightOutcome = $derived.by(() => {
    const playing = session;
    if (playing === null || view === null) return 'waiting';
    return fightOutcome(playing, sent);
  });

  /**
   * What the fight came to, once it has come to something.
   *
   * A fresh session's event list is empty and its clock is at nought, so the whole of it is the
   * fight -- the spells cast while setting it up included.
   */
  const finished: FightSummary | null = $derived.by(() => {
    if (view === null) return null;
    if (outcome !== 'monsterDead' && outcome !== 'characterDead') return null;
    return summarise();
  });

  /** The fights already kept against the monster the form has picked, the most recent first. */
  const compared = $derived(keptFights(monsterId));

  /** Every line of the fight that has just ended. */
  const finishedLog: JournalEntry[] = $derived(finished === null ? [] : fightLog());

  // A fight that has ended is kept the moment it ends, so that changing a number and fighting
  // again leaves the two side by side.
  $effect(() => {
    if (finished === null) return;
    keep(finished);
  });

  /** The copy is taken when a character is picked, so the numbers in the form start as theirs
   *  and stay wherever the form leaves them. */
  $effect(() => {
    const picked = character;
    if (!picked || picked.game !== 'unforgiven') {
      copiedFrom = null;
      copy = null;
      return;
    }
    if (copiedFrom === picked.id) return;
    copiedFrom = picked.id;
    copy = loadPlayer(picked.bytes);
  });

  function pickMonster(id: string) {
    monsterId = id;
    const home = homeFloor(monsterById(id));
    standOn(home.module, home.floor);
  }

  // The Monsters tab can send a monster here to be fought, on the floor it was being read on.
  $effect(() => {
    const asked = app.requestedFight;
    if (!asked) return;
    app.requestedFight = null;
    monsterId = asked.monsterId;
    standOn(asked.module, asked.floor);
  });

  /** The floor the fight is set on, and the level and hit points a fresh roll on it would give. */
  function standOn(pickedModule: number, pickedFloor: number) {
    module = pickedModule;
    floor = pickedFloor;
    const base = monsterLevelBase(pickedFloor, pickedModule);
    level = base;
    hp = rollFightHp(monsterById(monsterId), base);
  }

  function pickModule(picked: number) {
    const allowed = allowedFloors(monsterById(monsterId), picked);
    standOn(picked, allowed.includes(floor) ? floor : allowed[0]);
  }

  function typeNumber(field: FightFieldKey, event: Event) {
    const typed = Number((event.currentTarget as HTMLInputElement).value);
    if (copy && Number.isFinite(typed)) copy[field] = typed;
  }

  function typeLevel(event: Event) {
    const typed = Number((event.currentTarget as HTMLInputElement).value);
    if (typed >= levels.from && typed <= levels.to) level = typed;
  }

  function typeHp(event: Event) {
    const typed = Number((event.currentTarget as HTMLInputElement).value);
    if (typed >= 1) hp = typed;
  }

  function start() {
    done = [];
    build();
  }

  async function sendIn() {
    const playing = session;
    const monster = built;
    if (!playing || playing.over || monster === null) return;
    const arrived = await sendInTheMonster(playing, monster);
    blocked = !arrived;
    sent = arrived;
    if (arrived) prepared = spellsCast(playing.game.events);
    view = playing.view();
  }

  /** What the fight came to as it stands, or null while there is no fight to sum up. A fight the
   *  monster was never sent into is not one. */
  function summarise(): FightSummary | null {
    const playing = session;
    if (playing === null || !sent) return null;
    return fightSummary(playing.game.events, {
      seconds: playing.game.secondsElapsed,
      outcome: fightOutcome(playing, sent),
    });
  }

  /** Every line of the fight as it stands, in the words a run's journal uses. */
  function fightLog(): JournalEntry[] {
    const playing = session;
    const monster = built;
    if (playing === null || monster === null) return [];
    return fightJournal(playing.game.events, { floor: monster.floor, module: monster.module });
  }

  /** Keep a fight that is over, with the character and the monster it was fought with. */
  function keep(summary: FightSummary | null) {
    const character = fought;
    const monster = built;
    if (recorded || summary === null || character === null || monster === null) return;
    recorded = true;
    keepFight({ at: new Date(), character, monster, prepared, summary, entries: fightLog() });
  }

  /** A session for the setup as it stands. The old one is finished first so that nothing of it
   *  is left running behind the new one. */
  function build() {
    const record = character?.bytes;
    if (!record || !copy) return;
    session?.finish();
    sent = false;
    blocked = false;
    recorded = false;
    prepared = [];
    const monster: FightMonster = { monsterId, module, floor, level, hp };
    const fighting = $state.snapshot(copy) as PlayerCharacter;
    built = monster;
    fought = fighting;
    const started = startFight(
      { record, character: fighting, monster },
      new SeededRng((Math.random() * 0x100000000) >>> 0),
    );
    started.onChange = () => {
      if (!casting) view = started.view();
    };
    session = started;
    view = started.view();
  }

  /** The same setup over again: the same numbers, the same monster, and everything the spell
   *  buttons did done again in the same order. */
  async function again() {
    const before = done;
    const monsterWasSent = sent;
    done = [];
    build();
    for (const action of before) {
      if (action.kind === 'fill') fill();
      else await cast(action.spell);
    }
    if (monsterWasSent) await sendIn();
  }

  function leave() {
    keep(summarise());
    session?.finish();
    session = null;
    view = null;
    done = [];
    sent = false;
    built = null;
    fought = null;
    prepared = [];
    blocked = false;
  }

  async function cast(spell: FightSpell) {
    const playing = session;
    if (!playing || playing.over) return;
    done = [...done, { kind: 'spell', spell }];
    casting = true;
    try {
      await castFightSpell(playing, spell, sent);
    } finally {
      casting = false;
      view = playing.view();
    }
  }

  function fill() {
    const playing = session;
    if (!playing || playing.over) return;
    done = [...done, { kind: 'fill' }];
    fillSpellPoints(playing);
    view = playing.view();
  }

  /** "SWORD +3", which is the two fields of the form read as one. */
  function gearWords(names: string[], which: number, plus: number[]): string {
    const bonus = plus[which] ?? 0;
    return bonus === 0 ? names[which] : `${names[which]} ${bonus > 0 ? '+' : ''}${bonus}`;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!keysGoTo('fight')) return;
    if (!session || session.over) return;
    if (isTyping(event.target)) return;
    const key = gameKey(event);
    if (key === null) return;
    event.preventDefault();
    armSpeaker();
    session.press(key);
  }
</script>

<svelte:window onkeydown={onKeyDown} />

{#snippet fullLog(entries: JournalEntry[])}
  <details class="log">
    <summary>Full log</summary>
    <ol>
      {#each entries as entry, at (at)}
        <li><span class="at">{entry.at}</span>{entry.text}</li>
      {/each}
    </ol>
  </details>
{/snippet}

<div class="fight">
  <div class="setup">
    <h2><PixelText text="Fight" scale={2} /></h2>
    <p class="lead">
      One monster, one character, and the game's own loop between them. The character is a copy:
      nothing here is written back to the roster, and a death in a fight leaves them alive on it.
    </p>
    {#if !ours || !copy}
      <p class="hint">Load a Dungeons of the Unforgiven save or roll a character, and this is where they fight.</p>
      <PlayRoster game="unforgiven" />
    {:else}
      <div class="columns">
        <section class="block">
          <h3>The character</h3>
          <p class="note">{character?.name}, copied from the roster. Change any of these numbers.</p>
          <div class="fields">
            <label>
              Class
              <select value={copy.cls} onchange={(event) => (copy!.cls = Number(event.currentTarget.value))}>
                {#each CLASS_NAMES as name, index}<option value={index}>{name}</option>{/each}
              </select>
            </label>
            {#each FIGHT_FIELDS as group}
              {#each group.fields as field}
                <label>
                  {field.label}
                  <input type="number" value={copy[field.key]} oninput={(event) => typeNumber(field.key, event)} use:blockWheel />
                </label>
              {/each}
            {/each}
            <label>
              Weapon
              <select value={copy.weapon} onchange={(event) => (copy!.weapon = Number(event.currentTarget.value))}>
                {#each WEAPON_NAMES as name, index}<option value={index}>{name}</option>{/each}
              </select>
            </label>
            <label>
              Weapon Plus
              <input
                type="number"
                value={copy.weaponPlus[copy.weapon]}
                oninput={(event) => (copy!.weaponPlus[copy!.weapon] = Number(event.currentTarget.value))}
                use:blockWheel />
            </label>
            <label>
              Armor
              <select value={copy.armor} onchange={(event) => (copy!.armor = Number(event.currentTarget.value))}>
                {#each ARMOR_NAMES as name, index}<option value={index}>{name}</option>{/each}
              </select>
            </label>
            <label>
              Armor Plus
              <input
                type="number"
                value={copy.armorPlus[copy.armor]}
                oninput={(event) => (copy!.armorPlus[copy!.armor] = Number(event.currentTarget.value))}
                use:blockWheel />
            </label>
          </div>
        </section>

        <section class="block">
          <h3>The monster</h3>
          <div class="fields">
            <label class="wide">
              Monster
              <select value={monsterId} onchange={(event) => pickMonster(event.currentTarget.value)}>
                {#each monsterGroups() as group}
                  <optgroup label={group.label}>
                    {#each group.monsters as listed}<option value={listed.id}>{listed.name}</option>{/each}
                  </optgroup>
                {/each}
              </select>
            </label>
            <label>
              Module
              <select value={module} onchange={(event) => pickModule(Number(event.currentTarget.value))}>
                {#each modules as index}<option value={index}>{MODULE_NUMERALS[index]}</option>{/each}
              </select>
            </label>
            <label>
              Floor
              <select value={floor} onchange={(event) => standOn(module, Number(event.currentTarget.value))}>
                {#each floors as which}<option value={which}>{which}</option>{/each}
              </select>
            </label>
            <label>
              Its level
              <input type="number" min={levels.from} max={levels.to} value={level} oninput={typeLevel} use:blockWheel />
            </label>
            <label>
              Its hit points
              <input type="number" min="1" value={hp} oninput={typeHp} use:blockWheel />
            </label>
          </div>
          <p class="note">
            The floor is worth {baseLevel} before the roll, so the game could store this one at a
            level between {levels.from} and {levels.to}. Its hit points are rolled from the floor
            rather than from that level, the way the game rolls them.
          </p>
          <div class="row">
            <button type="button" onclick={() => (hp = rollFightHp(entry, baseLevel))}>Roll again</button>
            <button type="button" class="go" onclick={start}>Set up the fight</button>
          </div>
        </section>
      </div>
    {/if}
  </div>

  {#if session && view}
    {@const playing = session}
    {@const showing = view}
    <div class="arena">
      <div class="stage">
        <Screen
          game={playing.game}
          rows={showing.rows}
          place={showing.place}
          monsters={showing.monsters}
          box={showing.box}
          screen={showing.screen}
          screenCleared={showing.screenCleared}
          discovered={WHOLE_FLOOR}
          mapMonsters={showing.monsters}
          debug={true}
          prompt={showing.prompt}
          killed={showing.killed}
          viewsDrawn={showing.viewsDrawn}
          expandedMap={showing.expandedMap}
          tablet={showing.tablet}
          sectionScreen={showing.sectionScreen}
          buildingScreen={showing.buildingScreen}
          bossOffice={showing.bossOffice}
          tunnel={showing.tunnel}
          plaque={showing.plaque}
          fade={showing.fade} />
      </div>
      <aside class="beside">
        <div class="outcome">
          <p class="verdict">
            {#if showing.stopped}
              The game stopped: {showing.stopped}
            {:else if outcome === 'characterDead'}
              The character is dead. The roster still has them alive.
            {:else if outcome === 'monsterDead'}
              The monster is dead.
            {:else if outcome === 'waiting'}
              Cast what you want, then send in the monster.
            {:else}
              The fight is on. F swings, C casts, I uses an item, Q quits.
            {/if}
          </p>
          {#if blocked}
            <p class="note">Nothing can stand in rock. Turn to an open square and send it in again.</p>
          {/if}
          <div class="row">
            {#if outcome === 'waiting'}
              <button type="button" class="go" onclick={sendIn}>Send in the monster</button>
            {/if}
            <button type="button" onclick={again}>Again</button>
            <button type="button" onclick={leave}>Leave the fight</button>
          </div>
          {#if finished}
            <h3 class="summed">What the fight came to</h3>
            <ul class="summary">
              {#each fightSummaryLines(finished) as line, at (at)}<li>{line}</li>{/each}
            </ul>
            {@render fullLog(finishedLog)}
          {/if}
        </div>

        <section class="spells">
          <div class="row">
            <button type="button" onclick={fill}>Fill spell points</button>
          </div>
          <p class="note">
            A button casts its spell through the game's own spell code. The copy is given the
            spell in its book to cast it. Before the monster is sent in the spell costs it no
            spell points, the way one off a scroll or a wand would not; once the fight is on the
            copy pays for every spell, and is refused one it cannot afford.
          </p>
          <p class="note">
            The game refuses a preparation spell with a monster already engaged, so cast those
            before the monster is sent in. It also refuses a Fighter a spellbook altogether, and
            only a Sage is allowed both lists of battle spells out of one, so the class above is
            what decides which of these buttons work.
          </p>
          {#each FIGHT_SPELL_LISTS as list}
            <h4>{list.title}</h4>
            <div class="buttons">
              {#each list.spells as spell}
                <button type="button" onclick={() => cast(spell)}>{spell.name}</button>
              {/each}
            </div>
          {/each}
        </section>

        <Panel game={playing.game} view={showing} />
      </aside>
    </div>
  {/if}

  {#if compared.length > 0}
    <section class="kept">
      <h3>Fights kept against {entry.name}</h3>
      <p class="note">
        Every fight finished against this monster since the page was opened, the most recent
        first. Pick another monster above and its own fights are here instead. Nothing is saved:
        reloading the page forgets them all.
      </p>
      <div class="scroller">
        <table>
          <thead>
            <tr>
              <th>Fought</th>
              <th>Class</th>
              {#each FIGHT_COLUMNS as column}<th>{column.label}</th>{/each}
              <th>Weapon</th>
              <th>Armor</th>
              <th>Its level</th>
              <th>Its hit points</th>
              <th>Cast first</th>
              <th>Outcome</th>
              <th>What it came to</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each compared as fight (fight.id)}
              <tr>
                <td>{fight.at.toLocaleTimeString()}</td>
                <td>{CLASS_NAMES[fight.character.cls]}</td>
                {#each FIGHT_COLUMNS as column}<td class="number">{fight.character[column.key]}</td>{/each}
                <td>{gearWords(WEAPON_NAMES, fight.character.weapon, fight.character.weaponPlus)}</td>
                <td>{gearWords(ARMOR_NAMES, fight.character.armor, fight.character.armorPlus)}</td>
                <td class="number">{fight.monster.level}</td>
                <td class="number">{fight.monster.hp}</td>
                <td>{fight.prepared.length === 0 ? '--' : fight.prepared.join(', ')}</td>
                <td>{FIGHT_OUTCOMES[fight.summary.outcome]}</td>
                <td>
                  <ul class="summary">
                    {#each fightSummaryLines(fight.summary) as line, at (at)}<li>{line}</li>{/each}
                  </ul>
                  {@render fullLog(fight.entries)}
                </td>
                <td><button type="button" onclick={() => forgetFight(fight.id)}>Delete</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="row">
        <button type="button" onclick={() => forgetFights(monsterId)}>Clear</button>
      </div>
    </section>
  {/if}
</div>

<style>
  .fight {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    overflow-y: auto;
  }
  .setup {
    padding: 20px 24px;
    border-bottom: 1px solid var(--line);
  }
  h2 {
    margin: 0 0 14px;
    line-height: 0;
    color: var(--accent);
  }
  h3 {
    margin: 0 0 4px;
    font-size: 14px;
    color: var(--accent);
  }
  h4 {
    margin: 12px 0 6px;
    font-size: 12px;
    color: var(--accent);
  }
  .lead,
  .hint {
    max-width: 76ch;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.6;
  }
  .note {
    margin: 6px 0 0;
    max-width: 60ch;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .columns {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    margin-top: 12px;
  }
  .block {
    flex: 1;
    min-width: 320px;
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px 12px;
    margin-top: 8px;
  }
  .fields .wide {
    grid-column: 1 / -1;
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
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 13px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  button {
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  button:hover {
    border-color: var(--accent);
  }
  .go {
    border-color: transparent;
    background: var(--accent-dim);
    color: #1a1822;
    font-weight: 600;
  }
  .arena {
    display: flex;
    flex: 1;
    min-width: 0;
    gap: 12px;
    padding: 12px;
  }
  .stage {
    flex: 1;
    min-width: 0;
    max-width: min(100%, calc((100dvh - 22rem) * 4 / 3));
  }
  .beside {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: clamp(300px, 26vw, 380px);
    flex-shrink: 0;
  }
  .verdict {
    margin: 0;
    font-family: var(--font-dos);
    font-size: 18px;
    line-height: 1.3;
    color: var(--accent);
  }
  .summed {
    margin: 12px 0 0;
    font-size: 13px;
    color: var(--muted);
  }
  .summary {
    margin: 4px 0 0;
    padding-left: 18px;
    font-size: 12px;
    line-height: 1.6;
  }
  .log {
    margin-top: 6px;
    max-width: 52ch;
    white-space: normal;
  }
  /* A long fight is hundreds of lines, so the log scrolls inside its own box rather than making
     the column it sits in as tall as the fight. */
  .log ol {
    margin: 4px 0 0;
    padding: 0;
    max-height: 260px;
    overflow-y: auto;
    list-style: none;
    font-size: 12px;
    line-height: 1.5;
  }
  .log li {
    display: flex;
    gap: 8px;
    white-space: normal;
  }
  /* How many moves into the fight the line was written. */
  .log .at {
    flex: none;
    min-width: 3ch;
    text-align: right;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .log summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--accent-dim);
  }
  .log summary:hover {
    color: var(--accent);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .buttons button {
    padding: 3px 7px;
    font-size: 11px;
  }
  .kept {
    padding: 0 12px 20px;
  }
  .kept h3 {
    margin: 12px 0 0;
  }
  /* A row is twenty numbers wide and the tab is not, so the table scrolls sideways inside its
     own box rather than making the page do it. */
  .scroller {
    margin-top: 8px;
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  table {
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    padding: 4px 8px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
    white-space: nowrap;
  }
  th {
    color: var(--muted);
    font-weight: 600;
  }
  td.number {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .kept .summary {
    white-space: normal;
    min-width: 32ch;
  }
  /* Narrow enough that a column beside the screen would leave the screen the smaller of the
     two, which is the width the Play tab drops its own side column at. */
  @media (max-width: 900px) {
    .arena {
      flex-direction: column;
    }
    .beside {
      width: 100%;
      max-width: 460px;
    }
  }
</style>
