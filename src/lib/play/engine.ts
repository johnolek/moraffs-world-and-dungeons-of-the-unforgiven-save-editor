import { sectionOf } from '../game/dotu-files.js';
import { bundledDungeon } from '../game/dungeon';
import { attackTiming, engagementTiming } from '../game/port/combat';
import { sectionNumber, tabletMessage, townTablet } from '../game/port/hints';
import { checkDeath } from '../game/port/kills';
import { arriveSquare, leaveSquare } from '../game/port/moment';
import { loadPlayer, savePlayer } from '../game/port/record';
import { clearMenuBlock, clearMessageLine } from '../game/port/screens';
import type { Rng } from '../game/port/rng';
import type { Game, PlayerCharacter, ScreenLine, ScreenRect } from '../game/port/state';
import { MAP_PLAYER, newGame, sectionMonsterKinds, setMonsterMap } from '../game/port/state';
import { UNFORGIVEN_AREA } from '../map/area';
import { UNFORGIVEN_MAP, type MapSquare } from '../map/game';
import type { StockedMonster } from '../map/stocking';
import { boxesOf } from './boxes';
import { castFromSpellbook, useAnItem } from './cast';
import { chuteUnder, fallDownChute } from './chute';
import { debugMonsterLines } from './debug-screen';
import { digHole } from './dig';
import { keepSwinging, readKey, swingAtMonster } from './fight';
import { drawnMonsters, FloorMonsters, loadLevelMap } from './floor';
import { changeArmor, changeWeapon } from './gear';
import { showHelp } from './help';
import { dropSomething } from './items';
import { killTheDead } from './kill';
import { KEY } from './keys';
import { goDown, goUp, ladderPrompt, ladderUnder } from './ladders';
import { readTheMonsterManual } from './manual';
import { countTheMoney, expandTheMap, openGraphics, openOptions, zoomTheView } from './misc';
import { MapMemory, type MapStore } from './memory';
import type { PlayMode } from './mode';
import {
  KeyedSession,
  RECORD_EDITED,
  type CharacterFile as PlayedCharacterFile,
  type HeldFrames,
  type KeyHandler as KeyedHandler,
} from './session';
import { resolveStep, stepForward, turnAround, turnLeft, turnRight } from './move';
import { quitGame } from './quit';
import { lookInPockets } from './pockets';
import type { RunRecorder, RunTotals } from './run';
import {
  MESSAGE_BOX_LINES,
  MESSAGE_BOX_LINES_TOP,
  MESSAGE_BOX_RECT,
  messageBoxScreen,
  screenTakenOver,
} from './screens';
import { PLAQUE_DELAY_MS } from './plaque';
import { TUNNEL_CRAWL_MS, type ModuleTunnel } from './tunnel';
import type { SectionScreen } from './section-screen';
import type { TownBuilding } from './building';
import type { BossOffice } from './boss-office';
import { fadeMs, type Fade } from './fade';
import { TimedScreens } from './timed';
import { showBattleSpells, showExpNeeded, showPrepSpells, showStats } from './spellScreens';
import { buildingUnder, explainTrapdoor, goThroughTrapDoor, trapdoorUnder } from './trapdoor';

/**
 * movecontrol (exe 2000:c308, unf.c "movecontrol"), the loop the whole game is played in, and
 * the session it is played out of.
 *
 * The original blocks on the keyboard in the middle of the loop; here the loop is asynchronous
 * and every read of a key is a promise the Play tab settles. Everything else is the order the
 * original does things in: what it works out about the square before it asks for a key, the key
 * it dispatches on, and the step it resolves once the key has been dealt with.
 */

/**
 * The size of the map view the game keeps a cursor in, in squares, in its three biggest video
 * modes. Nothing but the "the map has scrolled off the character" flag reads it here, since the
 * Play tab draws the whole floor on a canvas.
 */
const MAP_VIEW_COLUMNS = 0x13;
const MAP_VIEW_ROWS = 0x21;

/** Where the character record lives while it is being played. `write` is save_player (exe
 *  2000:79ad). */
export interface CharacterFile extends PlayedCharacterFile {
  /** save_maps and load_maps (exe 2000:7313 and 2000:74ae): the explored maps kept beside the
   *  record, the way the game keeps its `.DUN` file beside it. A caller with none — a replay, a
   *  test — plays with a map that lasts as long as the session. */
  maps?: MapStore;
}

/** What movecontrol works out about the square before it reads a key. */
export interface Turn {
  session: GameSession;
  game: Game;
  /** check_for_ladder (exe 3000:827f): how many floors down a ladder here goes, up being
   *  negative, and 0 for no ladder. */
  ladder: number;
  /** town_features (exe 2000:bd32), which is the trap door despite the name the catalog gives
   *  it: the floor a trap door here leads to, and -1 for none or one there is no key for. */
  trapdoor: number;
  /** trapdoor (exe 2000:9cba), which is the town's buildings despite its name: 1 store, 2
   *  temple, 3 bank, 4 inn, and 0 for none. */
  building: number;
  /** retdwall2 (exe 2000:c22d) on the four sides of the square: 0 wall, 1 door, 2 secret door,
   *  3 open, 4 module teleporter. */
  sides: MapSquare;
  /** The step the key asked for, which the loop resolves once the key's handler has run. */
  step: { dx: number; dy: number };
}

/** How far along the HIT ANY KEY plaque's own wait the screen is. */
export type PlaqueState = 'blanked' | 'showing';

