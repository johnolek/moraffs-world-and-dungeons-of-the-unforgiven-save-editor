import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import {
  BRIGHT_COLOURS,
  dungeonPalette,
  monsterPixelIndex,
  parsePic,
  renderImage,
  sectionPictureIndex,
} from '../src/lib/game/dotu-pic.js';

/**
 * The site's icon: the face of the Ghoul, cut out of the game's own picture of him.
 *
 * He is the fifth monster of section 17, which puts him in `ufmon17.pic` (`sectionPictureIndex`
 * turns his picnum into the image of that file), and he is drawn with the dungeon palette of the
 * section he stands in and the tint and colour set his record carries. Everything about him is
 * read out of `dotu-data.json` rather than written down here, so the only numbers this file has
 * of its own are the rectangle of his picture the icon is cut from.
 *
 * `build-favicon.mts` is what runs it.
 */

/** Which monster of which section: section 17's fifth is the Ghoul. */
const SECTION = 17;
const MONSTER = 4;

/**
 * The rectangle of the 256 by 200 picture the icon is cut from, and where it stands in the icon.
 *
 * It is his head and no more of him: the crop stops at row 56, which is the last row before his
 * shoulders widen out past the sides of it, and the head is left standing on transparency with a
 * few rows of room above and below.
 */
const FACE = { x: 91, y: 2, width: 74, height: 55 };
const ICON = { top: 9 };

/** How many pixels across the icon is, which is the width of the crop. */
export const FAVICON_SIZE = FACE.width;

interface DataFile {
  sections: {
    section: number;
    module: number;
    part: number;
    monsters: { name: string; picnum: number; color: number; colorSet: number }[];
  }[];
}

/** What the icon is a picture of, for the script to say so as it writes it. */
export interface FaviconSource {
  file: string;
  image: number;
  monster: string;
}

/** The icon, as the 74 by 74 square of RGBA the PNG is written from. */
export function drawFavicon(root: string): { pixels: Uint8ClampedArray; source: FaviconSource } {
  const data = JSON.parse(readFileSync(`${root}/src/lib/game/dotu-data.json`, 'utf8')) as DataFile;
  const section = data.sections.find((entry) => entry.section === SECTION);
  if (!section) throw new Error(`no section ${SECTION} in dotu-data.json`);
  const monster = section.monsters[MONSTER];
  const file = `ufmon${SECTION}.pic`;
  const { images } = parsePic(readFileSync(`${root}/src/lib/game/pics/${file}`));
  const image = sectionPictureIndex(monster.picnum);
  const palettes = JSON.parse(readFileSync(`${root}/src/lib/game/palettes.json`, 'utf8'));
  const palette = dungeonPalette(palettes, null, section.module, section.part, BRIGHT_COLOURS);
  const drawn = renderImage(images[image], palette, (v, row) =>
    monsterPixelIndex(v, monster.color, monster.colorSet, row),
  );
  const pixels = new Uint8ClampedArray(FAVICON_SIZE * FAVICON_SIZE * 4);
  for (let y = 0; y < FACE.height; y++) {
    for (let x = 0; x < FACE.width; x++) {
      const from = ((FACE.y + y) * drawn.width + FACE.x + x) * 4;
      const to = ((ICON.top + y) * FAVICON_SIZE + x) * 4;
      pixels.set(drawn.data.subarray(from, from + 4), to);
    }
  }
  return { pixels, source: { file, image, monster: monster.name } };
}

/** The table `zlib`'s own CRC is built from, which a PNG chunk ends with. */
const CRC_TABLE = Array.from({ length: 256 }, (_, byte) => {
  let value = byte;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/**
 * A square of RGBA as a PNG: eight bits a channel with an alpha one, every row written with no
 * filter in front of it, which is all a picture this small needs.
 */
export function encodePng(size: number, pixels: Uint8ClampedArray): Buffer {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
