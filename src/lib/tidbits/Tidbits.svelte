<script lang="ts">
  import { app } from '../app-state.svelte';
  import MarkdownPage from '../ui/MarkdownPage.svelte';
  import { TIDBITS_FILES } from './files';
</script>

<MarkdownPage
  source={TIDBITS_FILES[app.game] ?? ''}
  searchLabel="Search tidbits"
  nothingFound="No tidbits match."
/>
