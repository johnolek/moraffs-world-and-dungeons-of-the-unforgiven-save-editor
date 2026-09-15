import type { MapSquare } from '../../map/game';
import { fillRect, type Frame } from './frame';
import { floodBothHalves, type FloodContext, type WallFace } from './flood';
import {
  VIEW_REACH,
  ftol,
  horizonRow,
  projectSquare,
  slotNarrowing,
  viewPointToSquare,
  type ViewFrame,
  type ViewRect,
} from './geometry';
import { FLOOR_TILES, floorTilePair, OVERLAY_SKULL, OVERLAY_WATER } from './pictures';
import { scaleImage, type ScaleOptions } from './scale';
import type { PicRowImage } from './texture';
import { drawWall, DETAIL_TEXTURED, type WallScene } from './wall';
import { FOUR_VIEWS, viewFacing } from './views';

/**
 * `draw_3d_view` (exe 3000:0f75): one of the four corridor views. It walks forward a square at a
 * time drawing the wall ahead and flooding the view out to each side, stops at the first side it
 * cannot see through, and then walks back drawing what stands on the squares straight ahead — far
 * to near, so the nearer ones paint over the further.
 */

/** A monster the view may draw, as its record holds it. */
export interface ViewMonster {
  x: number;
  y: number;
  picnum: number;
  /** Whether it is one of the 22 built-ins rather than one of the section's own four. */
  builtin: boolean;
  /** The record's `color` byte. */
  colour: number;
  colorSet: number;
}

export interface ViewScene extends Omit<WallScene, 'facing'> {
  /** DS:b8bd: the character's height, which is where the horizon sits. */
  horizonWeight: number;
  /** DS:c02e: the way the character faces, which the floor tiles are picked by whichever of the
   *  four views is being drawn. */
  dir: number;
  monsters: ViewMonster[];
  /** The three water sections draw the built-in monsters short, with the overlay over them. */
  water: boolean;
  /** The coin flip the view mirrors the monster ahead on, fresh for every draw. */
  random?: () => number;
  /** The monster whose hit points have just run out, whose skull is up. */
  killed?: KilledMonster | null;
}

/**
 * A monster killed but not yet cleared off the screen: the skull `movecontrol` paints over it,
 * and the picture underneath the skull.
 */
export interface KilledMonster {
  /** DS:049d: which of the four ways the monster was found standing in. */
  dir: number;
  monster: ViewMonster;
}

/** The view came back blocked: the character is facing a wall from right up against it. */
export const VIEW_BLOCKED = -1;

/**
 * Draw one view. `facing` is which way this view looks (0 north, 1 south, 2 west, 3 east) and
 * `rect` where on the 1600 x 1200 screen it goes.
 */
export function renderView(frame: Frame, scene: ViewScene, rect: ViewRect, facing: number): number {
  const view: ViewFrame = { ...rect, horizonWeight: scene.horizonWeight, facing, at: scene.at };
  const wallScene: WallScene = { ...scene, facing };
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;

  const context: FloodContext = {
    view,
    wall: (face: WallFace) => drawWall(frame, wallScene, face),
    square: (x1, z1, x2, z2, leftX, rightX) => drawSquare(frame, scene, view, x1, z1, x2, z2, leftX, rightX),
  };

  let reached = 0;
  for (let depth = 0; depth < VIEW_REACH; depth++) {
    const across = slotNarrowing(width, depth);
    const down = slotNarrowing(height, depth);
    if (depth === 0) {
      // The floor and the ceiling go down once, and only when the way ahead is open: a wall right
      // in front of you fills the view on its own.
      const ahead = sideAhead(scene, facing);
      if (ahead === 3 || scene.detail > 1) drawFloorAndCeiling(frame, scene, view, rect);
    }
    const open = drawWall(frame, wallScene, {
      cellX: 0,
      cellZ: -depth,
      kind: 0,
      leftX: ftol(rect.left + across),
      rightX: ftol(rect.right - across),
      topNear: ftol(rect.top + ((32 - scene.horizonWeight) * down) / 16),
      bottomNear: ftol(rect.bottom - (scene.horizonWeight * down) / 16),
      topFar: 0,
      bottomFar: 0,
      pctLeft: 0,
      pctRight: 99,
    });
    if (!open) {
      if (depth === 0) return VIEW_BLOCKED;
      break;
    }
    reached = depth + 1;
    floodBothHalves(context, depth);
  }

  for (let depth = reached; depth > 0; depth--) {
    const across = slotNarrowing(width, depth);
    drawSquare(
      frame,
      scene,
      view,
      -0.5,
      depth + 0.5,
      0.5,
      depth + 0.5,
      ftol(rect.left + across),
      ftol(rect.right - across),
    );
    if (depth === 1) drawEngagedMonster(frame, scene, rect, facing);
  }
  return 0;
}

