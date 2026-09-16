import { describe, expect, it } from 'vitest';
import { readRecolouredId } from '../../bestiary/monsters';
import { UNFORGIVEN_MAP, type MapSquare } from '../../map/game';
import { monsterById, MONSTER_SLOTS } from '../../map/stocking';
import { drawBossOffice } from '../../play/boss-office';
import { SCREEN_PIXELS } from '../../play/display';
import { BOSS_KIND, drawnMonsters, FloorMonsters, loadLevelMap } from '../../play/floor';
import { manualOpening, manualPages } from '../../play/manual';
import { drawSectionScreen, sectionMonsterRecords } from '../../play/section-screen';
import { explainTrapdoor } from '../../play/trapdoor';
import { viewMonsters } from '../../play/view-scene';
import { viewPictures } from '../../play/view3d/browser';
import { newFrame, pixelAt, type Frame } from '../../play/view3d/frame';
import type { PicRowImage } from '../../play/view3d/texture';
import data from '../dotu-data.json';
import { bundledDungeon } from '../dungeon';
import { expValue, strike } from '../port/combat';
import { drainerBonus } from '../port/kills';
import { FAITHFUL_RULES } from '../port/rules';
import { BorlandRng } from '../port/rng';
import { monsterAt, newGame, type Game } from '../port/state';
import { endlessRules } from './rules';

/**
 * A floor a hundred below the deepest the game itself has, played by the rules of one endless
 * world: the map generates it, the ways off it lead deeper, and the stocking fills it with the
 * five monsters that section drew.
 */
const SEED = 20260915;
const MODULE_V = 4;
const FLOOR = 120;
/** A floor deep enough that the game's own key odds would never hand out a key for it. */
const DEEP_FLOOR = 300;
/** A floor deep enough that the stocking rolls monsters past both of the limits the game's own
 *  six-byte monster record puts on them. */
const VERY_DEEP_FLOOR = 4000;
/** A monster deeper than either of those limits: a level past the byte the game keeps one in,
 *  and hit points past the 32,000 it tops a roll off at. */
const DEEP_MONSTER_LEVEL = 300;
const DEEP_MONSTER_HP = 60000;
/** What the game's own jitter counts a level round. */
const MONSTER_LEVEL_BYTE = 256;
/** A floor deep enough that nearly the whole dungeon is above it. */
const FAR_FLOOR = 5000;
const FAITHFUL_BOTTOM = 105;
/** The furthest below the character one of its trap doors may lead. */
const TRAP_DOOR_DROP = 100;
/** The deepest floor the record's own key flags reach. */
const DEEPEST_RECORD_KEY = 179;
/** The fewest and the most trap doors one floor of Module V has as the game itself generates it,
 *  counted over all 105 of them. */
const FEWEST_FAITHFUL_DOORS = 10;
const MOST_FAITHFUL_DOORS = 35;

const rules = endlessRules({ hard: true, seed: SEED });
const bottom = rules.bottomLevel(MODULE_V);

const floorRows = (level: number): MapSquare[][] =>
  UNFORGIVEN_MAP.floor(level, MODULE_V, bottom, rules.trapdoorReach(MODULE_V, level));

/** A game standing on an open square of the floor, the way one arrives on it. */
function gameOn(level: number): Game {
  const game = newGame({
    rules,
    rng: new BorlandRng(7),
    pc: { level, module: MODULE_V, hard: 1, x: 40, y: 50 },
    solid: (x, y, floor, dungeon) => bundledDungeon.solid(x, y, floor, dungeon),
    retdwall: (x, y, hv, floor, dungeon) => bundledDungeon.side(x, y, hv as 0 | 1, floor, dungeon),
  });
  const rows = floorRows(level);
  while (rows[game.pc.y][game.pc.x].solid) game.pc.x += 1;
  return game;
}

