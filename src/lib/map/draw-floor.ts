import type { MapGame, MapSquare } from './game';
import type { Mark } from './marks';
import type { Hop, Route } from './path';
import { gameSideStroke, palette, sideStroke, squareFill, squareGlyph, type SideStroke } from './palette';
import { teleporterColour, teleporterLineWidth } from './teleporters';
import type { Point, Viewport } from './viewport';
import { facingArrowCells, FACING_ARROW_SIZE, youArrow } from './you';

export interface DrawOptions extends Viewport {
  /** The game whose area is drawn and whose buildings colour floor 0. */
  game: MapGame;
  /** Canvas size in CSS pixels, used to skip squares outside the view. */
  width: number;
  height: number;
  /** Floor of the drawn rows, needed to label ladder destinations. */
  floor: number;
  /** Hue for teleporter sides, or null to leave them to an animated overlay. */
  teleporterHue: number | null;
  /** What to fill behind the floor, where the rock is, instead of the game's own background
   *  colour: the map lays the floor's wall texture there. */
  background?: string | CanvasPattern;
  /** Whether a loaded explored map has seen a square, when one is loaded. */
  explored?: (x: number, y: number) => boolean;
  /** The map a character being played has discovered, when the floor is drawn as the game's own
   *  map draws it rather than whole. */
  discovered?: DiscoveredMap | null;
}

/**
 * What the game's own map knows about a square, which is what FUN_3000_8e75 (exe 3000:8e75) asks
 * before it draws one.
 */
export interface DiscoveredMap {
  /** Whether the character's map remembers the square. An unknown square draws nothing at all,
   *  its walls included. */
  known(x: number, y: number): boolean;
  /** Whether it remembered the square when they arrived on this floor, which is the only thing
   *  the chute glyph is drawn from. */
  knownOnArrival(x: number, y: number): boolean;
}

/** Cell size from which destination floor numbers are drawn inside the glyph squares. */
export const LABEL_MIN_CELL = 20;

/** Draws a whole floor the way the game's expanded map does: open squares filled black
 *  with white sides, doors barred, ladders and trap doors as yellow diagonals, chutes as
 *  a blue star, town buildings as coloured squares. Rock is left as background.
 *  Square edges are snapped to whole pixels so lines stay crisp at any zoom. */
export function drawFloor(ctx: CanvasRenderingContext2D, rows: MapSquare[][], options: DrawOptions): void {
  const { cell, originX, originY, width, height, game } = options;
  ctx.fillStyle = options.background ?? palette.background;
  ctx.fillRect(0, 0, width, height);

  const firstX = Math.max(0, Math.floor(-originX / cell));
  const lastX = Math.min(game.area.columns - 1, Math.ceil((width - originX) / cell));
  const firstY = Math.max(0, Math.floor(-originY / cell));
  const lastY = Math.min(game.area.rows - 1, Math.ceil((height - originY) / cell));

  ctx.lineWidth = 1;
  for (let y = firstY; y <= lastY; y++) {
    const y0 = Math.round(originY + y * cell);
    const h = Math.round(originY + (y + 1) * cell) - y0;
    for (let x = firstX; x <= lastX; x++) {
      const square = rows[y][x];
      const discovered = options.discovered;
      if (discovered && !discovered.known(x, y)) continue;
      const seen = options.explored?.(x, y) ?? false;
      if (square.solid && !seen) continue;
      const x0 = Math.round(originX + x * cell);
      const w = Math.round(originX + (x + 1) * cell) - x0;
      if (square.solid) {
        drawExploredRock(ctx, x0, y0, w, h);
        continue;
      }
      drawSquare(ctx, square, x0, y0, w, h, options.floor, options.teleporterHue, game, discovered ? { chuteKnown: discovered.knownOnArrival(x, y) } : null);
      if (seen) drawExplored(ctx, x0, y0, w, h);
    }
  }
}

/** What the game's own map draws differently on a square it knows. */
export interface AsTheGameDrawsIt {
  /** Whether the square was known when the character arrived on the floor, which is what
   *  drawsquare's chute branch (unf.c:21910) asks before it marks a chute. */
  chuteKnown: boolean;
}

