import { giveHint } from './hints';
import { computeWeight } from './magic';
import { clearMessageLine, messageLine } from './screens';
import type { Game } from './state';

// The message text is the exact bytes of the game's own strings, read out of the data segment of
// the unpacked executable. The comment on each say call gives the address of every line it
// prints, in order; dotu-tools/reference/scripts/exe_strings.py reads them back.

/** The name column of the weapon table (exe DS:01a0, one every 7 bytes). */
export const WEAPON_NAMES = [
  'FIST',
  'STICK',
  'CLUB',
  'MACE',
  'KNIFE',
  'SHORTSWORD',
  'LONG SWORD',
  'GREAT SWORD',
];

/** The name column of the armor table (exe DS:01f4, one every 5 bytes). */
export const ARMOR_NAMES = [
  'SKIN',
  'LEATHER',
  'CHAIN',
  'SCALE',
  'BREAST PLATE',
  'FIELD PLATE',
  'TITANIUM',
];

/**
 * What each of the six potion counts at record offset 0x15d is a potion of, in the order the
 * counts are kept in.
 *
 * The names are UH.BIN's own: {@link drainerBonus} shows message `47 + the count's own place` as
 * it hands one over, and those six messages are "YOU FOUND AN ORANGE POTION!" and its five
 * fellows.
 */
export const POTION_NAMES = [
  'ORANGE POTION',
  'GREEN POTION',
  'BLUE POTION',
  'RED POTION',
  'WHITE POTION',
  'YELLOW POTION',
];

/**
 * The twelve things find_item turns up, in the order it rolls them, named as the UH.BIN message
 * each is handed over with names it: 31 to 41, then 43 and 44.
 */
const FOUND_ITEM_NAMES = [
  'NUCLEAR HAND GRENADE',
  'STONE OF TELEPORTATION',
  'STONE OF SEEING',
  'FLOOR SLOSHER',
  'POTION OF HEALING',
  'RING OF REGENERATION',
  'BOOK OF STRENGTH',
  'BOOK OF INTELLIGENCE',
  'BOOK OF WISDOM',
  'BOOK OF CONSTITUTION',
  'BOOK OF DEXTERITY',
  'BOOK OF LUCK',
];

/** The six lines of the menu use_magic_item puts up (UH.BIN 23), in the order it numbers them. */
const MAGIC_ITEM_NAMES = [
  'FLOOR SLOSHER',
  'POTION OF HEALING',
  'BECOME GOD',
  'STONE OF SEEING',
  'STONE OF TELEPORTATION',
  'NUCLEAR HAND GRENADE',
];

/**
 * give_hint (exe 2000:313a, unf.c "give_hint") followed by the wait at 2000:4054: show one of
 * UH.BIN's eight-line messages and keep it up until a key is pressed. `giveHint` in `hints.ts`
 * reads the lines; `say` drops the blanks the message ends with.
 */
export function showHint(game: Game, index: number): void {
  game.say(...giveHint(index));
}

/**
 * get_choice (exe 2000:2d93) under the two-line menu drop_weapon and drop_armor put up: '1' takes
 * what was found and '2' leaves it. Escape leaves it too, since the original only tests for '1'.
 */
const TAKE = 0x31;
const LEAVE = 0x32;

/** get_choice's Escape, the one answer it takes outside the run of digits a menu is numbered in. */
const ESCAPE = 0x1b;

/** The keys a menu of eight lines is answered with (exe 2000:2b08, mset_gmenu). */
export const MENU_ROWS = [0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38];

/** The keys a menu numbered 1 to 3 is answered with, which is both of lose_item's own. */
const THREE_WAYS = [0x31, 0x32, 0x33];

/** The keys the six-line menu use_magic_item puts up is answered with. */
const SIX_ITEMS = [0x31, 0x32, 0x33, 0x34, 0x35, 0x36];

/**
 * The eight lines lose_item (exe 2000:98b7) and the orb menu of kill_monster (exe 3000:b12d)
 * both build out of the weapon or the armor table: the name of a row the character owns and the
 * plus it carries, and a row of dashes for a row they do not own.
 *
 * Neither number shows without a plus, so a plain suit of armor is named and nothing more, and
 * `countOwned` is the one difference between the two — lose_item puts how many are owned after
 * the plus and kill_monster does not.
 *
 * Both loops run over eight rows though the armor table has seven, so the last row of an armor
 * menu reads the bytes that follow the table; the port leaves it empty, and since nothing owns
 * that row it always comes out as the dashes anyway.
 */
