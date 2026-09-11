import { describe, expect, it } from 'vitest';
import { parseSave } from '../game/dotu-files.js';
import { bundledDungeon } from '../game/dungeon';
import { loadPlayer, savePlayer } from '../game/port/record';
import { BATTLE_TEXT_COLOUR, messageLine } from '../game/port/screens';
import { BorlandRng, type Rng } from '../game/port/rng';
import { MAP_PLAYER, monsterAt, newGame, type PlayerCharacter } from '../game/port/state';
import { EXPLORED_STRIDE } from '../map/explored';
import { UNFORGIVEN_MAP, type MapSquare } from '../map/game';
import { newCharacterFile } from '../roller/save-file';
import { facingAMonster, inTheTown, startPlaying } from './battle.test-support';
import { GameSession, KEY_HANDLERS, runMoveControl, startGame, type CharacterFile } from './engine';
import { KEY } from './keys';
import { PLAQUE_DELAY_MS } from './plaque';
import { VIEW_DEPTH, viewedSquares } from './memory';

/** A character file that lives in the test rather than in the roster. */
function characterFile(overrides: Partial<PlayerCharacter> = {}): CharacterFile & { dead: boolean } {
  const pc = { ...newGame().pc, name: 'DIGGER', hp: 200, maxHp: 200, ...overrides };
  return {
    bytes: savePlayer(pc, newCharacterFile(pc)),
    dead: false,
    write(bytes) {
      this.bytes = bytes;
    },
    died() {
      this.dead = true;
    },
  };
}

/** A session with the loop running, waiting for its first key. */
function playing(file: CharacterFile, rng: Rng = new BorlandRng(3)): GameSession {
  const session = startPlaying(file, rng);
  return session;
}

/** A generator that rolls the lowest number it can, so a moment can be checked step by step.
 *  Only a floor the game does not stock can be played with one: the stocking draws squares until
 *  it finds a free one, and every draw from this comes back the same. */
const lowest: Rng = { random: () => 0 };

/** Press a key and let the loop get back to waiting for the next one. */
async function press(session: GameSession, key: number): Promise<void> {
  session.press(key);
  await new Promise((resolve) => setTimeout(resolve));
}

/** Let the loop run without pressing anything, for a turn that starts by itself. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** What stands in the message box, which is where engagement_timing draws the battle banner. */
const bannerText = (session: GameSession): string[] =>
  session.view().box.map((line) => line.text);

/**
 * Two turnarounds, which leave the character facing the way they were and cost no time.
 *
 * movecontrol draws the four views again only where the redraw flag is up or the character is
 * not where they were, and the battle banner goes up with them, so a monster planted in front of
 * a character who has not moved is not named until they do something that redraws.
 */
async function turnAndBack(session: GameSession): Promise<void> {
  await press(session, KEY.arrowDown);
  await press(session, KEY.arrowDown);
}

const floorOf = (level: number, module = 0) => UNFORGIVEN_MAP.floor(level, module);

/** The first square of a floor a test can be run on, by whatever it needs to be. */
function findSquare(
  level: number,
  wanted: (square: MapSquare, x: number, y: number, rows: MapSquare[][]) => boolean,
  module = 0,
): { x: number; y: number } {
  const rows = floorOf(level, module);
  for (let y = 1; y < 100; y++) {
    for (let x = 1; x < 76; x++) {
      if (!rows[y][x].solid && wanted(rows[y][x], x, y, rows)) return { x, y };
    }
  }
  throw new Error(`no such square on floor ${level}`);
}

/** A square of the town with nothing on it and a way out to the north. */
const townWalk = () =>
  findSquare(0, (square, x, y) => square.n === 3 && bundledDungeon.ladder(x, y, 0, 0) === 0 && bundledDungeon.townFeature(x, y, 0) === 0 && bundledDungeon.trapdoor(x, y, 0, 0) === -1);