describe('a floor below the bottom of the game', () => {
  const squares = floorRows(FLOOR).flat();

  it('has ladders leading down off it, where the game itself offers none', () => {
    expect(squares.some((square) => square.ladder > 0)).toBe(true);
    expect(bundledDungeon.floor(FLOOR, MODULE_V).flat().some((square) => square.ladder > 0)).toBe(false);
  });

  it('has trap doors leading below the floor the game bottoms out at', () => {
    expect(squares.some((square) => square.trapdoor > FAITHFUL_BOTTOM)).toBe(true);
  });

  it('has chutes, which the game will not drop anybody down this deep', () => {
    expect(squares.some((square) => square.chute !== 0)).toBe(true);
    expect(bundledDungeon.floor(FLOOR, MODULE_V).flat().some((square) => square.chute !== 0)).toBe(false);
  });
});

describe('the trap doors of a floor below the bottom of the game', () => {
  const doorsOn = (level: number): number[] =>
    floorRows(level)
      .flat()
      .map((square) => square.trapdoor)
      .filter((destination) => destination >= 0);

  it.each([FLOOR, DEEP_FLOOR, FAR_FLOOR])('are as few on floor %i as on a floor the game has itself', (level) => {
    expect(doorsOn(level).length).toBeGreaterThanOrEqual(FEWEST_FAITHFUL_DOORS);
    expect(doorsOn(level).length).toBeLessThanOrEqual(MOST_FAITHFUL_DOORS);
  });

  it.each([FLOOR, DEEP_FLOOR, FAR_FLOOR])('lead off floor %i to any floor above and a hundred below', (level) => {
    for (const destination of doorsOn(level)) {
      expect(destination % 5, `door to ${destination}`).toBe(0);
      expect(destination, `door to ${destination}`).toBeGreaterThanOrEqual(5);
      expect(destination, `door to ${destination}`).toBeLessThanOrEqual(level + TRAP_DOOR_DROP);
      expect(Math.trunc(destination / 5), `door to ${destination}`).not.toBe(Math.trunc(level / 5));
    }
  });

  it('leads some of them up from the floor and some of them further down', () => {
    expect(doorsOn(FLOOR).some((destination) => destination < FLOOR)).toBe(true);
    expect(doorsOn(FLOOR).some((destination) => destination > FLOOR)).toBe(true);
  });

  it('leads one off a floor far down back above the floors the game itself has', () => {
    expect(doorsOn(FAR_FLOOR).some((destination) => destination < FAITHFUL_BOTTOM)).toBe(true);
  });

  it('leaves a floor of a module the endless world has nothing to do with alone', () => {
    const MODULE_I = 0;
    const level = 20;
    expect(
      UNFORGIVEN_MAP.floor(level, MODULE_I, rules.bottomLevel(MODULE_I), rules.trapdoorReach(MODULE_I, level)),
    ).toEqual(bundledDungeon.floor(level, MODULE_I));
  });
});