export function itemMenu(
  names: string[],
  owned: number[],
  plus: number[],
  countOwned: boolean,
): string[] {
  return MENU_ROWS.map((_, row) => {
    if (!(owned[row] > 0)) return '--------'; // DS:1806, and DS:326e for kill_monster's copy
    const name = names[row] ?? '';
    if (plus[row] === 0) return name;
    // DS:1691 with the plus after it, then DS:1803, the count and DS:0fda
    const count = countOwned ? ` (${owned[row]})` : '';
    return `${name}, PLUS ${plus[row]}${count}`;
  });
}

/** The colour FUN_3000_a1c4 draws its line in, which is the white of the fixed UI colours. */
const GOOD_NEWS_COLOUR = 15;

/** How long FUN_3000_a1c4 leaves its line up (exe 3000:a1ee) before the offer goes in the box. */
const GOOD_NEWS_MS = 300;

/**
 * FUN_3000_a1c4 (exe 3000:a1c4): the line every drop opens with, on the one line above the
 * message box the offer itself goes in, so it reads as the offer's heading.
 *
 * It pauses after drawing it unless the high speed option is on, and leaves it there for
 * get_choice (exe 2000:2ea9) to wipe once the offer has been answered. The port has no port of
 * that wipe, so the line stands until the next thing written on it replaces it.
 */
export function goodNews(game: Game): void {
  clearMessageLine(game);
  game.draw(messageLine('GOOD NEWS...', GOOD_NEWS_COLOUR)); // DS:2f6c
  if (!game.highSpeed) game.delay(GOOD_NEWS_MS);
}

/**
 * drop_weapon (exe 3000:a1fc, unf.c "drop_weapon"): the weapon a kill may leave behind, which
 * the player is offered and can refuse.
 *
 * The weapon is one of the seven the table has past the fist, and the deeper into the table it
 * is the less likely the roll lands, so a Great Sword needs a level 690 monster to be certain.
 * A monk keeps nothing at all.
 */
export async function dropWeapon(game: Game): Promise<void> {
  const pc = game.pc;
  if (pc.cls === 2) return;
  const which = game.rng.random(7) + 1;
  if (game.rng.random(which * 100) > game.monsters[game.engaged].level + 10) return;
  // The "(YOU ALREADY HAVE n OF THESE)" line below is written into the message box a few lines
  // on, which this return makes unreachable. drop_armor, the same function for armor, has no
  // such return and does print it.
  if (pc.weaponsOwned[which] > 0) return;
  if (game.highSpeed) {
    for (let better = which; better < 8; better += 1) {
      if (pc.weaponsOwned[better] > 0) return;
    }
  }
  goodNews(game);
  // DS:2f79 with the name written after it, 258b, 2fa3, 2fb6, 258b, 2fca, 2fe3, 2ffe
  game.say(
    `YOU FIND A ${WEAPON_NAMES[which]}`,
    '',
    '1) TAKE THE WEAPON',
    '2) LEAVE THE WEAPON',
    '',
    'NOTE THAT YOU MAY END UP',
    'WITH SEVERAL WEAPONS WHICH',
    'WILL WEIGH YOU DOWN.',
  );
  if ((await game.choice([TAKE, LEAVE])) === TAKE) {
    pc.weaponsOwned[which] += 1;
    game.events.push({ kind: 'found', find: { what: 'weapon', item: WEAPON_NAMES[which] } });
    computeWeight(game);
  }
}

/**
 * drop_armor (exe 3000:a3d7, unf.c "drop_armor"): the same for armor, one of the six suits past
 * bare skin.
 *
 * Unlike drop_weapon this one offers armor the character already owns, and counts it in the
 * message. It also prints "GOOD NEWS..." before it works out whether the high speed option
 * means the offer is going to be skipped, so a skipped offer still says that.
 */
