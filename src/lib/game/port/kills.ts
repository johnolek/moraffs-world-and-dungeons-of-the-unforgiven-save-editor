import { expValue } from './combat';
import {
  ARMOR_NAMES,
  WEAPON_NAMES,
  dropArmor,
  dropMoney,
  dropPaper,
  dropScroll,
  dropSpellbook,
  dropWand,
  dropWeapon,
  findItem,
  itemMenu,
  MENU_ROWS,
  POTION_NAMES,
  postKillHeal,
  postKillSp,
  showHint,
} from './drops';
import { sectionNumber } from './hints';
import { playDeath, playMonsterKilled } from './sound';
import { checkGainLevel } from './levels';
import { MESSAGE_LINE_Y, clearMessageLine, messageLine } from './screens';
import type { Game } from './state';
import { MAP_EMPTY, monsterSeen, setMonsterMap } from './state';

// The message text is the exact bytes of the game's own strings, read out of the data segment of
// the unpacked executable. The comment on each say call gives the address of every line it
// prints, in order; dotu-tools/reference/scripts/exe_strings.py reads them back.

/** The square a dead monster's slot is parked on, off the 80 x 110 floor and out of the way. */
export const GARBAGE_CAN = 100;

/** How many sections the game's floors are divided into. The last one's Shadow boss is the
 *  Shadow Ogeroth on floor 100 of module V, and killing it is the end of the game. */
const SECTIONS = 20;

/** The colour kill_monster draws the orb menu's heading in (exe 3000:b72b). */
const ENHANCE_HEADING_COLOUR = 5;

/**
 * The colour kill_monster draws each of its own three messages in (exe 3000:b164).
 *
 * All three go on the one line above the message box, and each is preceded by FUN_2000_28be
 * (exe 2000:28be) wiping whatever was there.
 */
const KILL_MESSAGE_COLOUR = 8;

/**
 * How long kill_monster leaves "YOU KILLED IT!" on the screen before wiping the line
 * (exe 3000:b18a and 3000:b198): the high speed option picks the shorter of the two.
 */
const KILLED_IT_MS = 1050;
const KILLED_IT_MS_HIGH_SPEED = 400;

/**
 * The pause kill_monster takes with the line already wiped, before it says anything about what
 * the monster was carrying (exe 3000:b503).
 */
const BEFORE_THE_FIND_MS = 750;

/**
 * How long "YOU FIND..." stands before the line is wiped and the find itself is worked out
 * (exe 3000:b536). The high speed option skips this one rather than shortening it.
 */
const FIND_MS = 3000;

/**
 * The beat kill_monster settles for with the last of its boxes off the screen, before it tells a
 * new character that they are hurt or have earned a level (exe 3000:bcf6). The high speed option
 * skips it along with the two messages behind it.
 */
const KILL_SETTLE_MS = 500;

/**
 * kill_monster (exe 3000:b12d, unf.c "kill_monster"): the menu a section boss's orb puts up, and
 * the row of the weapon or armor table it comes back with.
 *
 * It asks again until the answer is a row the character actually owns, so there is no way out of
 * it: Escape is one of the answers it throws away.
 */
async function chooseEnhanced(
  game: Game,
  heading: string,
  names: string[],
  owned: number[],
  plus: number[],
): Promise<number> {
  for (;;) {
    game.say(...itemMenu(names, owned, plus, false));
    game.draw(messageLine(heading, ENHANCE_HEADING_COLOUR));
    const row = (await game.choice(MENU_ROWS)) - 0x31;
    if (row >= 0 && row < MENU_ROWS.length && owned[row] > 0) {
      // erase_message_block (exe 4000:430e) takes the heading back off the screen.
      game.eraseScreen(MESSAGE_LINE_Y);
      return row;
    }
  }
}

/** The heading over the orb menu for each of the two things an orb can be used on. */
const ENHANCE_ARMOR = 'SELECT THE ARMOR TO ENHANCE:'; // DS:3277
const ENHANCE_WEAPON = 'SELECT A WEAPON TO ENHANCE:'; // DS:3294

