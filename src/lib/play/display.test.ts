import { describe, expect, it } from 'vitest';
import { newGame } from '../game/port/state';
import type { MapSquare } from '../map/game';
import type { StockedMonster } from '../map/stocking';
import { facingArrowCells } from '../map/you';
import { zoomMapMonsters } from './mode';
import { newFrame, pixelAt, type Frame } from './view3d/frame';
import { FOUR_VIEWS } from './view3d/views';
import { ZOOM_MONSTER_COLOUR } from './zoom-monsters';
import {
  clearScreenRect,
  drawExpandedMap,
  drawScreenFurniture,
  drawZoomMapOnly,
  expandedMarkerRect,
  EXPANDED_CELL,
  EXPANDED_COLUMNS,
  EXPANDED_GROUND,
  EXPANDED_ROWS,
  FACING_ARROW_RECT,
  keyMenuLines,
  KEY_MENU_LINES,
  KEY_MENU_SPREAD_TO,
  KEY_MENU_X,
  MESSAGE_BAR_BOX,
  MESSAGE_BOX,
  SCREEN_BOXES,
  SCREEN_MODE,
  SCREEN_PIXELS,
  statusLines,
  VIDEO_MODES,
  ZOOM_CELL,
  ZOOM_COLUMNS,
  ZOOM_ROWS,
  zoomMapLeft,
  zoomBuildingColour,
  zoomMapWindow,
} from './display';
import {
  zoomMapSquare,
  ZOOM_CHUTE_COLOUR,
  ZOOM_CORNER_COLOUR,
  ZOOM_MARK_COLOUR,
  ZOOM_SIDE_COLOUR,
} from './zoom-map';
import { MW_VIDEO_MODES } from './mw/view3d/screen';

/** How much of the floor the map beside the views shows, which is what a cell is counted in. */
const SIDE_MAP = { columns: ZOOM_COLUMNS, rows: ZOOM_ROWS };


describe('the boxes on the screen', () => {
  it('keeps every one inside the screen', () => {
    for (const box of SCREEN_BOXES) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(1600);
      expect(box.bottom).toBeLessThanOrEqual(1200);
      expect(box.right).toBeGreaterThan(box.left);
      expect(box.bottom).toBeGreaterThan(box.top);
    }
  });

  it('never paints over one of the four views', () => {
    for (const box of SCREEN_BOXES) {
      for (const view of FOUR_VIEWS) {
        const rect = view.rect;
        const apart =
          box.right <= rect.left || rect.right <= box.left || box.bottom <= rect.top || rect.bottom <= box.top;
        expect(apart, `${view.name} runs under a box`).toBe(true);
      }
    }
  });

  it('overlaps only where the green bar meets the top of the message box', () => {
    const overlapping = SCREEN_BOXES.flatMap((a, i) =>
      SCREEN_BOXES.slice(i + 1).map((b) => ({ a, b })).filter(
        ({ a: one, b: two }) =>
          !(one.right <= two.left || two.right <= one.left || one.bottom <= two.top || two.bottom <= one.top),
      ),
    );
    expect(overlapping).toHaveLength(1);
    expect(overlapping[0]).toEqual({ a: MESSAGE_BAR_BOX, b: MESSAGE_BOX });
  });
});