export async function dropArmor(game: Game): Promise<void> {
  const pc = game.pc;
  if (pc.cls === 2) return;
  const which = game.rng.random(6) + 1;
  if (game.rng.random(which * 100) > game.monsters[game.engaged].level + 10) return;
  goodNews(game);
  if (game.highSpeed) {
    for (let better = which; better < 8; better += 1) {
      if (pc.armorOwned[better] > 0) return;
    }
  }
  const owned = pc.armorOwned[which];
  // DS:3013 with the name and 301d after it, 2f85 2f98 with the count between them, 3025, 3037,
  // 258b, 2fca, 304a, 3060
  game.say(
    `YOU FIND ${ARMOR_NAMES[which]} ARMOR.`,
    owned > 0 ? `(YOU ALREADY HAVE ${owned} OF THESE)` : '',
    '1) TAKE THE ARMOR',
    '2) LEAVE THE ARMOR',
    '',
    'NOTE THAT YOU MAY END UP',
    'WITH SEVERAL SUITS OF',
    'ARMOR WEIGHING YOU DOWN.',
  );
  if ((await game.choice([TAKE, LEAVE])) === TAKE) {
    pc.armorOwned[which] += 1;
    game.events.push({ kind: 'found', find: { what: 'armour', item: ARMOR_NAMES[which] } });
    computeWeight(game);
  }
}

/**
 * spell_name_to_menu (exe 3000:a5cc, unf.c "spell_name_to_menu"): the two lines that say what a
 * dropped spell is. `level` is 0 to 9 and prints as one more; `type` is 0 permanent, 1
 * preparation, 2 wizard, 3 priest.
 *
 * The priest line is the one line of the four with no full stop on the end.
 */
export function spellNameToMenu(level: number, type: number): string[] {
  const names = [
    '  PERMANENT SPELL.', // DS:3091
    '  PREPARATION SPELL.', // DS:30a4
    '  WIZARD SPELL.', // DS:30b9
    '  PRIESTLY SPELL', // DS:30c9
  ];
  return [`  THE SPELL IS A LEVEL ${level + 1}`, names[type]]; // DS:3079
}

/**
 * The rule drop_spellbook and drop_scroll share: a worshipper (1) and a priest (4) are never
 * given a wizard spell, and a wizard (3) and a mage (6) are never given a priestly one. A drop
 * that lands on the wrong list is thrown away rather than rolled again.
 */
function wrongListForClass(cls: number, type: number): boolean {
  if (type === 2 && (cls === 1 || cls === 4)) return true;
  return type === 3 && (cls === 3 || cls === 6);
}

/**
 * drop_spellbook (exe 3000:a65d, unf.c "drop_spellbook"): the spell a kill may teach outright.
 * Returns whether one was learned, which is what stops kill_monster rolling for a scroll, a wand
 * or a paper as well.
 *
 * A fighter (0) and a monk (2) learn nothing. A sage (5) has two extra rolls to pass, both of
 * which get easier the deeper the floor. A spell the character already has in their book is
 * thrown away rather than rolled again.
 */
export function dropSpellbook(game: Game): boolean {
  const pc = game.pc;
  if (pc.cls === 0 || pc.cls === 2) return false;
  if (pc.cls === 5) {
    // The sage's two extra rolls are Random calls (exe 3000:a68a and 3000:a6a9); every roll
    // below them is written inline, so they carry on from the seed the second one set.
    if (game.randomCall(300 - pc.level) > 175) return false;
    if (game.randomCall(400 - pc.level) > 140) return false;
  }
  let level = game.rng.random(Math.trunc((pc.level * 2) / 3));
  if (level > 9) level = game.rng.random(10);
  const type = game.rng.random(4);
  if (wrongListForClass(pc.cls, type)) return false;
  const slot = game.rng.random(3);
  const index = type * 45 + level * 3 + slot;
  if (pc.spellbook[index] > 0) return false;
  goodNews(game);
  // DS:30da, the two lines of spell_name_to_menu, 30f6, 3114
  game.say(
    'YOU HAVE FOUND A SPELLBOOK.',
    ...spellNameToMenu(level, type),
    'HIT ANY KEY FOR A DESCRIPTION',
    '  OF THE SPELL.',
  );
  pc.spellbook[index] = 1;
  game.events.push({ kind: 'found', find: { what: 'spellbook', spell: { type, level, slot } } });
  return true;
}

/**
 * drop_scroll (exe 3000:a870, unf.c "drop_scroll"): a scroll of one spell. A fighter (0) and a
 * monk (2) get none, and a sage (5) passes the gate on a roll thirty higher.
 *
 * The spell's level is rolled out of half the floor plus two, so a scroll found on floor 1 is a
 * level 1 or 2 spell and one found on floor 20 can be anything up to level 10.
 */
