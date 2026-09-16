<script lang="ts">
  import MonsterPicture from '../bestiary/MonsterPicture.svelte';
  import { monsterById, type StockedMonster } from '../map/stocking';
  import PortraitFrame from './PortraitFrame.svelte';
  import type { SectionDrawn } from './view-scene';

  interface Props {
    /** The monster standing straight ahead, or null when the character faces none. */
    monster: StockedMonster | null;
    /** The look the floor the monster stands on is drawn in (`view-scene.ts`), which is the
     *  palette its picture is drawn in. */
    section: SectionDrawn;
  }

  let { monster, section }: Props = $props();

  const entry = $derived(monster ? monsterById(monster.monsterId) : null);
</script>

<PortraitFrame {entry}>
  {#snippet picture(entry)}
    <MonsterPicture {entry} module={section.module + 1} part={section.part} />
  {/snippet}
</PortraitFrame>