/** One key movecontrol dispatches on. */
export type KeyHandler = KeyedHandler<Turn>;

/** What the Play tab draws. */
/**
 * A monster killed whose skull `movecontrol` (exe 2000:c308) has painted over it, which stands
 * on the screen until the loop comes round and draws the four views again.
 */
export interface KilledOnScreen {
  /** DS:049d: which of the four ways the monster was standing in. */
  dir: number;
  monsterId: string;
}

export interface PlayView {
  place: { x: number; y: number; floor: number; module: number; dir: number };
  /**
   * The character's hit points and spell points, and what they can hold.
   *
   * These are on the view rather than read off `session.game.pc` because the character is a
   * plain object the game writes in place: nothing on the page would redraw when a blow lands.
   * The tab is handed a fresh view after every action, so the map's orbs follow a fight.
   */
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  /** Their own level and the experience they have earned, which the map's bar is drawn from and
   *  which move for the same reason. */
  level: number;
  exp: number;
  rows: MapSquare[][];
  monsters: StockedMonster[];
  /** The monsters standing on a square the four 3-D views drew this turn, which is exactly the
   *  ones the character can see. */
  visible: StockedMonster[];
  /** The message box, as the game draws it: the eight lines and the bar above them. */
  box: ScreenLine[];
  /** A screen the game has taken the whole display over with; empty when there is none. */
  screen: ScreenLine[];
  /** How much of the display that screen was drawn on black, and null where the port does not
   *  know the rectangle and the whole display goes black behind it. */
  screenCleared: ScreenRect | null;
  /** The box the game puts up on a square with a ladder or a doorway, where it draws it. */
  prompt: ScreenLine[] | null;
  /** Seconds of game time the character has spent. */
  seconds: number;
  /** The monster the character is facing, or null. */
  engaged: StockedMonster | null;
  /**
   * The hit points that monster was stocked with, which is the full mark of the bar beside its
   * picture; 0 when nothing is being faced.
   *
   * On the view rather than asked of the session for the same reason the character's own hit
   * points are: a swing writes the monster's record in place, and nothing on the page would
   * redraw off it.
   */
  engagedFullHp: number;
  /**
   * The lines debug mode prints over that monster, which the map's close-up shows in debug mode
   * and in no other; empty when nothing is being faced.
   */
  engagedDebugLines: string[];
  /** That monster is the one standing straight ahead (DS:c655) rather than one being fought
   *  from another side, which is when the game has its picture on the screen. */
  ahead: boolean;
  /** The monster the skull is standing over, or null when nothing has just been killed. */
  killed: KilledOnScreen | null;
  /** Which drawing of the four views this is, which mirrors the monster ahead. */
  viewsDrawn: number;
  /**
   * The square and the facing the four views were last drawn from, which is where they are
   * still drawn from while keys typed ahead keep movecontrol from drawing them again. The map
   * follows every step; the views catch up when the keyboard is idle.
   */
  viewsFrom: { x: number; y: number; floor: number; module: number; dir: number };
  /** The X key's map is filling the screen, which covers the views and everything around them. */
  expandedMap: boolean;
  /** The four lines of the stone tablet the snake's words are read on, or null when none is up. */
  tablet: string[] | null;
  /** The S key's screen, or null when it is not up: the section's five monsters in their panels
   *  and the slab its words are read off (`section-screen.ts`). */
  sectionScreen: SectionScreen | null;
  /** The town building whose picture is on the screen, or null when the character is not in one
   *  (`building.ts`). */
  buildingScreen: TownBuilding | null;
  /** The boss's picture standing over the play screen while its taunt is read, or null
   *  (`boss-office.ts`). */
  bossOffice: BossOffice | null;
  /** The module teleporter's tunnel (`tunnel.ts`), or null when the character is not crossing. */
  tunnel: ModuleTunnel | null;
  /** The HIT ANY KEY plaque (`plaque.ts`) while a box's wait is running, or null. */
  plaque: PlaqueState | null;
  /** The palette fade running over the screen (`fade.ts`), or null when none is. */
  fade: Fade | null;
  /** The loop has come back: the character has quit or died. */
  over: boolean;
  dead: boolean;
  /** The message the play loop threw and stopped on, or null. */
  stopped: string | null;
  /** How the run stands, or null for a game nobody is recording. */
  run: RunTotals | null;
}

/**
 * One character being played: the game, the floor they stand on, the monsters that floor is
 * stocked with, and the keyboard the loop waits on.
 */
export class GameSession extends KeyedSession<PlayerCharacter> {
  readonly game: Game;
  readonly floors = new FloorMonsters();
  /** The map this character has discovered, which is what the Play tab draws in faithful mode
   *  and what says which monsters can be seen. */
  readonly memory: MapMemory;
  /** The floor the character is on, as the map descriptor generates it. */
  rows: MapSquare[][];
  /** The eight strings the message box is showing, which is the game's own DS:c694. */
  get box(): string[] {
    return this.game.menuBox;
  }

  set box(lines: string[]) {
    this.game.menuBox = lines;
  }