export function dropScroll(game: Game): void {
  const pc = game.pc;
  if (pc.cls === 0 || pc.cls === 2) return;
  const sageBonus = pc.cls === 5 ? 30 : 0;
  // The roll that decides whether there is a scroll at all is a Random call (exe 3000:a8a0) and
  // the four that pick it are written inline.
  if (game.randomCall(350 - pc.level) > sageBonus + 15) return;
  let level = game.rng.random(Math.trunc((pc.level + 4) / 2));
  if (level > 9) level = game.rng.random(10);
  const type = game.rng.random(4);
  if (wrongListForClass(pc.cls, type)) return;
  goodNews(game);
  const slot = game.rng.random(3);
  // DS:3124, the two lines of spell_name_to_menu, 30f6, 313d
  game.say(
    'YOU HAVE FOUND A SCROLL.',
    ...spellNameToMenu(level, type),
    'HIT ANY KEY FOR A DESCRIPTION',
    '  OF THE SCROLL.',
  );
  pc.scrolls[type * 45 + level * 3 + slot] += 1;
  game.events.push({ kind: 'found', find: { what: 'scroll', spell: { type, level, slot } } });
}

/**
 * drop_wand (exe 3000:aa37, unf.c "drop_wand"): a wand of two to six charges. A fighter (0) and
 * a monk (2) get none; a sage (5) gets a wand of twice the level anyone else would.
 *
 * The type is rolled 1 to 3, so a wand is never a permanent spell, and the class rule the
 * spellbook and the scroll follow is not applied here at all: a wizard can be handed a priestly
 * wand.
 */
export function dropWand(game: Game): void {
  const pc = game.pc;
  if (pc.cls === 0 || pc.cls === 2) return;
  // A Random call (exe 3000:aa5b), with the six that pick the wand written inline.
  if (game.randomCall(350 - pc.level) > 15) return;
  goodNews(game);
  let level =
    pc.cls === 5
      ? game.rng.random(Math.trunc(pc.level / 2))
      : game.rng.random(Math.trunc(pc.level / 4));
  if (level > 9) level = game.rng.random(10);
  const type = game.rng.random(3) + 1;
  const slot = game.rng.random(3);
  const charges = game.rng.random(5) + 2;
  // DS:314e 3165 with the charges between them, the two lines of spell_name_to_menu, 30f6, 316f
  game.say(
    `YOU FOUND A WAND WITH ${charges} CHARGES.`,
    ...spellNameToMenu(level, type),
    'HIT ANY KEY FOR A DESCRIPTION',
    '  OF THE WAND.',
  );
  pc.wands[type * 45 + level * 3 + slot] += charges;
  game.events.push({ kind: 'found', find: { what: 'wand', spell: { type, level, slot }, charges } });
}

/**
 * drop_paper (exe 3000:ac6f, unf.c "drop_paper"): a spell paper, which only a monk (2) is
 * refused. A fighter (0) and a sage (5) are given papers of twice the level everyone else gets,
 * which is the one thing in the drops a fighter is good at.
 */
export function dropPaper(game: Game): void {
  const pc = game.pc;
  if (pc.cls === 2) return;
  // A Random call (exe 3000:ac8c), with the five that pick the paper written inline.
  if (game.randomCall(350 - pc.level) > 15) return;
  goodNews(game);
  let level =
    pc.cls === 5 || pc.cls === 0
      ? game.rng.random(Math.trunc(pc.level / 2))
      : game.rng.random(Math.trunc(pc.level / 6));
  if (level > 9) level = game.rng.random(10);
  const type = game.rng.random(4);
  const slot = game.rng.random(3);
  // DS:317e, the two lines of spell_name_to_menu, 30f6, 3196
  game.say(
    'YOU FIND A SPELL PAPER.',
    ...spellNameToMenu(level, type),
    'HIT ANY KEY FOR A DESCRIPTION',
    '  OF THE SPELL ON THE PAPER.',
  );
  pc.papers[type * 45 + level * 3 + slot] += 1;
  game.events.push({ kind: 'found', find: { what: 'paper', spell: { type, level, slot } } });
}

/**
 * find_item (exe 3000:ae27, unf.c "find_item"): one of the twelve things a kill can turn up,
 * picked with an even twelfth chance each. A monk (2) finds nothing.
 *
 * The floor slosher is the only one of the twelve the character cannot have two of; finding a
 * second one prints a message saying so and hands over nothing.
 */
