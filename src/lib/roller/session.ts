import { rollChar } from '../game/port/character';
import { BorlandRng, type Rng } from '../game/port/rng';
import type { Game, PlayerCharacter, ScreenLine } from '../game/port/state';
import { newGame } from '../game/port/state';

/**
 * One of the places a roller stops: the questions the three games ask, and the key each of them
 * waits for with a screen up, which takes any answer at all.
 */
export type Question =
  | 'difficulty'
  | 'race'
  | 'keepRerollDesign'
  | 'designStat'
  | 'name'
  | 'class'
  | 'continue'
  | 'revRace'
  | 'revKeep'
  | 'revClass';

/** An answer to one of them: the number a menu takes, or the name that was typed. */
export type Answer = number | string;

/** Where the roller has got to, for a screen to draw. */
export interface RollerView<Line = ScreenLine, Pc = PlayerCharacter> {
  /** What the game is showing, in the order the lines were drawn. */
  screen: Line[];
  /** What the roller is waiting for, or null once the character is finished. */
  question: Question | null;
  /**
   * The race the menu's pointer is sitting on, which is the one it draws in reverse, in the game
   * whose race menu is walked with the arrow keys; null in the two whose menus are answered by
   * number.
   */
  race: number | null;
  /** How many columns wide the screen is, in the game that prints on a text grid; null in the
   *  two that draw theirs as vectors instead. */
  width: number | null;
  pc: Pc;
}

/** What the session knows that the game does not: what it is waiting for, and where the race
 *  menu's pointer is. */
export interface RollerState {
  question: Question | null;
  race: number | null;
}

/** What a port needs to start one roll. */
export interface RollerSetup {
  /** The character number the roll is for, the way the game's own select screen picks one. */
  slot: number;
  rng: Rng;
  /**
   * time (exe 1000:1d12) as the roll sees it: the second the roll was started in, which
   * `roll_char` reseeds from (exe 3000:5447), or null for a roll that reseeds nothing.
   *
   * It answers the same second all through a roll, and through the roll being run again from the
   * top after each answer, which is what makes such a roll reproducible.
   */
  seconds: (() => number) | null;
  /** Which race the menu's pointer is on, for the game whose race menu is walked; the other two
   *  never look at it. */
  race: number;
  /** The next answer to `question`, which throws when there is none yet. */
  take(question: Question): Answer;
}

/**
 * One game's roller: how to start it, how to run it, and what to show of it.
 *
 * `Game` is that game's own state and `View` its own view, so a port hands the session a game
 * only the port itself looks inside.
 */
export interface RollerPort<Game, View> {
  newGame(setup: RollerSetup): Game;
  rollChar(game: Game): void;
  view(game: Game, state: RollerState): View;
  /** The race menu's pointer, in the game whose menu is walked rather than numbered: the
   *  question it belongs to and how many races it goes round. */
  racePointer?: { question: Question; races: number };
}

/**
 * Math.random behind the port's `Rng`, keeping every draw so a run can be played again.
 *
 * The game's `Random(n)` cuts an integer in 0..n-1 out of a uniform fraction, and so does this;
 * the fraction is Math.random's rather than the sawtooth a 1993 PC's reseeded generator produced.
 * The fractions are remembered because {@link RollerSession} runs roll_char again from the top
 * after every answer, and the character has to come out the same each time.
 *
 * A roll given a wall clock uses `BorlandRng` and the second instead, and needs none of this: the
 * second is the whole of what the roll is made of.
 */
export class RecordedRandom implements Rng {
  private position = 0;

  constructor(private readonly drawn: number[]) {}

  random(n: number): number {
    if (this.position === this.drawn.length) this.drawn.push(Math.random());
    return Math.trunc(this.drawn[this.position++] * n);
  }
}

/** Thrown out of a question the session has no answer for yet. */
class NeedsAnswer {
  constructor(readonly question: Question) {}
}

/**
 * A game's character roller driven from a screen.
 *
 * The ports ask their questions by calling into the game and carrying straight on with the
 * answer, which a screen cannot do: it has to stop and wait for a click. So the session answers
 * from the answers given so far and throws when it runs out of them. Adding the next answer runs
 * the roller again from the top, and it arrives back at the same place with the same character,
 * because every random number the earlier run drew was kept and is handed back in the same order.
 */