describe('the key menu', () => {
  it('has the thirteen lines the game draws, and S) SECTION INFO under them', () => {
    expect(KEY_MENU_LINES).toHaveLength(13);
    const lines = keyMenuLines();
    expect(lines).toHaveLength(27);
    expect(lines[lines.length - 1].text).toBe('S) SECTION INFO');
  });

  it('reads as the words the game shows once the two passes are laid over each other', () => {
    // The passes are spread separately, and two of them are a shorter string over a wider
    // spread, so a key letter belongs to the body slot its middle is nearest.
    const middles = (text: string, spreadTo: number): number[] =>
      [...text].map((_, i) => KEY_MENU_X + ((spreadTo - KEY_MENU_X) * (i + 0.5)) / text.length);

    const merged = KEY_MENU_LINES.map((line) => {
      const slots = [...line.body];
      const bodyMiddles = middles(line.body, KEY_MENU_SPREAD_TO);
      const keyMiddles = middles(line.keys, line.keysSpreadTo ?? KEY_MENU_SPREAD_TO);
      [...line.keys].forEach((char, j) => {
        if (char === ' ') return;
        let nearest = 0;
        bodyMiddles.forEach((middle, i) => {
          if (Math.abs(middle - keyMiddles[j]) < Math.abs(bodyMiddles[nearest] - keyMiddles[j])) nearest = i;
        });
        expect(slots[nearest]).toBe(' ');
        slots[nearest] = char;
      });
      return slots.join('').trimEnd();
    });

    expect(merged.slice(0, 4)).toEqual(['1) PREP SPELLS', 'VIEW MONEY', 'VIEW STATS', 'CAST SPELL']);
    expect(merged[9]).toBe('ARMOR WEAPONS');
    expect(merged[merged.length - 1]).toBe('QUIT  USE ITEM');
  });

  it('draws the menu words in the .FNT face and the key letters in strokes', () => {
    const lines = keyMenuLines();
    const bitmap = lines.filter((line) => line.bitmapFace);
    expect(bitmap).toHaveLength(13);
    expect(bitmap[0].text).toBe(' ) PREP SPELLS');
    expect(lines.filter((line) => !line.bitmapFace)).toHaveLength(14);
  });

  /**
   * FUN_4000_667b makes two passes. The thirteen body lines are given the font index its own
   * variable holds, which is 2 on a screen this wide, with DS:4dec cleared around them. The
   * thirteen key letters and the line under them are given a literal 0 after DS:4dec is set
   * again. Handing the second pass a 2 as well draws it in the vector font's largest size, which
   * is what the key letters came out as before this was pinned.
   */
  it('gives the two passes the font index each of them is handed', () => {
    for (const line of keyMenuLines()) {
      expect(line.font).toBe(line.bitmapFace ? 2 : 0);
    }
  });

  it('draws the key letters in yellow and every line above the section box', () => {
    for (const line of keyMenuLines()) {
      expect(line.y).toBeLessThan(0x20f);
      expect(line.x).toBe(9);
    }
  });
});

describe('the status block', () => {
  const pc = () => newGame().pc;

  it('names the armor, the weapon and the six characteristics', () => {
    const texts = statusLines(pc()).map((line) => line.text);
    expect(texts.some((text) => text.startsWith('ARMOR:'))).toBe(true);
    expect(texts.some((text) => text.startsWith('WEAPON:'))).toBe(true);
    expect(texts).toContain('STR:20');
    // The one label the game gives no colon, which is why the block reads LUCK20.
    expect(texts).toContain('LUCK20');
  });

  it('shortens the level and experience labels from level nine on', () => {
    const character = pc();
    character.lev = 8;
    expect(statusLines(character).map((line) => line.text)).toContain('LEVEL: 8');
    character.lev = 9;
    expect(statusLines(character).map((line) => line.text)).toContain('L:9');
  });

  it('keeps every line inside the green box', () => {
    for (const line of statusLines(pc())) {
      expect(line.y).toBeGreaterThan(0x40e);
      expect(line.y).toBeLessThan(0x4ac);
    }
  });
});

describe('the video modes', () => {
  it('has the twelve the jump table dispatches on', () => {
    expect(VIDEO_MODES).toHaveLength(12);
    expect(VIDEO_MODES.map((mode) => mode.mode)).toEqual([...Array(12).keys()]);
  });

  it('is played in mode 9, the 1024 by 768 in 256 colours', () => {
    expect(SCREEN_MODE).toEqual({ mode: 9, width: 1024, height: 768, colours: 256 });
    expect(SCREEN_PIXELS).toEqual({ width: 1024, height: 768 });
  });

  it('offers the same twelve as Moraff\'s World, in the same order', () => {
    expect(VIDEO_MODES).toEqual(MW_VIDEO_MODES);
  });
});