describe('arriving on a floor below the bottom of the game', () => {
  it('loads the 27 rows the rules keep for the section', () => {
    const game = gameOn(FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(FLOOR), FLOOR, game.rng);
    const section = rules.sectionOf(MODULE_V, FLOOR);
    expect(section).toBe(21);
    expect(game.monsterKinds).toEqual(rules.monsterKinds(section));
    expect(game.monsterKinds).toHaveLength(27);
  });

  it('fills all 145 slots and puts each one on the occupancy grid', () => {
    const game = gameOn(FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(FLOOR), FLOOR, game.rng);
    expect(game.monsters).toHaveLength(MONSTER_SLOTS);
    for (let slot = 0; slot < MONSTER_SLOTS; slot += 1) {
      const monster = game.monsters[slot];
      expect(monster.hp, `slot ${slot}`).toBeGreaterThan(0);
      expect(monsterAt(game, monster.x, monster.y), `slot ${slot}`).toBe(slot);
    }
  });

  it("stocks nothing but the monsters the section has loaded, all of them the bestiary's", () => {
    const game = gameOn(FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(FLOOR), FLOOR, game.rng);
    const loaded = new Set(rules.monsterKinds(rules.sectionOf(MODULE_V, FLOOR)).map((kind) => kind.id));
    const drawn = drawnMonsters(game);
    expect(drawn.length).toBeGreaterThan(0);
    for (const monster of drawn) {
      expect(loaded.has(monster.monsterId), monster.monsterId).toBe(true);
      expect(() => monsterById(monster.monsterId), monster.monsterId).not.toThrow();
    }
  });

  it('has a picture for every monster standing on it', () => {
    const game = gameOn(FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(FLOOR), FLOOR, game.rng);
    const section = rules.sectionOf(MODULE_V, FLOOR);
    const pictures = viewPictures(rules.pictureFiles(section));
    const drawn = viewMonsters(drawnMonsters(game));
    expect(drawn.length).toBeGreaterThan(0);
    for (const monster of drawn) {
      const where = `picture ${monster.picnum} of section ${monster.section}`;
      expect(pictures.monster(monster.picnum, monster.builtin, monster.section), where).not.toBeNull();
    }
    expect(drawn.some((monster) => monster.section !== null && monster.section !== rules.sectionSource(section))).toBe(
      true,
    );
  });

  it('stands monsters gathered from more than the one section it is drawn as', () => {
    const five = rules.monsterKinds(rules.sectionOf(MODULE_V, FLOOR)).slice(BOSS_KIND);
    const came = five.map((kind) => monsterById(kind.id).origin).map((origin) => (origin.kind === 'section' ? origin.section : 0));
    expect(new Set(came).size).toBeGreaterThan(1);
  });

  it('rolls its monsters around the level the floor is deep rather than back round to 1', () => {
    const game = gameOn(FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(FLOOR), FLOOR, game.rng);
    expect(rules.monsterLevel(MODULE_V, FLOOR)).toBe(FLOOR + 60);
    expect(game.monsters.some((monster) => monster.level > 130)).toBe(true);
  });
});

describe('a monster of a floor below the bottom of the game', () => {
  /** Monster kind 23 is one of the section's ordinary monsters, as the loaded table holds it. */
  const REGULAR_KIND = 23;

  it("is stocked past both the limits the game's own six bytes put on it", () => {
    const game = gameOn(VERY_DEEP_FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(VERY_DEEP_FLOOR), VERY_DEEP_FLOOR, game.rng);
    expect(game.monsters.some((monster) => monster.level > MONSTER_LEVEL_BYTE)).toBe(true);
    expect(game.monsters.some((monster) => monster.hp > FAITHFUL_RULES.monsterHpMax)).toBe(true);
  });

  it('carries both numbers through a swing at it', () => {
    const game = gameOn(FLOOR);
    // A character big enough to land a blow on something this deep, which is what it takes for
    // the hit points to move at all.
    Object.assign(game.pc, { lev: 500, str: 300 });
    const monster = game.monsters[0];
    Object.assign(monster, { type: REGULAR_KIND, level: DEEP_MONSTER_LEVEL, hp: DEEP_MONSTER_HP });
    game.engaged = 0;

    const damage = strike(game);

    expect(damage).toBeGreaterThan(0);
    expect(monster.hp).toBe(DEEP_MONSTER_HP - damage);
    expect(monster.hp).toBeGreaterThan(FAITHFUL_RULES.monsterHpMax);
    expect(monster.level).toBe(DEEP_MONSTER_LEVEL);
  });

  it('is worth the experience of the level it really has', () => {
    const game = gameOn(FLOOR);
    const monster = game.monsters[0];
    Object.assign(monster, { type: REGULAR_KIND, level: DEEP_MONSTER_LEVEL, hp: DEEP_MONSTER_HP });
    const deep = expValue(game, 0);

    // What the game's own byte would have made of level 300.
    monster.level = DEEP_MONSTER_LEVEL % MONSTER_LEVEL_BYTE;

    expect(Number.isFinite(deep)).toBe(true);
    expect(deep).toBeGreaterThan(expValue(game, 0));
  });
});