  /** DS:034c: the twelve lines view_battle_spells (exe 2000:9417) has showing, which is how it
   *  knows whether anything has changed since it last drew them. */
  battleSpellsShown: boolean[] = [];
  /** DS:041b: whether the spell menu is drawn in the miniature layout. The original keeps it in
   *  the character record at offset 0x975; the port keeps it for as long as the game is played. */
  miniSpellMenu = false;
  /**
   * The X key's map is up (`misc.ts`), which the original draws by filling the whole screen and
   * putting the floor over it, so nothing else on the display shows while it stands.
   */
  expandedMap = false;
  /** The lines of the stone tablet showing, or null. FUN_3000_9026 (exe 3000:9026) draws it and
   *  waits for a key, and the key it is given is what takes it down again. */
  tablet: string[] | null = null;
  /**
   * The S key's screen while it is up (`manual.ts`), which the tab draws the pictures of: the
   * five panels of the section's wall material with its monsters standing in them.
   */
  sectionScreen: SectionScreen | null = null;
  /**
   * The town building the character is inside, whose picture stands on the screen for as long as
   * they are dealing with it (`town.ts`), or null when they are not in one.
   */
  buildingScreen: TownBuilding | null = null;
  /**
   * The section whose Shadow boss is taunting the character (`office.ts`), whose picture the tab
   * stands in a panel over the play screen, or null when no taunt is being read.
   */
  bossOffice: BossOffice | null = null;
  /**
   * The tunnel a module teleporter draws (`tunnel.ts`), which stands on the screen from the
   * crossing until the key that answers the arrival box, or null when nobody is crossing.
   */
  tunnel: ModuleTunnel | null = null;
  /**
   * The HIT ANY KEY plaque while the wait behind a message box is running: `blanked` for the hole
   * FUN_2000_3e73 (exe 2000:3e73) leaves in the screen while its delay counts out, and `showing`
   * once the plaque itself has been drawn on it.
   */
  plaque: PlaqueState | null = null;
  /**
   * DS:0437, which Ctrl-F puts up (exe 2000:d285): the loop takes F rather than reading a key,
   * so the character keeps swinging. `fight.ts` is what reads it here, and `defend` reads it in
   * the game itself, which is where the flag is kept.
   */
  get repeatFight(): boolean {
    return this.game.repeatFight;
  }

  set repeatFight(up: boolean) {
    this.game.repeatFight = up;
  }
  /** The monster the skull is standing over, until the loop draws the views again. */
  killed: KilledOnScreen | null = null;
  /**
   * The skull as it stood when the message timer was last asked to hold a screen.
   *
   * The original's skull is pixels on the screen, so it stands there through the delays
   * `kill_monster` counts out as surely as the words beside it do. The tab draws the skull from
   * the game as it is now rather than from the frame, and the loop is past the kill and has
   * cleared it long before those delays are up, so a kill that asks no menu would lose the skull
   * before the tab had drawn it once. This is what the frames are drawn with instead.
   */
  private killedWhileHeld: KilledOnScreen | null = null;
  /**
   * How many times the loop has drawn the four views, which is what the coin flip mirroring the
   * monster ahead is drawn from.
   *
   * The original flips that coin on its own generator, fresh for every view of every drawing
   * (exe 3000:2323). This port cannot: the tab redraws the screen whenever anything about it
   * changes, and spending the game's seeded generator per redraw would make a run unreplayable.
   * Counting the drawings gives a number that changes exactly as often as the original's draw
   * does, and the flip is worked out from it alone, so nothing of the game is spent and a
   * monster still turns to face the other way when the character moves.
   */
  viewsDrawn = 0;
  /** Where the character was standing when the views were last drawn, which is what movecontrol
   *  compares against to decide whether to draw them again. */
  private drawnFrom: { x: number; y: number; level: number; module: number; dir: number } | null = null;
  /**
   * The delays the game holds a drawn message for (exe 1000:2789), which the tab keeps to. The
   * loop runs straight past them; this is what decides which of the screens it drew is showing.
   */
  private readonly timed = new TimedScreens(() => this.changed());

  /** A ported function has called mgetch_message and is owed a key once it has finished. */
  private waitOwed = false;

  constructor(
    file: CharacterFile,
    rng: Rng,
    /** The run log this game is being written down in, or null for a game nobody is recording. */
    run: RunRecorder | null = null,
  ) {
    super(file, run);
    this.memory = new MapMemory(file.maps ?? null);
    const pc = loadPlayer(file.bytes);
    this.game = newGame({
      pc,
      rng,
      columns: UNFORGIVEN_AREA.columns,
      rows: UNFORGIVEN_AREA.rows,
      areaColumns: MAP_VIEW_COLUMNS,
      areaRows: MAP_VIEW_ROWS,
      monsterKinds: sectionMonsterKinds(sectionOf(pc.module, pc.level)),
      solid: (x, y, level, module) => bundledDungeon.solid(x, y, level, module),
      retdwall: (x, y, hv, level, module) => bundledDungeon.side(x, y, hv as 0 | 1, level, module),
      markKnown: (x, y) => this.memory.markKnown(x, y),
      key: () => this.key(),
      choice: (allowed) => this.choice(allowed),
      pressAnyKey: () => {
        this.waitOwed = true;
      },
      delay: (ms) => {
        this.killedWhileHeld = this.killed;
        this.timed.hold(this.game.screen, ms);
      },
    });
    // What the game says goes through print_menu_only, which is the message box; what it draws
    // with pfont is a screen. The two are kept apart here the way they are on the screen.
    const said = this.game.say;
    this.game.say = (...lines: string[]) => {
      this.showBox(lines);
      said(...lines);
    };
    // A tablet is a screen of its own rather than a box, and FUN_3000_9026 waits for a key at the
    // end of it (exe 3000:9081, the FUN_2000_412a call), which settle is where the port takes.
    this.game.tablet = (...lines: string[]) => {
      this.tablet = lines;
      said(...lines);
      // FUN_3000_9026 draws the slab and its lines on a screen it has already blanked and then
      // brings the palette up (exe 3000:9124), so the tablet arrives out of black.
      this.fadeScreen('in');
      this.waitOwed = true;
    };
    // movecontrol puts the map cursor in the middle of the view before its first pass. newGame
    // copies the record into a character of its own, so the cursor goes on that one.
    this.game.pc.mapCursorX = MAP_VIEW_COLUMNS >> 1;
    this.game.pc.mapCursorY = MAP_VIEW_ROWS >> 1;
    this.rows = UNFORGIVEN_MAP.floor(pc.level, pc.module);
    loadLevelMap(this.game, this.floors, this.rows, pc.level, this.game.rng);
    this.memory.enterFloor(pc.module, pc.level);
    this.memory.markArrival(this.rows, pc.x, pc.y);
    run?.watch(this.game.events, () => ({
      time: this.game.secondsElapsed,
      floor: this.game.pc.level,
      dungeon: this.game.pc.module,
    }));
  }