describe('the boxes on a 1024 by 768 screen', () => {
  it('scales the same table a 640 by 480 screen uses', () => {
    const onScreen = (value: number) => Math.trunc(((SCREEN_PIXELS.width - 1) * value) / 0x63f);
    expect(onScreen(MESSAGE_BOX.left)).toBe(588);
    expect(onScreen(MESSAGE_BOX.right)).toBe(1023);
  });
});

describe('the black a screen is drawn on', () => {
  const filled = (rect: { x: number; y: number; right: number; bottom: number }): Frame => {
    const frame = newFrame(SCREEN_PIXELS.width, SCREEN_PIXELS.height);
    frame.pixels.fill(7);
    clearScreenRect(frame, rect);
    return frame;
  };

  it('blacks out the rectangle the game filled, scaled the way it fills one', () => {
    // cast_a_spell's own fill for the miniature spell table: the whole message column.
    const frame = filled({ x: 0x398, y: 0x2ff, right: 0x640, bottom: 0x4b0 });
    const left = Math.trunc(((SCREEN_PIXELS.width - 1) * 0x398) / 0x63f);
    const top = Math.trunc(((SCREEN_PIXELS.height - 1) * 0x2ff) / 0x4af);
    expect(pixelAt(frame, left, top)).toBe(0);
    expect(pixelAt(frame, SCREEN_PIXELS.width - 1, SCREEN_PIXELS.height - 1)).toBe(0);
    expect(pixelAt(frame, left - 1, top)).toBe(7);
    expect(pixelAt(frame, left, top - 1)).toBe(7);
  });
});

describe('the zoom map', () => {
  it('is nineteen squares across and thirty-three down, with the character in the middle', () => {
    expect(zoomMapSquare({ x: 40, y: 50 }, SIDE_MAP, ZOOM_COLUMNS >> 1, ZOOM_ROWS >> 1)).toEqual({ x: 40, y: 50 });
    expect(zoomMapSquare({ x: 40, y: 50 }, SIDE_MAP, 0, 0)).toEqual({ x: 31, y: 34 });
    expect(zoomMapSquare({ x: 40, y: 50 }, SIDE_MAP, ZOOM_COLUMNS - 1, ZOOM_ROWS - 1)).toEqual({ x: 49, y: 66 });
  });

  it('starts where the game puts it, whatever the screen is wide', () => {
    expect(zoomMapLeft(640)).toBe(521);
    expect(zoomMapLeft(1024)).toBe(834);
  });
});

describe("the arrow on the character's square", () => {
  const open = (): MapSquare => ({ n: 3, s: 3, w: 3, e: 3, solid: false, ladder: 0, chute: 0, trapdoor: -1 });

  /** Where the map's own drawing lit the arrow, as offsets from the rectangle the tab lays its
   *  own canvas over. A pixel either side of that rectangle is looked at as well, so an arrow
   *  that has slipped by one shows up as a pixel the rectangle does not hold. */
  function litPixels(dir: number): string[] {
    const rows: MapSquare[][] = Array.from({ length: 80 }, () => Array.from({ length: 80 }, open));
    const frame = newFrame(SCREEN_PIXELS.width, SCREEN_PIXELS.height);
    drawZoomMapOnly(frame, {
      rows,
      at: { x: 40, y: 50, dir },
      map: { known: () => true, knownOnArrival: () => true },
    });
    const lit: string[] = [];
    for (let dy = -1; dy <= FACING_ARROW_RECT.size; dy++) {
      for (let dx = -1; dx <= FACING_ARROW_RECT.size; dx++) {
        const pixel = pixelAt(frame, FACING_ARROW_RECT.x + dx, FACING_ARROW_RECT.y + dy);
        if (pixel === ZOOM_SIDE_COLOUR) lit.push(`${dx},${dy}`);
      }
    }
    return lit.sort();
  }

  it.each([0, 1, 2, 3])('fills the rectangle the flashing canvas covers, facing %i', (dir) => {
    const cells = facingArrowCells(dir).map((cell) => `${cell.x},${cell.y}`);
    expect(litPixels(dir)).toEqual(cells.sort());
  });

  /**
   * The arrow reaches every pixel of its square but the first, which is the size FUN_2000_9d17
   * draws it at when a square is ten pixels across. Drawing one of the routine's other three
   * bitmaps here would leave a margin of the square's own colour, which is loud on a town
   * building square and is what this holds the size against.
   */
  it('spans all but the first pixel of the square it stands on', () => {
    expect(FACING_ARROW_RECT.size).toBe(ZOOM_CELL - 1);
    const cell = FACING_ARROW_RECT.x - zoomMapLeft(SCREEN_PIXELS.width) - (ZOOM_COLUMNS >> 1) * ZOOM_CELL;
    expect(cell).toBe(1);
    for (const dir of [0, 1, 2, 3]) {
      const along = facingArrowCells(dir).flatMap((at) => [at.x, at.y]);
      expect(Math.min(...along)).toBe(0);
      expect(Math.max(...along)).toBe(FACING_ARROW_RECT.size - 1);
    }
  });
});