describe('walking', () => {
  it('takes a step the way the character faces', async () => {
    const start = townWalk();
    const file = characterFile({ level: 0, dir: 0, ...start });
    const session = playing(file);
    await press(session, KEY.arrowUp);
    expect(session.view().place).toMatchObject({ x: start.x, y: start.y - 1 });
  });

  it('turns without moving', async () => {
    const start = townWalk();
    const session = playing(characterFile({ level: 0, dir: 0, ...start }));
    await press(session, KEY.arrowLeft);
    expect(session.view().place).toMatchObject({ x: start.x, y: start.y, dir: 2 });
    await press(session, KEY.arrowDown);
    expect(session.view().place.dir).toBe(3);
    await press(session, KEY.arrowRight);
    expect(session.view().place.dir).toBe(1);
  });

  it('says so on the strip above the box when the way ahead is a wall', async () => {
    const start = findSquare(0, (square) => square.n === 0 && square.s === 3);
    const session = playing(characterFile({ level: 0, dir: 0, ...start }));
    await press(session, KEY.arrowUp);
    expect(session.box).not.toContain('THE WALL REFUSES TO MOVE');
    expect(session.game.screen).toContainEqual(
      messageLine('THE WALL REFUSES TO MOVE', BATTLE_TEXT_COLOUR),
    );
    expect(session.view().place).toMatchObject(start);
  });

  it('holds a jammed door on the strip above the box rather than filling the box', async () => {
    const start = findSquare(3, (square) => square.n === 1);
    const session = playing(characterFile({ level: 3, dir: 0, ...start }));
    const monster = session.game.monsters[0];
    session.game.monsterMap[monster.y * 80 + monster.x] = 0xff;
    monster.x = start.x;
    monster.y = start.y - 1;
    monster.hp = 20;
    session.game.monsterMap[monster.y * 80 + monster.x] = 0;
    await press(session, KEY.arrowUp);
    expect(session.view().place).toMatchObject(start);
    expect(session.box).not.toContain('THE DOOR IS JAMMED');
    expect(session.view().box).toContainEqual(
      messageLine('THE DOOR IS JAMMED', BATTLE_TEXT_COLOUR),
    );
  });
});

describe('the moment after an action', () => {
  it('walks a monster one square towards the character', async () => {
    // The town has no monsters of its own, so the one put here is the only one that can move.
    const start = findSquare(0, (square, x, y, rows) => square.e === 3 && rows[y][x + 2].w === 3);
    const session = playing(characterFile({ level: 0, dir: 0, ...start }), lowest);
    const monster = session.game.monsters[0];
    monster.x = start.x + 2;
    monster.y = start.y;
    monster.hp = 20;
    session.game.monsterMap[monster.y * 80 + monster.x] = 0;
    await press(session, KEY.enter);
    expect([monster.x, monster.y]).toEqual([start.x + 1, start.y]);
    expect(session.view().monsters[0]).toMatchObject({ x: start.x + 1, y: start.y });
  });

  it('ticks the battle spell timers', async () => {
    const start = townWalk();
    const session = playing(characterFile({ level: 0, ...start, strengthTimer: 4 }));
    await press(session, KEY.enter);
    expect(session.game.pc.strengthTimer).toBe(3);
  });

  it('engages the monster the character is facing', async () => {
    const start = findSquare(3, (square) => square.n === 3);
    const session = playing(characterFile({ level: 3, dir: 0, ...start }));
    expect(session.view().engaged).toBeNull();
    const monster = session.game.monsters[0];
    session.game.monsterMap[monster.y * 80 + monster.x] = 0xff;
    monster.x = start.x;
    monster.y = start.y - 1;
    session.game.monsterMap[monster.y * 80 + monster.x] = 0;
    await turnAndBack(session);
    expect(session.view().engaged?.slot).toBe(0);
    expect(bannerText(session)).toContainEqual(expect.stringContaining('YOU ARE FIGHTING A LEVEL'));
  });
});

