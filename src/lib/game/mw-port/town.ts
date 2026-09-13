import { moveMoney } from '../port/town';
import { recomputeWeight } from './magic';
import { HINT, loadHBin } from './hints';
import { canLevelUp, levelFromExperience } from './levels';
import type { MwGame } from './state';

/**
 * Floor 0 — the store, the temple, the bank and the inn — and what greets a character arriving
 * on a floor.
 *
 * Each of the four is a ladder square on the town map, and movecontrol (WORLD.EXE 2000:aad5)
 * calls the matching function when the character climbs it. Every one of them reads its choices
 * from the keyboard; here those are parameters, the way the play engine will supply them.
 *
 * The message text is the exact bytes of the game's own strings; the comment on each say call
 * gives the address of every line it prints, in order. Ghidra's stack reconstruction loses some
 * of the eight-line boxes' lines, and where it does the comment says which line was recovered
 * from the strings around it instead.
 */

/** Jewels are the only money the game spends. */
const INN_PRICE = 10;

/**
 * What the game calls each of its four buildings, out of the line each greets the player with:
 * DS:1de5 "YOU HAVE ENTERED A STORE", DS:1fc5 "YOU ARE IN A TEMPLE", DS:23eb "WELCOME TO
 * MORAFF'S FIRST NATIONAL BANK" and DS:2176 "WELCOME TO THE FLEA BAG INN".
 */
export const MW_STORE = 'STORE';
export const MW_TEMPLE = 'TEMPLE';
export const MW_BANK = "MORAFF'S FIRST NATIONAL BANK";
export const MW_INN = 'FLEA BAG INN';

/** What a night at the inn buys, which is the one thing it sells. */
const A_NIGHT = 'A NIGHT';

/**
 * The six weapons and the six suits of armor the store's two menus offer, by the names those
 * menus print (DS:1e75 onwards and DS:1f24 onwards) with the dots and the price taken off. The
 * first suit is bare skin under the name ROBES, which is what the menu calls it.
 */
const STORE_WEAPONS = ['STICK', 'CLUB', 'MACE', 'KNIFE', 'SHORTSWORD', 'LONG SWORD'];
const STORE_ARMOUR = ['ROBES', 'LEATHER', 'CHAIN', 'SCALE', 'PLATE', 'FIELD PLATE'];

/** The six the temple sells, by the names its menu prints (DS:1fef onwards). */
const TEMPLE_SPELLS = [
  'CURE WOUNDS',
  'CURE SERIOUS WOUNDS',
  'HEAL ALL WOUNDS',
  'CURE POISON',
  'CURE DISEASE',
  'RAISE CONTRACT',
];

/**
 * The store's price table (DGROUP 0x1265) and the temple's (0x1281). Both hold seven entries
 * and both menus reach only the first six, so the great sword's 9,900 and titanium's 60,000 are
 * never charged.
 */
const WEAPON_PRICES = [1, 15, 300, 30, 250, 450, 9900];
const ARMOUR_PRICES = [1, 50, 300, 1500, 4000, 9900, 60000];
const TEMPLE_PRICES = [30, 200, 2500, 300, 500, 0];

/**
 * financial_statement (WORLD.EXE 2000:342d, mw.c "financial_statement"): the six stone counters,
 * the jewels in the pocket and the jewels in the bank, each against its label.
 *
 * The trailing spaces inside each label are the gap the number is printed into.
 */
export function financialStatement(game: MwGame): void {
  const pc = game.pc;
  game.eraseScreen();
  game.say('YOUR FINANCIAL STATEMENT:'); // DS:20cc
  // DS:20e6 20f8 210a 211c 212e 2140 2152 2164, each with its number on the end
  game.say(
    `COPPER STONES:   ${pc.stones[0]}`,
    `SILVER STONES:   ${pc.stones[1]}`,
    `IVORY STONES:    ${pc.stones[2]}`,
    `GOLD STONES:     ${pc.stones[3]}`,
    `PLATINUM STONES: ${pc.stones[4]}`,
    `JEWEL STONES:    ${pc.stones[5]}`,
    `JEWELS IN POCKET:${pc.money}`,
    `JEWELS IN BANK:  ${pc.bank}`,
  );
}