/**
 * The four views of one screen, drawn into one frame: `FUN_2000_ac9e` (exe 2000:ac9e) calls
 * `draw_3d_view` once for the way the character faces and once for each of the other three.
 */
export function renderFourViews(frame: Frame, scene: ViewScene, facing: number): void {
  const party = { ...scene, dir: facing };
  for (const view of FOUR_VIEWS) renderView(frame, party, view.rect, viewFacing(view.name, facing));
  drawSkull(frame, party, facing);
}

/**
 * `movecontrol` (exe 2000:c308) at 2000:dafb: a monster whose hit points have run out gets a
 * skull and crossbones painted over it before `kill_monster` says a word, and it stands there
 * through every box the kill prints until the loop comes round and draws the views again.
 *
 * The skull is `overlay.pic`'s second image, and the rectangle is the one `draw_3d_view` kept
 * when it drew the monster in the view DS:049d names. The kept copy holds its left and right
 * edges the other way round, so this second drawing is always the mirror of the picture under it.
 *
 * The port redraws the views from the game as it stands rather than leaving the last drawing on
 * the screen, so the monster's own picture is drawn again underneath the skull: `kill_monster`
 * takes it off the occupancy grid part-way through its boxes, and without this the skull would be
 * left hanging on an empty corridor.
 */
function drawSkull(frame: Frame, scene: ViewScene, facing: number): void {
  const killed = scene.killed;
  if (!killed) return;
  const view = FOUR_VIEWS.find((each) => viewFacing(each.name, facing) === killed.dir);
  if (!view) return;
  drawKilledSkull(frame, scene, view.rect);
}

/**
 * The skull in a view drawn on its own rather than as one of the four, for a caller that has
 * worked out for itself that the monster died in the direction its view looks.
 */
export function drawKilledSkull(frame: Frame, scene: ViewScene, rect: ViewRect): void {
  const killed = scene.killed;
  if (!killed) return;
  const skull = scene.pictures.overlay?.[OVERLAY_SKULL];
  if (!skull) return;

  const { left, top, right, bottom } = engagedMonsterRect(rect);
  const picture = scene.pictures.monster(killed.monster.picnum, killed.monster.builtin);
  if (picture) {
    scaleImage(frame, left, top, right, bottom, picture, 0, 255, monsterPaint(scene, killed.monster));
    // The screen the original paints the skull onto still has the water the view drew over this
    // monster, so the redraw puts it back too. It goes on the way round the monster under it did,
    // rather than on a flip of its own: there is no drawing here in the original to roll for.
    const water = waterOverlay(scene, killed.monster);
    if (water) {
      scaleImage(frame, left, top, right, bottom, water, 0, 255, waterOverlayPaint(scene, killed.monster));
    }
  }
  // The base is set at exe 2000:daf1 and the tint is left at whatever the last monster drawn set
  // it to. Nothing turns on that: the skull's every pixel is under 28, which is the only value
  // the tint stands in for in this bank.
  scaleImage(frame, right, top, left, bottom, skull, 0, 255, {
    screen: scene.screen,
    colours: { base: 0x20, tint: 0 },
  });
}