export function findItem(game: Game): void {
  const pc = game.pc;
  if (pc.cls === 2) return;
  const which = game.rng.random(12);
  switch (which) {
    case 0:
      pc.grenades += 1;
      showHint(game, 31);
      break;
    case 1:
      pc.teleportStones += 1;
      showHint(game, 32);
      break;
    case 2:
      pc.seeingStones += 1;
      showHint(game, 33);
      break;
    case 3:
      if (pc.slosher > 0) {
        showHint(game, 34);
        return;
      }
      pc.slosher += 1;
      showHint(game, 35);
      break;
    case 4:
      pc.healingPotions += 1;
      showHint(game, 36);
      break;
    case 5:
      pc.regenRings += 1;
      showHint(game, 37);
      break;
    case 6:
      pc.str += 2;
      showHint(game, 38);
      break;
    case 7:
      pc.iq += 2;
      showHint(game, 39);
      break;
    case 8:
      pc.wis += 2;
      showHint(game, 40);
      break;
    case 9:
      pc.con += 2;
      showHint(game, 41);
      break;
    case 10:
      pc.dex += 2;
      showHint(game, 43);
      break;
    case 11:
      pc.luck += 2;
      showHint(game, 44);
  }
  game.events.push({ kind: 'found', find: { what: 'item', item: FOUND_ITEM_NAMES[which] } });
}

/**
 * post_kill_heal (exe 3000:afc5, unf.c "post_kill_heal"): the cup of health a kill turns up one
 * time in four, worth four to fourteen hit points, and up to three more from floor 7 down.
 *
 * A character already at full health is not offered one.
 */
export function postKillHeal(game: Game): void {
  const pc = game.pc;
  if (game.rng.random(4) !== 0 || pc.hp === pc.maxHp) return;
  pc.hp += game.rng.random(11) + 4;
  if (pc.level > 6) pc.hp += game.rng.random(4);
  showHint(game, 45);
  if (pc.hp > pc.maxHp) pc.hp = pc.maxHp;
}

/**
 * post_kill_sp (exe 3000:b063, unf.c "post_kill_sp"): the ball of thought a kill turns up one
 * time in six, worth exactly one spell point. A fighter (0) gets none, and neither does a
 * character already at full spell points.
 */
export function postKillSp(game: Game): void {
  const pc = game.pc;
  if (game.rng.random(6) !== 0) return;
  if (pc.sp === pc.maxSp || pc.cls === 0) return;
  pc.sp += 1;
  showHint(game, 46);
}

/**
 * The comment drop_money adds under the amount, four for each of the eight sizes of find. The
 * pairs are the two lines of the message box, in order (exe DS:6807 onwards).
 */
const MONEY_COMMENTS: string[][][] = [
  [
    ['  THAT MIGHT EVEN BUY YOU', "LUNCH (AT MORDONALD'S)!"],
    ['  YOU COULD FEED A HUNGRY', 'CHILD WITH THAT MONEY.'],
    ['  A FEW MORE FINDS LIKE THIS', "AND YOU'LL STILL BE POOR!"],
    ['  YOU SURE KNOW HOW TO PICK', 'RICH OPPONENTS (CHUCKLE)...'],
  ],
  [
    ['  NOT TOO BAD A CATCH, MONEY', "ISN'T EVERYTHING ANYWAY!"],
    ['  MAYBE YOU NEED TO GO DOWN', 'DEEPER AND GET SOME REAL CASH!'],
    ["  OKAY, BUT IT WON'T PUT THE", 'KIDS THROUGH COLLEGE...'],
    ['  SHOULD BUY A PIZZA OR TWO', 'ANYWAY...'],
  ],
  [
    ["  HEY, YOU'RE MAKING PROGRESS.", 'MIGHT HAVE TO KILL YOU SOON!'],
    ["  SO NOW YOU THINK YOU'RE BAD.", 'WAIT TIL THE NEXT DUNGEON!'],
    ["  STILL CAN'T EDUCATE THE KIDS,", 'BUT YOU CAN TAKE AN EVE. CLASS.'],
    ['  NOW YOU CAN GET SEVERAL', 'PIZZAS...'],
  ],
  [
    ["  DON'T LET YOUR HEAD GET TOO", "BIG JUST BECAUSE OF SOME 0'S!"],
    ['  A FEW MORE OF THESE AND YOU', 'CAN BUY SOME STOCK!'],
    ['  WORD ON THE STREET: CULTURE', 'CORPORATION IS A SURE WINNER!'],
    ['  THIS MIGHT BUY THE DOORKNOB', 'OF A NEW HOUSE!'],
  ],
  [
    ['  THAT IS A LOT OF ZEROS! TOO', "BAD WE'RE NOT TALKING RUBLES"],
    ['  TOO BAD THAT DUMB GOVERNMENT', 'RAN UP ALL THAT DEBT!'],
    ['  YOU CAN EDUCATE YOUR KIDS', 'NOW.'],
    ['  TIME TO HAVE A SERIOUS PIZZA', 'PARTY...'],
  ],
  [
    ['  NOT QUITE A MILLION YET, SO', 'GET BACK TO WORK!'],
    ['  COULD REGISTER A LOT OF COOL', 'MORAFF GAMES FOR LESS THAN THAT!'],
    ['  NOW YOU CAN EDUCATE YOUR KIDS', 'AT MORVARD UNIVERSITY.'],
    ['  MIGHT EVEN BUY A POLITICIAN', 'OR TWO WITH THAT MUCH!'],
  ],
  [
    ["  CAN WE SAY 'MILLION DOLLARS'?", 'NICE RING, EH?'],
    ['  COULD BUY MORAFFWARE FOR THAT', 'KIND OF MONEY. MAYBE.'],
    ['  YOU MIGHT BE ABLE TO BUY A', 'UNIVERSITY NOW!'],
    ["  PERHAPS YOU'D LIKE TO BUY A", 'WHOLE PIZZA RESTAURANT?'],
  ],
  [
    ["  YOU'RE REALLY GETTING RICH!", 'WAY TO GO!'],
    ["  DON'T FORGET TO BUY A HOUSE.", 'A NICE ONE.'],
    ['  THIS MIGHT BE ENOUGH TO', 'REFORM THE WHOLE SCOOL SYSTEM!'],
    ['  THIS MUCH MONEY COULD GET', 'YOU ELECTED!'],
  ],
];

