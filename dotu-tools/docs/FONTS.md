# The .FNT bitmap fonts

Three font files ship with the game; `reference/extract_fnt.py` decodes them into
`data/dotu-fonts.json`.

Each file holds **three** sizes back to back, not one, and the video mode picks both the
file (`load_font`, exe 4000:0abf) and the row of glyph boxes to read it with
(`FUN_4000_095b`, exe 4000:095b, out of the tables at DS:4d22 and DS:4d5e).

`FUN_2000_1c5b` (exe 2000:1c5b) picks the file by video mode: modes 0 and 5 read `ehout.fnt`,
mode 4 reads `360X480.fnt`, mode 7 reads none, and every other mode — 1024 × 768 among them —
reads `320x200.fnt`. Mode 6 asks for `800X600.fnt`, which does not ship with the game.

| file | the three glyph boxes |
|---|---|
| `320x200.fnt` | 4×6, 6×8, 10×14 |
| `360x480.fnt` | 5×14, 7×19, 11×34 |
| `ehout.fnt` | 8×11, 12×14, 20×25 |

Format: no header, just glyphs back to back, 46 glyphs per size. Each glyph is `height`
little-endian 16-bit words, one word per pixel row, and the last row or two of a box are
usually blank. Bit 0 of a word is the leftmost pixel, so a row reads left to right from the
least significant bit; the game leaves bit 0 clear as a one-pixel left margin. A handful of
glyphs use more than 8 bits. The three sizes' lengths add up to the file exactly, which is
how the layout was confirmed: 46 × (6 + 8 + 14) × 2 = 2576 bytes for `320x200.fnt`.

Glyph order is the same in all three files and in all three sizes, and is what the table at
DS:4d7d maps a character to: `-` first, then `A`..`Z`, `0`..`9`, then `, . ? ! ( ) ' $ :`.

That second to last glyph is a dollar sign, though it takes drawing out to see: it is the
font's own capital `S` with column 4 lit on all ten rows, and a full-height vertical stroke
through an S is what a dollar sign is. Which character the table at DS:4d7d actually sends
there is still unknown — `unf.exe` on disk is packed, so the table's bytes are not in the file
and a scan for them finds nothing — but no string in the decompilation or in the game's own
text files holds either a dollar sign or an ampersand, so the game never draws this glyph.
There are no lowercase letters and nothing past the colon; `pfont` uppercases what it is
given. A character with no glyph maps to index 0 and comes out as `-`.

`dotu-fonts.json`: `{ small | tall | bold | small_spells | menu: { source, height, advance,
glyphs: { char: [row words] } } }`, where `advance` is the pixel step between characters that
reproduces the game's spacing. `small`, `tall` and `bold` are the first size of each file with
the box's last row dropped; they are what the site's headings are drawn in.

`small_spells` and `menu` are `320x200.fnt`'s **second** and **third** sizes, whole rather than
trimmed, and they are the two faces the game itself still draws at 1024 × 768. Which one a line
gets is the font index `pfont` and `psfont` are handed, since `FUN_4000_095b` fills all three
indices from one row of the tables above and row 0 is this file's three sizes.

Only two places clear DS:4dec, and between them they ask for both. `FUN_4000_667b` draws the key
menu down the left of the play screen in font 2 — SCREEN.md has that one. `cast_a_spell`'s
condensed spell menu draws its heading and its ten rows of spell names in font 1, which is
`small_spells` and is drawn nowhere else, and the thirty key letters over them in font 2. No
line anywhere is drawn as a glyph in font 0.
