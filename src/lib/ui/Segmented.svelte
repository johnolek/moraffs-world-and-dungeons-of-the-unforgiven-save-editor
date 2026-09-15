<!--
  A row of buttons joined into one control, with the picked one filled: the game switch in the
  header, and the two pickers on the Boards page.

  Buttons rather than radios, because picking one is a command the page acts on straight away and
  nothing here is ever submitted as a form. `aria-pressed` is what tells a screen reader which one
  is picked, and the group carries the label the whole row is about.
-->
<script lang="ts" generics="Id extends string">
  interface Props {
    /** What the row as a whole picks, for anything reading the page aloud. */
    label: string;
    choices: { id: Id; label: string }[];
    /** The choice showing as picked. */
    value: Id;
    onpick: (id: Id) => void;
  }

  let { label, choices, value, onpick }: Props = $props();
</script>

<div class="segmented" role="group" aria-label={label}>
  {#each choices as choice}
    <button
      type="button"
      class:active={value === choice.id}
      aria-pressed={value === choice.id}
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
  button:hover {
    color: var(--ink);
  }
  button.active {
    background: var(--accent-dim);
    color: #1a1822;
    font-weight: 600;
  }
</style>