  protected override get frames(): HeldFrames {
    return this.timed;
  }

  /**
   * The `while (kbhit()) getch();` strike (exe 2000:7f2b) ends with: whatever the player typed
   * while the swing was on the screen is thrown away rather than answering the next turn.
   */
  override flushKeys(): void {
    if (this.keysWaiting === 0) return;
    super.flushKeys();
    this.repeatFight = false;
  }

  /** getch (exe 4000:417b): the next key, once there is one. */
  override key(): Promise<number> {
    // getch raises DS:4ec3, which movecontrol reads at 2000:c80a to put the repeat-fight flag
    // down: anything that reads the keyboard stops the character swinging on its own. It goes
    // down before the queue is looked at, so a key already typed puts it down as surely as one
    // the loop waits for.
    this.repeatFight = false;
    return super.key();
  }

  /**
   * get_choice (exe 2000:2d93): keys until one of the menu's own, or Escape — and then the eight
   * lines and the strip above them are wiped before the key is handed back (exe 2000:2e9a), so a
   * menu left with Escape goes off the screen at once.
   */
  async choice(allowed: number[]): Promise<number> {
    for (;;) {
      const key = await this.key();
      if (key !== KEY.escape && !allowed.includes(key)) continue;
      this.wipeMessageBlock();
      return key;
    }
  }

  /**
   * The wait at the top of a pass (exe 2000:c82d), which is Ctrl-F's as well as the keyboard's:
   * with the repeat-fight flag up the loop takes an F without reading anything (`fight.ts`).
   */
  protected override async waitForTheKey(): Promise<number> {
    // A replay takes Ctrl-F's swings from the log rather than making them again, and the flag is
    // what would have the loop take an F of its own here.
    if (this.run?.replaying) this.repeatFight = false;
    const repeating = this.repeatFight;
    const key = await readKey(this);
    // With the flag up the loop takes F without reading the keyboard, so that swing reaches the
    // run log here rather than through press.
    if (repeating) this.run?.unpressed(key);
    return key;
  }

  /**
   * The key a ported function asked for with mgetch_message while it was running. Synchronous
   * code cannot wait, so the wait is owed until the loop reaches somewhere it can take it.
   */
  async settle(): Promise<void> {
    while (this.waitOwed) {
      this.waitOwed = false;
      await this.keyWithPlaque();
      // The key the tablet was waiting on is what takes it off the screen (exe 3000:9086), and
      // FUN_4000_5c25 fades it away first (exe 3000:92fc). The frame the fade runs over is what
      // keeps it there while the game has already put it away.
      if (this.tablet !== null) this.fadeScreen('out');
      this.tablet = null;
      this.wipeMessageBlock();
    }
  }

  /**
   * The key FUN_2000_4054 (exe 2000:4054) waits for, with the plaque it waits behind.
   *
   * The rectangle beside the status block is blanked, `delay` (exe 1000:2789) counts 330 ms out
   * with that hole in the screen, and the plaque is drawn on it; the high speed option at DS:00c3
   * skips the delay, so with that on the plaque is there at once. The pause is a display timer of
   * the same kind the message delays are (`timed.ts`) and the game waits on nothing but the key.
   *
   * @param before the one thing that ever stands in front of that delay: the module tunnel turns
   *   the gradient bank 150 times before it prints its welcome (exe 4000:771b), and the plaque
   *   goes up after the welcome rather than with the tunnel.
   */
  private async keyWithPlaque(before?: { ms: number; then: () => void }): Promise<number> {
    const raisePlaque = (): void => {
      if (this.game.highSpeed) this.plaque = 'showing';
      else {
        this.plaque = 'blanked';
        this.timed.after(PLAQUE_DELAY_MS, () => {
          this.plaque = 'showing';
          this.changed();
        });
      }
      this.changed();
    };
    if (before === undefined) raisePlaque();
    else {
      this.timed.after(before.ms, () => {
        before.then();
        raisePlaque();
      });
    }
    try {
      const key = await this.key();
      // erase_message_block (exe 4000:430e) is the last thing FUN_2000_4054 does, and the last
      // thing FUN_2000_412a (exe 2000:412a) does for the tablet: anything else typed while the
      // box stood is thrown away, so the box after this one is not answered by a key meant for
      // this one.
      this.flushKeys();
      return key;
    } finally {
      this.timed.cancelAfter();
      this.plaque = null;
      this.changed();
    }
  }

