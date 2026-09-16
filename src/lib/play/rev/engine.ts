import { LEVELS } from '../../game/revmap.js';
import type { Rng } from '../../game/port/rng';
import { revDropAllTheCoins } from './abandon';
import { REV_TICK_MS, revTick } from './clock';
import { revFallDownAChute } from './chute';
import { RevHeldScreens } from './held';
import type { RevMagicDesk } from './desk';
import { revAtTheFountain, revDrinkFromTheFountain, revNeedsAFountain, revRollTheFountain } from './fountain';
import {
  revBreatheFire,
  revWearOffPotions,
  revShowMagicItems,
  revPotionBanners,
  revTakeAPill,
  revUseAWandInAFight,
  revUseAWandInTheDungeon,
  revUseAnItem,
  revUseAnItemInAFight,
} from './items';
import { revFloorStats } from './magic';
import { revShowStats } from './stats';
import {
  revCastInAFight,
  revCastInTheDungeon,
  revCountDownBattleSpells,
  revEndPreppedSpells,
} from './spells';
import { revTreasureFromAKill } from './treasure';
import { revDie } from './death';
import {
  revLeaveTheFight,
  revMeetMonster,
  revMonsterAnswers,
  revMonsterSeen,
  revOwnsWeapon,
  revSwing,
  revPrintTheSwing,
  revSwingWords,
  revWeaponFor,
  NO_SUCH_WEAPON,
} from './fight';
import { revMonsterAttack } from './attack';
import { revShowHelp } from './help';
import { revPause } from './pause';
import { revSetEnterDelay, revStepBackground, revStepPalette, revToggleSound } from './settings';
import { revKillMonster } from './kill';
import {
  REV_KEY,
  revArrowMode,
  revCompassArrow,
  revJournalFacing,
  revTurningArrow,
  revWrapFacing,
} from './keys';
import { revFeatureUnder, revLookDown, revOnAFalseFloor } from './ladders';
import { RevMapMemory, type RevMapStore } from './memory';
import type { PlayMode } from '../mode';
import { KeyedSession, RECORD_EDITED, type CharacterFile, type HeldFrames, type KeyHandler } from '../session';
import { revStep, type RevStep } from './move';
import { revPass } from './pass';
import { loadRevPlayer, saveRevPlayer, type RevPc } from './record';
import type { RunRecorder, RunTotals } from '../run';
import { revAdvice } from './advice';
import {
  REV_BUILDING_NAMES,
  revBuildingUnder,
  revStayAtInn,
  revVisitBank,
  revVisitGuild,
  revVisitStore,
  revVisitTemple,
  type RevTownDesk,
} from './town';
import { newRevGame, revWalker, type RevGame } from './state';
import { revScreenStateOf } from './screen/from-game';
import { drawRevScreen, type RevScreenState } from './screen/screen';
import { drawRevTextScreen } from './screen/text-screen';
import type { Frame } from '../view3d/frame';
import { debugDrawn, discoveredMapOnly, panelVisible } from '../mode';
import type { RevStanding } from './monsters';
import { revClearScreen, revDrawTheDungeonAgain, revSayGoodbye } from './screens';

/**
 * The loop Moraff's Revenge is played in — the `INKEY$` poll at DUNSMALL.EXE 1000:087F and the
 * key dispatch at 1000:0CD2 behind it — and the session it is played out of.
 *
 * The original never blocks: it spins on `INKEY$` and rolls the monsters' clock on every pass.
 * Here the poll is a display timer (`clock.ts`) the session runs only while the loop is waiting
 * for a key, and each of its ticks is an input of its own in the run log, so a run replays
 * without any clock at all.
 */

/** Not a key: one tick of the monsters' clock, which the log keeps where it happened. */
export const REV_CLOCK_TICK = -0x202;