/**
 * store (WORLD.EXE 2000:2ee7, mw.c "store"): six weapons or six suits of armor, at the prices
 * the menu prints.
 *
 * The affordability test is `price < money`, not `price <= money`, so a character with exactly
 * enough is turned away; a stick costs one jewel and wants two in the pocket. Nothing stops a
 * character buying the same thing twice, and the store sells no great sword and no titanium.
 *
 * Buying armor number 1 buys ROBES, which is bare skin under another name — the menu says so.
 * The weapon menu is offset by one instead, so its first entry is a stick rather than a fist.
 *
 * @param what the opening menu: 1 weapons, 2 armor, 3 or anything else leaves.
 * @param item which of the six, 1 to 6; anything outside that buys nothing.
 */
export function store(game: MwGame, what: number, item: number): void {
  const pc = game.pc;
  // DS:1de5, DS:1dfe 1e1a 1e25 1e2e; Ghidra loses the eighth line, which is DS:1e45, the only
  // string in the block nothing else prints.
  game.say(
    'YOU HAVE ENTERED A STORE',
    '',
    'WHAT WOULD YOU LIKE TO BUY?',
    '1) WEAPONS',
    '2) ARMOR',
    '3) EXIT STORE (OR ESC)',
    '',
    'PLEASE SELECT 1, 2 OR 3',
  );
  if (what === 1) {
    game.say(`MONEY ON HAND: ${pc.money}`); // DS:1eff with the money on the end
    // DS:1e5d, DS:1e75 1e8c 1ea3 1eba 1ed1 1ee8
    game.say(
      'PLEASE SELECT A WEAPON:',
      '',
      '1) STICK..........1 JP',
      '2) CLUB..........15 JP',
      '3) MACE.........300 JP',
      '4) KNIFE.........30 JP',
      '5) SHORTSWORD...250 JP',
      '6) LONG SWORD...450 JP',
    );
    if (item < 1 || item > 6) return;
    if (WEAPON_PRICES[item - 1] < pc.money) {
      pc.weaponsOwned[item] += 1;
      pc.money -= WEAPON_PRICES[item - 1];
      game.events.push({
        kind: 'coinsSpent',
        amount: WEAPON_PRICES[item - 1],
        on: STORE_WEAPONS[item - 1],
        where: MW_STORE,
      });
    }
    return;
  }
  if (what === 2) {
    game.say(`MONEY ON HAND: ${pc.money}`); // DS:1eff with the money on the end
    // DS:1f0f, DS:1f24 1f3c 1f54 1f6c 1f84 1f9c
    game.say(
      'PLEASE SELECT ARMOR:',
      '',
      '1) ROBES (USELESS).1 JP',
      '2) LEATHER........50 JP',
      '3) CHAIN.........300 JP',
      '4) SCALE........1500 JP',
      '5) PLATE........4000 JP',
      '6) FIELD PLATE..9900 JP',
    );
    if (item < 1 || item > 6) return;
    if (ARMOUR_PRICES[item - 1] < pc.money) {
      pc.armorOwned[item - 1] += 1;
      pc.money -= ARMOUR_PRICES[item - 1];
      game.events.push({
        kind: 'coinsSpent',
        amount: ARMOUR_PRICES[item - 1],
        on: STORE_ARMOUR[item - 1],
        where: MW_STORE,
      });
    }
  }
}

/** How far the temple's encounter counter is allowed to run, and where it lands past level 60. */
const ENCOUNTER_MIN = 100000;
const ENCOUNTER_MAX = 500000;

/**
 * The temple (WORLD.EXE 2000:3085, mw.c "FUN_2000_3085"): five cures and a raise-dead contract.
 *
 * Every visit first rewrites the counter at 0x80a to `level * 500` plus a small roll, floored at
 * 100,000 if that came out negative and set to 500,000 outright past level 60. Nothing in the
 * game reads it back.
 *
 * The contract is free and is the only thing standing between a death and a deleted character:
 * it writes down the dungeon and the square the character is standing on, and death sends them
 * back there. Unlike the store, the temple takes a price the character can exactly afford.
 *
 * @param choice the menu, 1 to 6; anything else buys nothing.
 */