/** One square whose top-left corner pixel is (x0, y0) and whose sides are `w` and `h` apart. */
export function drawSquare(
  ctx: CanvasRenderingContext2D,
  square: MapSquare,
  x0: number,
  y0: number,
  w: number,
  h: number,
  floor: number,
  teleporterHue: number | null,
  game: MapGame,
  asTheGame: AsTheGameDrawsIt | null = null,
): void {
  ctx.fillStyle = squareFill(square, game)!;
  ctx.fillRect(x0 + 1, y0 + 1, w, h);
  const stroke = asTheGame ? gameSideStroke : sideStroke;
  drawSide(ctx, stroke(square.w), x0, y0, h, true, teleporterHue);
  drawSide(ctx, stroke(square.n), x0, y0, w, false, teleporterHue);
  drawSide(ctx, stroke(square.e), x0 + w, y0, h, true, teleporterHue);
  drawSide(ctx, stroke(square.s), x0, y0 + h, w, false, teleporterHue);
  drawGlyph(ctx, square, x0, y0, w, h, floor, asTheGame);
}

/** The wash over a square a loaded explored map has seen. It goes on after the square is
 *  drawn, so the sides and the glyph show through it. */
export function drawExplored(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number): void {
  ctx.fillStyle = palette.explored;
  ctx.fillRect(x0 + 1, y0 + 1, w, h);
}

/** A square a loaded explored map has seen that this dungeon makes rock. The game never walks
 *  a character onto rock, so the square is drawn as a warning rather than left out. */
export function drawExploredRock(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number): void {
  ctx.fillStyle = palette.exploredRock;
  ctx.fillRect(x0 + 1, y0 + 1, w, h);
}

/** One side, as draw_side does it: a line that stops one pixel short of both corners,
 *  and for doors a bar across the middle. `vertical` sides sit on the square's west edge,
 *  horizontal ones on its north edge; `length` is the square's size along the side. */
function drawSide(ctx: CanvasRenderingContext2D, stroke: SideStroke | null, x0: number, y0: number, length: number, vertical: boolean, teleporterHue: number | null): void {
  if (!stroke) return;
  if (stroke === 'teleporter') {
    if (teleporterHue === null) return;
    ctx.strokeStyle = teleporterColour(teleporterHue);
    ctx.lineWidth = teleporterLineWidth(length);
    if (vertical) line(ctx, x0, y0, x0, y0 + length + 1);
    else line(ctx, x0, y0, x0 + length + 1, y0);
    ctx.lineWidth = 1;
    return;
  }
  ctx.strokeStyle = palette.line;
  ctx.setLineDash(stroke === 'secretDoor' ? [2, 2] : []);
  if (vertical) line(ctx, x0, y0 + 1, x0, y0 + length);
  else line(ctx, x0 + 1, y0, x0 + length, y0);
  ctx.setLineDash([]);
  if (stroke === 'door') drawDoorBar(ctx, x0, y0, length, vertical);
}

/** The ticks draw_side puts across a door: a short one three pixels long, and on a side 8 pixels
 *  or more long two longer ones a pixel either side of it. The two halves of the routine differ
 *  over the short tick. On a side running along the top of the square it is the small-side case
 *  of an if/else (exe 3000:848c), so a long side gets the pair alone. On a side running down the
 *  left the pair's branch falls through into it (exe 3000:8678), so it is drawn at every size,
 *  after the pair. drawZoomSide in play/display.ts draws the game's own map, at the game's own
 *  lengths; here the long pair is drawn a quarter shorter than draw_side draws it, because the
 *  site's own map gives a square more room and the game's length overran it. */
