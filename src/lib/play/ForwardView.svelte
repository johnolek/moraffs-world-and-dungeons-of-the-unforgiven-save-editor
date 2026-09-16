<!--
  The game's forward-facing 3-D view, drawn small over the top-down map in the frame the picture
  of the monster being fought stands in (`MapHud.svelte`).

  It is the game's own drawing rather than anything of the site's: the same scene `Screen.svelte`
  draws the four views from (`view-scene.ts`), through the same `renderView`, so the corridor, the
  monster standing in it and the skull over a kill are what the game's own screen would show. It
  reads the game and never writes to it, and the coin flips it needs come out of a generator of
  its own, so the game, the run log and a replay are the same with it and without it.
-->
<script lang="ts">
  import { sectionPalette } from '../bestiary/pictures';
  import type { Game } from '../game/port/state';
  import type { MapSquare } from '../map/game';
  import type { StockedMonster } from '../map/stocking';
  import type { KilledOnScreen } from './engine';
  import { dotuViewScene, killedMonster, sectionDrawn, viewMonsters } from './view-scene';
  import { viewPictures } from './view3d/browser';
  import { framePainter } from './view3d/canvas';
  import { clearFrame, newFrame } from './view3d/frame';
  import { WHOLE_SCREEN_VIEW } from './view3d/geometry';
  import { drawKilledSkull, renderView } from './view3d/render';

  interface Props {
    /** The game, for the character's height, which is where the horizon sits, and for the
     *  colour set its palettes are built from. */
    game: Game;
    rows: MapSquare[][];
    /** Where the character stands, which picks the section's pictures and its colours. */
    place: { x: number; y: number; floor: number; module: number; dir: number };
    /** Where the views were last drawn from, which is where this one is drawn from too, so that
     *  it stands where the game's own views stand while keys typed ahead run on. */
    viewsFrom: { x: number; y: number; floor: number; module: number; dir: number };
    /** The monsters stocked on the floor; the view draws the ones it can see. */
    monsters: StockedMonster[];
    /** The monster the skull is standing over, or null when nothing has just been killed. */
    killed: KilledOnScreen | null;
    /** Which drawing of the views this is, which seeds the flip that mirrors the monster ahead. */
    viewsDrawn: number;
  }

  let { game, rows, place, viewsFrom, monsters, killed, viewsDrawn }: Props = $props();

  /**
   * How many pixels the view is drawn in. The game gives a view drawn on its own the whole of
   * its 1600 by 1200 grid, so the frame is 4:3, and the Monsters tab's corridor picture
   * (`bestiary/corridor.ts`) is drawn at this size for the same reason: it is more than the
   * frame on the map is ever shown at, so the picture is sharp on a display of any density.
   */
  const VIEW_PIXELS = { width: 512, height: 384 };

  let canvas = $state.raw<HTMLCanvasElement | null>(null);
  /** One painter and one frame for the life of the component, since the view is drawn again on
   *  every step and a frame per step is rubbish for the browser to collect. */
  const painter = framePainter(VIEW_PIXELS.width, VIEW_PIXELS.height);
  const frame = newFrame(VIEW_PIXELS.width, VIEW_PIXELS.height);

  /** The look this floor is drawn in, which the game's own rules give (`view-scene.ts`). */
  const section = $derived(sectionDrawn(game.rules, place.module, place.floor));
  const pictures = $derived(viewPictures(game.rules.pictureFiles(section.section ?? 1)));
  const palette = $derived(sectionPalette(section.module + 1, section.part, game.colourSetting));
  const drawn = $derived(viewMonsters(monsters));
  const skull = $derived(killedMonster(killed));

  $effect(() => {
    const target = canvas;
    if (!target) return;
    const context = target.getContext('2d');
    if (!context) return;
    const scene = dotuViewScene({
      rows,
      from: viewsFrom,
      section: section.section,
      pictures,
      monsters: drawn,
      killed: skull,
      viewsDrawn,
      height: game.pc.height,
      screen: VIEW_PIXELS,
    });
    clearFrame(frame);
    renderView(frame, scene, WHOLE_SCREEN_VIEW, viewsFrom.dir);
    // `movecontrol` paints the skull after the views; here there is only the one view, so it is
    // painted only when the monster died in the direction this one looks.
    if (skull && skull.dir === viewsFrom.dir) drawKilledSkull(frame, scene, WHOLE_SCREEN_VIEW);
    painter.paint(context, frame, palette);
  });
</script>

<canvas bind:this={canvas} width={VIEW_PIXELS.width} height={VIEW_PIXELS.height}></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    height: auto;
    background: #000;
  }
</style>