/** kill_monster (exe 3000:b12d): the orb menu of armor, and the plus it leaves behind. */
async function enhanceArmor(game: Game, plus: number): Promise<void> {
  const pc = game.pc;
  const row = await chooseEnhanced(game, ENHANCE_ARMOR, ARMOR_NAMES, pc.armorOwned, pc.armorPlus);
  pc.armorPlus[row] = plus;
}

/** kill_monster (exe 3000:b12d): the same menu of weapons. */
async function enhanceWeapon(game: Game, plus: number): Promise<void> {
  const pc = game.pc;
  const row = await chooseEnhanced(game, ENHANCE_WEAPON, WEAPON_NAMES, pc.weaponsOwned, pc.weaponPlus);
  pc.weaponPlus[row] = plus;
}

/**
 * kill_monster (exe 3000:b12d, unf.c "kill_monster"), the flag and the message every section
 * boss shares: the module's byte gains the bit for this section, and the snake explains what was
 * won.
 */
function bossBeaten(game: Game, bit: number, hint: number): void {
  game.pc.objective[game.pc.module] |= bit;
  showHint(game, hint);
}

/**
 * kill_monster (exe 3000:b12d, unf.c "kill_monster"): the reward for the twenty-second monster
 * of a section, which is that section's Shadow boss. `section` is 0 to 19.
 *
 * Four of the twenty hand over an orb that puts a plus on one weapon or one suit of armor, which
 * the character picks off a menu of what they own. The last of them, the Shadow Ogeroth on floor
 * 100 of module V, is the end of the game and says so at length.
 */
export async function bossReward(game: Game, section: number): Promise<void> {
  const pc = game.pc;
  switch (section) {
    case 0:
      bossBeaten(game, 1, 60);
      pc.maxHp += 30;
      pc.hp += 30;
      return;
    case 1:
      bossBeaten(game, 2, 61);
      pc.wis += 12;
      return;
    case 2:
      bossBeaten(game, 4, 62);
      pc.str += 12;
      return;
    case 3:
      bossBeaten(game, 8, 63);
      await enhanceArmor(game, 25);
      return;
    case 4:
      bossBeaten(game, 1, 64);
      pc.bodyArmor = 9;
      return;
    case 5:
      bossBeaten(game, 2, 65);
      pc.gauntlet = 12;
      return;
    case 6:
      bossBeaten(game, 4, 66);
      pc.protRing = 15;
      return;
    case 7:
      bossBeaten(game, 8, 67);
      await enhanceWeapon(game, 25);
      return;
    case 8:
      bossBeaten(game, 1, 68);
      pc.luck += 10;
      return;
    case 9:
      bossBeaten(game, 2, 69);
      pc.con += 10;
      return;
    case 10:
      bossBeaten(game, 4, 70);
      pc.iq += 10;
      return;
    case 11:
      bossBeaten(game, 8, 71);
      pc.seeingStones += 10;
      return;
    case 12:
      bossBeaten(game, 1, 72);
      pc.bodyArmor = 25;
      return;
    case 13:
      bossBeaten(game, 2, 73);
      pc.gauntlet = 50;
      return;
    case 14:
      bossBeaten(game, 4, 74);
      pc.protRing = 50;
      return;
    case 15:
      bossBeaten(game, 8, 75);
      await enhanceArmor(game, 50);
      return;
    case 16:
      bossBeaten(game, 1, 76);
      pc.maxHp += 300;
      pc.hp += 300;
      return;
    case 17:
      bossBeaten(game, 2, 77);
      pc.dex += 20;
      return;
    case 18:
      bossBeaten(game, 4, 78);
      pc.str += 25;
      return;
    case 19:
      pc.objective[pc.module] |= 8;
      // DS:32b0 32cd 32ea 3305 3324 3342 335d 337a
      game.say(
        'THE GROUND BEGINS TO RUMBLE,',
        'AND SUDDENLY THE BODY OF THE',
        'GREAT SHADOW OGEROTH TURNS',
        'INTO A TINY CAT WHICH SCURRIES',
        "AWAY, MEOWING 'I'LL BE BACK!'",
        'YOU HAVE DEFEATED THE MOST',
        'POWERFUL MONSTER IN DUNGEONS',
        'OF THE UNFORGIVEN!',
      );
      // DS:338d 33a9 33c1 33dd 33f9 340c 3428 3444
      game.say(
        '  FINALLY! YOU NOW HAVE THE',
        'MIGHTY ORB OF EXPLOSIVE',
        'WEAPON ENHANCEMENT. IT WILL',
        'TURN ANY WEAPON INTO A PLUS',
        '101 ATTACK WEAPON!',
        '  THIS GREAT WEAPON IS ONLY',
        'TO BE USED FOR WHATEVER YOU',
        'WANT TO USE IT FOR!',
      );
      await enhanceWeapon(game, 101);
      // DS:3458 3474 348c 34a7 34c1 34db 34f8 3511
      game.say(
        '  YOU HAVE BEATEN THE GREAT',
        'SHADOW OGEROTH. YOU MAY',
        'CONTINUE TO WANDER THROUGH',
        'THE DUNGEONS IN SEARCH OF',
        'LOOT AND TREASURE, OR YOU',
        'MAY ATTEMPT TO COMPLETE THIS',
        'GREAT ADVENTURE WITH NEW',
        'AND DIFFERENT CHARACTERS.',
      );
  }
}

