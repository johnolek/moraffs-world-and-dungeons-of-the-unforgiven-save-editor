// Writes src/favicon.png, the icon the browser tab shows: the Ghoul's face, cut out of the
// game's own picture of him with the site's own .pic reader. `favicon.mts` beside this is the
// cutting and the PNG, and index.html links the file it writes with ?inline, so the single-file
// build carries the icon as a data URI rather than asking for a second file.
import { writeFileSync } from 'node:fs';
import { drawFavicon, encodePng, FAVICON_SIZE } from './favicon.mts';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { pixels, source } = drawFavicon(root);
const png = encodePng(FAVICON_SIZE, pixels);
writeFileSync(`${root}/src/favicon.png`, png);
console.log(`src/favicon.png: ${source.monster}, image ${source.image} of ${source.file}, ${png.length} bytes`);