function drawDoorBar(ctx: CanvasRenderingContext2D, x0: number, y0: number, length: number, vertical: boolean): void {
  const mid = length >> 1;
  const reach = Math.trunc(length / 4);
  const long = length >= 8;
  ctx.strokeStyle = palette.line;
  if (vertical) {
    if (long) {
      line(ctx, x0 - reach, y0 + mid + 1, x0 + reach + 1, y0 + mid + 1);
      line(ctx, x0 - reach, y0 + mid - 1, x0 + reach + 1, y0 + mid - 1);
    }
    line(ctx, x0 - 1, y0 + mid, x0 + 2, y0 + mid);
  } else if (long) {
    line(ctx, x0 + mid - 1, y0 - reach, x0 + mid - 1, y0 + reach + 1);
    line(ctx, x0 + mid + 1, y0 - reach, x0 + mid + 1, y0 + reach + 1);
  } else {
    line(ctx, x0 + mid, y0 - 1, x0 + mid, y0 + 2);
  }
}

function drawGlyph(ctx: CanvasRenderingContext2D, square: MapSquare, x0: number, y0: number, w: number, h: number, floor: number, asTheGame: AsTheGameDrawsIt | null = null): void {
  const glyph = squareGlyph(square);
  if (!glyph) return;
  if (asTheGame && !asTheGame.chuteKnown && (glyph === 'chute' || glyph === 'falseFloor')) return;
  const x1 = x0 + w + 1;
  const y1 = y0 + h + 1;
  const size = Math.min(w, h);
  const falling = glyph === 'chute' || glyph === 'falseFloor';
  ctx.lineWidth = size >= 16 ? 2 : 1;
  ctx.strokeStyle = falling ? palette.chute : palette.ladder;
  // A false floor is a chute you cannot see until you have fallen onto it, so it is the chute's
  // own mark drawn in a broken line.
  if (glyph === 'falseFloor') ctx.setLineDash([2, 2]);
  if (falling) {
    line(ctx, x0 + (w >> 1) + 1, y0 + 1, x0 + (w >> 1) + 1, y1);
    line(ctx, x0 + 1, y0 + (h >> 1) + 1, x1, y0 + (h >> 1) + 1);
  }
  if (glyph !== 'up') diagonal(ctx, x0 + 1, y0 + 1, x1, y1);
  if (glyph !== 'down') diagonal(ctx, x0 + 1, y1, x1, y0 + 1);
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
  // The game's own map never writes the floor a glyph leads to; only the site's fully revealed
  // map does.
  if (!asTheGame && size >= LABEL_MIN_CELL) drawLabel(ctx, String(glyphDestination(square, floor)), x0 + 1 + w / 2, y0 + 1 + h / 2, size);
}

/** Floor a ladder, chute, trap door or false floor square leads to. A false floor drops exactly
 *  one floor however far the chute that landed you there fell: Moraff's Revenge leaves the
 *  square with a ladder-down code of 1 (1000:064D). */