describe('changing floors', () => {
  it('goes down the ladder the square holds', async () => {
    const ladder = findSquare(2, (square) => square.ladder > 0);
    const depth = bundledDungeon.ladder(ladder.x, ladder.y, 2, 0);
    const session = playing(characterFile({ level: 2, ...ladder }));
    await press(session, KEY.down);
    expect(session.view().place.floor).toBe(2 + depth);
    // The ladder is a ladder from both ends, so the landing square offers the way back up.
    expect(session.view().prompt?.map((line) => line.text)).toEqual(["HIT 'U'", 'TO GO UP']);
  });

  it('climbs the ladder back up', async () => {
    const ladder = findSquare(4, (square) => square.ladder < 0);
    const rise = bundledDungeon.ladder(ladder.x, ladder.y, 4, 0);
    const session = playing(characterFile({ level: 4, ...ladder }));
    expect(session.view().prompt?.map((line) => line.text)).toEqual(["HIT 'U'", 'TO GO UP']);
    await press(session, KEY.up);
    expect(session.view().place.floor).toBe(4 + rise);
  });

  it('says there is no ladder on a square without one', async () => {
    const start = findSquare(3, (square) => square.ladder === 0 && square.chute === 0 && square.trapdoor === -1);
    const session = playing(characterFile({ level: 3, ...start }));
    await press(session, KEY.up);
    expect(session.box[0]).toContain('THERE IS NO LADDER HERE');
  });

  it('falls down a chute the moment the character stands on one', async () => {
    const chute = findSquare(3, (square) => square.chute !== 0 && square.ladder === 0 && square.trapdoor === -1);
    const landing = bundledDungeon.chute(chute.x, chute.y, 3, 0);
    const session = playing(characterFile({ level: 3, ...chute }));
    await settle();
    // The three lines are pfont calls down the message column rather than a box of eight.
    expect(session.game.screen.map((line) => line.text)).toEqual([
      'UH OH... A SINKING FEELING...',
      'YOU HAVE FALLEN DOWN A CHUTE!',
      '  HIT ANY KEY TO CONTINUE...',
    ]);
    expect(session.box).toEqual([]);
    // ...and the tab is still holding the first of them on its own, which is the second and a
    // half chute waits before it says what has happened.
    expect(session.view().box.map((line) => line.text)).toEqual(['UH OH... A SINKING FEELING...']);
    await press(session, KEY.escape);
    expect(session.view().place).toMatchObject({ floor: landing, x: chute.x, y: chute.y });
    expect(session.view().box).toEqual([]);
  });

  it('goes through a trap door to the square every one of them lands on', async () => {
    const door = findSquare(3, (square) => square.trapdoor >= 0 && square.ladder === 0);
    const destination = bundledDungeon.trapdoor(door.x, door.y, 3, 0);
    const keys = Array.from({ length: 36 }, () => 0);
    keys[Math.trunc(destination / 5)] = 1;
    const session = playing(characterFile({ level: 3, ...door, keys }));
    expect(session.box[0]).toBe('  YOU HAVE FOUND A TRAP DOOR');
    await press(session, KEY.trapDoor);
    const [x, y] = bundledDungeon.trapdoorDest(destination, 0);
    expect(session.view().place).toMatchObject({ floor: destination, x, y });
  });

  it('keeps the trap door shut without its key', async () => {
    const door = findSquare(3, (square) => square.trapdoor >= 0 && square.ladder === 0);
    const session = playing(characterFile({ level: 3, ...door }));
    expect(session.box).toContain('NOT HAVE THE CORRECT KEY.');
    await press(session, KEY.trapDoor);
    expect(session.box[0]).toBe("I DON'T SEE ANY TRAP");
    expect(session.view().place.floor).toBe(3);
  });

  it('takes the trap door’s box down with the first step off the square', async () => {
    const door = findSquare(3, (square) => square.trapdoor >= 0 && square.ladder === 0 && square.n === 3);
    const session = playing(characterFile({ level: 3, dir: 0, ...door }));
    await settle();
    expect(session.box[0]).toContain('TRAP DOOR');
    // Stepping north: FUN_2000_bcb6 wipes a box flagged at DS:2519 as it takes the character off
    // the square.
    await press(session, KEY.arrowUp);
    expect(session.view().place).toMatchObject({ x: door.x, y: door.y - 1 });
    expect(session.box).toEqual([]);
  });

  it('walks into a module teleporter and comes out in the next module’s town', async () => {
    const teleporter = findSquare(1, (square) => square.e === 4 && square.ladder === 0 && square.trapdoor === -1 && square.chute === 0);
    const file = characterFile({ level: 1, dir: 3, ...teleporter });
    const session = playing(file);
    // A line left on the screen and a box left up before the crossing: the tunnel covers both.
    session.game.draw(messageLine('THE WALL REFUSES TO MOVE', 4));
    session.box = ['STALE'];
    await press(session, KEY.arrowUp);
    // The tunnel is drawn on the way through and waits for a key of its own before the module
    // changes at all (exe 4000:771b).
    expect(session.view().tunnel).toEqual({ module: 1, welcome: false });
    expect(session.view().place.module).toBe(0);
    expect(session.game.screen).toEqual([]);
    expect(session.box).toEqual([]);
    await press(session, KEY.escape);
    expect(session.box[0]).toBe('YOU HAVE BEEN DETACHED FROM');
    // The arrival box is read on the tunnel, which the key that answers it takes down.
    expect(session.view().tunnel).toEqual({ module: 1, welcome: false });
    // change_module saves the character where it drops them, before movecontrol loads the town.
    expect(parseSave(file.bytes).module).toBe(1);
    // Only once that box has its key does movecontrol load the new module's town, which is where
    // the snake greets the character with a tablet of its own.
    expect(session.view().tablet).toBeNull();
    await press(session, KEY.escape);
    expect(session.view().tunnel).toBeNull();
    expect(session.view().place.module).toBe(1);
    expect(session.view().place.floor).toBe(0);
    expect(session.view().tablet?.[0]).toContain('As you reach the town');
  });

  it('digs through the floor to whatever is under it', async () => {
    const start = findSquare(3, (square) => square.ladder === 0 && square.chute === 0 && square.trapdoor === -1);
    const session = playing(characterFile({ level: 3, ...start, cls: 3 }));
    await press(session, KEY.dig);
    expect(session.box[0]).toBe('DO YOU WISH TO DIG A HOLE');
    await press(session, 0x31);
    // A monster that reached the character stops the dig, on the line above the box rather than
    // in it, which is where dig_hole draws it.
    const said = session.view().box.map((line) => line.text);
    if (said.includes('A MONSTER WANTS TO HELP')) return;
    // Otherwise the first four DIGGING... flashes have gone by and the box is waiting for a key.
    expect(session.box[0]).toBe('BOY THIS IS HARD WORK!');
    await press(session, KEY.escape);
    expect(session.view().place.floor).toBeGreaterThan(3);
  });
});

