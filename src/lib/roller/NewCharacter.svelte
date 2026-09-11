<script lang="ts">
  import { app, currentEntry, type GameId, type Leaderboard, type Tab } from '../app-state.svelte';
  import { keepRolledCharacter } from '../character/current';
  import { LEADERBOARD_CHOICES } from '../character/leaderboard';
  import { downloadBytes } from '../download';
  import { goToTab } from '../history';
  import { MW_CLASS_NAMES, MW_RACES, MINUTES_PER_YEAR } from '../game/mw-port/character';
  import type { MwCharacter, MwGame } from '../game/mw-port/state';
  import { CLASS_NAMES, RACES, typedName } from '../game/port/character';
  import type { Game, PlayerCharacter, ScreenLine } from '../game/port/state';
  import { REV_CLASS_NAMES, REV_RACE_NAMES, REV_STAT_NAMES, revTypedName } from '../game/rev-port/character';
  import type { RevCharacter, RevGame, RevScreenLine } from '../game/rev-port/state';
  import GameScreen from '../ui/GameScreen.svelte';
  import { isTyping } from '../ui/keys';
  import PixelText from '../ui/PixelText.svelte';
  import { DESIGN_STAT_KEYS, rollerKey, type RollerScreen } from './keys';
  import { MW_SLOTS, mwSlotFileName, newMwCharacterFile } from './mw-save-file';
  import { MW_ROLLER_PORT, type MwRollerView } from './mw-session';
  import RevScreen from './RevScreen.svelte';
  import { MW_SCREEN_COLOURS, SCREEN_COLOURS } from './screen';
  import { newRevCharacterFile, newRevExploredFile, REV_SLOTS, revExploredFileName, revRecordFileName } from './rev-save-file';
  import { REV_ROLLER_PORT, type RevRollerView } from './rev-session';
  import { newCharacterFile, slotFileName, SLOTS } from './save-file';
  import { ROLLER_PORT, RollerSession, type RollerView } from './session';

  interface Props {
    /**
     * Whether this is the New Character tab, which draws its own scrolling frame, its title and
     * the page they sit on. The Play tab mounts the same roller under a heading of its own so
     * that a character can be rolled and walked into the dungeon without leaving the page.
     */
    standalone?: boolean;
    /** The tab the roller is mounted on, which is the one its keys are answered on. */
    tab?: Tab;
  }

  let { standalone = true, tab = 'roller' }: Props = $props();

  const STATS = ['STRENGTH', 'INTELLIGENCE', 'WISDOM', 'CONSTITUTION', 'AGILITY', 'LUCK'];

  /** A character one of the three games has rolled. */
  type RolledCharacter = PlayerCharacter | MwCharacter | RevCharacter;

  /**
   * Everything about the tab that is one game's rather than the other's.
   *
   * A row's own functions are only ever handed what that game's session rolled, which the types
   * cannot show: the tab holds whichever game the switch is on, so it holds all three games'
   * sessions and characters at once.
   */
  interface GameRoller {
    name: string;
    slots: number[];
    races: string[];
    classes: string[];
    numbers: string;
    folder: string;
    /** What the game calls the file it writes the character to. */
    fileName(slot: number): string;
    /** A fresh roll of this game's dice for that character number. */
    newSession(slot: number): Session;
    /** The bytes of the character's own file, which is the whole record in all three games. */
    writeRecord(pc: RolledCharacter): Uint8Array<ArrayBuffer>;
    /** The second file Moraff's Revenge writes beside the record, which is the explored map. */
    explored?: { fileName(slot: number): string; write(pc: RolledCharacter): Uint8Array<ArrayBuffer> };
    /** What the first line of a menu is answered with: Moraff's Revenge reads its menus with
     *  VAL, so the answer is the number printed beside the line; the other two number their
     *  lines from zero. */
    answerBase: 0 | 1;
    /** What the game prints between a class menu's number and the class. */
    classSeparator: string;
    /** How the game draws: the two older games in vectors, in these colours, and Moraff's
     *  Revenge on a text grid, which has a palette of its own. */
    display: { kind: 'vectors'; colours: string[] } | { kind: 'text' };
    /** How many letters of a name the game keeps, or null where the tab does not cut it short. */
    nameLimit: number | null;
    /** What the name box says before anything is typed. */
    namePlaceholder: string;
  }

  const GAMES: Record<GameId, GameRoller> = {
    unforgiven: {
      name: 'Dungeons of the Unforgiven',
      slots: SLOTS,
      races: RACES.map((race) => race.name),
      classes: CLASS_NAMES,
      numbers: 'The game keeps ten characters, in files named 20 to 29. Pick the one you want to write over — the game picks it before it rolls, and so does this.',
      folder: 'Back up the file you are replacing first. Drop the download into your game folder next to UNF.EXE, keeping the name, and the character is waiting on the select screen.',
      fileName: slotFileName,
      newSession: (slot) => new RollerSession(ROLLER_PORT, slot),
      writeRecord: newCharacterFile,
      answerBase: 0,
      classSeparator: ') ',
      display: { kind: 'vectors', colours: SCREEN_COLOURS },
      nameLimit: 18,
      namePlaceholder: 'Up to 18 letters, digits and spaces',
    },
    moraffsWorld: {
      name: "Moraff's World",
      slots: MW_SLOTS,
      races: MW_RACES.map((race) => race.name),
      classes: MW_CLASS_NAMES,
      numbers: 'The game keeps ten characters, in files named 0 to 9. Pick the one you want to write over — the game picks it before it rolls, and so does this.',
      folder: 'Back up the file you are replacing first. Drop the download into your game folder next to WORLD.EXE, keeping the name, and the character is waiting on the select screen.',
      fileName: mwSlotFileName,
      newSession: (slot) => new RollerSession(MW_ROLLER_PORT, slot),
      writeRecord: newMwCharacterFile,
      answerBase: 0,
      classSeparator: ') ',
      display: { kind: 'vectors', colours: MW_SCREEN_COLOURS },
      nameLimit: 18,
      namePlaceholder: 'Up to 18 letters, digits and spaces',
    },
    revenge: {
      name: "Moraff's Revenge",
      slots: REV_SLOTS,
      races: REV_RACE_NAMES,
      classes: REV_CLASS_NAMES,
      numbers: 'The game has room for ten characters, in files named 1.EXE to 10.EXE. CHCHAR.EXE gives a new one the next free number; pick the one you want it to be.',
      folder: 'Back up the files you are replacing first. A character is two files — the record and the explored map — and both go in your game folder next to DUNSMALL.EXE, keeping their names. The name goes in F5.COM, which holds one quoted name to a line with "END" on the last: put this character’s name on the line its number says, so character 3 is the third name in the file.',
      fileName: revRecordFileName,
      newSession: (slot) => new RollerSession(REV_ROLLER_PORT, slot),
      writeRecord: newRevCharacterFile,
      explored: { fileName: revExploredFileName, write: newRevExploredFile },
      answerBase: 1,
      classSeparator: '=',
      display: { kind: 'text' },
      nameLimit: null,
      namePlaceholder: 'The name, which goes in F5.COM',
    },
  };

  type Session = RollerSession<Game, RollerView> | RollerSession<MwGame, MwRollerView> | RollerSession<RevGame, RevRollerView>;
  type View = RollerView | MwRollerView | RevRollerView;

  let slot = $state(SLOTS[0]);
  let session = $state.raw<Session | null>(null);
  let view = $state.raw<View | null>(null);
  let typed = $state('');
  let note = $state('');
  /** The board this roll is for, which is the lock the finished character carries for life. */
  let leaderboard = $state<Leaderboard | null>(null);
  /** Whether the finished character has been put on the roster; a roll keeps it once. */
  let kept = false;

  /** Which game is being rolled for. All three have a roller, so it is whichever the switch is on. */
  const rolling = $derived<GameId>(app.game);
  const chosen = $derived(GAMES[rolling]);
  /** The screen a key would answer: the game's own, or the character number asked for first. */
  const screen = $derived<RollerScreen | null>(session && view ? view.question : 'number');
  const menus = $derived({ races: chosen.races.length, classes: chosen.classes.length, numbers: chosen.slots.length });
  const fileName = $derived(chosen.fileName(slot));
  const showing = $derived(
    view === null ? [] : view.question === 'name' ? [...(view.screen as ScreenLine[]), nameBeingTyped()] : (view.screen as ScreenLine[]),
  );
  /** Moraff's Revenge prints its name prompt on row 20 and the letters follow it. */
  const revShowing = $derived.by(() => {
    if (view === null) return [];
    const lines = view.screen as RevScreenLine[];
    if (view.question !== 'name') return lines;
    return [...lines, { row: 20, column: 20, text: revTypedName(typed), colour: 7, background: 0 }];
  });

  /**
   * The name as it is typed, which typed_name (exe 4000:55b2) draws under the prompt as the keys
   * come in: eighteen character slots between x = 0 and x = 0x44c, in the big font in yellow. The
   * port takes the finished name from the tab instead, so the tab draws this one. Both games keep
   * the same characters of what is typed, so either port's filter shows what will be stored.
   */
  function nameBeingTyped(): ScreenLine {
    const name = typedName(typed);
    return { text: name, x: 0, y: 1000, spreadTo: Math.round((0x44c / 18) * name.length), font: 2, colour: 4 };
  }

  // A roll is one game's questions and one game's dice, so the switch in the header starts over.
  $effect(() => {
    slot = GAMES[rolling].slots[0];
    session = null;
    view = null;
    note = '';
  });

  function start() {
    const started = chosen.newSession(slot);
    session = started;
    view = started.view();
    typed = '';
    note = '';
    kept = false;
  }

  /** A roll that has reached its sheet goes straight on the roster, current, without a click. */
  function keepWhenDone() {
    if (!view || view.question !== null || kept) return;
    kept = true;
    keepRolledCharacter(rolling, view.pc.name || fileName, slot, chosen.writeRecord(view.pc), leaderboard);
  }

  function answer(value: number | string) {
    if (!session) return;
    session.answer(value);
    view = session.view();
    typed = '';
    keepWhenDone();
  }

  /** The arrows on Moraff's Revenge's race menu, which move a pointer rather than answer. */
  function moveRace(step: number) {
    if (!session) return;
    session.moveRace(step);
    view = session.view();
  }

  /** Return on that menu, which takes the race the pointer is on. */
  function takeRace() {
    if (!session) return;
    session.takeRace();
    view = session.view();
    keepWhenDone();
  }

  function enterName() {
    if (typed.trim() !== '') answer(typed);
  }

  function restart() {
    if (!session) return;
    session.restart();
    view = session.view();
    typed = '';
    note = '';
    kept = false;
  }

  function leave() {
    session = null;
    view = null;
    note = '';
  }

  function openInEditor() {
    if (!view) return;
    keepWhenDone();
    goToTab(app, 'editor');
  }

  /** Straight into the game: the character is kept and current, and the Play tab starts it. */
  function playNow() {
    if (!view) return;
    keepWhenDone();
    app.startPlaying = currentEntry()?.id ?? null;
    goToTab(app, 'play');
  }

  /** The game is answered from the keyboard while the tab is showing, the same keys its own
   *  screens ask for. A key belongs to whatever is being typed into, and a shortcut belongs to
   *  the browser. */
  function onKeyDown(event: KeyboardEvent) {
    if (app.tab !== tab || screen === null) return;
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
    const action = rollerKey(screen, event.key, typed, menus);
    if (!action) return;
    event.preventDefault();
    if (action.kind === 'answer') answer(action.value);
    else if (action.kind === 'typing') typed = action.typed;
    else if (action.kind === 'pick') slot = chosen.slots[action.index];
    else if (action.kind === 'move') moveRace(action.step);
    else if (screen === 'name') enterName();
    else if (screen === 'revRace') takeRace();
    else start();
  }

  function save(bytes: Uint8Array<ArrayBuffer>, name: string) {
    downloadBytes(bytes, name);
    note = `Downloaded ${name}`;
  }

  function download() {
    if (!view) return;
    save(chosen.writeRecord(view.pc), fileName);
  }

  /** Moraff's Revenge keeps the explored map in a second file beside the record. */
  function downloadExplored() {
    if (!view || !chosen.explored) return;
    save(chosen.explored.write(view.pc), chosen.explored.fileName(slot));
  }