/** `retdwall` for the side the view looks through from the character's own square. */
function sideAhead(scene: ViewScene, facing: number): number {
  const { x, y } = scene.at;
  const here = scene.rows[y]?.[x];
  if (!here) return 0;
  if (facing === 0) return here.n;
  if (facing === 1) return scene.rows[y + 1]?.[x]?.n ?? 0;
  if (facing === 2) return here.w;
  return scene.rows[y]?.[x + 1]?.w ?? 0;
}

/**
 * The floor and the ceiling, each laid as two bands mirrored about the middle of the view. Which
 * pair of the wall file's four tiles is used turns over with every step, which is what makes the
 * floor change as you walk.
 *
 * The ceiling is laid with them everywhere but the three water sections. `draw_3d_view` asks
 * about its two halves separately, and the ceiling's question carries DS:031d — the flag
 * `load_section_pictures` (exe 2000:372c) raises for sections 4, 8 and 20 — where the floor's
 * question does not. So a section whose tiles are water has water underfoot and none of it
 * overhead.
 *
 * A half that is not laid with tiles is filled flat here. That covers the water sections, the
 * bundle without the wall pictures in it, and the two lower settings of the graphics menu's floor
 * tile type; the original draws its own banded gradient for all three (`draw_3d_view`'s DS:2322
 * branch), which is not ported and is written down in `dotu-tools/docs/FAITHFUL-GAPS.md`.
 */
function drawFloorAndCeiling(frame: Frame, scene: ViewScene, view: ViewFrame, rect: ViewRect): void {
  const horizon = horizonRow(view);
  const midX = (rect.left + rect.right) >> 1;
  const wall = scene.pictures.wall;
  const screen = scene.screen;
  const toX = (x: number) => Math.trunc(((screen.width - 1) * x) / 1599);
  const toY = (y: number) => Math.trunc(((screen.height - 1) * y) / 1199);
  const flat = (edge: number) =>
    fillRect(frame, toX(rect.left), toY(Math.min(edge, horizon)), toX(rect.right), toY(Math.max(edge, horizon)), 0);

  const tiled = wall !== null && scene.detail === DETAIL_TEXTURED;
  // The ceiling is the half above the horizon and the floor the half below it.
  const halves = [
    { edge: rect.top, tiled: tiled && !scene.water },
    { edge: rect.bottom, tiled },
  ];

  const pair = floorTilePair(scene.at.x, scene.at.y, scene.dir);
  const distant = wall?.[FLOOR_TILES[pair + 1]];
  const underfoot = wall?.[FLOOR_TILES[pair]];
  // The tiles carry no pixel the tint or the transparent value could stand in for, so the colour
  // the last wall face left in DS:4fbd — which this pass does not set — cannot reach them.
  const options = { screen: scene.screen, colours: { base: 0x50, tint: 0 } };
  const third = (a: number, b: number) => Math.trunc((2 * a + b) / 3);

  // The square underfoot fills the two thirds of the band nearest the edge of the view and
  // everything beyond it is crammed into the third by the horizon. Each is drawn twice, mirrored
  // about the middle of the view.
  for (const half of halves) {
    if (!half.tiled) {
      flat(half.edge);
      continue;
    }
    const bend = third(horizon, half.edge);
    for (const [x1, x2] of [
      [midX, rect.right],
      [midX, rect.left],
    ]) {
      if (distant) scaleImage(frame, x1, horizon, x2, bend, distant, 0, 246, options);
      if (underfoot) scaleImage(frame, x1, bend, x2, half.edge, underfoot, 0, 251, options);
    }
  }
}

/**
 * How `scale_image2` (exe 4000:4818) is set up for a monster: DS:4fc1 the colour-set base, DS:4fbd
 * the record's own colour byte, and DS:4fc5 the 140 rows a built-in monster is stretched from in
 * the three water sections, which draws it short.
 */