describe('the Shadow boss of a section below the bottom of the game', () => {
  const BOSS_FLOOR = 125;

  it('stands on the last floor of his section', () => {
    expect(rules.sectionPlace(21)?.bossFloor).toBe(BOSS_FLOOR);
    const game = gameOn(BOSS_FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(BOSS_FLOOR), BOSS_FLOOR, game.rng);
    expect(game.monsters[0].type).toBe(BOSS_KIND);
  });

  it('has the square he was put down on remembered beside the record', () => {
    const game = gameOn(BOSS_FLOOR);
    loadLevelMap(game, new FloorMonsters(), floorRows(BOSS_FLOOR), BOSS_FLOOR, game.rng);
    const boss = game.monsters[0];
    expect(rules.bossSquares.of(game.pc, 21)).toEqual({ x: boss.x, y: boss.y });
    expect(game.pc.bossX.every((x) => x === 0)).toBe(true);
    expect(game.pc.bossY.every((y) => y === 0)).toBe(true);
  });
});

describe('the S screen on a floor below the bottom of the game', () => {
  /** The section floor 120 belongs to, and the five monsters it stands, in the order its own
   *  table has them: the Shadow boss, three regulars and the level drainer. */
  const SECTION = 21;
  const five = rules.monsterKinds(SECTION).slice(BOSS_KIND);

  it('says which section it is and that the five below it are what stands there', () => {
    const game = gameOn(FLOOR);
    const opening = manualOpening(game);
    expect(opening.section).toBe(SECTION);
    expect(opening.intro[0]).toBe(`SECTION ${SECTION}`);
    // The pages are the section's own monsters, so the screen no longer sends the reader off to
    // the section it is drawn and described as.
    expect(opening.intro.join(' ')).not.toContain(`section ${rules.sectionSource(SECTION)}`);
  });

  it('names what the section does with its monsters', () => {
    // Section 23 of this world is one whose five monsters all breathe ice, and floor 160 is one
    // of its 25 floors.
    const BREATHES_ICE = 160;
    const game = gameOn(BREATHES_ICE);
    expect(rules.sectionOf(MODULE_V, BREATHES_ICE)).toBe(23);
    expect(manualOpening(game).intro[3]).toBe('Everything down here breathes ice.');
  });

  it('opens on MD.BIN itself for a floor of a section the game describes', () => {
    const game = gameOn(50);
    expect(manualOpening(game)).toEqual({ section: 18, intro: data.sections[17].intro });
  });

  it('turns one page per monster of its own set, each of them that monster paragraph', () => {
    const pages = manualPages(rules, SECTION);
    expect(pages).toHaveLength(five.length);
    pages.forEach((page, index) => {
      const name = five[index].name;
      expect(page, name).toHaveLength(4);
      // MD.BIN heads a monster's paragraph with its name and a colon.
      expect(page[0].startsWith(`${name}:`), page[0]).toBe(true);
    });
    // None of the five pages is a page of the section the screen is drawn and described as.
    const drawnAs = data.sections[rules.sectionSource(SECTION) - 1].descriptions;
    expect(pages.some((page) => drawnAs.includes(page[0]))).toBe(false);
  });

  it('stands each of the five in its panel out of the file of the section it came from', () => {
    const records = sectionMonsterRecords(SECTION, rules);
    const pictures = viewPictures(rules.pictureFiles(SECTION));
    expect(records).toHaveLength(five.length);
    records.forEach((record, index) => {
      const entry = monsterById(five[index].id);
      const home = entry.origin.kind === 'section' ? entry.origin.section : null;
      expect(record.picnum, entry.name).toBe(entry.picnum);
      expect(record.section, entry.name).toBe(home);
      expect(pictures.monster(record.picnum, false, record.section), entry.name).not.toBeNull();
    });
  });

  it("draws a section the game itself has exactly as a faithful game draws it", () => {
    // Section 18, which floor 50 of Module V is in, is one of the game's own twenty, so an
    // endless game standing there reads the pages the 1993 game reads.
    const OWN_SECTION = 18;
    const showing = { section: OWN_SECTION, lines: data.sections[OWN_SECTION - 1].intro, bossDead: true };
    const pictures = viewPictures(rules.pictureFiles(OWN_SECTION));
    const faithful = newFrame(SCREEN_PIXELS.width, SCREEN_PIXELS.height);
    const endless = newFrame(SCREEN_PIXELS.width, SCREEN_PIXELS.height);

    drawSectionScreen(faithful, SCREEN_PIXELS, showing, pictures, FAITHFUL_RULES);
    drawSectionScreen(endless, SCREEN_PIXELS, showing, pictures, rules);

    expect(endless.pixels).toEqual(faithful.pixels);
    expect(manualPages(rules, OWN_SECTION)).toEqual(manualPages(FAITHFUL_RULES, OWN_SECTION));
  });

  it('paints them in the colours the stocking paints them in', () => {
    const records = sectionMonsterRecords(SECTION, rules);
    // The Shadow boss keeps the colours he came with, and the other four are repainted.
    expect(readRecolouredId(five[0].id)).toBeNull();
    expect(records[0].colorSet).toBe(monsterById(five[0].id).colorSet);
    records.slice(1).forEach((record, index) => {
      const painted = readRecolouredId(five[index + 1].id);
      expect(painted, five[index + 1].id).not.toBeNull();
      expect(record.colorSet).toBe(painted?.colorSet);
    });
  });
});

