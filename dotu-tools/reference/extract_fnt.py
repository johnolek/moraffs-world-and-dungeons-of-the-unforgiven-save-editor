#!/usr/bin/env python3
"""Decode the Dungeons of the Unforgiven .FNT bitmap fonts into data/dotu-fonts.json.

Format (see docs/FONTS.md): a flat run of glyphs, each `rows + 1` little-endian 16-bit
words (the last word is a blank separator row).  Bit 0 of a word is the leftmost pixel.
Glyph order: '-', 'A'..'Z', '0'..'9', then , . ? ! ( ) ' & : = / and the lowercase
letters; only the first 48 are exported.

    python3 reference/extract_fnt.py "/path/to/game folder"
"""
import json
import struct
import sys
from pathlib import Path

# name: (file, rows per glyph, advance in pixels, glyphs skipped before the first)
# Each file's three glyph boxes in rows, out of the tables the video mode indexes at DS:4d22 and
# DS:4d5e.  A file is those three sizes back to back, 46 glyphs each, with no header.
BOXES = {"320x200.fnt": [6, 8, 14], "360x480.fnt": [14, 19, 34], "ehout.fnt": [11, 14, 25]}

# name: (file, which of the file's three sizes, rows exported, advance in pixels)
FONTS = {
    "small": ("320x200.fnt", 0, 5, 4),
    "tall": ("360x480.fnt", 0, 13, 6),
    "bold": ("ehout.fnt", 0, 10, 8),
    # The two sizes the game still draws as glyphs above 730 pixels across, where every other
    # line goes to the vector font.  DS:4dec is cleared in exactly two places, and between them
    # they ask for these: cast_a_spell's condensed spell menu passes font 1 for its heading and
    # its rows of spell names, and font 2 for the thirty key letters over them; FUN_4000_667b,
    # the key menu down the left of the play screen, passes font 2 for its thirteen lines.  No
    # line anywhere is drawn as a glyph in font 0.
    "small_spells": ("320x200.fnt", 1, 8, 6),
    "menu": ("320x200.fnt", 2, 14, 10),
}

# Glyph order, which is the same in all three files and is what DS:4d7d maps a character to.
#
# The second to last glyph is a dollar sign, not the ampersand this once said: drawn out it is
# the font's own capital S with column 4 lit on all ten rows, and a full-height vertical stroke
# is what a dollar sign is. Which character the game's table sends to that slot is a separate
# question and an open one, because unf.exe on disk is packed and the table's bytes are not in
# the file. It makes no difference to what the glyph looks like, and no string anywhere in the
# game or its text files holds either character, so the game never draws this one at all.
ORDER = "-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789,.?!()'$:"
GLYPHS = len(ORDER)


def decode(path: Path, size_index: int, rows: int) -> dict[str, list[int]]:
    boxes = BOXES[path.name]
    words = struct.unpack("<%dH" % (path.stat().st_size // 2), path.read_bytes())
    box = boxes[size_index]
    first = sum(boxes[:size_index]) * GLYPHS
    glyphs = {char: [words[first + index * box + r] for r in range(rows)] for index, char in enumerate(ORDER)}
    glyphs[" "] = [0] * rows
    return glyphs


def main() -> None:
    game = Path(sys.argv[1])
    out = {}
    for name, (file, size_index, rows, advance) in FONTS.items():
        glyphs = decode(game / file, size_index, rows)
        out[name] = {"source": file, "height": rows, "advance": advance, "glyphs": glyphs}
        widest = max(v.bit_length() for g in glyphs.values() for v in g)
        print(f"{name}: {file} {rows} rows, widest glyph {widest} px, advance {advance}")
    target = Path(__file__).resolve().parent.parent / "data" / "dotu-fonts.json"
    target.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print("wrote", target)


if __name__ == "__main__":
    main()