/** Where the character record lives while it is being played. `write` is 1000:B308. */
export interface RevCharacterFile extends CharacterFile {
  /** 1000:B583 and 1000:B964: the explored map kept beside the record, the way the game keeps
   *  `<n>.BIN` beside `<n>.EXE`. */
  map?: RevMapStore;
  /** The character's name, which the original reads out of `F5.COM` (DGROUP B466) and the
   *  statistics screen puts in its heading. */
  name?: string;
}

/** What the Play tab draws. */
export interface RevPlayView {
  /**
   * Where the character is standing, counted from zero the way the other two games' views
   * count it and the map canvas draws it.
   *
   * The game's own column and row start at one (DGROUP B4CA and B4D2), and everything that
   * is a port of the game — the record, the screen, the run log's ending — keeps them that
   * way. This is the tab's view, so it is the tab's numbering.
   */
  place: { x: number; y: number; level: number; facing: number };
  /** Every monster standing on the level, for the map. */
  monsters: RevStanding[];
  /** The ones the character can see, which in this game is the one on their own square alone. */
  visible: RevStanding[];
  /** The lines the loop has printed. */
  box: string[];
  /** The line of advice the loop prints on its own row at the top of every pass. */
  advice: string[];
  /** The line the ladder, the chute and the rope put under the map. */
  prompt: string | null;
  /** What the fight is saying, which the original draws over the top of the screen. */
  banner: string[];
  /** The monster being fought, with what is left of it. */
  fight: { slot: number; name: number; monsterLevel: number; hitPoints: number } | null;
  /** Which way the arrows move, which Escape switches. */
  arrows: 'compass' | 'turning';
  over: boolean;
  dead: boolean;
  /** The message the play loop threw and stopped on, or null. */
  stopped: string | null;
  run: RunTotals | null;
}

/** One character being played. */
export class RevGameSession extends KeyedSession<RevPc> {
  readonly game: RevGame;
  private timer: ReturnType<typeof setInterval> | null = null;
  /**
   * The screens the game asked to be left up for a moment (1000:2F1A), which the tab draws in
   * place of the live screen for as long as each was asked for. The loop runs straight past
   * them; this is only what the tab shows.
   */
  private readonly held = new RevHeldScreens(() => this.changed());

  constructor(
    file: RevCharacterFile,
    rng: Rng,
    run: RunRecorder | null = null,
    sound = true,
  ) {
    super(file, run);
    // A character is 340 numbers of text (1000:B6BF). Bytes that are not them are not a
    // character at all, and a game of a character made of zeroes would be checked against itself
    // and believed, so this stops instead.
    const pc = loadRevPlayer(file.bytes);
    if (!pc) throw new Error('These bytes are not a Moraff\'s Revenge character record.');
    this.game = newRevGame(pc, rng, new RevMapMemory(file.map ?? null), file.name ?? '');
    // 1000:0523: the answer to "Sound (Y or N)?" is the only thing that writes DGROUP B4BC
    // before the loop starts, and N is what puts a 1 there.
    this.game.sound = sound ? 0 : 1;
    this.game.flushKeys = () => this.flushKeys();
    this.game.delay = (ms) => this.hold(ms);
    // 1000:B98F: a character who has never been played has no fountain of youth yet, and the
    // load rolls one for them.
    if (revNeedsAFountain(pc)) revRollTheFountain(this.game);
    this.game.monsters.stock(pc.dungeonLevel, rng);
    run?.watch(this.game.events, () => ({
      time: this.ticks,
      floor: this.game.pc.dungeonLevel,
      dungeon: 0,
    }));
  }

  /** How many ticks of the monsters' clock the run has spent, which is this game's own clock. */
  ticks = 0;

  protected override get frames(): HeldFrames {
    return this.held;
  }

  /**
   * A tick of the monsters' clock is not an input the player made: {@link tick} has already
   * written it into the log where it happened, so the wait it ends must not write it again.
   */
  protected override took(key: number): void {
    if (key !== REV_CLOCK_TICK) super.took(key);
  }