/**
 * kill_monster (exe 3000:b12d, unf.c "kill_monster"), what killing a level drainer is worth on
 * top of the experience: a potion most of the time, and otherwise the trap door key for this
 * stretch of five floors if the character has not got it yet.
 *
 * The roll is against 375 and the floor plus 175, so the key becomes likelier the shallower the
 * floor: on floor 1 a drainer carries a key almost half the time and by floor 200 never. Which
 * floor that roll counts, which floors carry a key at all, and where the character's keys are
 * kept, are the game's rules; the game's own count the floor itself and reach floors 4 to 178,
 * which is well past the deepest floor it has.
 */
export function drainerBonus(game: Game): void {
  const pc = game.pc;
  const keys = game.rules.keys;
  if (game.rng.random(375) < keys.oddsFloor(pc.level) + 175) {
    const potion = game.rng.random(6);
    pc.potions[potion] += 1;
    game.events.push({ kind: 'found', find: { what: 'potion', item: POTION_NAMES[potion] } });
    showHint(game, 47 + potion);
    return;
  }
  // The number on the key, which is the floor rounded down to the five its trap doors share.
  const label = Math.trunc(pc.level / 5) * 5;
  if (keys.flag(pc, pc.level) === 1 || !keys.foundOn(pc.level)) return;
  // DS:31c2, 31dd 2668 with the number between them, 258b, 31f0, 320a, 3224, 258b, 3236
  game.say(
    '  YOU HAVE FOUND A KEY! IT',
    `IS LABELED NUMBER ${label}.`,
    '',
    '  THIS KEY WILL ALLOW YOU',
    'TO USE TRAP DOORS LABELED',
    'WITH THIS NUMBER.',
    '',
    '      HIT ANY KEY...',
  );
  keys.take(pc, pc.level);
  game.events.push({ kind: 'found', find: { what: 'key', key: label } });
}

/**
 * kill_monster (exe 3000:b12d, unf.c "kill_monster"): everything that happens the moment the
 * engaged monster's hit points run out — the experience, the level drainer's potion or key, the
 * monster's slot being emptied, the seven drop rolls, and a section boss's reward.
 *
 * The slot is emptied before any of the drops are rolled, and drop_weapon and drop_armor roll
 * against the level of the monster in that slot, so both of them are always rolling against the
 * empty slot's level of zero rather than against the monster that was just killed.
 *
 * The two messages at the end — that the character is hurt, and that they have earned a level —
 * are only given while the character is still level 0, which is the level a new one starts at.
 *
 * The two-note chime is the first thing it does, so the player hears the kill before reading it.
 */
