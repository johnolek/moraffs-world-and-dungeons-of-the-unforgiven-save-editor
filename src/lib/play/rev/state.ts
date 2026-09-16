import type { JournalEvent } from '../../game/journal-events';
import type { Rng } from '../../game/port/rng';
import { RevMapMemory } from './memory';
import { RevMonsters, type RevWalker } from './monsters';
import { RevKeptScreen } from './screen/kept';
import type { RevTextRun } from './screen/text-screen';
import { REV_VALUE, revValue, type RevPc } from './record';

/**
 * The dungeon's own variables: what DUNSMALL.EXE keeps in DGROUP while a character is being
 * played, and the two places it writes words to.
 *
 * Every field names the address it stands for. The character's own numbers are in
 * {@link RevPc}; this is everything else the loop reads and writes.
 */

/**
 * What is on the screen after a `CLS`, until the dungeon is drawn over it again.
 *
 * `null` is the game's own screen. `bare` is a screen with nothing on it but what has been
 * printed since it was cleared, which is what death, the quit, the pause and the magic table
 * leave. `map` is the treasure's, which puts the flat map and the close-up box back before it
 * prints (1000:A896 calls 1000:580F and 1000:6BAF).
 */
export type RevClearedScreen = 'bare' | 'map';

/** Where the four 3-D views on the screen were drawn from, which is what the redraw remembers. */
export interface RevDrawnFrom {
  level: number;
  column: number;
  row: number;
  /** 1 north, 2 east, 3 south, 4 west, the way the move code numbers the compass. */
  facing: number;
}

/** Something worth writing down about a run, which `../run.ts` counts as an action or keeps as a
 *  milestone. */
export type RevEvent =
  | { kind: 'bossKilled'; boss: number }
  | { kind: 'gameWon' }
  /** A turn where the character stands, which costs them nothing. `facing` is the journal's own
   *  numbering, 0 north, 1 south, 2 west, 3 east. */
  | { kind: 'turned'; facing: number }
  /**
   * A ladder taken, up or down (1000:0DAF and 1000:0DE0). `falseFloor` is a square a chute last
   * landed the character on, which gives way under them: it is the same key, the same one level
   * down, and one action either way.
   */
  | { kind: 'ladderTaken'; to: number; falseFloor: boolean }
  /** A chute fallen down (1000:3428): the square it opened under and the floor it landed on. */
  | { kind: 'chuteTaken'; from: { column: number; row: number }; to: number }
  /** A step a monster stood in the way of (1000:33EA), which only ever happens inside a fight.
   *  `direction` is the journal's own numbering. */
  | { kind: 'wayBlocked'; direction: number }
  /** A spellbook a kill left (1000:AA18), which is the only way a character is taught a spell. */
  | { kind: 'spellLearned'; set: 'prep' | 'battle'; level: number; name: string }
  /** A wand a kill left (1000:B156), by the colour and the charges it came with. */
  | { kind: 'wandFound'; colour: string; charges: number }
  /** Death undone (1000:A0C2): the character was carried out and raised, or came back as
   *  somebody else. */
  | { kind: 'raised'; how: 'raised' | 'reincarnated' }
  /** One of the three potions a fight counts down running out (1000:85BA). */
  | { kind: 'potionWoreOff'; potion: string }
  /** The treasure a character walked into the bank with, turned into jewel pieces at face
   *  value (1000:22F7). */
  | { kind: 'treasureSold'; amount: number }
  /** Every coin the character was carrying thrown away by the A key (1000:1918), which is how
   *  they go quiet again without walking back to the bank. */
  | { kind: 'treasureDropped'; amount: number }
  /**
   * One of the things a run journal reports (`src/lib/game/journal-events.ts`), which is also
   * where the kinds a run counts as actions carry their numbers.
   */
  | JournalEvent;