export function temple(game: MwGame, choice: number): void {
  const pc = game.pc;
  pc.encounterCounter = pc.lev * 500 + game.rng.random(20);
  if (pc.encounterCounter < 0) pc.encounterCounter = ENCOUNTER_MIN;
  if (pc.lev > 60) pc.encounterCounter = ENCOUNTER_MAX;
  game.eraseScreen();
  game.say(`MONEY ON HAND: ${pc.money}`); // DS:1eff with the money on the end
  // DS:1fc5, DS:1fd9; Ghidra loses the six menu lines, which are DS:1fef 200d 202b 2049 2067 2085
  game.say(
    'YOU ARE IN A TEMPLE',
    'PLEASE SELECT A SPELL',
    '1) CURE WOUNDS..........30 JP',
    '2) CURE SERIOUS WOUNDS.200 JP',
    '3) HEAL ALL WOUNDS....2500 JP',
    '4) CURE POISON.........300 JP',
    '5) CURE DISEASE........500 JP',
    '6) RAISE CONTRACT...',
  );
  if (choice < 1 || choice > 6) return;
  const price = TEMPLE_PRICES[choice - 1];
  if (price > pc.money) {
    // DS:209a 20b5
    game.say("SORRY, CAN'T BUY ON CREDIT", '  HERE.');
    return;
  }
  pc.money -= price;
  // The contract is the one line of the menu that is free, so there is nothing to report spending.
  if (price > 0) {
    game.events.push({
      kind: 'coinsSpent',
      amount: price,
      on: TEMPLE_SPELLS[choice - 1],
      where: MW_TEMPLE,
    });
  }
  switch (choice) {
    case 1:
      pc.hp += game.rng.random(10) + 1;
      if (pc.maxHp < pc.hp) pc.hp = pc.maxHp;
      break;
    case 2: {
      // Five separate rolls rather than one over 75, so the result piles up in the middle.
      let healed = 10;
      for (let roll = 0; roll < 5; roll++) healed += game.rng.random(15);
      pc.hp += healed;
      if (pc.maxHp < pc.hp) pc.hp = pc.maxHp;
      break;
    }
    case 3:
      pc.hp = pc.maxHp;
      break;
    case 4:
      pc.poisonTimer = -1;
      break;
    case 5:
      pc.diseaseTimer = -1;
      break;
    case 6:
      pc.returnX = pc.x;
      pc.returnY = pc.y;
      pc.returnDungeon = pc.dungeon;
      game.events.push({ kind: 'contractSigned', dungeon: pc.dungeon, x: pc.x, y: pc.y });
      break;
  }
}

/**
 * inn_clear_preparation (WORLD.EXE 2000:86b9, mw.c "FUN_2000_86b9"): every battle spell timer
 * goes out at once, and the two that had lent the character seven points take them back.
 *
 * dig_hole (exe 2000:a19d) calls it too, which is why digging through a floor costs the same
 * spells a night at the inn does. Power Weapon and Protection each have a level beside their
 * timer and both go, which is the only place a level left standing over a zero timer is cleared.
 */
export function innClearPreparation(game: MwGame): void {
  const pc = game.pc;
  if (pc.strengthTimer > 0) {
    pc.strengthTimer = 0;
    pc.str -= 7;
  }
  if (pc.speedTimer > 0) {
    pc.speedTimer = 0;
    pc.dex -= 7;
  }
  pc.slowEnemiesTimer = 0;
  pc.sleepTimer = 0;
  pc.holdMonsterTimer = 0;
  pc.powerWeaponTimer = 0;
  pc.powerWeaponLevel = 0;
  pc.protectionTimer = 0;
  pc.protectionLevel = 0;
  pc.resistDiseaseTimer = 0;
  pc.resistPoisonTimer = 0;
  pc.antiColdTimer = 0;
  pc.antiFireTimer = 0;
  pc.resistDrainTimer = 0;
}

/**
 * The other half of what a night takes away (WORLD.EXE 2000:2e6c, mw.c "FUN_2000_2e6c"): the
 * preparation spells, with the four stat markers giving back exactly what they handed out.
 *
 * The two enchantments are zeroed without anything to give back, because they are only ever a
 * plus on a roll. Feather is the only one of the three flags whose going changes the weight.
 */
export function innClearPreparationSpells(game: MwGame): void {
  const pc = game.pc;
  pc.enchantArmorLevel = 0;
  pc.enchantWeaponLevel = 0;
  if (pc.prepStrength !== 0) {
    pc.str -= 5;
    pc.prepStrength = 0;
  }
  if (pc.prepAgility !== 0) {
    pc.dex -= 5;
    pc.prepAgility = 0;
  }
  if (pc.superStrength !== 0) {
    pc.str -= 10;
    pc.superStrength = 0;
  }
  if (pc.superAgility !== 0) {
    pc.dex -= 10;
    pc.superAgility = 0;
  }
  // The permanent versions of all three write 100, which these tests leave standing.
  if (pc.feather === 1) {
    pc.feather = 0;
    recomputeWeight(game);
    game.events.push({ kind: 'weightRecomputed' });
  }
  if (pc.invisibility === 1) pc.invisibility = 0;
  if (pc.fastMove === 1) pc.fastMove = 0;
}

