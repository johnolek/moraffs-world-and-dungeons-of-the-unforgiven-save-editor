/**
 * Which of the four wall files each of the twenty sections is drawn from: the name table at
 * DS:02ef that load_section_pictures (exe 2000:372c, unf.c "load_section_pictures") indexes with
 * the section number, read out of the unpacked executable. The entry for section 1 doubles as
 * the file the game falls back on when a section's own is missing.
 */
export const WALL_FILES = [1, 2, 3, 4, 2, 3, 1, 4, 1, 2, 3, 1, 2, 1, 3, 2, 3, 2, 1, 4];

/** The wall picture file a section is drawn with, by section 1..20. */
export function wallPictureFile(section: number): string {
  return `ufwall${WALL_FILES[section - 1] ?? 1}.pic`;
}

/** The two `.PIC` files load_section_pictures reads when the character enters a section. */
export interface SectionPictures {
  /** The ten images its corridors are drawn from. */
  wall: string;
  /** The pictures of its own five monsters. */
  monsters: string;
}

/** The pictures a section is drawn from, by section 1..20. */
export function sectionPictures(section: number): SectionPictures {
  return { wall: wallPictureFile(section), monsters: `ufmon${section}.pic` };
}
