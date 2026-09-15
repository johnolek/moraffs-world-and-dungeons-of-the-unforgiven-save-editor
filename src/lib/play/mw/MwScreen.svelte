<script lang="ts">
  import type { DiscoveredMap } from '../../map/draw-floor';
  import type { MapSquare } from '../../map/game';
  import type { StockedMonster } from '../../map/stocking';
  import { MONSTERS } from '../../mw-bestiary/monsters';
  import { floorPalette } from '../../mw-bestiary/pictures';
  import type { ScreenLine } from '../../game/port/state';
  import type { MwMonsterViewCorner } from '../../game/mw-port/screens';
  import { framePainter } from '../view3d/canvas';
  import { fillRect, newFrame, type Frame } from '../view3d/frame';
  import { mwViewPictures } from './view3d/browser';
  import { mwHorizonWeight } from './view3d/geometry';
  import { renderMwView, type MwViewMonster, type MwViewScene } from './view3d/render';
  import { drawMwScreenText } from './view3d/text';
  import { drawMwMonsterBars } from './view3d/monster-bar';
  import { drawnSmaller } from '../../ui/drawn-smaller.svelte';
  import { onScreen } from '../../ui/on-screen.svelte';
  import { zoomMapMonsterAt } from '../zoom-monsters';
  import { MORAFFS_WORLD_ZOOM_MAP, drawMwExpandedMap, drawMwZoomMap, mwExpandedMapWindow } from './map';
  import { mwMonsterThumbnail } from './monster-thumbnails';
  import {
    MW_KEY_MENU_RECT,
    MW_MESSAGE_BOX_RECT,
    MW_SCREEN_MODE,
    MW_SCREEN_PIXELS,
    MW_SCREEN_UNITS_X,
    MW_SCREEN_UNITS_Y,
    MW_EXPANDED_CENTRE,
    MW_VIEWS,
    MW_WHOLE_SCREEN_VIEW,
  } from './view3d/screen';

  interface Props {
    rows: MapSquare[][];
    /** Where the character stands. The game has no facing: all four views are compass ones. */
    place: { x: number; y: number; floor: number; dungeon: number };
    /** The monsters the views may draw. */
    monsters: StockedMonster[];
    /** The character's height in inches, which is where the horizon sits. */
    height: number;
    /** `ladder_delta` for a square: above zero a way down, below it a way up. */
    ladderAt: (x: number, y: number) => number;
    /** `surface_feature`: what a square of floor 0 holds, which is what its ceiling is marked
     *  with there instead of a ladder. */
    surfaceFeatureAt: (x: number, y: number) => number;
    /** The map the zoom map draws: the squares the character has discovered, or every square in
     *  the two modes that reveal the floor. */
    discovered: DiscoveredMap;
    /** The monsters marked on the map in the corner, which is every one on the floor in debug
     *  mode and none at all in the modes that show only what the game showed. */
    mapMonsters?: StockedMonster[];
    /** The text the game draws over the screen, in its own 1600 by 1200 units. */
    lines: ScreenLine[];
    /**
     * The game has taken the whole display over, which it does on a screen it has cleared:
     * clear_screen (WORLD.EXE) blanks the display before those pages are drawn.
     */
    cleared?: boolean;
    /** One view over the whole screen, the way the Z key zooms one; null draws all four. */
    zoomed?: number | null;
    /** The X key's map is filling the screen, which is drawn in place of the views. */
    expandedMap?: boolean;
    /** The corner of every view with a monster standing beside the character, which is where a
     *  hit-point bar goes. */
    barCorners?: MwMonsterViewCorner[];
    /** Told which monster a click on the map in the corner landed on, for the tab to open its
     *  details. Only debug mode marks them, so in the other two modes nothing is ever found. */
    onmonster?: (monster: StockedMonster) => void;
    /** How long a new screen takes to appear, in milliseconds, revealed from the top down the
     *  way a slow machine drew one (`../mode.ts`). Nothing at all draws it in one go. */
    redraw?: number;
  }

  let {
    rows,
    place,
    monsters,
    height,
    ladderAt,
    surfaceFeatureAt,
    discovered,
    lines,
    mapMonsters = [],
    cleared = false,
    zoomed = null,
    expandedMap = false,
    barCorners = [],
    onmonster,
    redraw = 0,
  }: Props = $props();

  const WIDTH = MW_SCREEN_PIXELS.width;
  const HEIGHT = MW_SCREEN_PIXELS.height;

  let canvas = $state.raw<HTMLCanvasElement | null>(null);
  /** Whether the tab the screen is on is the one showing, since every tab of the site stays
   *  mounted and a wipe behind one would be drawing for nobody. */
  const visible = onScreen(() => canvas);
  /** Whether the screen is being shown below its own 1024 by 768, which is when its pixels have
   *  to be smoothed rather than kept crisp. */
  const shrunk = drawnSmaller(() => canvas);
  /** The screen's own painter, so every repaint writes over the same RGBA buffer. */
  const painter = framePainter(WIDTH, HEIGHT);
  /** How long this screen takes to appear: the player's choice while the tab is showing. */
  const revealed = $derived(visible.showing ? redraw : 0);

  /** A screen going off the page part-drawn is shown whole at once, rather than leaving the
   *  player a half-drawn screen to come back to. */
  $effect(() => {
    if (!visible.showing) painter.finish();
  });

  const drawn = $derived.by((): MwViewMonster[] =>
    monsters.flatMap((monster) => {
      const entry = MONSTERS[Number(monster.monsterId)];
      if (!entry) return [];
      return [{ x: monster.x, y: monster.y, picture: entry.picture, colour: entry.colour }];
    }),
  );

  /**
   * Everything the frame is drawn from that is plain data, as one string.
   *
   * The tab is handed a fresh view for every key the game takes, including the ones that change
   * nothing on the screen, and rebuilding the whole 1024 by 768 frame for one of those costs as
   * much as rebuilding it for a step. The floor and the discovered map are not in here because
   * both keep their identity while they are unchanged, so they are compared as they are; the two
   * square readers are not either, since what they answer is settled by the floor and the dungeon.
   */
  const drawnFrom = $derived(
    JSON.stringify({ place, lines, drawn, mapMonsters, height, cleared, zoomed, expandedMap, barCorners }),
  );

  /** What the canvas is showing, so the effect below can tell that nothing has changed. */
  let onCanvas: { drawnFrom: string; rows: MapSquare[][]; discovered: DiscoveredMap } | null = null;

  $effect(() => {
    const target = canvas;
    if (!target) return;
    const context = target.getContext('2d');
    if (!context) return;
    if (onCanvas?.drawnFrom === drawnFrom && onCanvas.rows === rows && onCanvas.discovered === discovered) return;
    onCanvas = { drawnFrom, rows, discovered };

    const frame = newFrame(WIDTH, HEIGHT);
    const scene: MwViewScene = {
      rows,
      at: { x: place.x, y: place.y },
      floor: place.floor,
      dungeon: place.dungeon,
      pictures: mwViewPictures(),
      bricks: 0,
      videoMode: MW_SCREEN_MODE.mode,
      screen: { width: WIDTH, height: HEIGHT },
      horizonWeight: mwHorizonWeight(height),
      monsters: drawn,
      ladderAt,
      surfaceFeatureAt,
    };

    // The X key's map is a fill over the whole screen with the floor drawn on it (exe 2000:aad5),
    // so the views and the boxes around them are not drawn at all while it is up.
    if (expandedMap) {
      drawMwExpandedMap(frame, { rows, at: place, map: discovered, monsters: mapMonsters, thumbnail: mwMonsterThumbnail });
      drawMwScreenText(frame, MW_SCREEN_PIXELS, lines);
      painter.reveal(context, frame, floorPalette(place.floor), revealed);
      return;
    }

    if (zoomed === null) {
      for (const [view, rect] of MW_VIEWS.entries()) renderMwView(frame, scene, rect, view);
      drawBoxes(frame);
      drawMwZoomMap(frame, { rows, at: place, map: discovered, monsters: mapMonsters, thumbnail: mwMonsterThumbnail });
    } else {
      renderMwView(frame, scene, MW_WHOLE_SCREEN_VIEW, zoomed);
    }
    drawMwMonsterBars(frame, barCorners, place.floor);
    // A page that takes the display over (the help, the statistics) is drawn on a cleared
    // screen, so the frame goes black before its lines are painted.
    if (cleared) fillRect(frame, 0, 0, WIDTH, HEIGHT, 0);
    drawMwScreenText(frame, MW_SCREEN_PIXELS, lines);
    painter.reveal(context, frame, floorPalette(place.floor), revealed);
  });

  /**
   * Which monster a click landed on, if any.
   *
   * The canvas is the game's own 1024 by 768 screen scaled to whatever room the column has, so a
   * click is scaled back to those pixels and read off the map — the one beside the views, or the
   * whole floor while the X key's map is up. A page the game has taken the display over covers
   * the map, so nothing on it can be clicked while one is up.
   */
  function onpointerup(event: PointerEvent): void {
    if (!onmonster || cleared || mapMonsters.length === 0) return;
    const box = (event.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const at = { x: ((event.clientX - box.left) / box.width) * WIDTH, y: ((event.clientY - box.top) / box.height) * HEIGHT };
    const window = expandedMap
      ? mwExpandedMapWindow()
      : MORAFFS_WORLD_ZOOM_MAP.window({ width: WIDTH, height: HEIGHT });
    const found = zoomMapMonsterAt(window, expandedMap ? MW_EXPANDED_CENTRE : place, mapMonsters, at);
    if (found) onmonster(found);
  }

  /** The message box and the key menu, which movecontrol blanks before it draws in them. */
  function drawBoxes(frame: Frame): void {
    const toX = (x: number) => Math.trunc(((WIDTH - 1) * x) / 0x63f);
    const toY = (y: number) => Math.trunc(((HEIGHT - 1) * y) / 0x4af);
    for (const box of [MW_MESSAGE_BOX_RECT, MW_KEY_MENU_RECT]) {
      fillRect(frame, toX(box.left), toY(box.top), toX(box.right), toY(box.bottom), 0);
    }
  }
</script>

<!-- The game's screen: the views, the boxes around them and the game's own lines of text. -->
<div class="screen" class:smooth={shrunk.smaller} style:aspect-ratio="{MW_SCREEN_UNITS_X} / {MW_SCREEN_UNITS_Y}">
  <canvas bind:this={canvas} width={WIDTH} height={HEIGHT} {onpointerup}></canvas>
</div>

<style>
  .screen {
    width: 100%;
    background: #000;
  }
  .screen canvas {
    display: block;
    width: 100%;
    height: 100%;
    /* The game's pixels stay pixels however far it is scaled up. */
    image-rendering: pixelated;
  }
  /* Shown smaller than it is, the screen is shrunk by dropping whole rows of pixels, and a
     one-pixel line of the map in the corner can be the row that is dropped. */
  .screen.smooth canvas {
    image-rendering: auto;
  }
</style>
