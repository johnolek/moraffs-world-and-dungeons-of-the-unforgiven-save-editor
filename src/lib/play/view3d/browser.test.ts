import { describe, expect, it } from 'vitest';
import { sectionPictures } from '../../game/port/pictures';
import { viewPictures } from './browser';

/** The picture number of the first of a section's own monsters; a built-in monster's numbers
 *  count from 0 instead. */
const FIRST_SECTION_PICTURE = 7;

describe('the pictures a section is drawn with', () => {
  const drawn = viewPictures(sectionPictures(3));

  it('takes a monster of its own out of its own file', () => {
    expect(drawn.monster(FIRST_SECTION_PICTURE, false)).toEqual(
      viewPictures(sectionPictures(3)).monster(FIRST_SECTION_PICTURE, false),
    );
  });

  it("takes a monster borrowed from another section out of that section's file", () => {
    const borrowed = viewPictures(sectionPictures(12)).monster(FIRST_SECTION_PICTURE, false);
    expect(drawn.monster(FIRST_SECTION_PICTURE, false, 12)).toEqual(borrowed);
    expect(drawn.monster(FIRST_SECTION_PICTURE, false)).not.toEqual(borrowed);
  });

  it('takes a built-in monster out of ufmon.pic whichever section is named', () => {
    expect(drawn.monster(0, true, 12)).toEqual(drawn.monster(0, true));
    expect(drawn.monster(0, true)).not.toBeNull();
  });
});
