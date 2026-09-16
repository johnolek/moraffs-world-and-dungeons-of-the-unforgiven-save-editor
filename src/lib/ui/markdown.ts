/**
 * The Markdown a document of this site is written in, which is a deliberately small subset: `##`
 * for a section, `###` for an entry, paragraphs, `-` lists, `code`, `**bold**` and links.
 *
 * Parsing to a tree rather than to HTML is what keeps an entry from injecting markup: every piece
 * of text comes out as text, and the component that shows it puts it on the page as a text node.
 */

import { slugify } from './format';

/** Where a link goes. The custom schemes name somewhere inside this app rather than a URL. */
export type LinkTarget =
  /** `https://…`, opened in a new tab. */
  | { kind: 'url'; href: string }
  /** `source:ts/magic.ts/writeScrollOrWand`: a declaration of the port, by file name and name. */
  | { kind: 'port'; file: string; name: string }
  /** `source:c/write_scroll_or_wand`: a function of the decompilation. */
  | { kind: 'decompiled'; name: string }
  /** `formula:spell-cost`: an entry of the Formulas tab, by its id. */
  | { kind: 'formula'; id: string };

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; text: string; target: LinkTarget };

export type Block = { kind: 'paragraph'; content: Inline[] } | { kind: 'list'; items: Inline[][] };

export interface Entry {
  /** The element id the table of contents scrolls to; unique across the whole document. */
  id: string;
  title: string;
  /** The line above the title, written in the voice the games' own help screens are written in.
   *  Drawn in the game's font; empty for an entry that has not been given one. */
  banner: string;
  blocks: Block[];
  /** The title and every word of the entry, folded to lower case, for the search box. */
  search: string;
}

export interface Section {
  id: string;
  title: string;
  entries: Entry[];
}

const SOURCE_PORT = /^source:ts\/([^/]+)\/([^/]+)$/;
const SOURCE_C = /^source:c\/([^/]+)$/;
const FORMULA = /^formula:(.+)$/;
const WEB = /^https?:\/\//;

/**
 * What a link's target means, or null where it means nothing this app can open. Anything that is
 * not one of the custom schemes has to be an ordinary web address, so a `javascript:` URL written
 * into the file is not a link at all.
 */
export function linkTarget(href: string): LinkTarget | null {
  const port = SOURCE_PORT.exec(href);
  if (port) return { kind: 'port', file: port[1], name: port[2] };
  const decompiled = SOURCE_C.exec(href);
  if (decompiled) return { kind: 'decompiled', name: decompiled[1] };
  const formula = FORMULA.exec(href);
  if (formula) return { kind: 'formula', id: formula[1] };
  if (WEB.test(href)) return { kind: 'url', href };
  return null;
}

const CODE = /`([^`]+)`/;
const BOLD = /\*\*([^*]+)\*\*/;
const LINK = /\[([^\]]+)\]\(([^)]+)\)/;

/** The first of the three markers to appear, or null when the rest of the line is plain text. */
function nextMarker(text: string): { at: number; length: number; node: Inline } | null {
  const found: { at: number; length: number; node: Inline }[] = [];
  const code = CODE.exec(text);
  if (code) found.push({ at: code.index, length: code[0].length, node: { kind: 'code', text: code[1] } });
  const bold = BOLD.exec(text);
  if (bold) found.push({ at: bold.index, length: bold[0].length, node: { kind: 'bold', text: bold[1] } });
  const link = LINK.exec(text);
  if (link) {
    const target = linkTarget(link[2]);
    const node: Inline = target ? { kind: 'link', text: link[1], target } : { kind: 'text', text: link[1] };
    found.push({ at: link.index, length: link[0].length, node });
  }
  return found.sort((a, b) => a.at - b.at)[0] ?? null;
}

/** One run of text as a list of pieces: plain text, code, bold and links. */
export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let rest = text;
  for (let marker = nextMarker(rest); marker; marker = nextMarker(rest)) {
    if (marker.at > 0) nodes.push({ kind: 'text', text: rest.slice(0, marker.at) });
    nodes.push(marker.node);
    rest = rest.slice(marker.at + marker.length);
  }
  if (rest !== '') nodes.push({ kind: 'text', text: rest });
  return nodes;
}

/** Everything an entry says, with the markup dropped, which is what the search box matches. */
export function plainText(blocks: Block[]): string {
  const runs = blocks.flatMap((block) => (block.kind === 'paragraph' ? [block.content] : block.items));
  return runs.map((run) => run.map((node) => node.text).join('')).join(' ');
}

/** `Bugs the game has` becomes `bugs-the-game-has`, with a number added where that is taken. */
function slug(title: string, taken: Set<string>): string {
  const base = slugify(title) || 'entry';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^-\s+(.*)$/;
const BANNER = /^!\s+(.*)$/;

/**
 * The sections and entries of a document. Anything written before the first `###` of a section,
 * and anything at all before the first `##`, is dropped: every paragraph belongs to an entry.
 *
 * A line starting `! ` straight under a `###`, with no blank line between them, is that entry's
 * banner. Anywhere else it is ordinary text, so a paragraph is free to begin with an exclamation
 * mark without disappearing into the heading.
 */
export function parseDoc(source: string): Section[] {
  const sections: Section[] = [];
  const ids = new Set<string>();
  let section: Section | null = null;
  let entry: Entry | null = null;
  let paragraph: string[] = [];
  let items: string[] = [];
  let inComment = false;
  /** True only while the line being read is the one straight after an entry's heading. */
  let underHeading = false;

  const endBlocks = () => {
    if (entry && paragraph.length > 0) entry.blocks.push({ kind: 'paragraph', content: parseInline(paragraph.join(' ')) });
    if (entry && items.length > 0) entry.blocks.push({ kind: 'list', items: items.map(parseInline) });
    paragraph = [];
    items = [];
  };

  const endEntry = () => {
    endBlocks();
    if (entry) entry.search = `${entry.title} ${entry.banner} ${plainText(entry.blocks)}`.toLowerCase();
    entry = null;
  };

  for (const raw of source.split('\n')) {
    const line = raw.trim();
    const afterHeading = underHeading;
    underHeading = false;
    if (inComment) {
      if (line.includes('-->')) inComment = false;
      continue;
    }
    if (line.startsWith('<!--')) {
      endBlocks();
      if (!line.includes('-->')) inComment = true;
      continue;
    }
    if (line === '') {
      endBlocks();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      endEntry();
      const [, hashes, title] = heading;
      if (hashes === '##') {
        section = { id: slug(title, ids), title, entries: [] };
        sections.push(section);
      } else if (hashes === '###' && section) {
        entry = { id: slug(title, ids), title, banner: '', blocks: [], search: '' };
        section.entries.push(entry);
        underHeading = true;
      }
      continue;
    }
    const banner = afterHeading ? BANNER.exec(line) : null;
    if (banner && entry) {
      entry.banner = banner[1];
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      if (paragraph.length > 0) endBlocks();
      items.push(bullet[1]);
      continue;
    }
    if (items.length > 0) endBlocks();
    paragraph.push(line);
  }
  endEntry();
  return sections;
}

/** The sections that hold an entry matching `query`, each holding only the entries that match. */
export function searchDoc(sections: Section[], query: string): Section[] {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') return sections;
  return sections
    .map((section) => ({ ...section, entries: section.entries.filter((entry) => entry.search.includes(wanted)) }))
    .filter((section) => section.entries.length > 0);
}