  /**
   * FUN_4000_771b (exe 4000:771b) and the wait that follows it: the tunnel is drawn on a black
   * screen, the gradient bank is turned 150 times over it, "WELCOME TO MODULE" and the module's
   * numeral are printed on it, and FUN_4000_41e5 spins on the keyboard behind the plaque until a
   * key arrives. `tunnel.ts` is the drawing.
   *
   * Those 150 turns are a display timer of the same kind the plaque's own delay is: the original
   * spins in a loop that reads nothing, so the game waits for the key alone and the tab counts the
   * turns out. Two departures. `erase_message_block` (exe 4000:430e) throws away everything typed
   * while the tunnel is on the screen; here a key given during it gives up the rest of it and
   * answers the welcome, which is what a key does to every other screen the port holds. And that
   * key answers the welcome only: by the code the same one would go on to answer the arrival
   * box's wait as well, since FUN_2000_4054 reads the keyboard without draining it, but the real
   * game leaves the arrival box standing with its plaque up, so the port takes a key for each.
   */
  async crossToModule(module: number): Promise<void> {
    // The rings cover every pixel of the display (every row and every column has an edge on it),
    // so nothing printed before the crossing survives it; only the arrival box, printed after the
    // welcome's key, is ever on the tunnel.
    this.game.eraseScreen();
    this.box = [];
    this.tunnel = { module, welcome: false };
    this.changed();
    await this.keyWithPlaque({
      ms: TUNNEL_CRAWL_MS,
      then: () => {
        this.tunnel = { module, welcome: true };
      },
    });
  }

  /**
   * FUN_2000_4054 (exe 2000:4054, unf.c "FUN_2000_4054"), what it does once its key has arrived:
   * the eight lines are wiped with FUN_2000_2820 and the strip above them with FUN_2000_28be.
   *
   * That wait is what every eight-line message box is shown behind, so a box that asks for a key
   * stands only until it is given one.
   */
  wipeMessageBlock(): void {
    clearMenuBlock(this.game);
    clearMessageLine(this.game);
  }

  /**
   * FUN_4000_5b91 (exe 4000:5b91) and FUN_4000_5c25 (exe 4000:5c25): the screen brought up out of
   * black or taken down into it, a DAC step at a time (`fade.ts`).
   *
   * The original busy-waits its way through the steps and nothing about the game changes while it
   * does, so this is a held frame like every other delay: the screen as it stands is kept for as
   * long as the fade lasts, the loop runs straight past, and a key gives up the rest of it.
   */
  fadeScreen(fade: Fade): void {
    this.timed.hold(this.game.screen, fadeMs(fade), { fade, tablet: this.tablet });
  }

  /**
   * The two things movecontrol does about the battle banner before it draws anything else.
   *
   * At 2000:c602 a box defend printed over the banner is answered by printing it again. At
   * 2000:c613 a banner with nothing standing ahead of the character any more is taken down, and
   * whatever else was on the block goes with it.
   *
   * The original reaches engagement_timing on the first of those whatever is ahead, and reads
   * the six bytes in front of the monster table when nothing is; the port has nothing to read
   * there and puts the flag down without drawing.
   */
  settleBanner(): void {
    const game = this.game;
    if (game.reprintBattleInfo) {
      game.reprintBattleInfo = false;
      if (game.engagedAhead !== -1) engagementTiming(game);
    }
    if (!game.battleInfoOn || game.engagedAhead !== -1) return;
    game.battleInfoOn = false;
    this.wipeMessageBlock();
  }

  /**
   * FUN_2000_2f5d (exe 2000:2f5d, unf.c "FUN_2000_2f5d"): put a box up. It wipes the menu column
   * before it draws, so whatever a screen had left down that column goes with it, and it copies
   * all eight of its strings into the buffer, so a box replaces the box before it rather than
   * being added to.
   *
   * The tab draws this box over whatever screen the message timer is still holding, so the wipe
   * reaches those screens as well. The strip above the column is left on them, which is what
   * keeps a kill's own line showing while the box its drop printed is already up.
   */
  showBox(lines: string[]): void {
    clearMenuBlock(this.game);
    const box = MESSAGE_BOX_RECT;
    this.timed.wipe(box.x, MESSAGE_BOX_LINES_TOP, box.right, box.bottom);
    this.box = lines.slice(0, MESSAGE_BOX_LINES);
    // erase_message_block (exe 4000:430e), which FUN_2000_2f5d ends with: a box takes the
    // keyboard with it, so a key typed while the game was busy cannot answer the box that goes
    // up next.
    this.flushKeys();
  }

  /** Arriving on a floor: the floor itself, then its monsters. */
  enterFloor(level: number): void {
    const game = this.game;
    // Which section the character was in before the floor changes, since a section is five
    // floors and arriving on one of another section's is what brings its own monsters.
    const leaving = sectionNumber(game.pc.module, game.pc.level);
    game.engaged = -1;
    game.pc.level = level;
    this.rows = UNFORGIVEN_MAP.floor(level, game.pc.module);
    loadLevelMap(game, this.floors, this.rows, level, game.rng);
    this.memory.enterFloor(game.pc.module, level);
    this.memory.markArrival(this.rows, game.pc.x, game.pc.y);
    game.recenterMap = true;
    game.events.push({ kind: 'floorReached', floor: level });
    const section = sectionNumber(game.pc.module, level);
    if (section !== leaving) game.events.push({ kind: 'sectionReached', section });
    // load_level_map greets a character every time floor 0 is loaded (exe 2000:7687 tests
    // DS:2320, which nothing ever sets), so the snake's tablet is read on every arrival in town.
    greetTheTown(this);
  }

