<script lang="ts">
  import MarkdownPage from '../../ui/MarkdownPage.svelte';
  import source from './ENDLESS.md?raw';
</script>

<MarkdownPage {source} searchLabel="Search the endless dungeon" nothingFound="Nothing here matches." />