export async function killMonster(game: Game): Promise<void> {
  playMonsterKilled(game);
  const pc = game.pc;
  const slot = game.engaged;
  const monster = game.monsters[slot];
  const kind = game.monsterKinds[monster.type];
  const kindIndex = monster.type;
  if (kind.special !== 6) {
    clearMessageLine(game);
    game.draw(messageLine('YOU KILLED IT!', KILL_MESSAGE_COLOUR)); // DS:31b3
    game.delay(game.highSpeed ? KILLED_IT_MS_HIGH_SPEED : KILLED_IT_MS);
    clearMessageLine(game);
  }
  const experience = expValue(game, slot);
  pc.exp += experience;
  game.events.push({ kind: 'killed', monster: monsterSeen(game, slot), experience });
  if (kind.levelDrain > 0) drainerBonus(game);
  setMonsterMap(game, monster.x, monster.y, MAP_EMPTY);
  monster.x = GARBAGE_CAN;
  monster.y = GARBAGE_CAN;
  monster.hp = 0;
  monster.type = 0;
  monster.level = 0;
  game.redrawView = true;
  await dropWeapon(game);
  await dropArmor(game);
  dropMoney(game);
  postKillHeal(game);
  postKillSp(game);
  if (pc.cls !== 2) {
    const easier = pc.cls === 0 || pc.cls === 5 ? 400 : 0;
    // The roll that decides whether anything is found is a Random call (exe 3000:b4c2); the
    // three under it, and the two the drainer's bonus makes above, are written inline.
    if (game.randomCall(950 - easier) < pc.level + 40) {
      if (game.rng.random(20) < pc.level) {
        game.delay(BEFORE_THE_FIND_MS);
        clearMessageLine(game);
        game.draw(messageLine('YOU FIND...', KILL_MESSAGE_COLOUR)); // DS:324b
        if (!game.highSpeed) game.delay(FIND_MS);
        clearMessageLine(game);
        if (game.rng.random(3) === 1) {
          game.draw(messageLine('NOTHING! (HIT ANY KEY)', KILL_MESSAGE_COLOUR)); // DS:3257
          game.pressAnyKey();
        } else {
          findItem(game);
        }
      }
    }
  }
  if (!dropSpellbook(game)) {
    switch (game.rng.random(3)) {
      case 0:
        dropScroll(game);
        break;
      case 1:
        dropWand(game);
        break;
      case 2:
        dropPaper(game);
        break;
    }
  }
  if (kindIndex === 22) {
    const section = sectionNumber(game.rules, pc.module, pc.level);
    if (section < SECTIONS) {
      game.events.push({ kind: 'bossKilled', boss: section });
      if (section === SECTIONS - 1) game.events.push({ kind: 'gameWon' });
      await bossReward(game, section);
    }
  }
  // DS:2519: whatever the kill left in the box goes with the character's next step.
  game.boxLeavesWithSquare = true;
  game.engaged = -1;
  if (game.highSpeed) return;
  game.delay(KILL_SETTLE_MS);
  if (pc.lev !== 0) return;
  if (pc.hp + 15 < pc.maxHp) showHint(game, pc.cls === 0 ? 79 : 80);
  if (checkGainLevel(game)) showHint(game, 81);
}

/**
 * FUN_2000_9232 (exe 2000:9232): the character dies. The hit points go to -100, the snake says
 * where the character has gone, and one of five parting shots is picked at random.
 *
 * The original then reloads the floor around the body; the port records nothing, the way the
 * ported spells that change floor do.
 *
 * The dirge is the first thing it does, before the snake says anything.
 */
export function playerDies(game: Game): void {
  playDeath(game);
  // The monster being fought is what killed the character, and there is none where a poison or
  // a disease finished them.
  const killer = game.engaged === -1 ? null : monsterSeen(game, game.engaged);
  game.events.push({ kind: 'died', monster: killer, floor: game.pc.level, dungeon: game.pc.module });
  game.pc.hp = -100;
  showHint(game, 26);
  // A Random call (exe 2000:9248), and the only roll this function makes.
  showHint(game, 117 + game.randomCall(5));
}

/**
 * movecontrol (exe 2000:c308, unf.c "movecontrol") at 2000:c474 and 2000:dbe9: the check it makes
 * after being hit and after a kill. Answers whether the character is dead, which is what makes
 * movecontrol hand 0xff back to main and end the game.
 *
 * The test is against zero rather than against one, so a character sitting on exactly zero hit
 * points is alive. The original asks the same question again after {@link playerDies} has run,
 * which by then has written -100.
 */
export function checkDeath(game: Game): boolean {
  if (game.pc.hp >= 0) return false;
  playerDies(game);
  return game.pc.hp < 0;
}