</script>

<svelte:window onkeydown={onKeyDown} />

{#if standalone}
  <div class="roller">
    <div class="page body">{@render roller()}</div>
  </div>
{:else}
  <div class="body">{@render roller()}</div>
{/if}

{#snippet roller()}
    {#if !session || !view}
      {#if standalone}
        <h2><PixelText text="New Character" scale={2} /></h2>
      {/if}
      <p class="lead">
        Roll up a character the way the game does: the same questions, the same dice, the same starting kit. The finished
        character joins your roster and downloads as a character file you can drop into your game folder.
      </p>

      <section>
        <h3><PixelText text="Character Number" /></h3>
        <p class="hint">{chosen.numbers}</p>
        <p class="hint">The keyboard picks them too: 0 to 9 for the ten numbers, then Enter to roll.</p>
        <div class="row">
          {#each chosen.slots as number}
            <button type="button" class:picked={slot === number} onclick={() => (slot = number)}>{number}</button>
          {/each}
        </div>
      </section>

      <section>
        <h3><PixelText text="Leaderboard" /></h3>
        <p class="hint">
          A character rolled for a leaderboard is locked to that board's mode for its whole life, so that every run of it can be
          compared with the others on the board. Editing it in the Save Editor ends that for good.
        </p>
        <div class="boards">
          {#each LEADERBOARD_CHOICES as choice}
            <label>
              <input type="radio" value={choice.id} bind:group={leaderboard} />
              <span>{choice.label}</span>
              <span class="how">{choice.how}</span>
            </label>
          {/each}
        </div>
      </section>

      <div class="row">
        <button type="button" class="go" onclick={start}>Roll a character</button>
      </div>
    {:else}
      <div class="toolbar">
        <span class="badge">{chosen.name}</span>
        <span class="badge">Character {slot}</span>
        <button type="button" class="ghost" onclick={restart}>Start again</button>
        <button type="button" class="ghost" onclick={leave}>Pick another number</button>
      </div>

      <!-- CHCHAR.EXE clears the screen before it writes the character out and then chains back to
           the game's own menu, so there is nothing left to draw once the roll is finished. -->
      {#if chosen.display.kind === 'text'}
        {#if view.question !== null}
          <RevScreen lines={revShowing} width={view.width ?? 80} />
        {/if}
      {:else}
        <GameScreen lines={showing} colours={chosen.display.colours} />
      {/if}

      {#if view.question === 'continue'}
        <div class="choices">
          <button type="button" onclick={() => answer(0)}>Hit any key</button>
        </div>
      {:else if view.question === 'difficulty'}
        <div class="choices">
          <button type="button" onclick={() => answer(0)}>1) NORMAL DIFFICULTY</button>
          <button type="button" onclick={() => answer(1)}>2) I CAN HANDLE ANYTHING DIFFICULTY</button>
        </div>
      {:else if view.question === 'race' || view.question === 'revRace'}
        <div class="choices grid">
          {#each chosen.races as race, index}
            <button
              type="button"
              class:picked={view.race === index + 1}
              onclick={() => answer(index + chosen.answerBase)}>{index + 1}) {race}</button>
          {/each}
        </div>
        {#if view.race !== null}
          <p class="hint">The game moves along the row with the left and right arrows and takes the one it is on with Return.</p>
        {/if}
      {:else if view.question === 'keepRerollDesign'}
        <div class="choices">
          <button type="button" onclick={() => answer(0)}>Y) KEEP THIS CHARACTER</button>
          <button type="button" onclick={() => answer(1)}>N) ROLL A NEW CHARACTER</button>
          <button type="button" onclick={() => answer(2)}>D) DESIGN YOUR OWN CHARACTER</button>
        </div>
      {:else if view.question === 'designStat'}
        <div class="choices grid">
          {#each STATS as stat, index}
            <button type="button" onclick={() => answer(index)}>{DESIGN_STAT_KEYS[index]}) {stat}</button>
          {/each}
        </div>
        <div class="choices">
          <button type="button" class="ghost" onclick={() => answer(6)}>ESC-CANCEL THIS CHARACTER</button>
        </div>
      {:else if view.question === 'name'}
        <div class="choices">
          <input
            type="text"
            maxlength={chosen.nameLimit}
            bind:value={typed}
            onkeydown={(event) => event.key === 'Enter' && enterName()}
            placeholder={chosen.namePlaceholder}
          />
          <button type="button" disabled={typed.trim() === ''} onclick={enterName}>Enter</button>
        </div>
      {:else if view.question === 'class' || view.question === 'revClass'}
        <div class="choices grid">
          {#each chosen.classes as name, index}
            <button type="button" onclick={() => answer(index + chosen.answerBase)}>{index + 1}{chosen.classSeparator}{name}</button>
          {/each}
        </div>
      {:else if view.question === 'revKeep'}
        <div class="choices">
          <button type="button" onclick={() => answer(0)}>Y) KEEP THIS CHARACTER</button>
          <button type="button" onclick={() => answer(1)}>N) ROLL A NEW CHARACTER</button>
        </div>
      {/if}

      {#if view.question === null}
        <section class="sheet">
          <h3><PixelText text={view.pc.name || 'The Character'} /></h3>
        </section>

        <div class="choices">
          <button type="button" class="go" onclick={playNow}>Play now</button>
          <button type="button" onclick={openInEditor}>Open in the Save Editor</button>
          <button type="button" onclick={download}>Download file {fileName}</button>
          {#if chosen.explored}
            <button type="button" onclick={downloadExplored}>Download file {chosen.explored.fileName(slot)}</button>
          {/if}
        </div>
        <p class="hint">{chosen.folder}</p>
        {#if note}<p class="note">{note}</p>{/if}
      {/if}
    {/if}
{/snippet}

<style>
  .roller {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .page {
    max-width: 880px;
    margin: 0 auto;
    padding: 24px 32px 48px;
  }
  h2 {
    margin: 0 0 12px;
    color: var(--accent);
    line-height: 0;
  }
  h3 {
    margin: 0 0 10px;
    color: var(--accent);
    line-height: 0;
  }
  .lead {
    margin: 0 0 20px;
    color: var(--muted);
    font-size: 13px;
  }
  section {
    margin-bottom: 20px;
  }
  .hint {
    margin: 8px 0;
    color: var(--muted);
    font-size: 13px;
  }
  .note {
    margin: 8px 0;
    color: var(--good);
    font-size: 13px;
  }
  .boards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .boards label {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0 8px;
    font-size: 13px;
    cursor: pointer;
  }
  .boards input {
    grid-row: span 2;
    margin: 0;
    accent-color: var(--accent);
  }
  .boards .how {
    grid-column: 2;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.4;
  }
  .body .row,
  .body .choices {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 0;
  }
  .choices {
    margin: 14px 0;
  }
  .choices.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  }
  button {
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 8px 14px;
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }
  button:disabled {
    color: var(--muted);
    cursor: not-allowed;
    opacity: 0.55;
  }
  button.picked {
    border-color: var(--accent);
    color: var(--accent);
  }
  button.go {
    background: var(--accent);
    border-color: var(--accent);
    color: #1a1822;
    font-weight: 600;
  }
  button.go:hover {
    color: #1a1822;
  }
  button.ghost {
    background: none;
  }
  /* The box the character's name is typed into, and nothing else: a bare `input` would draw
     every leaderboard radio 280 pixels wide and leave its label stranded off to the right. */
  input[type='text'] {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    padding: 8px 12px;
    min-width: 280px;
  }
  .toolbar {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .badge {
    background: var(--panel);
    color: var(--accent);
    border: 1px solid var(--accent-dim);
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }
  /* The game's own screen, in the game's own typeface, laid out in the game's own coordinates. */
  .sheet {
    margin-top: 22px;
  }
  .sheet h3 {
    margin-bottom: 14px;
  }
</style>
