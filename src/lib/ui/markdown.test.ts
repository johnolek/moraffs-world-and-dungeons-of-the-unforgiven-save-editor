import { describe, expect, it } from 'vitest';
import { linkTarget, parseInline, parseDoc, plainText, searchDoc, type Block } from './markdown';

const DOCUMENT = [
  '<!--',
  '  A note to whoever edits this file.',
  '-->',
  '',
  '## Exploits and shortcuts',
  '',
  '### The wand gate',
  '! YOUR PRIEST CAN WRITE WIZARD SCROLLS!!',
  '',
  'A priest can write a **wizard** scroll, because `get_choice` takes the key anyway.',
  'The menu only looks shut.',
  '',
  '- Wands hold five charges',
  '- Scrolls hold one',
  '',
  'See [the code](source:ts/magic.ts/writeScrollOrWand) and [the C](source:c/write_scroll_or_wand).',
  '',
  '### A second entry',
  '',
  'Nothing to see, but [the cost](formula:spell-cost) is worked out elsewhere.',
  '',
  '## Trivia and history',
  '',
  '### The file called v',
  '',
  'It is described at [MobyGames](https://www.mobygames.com/).',
].join('\n');

const sections = parseDoc(DOCUMENT);

describe('parseDoc', () => {
  it('splits the document into sections and entries', () => {
    expect(sections.map((section) => section.title)).toEqual(['Exploits and shortcuts', 'Trivia and history']);
    expect(sections[0].entries.map((entry) => entry.title)).toEqual(['The wand gate', 'A second entry']);
  });

  it('gives every section and entry an id to scroll to', () => {
    expect(sections[0].id).toBe('exploits-and-shortcuts');
    expect(sections[0].entries[0].id).toBe('the-wand-gate');
    expect(sections[1].entries[0].id).toBe('the-file-called-v');
  });

  it('numbers an id a heading already took', () => {
    const repeated = parseDoc(['## Bugs', '### Sleep', '', 'One.', '### Sleep', '', 'Two.'].join('\n'));
    expect(repeated[0].entries.map((entry) => entry.id)).toEqual(['sleep', 'sleep-2']);
  });

  it('joins the lines of a paragraph and keeps the list beside it', () => {
    const blocks = sections[0].entries[0].blocks;
    expect(blocks.map((block) => block.kind)).toEqual(['paragraph', 'list', 'paragraph']);
    expect(plainText([blocks[0]])).toBe(
      'A priest can write a wizard scroll, because get_choice takes the key anyway. The menu only looks shut.',
    );
    const list = blocks[1] as Extract<Block, { kind: 'list' }>;
    expect(list.items.map((item) => plainText([{ kind: 'paragraph', content: item }]))).toEqual([
      'Wands hold five charges',
      'Scrolls hold one',
    ]);
  });

  it('drops the note at the top of the file', () => {
    expect(plainText(sections.flatMap((section) => section.entries).flatMap((entry) => entry.blocks))).not.toContain(
      'whoever edits',
    );
  });

  it('collects the words of an entry for the search box', () => {
    expect(sections[0].entries[0].search).toContain('the wand gate');
    expect(sections[0].entries[0].search).toContain('five charges');
  });
});

describe('the banner over an entry', () => {
  it('is the line under the heading that starts with an exclamation mark', () => {
    expect(sections[0].entries[0].banner).toBe('YOUR PRIEST CAN WRITE WIZARD SCROLLS!!');
  });

  it('is empty for an entry that has not been given one', () => {
    expect(sections[0].entries[1].banner).toBe('');
  });

  it('is not taken from a paragraph that happens to begin with one', () => {
    const [section] = parseDoc(['## S', '', '### E', '', '! NOT A BANNER, A PARAGRAPH', '', '! NOR THIS'].join('\n'));
    const entry = section.entries[0];
    expect(entry.banner).toBe('');
    expect(plainText(entry.blocks)).toBe('! NOT A BANNER, A PARAGRAPH ! NOR THIS');
  });

  it('is matched by the search box along with the title and the body', () => {
    expect(searchDoc(sections, 'wizard scrolls')[0].entries[0].title).toBe('The wand gate');
  });
});

describe('parseInline', () => {
  it('reads code, bold and links out of a run of text', () => {
    expect(parseInline('a `b` **c** [d](https://example.com/e) f')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'code', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'bold', text: 'c' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'd', target: { kind: 'url', href: 'https://example.com/e' } },
      { kind: 'text', text: ' f' },
    ]);
  });

  it('leaves markup written in an entry as text', () => {
    expect(parseInline('<script>alert(1)</script> & <b>bold</b>')).toEqual([
      { kind: 'text', text: '<script>alert(1)</script> & <b>bold</b>' },
    ]);
  });

  it('is not fooled by a marker that is only opened', () => {
    expect(parseInline('a ` b ** c [d](')).toEqual([{ kind: 'text', text: 'a ` b ** c [d](' }]);
  });
});

describe('linkTarget', () => {
  it('reads the three custom schemes', () => {
    expect(linkTarget('source:ts/magic.ts/writeScrollOrWand')).toEqual({
      kind: 'port',
      file: 'magic.ts',
      name: 'writeScrollOrWand',
    });
    expect(linkTarget('source:c/write_scroll_or_wand')).toEqual({ kind: 'decompiled', name: 'write_scroll_or_wand' });
    expect(linkTarget('formula:spell-cost')).toEqual({ kind: 'formula', id: 'spell-cost' });
  });

  it('takes a web address and nothing else', () => {
    expect(linkTarget('https://example.com/')).toEqual({ kind: 'url', href: 'https://example.com/' });
    expect(linkTarget('javascript:alert(1)')).toBe(null);
    expect(linkTarget('/etc/passwd')).toBe(null);
  });

  it('shows a link it cannot open as its own text', () => {
    expect(parseInline('read [this](javascript:alert)')).toEqual([
      { kind: 'text', text: 'read ' },
      { kind: 'text', text: 'this' },
    ]);
  });
});

describe('searchDoc', () => {
  it('keeps the entries whose title or text matches', () => {
    const found = searchDoc(sections, 'charges');
    expect(found.map((section) => section.title)).toEqual(['Exploits and shortcuts']);
    expect(found[0].entries.map((entry) => entry.title)).toEqual(['The wand gate']);
  });

  it('matches a title as well as the body', () => {
    expect(searchDoc(sections, 'MobyGames')[0].entries[0].title).toBe('The file called v');
    expect(searchDoc(sections, 'second')[0].entries[0].title).toBe('A second entry');
  });

  it('hands back everything for an empty query', () => {
    expect(searchDoc(sections, '  ')).toBe(sections);
  });
});