describe('saving', () => {
  it('writes the position the save editor reads back', async () => {
    const start = townWalk();
    const file = characterFile({ level: 0, dir: 0, ...start });
    const session = playing(file);
    await press(session, KEY.arrowUp);
    await press(session, KEY.quit);
    await press(session, KEY.escape);
    expect(session.view().over).toBe(true);
    const saved = parseSave(file.bytes);
    expect([saved.x, saved.y, saved.level]).toEqual([start.x, start.y - 1, 0]);
    expect(saved.checksumOk).toBe(true);
    expect(saved.name).toBe('DIGGER');
  });

  it('saves where a chute dropped the character', async () => {
    const chute = findSquare(3, (square) => square.chute !== 0 && square.ladder === 0 && square.trapdoor === -1);
    const landing = bundledDungeon.chute(chute.x, chute.y, 3, 0);
    const file = characterFile({ level: 3, ...chute });
    const session = playing(file);
    await settle();
    await press(session, KEY.escape);
    expect(parseSave(file.bytes).level).toBe(landing);
  });
});

describe('the message box', () => {
  it('replaces the box before it and wipes the menu column it is drawn down', async () => {
    const session = playing(characterFile({ level: 0, ...townWalk() }));
    await settle();
    const game = session.game;
    game.draw({ text: 'A MENU LINE', x: 0x3a2, y: 0x329, font: 0, colour: 6 });
    game.say('FIRST BOX');
    expect(game.screen.some((line) => line.text === 'A MENU LINE')).toBe(false);
    game.say('SECOND BOX');
    expect(session.box).toEqual(['SECOND BOX']);
  });

  it('keeps what it last said while the character walks on', async () => {
    // movecontrol wipes nothing where it takes its key (exe 2000:c82d), so a message the game
    // never waited on stands in the box until the next box is drawn over it.
    const start = townWalk();
    const session = playing(characterFile({ level: 0, dir: 0, ...start }));
    await settle();
    const standing = ['A BOX NOBODY WAITED ON'];
    session.game.say(...standing);
    await press(session, KEY.arrowUp);
    expect(session.view().place).toMatchObject({ x: start.x, y: start.y - 1 });
    expect(session.box).toEqual(standing);
    await press(session, KEY.up);
    expect(session.box[0]).toContain('THERE IS NO LADDER HERE');
  });

  it('wipes the block when the monster the banner named is not ahead any more', async () => {
    const start = findSquare(3, (square) => square.n === 3);
    const session = playing(characterFile({ level: 3, dir: 0, ...start }));
    const game = session.game;
    const monster = game.monsters[0];
    game.monsterMap[monster.y * 80 + monster.x] = 0xff;
    monster.x = start.x;
    monster.y = start.y - 1;
    game.monsterMap[monster.y * 80 + monster.x] = 0;
    await turnAndBack(session);
    expect(bannerText(session)).toContainEqual(expect.stringContaining('YOU ARE FIGHTING A LEVEL'));
    game.say('SAID WHILE IT WAS STANDING THERE');
    game.monsterMap[monster.y * 80 + monster.x] = 0xff;
    monster.x = 1;
    monster.y = 1;
    await press(session, KEY.escape);
    expect(session.box).toEqual([]);
    expect(bannerText(session)).toEqual([]);
  });

  it('takes the box and the line above it off with the key its wait asks for', async () => {
    const session = playing(characterFile({ level: 0, ...townWalk() }));
    await settle();
    const game = session.game;
    game.say('YOU FIND...');
    game.draw(messageLine('NOTHING! (HIT ANY KEY)', 8));
    game.pressAnyKey();
    await press(session, KEY.escape);
    expect(session.box).toEqual(['YOU FIND...']);
    await press(session, KEY.escape);
    expect(session.box).toEqual([]);
    expect(game.screen).toEqual([]);
  });
});