export function glyphDestination(square: MapSquare, floor: number): number {
  if (square.ladder) return floor + square.ladder;
  if (square.trapdoor >= 0) return square.trapdoor;
  if (square.falseFloor) return floor + 1;
  return square.chute;
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number): void {
  ctx.font = `bold ${Math.round(size * 0.42)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.square;
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = palette.label;
  ctx.fillText(text, cx, cy);
  ctx.lineWidth = 1;
}

/** Axis-aligned line covering pixels from (x0, y0) up to but excluding (x1, y1). */
function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  if (x0 === x1) {
    ctx.moveTo(x0 + 0.5, y0);
    ctx.lineTo(x0 + 0.5, y1);
  } else {
    ctx.moveTo(x0, y0 + 0.5);
    ctx.lineTo(x1, y0 + 0.5);
  }
  ctx.stroke();
}

function diagonal(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Pixel rectangle of a square: its top-left corner and the distance to the next square's corner. */
export function squareRect(view: Viewport, x: number, y: number): { x0: number; y0: number; w: number; h: number } {
  const x0 = Math.round(view.originX + x * view.cell);
  const y0 = Math.round(view.originY + y * view.cell);
  return { x0, y0, w: Math.round(view.originX + (x + 1) * view.cell) - x0, h: Math.round(view.originY + (y + 1) * view.cell) - y0 };
}

/** Outline of one square, for the cursor and the landing highlight. */
export function drawOutline(ctx: CanvasRenderingContext2D, x: number, y: number, view: Viewport, lineWidth: number, colour: string): void {
  const { x0, y0, w, h } = squareRect(view, x, y);
  const inset = lineWidth / 2;
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = colour;
  ctx.setLineDash([]);
  ctx.strokeRect(x0 + inset, y0 + inset, w + 1 - lineWidth, h + 1 - lineWidth);
  ctx.lineWidth = 1;
}

/**
 * The square you stand on, drawn in whatever colour the caller is turning over.
 *
 * `gameArrow` is the arrow the game's own map marks the character with, the bitmap of
 * `facingArrowCells` painted a square of the cell to a pixel, which is what a game that has one
 * is drawn with. Without one it is an arrowhead of the site's own pointing the way the character
 * faces, and where nobody is facing anywhere it is a filled block, which is the map explorer
 * walking someone about the floor.
 */
export function drawYou(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  view: Viewport,
  fill: string,
  dir: number | null = null,
  gameArrow = false,
): void {
  const { x0, y0, w, h } = squareRect(view, x, y);
  const inset = 2;
  const left = x0 + 1 + inset;
  const top = y0 + 1 + inset;
  const width = Math.max(1, w - 2 * inset);
  const height = Math.max(1, h - 2 * inset);
  ctx.fillStyle = fill;
  if (dir === null) {
    ctx.fillRect(left, top, width, height);
    return;
  }
  if (gameArrow) {
    const edge = (along: number, size: number) => Math.round((along * size) / FACING_ARROW_SIZE);
    for (const cell of facingArrowCells(dir)) {
      const x1 = edge(cell.x, width);
      const y1 = edge(cell.y, height);
      ctx.fillRect(left + x1, top + y1, edge(cell.x + 1, width) - x1, edge(cell.y + 1, height) - y1);
    }
    return;
  }
  ctx.beginPath();
  youArrow(dir).forEach((corner, index) => {
    const cx = left + corner.x * width;
    const cy = top + corner.y * height;
    if (index === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.closePath();
  ctx.fill();
}

/** Emphasised squares: a bright outline each, plus the label beside those that have one. */
export function drawMarks(ctx: CanvasRenderingContext2D, marks: Mark[], view: Viewport): void {
  if (!marks.length) return;
  for (const mark of marks) drawOutline(ctx, mark.x, mark.y, view, 2, palette.mark);
  ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const mark of marks) {
    if (!mark.label) continue;
    const { x0, y0, w } = squareRect(view, mark.x, mark.y);
    const width = ctx.measureText(mark.label).width + 6;
    const left = x0 + w + 3;
    const top = y0 - 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(left, top, width, 15);
    ctx.fillStyle = palette.mark;
    ctx.fillText(mark.label, left + 3, top + 8);
  }
}

/** A route through square centres, drawn over the floor: a solid line for the steps walked and
 *  a dashed one for each square crossed by casting Pass Wall. */
export function drawRoute(ctx: CanvasRenderingContext2D, route: Route, view: Viewport): void {
  if (route.squares.length < 2) return;
  ctx.lineJoin = 'round';
  drawHops(ctx, route, 'walk', view, [], 'round');
  drawHops(ctx, route, 'passWall', view, [7, 6], 'butt');
  ctx.lineWidth = 1;
}

function drawHops(ctx: CanvasRenderingContext2D, route: Route, kind: Hop, view: Viewport, dash: number[], cap: CanvasLineCap): void {
  if (!route.hops.includes(kind)) return;
  ctx.beginPath();
  route.hops.forEach((hop, i) => {
    if (hop !== kind) return;
    const from = squareCentre(view, route.squares[i]);
    const to = squareCentre(view, route.squares[i + 1]);
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
  });
  ctx.lineCap = cap;
  ctx.setLineDash(dash);
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = palette.route;
  ctx.stroke();
  ctx.setLineDash([]);
}

function squareCentre(view: Viewport, square: Point): Point {
  const { x0, y0, w, h } = squareRect(view, square.x, square.y);
  return { x: x0 + 1 + w / 2, y: y0 + 1 + h / 2 };
}
