import type { PicRowImage } from './texture';

/**
 * The ten images of a `ufwall<part>.pic`, in the order `load_section_pictures` (exe 2000:372c)
 * loads them. `dotu-tools/pics/walls/_sheet_ufwall1.png` is the whole file drawn out.
 */
export const WALL_DOOR = 0;
export const WALL_TELEPORTER_SIGN = 2;
/** The three materials a plain wall is drawn with. */
export const WALL_MATERIALS = [3, 4, 5] as const;
/**
 * The four perspective tiles the floor and ceiling are laid with. `draw_3d_view` uses them in
 * pairs, picking the pair by the parity of the character's x + y so the floor changes as you walk.
 */
export const FLOOR_TILES = [6, 7, 8, 9] as const;

/**
 * The bank the wall drawer lifts a picture value below 16 into: `FUN_4000_4f8f` adds DS:4fc3
 * (exe 4000:549d), and that byte holds 16 and is never written anywhere in the executable, so a
 * wall is always drawn in entries 16 to 31 — the section's own wall colours, which `set_palette`
 * (exe 4000:12c3) fills from one of four colour sets by section-within-module.
 *
 * The 0x50 `draw_3d_view` writes (exe 3000:0f75) is a different byte, DS:4fc1, and belongs to
 * `scale_image2`: it is the bank the floor and ceiling tiles are drawn from, not the walls.
 */
export const WALL_BASE = 16;

/**
 * The first entry of the gradient bank the wall drawer reads for picture values 18 and 19, which
 * `FUN_4000_4f8f` adds after shifting the screen column (exe 4000:5419). Only the teleporter sign
 * has any pixel that high; the doors and the three wall materials stop at 15.
 */
export const WALL_GRADIENT = 0x80;

/**
 * What value 17 comes out as on a plain wall or a door. `FUN_3000_342d` writes 12 into DS:4fbd
 * before it paints either (exe 3000:342d); the teleporter sign is the one face given a tint of
 * its own, picked by the video mode.
 */
export const WALL_TINT = 12;

/**
 * Which of the two pairs a square is laid with: 0 for images 6 and 7, 2 for 8 and 9. The pair
 * turns over with every step, and the way the character faces is added in so that the floor does
 * not change when they only turn on the spot (exe 3000:1698).
 *
 * `dir` is the way the character faces (DS:c02e) and not the way the view being drawn looks, so
 * all four views of one screen lay their floors the same way.
 */
export const floorTilePair = (x: number, y: number, dir: number): number => ((x + y + (dir < 2 ? 1 : 0)) % 2) * 2;

/**
 * The two images of `overlay.pic`, which `load_overlay_pic` (exe 2000:3654) reads into the pair
 * of far pointers at DS:c3af and DS:c3b3.
 *
 * The water is drawn over the bottom of a monster in the three water sections. The skull and
 * crossbones is what `movecontrol` (exe 2000:c308) paints over a monster that has just died.
 */
export const OVERLAY_WATER = 0;
export const OVERLAY_SKULL = 1;

/**
 * Everything the 3-D view draws that comes out of a `.PIC` file. The renderer is handed one of
 * these rather than reaching for the files itself, so the same code runs in the browser (where
 * Vite inlines the pictures) and under Node (where a script reads them off disk).
 */
export interface ViewPictures {
  /**
   * The ten images of the section's wall file, or null when the bundle has no wall pictures. The
   * view falls back to flat fills of the section's own wall colours when this is null.
   */
  wall: PicRowImage[] | null;
  /** `overlay.pic`, whose two images are {@link OVERLAY_WATER} and {@link OVERLAY_SKULL}. */
  overlay: PicRowImage[] | null;
  /** A monster's picture, by the picture number and colour set in its record. */
  monster(picnum: number, builtin: boolean): PicRowImage | null;
  /** The two ladder marks, `ufmon.pic` images 0 (down) and 1 (up). */
  ladder(down: boolean): PicRowImage | null;
}

export { WALL_FILES, wallPictureFile, sectionPictures, type SectionPictures } from '../../game/port/pictures';

/** A picture set with nothing in it, which draws the view in flat colours. */
export const NO_PICTURES: ViewPictures = {
  wall: null,
  overlay: null,
  monster: () => null,
  ladder: () => null,
};