/**
 * inn (WORLD.EXE 2000:35b1, mw.c "inn"): the Flea Bag Inn, ten jewels a night.
 *
 * The night gives back every spell point, takes away every spell that was running and hands over
 * whatever levels the experience has earned since the last stay — all of them at once, because
 * {@link levelFromExperience} walks up from zero. It does not heal a single hit point.
 *
 * Under ten jewels the thugs throw the character out and nothing is charged, and nothing else
 * happens either: the spells keep running and the levels stay unclaimed.
 *
 * The eight hours the night takes are added to the counter at 0x7c0, in seconds rather than
 * minutes, and that counter is not the age at 0x7d6. Nothing reads it.
 *
 * @param stay what the "1) STAY FOR THE NIGHT / 2) RUN FOR YOUR LIFE" menu answers.
 */
export function inn(game: MwGame, stay: boolean): void {
  const pc = game.pc;
  // DS:2176 2192 21aa 21c6 21e3 2202 220f; Ghidra loses the eighth line, DS:222c.
  game.say(
    'WELCOME TO THE FLEA BAG INN',
    '   A WOODEN SIGN READS:',
    'OUR FINE ACCOMODATIONS WILL',
    'COST 10 JEWEL PIECES. PLEASE',
    'CHECK THE BED CAREFULLY BEFORE',
    'LYING DOWN. ',
    'ALSO, WE ARE NOT RESPONSIBLE',
    'FOR YOUR POSSESSIONS.',
  );
  // DS:2242 225f, DS:1eff with the money, DS:2275, DS:228d 22a3; Ghidra loses the eighth line,
  // DS:22b8, and the blank between the question and the choices.
  game.say(
    'THE ROOMS IN THIS FINE HOTEL',
    'COST 10 JP PER NIGHT.',
    `MONEY ON HAND: ${pc.money}`,
    'WOULD YOU LIKE TO STAY?',
    '',
    '1) STAY FOR THE NIGHT',
    '2) RUN FOR YOUR LIFE',
    '(THIS IS THE ONLY HOTEL)',
  );
  if (!stay) return;
  if (pc.money < INN_PRICE) {
    // DS:22d1 22ea 2307, then DS:20bd on the seventh line
    game.say(
      'THREE BIG THUGS BEAT YOU',
      'UP AND THROW YOU OUT BECAUSE',
      "YOU CAN'T PAY YOUR BILL.",
      '',
      '',
      '',
      'HIT ANY KEY...',
    );
    return;
  }
  pc.money -= INN_PRICE;
  game.events.push({ kind: 'coinsSpent', amount: INN_PRICE, on: A_NIGHT, where: MW_INN });
  pc.unread7c0 += 3600 * 8;
  pc.sp = pc.maxSp;
  innClearPreparation(game);
  innClearPreparationSpells(game);
  if (!canLevelUp(game)) return;
  const was = pc.lev;
  pc.lev = levelFromExperience(game);
  game.events.push({ kind: 'levelGained', level: pc.lev, from: was });
  // DS:2320 2341 235e 237d 239b 23bb 23d9
  game.say(
    'CONGRATULATIONS! YOU HAVE BECOME',
    'MORE POWERFUL. WHEN YOU GAIN',
    'LEVELS, YOU GAIN HEALTH POINTS',
    'AND YOU FIGHT BETTER. NOW YOU',
    'SHOULD BE ABLE TO BEAT MONSTERS',
    'MORE EASILY, OR YOU CAN FIGHT',
    'NASTIER MONSTERS.',
  );
}

/** What one stone of each kind is worth at the bank, and the only exchange in the game. */
const STONE_RATES = [200, 12, 4, 2] as const;
const PLATINUM_JEWELS = 5;

/**
 * bank (WORLD.EXE 2000:3716, mw.c "bank"): one pass round Moraff's First National Bank.
 *
 * The original loops until the player picks 5 or hits Escape; one call here is one choice, so
 * the play engine calls it again for the next.
 *
 * The exchange is one way and takes everything: each kind of stone is divided by its own rate
 * with the quotient rounded toward zero, and then all six counters are set to zero whatever the
 * quotient was. 199 copper stones become nothing and are gone, so converting small piles often
 * is strictly worse than hoarding and converting once.
 *
 * Deposit and withdraw read a number the game parses into a 16-bit word, so no single
 * transaction can move more than 65,535 jewels; anything larger than the balance moves the
 * balance instead.
 *
 * @param choice the menu, 1 convert, 2 deposit, 3 withdraw, 4 rob, 5 leave.
 * @param amount the number typed for a deposit or a withdrawal.
 */