/** What a fight holds while it is running (1000:8223). */
export interface RevFight {
  /** DGROUP B69C: the slot of the monster being fought, which is the whole monster. */
  slot: number;
  /** DGROUP B6DC: which of the dungeon's twenty-two names it is. */
  name: number;
  /** DGROUP B6B4: its level. */
  monsterLevel: number;
  /** DGROUP B6E4: the hit points it has left in this fight. */
  hitPoints: number;
  /** DGROUP B6F4: its kind, 1 to 7. */
  kind: number;
  /** DGROUP B6F0: what the kind adds to the number a swing has to beat. */
  kindAdjust: number;
  /** DGROUP B6F8: what the kind adds to its own chance of swinging back. */
  attackBonus: number;
  /** DGROUP B6FA: the experience killing it is worth, worked out once when it is met. */
  experience: number;
}

/** DUNSMALL.EXE part way through a dungeon: the character, the level and what is being said. */
export interface RevGame {
  pc: RevPc;
  /** DGROUP B466: the character's name, which the original reads out of `F5.COM` and the
   *  statistics screen puts in its heading. Here it is the roster entry's. */
  name: string;
  rng: Rng;
  monsters: RevMonsters;
  memory: RevMapMemory;
  /** DGROUP B6B4 outside a fight: the level of the last monster met, which the clock reads and
   *  which the kill sets to the dungeon level. */
  lastMonsterLevel: number;
  /** DGROUP B69C: the slot the last fight was against. 1000:8068, where a monster is met, is the
   *  only place that writes it, so it goes on naming that monster once the fight is over — which
   *  the monsters' own turn reads (`monsters.ts`). */
  lastFought: number;
  /** DGROUP B524: 0 for the turning arrows the game starts in, 1 for the compass arrows of the
   *  flat map. `revArrowMode` in `keys.ts` is where the test the game makes on it is read. */
  arrowMode: number;
  /** DGROUP B474: the steps the character has taken, counted 1 to 16 and round to 1 again
   *  (1000:3187 with 1000:0A4F). It is the clock the fight's own Speed and Strength run out on
   *  and nothing else uses it. */
  steps: number;
  /**
   * DGROUP B4C2: the rings of health do not heal on this key.
   *
   * Their test at 1000:4049 is the only thing in the whole game that reads it, and the per-key
   * routine puts it back to zero on its way out (1000:40F7). The loop's own re-entry sets it
   * (1000:0636), and so do a turn (1000:0627), the four move routines when a wall stops the
   * step (1000:315A, 321F, 32E1 and 339F), the statistics screen (1000:1A00) and three places
   * inside a fight (1000:809C, 8F8B and A39E). What is left over is a step that went through,
   * a step the edge of the floor stopped, and C, P, T and W.
   */
  ringsHeldBack: boolean;
  /** DGROUP B5B2: the spell level last typed at a cast prompt, which the wands that cast a
   *  spell for nothing charge the character for again (1000:9555). */
  spellLevel: number;
  /** DGROUP B6CE: what a wand has put on the character's next swing, once (1000:8CC5). */
  swingBonus: number;
  /** DGROUP B726: the monster was sent away rather than killed, which is why `Go Away!' does
   *  not say "YOU KILLED IT!!" (1000:A4CD). */
  monsterLeft: boolean;
  /**
   * DGROUP B748 and B746: this kill can leave a wand behind, and a pill.
   *
   * 1000:A335 reads them off the monster's kind while the fight is still up — kind 5 leaves
   * either, kind 7 a wand alone — and 1000:ABB5 and 1000:ABF4 spend them once it is down.
   */
  dropsAWand: boolean;
  dropsAPill: boolean;
  /** The monster died on this key, whichever of the weapon, the spell and the grenade killed it,
   *  so that the loop knows to offer what it dropped (1000:A4E7). */
  killed: boolean;
  /** `TIMER`: how long this game has been played, in seconds, which is what the three potions
   *  that wear off are timed against (1000:8977). The original reads the wall clock; here it is
   *  the monsters' own clock, so it runs while the level does. */
  seconds: number;
  /** DGROUP B4C6: the feature under the character — negative for a ladder up, 1 to 3 for a
   *  ladder down, 0 for a chute, and over 3 for open ground. */
  feature: number;
  /** DGROUP B4CE, B4D6 and B4DA: the square a chute last dropped the character on, which is
   *  what makes a false floor. */
  chuteLanding: { column: number; row: number; level: number } | null;
  /** DGROUP B50E with B69C: the fight, or null when there is none. */
  fight: RevFight | null;
  /** The lines the loop has printed since the last key, which the tab shows as a box. */
  said: string[];
  /** 1000:06D2's line of advice, which the loop prints on its own row at the top of every pass
   *  and which nothing the keys do writes over. */
  advice: string[];
  /** The line the ladder, the chute and the rope put under the map (1000:56D0). */
  prompt: string | null;
  /** What a fight is saying, which the original draws over the top of the screen rather than in
   *  the message box. */
  banner: string[];
  /** What the game has printed on the screen and not painted over (`screen/kept.ts`). Nothing
   *  here is read back by the game: it is only what the tab draws. */
  kept: RevKeptScreen;
  /** The screen has been cleared and the dungeon has not been drawn over it yet, so what is on
   *  it is what has been printed since (`screens.ts`). */
  cleared: RevClearedScreen | null;
  /**
   * DGROUP B660, B662, B664 and B65E: the level, column, row and facing the four 3-D views on
   * the screen were last scanned and drawn from (1000:59B9).
   *
   * The redraw compares them against where the character is now to work out how much of the
   * screen it has to draw again, and `screens.ts` is where that comparison is. BASIC starts all
   * four at zero, and level zero is the town, so the first redraw of a session finds the column
   * and the row disagree instead.
   */
  lastDrawn: RevDrawnFrom;
  /** The eighty-column text page the help puts the display into (`screen/text-screen.ts`), or
   *  null while the game is in `SCREEN 1` — which is everywhere else. */
  textScreen: RevTextRun[] | null;
  /** Things worth writing into a run log. */
  events: RevEvent[];
  /** The loop has come back: the character has quit or died. */
  over: boolean;
  /** A ported function is owed a key it could not wait for. */
  keyOwed: boolean;
  /**
   * DGROUP B730: the character's own numbers have changed under them, which in the whole game is
   * only ever the second dungeon's stomper taking a quarter of their hit points (1000:9DBB) or
   * one of its three drains (1000:9EE3, 9F14 and 9F40).
   *
   * 1000:9F84 spends it on two seconds for the player to read what changed and then a flush of
   * the keyboard, so that the keys they typed while reading are not acted on.
   */
  numbersChanged: boolean;
  /**
   * DGROUP B542: the delay 1000:0F00 asks for, which the original busy-waits in before a redraw
   * (1000:412A) so that several movement keys can be typed ahead of it. Nothing here busy-waits,
   * but the number is read: a run of held arrows takes the same fraction off the time the tab's
   * screen takes to appear as it takes off this wait (`pace.ts`).
   */
  enterDelay: number;
  /** DGROUP B46E: the colour the screen is drawn on, 0 to 16 (1000:0FF5). */
  background: number;
  /** DGROUP B472: the palette, which starts at 2 (1000:017D); an even number is the first of the
   *  two `SCREEN 1` palettes. */
  palette: number;
  /** DGROUP B4BC: 0 with the sound on and 1 with it off (1000:1055, and the `PLAY` at
   *  1000:05CB that reads it). */
  sound: number;
  /**
   * DGROUP B6CC: how many more of the monster's swings are held off. The fourth wand adds ten
   * (1000:7C3C) and a swing counts one off (1000:9A2F).
   */
  paralysis: number;
  /**
   * DGROUP B2AE, B72C and B2AA: what the monster's last swing rolled, the armour class it had to
   * beat and the damage it did.
   *
   * They outlive the swing because 1000:9A7C reads all three before writing them: a monster of
   * kind 3 that is stuck to the character throws its damage again against the roll its last
   * swing made.
   */
  monsterSwing: { roll: number; armourClass: number; damage: number };
  /**
   * DGROUP B706: what the potion of shielding (1000:9971) adds for a hundred seconds to the
   * number the monster's swing has to beat.
   */
  shield: number;
  /**
   * DGROUP 52FC, the compiler's scratch cell, which hundreds of statements write and one reads
   * back without writing it first: the monster's d20 at 1000:9A96 accumulates into it where the
   * character's at 1000:8A14 assigns. It is here because that bug needs somewhere to live.
   */
  scratch: number;
  say(...lines: string[]): void;
  /** 1000:2F71: the blocking wait a ported function asks for and cannot take itself. */
  pressAnyKey(): void;
  /** 1000:2FCB: whatever has been typed and not read yet is thrown away, which the original does
   *  with eighteen `INKEY$` reads. The session is what has a keyboard to empty. */
  flushKeys(): void;
  /** 1000:2F1A and 1000:2F35: leave the screen as it is for this long, which the original spends
   *  in a busy loop and the port spends in a display timer (`held.ts`). Nothing of the game
   *  waits; the session is what has a screen to hold. */
  delay(ms: number): void;
}