/** The largest find each of {@link MONEY_COMMENTS}' first seven rows covers; the last takes the rest. */
const MONEY_COMMENT_TIERS = [20, 200, 2000, 20000, 200000, 1000000, 10000000];

/** What a character can carry in Greater-American Dollars (exe DS:0470's own limit). */
export const DOLLARS_CAP = 2000000000;

/** The largest find drop_money will hand over in one go before it rolls a smaller one. */
export const MONEY_FIND_CAP = 107000000;

/**
 * drop_money (exe 4000:6aca, unf.c "drop_money"): the Greater-American Dollars a kill leaves.
 *
 * Nothing is found above floor 4 unless three rolls against the floor all land, and below it
 * there is a one in four chance of a small find instead. A worshipper (1) and a wizard (3) are
 * given more, floors 5 to 14 are worth a third more and floors 17 down a third less, a normal
 * difficulty character is given up to 7,000 on top, and a sage (5) gets three times the lot.
 */
export function dropMoney(game: Game): void {
  const pc = game.pc;
  if (pc.dollars >= DOLLARS_CAP) {
    if (!game.dollarCapWarned) {
      showHint(game, 124);
      game.dollarCapWarned = true;
    }
    return;
  }
  game.dollarCapWarned = false;
  // srand(time(NULL)) at 4000:6b24, over the date and time read at 4000:6b1b. The seed is the
  // second the kill happened in, so two monsters of the same floor killed inside one second drop
  // exactly the same money. A game with no seconds clock reseeds nothing: see the README's third
  // departure.
  if (game.seconds !== null) game.rng.reseed?.(game.seconds());
  const deep = pc.level + 1;
  let amount = 0;
  if (pc.level > 4) {
    amount =
      game.rng.random(deep * deep) * game.rng.random(deep) * game.rng.random(deep * deep);
  }
  if (amount === 0 && game.rng.random(4) === 1) amount = game.rng.random(deep * 200);
  if (amount !== 0) {
    if (pc.cls === 1 || pc.cls === 3) amount += game.rng.random(pc.level * 200);
    if (pc.level < 5) amount += game.rng.random(pc.level * 200);
    else if (pc.level < 15) amount += Math.trunc(amount / 3);
    else if (pc.level > 16) amount -= Math.trunc(amount / 3);
    if (pc.hard === 0) amount += game.rng.random(7000);
    if (pc.cls === 5) amount *= 3;
  }
  if (amount > MONEY_FIND_CAP) {
    amount = MONEY_FIND_CAP - game.rng.random(32000) * game.rng.random(1000);
  }
  if (amount === 0) return;
  if (amount > DOLLARS_CAP - pc.dollars) amount = DOLLARS_CAP - pc.dollars;
  pc.dollars += amount;
  game.events.push({ kind: 'found', find: { what: 'money', amount } });
  if (game.highSpeed) return;
  const tier = MONEY_COMMENT_TIERS.findIndex((limit) => amount < limit);
  const comments = tier === -1 ? MONEY_COMMENTS[MONEY_COMMENTS.length - 1] : MONEY_COMMENTS[tier];
  const comment = comments[game.rng.random(4)];
  // DS:6789 67a5 67c2 67db 67e1, then the amount and 67fd, then the two comment lines
  game.say(
    '  YOU FIND GREATER-AMERICAN',
    'DOLLARS! THESE CAN BE TRADED',
    'FOR REAL CURRENCY AT ANY',
    'BANK!',
    '  YOU HAVE FOUND A TOTAL OF',
    `${amount} DOLLARS.`,
    ...comment,
  );
}