function monsterPaint(scene: ViewScene, monster: ViewMonster): ScaleOptions {
  return {
    screen: scene.screen,
    rows: scene.water && monster.builtin ? 140 : 200,
    colours: { base: monster.colorSet << 4, tint: monster.colour },
  };
}

/**
 * `overlay.pic`'s first image, drawn over a monster the water sections have just drawn short,
 * which is what makes it look like it is standing in water.
 *
 * Both sites that draw a monster follow it with this — `draw_3d_view` at 3000:24c8 for the square
 * straight ahead and `draw_map_square` at 3000:307c for every other one — and both test the same
 * two things: that the monster was stretched from 140 rows rather than 200, and that `overlay.pic`
 * was loaded at all (DS:031b). So the water is drawn at every distance, exactly as the monster is.
 *
 * The overlay goes into the monster's own rectangle and the same window of source columns, out of
 * all 200 of its rows, and each site mirrors it the way that site mirrors a picture.
 */
function waterOverlay(scene: ViewScene, monster: ViewMonster): PicRowImage | null {
  if (!scene.water || !monster.builtin) return null;
  return scene.pictures.overlay?.[OVERLAY_WATER] ?? null;
}

/**
 * How `scale_image2` is set up for it (exe 3000:24dd and 3000:3091): the whole 200 rows, the base
 * moved to 0x3a in a 256-colour mode, and the tint left holding the monster's own colour byte,
 * which nothing between the two calls writes.
 */
function waterOverlayPaint(scene: ViewScene, monster: ViewMonster): ScaleOptions {
  return { screen: scene.screen, colours: { base: 0x3a, tint: monster.colour } };
}

/**
 * The last step of `draw_3d_view`'s walk back toward the character (exe 3000:21e7): the monster
 * one square ahead — the one an engagement is fought with — drawn into a rectangle of the view
 * rather than through the perspective. `draw_map_square` leaves that square's monster to this.
 *
 * The rectangle is the view's own corners, pulled in across by half the slot narrowing one step
 * out and cut down to the quarter row and the fifteen-sixteenths row (exe 3000:2342). The
 * character's height, which the horizon is weighed by everywhere else in the view, is not read
 * here at all: the monster stands in the same place however tall they are.
 *
 * `dotu-tools/docs/SCREEN.md` writes the numbers out, along with the second rectangle for narrow
 * screens that the original's own branch can never reach.
 *
 * `draw_3d_view` keeps this rectangle per view at DS:2318, DS:c67a, DS:c682 and DS:c68a (exe
 * 3000:244f), which is how `movecontrol` finds it again to draw the skull.
 */
export function engagedMonsterRect(rect: ViewRect): ViewRect {
  const narrowing = slotNarrowing(rect.right - rect.left, 1);
  return {
    left: ftol(rect.left + narrowing / 2),
    top: (rect.bottom + rect.top * 3) >> 2,
    right: ftol(rect.right - narrowing / 2),
    bottom: (rect.bottom * 15 + rect.top) >> 4,
  };
}

function drawEngagedMonster(frame: Frame, scene: ViewScene, rect: ViewRect, facing: number): void {
  const ahead = viewPointToSquare(0, 1, facing, scene.at);
  const monster = scene.monsters.find((m) => m.x === ahead.x && m.y === ahead.y);
  if (!monster) return;
  const picture = scene.pictures.monster(monster.picnum, monster.builtin);
  if (!picture) return;

  const { left, top, right, bottom } = engagedMonsterRect(rect);
  // A coin flip fresh for every draw mirrors the picture, which `scale_image2` does by being
  // handed a left edge greater than its right. The screen draws with no generator, so that
  // redrawing a view never spends one of the game's own random numbers.
  const mirrored = scene.random !== undefined && scene.random() < 0.5;
  scaleImage(
    frame,
    mirrored ? right : left,
    top,
    mirrored ? left : right,
    bottom,
    picture,
    0,
    255,
    monsterPaint(scene, monster),
  );

  const water = waterOverlay(scene, monster);
  if (!water) return;
  // A second coin flip, drawn after the monster's (exe 3000:24fe), so the water can lie the
  // other way round from the thing standing in it.
  const overlayMirrored = scene.random !== undefined && scene.random() < 0.5;
  scaleImage(
    frame,
    overlayMirrored ? right : left,
    top,
    overlayMirrored ? left : right,
    bottom,
    water,
    0,
    255,
    waterOverlayPaint(scene, monster),
  );
}

