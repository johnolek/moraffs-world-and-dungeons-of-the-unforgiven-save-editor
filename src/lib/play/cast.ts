import { callCheckEng } from '../game/port/combat';
import { ARMOR_NAMES, WEAPON_NAMES } from '../game/port/drops';
import {
  castSpell,
  castTypeAllowed,
  drawCastTypeMenu,
  drawSpellList,
  drawWriteSpellLevelMenu,
  drawWriteSpellSlotMenu,
  drawWriteSpellTypeMenu,
  showSpellHelp,
  spellCost,
  spellListChoice,
  writeSpellLevelChoice,
  CAST_PAPER,
  CAST_SCROLL,
  CAST_SPELLBOOK,
  CAST_WAND,
} from '../game/port/inventory';
import { useMagicItem } from '../game/port/drops';
import { passMoment } from '../game/port/moment';
import {
  anyKeyChoice,
  clearMenuBlock,
  clearMessageLine,
  clearRect,
  drawMenu,
  getChoice,
  gmenuChoice,
  type MenuChoice,
} from '../game/port/screens';
import type { Game, SpellChoice } from '../game/port/state';
import type { Turn } from './engine';
import { printMenus } from './boxes';
import { gearMenuLines } from './gear';
import { drinkAPotion } from './potions';

/**
 * cast_a_spell (exe 2000:e017, unf.c "cast_a_spell"), the whole of it: the menu of the eight
 * lists, the thirty spells of the list that was picked, and the spell itself.
 *
 * The screens are ported in `src/lib/game/port/inventory.ts`, each split into the part that
 * draws and the part that says what one key means; this is the loop between them, and the time
 * movecontrol spends on the spell afterwards.
 */

/**
 * Read keys the way the game's menu readers do: past every key the reader makes nothing of, and
 * then the eight lines and the strip above them are wiped before the answer is handed back,
 * Escape or not (mset_gmenu at exe 2000:2c8f and get_choice at 2000:2e9a both end with
 * FUN_2000_2820 and FUN_2000_28be).
 */
async function menuChoice(
  game: Game,
  reader: (key: number) => MenuChoice,
): Promise<number | 'escape'> {
  for (;;) {
    const choice = reader(await game.key());
    if (choice === null) continue;
    clearMenuBlock(game);
    clearMessageLine(game);
    return choice;
  }
}

/**
 * What cast_a_spell wipes before it leaves the spell table, whichever way it leaves it: the
 * miniature layout takes the menu column and the line above it back, and the big one clears the
 * top of the screen it drew the table over.
 *
 * The big one's wipe is another fill in colour 0 (exe 2000:f90d), and what puts the screen back
 * is movecontrol drawing the four views, the key menu and the map again on its next pass. The
 * port draws a fresh screen every time the tab draws, so all this has to do is take the table's
 * lines off and leave nothing blacked out behind them.
 */
function clearSpellList(game: Game, mini: boolean): void {
  if (mini) {
    clearMenuBlock(game);
    clearMessageLine(game);
    return;
  }
  clearRect(game, 0, 0, 0x640, 0x21c);
}

/**
 * cast_a_spell (exe 2000:e017, unf.c "cast_a_spell"): cast a spell out of `source`, which is the
 * spellbook for the C key and a scroll, a wand or a sheet of paper for the I key.
 *
 * What comes back is the seconds of game time the cast took, which movecontrol is what spends
 * them on. A cast that gave up took none: a menu escaped, a list the character's class is
 * refused, a description read off one of the four help lists, the layout switched, or a spell
 * there were not the points for.
 */
export async function castASpell(turn: Turn, source: number): Promise<number> {
  const { game, session } = turn;
  if (!drawCastTypeMenu(game, source)) {
    game.pressAnyKey();
    return 0;
  }
  const line = await menuChoice(game, (key) => gmenuChoice(1, 8, key));
  if (line === 'escape') return 0;
  const type = line - 1;
  if (!castTypeAllowed(game, source, type)) {
    game.pressAnyKey();
    return 0;
  }
  drawSpellList(game, source, type, session.miniSpellMenu);
  game.redrawView = true;
  for (;;) {
    const choice = spellListChoice(game, source, type, await game.key());
    if (choice.kind === 'ignored') continue;
    clearSpellList(game, session.miniSpellMenu);
    if (choice.kind === 'switchLayout') {
      session.miniSpellMenu = !session.miniSpellMenu;
      return 0;
    }
    if (choice.kind === 'escape') return 0;
    if (type < 4) {
      return await castPickedSpell(turn, source, type, choice.level, choice.slot);
    }
    // The four help lists show a description and wait; mset_gmenu called with a first of -1 takes
    // whatever key is pressed, escape included, and the description stays on the screen.
    showSpellHelp(game, type - 4, choice.level, choice.slot);
    anyKeyChoice(await game.key());
    return 0;
  }
}

