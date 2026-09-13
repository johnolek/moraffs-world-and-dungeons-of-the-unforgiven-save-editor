<!--
  Everything the little snake says, grouped by when it says it.

  The messages come out of the three files the game reads them from, and the grouping comes from
  the calls to give_hint and tablet_message in the decompilation. Nothing here is retyped.
-->
<script lang="ts">
  import { allHints, HELP_COLOURS, HELP_FILES, HELP_TOPICS, helpScreen } from '../game/port/hints';
  import SourceLink from '../source/SourceLink.svelte';
  import PixelText from '../ui/PixelText.svelte';
  import { SITUATIONS, type Placement } from './situations';

  /**
   * The colour a help screen's code letter puts the text in.
   *
   * read_help_screen turns each letter into an index into the game's palette, whose first sixteen
   * entries are the same in every palette the game loads: y is 4, a yellow (63, 63, 20); o is 5,
   * a burnt orange (53, 20, 0); r is 6, a red (63, 0, 10); n is 7, a golden orange (63, 45, 0);
   * g is 8, a pure green (0, 63, 0); b is 3, a pale blue (20, 50, 63); and w is 15, white. The
   * app's own green, red and blue stand in for the three it has; the other two are the game's
   * own colours, six bits per channel scaled up to eight.
   */
  const COLOURS: Record<number, string> = {
    [HELP_COLOURS.y]: 'var(--accent)',
    [HELP_COLOURS.o]: '#d75100',
    [HELP_COLOURS.r]: 'var(--mw-red)',
    [HELP_COLOURS.n]: '#ffb600',
    [HELP_COLOURS.g]: 'var(--mw-green)',
    [HELP_COLOURS.b]: 'var(--mw-cyan)',
    [HELP_COLOURS.w]: 'var(--ink)',
  };

  /** The code letter each palette entry came from, for the tooltip on a coloured line. */
  const LETTER_OF: Record<number, string> = Object.fromEntries(
    Object.entries(HELP_COLOURS).map(([letter, colour]) => [colour, letter]),
  );

  const text = new Map(
    allHints()
      .filter((entry) => entry.file.endsWith('.bin'))
      .map((entry) => [`${entry.file}:${entry.index}`, entry.lines.map((line) => line.text)]),
  );

  /** The help screens in menu order, with the one no menu entry opens after them. */
  const screens = [
    ...HELP_TOPICS.map((topic) => ({ key: topic.key, label: topic.label, file: topic.file })),
    ...HELP_FILES.filter((file) => !HELP_TOPICS.some((topic) => topic.file === file)).map((file) => ({
      key: '',
      label: 'No menu entry opens this one',
      file,
    })),
  ].map((topic) => ({ ...topic, pages: helpScreen(topic.file) }));

  let search = $state('');

  const needle = $derived(search.trim().toLowerCase());

  function lines(entry: Placement): string[] {
    return text.get(`${entry.file}:${entry.index}`) ?? [];
  }

  function matches(haystack: string): boolean {
    return needle === '' || haystack.toLowerCase().includes(needle);
  }

  const situations = $derived(
    SITUATIONS.map((situation) => ({
      ...situation,
      entries: situation.entries.filter((entry) => matches([...lines(entry), entry.who].join('\n'))),
    })).filter((situation) => situation.entries.length > 0),
  );

  const helpScreens = $derived(
    screens.filter((screen) =>
      matches([screen.label, ...screen.pages.flat().map((line) => line.text)].join('\n')),
    ),
  );

  function jumpTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