/**
 * The part of `draw_map_square` (exe 3000:2848) that draws: the monster standing on the square,
 * mirrored when the square's own x is odd, and the ladder mark under it.
 */
function drawSquare(
  frame: Frame,
  scene: ViewScene,
  view: ViewFrame,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  leftX: number,
  rightX: number,
): void {
  const face = projectSquare(x1, z1, x2, z2, leftX, rightX, view);
  if (!face) return;

  // The near corner of the square one step straight ahead. `draw_map_square` draws no monster
  // for it (exe 3000:2f5e); `draw_3d_view` draws that one itself, zoomed into the view.
  const engaged = x1 === -0.5 && z1 === 1.5;
  const monster = engaged ? undefined : scene.monsters.find((m) => m.x === face.square.x && m.y === face.square.y);
  if (monster) {
    const picture = scene.pictures.monster(monster.picnum, monster.builtin);
    if (picture) {
      const mirrored = (ftol(face.square.x) & 1) === 1;
      const from = mirrored ? Math.trunc(255 - face.to * 255) : Math.trunc(face.from * 255);
      const to = mirrored ? Math.trunc(255 - face.from * 255) : Math.trunc(face.to * 255);
      scaleImage(
        frame,
        mirrored ? face.right : face.left,
        face.top,
        mirrored ? face.left : face.right,
        face.bottom,
        picture,
        from,
        to,
        monsterPaint(scene, monster),
      );
      const water = waterOverlay(scene, monster);
      // The map squares mirror the overlay the same way they mirror the monster: on the square's
      // own x, which is read again rather than rolled (exe 3000:30b2).
      if (water) {
        scaleImage(
          frame,
          mirrored ? face.right : face.left,
          face.top,
          mirrored ? face.left : face.right,
          face.bottom,
          water,
          from,
          to,
          waterOverlayPaint(scene, monster),
        );
      }
    }
  }

  const square = scene.rows[face.square.y]?.[face.square.x];
  if (!square || face.from === face.to) return;
  const ladder = ladderShownOn(square);
  if (ladder === 0) return;
  const picture = scene.pictures.ladder(ladder > 0);
  if (!picture) return;
  // A ladder down is marked on the floor of the square, a ladder up on its ceiling.
  const top = ladder > 0 ? Math.trunc((face.top + face.bottom * 2) / 3) : face.top;
  const bottom = ladder > 0 ? face.bottom : Math.trunc((face.top * 2 + face.bottom) / 3);
  scaleImage(frame, face.left, top, face.right, bottom, picture, Math.trunc(face.from * 255), Math.trunc(face.to * 255), {
    screen: scene.screen,
    colours: { base: 0, tint: 0 },
  });
}

/**
 * Which of `ufmon.pic`'s two ladder pictures a square is drawn with, as `draw_map_square` works
 * it out at exe 3000:3222: greater than zero the ladder down on the square's floor, less than
 * zero the ladder up on its ceiling, and zero neither.
 *
 * check_for_ladder answers first, and only on a square it says has no ladder does the town's
 * building count (exe 3000:3297) — `trapdoor` (exe 2000:9cba, unf.c "trapdoor"), which is the
 * building despite its name, negated. So a store, a temple, a bank or an inn is drawn with the
 * ladder up: that is how the view says there is somewhere to go up into.
 */
function ladderShownOn(square: MapSquare): number {
  if (square.ladder !== 0) return square.ladder;
  return -(square.town ?? 0);
}