  /** load_player (exe 2000:7867): a record's bytes as the character. */
  protected override readRecord(bytes: Uint8Array): PlayerCharacter {
    return loadPlayer(bytes);
  }

  /** save_player (exe 2000:79ad): the character back into the record it came from. */
  protected override writeRecord(): Uint8Array<ArrayBuffer> {
    return savePlayer(this.game.pc, this.file.bytes);
  }

  /**
   * Where a record the save editor wrote leaves the character standing.
   *
   * A record that puts them on another floor arrives there the way the loop would, and one that
   * moves them about the floor they are on moves them on the occupancy grid with them.
   */
  protected override placeEdited(record: PlayerCharacter): void {
    const game = this.game;
    const pc = game.pc;
    const floor = pc.level;
    const module = pc.module;
    leaveSquare(game);
    Object.assign(pc, record);
    if (pc.level !== floor || pc.module !== module) {
      this.enterFloor(pc.level);
      return;
    }
    setMonsterMap(game, pc.x, pc.y, MAP_PLAYER);
    game.recenterMap = true;
  }

  /**
   * FUN_2000_ac9e (exe 2000:ac9e, unf.c "FUN_2000_ac9e"): the four 3-D views, as movecontrol
   * draws them.
   *
   * The loop draws them where it waits for a key, and only when the redraw flag (DS:c607) is up
   * or the character is not where they were when the views were last drawn; FUN_2000_ac9e puts
   * the flag down again as it draws. Anything else — a swing, a spell, a screen the key opened —
   * leaves the views exactly as they are, which is why the monster being fought does not turn
   * round between one blow and the next.
   *
   * The loop draws them only where no key is waiting (exe 2000:d0f2 tests kbhit before the
   * drawing), so keys typed ahead leave the views as they were: the map follows every step and
   * the views catch up once the keyboard is idle, which is what a slow machine showed.
   *
   * The port draws the screen from the game rather than leaving the last drawing on it, so what
   * this counts is the drawings the original would have made: {@link viewsDrawn} is the whole of
   * it, and the coin flip that mirrors the monster ahead is worked out from that number. The
   * place they were drawn from is what the screen draws them from in the meantime.
   */
  drawViews(): void {
    const pc = this.game.pc;
    const from = this.drawnFrom;
    const moved = from === null || from.x !== pc.x || from.y !== pc.y || from.level !== pc.level;
    if (!moved && !this.game.redrawView) return;
    if (this.keyWaiting()) return;
    this.game.redrawView = false;
    this.drawnFrom = { x: pc.x, y: pc.y, level: pc.level, module: pc.module, dir: pc.dir };
    this.viewsDrawn += 1;
    // movecontrol at 2000:cbed: the banner goes up again straight after the views, and nowhere
    // else on an ordinary pass. That is why it stands untouched while the character swings,
    // casts or opens a screen, and why it says what is in front of them the moment they move.
    if (this.game.engagedAhead !== -1) engagementTiming(this.game);
  }

  override finish(): void {
    this.timed.stop();
  }

  view(): PlayView {
    const game = this.game;
    const pc = game.pc;
    const facing = game.engagedAhead === -1 ? game.engaged : game.engagedAhead;
    const drawn = drawnMonsters(game, pc.level);
    const engaged = facing === -1 ? null : (drawn.find((monster) => monster.slot === facing) ?? null);
    const printed = this.timed.showing(game.screen);
    return {
      place: { x: pc.x, y: pc.y, floor: pc.level, module: pc.module, dir: pc.dir },
      hp: pc.hp,
      maxHp: pc.maxHp,
      sp: pc.sp,
      maxSp: pc.maxSp,
      level: pc.lev,
      exp: pc.exp,
      rows: this.rows,
      monsters: drawn,
      visible: drawn.filter((monster) => this.memory.isVisible(monster.x, monster.y)),
      box: messageBoxScreen({ box: this.box, drawn: printed }),
      // The expanded map has covered the display, so every line the game has drawn belongs to
      // that screen — including the two the X branch puts in the corner the message box stands
      // in, which erase_menu_block emptied on the way in.
      screen: this.expandedMap ? printed : screenTakenOver(printed),
      screenCleared: game.blackedOut,
      prompt: ladderPrompt(ladderUnder(game), pc.level === 0 ? buildingUnder(game) : 0),
      seconds: game.secondsElapsed,
      engaged,
      engagedFullHp: engaged === null ? 0 : this.floors.fullHp(engaged.slot, engaged.hp),
      engagedDebugLines: debugMonsterLines(game).map((line) => line.text),
      ahead: game.engagedAhead !== -1,
      killed: this.timed.holding ? this.killedWhileHeld : this.killed,
      viewsDrawn: this.viewsDrawn,
      viewsFrom: this.drawnFrom
        ? { x: this.drawnFrom.x, y: this.drawnFrom.y, floor: this.drawnFrom.level, module: this.drawnFrom.module, dir: this.drawnFrom.dir }
        : { x: pc.x, y: pc.y, floor: pc.level, module: pc.module, dir: pc.dir },
      expandedMap: this.expandedMap,
      tablet: this.timed.showingTablet(this.tablet),
      sectionScreen: this.sectionScreen,
      buildingScreen: this.buildingScreen,
      bossOffice: this.bossOffice,
      tunnel: this.tunnel,
      plaque: this.plaque,
      fade: this.timed.showingFade(),
      over: this.over,
      dead: this.dead,
      stopped: this.stopped,
      run: this.run?.summary() ?? null,
    };
  }
}

