<!--
  A row of buttons with the picked one filled: the game switch in the header, and the two pickers
  on the Boards page.

  The row is joined into one bar by default, which only works for a handful of short words. A row
  of many, or of long ones, is `wrap`: each button keeps its own border so the row can break over
  as many lines as it needs rather than running off the side of the page.

  Buttons rather than radios, because picking one is a command the page acts on straight away and
  nothing here is ever submitted as a form. `aria-pressed` is what tells a screen reader which one
  is picked, and the group carries the label the whole row is about.
-->
<script lang="ts" generics="Id extends string">
  interface Props {
    /** What the row as a whole picks, for anything reading the page aloud. */
    label: string;
    /** The choices, any of which can be there to see but not to pick. */
    choices: { id: Id; label: string; disabled?: boolean }[];
    /** The choice showing as picked. */
    value: Id;
    onpick: (id: Id) => void;
    /** Whether the row breaks over several lines instead of standing as one joined bar. */
    wrap?: boolean;
  }

  let { label, choices, value, onpick, wrap = false }: Props = $props();
</script>

<div class="segmented" class:wrap role="group" aria-label={label}>
  {#each choices as choice}
    <button
      type="button"
      class:active={value === choice.id}
      aria-pressed={value === choice.id}
      disabled={choice.disabled}
      onclick={() => onpick(choice.id)}>{choice.label}</button>
  {/each}
</div>

<style>
  .segmented {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
  }
  button {
    padding: 6px 14px;
    white-space: nowrap;
    border: none;
    background: none;
    font: inherit;
    font-size: 13px;
    color: var(--muted);
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    color: var(--ink);
  }
  button.active {
    background: var(--accent-dim);
    color: #1a1822;
    font-weight: 600;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .segmented.wrap {
    flex-wrap: wrap;
    gap: 6px;
    border: none;
    border-radius: 0;
    overflow: visible;
  }
  .segmented.wrap button {
    border: 1px solid var(--line);
    border-radius: 6px;
  }
</style>