/**
 * The rest of cast_a_spell once a spell has been picked, which hands back the seconds the spell
 * took.
 *
 * A spell that moves the character to another floor is loaded onto it here: the original's
 * spell_effect calls load_level_map itself, which the port records as an event instead — see the
 * port README's second departure — so the session lays the new floor out.
 */
async function castPickedSpell(
  turn: Turn,
  source: number,
  type: number,
  level: number,
  slot: number,
): Promise<number> {
  const { game, session } = turn;
  const affordable = source !== CAST_SPELLBOOK || spellCost(level) <= game.pc.sp;
  if (affordable) await askSpellQuestion(game, type, level, slot);
  const floorBefore = game.pc.level;
  // What a spell says about itself — the damage it did, the refusal it printed instead — goes
  // through print_menu_only (exe 2000:309e), which waits for a key at the end of every box.
  const result = await printMenus(session, () =>
    castSpell(game, source, type, level, slot, session.battleSpellsShown),
  );
  session.battleSpellsShown = result.battleSpellsShown;
  if (game.pc.level !== floorBefore) session.enterFloor(game.pc.level);
  return result.seconds;
}

/**
 * movecontrol (exe 2000:c308, unf.c "movecontrol"), its 0x63 branch (exe 2000:d525 to 2000:d5a5):
 * the C key, which casts out of the spellbook, spends what the cast took and lets one moment of
 * the game go by.
 *
 * A cast that took no time is skipped whole: escaping the menus moves nothing on the floor.
 */
export async function castFromSpellbook(turn: Turn): Promise<void> {
  const { game } = turn;
  const seconds = await castASpell(turn, CAST_SPELLBOOK);
  if (seconds === 0) return;
  spendCastSeconds(game, seconds);
  passMoment(game);
  game.redrawView = true;
}

/**
 * movecontrol (exe 2000:c308, unf.c "movecontrol"), the arithmetic both cast keys do on the
 * seconds cast_a_spell hands back (exe 2000:d536 and 2000:d655): give every monster standing
 * beside the character the attacks that time buys.
 *
 * Under a minute is spent in one go and anything longer a minute at a time. Ten hours, which is
 * what a permanent spell costs, is longer than either branch will spend, so a permanent spell
 * buys the monsters nothing at all.
 *
 * The decompilation loses the number each call_check_eng is given. The disassembly has it: the
 * seconds themselves at 2000:d536, and 60 at 2000:d655.
 */
function spendCastSeconds(game: Game, seconds: number): void {
  if (seconds < 60) callCheckEng(game, seconds);
  else if (seconds < 30000) {
    for (let minute = 0; minute < Math.trunc(seconds / 60); minute += 1) callCheckEng(game, 60);
  }
}

/** The five lines of the menu the I key puts up (exe DS:1ed7 06f0 1eeb 1ef5 1efd 1f06 1f16). */
const ITEM_MENU = [
  'WHICH TYPE OF ITEM?',
  '',
  '1) SCROLL',
  '2) WAND',
  '3) PAPER',
  '4) MAGIC POTION',
  '5) OTHER',
];

/** Which source each of the first three lines casts out of. */
const ITEM_MENU_SOURCES = [CAST_SCROLL, CAST_WAND, CAST_PAPER];

/**
 * movecontrol (exe 2000:c308, unf.c "movecontrol"), its 0x69 branch: the I key, which asks what
 * kind of item is being used and casts out of it.
 *
 * The first three lines are cast_a_spell over the scrolls, the wands and the sheets of paper,
 * and a scroll or a sheet is used up where a wand loses one of its charges. The fourth line is
 * the potion menu (exe 3000:7052) and the fifth is use_magic_item (exe 2000:b202), the six
 * things a kill turns up.
 *
 * movecontrol draws "USE MAGIC MENU:" one line above the box first (exe 2000:d5b0), in the colour
 * at DS:0435, which is white and nothing ever writes to.
 */