/** Start playing a character. */
export function startGame(file: CharacterFile, rng: Rng, run: RunRecorder | null = null): GameSession {
  const session = new GameSession(file, rng, run);
  greetTheTown(session);
  return session;
}

/**
 * FUN_3000_9488 (exe 3000:9488, unf.c "FUN_3000_9488"), which load_level_map calls on arriving
 * at floor 0: the snake's greeting, picked by the deepest floor the character has reached.
 */
function greetTheTown(session: GameSession): void {
  if (session.game.pc.level !== 0) return;
  const tablet = townTablet(session.game.pc.deepestFloor);
  if (tablet === null) return;
  session.game.events.push({ kind: 'tabletRead', entry: tablet, section: null });
  session.game.tablet(...tabletMessage(tablet));
}

/**
 * The keys movecontrol dispatches on, by the byte it reads. A key with no entry here is one the
 * original does nothing with either.
 */
export const KEY_HANDLERS: Record<number, KeyHandler> = {
  [KEY.arrowUp]: { c: 'movecontrol, the -0x48 branch', run: stepForward },
  [KEY.arrowDown]: { c: 'movecontrol, case 0 of the arrow switch', run: turnAround },
  [KEY.arrowLeft]: { c: 'movecontrol, case 5 of the arrow switch', run: turnLeft },
  [KEY.arrowRight]: { c: 'movecontrol, case 3 of the arrow switch', run: turnRight },
  [KEY.homeTurnLeft]: { c: 'movecontrol, the -0x47 branch', run: turnLeft },
  [KEY.pageUpTurnRight]: { c: 'movecontrol, case 7 of the arrow switch', run: turnRight },
  [KEY.enter]: { c: 'movecontrol, the 0x0d branch', run: waitAMoment },
  [KEY.down]: { c: 'movecontrol, the 0x64 branch, and change_module', run: goDown },
  [KEY.up]: { c: 'movecontrol, the 0x75 branch', run: goUp },
  [KEY.trapDoor]: { c: 'trapdoor_dest', run: goThroughTrapDoor },
  [KEY.dig]: { c: 'dig_hole', run: digHole },
  [KEY.quit]: { c: 'quit_game', run: quitGame },
  [KEY.help]: { c: 'FUN_3000_7dfc', run: (turn) => showHelp(turn.session) },
  [KEY.f1]: { c: 'FUN_3000_7dfc', run: (turn) => showHelp(turn.session) },
  [KEY.fight]: { c: 'strike', run: swingAtMonster },
  [KEY.repeatFight]: { c: 'movecontrol, the DS:0437 repeat flag', run: keepSwinging },
  [KEY.cast]: { c: 'cast_a_spell', run: castFromSpellbook },
  [KEY.useItem]: { c: 'movecontrol, case 0x69, and use_magic_item', run: useAnItem },
  [KEY.viewPrepSpells]: { c: 'view_prep_spells', run: showPrepSpells },
  [KEY.viewBattleSpells]: { c: 'view_battle_spells', run: showBattleSpells },
  [KEY.armor]: { c: 'movecontrol, the 0x61 branch', run: changeArmor },
  [KEY.weapon]: { c: 'movecontrol, the 0x77 branch', run: changeWeapon },
  [KEY.expNeeded]: { c: 'FUN_2000_7bcd', run: showExpNeeded },
  [KEY.viewStats]: { c: 'view_stats', run: showStats },
  [KEY.pockets]: { c: 'FUN_3000_7545', run: lookInPockets },
  [KEY.money]: { c: 'show_money', run: countTheMoney },
  [KEY.loseItem]: { c: 'lose_item', run: dropSomething },
  [KEY.monsterManual]: { c: 'monster_manual', run: readTheMonsterManual },
  [KEY.options]: { c: 'movecontrol, the 0x6f branch', run: openOptions },
  [KEY.graphics]: { c: 'movecontrol, the 0x67 branch', run: openGraphics },
  [KEY.expandMap]: { c: 'movecontrol, the 0x78 branch', run: expandTheMap },
  [KEY.zoomView]: { c: 'movecontrol, the 0x7a branch', run: zoomTheView },
};

/**
 * movecontrol's 0x0d branch: leave the square and arrive on it again, which spends a moment
 * without going anywhere.
 */
function waitAMoment(turn: Turn): void {
  leaveSquare(turn.game);
  turn.game.redrawView = true;
  arriveSquare(turn.game);
  turn.game.events.push({ kind: 'waited' });
}

/**
 * movecontrol (exe 2000:c308, unf.c "movecontrol"): the loop. It comes back when the character
 * quits or dies, which is where the original goes back to the character select screen.
 */
