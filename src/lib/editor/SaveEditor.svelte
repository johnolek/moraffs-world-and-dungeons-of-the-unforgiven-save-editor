<script lang="ts">
  import './editor.css';
  import { app, currentEntry } from '../app-state.svelte';
  import {
    characterEdited,
    importCharacter,
    importRevExploredMap,
    renumberCharacter,
    replaceCharacterBytes,
    unloadCharacter,
    voidCurrentLeaderboard,
  } from '../character/current';
  import { leaderboardEditWarning } from '../character/leaderboard';
  import { characterFileName, characterSlots } from '../character/record';
  import { downloadBytes } from '../download';
  import { isRevExploredFile } from '../map/explored';
  import { GAME_SCHEMAS, GAMES, pickGameForFile } from './games';
  import type { GameSchema, TextRecord } from './schema';
  import SectionView from './SectionView.svelte';

  interface Document {
    game: GameSchema;
    bytes: Uint8Array<ArrayBuffer>;
    view: DataView;
    /** The numbers of a text record, for a game whose file is text rather than a run of bytes. */
    record: TextRecord | null;
    /** Copy of the file as it was opened, for "Discard changes". */
    pristine: Uint8Array<ArrayBuffer>;
  }

  let doc = $state.raw<Document | null>(null);
  /** Bumped to remount every field after the bytes are replaced. */
  let version = $state(0);
  let dragover = $state(false);
  let toast = $state<{ message: string; warn: boolean } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let fileInput = $state<HTMLInputElement>();
  /** The record as the roster last accepted it, so that an edit a locked character's owner will
   *  not pay for can be put back. */
  let kept = new Uint8Array();

  /** What the file this is editing is called, which is the character's number when it has one. */
  const fileName = $derived.by(() => {
    const current = currentEntry();
    return current ? characterFileName(current.slot, current.name, current.game) : '';
  });
  /** The numbers the download can be named after: the ten the game keeps, and the name an
   *  oddly named file was loaded under, which is only offered while it is still the one in use. */
  const fileNames = $derived.by(() => {
    const current = currentEntry();
    if (!current) return [];
    const numbered = characterSlots(current.game).map((slot) => ({ slot, name: characterFileName(slot, '', current.game) }));
    return current.slot === null ? [{ slot: null, name: current.name }, ...numbered] : numbered;
  });

  /** The number picked in the toolbar, which is what the download is named after from now on. */
  function renumber(event: Event) {
    const current = currentEntry();
    const picked = (event.currentTarget as HTMLSelectElement).value;
    if (current) renumberCharacter(current.id, picked === '' ? null : Number(picked));
  }

  function showToast(message: string, warn = false) {
    toast = { message, warn };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 1800);
  }

  function open(game: GameSchema, bytes: Uint8Array<ArrayBuffer>) {
    const values = game.readRecord?.(bytes) ?? null;
    doc = {
      game,
      bytes,
      view: new DataView(bytes.buffer),
      record: values && { values },
      pristine: bytes.slice(),
    };
    kept = bytes.slice();
    version++;
  }

  /**
   * A field has been edited. A byte record was written in place, so there is nothing to do but
   * say so; a text record has no fixed offsets, so the file is written out again from its numbers
   * and the character on the roster is given the new bytes.
   */
  function edited() {
    if (!doc) return;
    if (!mayWrite()) {
      undoEdit();
      return;
    }
    if (doc.record && doc.game.writeRecord) {
      const bytes = doc.game.writeRecord(doc.record.values);
      doc.bytes = bytes;
      replaceCharacterBytes(bytes);
    } else {
      characterEdited();
    }
    kept = doc.bytes.slice();
  }

  /**
   * Whether the edit may go through to the character. A character rolled for a leaderboard is
   * asked about first, because writing a record here takes it off that board for good; saying no
   * leaves the character exactly as it was.
   */
  function mayWrite(): boolean {
    const board = currentEntry()?.leaderboard ?? null;
    if (board === null) return true;
    if (!confirm(leaderboardEditWarning(board))) return false;
    voidCurrentLeaderboard();
    return true;
  }

  /**
   * Put the record back as the roster last had it and draw the fields from it again.
   *
   * The field components write straight into the bytes and only then say that they have, so an
   * edit that is refused has already happened by the time this runs and is undone rather than
   * stopped. A game whose record is text writes its numbers instead and leaves the bytes alone,
   * and reading the record again is what puts those numbers back.
   */
  function undoEdit() {
    if (!doc) return;
    doc.bytes.set(kept);
    const values = doc.game.readRecord?.(doc.bytes) ?? null;
    doc = { ...doc, record: values && { values } };
    version++;
  }

  // The character can be made current somewhere else — rolled in the New Character tab, chosen
  // in the panel, or brought back from the last visit — and the editor then opens it.
  $effect(() => {
    const current = currentEntry();
    if (!current) {
      doc = null;
      return;
    }
    if (doc && doc.bytes === current.bytes) return;
    const game = GAMES.find((entry) => entry.id === current.game);
    if (game) open(game, current.bytes);
  });

  interface DroppedFile {
    name: string;
    bytes: Uint8Array<ArrayBuffer>;
  }

  /**
   * Everything dropped at once, the records before the maps. A Moraff's Revenge explored map
   * belongs to the character being worked on, so dropping <n>.BIN with <n>.EXE has to open the
   * record before the map arrives — and the browser hands the files over in whatever order it
   * pleases.
   */
  async function receive(files: FileList | null | undefined) {
    const dropped = await Promise.all(
      [...(files ?? [])].map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })),
    );
    const records: DroppedFile[] = [];
    const maps: DroppedFile[] = [];
    for (const file of dropped) (isRevExploredFile(file.name, file.bytes) ? maps : records).push(file);
    records.forEach(openRecord);
    maps.forEach(keepExploredMap);
  }

  /**
   * The file says which game it belongs to — its size for the two games whose record is a fixed
   * run of bytes, and whether it reads as a character for the one whose record is text — and
   * opening one of another game's saves is what moves the site to that game. A file that is none
   * of theirs is read as the game the switch is on. It joins the roster and becomes the character
   * being worked on, which is what opens it here.
   */
  function openRecord(file: DroppedFile) {
    const game = pickGameForFile(file.bytes) ?? GAME_SCHEMAS[app.game];
    if (game) importCharacter(game.id, file.name, file.bytes);
  }

  /** A `<n>.BIN`, which is not a character but the map one has walked. */
  function keepExploredMap(file: DroppedFile) {
    const kept = importRevExploredMap(file.bytes);
    if (kept) showToast(`Explored map loaded for ${kept.name}`);
    else showToast(`${file.name} is an explored map. Open the character it belongs to first.`, true);
  }

  function onFileChosen() {
    receive(fileInput?.files);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragover = false;
    receive(event.dataTransfer?.files);
  }

  function download() {
    if (!doc) return;
    doc.game.onSave?.(doc.bytes);
    downloadBytes(doc.bytes, fileName);
    showToast('Downloaded ' + fileName);
  }

  function discard() {
    if (!doc || !mayWrite()) return;
    const bytes = doc.pristine.slice();
    const values = doc.game.readRecord?.(bytes) ?? null;
    doc = { ...doc, bytes, view: new DataView(bytes.buffer), record: values && { values } };
    version++;
    kept = bytes.slice();
    replaceCharacterBytes(bytes);
    showToast('Changes discarded');
  }

  function unload() {
    if (fileInput) fileInput.value = '';
    unloadCharacter();
  }