describe('what the zoom map draws on one square', () => {
  const open = (): MapSquare => ({ n: 3, s: 3, w: 3, e: 3, solid: false, ladder: 0, chute: 0, trapdoor: -1 });
  const at = { x: 40, y: 50, dir: 0 };
  /** A cell well clear of the character's own, which the arrow would otherwise draw over. */
  const COLUMN = 3;
  const ROW = 3;
  const marked = { x: at.x + COLUMN - (ZOOM_COLUMNS >> 1), y: at.y + ROW - (ZOOM_ROWS >> 1) };
  const x0 = zoomMapLeft(SCREEN_PIXELS.width) + COLUMN * ZOOM_CELL;
  const y0 = ROW * ZOOM_CELL;

  /**
   * The map of a floor of open squares with one square given what the test is about. Only the
   * cells of the map are drawn, since that is all these tests read: the four views and the boxes
   * around them are the slow half of a screen and none of them reaches the map's own corner.
   */
  function drawn(square: Partial<MapSquare>, chuteKnown = true): Frame {
    const rows: MapSquare[][] = Array.from({ length: 80 }, () => Array.from({ length: 80 }, open));
    Object.assign(rows[marked.y][marked.x], square);
    const frame = newFrame(SCREEN_PIXELS.width, SCREEN_PIXELS.height);
    drawZoomMapOnly(frame, { rows, at, map: { known: () => true, knownOnArrival: () => chuteKnown } });
    return frame;
  }

  /** One pixel of that square's own cell, by how far it is from the cell's top left corner. */
  const dot = (frame: Frame, dx: number, dy: number): number => pixelAt(frame, x0 + dx, y0 + dy);

  /**
   * Where two drawings of the map differ, which is nowhere when they are the same picture. A
   * plain loop rather than a deep compare of the two pixel arrays: those are three quarters of a
   * million entries each, and comparing them that way takes seconds.
   */
  function differences(left: Frame, right: Frame): number[] {
    const at: number[] = [];
    for (let pixel = 0; pixel < left.pixels.length && at.length < 5; pixel++) {
      if (left.pixels[pixel] !== right.pixels[pixel]) at.push(pixel);
    }
    return at;
  }

  /** Two points, one on each diagonal and on neither of the other's two passes. */
  const DOWN_STROKE = [2, 2] as const;
  const UP_STROKE = [2, 8] as const;
  const strokes = (frame: Frame): number[] => [dot(frame, ...DOWN_STROKE), dot(frame, ...UP_STROKE)];

  it('fills a plain square black and dots its four corners red', () => {
    const frame = drawn({});
    expect(dot(frame, 5, 5)).toBe(0);
    expect([dot(frame, 0, 0), dot(frame, ZOOM_CELL, 0), dot(frame, 0, ZOOM_CELL), dot(frame, ZOOM_CELL, ZOOM_CELL)])
      .toEqual([ZOOM_CORNER_COLOUR, ZOOM_CORNER_COLOUR, ZOOM_CORNER_COLOUR, ZOOM_CORNER_COLOUR]);
  });

  it('lines every side but an open one, so a secret door and a teleporter are walls to look at', () => {
    expect(dot(drawn({ w: 3 }), 0, 5)).toBe(0);
    for (const side of [0, 1, 2, 4]) expect(dot(drawn({ w: side }), 0, 5)).toBe(ZOOM_SIDE_COLOUR);
    expect(differences(drawn({ w: 2 }), drawn({ w: 0 }))).toEqual([]);
    expect(differences(drawn({ w: 4 }), drawn({ w: 0 }))).toEqual([]);
  });

  it('ticks a door in a side running down the cell, with a short line under the long pair', () => {
    const frame = drawn({ w: 1 });
    expect([dot(frame, -3, 4), dot(frame, 3, 4)]).toEqual([ZOOM_SIDE_COLOUR, ZOOM_SIDE_COLOUR]);
    expect([dot(frame, -3, 6), dot(frame, 3, 6)]).toEqual([ZOOM_SIDE_COLOUR, ZOOM_SIDE_COLOUR]);
    expect([dot(frame, -1, 5), dot(frame, 1, 5)]).toEqual([ZOOM_SIDE_COLOUR, ZOOM_SIDE_COLOUR]);
  });

  it('ticks a door in a side running along the cell with the long pair alone', () => {
    const frame = drawn({ n: 1 });
    expect([dot(frame, 4, -3), dot(frame, 6, 3)]).toEqual([ZOOM_SIDE_COLOUR, ZOOM_SIDE_COLOUR]);
    // The short tick the other half of the routine always draws is this half's small-cell case.
    expect(dot(frame, 5, -1)).toBe(0);
  });

  it('draws a ladder down as one diagonal and a ladder up as the other', () => {
    expect(strokes(drawn({ ladder: 1 }))).toEqual([ZOOM_MARK_COLOUR, 0]);
    expect(strokes(drawn({ ladder: -1 }))).toEqual([0, ZOOM_MARK_COLOUR]);
  });

  it('crosses a trap door with both of them', () => {
    expect(strokes(drawn({ trapdoor: 25 }))).toEqual([ZOOM_MARK_COLOUR, ZOOM_MARK_COLOUR]);
  });

  it('draws a chute as the cross with a plus sign through it, in pale blue', () => {
    const frame = drawn({ chute: 4 });
    expect(strokes(frame)).toEqual([ZOOM_CHUTE_COLOUR, ZOOM_CHUTE_COLOUR]);
    expect([dot(frame, 5, 1), dot(frame, 1, 5)]).toEqual([ZOOM_CHUTE_COLOUR, ZOOM_CHUTE_COLOUR]);
  });

  it('marks no chute on a square that was not known on arrival', () => {
    expect(differences(drawn({ chute: 4 }, false), drawn({}))).toEqual([]);
  });

  it('colours a building in and says nothing else about it', () => {
    const fills = [1, 2, 3, 4].map((building) => dot(drawn({ town: building }), 8, 5));
    expect(fills).toEqual([3, 4, 5, 8]);
    expect(fills).toEqual([1, 2, 3, 4].map(zoomBuildingColour));
    // The inn's own colour is neither of the two a mark is drawn in, so the points a diagonal
    // would cross read the fill and nothing else.
    expect(strokes(drawn({ town: 4 }))).toEqual([zoomBuildingColour(4), zoomBuildingColour(4)]);
  });

  it('leaves a square with a ladder on it uncoloured, the way the game asks in that order', () => {
    expect(differences(drawn({ ladder: -1, town: 1 }), drawn({ ladder: -1 }))).toEqual([]);
  });
});