describe('dying', () => {
  it('is checked before the step the key asked for is resolved', async () => {
    const start = townWalk();
    const session = playing(characterFile({ level: 0, dir: 0, ...start }));
    await settle();
    // movecontrol asks whether the character is dead at 2000:dbe9, between the kill and the
    // step, so a key that killed them never takes the step it asked for. There is no key of the
    // game's that both kills and steps, so the test brings its own.
    const fatalStep = 0x62;
    KEY_HANDLERS[fatalStep] = {
      c: 'a handler that exists only in this test',
      run(turn) {
        turn.game.pc.hp = -1;
        turn.step = { dx: 0, dy: -1 };
      },
    };
    try {
      await press(session, fatalStep);
    } finally {
      delete KEY_HANDLERS[fatalStep];
    }
    expect(session.view().place).toMatchObject({ x: start.x, y: start.y });
    expect(session.box[0]).toBe('EVERYTHING GOES BLACK...');
  });


  it('marks the character dead and leaves the file alone', async () => {
    const start = townWalk();
    const file = characterFile({ level: 0, hp: -1, ...start });
    const before = file.bytes;
    const session = playing(file);
    await settle();
    // The snake says where the character has gone, then adds one of its five parting shots.
    expect(session.box[0]).toBe('EVERYTHING GOES BLACK...');
    await press(session, KEY.escape);
    expect(session.box.some((line) => line.startsWith("I THINK YOU'RE"))).toBe(true);
    await press(session, KEY.escape);
    expect(file.dead).toBe(true);
    expect(session.view().dead).toBe(true);
    expect(session.view().over).toBe(true);
    expect(file.bytes).toBe(before);
  });
});