const MAGIC_MENU_HEADING = { text: 'USE MAGIC MENU:', x: 0x3a2, y: 0x301, font: 0, colour: 15 };

export async function useAnItem(turn: Turn): Promise<void> {
  const { game } = turn;
  clearMessageLine(game);
  game.draw(MAGIC_MENU_HEADING);
  game.say(...ITEM_MENU);
  const line = await menuChoice(game, (key) => getChoice(2, 6, key));
  game.eraseScreen(MAGIC_MENU_HEADING.y);
  if (line === 'escape') return;
  const source = ITEM_MENU_SOURCES[line - 1];
  if (source !== undefined) {
    // The I key spends the seconds and stops there (exe 2000:d615 to 2000:d684), where the C key
    // also passes a moment of the game. It does not ask whether the cast took any time either,
    // so a cast given up on still runs the engagement check with nought seconds, which matters
    // because that check draws a random number for every monster on the floor while Slow Enemies
    // is standing.
    spendCastSeconds(game, await castASpell(turn, source));
    return;
  }
  if (line === 5) {
    await useMagicItem(game);
    return;
  }
  await drinkAPotion(turn);
}

/**
 * The question a spell stops to ask before it does anything, which spell_effect (exe 3000:e1b8)
 * asks from inside itself.
 *
 * `Game.chooseWeapon`, `chooseArmor`, `chooseSpell` and `chooseDirection` are the four hooks the
 * ported spells call for those menus, and none of them can wait for a key: a spell is ordinary
 * synchronous code. So the menu is put up here instead, in the same place in the cast the spell
 * would have put it up — before anything else the spell does, and after the spell point check
 * cast_a_spell makes — and the answer is handed to the hook.
 */
type SpellQuestion =
  /** enchant_weapon_perm (exe 3000:d148): which of the eight weapons to put the plus on. */
  | { kind: 'weapon' }
  /** enchant_armor_perm (exe 3000:d211): the same over the eight suits of armor. */
  | { kind: 'armor' }
  /** write_scroll_or_wand (exe 3000:d384): which spell to write, down to `maxLevel`. */
  | { kind: 'writeSpell'; maxLevel: number }
  /** pass_wall (exe 3000:e003): which way to walk. */
  | { kind: 'direction' };

/**
 * The thirteen permanent spells that ask something, by `level * 3 + slot`, in the order
 * permanentList (`magic.ts`, spell_effect's case 0) dispatches them.
 */
const PERMANENT_QUESTIONS: Record<number, SpellQuestion> = {
  0: { kind: 'weapon' }, // ENCHANT WEAPON LEVEL 1
  2: { kind: 'writeSpell', maxLevel: 3 }, // WRITE SCROLL TO LEVEL 3
  3: { kind: 'armor' }, // ENCHANT ARMOR LEVEL 1
  5: { kind: 'writeSpell', maxLevel: 3 }, // ENCHANT WAND LEVEL 3
  6: { kind: 'weapon' }, // ENCHANT WEAPON LEVEL 2
  9: { kind: 'armor' }, // ENCHANT ARMOR LEVEL 2
  11: { kind: 'writeSpell', maxLevel: 10 }, // WRITE SCROLL - LEVEL 10
  12: { kind: 'weapon' }, // ENCHANT WEAPON LEVEL 3
  15: { kind: 'armor' }, // ENCHANT ARMOR LEVEL 3
  17: { kind: 'writeSpell', maxLevel: 8 }, // ENCHANT WAND LEVEL 8
  21: { kind: 'weapon' }, // ENCHANT WEAPON LEVEL 4
  22: { kind: 'armor' }, // ENCHANT ARMOR LEVEL 4
  23: { kind: 'writeSpell', maxLevel: 10 }, // ENCHANT WAND ANY LEVEL
};

/** What the spell at that place in one of the four lists asks, or null for the ones that ask
 *  nothing. Pass Wall is the seventh wizard line's second slot and the fifth priest line's third. */