describe("the office of a Shadow boss below the bottom of the game", () => {
  /** The last floor of section 21, which is where that section's own Shadow boss stands. */
  const BOSS_FLOOR = 125;

  /** The rectangle boss_office_message stretches the boss into (exe 3000:6de0), in the 1600 by
   *  1200 grid everything is placed in. */
  const PICTURE = { x1: 0x19, y1: 0x19, x2: 0x145, y2: 0x1d1 };

  /** A point of that grid as the drawer puts it on the screen (exe 4000:4929). */
  const atX = (x: number): number => Math.trunc(((SCREEN_PIXELS.width - 1) * x) / 1599);
  const atY = (y: number): number => Math.trunc(((SCREEN_PIXELS.height - 1) * y) / 1199);

  /** The section's Shadow boss as the catalogue has him, which is who the office draws. */
  const boss = monsterById(rules.monsterKinds(21)[BOSS_KIND].id);

  /** Which picture file the boss's own picture is in, since a section below the bottom of the
   *  game borrows its boss from one of the game's own twenty. */
  const bossHome = boss.origin.kind === 'section' ? boss.origin.section : null;

  /** The office as the tab draws it, with every picture the drawer asked for written down. */
  function officeOn(floor: number): { asked: [number, number | null | undefined][]; frame: Frame } {
    const section = rules.sectionOf(MODULE_V, floor);
    const own = viewPictures(rules.pictureFiles(section));
    const asked: [number, number | null | undefined][] = [];
    const pictures = {
      ...own,
      monster: (picnum: number, builtin: boolean, from?: number | null): PicRowImage | null => {
        asked.push([picnum, from]);
        return own.monster(picnum, builtin, from);
      },
    };
    const frame = newFrame(SCREEN_PIXELS.width, SCREEN_PIXELS.height);
    drawBossOffice(frame, SCREEN_PIXELS, { section, lines: [] }, pictures, rules);
    return { asked, frame };
  }

  it("draws the section's own Shadow boss, out of the file of the section he came from", () => {
    expect(boss.origin.kind === 'section' && boss.origin.slot).toBe(BOSS_KIND);
    expect(officeOn(BOSS_FLOOR).asked).toEqual([[boss.picnum, bossHome]]);
  });

  it('puts him on the screen in the colour set of his own record', () => {
    const { frame } = officeOn(BOSS_FLOOR);
    const painted = new Set<number>();
    for (let y = atY(PICTURE.y1); y <= atY(PICTURE.y2); y += 1) {
      for (let x = atX(PICTURE.x1); x <= atX(PICTURE.x2); x += 1) painted.add(pixelAt(frame, x, y));
    }
    // A picture's pixels land in its own colour set's bank, except for the values 29 to 31, which
    // read the gradient bank at 96 and up instead.
    const base = boss.colorSet << 4;
    expect([...painted].some((entry) => entry >= base && entry <= base + 31)).toBe(true);
  });
});

