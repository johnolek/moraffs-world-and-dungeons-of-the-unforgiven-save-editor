import { bytesFromDataUrl } from '../../bytes';
import { parsePicRows, type PicRowImage } from './texture';
import { sectionPictures, type SectionPictures, type ViewPictures } from './pictures';

/**
 * The pictures the 3-D view draws with, taken from the bundle. The renderer itself is handed a
 * `ViewPictures` rather than reaching for files, so this is the only part of it that knows Vite
 * exists; the PNG script reads the same files off disk instead.
 */

const picUrls = import.meta.glob('../../game/pics/*.pic', {
  eager: true,
  query: '?inline',
  import: 'default',
}) as Record<string, string>;

const parsed = new Map<string, PicRowImage[] | null>();

function images(file: string): PicRowImage[] | null {
  const cached = parsed.get(file);
  if (cached !== undefined) return cached;
  const url = picUrls[`../../game/pics/${file}`];
  const decoded = url ? parsePicRows(bytesFromDataUrl(url)) : null;
  parsed.set(file, decoded);
  return decoded;
}

/** The picture set a section is drawn with, from the two files its rules name. */
export function viewPictures(files: SectionPictures): ViewPictures {
  const builtin = images('ufmon.pic');
  const own = images(files.monsters);
  return {
    wall: images(files.wall),
    overlay: images('overlay.pic'),
    // A built-in monster's picture number counts from ufmon.pic's third image; a section
    // monster's counts from 7 into the file of the section it belongs to.
    monster: (picnum, isBuiltin, section) => {
      if (isBuiltin) return builtin?.[picnum + 2] ?? null;
      const file = section == null ? own : images(sectionPictures(section).monsters);
      return file?.[picnum - 7] ?? null;
    },
    ladder: (down) => builtin?.[down ? 0 : 1] ?? null,
  };
}

/** The four images of a town building's picture, or null when the bundle has not got the file. */
export const buildingPictures = (file: string): PicRowImage[] | null => images(file);