/**
 * lose_item (exe 2000:98b7, unf.c "lose_item"): the eight-line menu of what the character owns,
 * and the line of it they pick. The answer is mset_gmenu's (exe 2000:2b08), which is the line
 * number 1 to 8, and -1 for the Escape it also takes.
 */
async function pickAnItem(game: Game, lines: string[]): Promise<number> {
  game.say(...lines);
  const key = await game.choice(MENU_ROWS);
  return key === ESCAPE ? -1 : key - 0x30;
}

/**
 * lose_item (exe 2000:98b7, unf.c "lose_item"): throwing something away, which the L key does.
 * It asks what kind — armor, weapon or money — and then which one.
 *
 * Line 1 of both item menus is the row the character can never be without — bare skin and bare
 * fists — so picking it says the item will not come off. Throwing away the last of whatever is
 * in hand or worn puts the character back on that row.
 *
 * Escaping the second menu leaves the original writing one byte in front of the counts it is
 * dropping from, which here is a read past the start of an array and changes nothing.
 */
export async function loseItem(game: Game): Promise<void> {
  const pc = game.pc;
  // DS:17ba 17d7 06f0 17e7 17f0 17fa 06f0
  game.say(
    'WHICH TYPE OF ITEM WOULD YOU',
    '  LIKE TO DROP:',
    '',
    '1) ARMOR',
    '2) WEAPON',
    '3) MONEY',
  );
  const kind = await game.choice(THREE_WAYS);
  if (kind === 0x31) {
    const choice = await pickAnItem(game, itemMenu(ARMOR_NAMES, pc.armorOwned, pc.armorPlus, true));
    if (choice === 1) {
      game.say("OWE! IT JUST WON'T COME OFF!", 'HIT ANY KEY...'); // DS:180f 0c5a
    } else {
      if (pc.armorOwned[choice - 1] > 0) {
        pc.armorOwned[choice - 1] -= 1;
        game.events.push({ kind: 'dropped', what: 'armour', item: ARMOR_NAMES[choice - 1] });
      }
      if (pc.armor === choice - 1 && pc.armorOwned[choice - 1] === 0) pc.armor = 0;
    }
  }
  if (kind === 0x32) {
    const menu = itemMenu(WEAPON_NAMES, pc.weaponsOwned, pc.weaponPlus, true);
    const choice = await pickAnItem(game, menu);
    if (choice === 1) {
      game.say("OWE! IT JUST WON'T COME OFF!", 'HIT ANY KEY...'); // DS:180f 0c5a
    } else {
      if (pc.weaponsOwned[choice - 1] > 0) {
        pc.weaponsOwned[choice - 1] -= 1;
        game.events.push({ kind: 'dropped', what: 'weapon', item: WEAPON_NAMES[choice - 1] });
      }
      if (pc.weapon === choice - 1 && pc.weaponsOwned[choice - 1] === 0) pc.weapon = 0;
    }
  }
  if (kind === 0x33) {
    showHint(game, 87);
    const choice = await game.choice(THREE_WAYS);
    if (choice === 0x31) {
      if (pc.money !== 0) game.events.push({ kind: 'dropped', what: 'money', amount: pc.money });
      pc.money = 0;
    } else if (choice === 0x33) showHint(game, 88);
  }
  computeWeight(game);
}

/**
 * use_magic_item (exe 2000:b202, unf.c "use_magic_item"): the six-item menu the last line of the
 * I key's own menu opens — the floor slosher, a potion of healing, becoming God, a stone of
 * seeing, a stone of teleportation and a nuclear hand grenade.
 *
 * Where the original reloads the floor around the character the port records a `levelChanged`
 * event, the way the ported floor-changing spells do — see the README's second departure. The
 * stone of seeing is not one of those: its walk over the floor is here, and each square it
 * reaches goes through `game.markKnown`, which is whatever is keeping this game's map.
 *
 * The floor slosher is the one item here that is not used up, which is what its own description
 * says: it "MAY [BE] USED LIMITLESSLY".
 */
