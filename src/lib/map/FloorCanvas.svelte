<script lang="ts">
  import { untrack } from 'svelte';
  import { drawFloor, drawMarks, drawOutline, drawRoute, drawYou, squareRect, type DiscoveredMap } from './draw-floor';
  import { isExplored, type ExploredSquares } from './explored';
  import { drawMonsters, type MonsterSprites } from './draw-monsters';
  import type { MapGame, MapSquare } from './game';
  import type { Mark } from './marks';
  import type { Route } from './path';
  import { palette } from './palette';
  import type { StockedMonster } from './stocking';
  import { drawTeleporters, teleporterHue, teleporterSegments } from './teleporters';
  import { centerOn, ensureVisible, fitFloor, pan, squareAt, wheelZoomFactor, zoomBy, zoomStep, type Bounds, type Point, type Viewport } from './viewport';
  import { onScreen } from '../ui/on-screen.svelte';
  import { renderWallTexture, wallTexture, wallTilePattern } from './wall-texture';
  import { youAlpha, youFlash } from './you';

  /** The marker's square, and the facing it is drawn pointing along where it has one. */
  export type YouHere = Point & { dir?: number };

  export interface Tooltip {
    title: string;
    feature: string | null;
    /** The monster standing on the square, if the floor has been stocked. */
    monster?: string | null;
    notes: string[];
  }

  interface Props {
    game: MapGame;
    rows: MapSquare[][];
    floor: number;
    dungeon: number;
    /** Monsters stocked on this floor, drawn over the squares they stand on. */
    monsters?: StockedMonster[];
    /** Area "Fit" frames: the open squares of the floor. */
    bounds: Bounds;
    /** Squares of this floor a loaded explored map has seen. */
    explored?: ExploredSquares | null;
    /** The map the character being played has discovered, when the floor is drawn as the game's
     *  own map draws it: an unknown square draws nothing, and neither does a module teleporter,
     *  which the game's map has as a plain wall. */
    discovered?: DiscoveredMap | null;
    /** The square the info panel describes: follows the pointer, moved by the keyboard. */
    cursor?: Point | null;
    /** Landing square after a jump. */
    highlight?: Point | null;
    /** Where the party stands, when it stands on this floor, and which way they face when
     *  whoever is standing there has a facing: a game being played does, the map explorer's
     *  walker does not. */
    you?: YouHere | null;
    /** The square the map opens on, and how big to draw a square while it does. The map explorer
     *  opens on the whole floor; a game being played opens close in on the character. */
    focus?: (Point & { cell: number }) | null;
    /** Squares emphasised while a legend entry is hovered. */
    marks?: Mark[];
    /** Square picked by clicking, and a route drawn from it. */
    selected?: Point | null;
    route?: Route | null;
    /** Details shown in a box beside the cursor square. */
    tooltip?: Tooltip | null;
    /** Whether the rock behind the floor is laid with the wall texture the 3-D view would draw
     *  this floor with. */
    wallBackground?: boolean;
    /** How many pixels of the foot of the canvas the caller draws something else over, such as
     *  the bar the play display's orbs stand in. Squares under it are treated as off the canvas,
     *  so centring and revealing keep clear of them. */
    coveredBottom?: number;
    onselect?: (square: Point) => void;
  }

  let { game, rows, floor, dungeon, monsters = [], bounds, explored = null, discovered = null, cursor = $bindable(null), highlight = null, you = null, focus = null, marks = [], selected = null, route = null, tooltip = null, wallBackground = true, coveredBottom = 0, onselect }: Props = $props();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let size = $state({ width: 0, height: 0 });
  let view = $state<Viewport>({ cell: 10, originX: 0, originY: 0 });
  let fitted = false;
  let dragging = $state(false);

  const DRAG_THRESHOLD_PX = 3;
  const TOOLTIP_WIDTH = 230;
  const TOOLTIP_GAP = 8;
  let drag: { startX: number; startY: number; origin: Viewport; moved: boolean } | null = null;

  const tooltipPosition = $derived.by(() => {
    if (!tooltip || !cursor || dragging) return null;
    const { x0, y0, w } = squareRect(view, cursor.x, cursor.y);
    const fitsRight = x0 + w + TOOLTIP_GAP + TOOLTIP_WIDTH <= size.width;
    return {
      left: fitsRight ? x0 + w + TOOLTIP_GAP : Math.max(0, x0 - TOOLTIP_GAP - TOOLTIP_WIDTH),
      top: Math.max(0, Math.min(size.height - 80, y0)),
    };
  });

  $effect(() => {
    const observer = new ResizeObserver(([entry]) => {
      size = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (!fitted && size.width > 0) {
        view = focus
          ? centerOn({ cell: focus.cell, originX: 0, originY: 0 }, focus, size.width, size.height, coveredBottom)
          : fitFloor(size.width, size.height, bounds);
        fitted = true;
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  });

  $effect(() => {
    const listener = (event: WheelEvent) => {
      event.preventDefault();
      const point = canvasPoint(event);
      view = zoomBy(view, wheelZoomFactor(event.deltaY, event.deltaMode), point.x, point.y);
    };
    canvas.addEventListener('wheel', listener, { passive: false });
    return () => canvas.removeEventListener('wheel', listener);
  });

  $effect(() => {
    if (!highlight || !size.width) return;
    const target = highlight;
    const { width, height } = size;
    view = ensureVisible(untrack(() => view), target, width, height, coveredBottom);
  });

  const teleporters = $derived(discovered ? [] : teleporterSegments(rows, game.area));

  // Monster pictures are drawn once each into an offscreen canvas and kept, since the same few
  // monsters stand all over a floor. Each game says what its drawing depends on beyond the
  // monster itself, and that goes in the key.
  const pictures = new Map<string, HTMLCanvasElement>();

  const sprites: MonsterSprites = {
    isBoss: (id) => game.stocking?.kind(id).boss ?? false,
    picture: (id) => {
      const entry = game.stocking?.kind(id);
      if (!entry) return null;
      const key = `${game.id}:${id}:${entry.pictureKey(dungeon, floor)}`;
      const cached = pictures.get(key);
      if (cached) return cached;
      const image = entry.picture(dungeon, floor);
      if (!image) return null;
      const sprite = document.createElement('canvas');
      sprite.width = image.width;
      sprite.height = image.height;
      sprite.getContext('2d')!.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
      pictures.set(key, sprite);
      return sprite;
    },
  };

  // How much of the wall texture is left showing behind the floor: enough to read the stone,
  // not enough to compete with the map drawn over it.
  const WALL_TEXTURE_DIM = 0.7;

  // One tile of each floor's wall texture, drawn once and kept: a floor lays the same tile over
  // and over, and coming back to a floor finds it already drawn.
  const tiles = new Map<string, HTMLCanvasElement>();

  /** One tile of the wall texture this floor's rock is laid with, or null when the floor has
   *  no wall texture or the site does not bundle its picture. */
  function wallTile(floor: number, dungeon: number): HTMLCanvasElement | null {
    if (!wallBackground) return null;
    const texture = wallTexture(game.id, dungeon, floor);
    if (!texture) return null;
    const cached = tiles.get(texture.key);
    if (cached) return cached;
    const image = renderWallTexture(texture);
    if (!image) return null;
    const tile = document.createElement('canvas');
    tile.width = image.width;
    tile.height = image.height;
    const ctx = tile.getContext('2d')!;
    ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    // The game's own background colour shows through the holes in a texture, and the dimming
    // then goes over both.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, tile.width, tile.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0, 0, 0, ${WALL_TEXTURE_DIM})`;
    ctx.fillRect(0, 0, tile.width, tile.height);
    tiles.set(texture.key, tile);
    return tile;
  }

  // The floor itself is drawn once into a static layer whenever rows, view or size change;
  // every frame then blits it and draws the overlays (teleporters, marks, route, cursor) on
  // top. Dependencies are read here, synchronously, so the effect re-runs when they change.
  const staticLayer = document.createElement('canvas');
  let staticStale = true;
  let scene: Scene | null = null;
  let pendingFrame = 0;

  function overlays() {
    return { cursor, highlight, you, marks, monsters, selected, route, teleporters };
  }

  $effect(() => {
    const next: Scene = { game, rows, floor, dungeon, view, width: size.width, height: size.height, explored, discovered };
    staticStale = true;
    scene = { ...untrack(overlays), ...next };
    scheduleRender();
  });

  $effect(() => {
    const current = overlays();
    if (!scene) return;
    scene = { ...scene, ...current };
    scheduleRender();
  });

  const visible = onScreen(() => canvas);

  // Teleporter sides cycle through the rainbow and the "you are here" mark pulses, so the
  // canvas redraws every frame while either is on the floor and the canvas is where it can be
  // seen: every tab stays mounted, and a hidden one has no business drawing.
  $effect(() => {
    if (!teleporters.length && !you) return;
    if (!visible.showing) return;
    let frame = requestAnimationFrame(function tick() {
      render();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  interface Scene {
    game: MapGame;
    rows: MapSquare[][];
    floor: number;
    dungeon: number;
    view: Viewport;
    width: number;
    height: number;
    explored?: ExploredSquares | null;
    discovered?: DiscoveredMap | null;
    cursor?: Point | null;
    highlight?: Point | null;
    you?: YouHere | null;
    marks?: Mark[];
    monsters?: StockedMonster[];
    selected?: Point | null;
    route?: Route | null;
    teleporters?: ReturnType<typeof teleporterSegments>;
  }

  function scheduleRender() {
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      render();
    });
  }

  function render() {
    // The effect can run once more after the tab hides and bind:this has gone back to null.
    if (!canvas || !scene || !scene.width || !scene.height) return;
    const { game, rows, floor, dungeon, view, width, height, explored, discovered, cursor, highlight, you, marks, monsters, selected, route, teleporters } = scene;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    if (staticStale || staticLayer.width !== pixelWidth || staticLayer.height !== pixelHeight) {
      staticLayer.width = pixelWidth;
      staticLayer.height = pixelHeight;
      const staticCtx = staticLayer.getContext('2d')!;
      staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tile = wallTile(floor, dungeon);
      const background = tile ? wallTilePattern(staticCtx, tile) : undefined;
      drawFloor(staticCtx, rows, { ...view, width, height, floor, teleporterHue: null, game, background, discovered, explored: explored ? (x, y) => isExplored(explored, x, y) : undefined });
      staticStale = false;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTeleporters(ctx, teleporters ?? [], view, teleporterHue(performance.now()));
    if (monsters?.length) drawMonsters(ctx, monsters, view, sprites);
    drawMarks(ctx, marks ?? [], view);
    if (route) drawRoute(ctx, route, view);
    // Dungeons of the Unforgiven is the one of the three whose own map marks the character with
    // an arrow, so it is the one drawn with that arrow, and with the white and black the game
    // turns that arrow over between. The other two, and the map explorer walking someone about a
    // floor without a facing, get the site's own white faded in and out.
    const gameArrow = game.id === 'unforgiven' && you?.dir !== undefined;
    const marker = gameArrow ? youFlash(performance.now()) : `rgba(255, 255, 255, ${youAlpha(performance.now())})`;
    if (you) drawYou(ctx, you.x, you.y, view, marker, you.dir ?? null, gameArrow);
    if (selected) drawOutline(ctx, selected.x, selected.y, view, 2, palette.selection);
    if (highlight) drawOutline(ctx, highlight.x, highlight.y, view, 2, '#ffffff');
    if (cursor) drawOutline(ctx, cursor.x, cursor.y, view, 1, 'rgba(255, 255, 255, 0.75)');
  }

  function canvasPoint(event: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onpointerdown(event: PointerEvent) {
    canvas.setPointerCapture(event.pointerId);
    drag = { startX: event.clientX, startY: event.clientY, origin: view, moved: false };
  }

  function onpointermove(event: PointerEvent) {
    if (drag && event.buttons) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) drag.moved = true;
      if (drag.moved) {
        dragging = true;
        view = pan(drag.origin, dx, dy);
      }
      return;
    }
    const point = canvasPoint(event);
    const square = squareAt(view, point.x, point.y);
    if (square?.x !== cursor?.x || square?.y !== cursor?.y) cursor = square;
  }

  function onpointerup(event: PointerEvent) {
    if (drag && !drag.moved) {
      const point = canvasPoint(event);
      const square = squareAt(view, point.x, point.y);
      if (square) onselect?.(square);
    }
    drag = null;
    dragging = false;
  }

  export function zoomIn() {
    view = zoomStep(view, 1, size.width / 2, size.height / 2);
  }

  export function zoomOut() {
    view = zoomStep(view, -1, size.width / 2, size.height / 2);
  }

  export function fit() {
    view = fitFloor(size.width, size.height, bounds);
  }

  export function reveal(square: Point) {
    view = ensureVisible(view, square, size.width, size.height, coveredBottom);
  }

  /**
   * Put a square in the middle of the canvas, at a cell size of its own when one is given.
   * Returns whether there was a canvas to do it on: a tab that is not showing has no width yet.
   */
  export function centre(square: Point, cell?: number): boolean {
    if (!size.width) return false;
    fitted = true;
    view = centerOn(cell === undefined ? view : { ...view, cell }, square, size.width, size.height, coveredBottom);
    return true;
  }
</script>

<div class="container" bind:this={container}>
  <canvas bind:this={canvas} {onpointerdown} {onpointermove} {onpointerup} style:width="{size.width}px" style:height="{size.height}px"></canvas>
  {#if tooltip && tooltipPosition}
    <div class="tooltip" style:left="{tooltipPosition.left}px" style:top="{tooltipPosition.top}px" style:width="{TOOLTIP_WIDTH}px">
      <div class="title">{tooltip.title}</div>
      {#if tooltip.feature}
        <div class="feature">{tooltip.feature}</div>
      {/if}
      {#if tooltip.monster}
        <div class="monster">{tooltip.monster}</div>
      {/if}
      {#each tooltip.notes as note}
        <div class="note">{note}</div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #710000;
  }
  canvas {
    display: block;
    touch-action: none;
    cursor: crosshair;
  }
  .tooltip {
    position: absolute;
    pointer-events: none;
    background: rgba(12, 12, 24, 0.92);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 9px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--ink);
  }
  .title {
    color: var(--accent);
    font-weight: 600;
  }
  .feature {
    color: var(--accent);
  }
  .monster {
    color: var(--ink);
  }
  .note {
    color: var(--ink);
  }
</style>