function spellQuestion(type: number, level: number, slot: number): SpellQuestion | null {
  if (type === 0) return PERMANENT_QUESTIONS[level * 3 + slot] ?? null;
  if (type === 2 && level === 6 && slot === 1) return { kind: 'direction' };
  if (type === 3 && level === 4 && slot === 2) return { kind: 'direction' };
  return null;
}

/** Ask the spell's own menu, if it has one, and leave the answer where the spell will find it. */
async function askSpellQuestion(
  game: Game,
  type: number,
  level: number,
  slot: number,
): Promise<void> {
  const question = spellQuestion(type, level, slot);
  if (question === null) return;
  if (question.kind === 'direction') {
    const direction = await chooseDirection(game);
    game.chooseDirection = () => direction;
    return;
  }
  if (question.kind === 'writeSpell') {
    const spell = await chooseSpell(game, question.maxLevel);
    game.chooseSpell = () => spell;
    return;
  }
  const gear = await chooseGear(game, question.kind);
  if (question.kind === 'weapon') game.chooseWeapon = () => gear;
  else game.chooseArmor = () => gear;
}

/** The menu pass_wall (exe 3000:e003) prints (exe DS:3d56 258b 3d6a 3d78 3d88 3d98 3da7 258b). */
const DIRECTION_MENU = [
  'SELECT A DIRECTION:',
  '',
  '1) NORTH (UP)',
  '2) SOUTH (DOWN)',
  '3) EAST (RIGHT)',
  '4) WEST (LEFT)',
  '5) CANCEL SPELL (ESCAPE)',
];

/** What pass_wall makes of an escape: the same as its own fifth line, which cancels the spell. */
const CANCEL_DIRECTION = 5;

/** pass_wall (exe 3000:e003, unf.c "pass_wall"), the menu it reads: 1 north, 2 south, 3 east, 4
 *  west, 5 cancel. */
async function chooseDirection(game: Game): Promise<number> {
  game.say(...DIRECTION_MENU);
  const chosen = await menuChoice(game, (key) => getChoice(2, 6, key));
  return chosen === 'escape' ? CANCEL_DIRECTION : chosen;
}

/**
 * enchant_weapon_perm (exe 3000:d148, unf.c "enchant_weapon_perm") and enchant_armor_perm (exe
 * 3000:d211): the menu of the eight slots, and which one the plus goes on. It is the menu the A
 * and W keys build, which `gear.ts` holds the lines of.
 */
async function chooseGear(game: Game, kind: 'weapon' | 'armor'): Promise<number | null> {
  const pc = game.pc;
  const lines =
    kind === 'weapon'
      ? gearMenuLines(WEAPON_NAMES, pc.weaponsOwned, pc.weaponPlus)
      : gearMenuLines(ARMOR_NAMES, pc.armorOwned, pc.armorPlus);
  drawMenu(game, lines);
  const chosen = await menuChoice(game, (key) => gmenuChoice(1, 8, key));
  return chosen === 'escape' ? null : chosen;
}

/** The line of the slot menu that goes back to the level menu, which escape does as well. */
const PREVIOUS_MENU = 4;

/**
 * write_scroll_or_wand (exe 3000:d384, unf.c "write_scroll_or_wand"), the three menus it walks
 * through: the kind of spell, its level, and which of the three spells on that line.
 *
 * Escape on the first menu gives the spell up; on the second it goes back to the first, and on
 * the third — like its own fourth line — back to the second.
 *
 * The decompilation keeps only the first of the two numbers the type menu's get_choice is given;
 * the three lines the menu draws are what the port takes the keys from.
 */
async function chooseSpell(game: Game, maxLevel: number): Promise<SpellChoice | null> {
  for (;;) {
    drawWriteSpellTypeMenu(game);
    const type = await menuChoice(game, (key) => getChoice(2, 4, key));
    if (type === 'escape') return null;
    for (;;) {
      drawWriteSpellLevelMenu(game, maxLevel);
      const level = await menuChoice(game, (key) => writeSpellLevelChoice(maxLevel, key));
      if (level === 'escape') break;
      drawWriteSpellSlotMenu(game, type, level, maxLevel);
      const slot = await menuChoice(game, (key) => gmenuChoice(1, 4, key));
      if (slot === 'escape' || slot === PREVIOUS_MENU) continue;
      return { type, level, slot: slot - 1 };
    }
  }
}