export async function useMagicItem(game: Game): Promise<void> {
  const pc = game.pc;
  let notCarried = false;
  // Three of the six lines can be picked and still leave everything as it was: the slosher too
  // deep to slip through, the grenade a monster catches, and the joke behind becoming God. This
  // is what says one of the six was really spent, which is what a run counts.
  let used = false;
  showHint(game, 23);
  const choice = (await game.choice(SIX_ITEMS)) - 0x30;
  if (choice === 1) {
    if (pc.slosher === 0) {
      notCarried = true;
    } else if (pc.level < Math.trunc((game.rules.bottomLevel(pc.module) * 2) / 3)) {
      // DS:19e0 19fd
      game.say('YOU ARE SLIPPING THROUGH THE', '  FLOOR. HIT ANY KEY...');
      const from = pc.level;
      pc.level += 1;
      while (game.solid(pc.x, pc.y, pc.level, pc.module)) {
        pc.x = game.randomCall(game.columns - 5) + 2;
        pc.y = game.randomCall(game.rows - 5) + 2;
      }
      game.events.push({ kind: 'levelChanged', from, to: pc.level });
      used = true;
      game.recenterMap = true;
    } else {
      game.say("DOESN'T WORK THIS DEEP!", '', 'HIT ANY KEY...'); // DS:19c8 06f0 0c5a
    }
  }
  if (choice === 2) {
    if (pc.healingPotions < 1) {
      notCarried = true;
    } else {
      game.say('YOU FEEL GREAT! HIT A KEY...'); // DS:1a15
      pc.hp = pc.maxHp;
      pc.healingPotions -= 1;
      used = true;
    }
  }
  if (choice === 3) showHint(game, 24);
  if (choice === 4) {
    if (pc.seeingStones === 0) {
      notCarried = true;
    } else {
      pc.seeingStones -= 1;
      used = true;
      // Every square of the floor that is not rock is marked known. The two loops stop one
      // short on each axis, `<` where the bounds are the last column and row rather than the
      // count of them, and lose nothing by it: column 79 is rock in every module and floor, and
      // rows 104 to 109 are sealed off by retdwall's northern edge rule.
      for (let x = 0; x < game.columns; x++) {
        for (let y = 0; y < game.rows; y++) {
          if (!game.solid(x, y, pc.level, pc.module)) game.markKnown(x, y);
        }
      }
      game.recenterMap = true;
      showHint(game, 82);
    }
  }
  if (choice === 5) {
    if (pc.teleportStones < 1) {
      notCarried = true;
    } else {
      pc.teleportStones -= 1;
      used = true;
      const from = pc.level;
      pc.level = 0;
      game.events.push({ kind: 'levelChanged', from, to: 0 });
      // The scan keeps the last open square it finds rather than stopping at the first, so the
      // character always lands in the same corner of the town.
      for (let x = 20; x < game.columns - 20; x += 1) {
        for (let y = 20; y < game.rows - 20; y += 1) {
          if (!game.solid(x, y, pc.level, pc.module)) {
            pc.x = x;
            pc.y = y;
          }
        }
      }
      game.engaged = -1;
      game.redrawView = true;
      game.recenterMap = true;
      showHint(game, 83);
    }
  }
  if (choice === 6) {
    if (pc.grenades === 0 || game.engaged !== -1) {
      if (pc.grenades === 0) {
        notCarried = true;
      } else if (game.monsterKinds[game.monsters[game.engaged].type].special === 100) {
        // DS:1a32 1a4d 06f0 06f0 06f0 1a56
        game.say('   THE MONSTER CATCHES THE', 'GRADADE.', '', '', '', '      HIT ANY KEY...');
        showHint(game, 84);
      } else {
        pc.grenades -= 1;
        used = true;
        game.monsters[game.engaged].hp = -100;
        // DS:1a6b 1a85 06f0 0c5a
        game.say('A MASSIVE EXPLOSION KILLS', '  THE MONSTER INSTANTLY.', '', 'HIT ANY KEY...');
      }
    } else {
      showHint(game, 25);
    }
  }
  if (notCarried) showHint(game, 85);
  if (used) game.events.push({ kind: 'itemUsed', item: MAGIC_ITEM_NAMES[choice - 1] });
}