</script>

<!-- The whole page takes a drop, so that a Moraff's Revenge explored map can be dropped on a
     character that is already open, as well as with the record it belongs to. -->
<div
  class="save-editor"
  class:dragover
  role="region"
  aria-label="Drop save files here"
  ondragenter={(event) => {
    event.preventDefault();
    dragover = true;
  }}
  ondragover={(event) => {
    event.preventDefault();
    dragover = true;
  }}
  ondragleave={(event) => {
    event.preventDefault();
    dragover = false;
  }}
  ondrop={onDrop}
>
  <div class="page">
    <p class="lead">Edit Moraff's World, Moraff's Revenge and Dungeons of the Unforgiven character files in your browser. Nothing is uploaded — all editing happens locally.</p>

    {#if !doc}
      <div class="intro">
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Upload your save file.</strong> These are plain, numbered files in your game directory — named <code>1</code>, <code>2</code>,
            <code>3</code>, etc. in Moraff's World, <code>21</code>, <code>22</code>, <code>23</code>, etc. in Dungeons of the Unforgiven, and
            <code>1.EXE</code>, <code>2.EXE</code>, etc. in Moraff's Revenge, where they are text files despite the extension (one file per
            character). Moraff's Revenge keeps the map your character has walked in a second file beside the record —
            <code>1.BIN</code>, <code>2.BIN</code>, etc. — and dropping that with the character brings the walked squares across.
          </li>
          <li><strong>Make your changes</strong> using the editor that appears.</li>
          <li><strong>Download the new file</strong> and overwrite the original in your game directory.</li>
        </ol>
        <p class="warn-note">
          <strong>Back up your save files first.</strong> This tool is provided as-is and isn't guaranteed to work correctly for everything — keep a
          copy of the original so you can restore it if something goes wrong.
        </p>
      </div>

      <label class="drop-zone" class:dragover>
        <div><strong>Click to choose</strong> or drag a save file here</div>
        <input type="file" multiple bind:this={fileInput} onchange={onFileChosen} />
      </label>
    {/if}

    {#if doc}
      <div class="toolbar">
        <button type="button" onclick={download}>Download edited file</button>
        <button type="button" class="ghost" onclick={discard}>Discard changes</button>
        <button type="button" class="ghost" onclick={unload}>Load different file</button>
        <span class="game-badge">{doc.game.displayName}</span>
        <label class="filename">
          File name
          <select value={currentEntry()?.slot ?? ''} onchange={renumber}>
            {#each fileNames as choice}<option value={choice.slot ?? ''}>{choice.name}</option>{/each}
          </select>
        </label>
      </div>
      <!-- The field components write straight into the bytes without telling anyone. The events
           their inputs bubble are how the rest of the app hears that the character changed. -->
      <div oninput={edited} onchange={edited}>
        {#key version}
          {#each doc.game.sections as section}
            <SectionView view={doc.view} record={doc.record} {section} />
          {/each}
        {/key}
      </div>
    {/if}

    <footer>
      <p>Runs entirely in your browser. No data leaves your computer.</p>
      <p>
        The Dungeons of the Unforgiven character file format was reverse engineered and documented by <strong>Spectere</strong> and
        <strong>Bag of Magic Food</strong>. Credit and thanks to them, and to the
        <a href="https://moddingwiki.shikadi.net/wiki/Dungeons_of_the_Unforgiven_Player_Character" target="_blank" rel="noopener">DOS Game Modding Wiki</a>.
      </p>
      <p>
        Source on <a href="https://github.com/johnolek/moraffs-world-and-dungeons-of-the-unforgiven-save-editor" target="_blank" rel="noopener">GitHub</a>.
      </p>
    </footer>
  </div>

  {#if toast}
    <div class="toast" class:warn={toast.warn}>{toast.message}</div>
  {/if}
</div>

<style>
  .save-editor {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .page {
    max-width: 880px;
    margin: 0 auto;
    padding: 24px 32px 48px;
  }
  .lead {
    margin: 0 0 20px;
    color: var(--muted);
    font-size: 13px;
  }
  .intro {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 18px 22px;
    margin-bottom: 20px;
    color: var(--muted);
    font-size: 13px;
  }
  .intro h2 {
    margin: 0 0 10px;
    font-size: 13px;
    color: var(--accent);
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }
  .intro ol {
    margin: 0;
    padding-left: 20px;
  }
  .intro li {
    margin-bottom: 5px;
  }
  .intro li strong {
    color: var(--ink);
  }
  .intro code {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    background: var(--panel-2);
    color: var(--mw-cyan);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 12px;
  }
  .warn-note {
    margin: 12px 0 0;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    color: var(--warn);
  }
  .warn-note strong {
    color: var(--warn);
  }
  .drop-zone {
    display: block;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 36px 24px;
    text-align: center;
    cursor: pointer;
    color: var(--muted);
    transition: all 0.15s ease;
  }
  .save-editor.dragover {
    outline: 2px dashed var(--accent);
    outline-offset: -8px;
  }
  .drop-zone:hover,
  .drop-zone.dragover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .drop-zone strong {
    color: var(--accent);
  }
  .drop-zone input {
    display: none;
  }
  .toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .filename {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--muted);
    font-size: 13px;
  }
  .filename select {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 13px;
  }
  .game-badge {
    background: var(--panel);
    color: var(--accent);
    border: 1px solid var(--accent-dim);
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }
  footer {
    margin-top: 24px;
    padding-top: 24px;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.6;
    border-top: 1px solid var(--line);
  }
  footer p {
    margin: 0 0 8px;
  }
  footer a {
    color: var(--accent-dim);
  }
  footer a:hover {
    color: var(--accent);
  }
  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--good);
    color: #102014;
    padding: 10px 16px;
    border-radius: 6px;
    font-weight: 600;
    pointer-events: none;
  }
  .toast.warn {
    background: var(--warn);
    color: #1a1822;
  }
</style>