export async function runMoveControl(session: GameSession): Promise<void> {
  const game = session.game;
  const pc = game.pc;
  // load_level_map greets a character arriving in the town with the snake's stone tablet, and
  // FUN_3000_9026 waits for a key of its own at the end of it, all before movecontrol has run a
  // pass. That tablet is the only thing that can be owed a key this early.
  if (session.tablet) await session.settle();
  for (;;) {
    // The save editor can write the record while the game is being played, and the top of a pass
    // is where the game takes it: nothing of the original's runs across it, and everything the
    // pass works out about the character and the square is worked out afterwards.
    session.takeEdits();
    if (pc.sp < 0) pc.sp = 0;
    if (pc.maxSp < 0) pc.maxSp = 0;
    // The original tests the top half of the 32-bit crystal count, so what it zeroes is a count
    // that has gone negative.
    if (pc.crystals < 0) pc.crystals = 0;
    if (pc.fillOnLoad === 1) {
      pc.fillOnLoad = 0;
      pc.hp = pc.maxHp;
      pc.sp = pc.maxSp;
    }
    const deathBeforeTheKey = deathBoxes(session);
    if (deathBeforeTheKey !== null) {
      await died(session, deathBeforeTheKey);
      return;
    }
    game.enemyDir = -1;
    // The views are drawn again below, which is what takes the skull off the last monster killed.
    session.killed = null;
    // movecontrol (unf.c:15405) marks the square under the character's feet before it works
    // anything else out about it.
    session.memory.markStep(pc.x, pc.y);
    const turn = beginTurn(session);
    if (turn.ladder === 0 && turn.trapdoor === -1 && pc.level > 0) {
      const chute = chuteUnder(game);
      if (chute !== pc.level) {
        await fallDownChute(turn, chute);
        continue;
      }
    }
    attackTiming(game);
    if (game.engaged === -1) pc.sleepTimer = 0;
    // DS:2519: while a monster is engaged, the box on the screen is one that goes with the
    // character's next step (FUN_2000_bcb6).
    if (game.engaged !== -1) game.boxLeavesWithSquare = true;
    session.settleBanner();
    if (pc.deepestFloor < pc.level) pc.deepestFloor = pc.level;
    // Every square the four 3-D views draw is marked. The original marks them only on a pass it
    // draws the views on, which marks the same squares either way — the geometry has not
    // changed — and only leaves the monsters on the screen a moment stale. This marks them every
    // pass, so the monsters that can be seen are the ones standing there now.
    session.memory.markViews(session.rows, pc.x, pc.y);
    session.drawViews();
    const key = await session.keyOrEdit();
    // The square the pass was worked out from is the one the record has just replaced, so the
    // pass starts again rather than answering a key with what the character used to be.
    if (key === RECORD_EDITED) continue;
    // movecontrol wipes nothing where it takes its key, so the last thing said stands in the box
    // until a box, a menu or one of the wipes above paints over it.
    const handler = KEY_HANDLERS[key];
    session.run?.dispatched();
    if (handler) await handler.run(turn);
    await session.settle();
    if (session.over) return;
    await killTheDead(session);
    // movecontrol at 2000:dbe9 asks whether the character is dead between the kill and the step,
    // and asks again at the top of the loop, which is where a step that killed them is caught.
    const deathAfterTheKill = deathBoxes(session);
    if (deathAfterTheKill !== null) {
      await died(session, deathAfterTheKill);
      return;
    }
    await resolveStep(turn);
    await session.settle();
    // The record goes back to the roster after every key, so a player can always come back to
    // where they were (John, 2026-09-09); the game's own save points are unchanged.
    session.save();
    // FUN_2000_c28b (exe 2000:c28b): the map has scrolled off the character, so the view is
    // drawn again with them back in the middle of it.
    if (game.recenterMap) {
      pc.mapCursorX = game.areaColumns >> 1;
      pc.mapCursorY = game.areaRows >> 1;
      game.recenterMap = false;
    }
  }
}

/** What movecontrol works out about the square the character is standing on, in its order. */
function beginTurn(session: GameSession): Turn {
  const game = session.game;
  const turn: Turn = {
    session,
    game,
    ladder: ladderUnder(game),
    trapdoor: -1,
    building: 0,
    sides: session.rows[game.pc.y][game.pc.x],
    step: { dx: 0, dy: 0 },
  };
  if (turn.ladder !== 0) return turn;
  if (game.pc.level === 0) turn.building = buildingUnder(game);
  if (turn.building !== 0) return turn;
  turn.trapdoor = trapdoorUnder(game);
  // The box goes up on every pass round the loop, and the door is forgotten without its key.
  if (turn.trapdoor !== -1 && !explainTrapdoor(game, turn.trapdoor)) turn.trapdoor = -1;
  return turn;
}

/**
 * The check movecontrol makes after every hit and every kill, which `checkDeath` (exe 2000:c474)
 * answers: the snake says where the character has gone, and the loop hands back to what called
 * it, which is where the original puts the player back on the character select screen.
 *
 * FUN_2000_9232 prints two of UH.BIN's messages, each of which ends "HIT ANY KEY" and waits for
 * one, so both go up in turn.
 *
 * Nothing is written to the character's file, here or in the original: what is on disk is
 * whatever the last save point left there. The roster marks the character dead and keeps them.
 */
function deathBoxes(session: GameSession): string[][] | null {
  let dead = false;
  const boxes = boxesOf(session, () => {
    dead = checkDeath(session.game);
  });
  return dead ? boxes : null;
}

/** The messages the death printed, in turn, and then the loop hands back. */
async function died(session: GameSession, boxes: string[][]): Promise<void> {
  for (const box of boxes) {
    session.showBox(box);
    await session.key();
  }
  session.die();
  session.over = true;
  session.changed();
}