<div class="snake">
  <div class="index">
    <input type="search" placeholder="Search what the snake says" bind:value={search} />
    <nav class="scroll">
      <ul>
        {#each situations as situation}
          <li>
            <button type="button" onclick={() => jumpTo(situation.id)}>
              {situation.title}
              <span class="count">{situation.entries.length}</span>
            </button>
          </li>
        {/each}
        {#if helpScreens.length > 0}
          <li>
            <button type="button" onclick={() => jumpTo('help')}>
              Smarty's help screens
              <span class="count">{helpScreens.length}</span>
            </button>
          </li>
        {/if}
      </ul>
      {#if situations.length === 0 && helpScreens.length === 0}
        <p class="empty">Nothing the snake says matches.</p>
      {/if}
    </nav>
  </div>

  <div class="entries">
    <section class="intro">
      <h2><PixelText text="What the snake says" scale={2} /></h2>
      <p>
        A little snake follows you around Dungeons of the Unforgiven. It greets you when you walk
        into town, congratulates you when a night at the inn makes you a level, warns you when you
        step onto the floor a Shadow monster guards, carries messages from the monster itself, and
        drops a word of advice on the way down about one arrival in twelve. Press F1 and a
        different one turns up — "Smarty is my name, and information is my game" — with
        twenty-eight pages of help.
      </p>
      <p>
        It speaks out of three files. <code>UH.BIN</code> holds 138 eight-line messages, which
        <code>give_hint</code> reads by number; the snake's own begin "A LITTLE SNAKE SAYS:", and
        the rest are the game's other announcements, which are here because they share the box.
        <code>UH2.BIN</code> holds 86 four-line messages for the stone tablet: the town greetings,
        the congratulations, the bosses' taunts. The numbered <code>.uhp</code> files are Smarty's
        help screens, and they are the only ones with colours in them — a letter at the start of a
        line sets the colour of the whole line, one of
        <span class="swatch" style:color={COLOURS[HELP_COLOURS.r]}>r</span>ed,
        <span class="swatch" style:color={COLOURS[HELP_COLOURS.g]}>g</span>reen,
        <span class="swatch" style:color={COLOURS[HELP_COLOURS.b]}>b</span>lue,
        <span class="swatch" style:color={COLOURS[HELP_COLOURS.y]}>y</span>ellow,
        <span class="swatch" style:color={COLOURS[HELP_COLOURS.o]}>o</span>range,
        <span class="swatch" style:color={COLOURS[HELP_COLOURS.n]}>n</span> for a golden orange, or
        <span class="swatch" style:color={COLOURS[HELP_COLOURS.w]}>w</span>hite, which none of the
        files uses.
      </p>
      <p>
        Every message below is the file's own text, typos and all. Which one you hear was read out
        of the calls to <code>give_hint</code> in the decompiled game.
        <SourceLink ts={{ file: 'src/lib/game/port/hints.ts', name: 'giveHint' }} c="give_hint" />
      </p>
    </section>

    {#each situations as situation}
      <section id={situation.id}>
        <h3>
          <PixelText text={situation.title} />
          {#if situation.snake}<span class="tag">the snake</span>{/if}
        </h3>
        <p class="when">
          {situation.when}
          <SourceLink
            ts={situation.ts ? { file: 'src/lib/game/port/hints.ts', name: situation.ts } : undefined}
            c={situation.c}
          />
        </p>
        <div class="cards">
          {#each situation.entries as entry}
            <article>
              <div class="who">{entry.who}</div>
              <pre class="dos">{lines(entry).join('\n')}</pre>
              <div class="ref">{entry.file} · message {entry.index}</div>
            </article>
          {/each}
        </div>
      </section>
    {/each}

    {#if helpScreens.length > 0}
      <section id="help">
        <h3><PixelText text="Smarty's help screens" /><span class="tag">the snake</span></h3>
        <p class="when">
          F1 puts up two columns of fourteen lines and the snake reads out whichever you pick. A
          click picks a line by where it sits and a key picks it by its letter, and both end at the
          same file. There is no 19.uhp, and nothing in the menu opens 18.uhp.
          <SourceLink
            ts={{ file: 'src/lib/game/port/hints.ts', name: 'readHelpScreen' }}
            c="read_help_screen"
          />
        </p>
        <div class="cards">
          {#each helpScreens as screen}
            <article>
              <div class="who">{screen.label}</div>
              {#each screen.pages as page, index}
                <pre class="dos">{#each page as line}<span
                      style:color={COLOURS[line.colour]}
                      title="{LETTER_OF[line.colour]} — palette entry {line.colour}">{line.text}</span
                    >{'\n'}{/each}</pre>
                {#if index < screen.pages.length - 1}<div class="page">page {index + 1} of {screen.pages.length}</div>{/if}
              {/each}
              <div class="ref">{screen.file}.uhp</div>
            </article>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .snake {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .index {
    width: 260px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-right: 1px solid var(--line);
    background: var(--panel);
  }
  input {
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 7px 9px;
    font: inherit;
    font-size: 13px;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
  nav ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  nav li button {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 5px 6px;
    border: none;
    border-radius: 4px;
    background: none;
    font: inherit;
    font-size: 13px;
    text-align: left;
    color: var(--muted);
    cursor: pointer;
  }
  nav li button:hover {
    color: var(--ink);
    background: var(--panel-2);
  }
  .count {
    color: var(--line);
  }
  .entries {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 20px 24px 60px;
  }
  .intro {
    max-width: 70ch;
  }
  .intro h2 {
    margin: 0 0 14px;
    line-height: 0;
    color: var(--accent);
  }
  .intro p {
    margin: 0 0 12px;
    color: var(--muted);
  }
  section {
    scroll-margin-top: 8px;
    margin-bottom: 34px;
  }
  section h3 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 8px;
    line-height: 0;
    color: var(--ink);
  }
  .tag {
    padding: 2px 6px;
    border: 1px solid var(--line);
    border-radius: 999px;
    line-height: 1.2;
    font-size: 11px;
    color: var(--mw-green);
  }
  .when {
    max-width: 70ch;
    margin: 0 0 14px;
    color: var(--muted);
    font-size: 14px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
    gap: 12px;
  }
  article {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
  }
  .who {
    font-size: 12px;
    color: var(--accent-dim);
  }
  .ref {
    margin-top: auto;
    font-size: 11px;
    color: var(--line);
  }
  .page {
    font-size: 11px;
    color: var(--line);
    text-align: right;
  }
  .dos {
    margin: 0;
    font-family: var(--font-dos);
    font-size: 19px;
    line-height: 1.15;
    color: var(--ink);
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
  code {
    font-family: var(--font-dos);
    font-size: 16px;
    color: var(--ink);
  }
  .swatch {
    font-family: var(--font-dos);
    font-size: 17px;
  }
  .empty {
    color: var(--muted);
    font-size: 13px;
  }
</style>