describe('an edit in the save editor', () => {
  /** The record as the editor leaves it: the character the file holds, with fields changed. */
  function edited(file: CharacterFile, overrides: Partial<PlayerCharacter>): Uint8Array<ArrayBuffer> {
    return savePlayer({ ...loadPlayer(file.bytes), ...overrides }, file.bytes);
  }

  it('plays on with the character the editor wrote', async () => {
    const start = townWalk();
    const file = characterFile({ level: 0, dir: 0, ...start, str: 20 });
    const session = playing(file);
    await settle();
    session.recordEdited(edited(file, { str: 99 }));
    await settle();
    expect(session.game.pc.str).toBe(99);
  });

  it('moves the character about the floor they are on', async () => {
    const start = townWalk();
    const file = characterFile({ level: 0, dir: 0, ...start });
    const session = playing(file);
    await settle();
    const moved = findSquare(0, (unused, x, y) => x !== start.x || y !== start.y);
    session.recordEdited(edited(file, moved));
    await settle();
    expect(session.view().place).toMatchObject(moved);
    expect(monsterAt(session.game, start.x, start.y)).toBe(-1);
    expect(session.game.monsterMap[moved.y * 80 + moved.x]).toBe(MAP_PLAYER);
  });

  it('enters the floor the record puts the character on', async () => {
    const start = townWalk();
    const file = characterFile({ level: 0, dir: 0, ...start });
    const session = playing(file);
    await settle();
    const landing = findSquare(3, (square) => square.ladder === 0 && square.chute === 0 && square.trapdoor === -1);
    session.recordEdited(edited(file, { level: 3, ...landing }));
    await settle();
    expect(session.view().place).toMatchObject({ floor: 3, ...landing });
    expect(session.floors.remembered[0]).toBe(3);
  });

  it('leaves the game alone when the record the game saved comes back', async () => {
    const start = townWalk();
    const file = characterFile({ level: 0, dir: 0, ...start, str: 20 });
    const session = playing(file);
    await settle();
    session.save();
    // Everything the game has done since its own save would be undone by reading the record
    // again, which is what this asks about.
    session.game.pc.str = 99;
    session.recordEdited(file.bytes);
    await settle();
    expect(session.game.pc.str).toBe(99);
  });

  it('waits for the screen the game is showing to come down', async () => {
    const start = townWalk();
    const file = characterFile({ level: 0, dir: 0, ...start, str: 20 });
    const session = playing(file);
    await press(session, KEY.help);
    session.recordEdited(edited(file, { str: 99 }));
    await settle();
    expect(session.game.pc.str).toBe(20);
    await press(session, KEY.escape);
    expect(session.game.pc.str).toBe(99);
  });
});

describe('the map the character discovers', () => {
  it('knows the square underfoot and what the views reach, and never further than they do', async () => {
    const start = townWalk();
    const session = playing(characterFile({ ...start, level: 0 }));
    await settle();
    const known = [...session.memory.knownSquares()];
    expect(session.memory.isKnown(start.x, start.y)).toBe(true);
    expect(known.length).toBeGreaterThan(1);
    for (const index of known) {
      const x = index % EXPLORED_STRIDE;
      const y = (index - x) / EXPLORED_STRIDE;
      expect(Math.max(Math.abs(x - start.x), Math.abs(y - start.y))).toBeLessThanOrEqual(VIEW_DEPTH);
    }
  });

  it('knows the town a game starts in before the loop has taken a pass', () => {
    const start = townWalk();
    const session = startGame(characterFile({ ...start, level: 0 }), new BorlandRng(3));
    expect(session.memory.isKnown(start.x, start.y)).toBe(true);
    expect(session.memory.knownSquares().size).toBeGreaterThan(1);
  });

  it('knows the town the snake greets the character in, behind its greeting', async () => {
    const ladder = findSquare(1, (square) => square.ladder < 0);
    const session = playing(characterFile({ level: 1, ...ladder }));
    await press(session, KEY.up);
    expect(session.view().place.floor).toBe(0);
    expect(session.box[0]).toBe('YOU ARE IN THE TOWN!');
    expect(session.memory.knownSquares().size).toBeGreaterThan(1);
  });

  it('knows where a chute has dropped the character, behind its own message', async () => {
    const chute = findSquare(3, (square) => square.chute !== 0 && square.ladder === 0 && square.trapdoor === -1);
    const session = playing(characterFile({ level: 3, ...chute }));
    await settle();
    expect(session.view().place.floor).toBe(bundledDungeon.chute(chute.x, chute.y, 3, 0));
    expect(session.memory.isKnown(chute.x, chute.y)).toBe(true);
    expect(session.memory.knownSquares().size).toBeGreaterThan(1);
  });

  it('knows the town a module teleporter comes out in, behind its greeting', async () => {
    const teleporter = findSquare(1, (square) => square.e === 4 && square.ladder === 0 && square.trapdoor === -1 && square.chute === 0);
    const session = playing(characterFile({ level: 1, dir: 3, ...teleporter }));
    await press(session, KEY.arrowUp);
    // The key the crossing's welcome waits for and the key the arrival box waits for, which
    // between them are what lets the new module's town be loaded at all.
    await press(session, KEY.escape);
    expect(session.box[0]).toBe('YOU HAVE BEEN DETACHED FROM');
    await press(session, KEY.escape);
    const place = session.view().place;
    expect(place).toMatchObject({ module: 1, floor: 0 });
    // The teleporter drops the character on any square of the town it comes out in, and seventy
    // of that town's squares are cells whose only ways out are doors, which no view sees through.
    expect(session.memory.isKnown(place.x, place.y)).toBe(true);
    for (const square of viewedSquares(session.rows, place.x, place.y)) {
      expect(session.memory.knownSquares().has(square)).toBe(true);
    }
  });

  it('keeps every square it has learned as the character walks', async () => {
    const start = townWalk();
    const session = playing(characterFile({ ...start, level: 0, dir: 0 }));
    await settle();
    const before = [...session.memory.knownSquares()];
    await press(session, KEY.arrowUp);
    expect(session.game.pc.y).toBe(start.y - 1);
    const after = session.memory.knownSquares();
    for (const square of before) expect(after.has(square)).toBe(true);
  });
});