/** A floor every square of which the character knows, which is the two revealed modes. */
const REVEALED = { known: () => true, knownOnArrival: () => true };

describe('the monsters debug mode marks on the zoom map', () => {
  /** A floor of open squares, big enough for the whole window of the map. */
  const open = (): MapSquare => ({ n: 3, s: 3, w: 3, e: 3, solid: false, ladder: 0, chute: 0, trapdoor: -1 });
  const rows: MapSquare[][] = Array.from({ length: 80 }, () => Array.from({ length: 80 }, open));
  const at = { x: 40, y: 50, dir: 0 };

  /** Two monsters standing where the character cannot see them: neither is in any of the four
   *  views, so faithful draws neither and only the map's own mark would show them. */
  const outOfSight: StockedMonster[] = [
    { slot: 0, x: 43, y: 47, monsterId: '1', level: 3, hp: 20 },
    { slot: 1, x: 38, y: 54, monsterId: '1', level: 4, hp: 25 },
  ];

  /** The colour in the middle of each monster's cell, after a screen drawn in that mode. */
  function marks(mode: 'faithful' | 'speedrun' | 'debug'): number[] {
    const frame = newFrame(SCREEN_PIXELS.width, SCREEN_PIXELS.height);
    drawScreenFurniture(frame, {
      rows,
      at,
      map: REVEALED,
      monsters: zoomMapMonsters(mode, { monsters: outOfSight }),
    });
    const map = zoomMapWindow(frame.width);
    return outOfSight.map((monster) => {
      const column = monster.x - at.x + (ZOOM_COLUMNS >> 1);
      const row = monster.y - at.y + (ZOOM_ROWS >> 1);
      return pixelAt(frame, map.left + column * ZOOM_CELL + 3, row * ZOOM_CELL + 3);
    });
  }

  it('marks both of them in debug', () => {
    expect(marks('debug')).toEqual([ZOOM_MONSTER_COLOUR, ZOOM_MONSTER_COLOUR]);
  });

  it('marks neither in faithful, where the map is the one the game draws', () => {
    // The square itself is drawn, in the black the game fills a known square with.
    expect(marks('faithful')).toEqual([0, 0]);
    expect(marks('speedrun')).toEqual([0, 0]);
  });
});