  /**
   * 1000:087F: the poll, which is where the loop waits at the top of a pass. While it waits the
   * monsters' clock runs, and it is the one place a record written outside the game is taken.
   */
  poll(): Promise<number> {
    return this.keyOrEdit();
  }

  protected override async waitForTheKey(): Promise<number> {
    this.startClock();
    try {
      return await this.key();
    } finally {
      this.stopClock();
    }
  }

  /**
   * One tick of the monsters' clock: the passes of the `INKEY$` poll that much wall-clock time
   * is worth, each rolling 1000:7EEC through the run's generator.
   *
   * The fight's own prompt polls as well (1000:86E2 before 1000:86E5), so the rest of the level
   * keeps shuffling around while it is up; what does not happen there is a swing, since the
   * monster's attack is only ever reached from the far side of a key.
   *
   * It is written into the log as an input of its own, which is what lets a replay reproduce it
   * without a timer.
   */
  tick(): void {
    // 1000:0891: the town skips the clock outright, which is why nothing walks there.
    if (this.game.over || this.game.pc.dungeonLevel === 0) return;
    this.run?.unpressed(REV_CLOCK_TICK);
    this.ticks += 1;
    // `TIMER`, which the three potions that wear off are timed against.
    this.game.seconds = (this.ticks * REV_TICK_MS) / 1000;
    const walker = revWalker(this.game);
    const moves = this.game.monsters.moves;
    revTick(this.game.monsters, walker, this.game.lastMonsterLevel, this.game.rng);
    let drawAgain = this.game.monsters.moves !== moves;
    // 1000:85BA: the fight's poll asks on every pass whether a potion has run down, so the
    // agility and the shield go, and the banners with them, while the player is sitting still
    // and watching the level shuffle around.
    if (this.game.fight !== null && revWearOffPotions(this.game)) drawAgain = true;
    // 1000:08F6: a monster that has reached the character's square sends the loop through the
    // per-key routine, whose redraw opens the fight (1000:4969).
    if (this.game.fight === null && this.monsterHere() > 0) {
      this.wake(REV_CLOCK_TICK);
      drawAgain = true;
    }
    // Debug mode's panel prints the cursor the clock walks and the two slots it has marked awake,
    // which move on every tick whether or not anything on the level did.
    if (drawAgain || panelVisible(this.mode)) this.changed();
  }

  /** The slot standing on the character's own square (1000:08F6). */
  monsterHere(): number {
    const pc = this.game.pc;
    return this.game.monsters.slotOn(pc.column, pc.row);
  }

  private startClock(): void {
    if (this.timer !== null || typeof setInterval !== 'function') return;
    if (this.game.pc.dungeonLevel === 0) return;
    this.timer = setInterval(() => this.tick(), REV_TICK_MS);
  }