describe("the stone tablet the snake's words are read on", () => {
  it('greets a character arriving in the town and waits for a key', async () => {
    // load_level_map (exe 2000:6e42) sends FUN_3000_9488 the moment a character reaches floor 0,
    // and the tablet it puts up holds the screen until a key is given.
    const start = townWalk();
    const session = startGame(characterFile({ level: 0, dir: 0, ...start }), new BorlandRng(3));
    void runMoveControl(session);
    expect(session.view().tablet?.[0]).toContain('As you reach the town');
    // The words are on the tablet and not in the eight-line message box.
    expect(session.box).toEqual([]);
    expect(session.view().viewsDrawn).toBe(0);
    // FUN_3000_9026 draws the slab on a blanked screen and brings the palette up under it.
    expect(session.view().fade).toBe('in');

    await press(session, KEY.escape);
    // The game has put the tablet away, and FUN_4000_5c25 is fading it off the screen, so the
    // tab is still drawing it (`fade.ts`).
    expect(session.tablet).toBeNull();
    expect(session.view().fade).toBe('out');
    expect(session.view().tablet?.[0]).toContain('As you reach the town');
    expect(session.box).toEqual([]);
    // The loop has taken the tablet's key and drawn its first pass.
    expect(session.view().viewsDrawn).toBe(1);
  });

  it('greets a character who has been deeper with what they have earned', async () => {
    const start = townWalk();
    const session = startGame(
      characterFile({ level: 0, dir: 0, ...start, deepestFloor: 25 }),
      new BorlandRng(3),
    );
    void runMoveControl(session);
    // Deeper than level 20, which is a different one of the ten greetings.
    expect(session.view().tablet?.[0]).toContain("You're in town");
    expect(session.view().tablet?.join(' ')).toContain('amateur explorer');
    await press(session, KEY.escape);
    expect(session.tablet).toBeNull();
  });
});

describe('the coin flip that mirrors the monster you are fighting', () => {
  it('counts the drawings the game would have made and not the passes of the loop', async () => {
    const start = townWalk();
    const session = playing(characterFile({ level: 0, dir: 0, ...start }));
    // The town's own stone tablet is read before the loop runs a pass, so the drawing is counted
    // from after it.
    await settle();
    expect(session.view().viewsDrawn).toBe(1);
    // A key that neither moves the character nor asks for a redraw draws nothing again.
    await press(session, KEY.escape);
    expect(session.view().viewsDrawn).toBe(1);
    // A turn asks for one, and so does a step.
    await press(session, KEY.arrowLeft);
    expect(session.view().viewsDrawn).toBe(2);
    await press(session, KEY.arrowRight);
    expect(session.view().viewsDrawn).toBe(3);
    await press(session, KEY.arrowUp);
    expect(session.view().place).toMatchObject({ x: start.x, y: start.y - 1 });
    expect(session.view().viewsDrawn).toBe(4);
  });

  it('is not made while a key is waiting, so typing ahead leaves the views as they were', async () => {
    const start = townWalk();
    const session = playing(characterFile({ level: 0, dir: 0, ...start }));
    await settle();
    const drawn = session.view().viewsDrawn;
    // Two turns typed together: the second is waiting when the first has been taken, so the
    // views are drawn once, after both, and from the facing the character ends up with.
    session.press(KEY.arrowLeft);
    session.press(KEY.arrowRight);
    for (let pass = 0; pass < 4; pass++) await settle();
    expect(session.view().viewsDrawn).toBe(drawn + 1);
    expect(session.view().viewsFrom.dir).toBe(session.view().place.dir);
  });

  it('is left alone by a swing, so the monster keeps the way it is facing', async () => {
    const session = await facingAMonster(new BorlandRng(5), { lev: 10, str: 60 });
    const drawn = session.view().viewsDrawn;
    for (let swing = 0; swing < 4; swing++) await press(session, KEY.fight);
    // The monster has taken the blows and is still standing, so nothing has asked for a redraw.
    expect(session.game.monsters[0].hp).toBeGreaterThan(0);
    expect(session.game.monsters[0].hp).toBeLessThan(50);
    expect(session.view().viewsDrawn).toBe(drawn);
  });

  it('leaves the game\'s own generator alone, so a run still replays', async () => {
    const rolls: number[] = [];
    const counted: Rng = { random: (n) => (rolls.push(n), 0) };
    const session = playing(characterFile({ level: 0 }), counted);
    const spent = rolls.length;
    // Drawing the views again spends nothing: the flip is worked out from the pass number.
    session.view();
    session.view();
    expect(rolls.length).toBe(spent);
  });
});

