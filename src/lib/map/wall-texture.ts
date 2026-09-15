import type { GameId } from '../app-state.svelte';
import { bundledPictureImages, sectionPalette, type RenderedImage } from '../bestiary/pictures';
import { PIC_W, renderImage, vgaToRgb, type PicImage, type Rgb } from '../game/dotu-pic.js';
import mwPalettes from '../game/mw-palettes.json';
import { sectionInfo } from '../game/sections';
import { wallImages as moraffsWorldWallImages } from '../mw-bestiary/pictures';
import { wallPictureFile } from '../game/port/pictures';
import {
  WALL_BASE as MORAFFS_WORLD_WALL_BASE,
  WALL_GRADIENT as MORAFFS_WORLD_WALL_GRADIENT,
  WALL_STONE,
  WALL_TINT as MORAFFS_WORLD_WALL_TINT,
} from '../play/mw/view3d/pictures';
import { WALL_BASE, WALL_GRADIENT, WALL_TINT } from '../play/view3d/pictures';
import { wallPixelIndex } from '../play/view3d/texture';

/**
 * The texture the 3-D view would draw this floor's walls with.
 *
 * Both games keep their wall pictures in .pic files the site already bundles, and in both the
 * walls change with depth: Dungeons of the Unforgiven loads one of four wall pictures for each
 * section, and Moraff's World keeps one wall picture and recolours it on every floor.
 */
export interface WallTexture {
  /** The picture file the game loads for this floor. */
  file: string;
  /** The image of that file the wall faces are drawn from. */
  image: number;
  /** Everything the drawing depends on, so a texture already drawn can be kept. */
  key: string;
  /** The palette the game draws it in. */
  palette: Rgb[];
  /** The palette entry one pixel value takes on one row, or -1 where the pixel is not drawn. */
  pixelIndex: (value: number, row: number) => number;
  /** The images of the file, or null when the site does not bundle it. */
  images: () => PicImage[] | null;
}


/**
 * A wall picture holds a door, a portcullis, the teleporter sign, three wall materials and four
 * floor and ceiling tiles. FUN_3000_342d (exe 3000:342d) picks between the three materials by a
 * count of the square's own coordinates, so any of them can stand for the floor and the first
 * one does.
 */
const UNFORGIVEN_WALL_IMAGE = 3;

/**
 * The drawer reads the screen column for picture values 18 and 19, and the swatch is not on a
 * screen. Neither game's wall material has a pixel that high, so no pixel of a swatch ever asks.
 */
const NO_COLUMN = 0;

/** How many wall colour sets set_palette (exe 4000:10ee) rotates through. */
const MORAFFS_WORLD_WALL_SETS = mwPalettes.palettes.length;

function unforgivenWallTexture(module: number, floor: number): WallTexture | null {
  const section = sectionInfo(module, floor);
  if (!section) return null;
  const file = wallPictureFile(section.section);
  return {
    file,
    image: UNFORGIVEN_WALL_IMAGE,
    key: `unforgiven:${file}:${module}:${section.part}`,
    palette: sectionPalette(module + 1, section.part),
    pixelIndex: (value) =>
      wallPixelIndex(value, NO_COLUMN, PIC_W, {
        base: WALL_BASE,
        tint: WALL_TINT,
        gradient: WALL_GRADIENT,
      }),
    images: () => bundledPictureImages(file),
  };
}

function moraffsWorldWallTexture(floor: number): WallTexture {
  const set = ((floor % MORAFFS_WORLD_WALL_SETS) + MORAFFS_WORLD_WALL_SETS) % MORAFFS_WORLD_WALL_SETS;
  return {
    file: 'wall.pic',
    image: WALL_STONE,
    key: `moraffsWorld:${set}`,
    palette: vgaToRgb(mwPalettes.palettes[set]),
    pixelIndex: (value) =>
      wallPixelIndex(value, NO_COLUMN, PIC_W, {
        base: MORAFFS_WORLD_WALL_BASE,
        tint: MORAFFS_WORLD_WALL_TINT,
        gradient: MORAFFS_WORLD_WALL_GRADIENT,
      }),
    images: moraffsWorldWallImages,
  };
}

/**
 * The wall texture of one floor, or null for a floor with none: the floors below Dungeons of the
 * Unforgiven's town belong to no section, and Moraff's Revenge draws no walls at all.
 */
export function wallTexture(game: GameId, dungeon: number, floor: number): WallTexture | null {
  if (game === 'unforgiven') return unforgivenWallTexture(dungeon, floor);
  if (game === 'moraffsWorld') return moraffsWorldWallTexture(floor);
  return null;
}

/**
 * One tile of the texture laid across a canvas, anchored to the canvas's own top left corner.
 *
 * The rock behind the map is a backdrop, not part of the map: the floor is what zooming and
 * panning move, and the stone underneath stays where it is. So the pattern is given no transform
 * of its own — a transform built from the map's viewport is what used to slide the stone about
 * every time the map was zoomed.
 */
export function wallTilePattern(
  ctx: CanvasRenderingContext2D,
  tile: CanvasImageSource,
): CanvasPattern | undefined {
  return ctx.createPattern(tile, 'repeat') ?? undefined;
}

const drawn = new Map<string, RenderedImage>();

/** The texture as the game draws it, at its own 256 by 200 pixels, or null when the site does
 *  not bundle the picture file it comes from. */
export function renderWallTexture(texture: WallTexture): RenderedImage | null {
  const cached = drawn.get(texture.key);
  if (cached) return cached;
  const images = texture.images();
  if (!images) return null;
  const image = renderImage(images[texture.image], texture.palette, texture.pixelIndex);
  drawn.set(texture.key, image);
  return image;
}
