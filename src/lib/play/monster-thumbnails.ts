import { sectionPictures } from '../game/port/pictures';
import { monsterById } from '../map/stocking';
import { viewPictures } from './view3d/browser';
import { picturePixelIndex } from './view3d/scale';
import { ZoomThumbnails, type ZoomThumbnail } from './zoom-thumbnails';

/**
 * Dungeons of the Unforgiven's monster pictures shrunk for the map in the corner of its screen,
 * kept for the life of the tab.
 *
 * The store is a module of its own rather than a field of the component because the tab draws the
 * whole frame again on every keypress: a thumbnail built inside the drawing would be built again
 * every time.
 */
const shrunk = new ZoomThumbnails();

/**
 * The picture the map marks this monster with, at the size the map's cells take, or null when the
 * bundle has no picture for it.
 *
 * A built-in monster's picture is in `ufmon.pic` whatever floor it turns up on; a section
 * monster's is in the file of the section that owns it, which is the monster's own and not the
 * floor's. The colour rule is the one the 3-D view draws the same monster with, so the picture on
 * the map is the picture in the view.
 */
export function dotuMonsterThumbnail(monsterId: string, size: number): ZoomThumbnail | null {
  const entry = monsterById(monsterId);
  const builtin = entry.origin.kind === 'builtin';
  const section = entry.origin.kind === 'section' ? entry.origin.section : 1;
  return shrunk.get(
    monsterId,
    size,
    () => viewPictures(sectionPictures(section)).monster(entry.picnum, builtin),
    (value, row) => picturePixelIndex(value, row, { base: entry.colorSet << 4, tint: entry.color }),
  );
}