  private stopClock(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** 1000:B6BF: a record's 340 numbers as the character, or nothing where the bytes are not a
   *  character at all. */
  protected override readRecord(bytes: Uint8Array): RevPc | null {
    return loadRevPlayer(bytes);
  }

  /** 1000:B308: the character back into the record it came from. */
  protected override writeRecord(): Uint8Array<ArrayBuffer> {
    return saveRevPlayer(this.game.pc);
  }

  /** The BSAVE 1000:B308 falls into: the map is written back with the record. */
  override save(): void {
    super.save();
    this.game.memory.save();
  }

  /** 1000:A249: the character's two files are deleted. The roster marks the entry instead and
   *  keeps the bytes, the way the other two games' ports do; the map really is thrown away. */
  override die(): void {
    this.over = true;
    this.game.over = true;
    this.game.memory.forgetEverything();
    super.die();
  }

  /** 1000:4C28: the level changes, which re-stocks the monster grid. */
  enterLevel(level: number): void {
    const pc = this.game.pc;
    const from = pc.dungeonLevel;
    pc.dungeonLevel = Math.min(Math.max(level, 0), LEVELS);
    this.game.events.push({ kind: 'floorReached', floor: pc.dungeonLevel });
    this.game.monsters.stock(pc.dungeonLevel, this.game.rng);
    // 1000:3F42: the spells that last until the town are taken off when the character reaches
    // it, and 1000:3F4E is one of the five moments the character is saved.
    if (pc.dungeonLevel === 0 && from !== 0) {
      revEndPreppedSpells(this.game);
      this.save();
    }
  }

  /**
   * Where a record the save editor wrote leaves the character standing.
   *
   * The way they are facing is the game's rather than the record's, since the record holds no
   * facing at all: a session starts every character looking north (`record.ts`).
   */
  protected override placeEdited(record: RevPc): void {
    const level = this.game.pc.dungeonLevel;
    Object.assign(this.game.pc, record, { facing: this.game.pc.facing });
    if (this.game.pc.dungeonLevel !== level) this.enterLevel(this.game.pc.dungeonLevel);
  }

  override finish(): void {
    this.stopClock();
    this.held.stop();
  }

  /** Everything the game's own screen is drawn from, at the mode the tab is showing. */
  screenState(): RevScreenState {
    return revScreenStateOf(this.game, {
      wholeFloor: !discoveredMapOnly(this.mode),
      debug: debugDrawn(this.mode),
    });
  }

  /**
   * The screen the tab draws: a frame the game asked to be held, or the screen as the game has
   * it now.
   */
  screen(): Frame {
    // The help's eighty-column page is a screen mode of its own and takes the display over
    // whole, so nothing the game had on the screen shows behind it (`screen/text-screen.ts`).
    if (this.game.textScreen) return drawRevTextScreen(this.game.textScreen);
    return this.held.showing() ?? drawRevScreen(this.screenState());
  }

  /**
   * 1000:2F1A: the game has drawn something and wants it read before it goes on.
   *
   * The frame is drawn here rather than when it comes to be shown, because the loop has run on
   * by then and the port works the whole screen out from the game as it stands. A session
   * nobody is drawing — a replay, or a test — holds nothing at all, since there is no screen
   * for a frame to be held on.
   */
  private hold(ms: number): void {
    if (this.onChange === null) return;
    this.held.hold(drawRevScreen(this.screenState()), ms, this.game.said, this.game.banner);
  }

  /**
   * 1000:7DC9 and 1000:2F71: how a spell, an item, a pill or a wand asks its questions.
   *
   * The poll runs the monsters' clock the way the original's does, and a tick is not a key: the
   * original's `INKEY$` gives it an empty string and it asks again. What it does hand back
   * instead of a key is a space, once a monster is standing on the character's square
   * (1000:7E4A), and that is the null here.
   */
  magic(): RevMagicDesk {
    return {
      poll: async () => {
        for (;;) {
          if (this.monsterHere() > 0 && this.game.fight === null) return null;
          const key = await this.poll();
          if (key !== REV_CLOCK_TICK && key !== RECORD_EDITED) return key;
        }
      },
      wait: async () => {
        const key = await this.key();
        revFloorStats(this.game.pc);
        return key;
      },
      enterLevel: (level) => this.enterLevel(level),
      stats: () => revShowStats(this.game, this.desk()),
      save: () => this.save(),
    };
  }

  /** The town desk, which is how a building asks its questions. */
  desk(): RevTownDesk {
    return { key: () => this.key() };
  }

  view(): RevPlayView {
    const game = this.game;
    const pc = game.pc;
    const monsters = game.monsters.standing();
    const here = this.monsterHere();
    return {
      place: { x: pc.column - 1, y: pc.row - 1, level: pc.dungeonLevel, facing: pc.facing },
      monsters,
      visible: monsters.filter((monster) => monster.slot === here),
      box: this.held.showingBox(game.said),
      advice: game.advice,
      prompt: game.prompt,
      banner: this.held.showingBanner(game.banner),
      fight: game.fight
        ? {
            slot: game.fight.slot,
            name: game.fight.name,
            monsterLevel: game.fight.monsterLevel,
            hitPoints: game.fight.hitPoints,
          }
        : null,
      arrows: revArrowMode(game.arrowMode),
      over: this.over,
      dead: this.dead,
      stopped: this.stopped,
      run: this.run?.summary() ?? null,
    };
  }
}

/** Start playing a character. */
export function startRevGame(
  file: RevCharacterFile,
  rng: Rng,
  run: RunRecorder | null = null,
  sound = true,
): RevGameSession {
  return new RevGameSession(file, rng, run, sound);
}

/** What the loop knows about the square before it reads a key. */
export interface RevTurn {
  session: RevGameSession;
  game: RevGame;
  /** The building under the character on level 0, and 0 everywhere else. */
  building: number;
}

/** One key the dungeon dispatches on. */
export type RevKeyHandler = KeyHandler<RevTurn>;

/** The keys 1000:0CD2 dispatches on, by the byte it compares. */
export const REV_KEY_HANDLERS: Record<number, RevKeyHandler> = {
  [REV_KEY.down]: { c: '1000:0DE0, the ladder down and the false floor', run: goDown },
  [REV_KEY.up]: { c: '1000:0DAF, the ladder up and the rope into a building', run: goUp },
  [REV_KEY.stats]: { c: '1000:19F7, the statistics screen', run: (turn) => revShowStats(turn.game, turn.session.desk()) },
  [REV_KEY.quit]: { c: '1000:0D7D, the save and the chain back to BEGIN', run: quitAndSave },
  [REV_KEY.escape]: { c: '1000:10BE, the movement-mode switch', run: switchArrows },
  [REV_KEY.cast]: { c: '1000:35AC, cast a spell', run: (turn) => revCastInTheDungeon(turn.game, turn.session.magic()) },
  [REV_KEY.magic]: { c: '1000:3B16, the magic items owned', run: (turn) => revShowMagicItems(turn.game, turn.session.desk()) },
  [REV_KEY.item]: { c: '1000:1340, use an item', run: (turn) => revUseAnItem(turn.game, turn.session.magic()) },
  [REV_KEY.abandon]: { c: '1000:1918, drop all the coins', run: (turn) => revDropAllTheCoins(turn.game, turn.session.magic()) },
  [REV_KEY.help]: { c: '1000:C332, the help pages', run: (turn) => revShowHelp(turn.game, turn.session.desk()) },
  [REV_KEY.f1]: { c: '1000:C332, the help pages', run: (turn) => revShowHelp(turn.game, turn.session.desk()) },
  [REV_KEY.pause]: { c: '1000:7FFB, the pause screen', run: (turn) => revPause(turn.game, turn.session.desk(), () => saveAndSignOff(turn.session)) },
  [REV_KEY.enterDelay]: { c: '1000:0F00, the enter delay', run: (turn) => revSetEnterDelay(turn.game, turn.session.desk()) },
  [REV_KEY.pill]: { c: '1000:7C49, take a pill', run: (turn) => revTakeAPill(turn.game, turn.session.magic()) },
  [REV_KEY.wand]: { c: '1000:7AA1, use a wand', run: (turn) => revUseAWandInTheDungeon(turn.game, turn.session.magic()) },
  [REV_KEY.background]: { c: '1000:0FF5, the background colour', run: (turn) => revStepBackground(turn.game) },
  [REV_KEY.palette]: { c: '1000:102A, the palette', run: (turn) => revStepPalette(turn.game) },
  [REV_KEY.sound]: { c: '1000:1055, the sound', run: (turn) => revToggleSound(turn.game) },
};

/**
 * 1000:0E62, 0EFD, 0F80 and 0FE4: the four keys that call the per-key routine themselves rather
 * than reach it through the loop's re-entry at 1000:0636, which is why the rings of health still
 * heal on them.
 */
const KEYS_THE_RINGS_HEAL_ON = new Set<number>([REV_KEY.cast, REV_KEY.pause, REV_KEY.pill, REV_KEY.wand]);

/** 1000:10BE: Escape counts the movement mode 0, 1, 0. */
function switchArrows(turn: RevTurn): void {
  turn.game.arrowMode = (turn.game.arrowMode + 1) % 2;
}

/** 1000:0DE0: D takes a ladder down, and the false floor a chute left behind. */
function goDown(turn: RevTurn): void {
  const game = turn.game;
  // 1000:0CE0: the fountain of youth is asked about before the ladder is, so D drinks where a
  // character is standing on it.
  if (revAtTheFountain(game)) {
    revDrinkFromTheFountain(game, turn.session.magic());
    game.events.push({ kind: 'fountainDrunk', generation: game.pc.generation });
    return;
  }
  if (game.feature < 1 || game.feature > 3) return;
  // Which of the two the D key was has to be asked before the character leaves the square.
  const falseFloor = revOnAFalseFloor(game);
  const to = game.pc.dungeonLevel + game.feature;
  turn.session.enterLevel(to);
  game.events.push({ kind: 'ladderTaken', to, falseFloor });
}

/** 1000:0DAF: U takes a ladder up, or climbs the rope into a town building. */
async function goUp(turn: RevTurn): Promise<void> {
  const game = turn.game;
  if (turn.building > 0 && game.pc.dungeonLevel === 0) {
    await enterBuilding(turn, turn.building);
    return;
  }
  if (game.feature >= 0) return;
  const to = game.pc.dungeonLevel + game.feature;
  turn.session.enterLevel(to);
  game.events.push({ kind: 'ladderTaken', to, falseFloor: false });
}

/** 1000:132A: `ON building GOTO`, the seven routines the ten squares lead to. */
async function enterBuilding(turn: RevTurn, building: number): Promise<void> {
  const desk = turn.session.desk();
  // The three squares past the seventh building lead nowhere, so nothing happens on them. The
  // building is counted on the way in rather than on the way out, so that what a player is shown
  // while they are inside one already has it.
  if (building < 1 || building > 7) return;
  turn.game.events.push({ kind: 'buildingEntered', building: REV_BUILDING_NAMES[building - 1] });
  if (building <= 3) await revStayAtInn(turn.game, building - 1, desk);
  else if (building === 4) await revVisitBank(turn.game, desk);
  else if (building === 5) await revVisitTemple(turn.game, desk);
  else if (building === 6) await revVisitStore(turn.game, desk);
  else await revVisitGuild(turn.game, desk, turn.session.magic());
}

/**
 * 1000:B308 and 1000:B5C8: the character is written down and the game signs off.
 *
 * Both ways out of a game reach this: the dungeon's own Q and the Q of the pause screen. The
 * two monster files 1000:B5C8 writes beside the words are the disk's in the original and are
 * not kept, which `README.md` has as a departure of its own.
 */
function saveAndSignOff(session: RevGameSession): void {
  session.save();
  revSayGoodbye(session.game, false);
  session.over = true;
  session.game.over = true;
}

/** 1000:0D7D: Q clears the screen before it signs off, where the pause screen is cleared
 *  already. */
function quitAndSave(turn: RevTurn): void {
  revClearScreen(turn.game);
  saveAndSignOff(turn.session);
}

/** The keys the fight prompt takes and the dungeon does not (1000:87CA onwards). */
async function fightKey(session: RevGameSession, key: number): Promise<void> {
  const game = session.game;
  // The loop only sends a key here with a fight on, which is the monster every one of these
  // reports names.
  const fight = game.fight;
  if (fight === null) return;
  const desk = session.magic();
  const weapon = revWeaponFor(key);
  if (weapon === null) {
    // 1000:8985: the breath is a swing that cannot miss, and it is only looked for while the
    // potion of fire is still burning.
    if (key === REV_KEY.breathe) {
      const breath = revBreatheFire(game);
      if (breath === null) return;
      game.events.push({
        kind: 'breathed',
        monster: revMonsterSeen(fight, game.pc.dungeonLevel),
        damage: breath.damage,
      });
      game.banner = revSwingWords(game, breath);
      revPrintTheSwing(game, breath, game.banner, key);
      monsterAnswers(session);
      return;
    }
    // 1000:884A: the fight prompt's P is the same pause screen as the dungeon's, not a prayer.
    if (key === REV_KEY.pause) {
      await revPause(game, session.desk(), () => saveAndSignOff(session));
    } else if (key === REV_KEY.cast) {
      await revCastInAFight(game, desk);
      monsterAnswers(session);
    } else if (key === REV_KEY.item) {
      await revUseAnItemInAFight(game, desk);
      monsterAnswers(session);
    } else if (key === REV_KEY.pill) await revTakeAPill(game, desk);
    else if (key === REV_KEY.wand) await revUseAWandInAFight(game, desk);
    return;
  }
  if (!revOwnsWeapon(game.pc, weapon)) {
    game.say(...NO_SUCH_WEAPON);
    return;
  }
  const swing = revSwing(game, weapon);
  game.events.push({
    kind: 'swung',
    weapon,
    monster: revMonsterSeen(fight, game.pc.dungeonLevel),
    damage: swing.damage,
  });
  game.banner = revSwingWords(game, swing);
  revPrintTheSwing(game, swing, game.banner, key);
  monsterAnswers(session);
}

/** 1000:9A2F and 1000:8E44: the monster's own turn, which is only ever reached from the far side
 *  of a key of the character's. */
function monsterAnswers(session: RevGameSession): void {
  const game = session.game;
  const fight = game.fight;
  if (fight && fight.hitPoints < 1) {
    revKillMonster(game);
    return;
  }
  // 1000:8E44 and 1000:878E: the monster's own swing, which is only ever reached from here.
  if (revMonsterAnswers(game)) revMonsterAttack(game, () => session.save());
}

/**
 * The loop. It comes back when the character quits or dies, which is where the original chains
 * back to BEGIN or to the hall of fame.
 */
export async function runRevDungeon(session: RevGameSession): Promise<void> {
  const game = session.game;
  const pc = game.pc;
  for (;;) {
    session.takeEdits();
    if (session.over) return;
    if (pc.hp < 0) {
      if (!(await revDie(game, session.desk()))) {
        session.die();
        return;
      }
      session.enterLevel(0);
    }
    // 1000:05F2: the facing is brought back into 1 to 4 at the top of every pass.
    pc.facing = revWrapFacing(pc.facing);
    game.memory.markStep(pc.column, pc.row, pc.dungeonLevel);
    game.feature = revFeatureUnder(pc.column, pc.row, pc.dungeonLevel);
    // 1000:552B sends a chute straight to the fall rather than putting a prompt up. The fall
    // refuses the square it last landed on, which is where the false floor prompt comes from.
    if (game.feature === 0 && revFallDownAChute(game, () => session.save())) {
      session.enterLevel(pc.dungeonLevel);
      continue;
    }
    revLookDown(game);
    // 1000:0A4F: the top of every pass wraps the step counter and takes off the two spells a
    // fight casts on the character when it has come round to them.
    revCountDownBattleSpells(game);
    game.advice = revAdvice(game);
    const turn: RevTurn = { session, game, building: revBuildingUnder(pc.column, pc.row, pc.dungeonLevel) };
    // 1000:4969, in the redraw every key ends in: a monster on the character's own square, and
    // no fight already on, opens one.
    if (game.fight === null && session.monsterHere() > 0) revMeetMonster(game, session.monsterHere());
    // 1000:845A and 1000:8517: a fight puts the three potion banners up again on the way to
    // every one of its keys, and 1000:85BA wears each potion off as it runs down before it waits
    // for one. Neither happens outside a fight, which is why drinking in a corridor puts nothing
    // on the screen until something comes along — and why a potion drunk down there wears off
    // only once its drinker is in a fight again.
    if (game.fight !== null) {
      revPotionBanners(game);
      revWearOffPotions(game);
    }
    const key = await session.poll();
    if (key === RECORD_EDITED || key === REV_CLOCK_TICK) continue;
    // The words the last key printed come down when the next one arrives, which is what the
    // redraw at 1000:3029 does to them.
    game.said = [];
    game.banner = [];
    session.run?.dispatched();
    // 1000:0636: coming back through the loop's own re-entry is what holds the rings back.
    game.ringsHeldBack = !KEYS_THE_RINGS_HEAL_ON.has(key);
    let step: RevStep | null = null;
    if (game.fight !== null) {
      // 1000:8701 and 1000:871F: the fight prompt hands Escape and the four arrows to the same
      // two routines the dungeon does, so a character can turn and walk away from a monster.
      if (key === REV_KEY.escape) switchArrows(turn);
      else if (revCompassArrow(key) !== 0 || revTurningArrow(key) !== null) step = await stepOrTurn(session, key);
      else await fightKey(session, key);
    } else {
      const handler = REV_KEY_HANDLERS[key];
      if (handler) await handler.run(turn);
      else step = await stepOrTurn(session, key);
    }
    // 1000:33CB: a step that went through and one the edge of the floor stopped both come back
    // through the tail the four move routines share, which leaves the rings healing. A wall does
    // not (1000:315A), and neither does a turn.
    if (step === 'moved' || step === 'edge') game.ringsHeldBack = false;
    // 1000:A4E7: whatever killed the monster, what it dropped is offered before the next key.
    if (game.killed) {
      game.killed = false;
      await revTreasureFromAKill(game, session.magic());
    }
    // 1000:3FFC, which every key comes back through. The one that does not is a step a monster
    // stood in the way of: 1000:33EA prints MONSTER BLOCKS WAY and returns.
    if (step !== 'monster') revPass(game);
    // The fight is over the moment the character is no longer standing on the monster.
    if (game.fight !== null && session.monsterHere() !== game.fight.slot) revLeaveTheFight(game);
    // 1000:3FFC ends by falling into 1000:4260 and the redraw of the map and the views at
    // 1000:4275, which paints over everything the key printed on them -- the picture in the box
    // between the views among it (1000:47EA into 1000:58F7). A fight never gets there: its own
    // loop goes back to 1000:84C1 instead, which is why the lines a swing prints stay up until
    // the next swing blanks them. The step a monster blocked does not either (1000:33EA).
    // A game that has ended is not drawn over: 1000:0DAC chains to BEGIN from the screen it
    // signed off on, and never comes back through the per-key routine.
    if (game.fight === null && step !== 'monster' && !session.over) revDrawTheDungeonAgain(game, 'afterAPass');
    if (session.over) return;
    // The record goes back to the roster after every key, so a player can always come back to
    // where they were (John, 2026-09-09); the game's own save points are unchanged.
    session.save();
  }
}

/**
 * 1000:0AC2: what the arrows do, which depends on the movement mode Escape switches.
 *
 * What it hands back is what the step came to, since the per-key routine is reached from a
 * different place for each of them, and a step a monster blocked never reaches it at all.
 */
async function stepOrTurn(session: RevGameSession, key: number): Promise<RevStep | null> {
  const game = session.game;
  const pc = game.pc;
  if (revArrowMode(game.arrowMode) === 'compass') {
    const facing = revCompassArrow(key);
    if (facing === 0) return null;
    pc.facing = facing;
    return revStep(game, facing);
  }
  const arrow = revTurningArrow(key);
  if (arrow === null) return null;
  if (arrow.step) return revStep(game, pc.facing);
  pc.facing += arrow.turn;
  game.events.push({ kind: 'turned', facing: revJournalFacing(revWrapFacing(pc.facing)) });
  return null;
}