export class RollerSession<Game, View> {
  private answers: Answer[] = [];
  private readonly drawn: number[] = [];
  private game: Game;
  private question: Question | null = null;
  /** Where the race menu's pointer is, which the arrow keys move and Return takes. */
  private race = 1;
  /**
   * The second this roll was started in, which `roll_char` seeds its generator from, and null for
   * a roll asked for without a wall clock.
   *
   * It is the whole of what such a roll is made of, so it is what to keep with the finished
   * character if the roll is ever to be made again.
   */
  rolledAt: number | null;

  /** `slot` is the character number the game picks before rolling: 20 to 29 in Dungeons of the
   *  Unforgiven, 0 to 9 in Moraff's World, and in Moraff's Revenge 1 to 10, which names the two
   *  files the roll writes. `wallClock` is the second a roll starts in, which the original seeds
   *  from; a roller asked for without one draws from Math.random instead. */
  constructor(
    private readonly port: RollerPort<Game, View>,
    readonly slot: number,
    private readonly wallClock: (() => number) | null = null,
  ) {
    this.rolledAt = this.wallClock?.() ?? null;
    this.game = this.run();
  }

  /** Answer the question the roller is waiting on and let it carry on. */
  answer(value: Answer): void {
    if (this.question === null) return;
    if (this.onRacePointer()) this.race = Number(value);
    this.answers.push(value);
    this.game = this.run();
  }

  /**
   * Move the race menu's pointer, the way the right and left arrows move it: one race on, round
   * to the first past the last and to the last before the first. The two games whose race menus
   * are answered by number have no pointer to move.
   */
  moveRace(step: number): void {
    const pointer = this.port.racePointer;
    if (pointer === undefined || !this.onRacePointer()) return;
    const moved = this.race + step;
    this.race = moved > pointer.races ? 1 : moved < 1 ? pointer.races : moved;
    this.game = this.run();
  }

  /** Take the race the pointer is on, which is what Return does. */
  takeRace(): void {
    if (this.onRacePointer()) this.answer(this.race);
  }

  /** Throw the character away and roll another from the very first screen. */
  restart(): void {
    this.answers = [];
    this.drawn.length = 0;
    this.race = 1;
    this.rolledAt = this.wallClock?.() ?? null;
    this.game = this.run();
  }

  view(): View {
    return this.port.view(this.game, {
      question: this.question,
      race: this.port.racePointer === undefined ? null : this.race,
    });
  }

  /** Whether the roller is waiting at the menu the pointer belongs to. */
  private onRacePointer(): boolean {
    return this.port.racePointer !== undefined && this.question === this.port.racePointer.question;
  }

  private run(): Game {
    let next = 0;
    const take = (question: Question): Answer => {
      if (next === this.answers.length) throw new NeedsAnswer(question);
      return this.answers[next++];
    };
    const second = this.rolledAt;
    const game = this.port.newGame({
      slot: this.slot,
      rng: second === null ? new RecordedRandom(this.drawn) : new BorlandRng(second),
      seconds: second === null ? null : () => second,
      race: this.race,
      take,
    });
    this.question = null;
    try {
      this.port.rollChar(game);
    } catch (thrown) {
      if (!(thrown instanceof NeedsAnswer)) throw thrown;
      this.question = thrown.question;
    }
    return game;
  }
}

/** Dungeons of the Unforgiven's roll_char as a session drives it. */
export const ROLLER_PORT: RollerPort<Game, RollerView> = {
  newGame: (setup) =>
    newGame({
      slot: setup.slot,
      rng: setup.rng,
      seconds: setup.seconds,
      // The map view the game is showing while a character is rolled, which is what it halves to
      // place the map cursor. These are its dimensions in the three biggest video modes.
      areaColumns: 0x13,
      areaRows: 0x21,
      askDifficulty: () => setup.take('difficulty') as number,
      askRace: () => setup.take('race') as number,
      askKeepRerollDesign: () => setup.take('keepRerollDesign') as number,
      askDesignStat: () => setup.take('designStat') as number,
      askName: () => setup.take('name') as string,
      askClass: () => setup.take('class') as number,
      pressAnyKey: () => {
        setup.take('continue');
      },
    }),
  rollChar,
  view: (game, state) => ({ screen: game.screen, question: state.question, race: state.race, width: null, pc: game.pc }),
};