/** What a character has to be for the monsters to take a turn against them. */
export function revWalker(game: RevGame): RevWalker {
  const pc = game.pc;
  return {
    column: pc.column,
    row: pc.row,
    facing: pc.facing,
    level: pc.dungeonLevel,
    generation: pc.generation,
    weight: pc.weight,
    invisible: revValue(pc, REV_VALUE.invisibility),
    fighting: game.fight === null ? 0 : 1,
    fought: game.lastFought,
    lastMonsterLevel: game.lastMonsterLevel,
  };
}

/** A dungeon as it stands the moment a character is loaded into it. */
export function newRevGame(
  pc: RevPc,
  rng: Rng,
  memory: RevMapMemory = new RevMapMemory(),
  name = '',
): RevGame {
  const game: RevGame = {
    pc,
    name,
    rng,
    monsters: new RevMonsters(),
    memory,
    lastMonsterLevel: 0,
    lastFought: 0,
    arrowMode: 0,
    ringsHeldBack: false,
    steps: 1,
    spellLevel: 0,
    swingBonus: 0,
    monsterLeft: false,
    dropsAWand: false,
    dropsAPill: false,
    killed: false,
    seconds: 0,
    feature: 50,
    chuteLanding: null,
    fight: null,
    said: [],
    advice: [],
    prompt: null,
    banner: [],
    kept: new RevKeptScreen(),
    cleared: null,
    lastDrawn: { level: 0, column: 0, row: 0, facing: 0 },
    textScreen: null,
    events: [],
    over: false,
    keyOwed: false,
    numbersChanged: false,
    enterDelay: 0,
    background: 0,
    palette: 2,
    sound: 0,
    paralysis: 0,
    monsterSwing: { roll: 0, armourClass: 0, damage: 0 },
    shield: 0,
    scratch: 0,
    say(...lines: string[]) {
      game.said.push(...lines);
      // On a cleared screen the game prints at the cursor and BASIC moves it down a row for
      // every line, so what is said is where it lands rather than in the message rows.
      if (game.cleared !== null) for (const line of lines) game.kept.print(line);
    },
    pressAnyKey() {
      game.keyOwed = true;
    },
    flushKeys() {
      // A game with no session around it has no keyboard to empty; `engine.ts` puts one here.
    },
    delay() {
      // A game nobody is drawing has no screen to hold; `engine.ts` puts one here.
    },
  };
  return game;
}