export function bank(game: MwGame, choice: number, amount = 0): void {
  const pc = game.pc;
  // DS:23eb 2405 2416 241f 243a 244b 245d 2469
  game.say(
    "WELCOME TO MORAFF'S FIRST",
    '  NATIONAL BANK.',
    'OPTIONS:',
    '1) CONVERT TO JEWEL PIECES',
    '2) DEPOSIT MONEY',
    '3) WITHDRAW MONEY',
    '4) ROB BANK',
    '5) LEAVE BANK',
  );
  if (choice === 1) {
    const jewels =
      pc.stones[4] * PLATINUM_JEWELS +
      pc.stones[5] +
      Math.trunc(pc.stones[3] / STONE_RATES[3]) +
      Math.trunc(pc.stones[2] / STONE_RATES[2]) +
      Math.trunc(pc.stones[1] / STONE_RATES[1]) +
      Math.trunc(pc.stones[0] / STONE_RATES[0]);
    pc.money += jewels;
    for (let kind = 0; kind < pc.stones.length; kind++) pc.stones[kind] = 0;
    financialStatement(game);
    recomputeWeight(game);
    game.events.push({ kind: 'stonesConverted', jewels });
    game.events.push({ kind: 'weightRecomputed' });
    return;
  }
  if (choice === 2) {
    // DS:2477 with the money on the end, then DS:2489 24a0
    game.say(`MONEY AVAILABLE: ${pc.money}`, 'PLEASE TYPE THE AMOUNT', '  AND HIT ENTER:');
    const moved = moveMoney(amount, pc.money);
    pc.money -= moved;
    pc.bank += moved;
    if (moved > 0) game.events.push({ kind: 'deposited', amount: moved });
    financialStatement(game);
    return;
  }
  if (choice === 3) {
    // DS:2477 with the bank balance on the end, then DS:2489 24a0
    game.say(`MONEY AVAILABLE: ${pc.bank}`, 'PLEASE TYPE THE AMOUNT', '  AND HIT ENTER:');
    const moved = moveMoney(amount, pc.bank);
    pc.money += moved;
    pc.bank -= moved;
    if (moved > 0) game.events.push({ kind: 'withdrew', amount: moved });
    financialStatement(game);
    return;
  }
  if (choice === 4) {
    // DS:24b1 24c8
    game.say('COME ON! DO YOU REALLY', "  THINK I'D LET YOU ROB");
  }
}

/** The floors a quest boss stands on, and the kill flag bit that says it is already dead. */
const BOSS_FLOORS: readonly (readonly [number, number])[] = [
  [4, 0],
  [8, 1],
  [12, 2],
  [16, 3],
  [125, 4],
  [150, 5],
  [175, 6],
  [200, 7],
];

/**
 * The arrival greeting (WORLD.EXE 2000:248e, mw.c "FUN_2000_248e"): what a floor says when the
 * character walks onto it, as an H.BIN record number, or -1 for a floor that says nothing.
 *
 * Floor 0 always gets the town greeting. Each of the eight floors a quest boss stands on gets a
 * warning in verse from a little bird while that boss is alive; the tests the original writes
 * are remainders rather than bit tests, which come to the same thing. Every other floor has one
 * arrival in twelve show one of the little mouse's eight pieces of advice.
 *
 * Ghidra drops the record number on every one of these calls; they are read out of the
 * `mov ax, imm16` in front of each, and the last one out of the `add ax, 8` after the roll.
 */
export function arrivalHint(game: MwGame, floor: number): number {
  const killed = game.pc.killedBosses;
  // The first statement of the routine, before any of the tests below: even a floor that says
  // nothing keeps the little mouse quiet for a step.
  game.justArrived = true;
  if (floor === 0) {
    loadHBin(game, HINT.town);
    return HINT.town;
  }
  for (let boss = 0; boss < BOSS_FLOORS.length; boss++) {
    const [bossFloor, bit] = BOSS_FLOORS[boss];
    // The eighth test is a plain `killedBosses < 0x80` rather than a remainder, which comes to
    // the same thing on a byte. A boss floor whose boss is already dead falls through to the
    // mouse below rather than saying nothing.
    if (floor !== bossFloor || killed % (2 << bit) >= 1 << bit) continue;
    loadHBin(game, HINT.firstBoss + boss);
    return HINT.firstBoss + boss;
  }
  if (game.rng.random(12) !== 1) return -1;
  const record = HINT.firstMouse + game.rng.random(HINT.mouseCount);
  loadHBin(game, record);
  return record;
}