describe('the HIT ANY KEY plaque', () => {
  /** The Z key says its piece and waits for a key, which is what puts a plaque up. */
  const lowest: Rng = { random: () => 0 };

  it('leaves its rectangle blank until the delay is up', async () => {
    const session = inTheTown(lowest);
    await press(session, KEY.zoomView);
    expect(session.plaque).toBe('blanked');
    // FUN_2000_3e73 counts 330 ms out in delay (exe 1000:2789) before it draws the plaque.
    await new Promise((resolve) => setTimeout(resolve, PLAQUE_DELAY_MS + 60));
    expect(session.plaque).toBe('showing');
    await press(session, KEY.escape);
    expect(session.plaque).toBe(null);
    session.finish();
  });

  it('puts the plaque up at once when the high speed option is on', async () => {
    const session = inTheTown(lowest);
    session.game.highSpeed = true;
    await press(session, KEY.zoomView);
    expect(session.plaque).toBe('showing');
    await press(session, KEY.escape);
    session.finish();
  });
});

describe('what the screen is drawn from', () => {
  it('is left alone by a key the game does nothing with', async () => {
    const session = playing(characterFile());
    await settle();
    const before = JSON.stringify(session.view());
    const map = session.memory.discovered();
    // No handler is registered for a tilde, so movecontrol comes round to wait for another key
    // having done nothing at all.
    await press(session, '~'.charCodeAt(0));
    expect(JSON.stringify(session.view())).toBe(before);
    // The Play tab compares the map by identity, so the same map has to come back for it to know
    // that nothing on the little map has changed.
    expect(session.memory.discovered()).toBe(map);
    session.finish();
  });
});

describe('the monster the map draws a close-up of', () => {
  it('carries the hit points it was stocked with, whatever a swing has left it', async () => {
    const session = await facingAMonster(new BorlandRng(5), { lev: 40, str: 90 }, { hp: 60 });
    expect(session.view().engagedFullHp).toBe(60);
    await press(session, KEY.fight);
    expect(session.view().engaged?.hp).toBeLessThan(60);
    expect(session.view().engagedFullHp).toBe(60);
    session.finish();
  });

  it('carries the lines debug mode prints over it, and none with nothing faced', async () => {
    const session = await facingAMonster(new BorlandRng(5), { lev: 10, str: 60 });
    const lines = session.view().engagedDebugLines;
    expect(lines[0]).toBe(`LEVEL:1 HP:${session.view().engaged?.hp}`);
    expect(lines[1]).toMatch(/^HIT:\d+\.\d%$/);
    expect(lines[2]).toMatch(/^IT HITS:\d+\.\d%$/);
    session.game.engaged = -1;
    session.game.engagedAhead = -1;
    expect(session.view().engaged).toBeNull();
    expect(session.view().engagedFullHp).toBe(0);
    expect(session.view().engagedDebugLines).toEqual([]);
    session.finish();
  });
});