describe('the map the X key fills the screen with', () => {
  const open = (): MapSquare => ({ n: 3, s: 3, w: 3, e: 3, solid: false, ladder: 0, chute: 0, trapdoor: -1 });
  const at = { x: 12, y: 20, dir: 0 };

  function drawn(): Frame {
    const rows: MapSquare[][] = Array.from({ length: EXPANDED_ROWS }, () =>
      Array.from({ length: EXPANDED_COLUMNS }, open),
    );
    const frame = newFrame(SCREEN_PIXELS.width, SCREEN_PIXELS.height);
    drawExpandedMap(frame, { rows, at, map: { known: () => true, knownOnArrival: () => true } });
    return frame;
  }

  it('shows the whole floor from the screen\'s own corner, at seven pixels a square', () => {
    const frame = drawn();
    // The first square of the floor is drawn in the first cell: the branch centres the window on
    // column 40 and row 55 and the window is the floor's own eighty by a hundred and ten.
    expect(pixelAt(frame, 0, 0)).toBe(ZOOM_CORNER_COLOUR);
    expect(pixelAt(frame, EXPANDED_CELL, 0)).toBe(ZOOM_CORNER_COLOUR);
    expect(pixelAt(frame, 3, 3)).toBe(0);
  });

  it('fills the screen the map does not reach with the ground it is drawn on', () => {
    const frame = drawn();
    expect(pixelAt(frame, EXPANDED_COLUMNS * EXPANDED_CELL + 20, 400)).toBe(EXPANDED_GROUND);
  });

  it("marks the character's own square, which is what the original flashes there", () => {
    const frame = drawn();
    expect(pixelAt(frame, at.x * EXPANDED_CELL + 3, at.y * EXPANDED_CELL + 3)).toBe(15);
    // The square next door is a plain black one, so the mark is one square and not a smear.
    expect(pixelAt(frame, (at.x + 1) * EXPANDED_CELL + 3, at.y * EXPANDED_CELL + 3)).toBe(0);
  });

  it('gives the flickering square the pixels FUN_2000_a068 fills and no others', () => {
    const rect = expandedMarkerRect(at);
    expect(rect).toEqual({ x: at.x * EXPANDED_CELL + 2, y: at.y * EXPANDED_CELL + 2, size: EXPANDED_CELL - 1 });
    // Its far corner is the first pixel of the next square along, which is where the fill stops.
    expect(rect.x + rect.size - 1).toBe((at.x + 1) * EXPANDED_CELL);
    expect(rect.y + rect.size - 1).toBe((at.y + 1) * EXPANDED_CELL);
  });
});
