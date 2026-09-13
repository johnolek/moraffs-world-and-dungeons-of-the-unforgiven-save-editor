/**
 * Cutting a Ghidra decompilation into one section per function.
 *
 * `dotu-tools/decomp/unf.c` and `mw-tools/decomp/mw.c` are a megabyte apiece of C with a header
 * line above every function:
 *
 *     // ==== sleep_monster @ 3000:d904 (size 288) callers: spell_effect  // the Sleep spell
 *
 * The header carries the name the reverse engineering gave the function, where it sits in the
 * executable, how many bytes of machine code it was, what calls it, and sometimes a note.
 *
 * Nothing here reads a file: callers hand in the text. That keeps this usable from the Source
 * tab, which bundles the two decompilations with Vite, and from a Node script, which reads them
 * off the disk.
 */

/** One function of the decompilation, header facts and code. */
export interface DecompSection {
  /** `sleep_monster`, or `FUN_3000_d904` where the reverse engineering never named it. */
  name: string;
  /** Segment and offset in the unpacked executable, as `3000:d904`. */
  address: string;
  /** How many bytes of machine code the function was. */
  size: number;
  /** The functions that call it, in the order the header lists them. */
  callers: string[];
  /** The note after the callers, or null where the header carries none. */
  description: string | null;
  /** The C the header sits above, with the blank lines around it trimmed off. */
  body: string;
}

const HEADER = /^\/\/ ==== (\S+) @ ([0-9a-f]{4}:[0-9a-f]+) \(size (\d+)\) callers:(.*)$/;

/** Strips the blank lines from both ends of a run of lines. */
function trimBlank(lines: string[]): string[] {
  let first = 0;
  let last = lines.length;
  while (first < last && lines[first].trim() === '') first++;
  while (last > first && lines[last - 1].trim() === '') last--;
  return lines.slice(first, last);
}

/** The callers and the note out of everything the header puts after `callers:`. */
function splitCallers(rest: string): { callers: string[]; description: string | null } {
  const note = rest.indexOf('//');
  const names = note < 0 ? rest : rest.slice(0, note);
  const description = note < 0 ? null : rest.slice(note + 2).trim() || null;
  return { callers: names.split(',').map((name) => name.trim()).filter(Boolean), description };
}

/** Every function in a decompilation, in the order the file lists them. */
export function parseSections(source: string): DecompSection[] {
  const lines = source.split('\n');
  const sections: DecompSection[] = [];
  let open: { header: RegExpMatchArray; from: number } | null = null;
  const close = (to: number) => {
    if (!open) return;
    const [, name, address, size, rest] = open.header;
    const { callers, description } = splitCallers(rest);
    sections.push({
      name,
      address,
      size: Number(size),
      callers,
      description,
      body: trimBlank(lines.slice(open.from, to)).join('\n'),
    });
  };
  for (const [index, line] of lines.entries()) {
    const header = HEADER.exec(line);
    if (!header) continue;
    close(index);
    open = { header, from: index + 1 };
  }
  close(lines.length);
  return sections;
}