describe('a trap door on a floor below the bottom of the game', () => {
  const doorBelow = (level: number, shallowest: number): number => {
    const found = floorRows(level)
      .flat()
      .find((square) => square.trapdoor > shallowest);
    if (!found) throw new Error(`floor ${level} has no trap door leading below floor ${shallowest}`);
    return found.trapdoor;
  };

  it('is shut until the character has the key labelled with the floor it leads to', () => {
    const game = gameOn(FLOOR);
    const destination = doorBelow(FLOOR, FAITHFUL_BOTTOM);
    expect(explainTrapdoor(game, destination)).toBe(false);
    rules.keys.take(game.pc, destination);
    expect(explainTrapdoor(game, destination)).toBe(true);
  });

  it('leaves the record alone for a key the record has no flag for', () => {
    const game = gameOn(DEEP_FLOOR);
    const destination = doorBelow(DEEP_FLOOR, DEEPEST_RECORD_KEY);
    rules.keys.take(game.pc, destination);
    expect(game.pc.keys.every((flag) => flag === 0)).toBe(true);
  });

  it('has its key handed over by a level drainer killed on the floor it leads to', () => {
    const game = gameOn(FLOOR);
    game.rng = { random: () => KEY_ROLL };
    drainerBonus(game);
    expect(game.events).toContainEqual({ kind: 'found', find: { what: 'key', key: FLOOR } });
    expect(explainTrapdoor(game, FLOOR)).toBe(true);
  });
});

/**
 * drainerBonus hands over a potion while the roll comes in under the floor it counts plus 175,
 * and the key the floor is labelled with otherwise. The floor it counts on an endless floor is
 * the deepest one Module V has itself, so the key is as likely on floor 250 as on floor 105 —
 * where the game's own arithmetic would have counted floor 250, put the roll out of reach, and
 * handed over a potion every time.
 */
const KEY_ROLL = FAITHFUL_BOTTOM + 175;
const POTION_ROLL = KEY_ROLL - 1;

describe('a level drainer killed far below the bottom of the game', () => {
  const drainerKilledOn = (level: number, roll: number): Game => {
    const game = gameOn(level);
    game.rng = { random: (range) => (range === 375 ? roll : 0) };
    drainerBonus(game);
    return game;
  };

  it('still carries the key labelled for the floor it was killed on', () => {
    const game = drainerKilledOn(DEEP_FLOOR, KEY_ROLL);
    expect(game.events).toContainEqual({ kind: 'found', find: { what: 'key', key: DEEP_FLOOR } });
    expect(explainTrapdoor(game, DEEP_FLOOR)).toBe(true);
  });

  it('carries a potion on the roll just under the odds the bottom floor has', () => {
    const game = drainerKilledOn(DEEP_FLOOR, POTION_ROLL);
    expect(game.events.map((event) => (event.kind === 'found' ? event.find.what : event.kind))).toEqual(['potion']);
  });

  it('carries a potion every time under the rules of the game itself', () => {
    const game = newGame({ pc: { level: DEEP_FLOOR, module: MODULE_V } });
    game.rng = { random: (range) => (range === 375 ? 374 : 0) };
    drainerBonus(game);
    expect(game.events.map((event) => (event.kind === 'found' ? event.find.what : event.kind))).toEqual(['potion']);
  });
});
