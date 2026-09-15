import { ARMOR_NAMES, showHint, WEAPON_NAMES } from './drops';
import { bossTablet, hintOnArrival, innSignHint, sectionNumber, tabletMessage } from './hints';
import { checkGainLevel, gainLevel, levelUpScreen } from './levels';
import { computeWeight } from './magic';
import type { Game } from './state';

// The message text is the exact bytes of the game's own strings, read out of the data segment of
// the unpacked executable. The comment on each say call gives the address of every line it
// prints, in order; dotu-tools/reference/scripts/exe_strings.py reads them back.

/**
 * The price of each of the six weapons the store sells (exe DS:0363), which are the six of the
 * table past the fist. Menu entry 1 buys weapon 1, so the price of weapon `n` is `n - 1` here.
 */
export const WEAPON_PRICES = [1, 15, 300, 30, 250, 450];

/**
 * The price of each of the six suits of armor the store sells (exe DS:0371). The armor menu is
 * not shifted the way the weapon menu is: entry 1 buys armor 0, the bare skin the menu calls
 * "ROBES (USELESS)".
 */
export const ARMOR_PRICES = [1, 50, 300, 1500, 4000, 9900];

/** What each of the temple's seven menu entries costs (exe DS:037f); leaving is free. */
export const TEMPLE_PRICES = [10, 100, 500, 300, 500, 100, 0];

/** What the town's one inn is called in each of the five modules (exe DS:039b). */
export const INN_NAMES = ['HOLE', 'PLACE', 'INN', 'HOTEL', 'PALACE'];

/**
 * What the game calls the building on a square of the town: 1 the store, 2 the temple, 3 the
 * bank, 4 the inn.
 *
 * The first three name themselves in the message each greets the player with -- UH.BIN 93 "YOU
 * HAVE ENTERED A STORE", 95 "EXIT THE TEMPLE" and 100 "LEAVE BANK" -- and the inn has a name of
 * its own in each module.
 */
export function buildingName(module: number, building: number): string {
  if (building === 1) return 'STORE';
  if (building === 2) return 'TEMPLE';
  if (building === 3) return 'BANK';
  return INN_NAMES[module];
}

/** What the temple's first six menu entries are called (UH.BIN 95); the seventh leaves. */
export const TEMPLE_NAMES = [
  'CURE WOUNDS',
  'CURE SERIOUS WOUNDS',
  'HEAL ALL WOUNDS',
  'CURE POISON',
  'CURE DISEASE',
  'HELP A CHILD',
];

/** How long a night at the inn takes: eight hours, in seconds. */
export const INN_SECONDS = 8 * 3600;

/**
 * show_money (exe 2000:438f, unf.c "show_money"): the financial statement, which the store shows
 * after a purchase and the bank after every move.
 *
 * The heading is drawn above the box rather than printed in it, which is why it survives the
 * eight lines underneath being replaced.
 */
export function showMoney(game: Game): void {
  const pc = game.pc;
  // DS:0b38
  game.draw({ text: 'YOUR FINANCIAL STATEMENT:', x: 0x3a2, y: 0x301, font: 0, colour: 4 });
  // DS:0b52, then 0b62 0b6d 0b7f 0b91 0ba3 0bb5 0bc7 each with its number written after it
  game.say(
    'LIST OF ASSETS:',
    `YOUR AGE: ${pc.age}`,
    `CULTURE STOCK:   ${pc.cultureStock}`,
    `CHILDREN HELPED: ${pc.children}`,
    `MAGIC CRYSTALS:  ${pc.crystals}`,
    `AMERICAN DOLLARS:${pc.dollars}`,
    `RUBLES IN POCKET:${pc.money}`,
    `RUBLES IN BANK:  ${pc.bank}`,
  );
}

/**
 * store_refund (exe 2000:428d, unf.c "store_refund"): what the character actually pays for
 * culture stock or magic crystals once the children they have helped are taken off the bill.
 *
 * The discount is one per cent of the bill for every child, and never more than half of it. A
 * discount of two rubles or more is announced.
 */
export function storeRefund(game: Game, amount: number): number {
  let refund = (game.pc.children * amount) / 100;
  if (refund > amount / 2) refund = amount / 2;
  if (refund >= 2) {
    // DS:0a81 0a8e with the amount between them, 0a96, 0ab4, 0ad2, 0aef, 0b07, 0b24
    game.say(
      `  YOU SAVED ${Math.trunc(refund)} RUBLES`,
      'BECAUSE YOU HAVE HELPED NEEDY',
      'CHILDREN. IN MORAFFWARE GAMES',
      'YOU CAN BE REWARDED FOR GOOD',
      'WORKS,  BEFORE YOU DIE!',
      '  KEEP THAT IN MIND WHEN YOU',
      'REGISTER THIS GAME.',
    );
  }
  return Math.trunc(amount - refund);
}

/**
 * Money handed over in one of the town's buildings, for the run journal. A price of nothing --
 * the temple's seventh entry, which is the way out -- buys nothing and is not reported.
 */
function spent(game: Game, amount: number, on: string, building: number): void {
  if (amount === 0) return;
  game.events.push({ kind: 'coinsSpent', amount, on, where: buildingName(game.pc.module, building) });
}

/** g_store (exe 2000:45ab, unf.c "g_store"): the menu the store greets the player with. */
export function enterStore(game: Game): void {
  showHint(game, 93);
}

/**
 * g_store (exe 2000:45ab, unf.c "g_store"): buying one of the six weapons. `choice` is the menu
 * entry, 1 to 6, which is also the row of the weapon table the purchase lands in.
 */
export function buyWeapon(game: Game, choice: number): void {
  const price = WEAPON_PRICES[choice - 1];
  if (game.pc.money < price) {
    showHint(game, 92);
    return;
  }
  game.pc.weaponsOwned[choice] += 1;
  game.pc.money -= price;
  spent(game, price, WEAPON_NAMES[choice], 1);
  // DS:0bd9, 06f0, 0beb, 0c05, 0c1f, 0c3e, 06f0, 0c5a
  game.say(
    'EXCELLENT CHOICE!',
    '',
    'AFTER YOU EXIT THE STORE,',
    "HIT 'W' TO SELECT THE NEW",
    "WEAPON. OTHERWISE YOU'LL STILL",
    'FIGHT WITH YOUR OLD WEAPON.',
    '',
    'HIT ANY KEY...',
  );
}

/**
 * g_store (exe 2000:45ab, unf.c "g_store"): buying one of the six suits of armor. `choice` is
 * the menu entry, 1 to 6, and the armor bought is one row lower than that.
 *
 * Unlike a weapon purchase this one says nothing afterwards, so the only sign that it worked is
 * the money going down.
 */
export function buyArmor(game: Game, choice: number): void {
  const price = ARMOR_PRICES[choice - 1];
  if (game.pc.money < price) {
    showHint(game, 92);
    return;
  }
  game.pc.armorOwned[choice - 1] += 1;
  game.pc.money -= price;
  spent(game, price, ARMOR_NAMES[choice - 1], 1);
}

/**
 * g_store (exe 2000:45ab, unf.c "g_store"): what one unit of culture stock costs, which is the
 * character's level to the fourth power for practical purposes and rises fast.
 */
export function cultureStockPrice(game: Game): number {
  const lev = game.pc.lev;
  return Math.trunc(((Math.trunc(lev / 3) + 1) * lev * lev + 10) / 3);
}

/**
 * g_store (exe 2000:45ab, unf.c "g_store"): what one magic crystal costs. Hard difficulty pays
 * half again as much as normal difficulty for the same crystal.
 */
export function magicCrystalPrice(game: Game): number {
  const lev = game.pc.lev;
  const price = (Math.trunc(lev / 2) + 1) * lev * lev + 10;
  return Math.trunc(price / (game.pc.hard === 0 ? 3 : 2));
}

/**
 * g_store (exe 2000:45ab, unf.c "g_store"): buying culture stock. `rubles` is what the player
 * types in, which is a number of rubles and not a number of units — the store says so if it is
 * less than one unit's worth.
 */
export function buyCultureStock(game: Game, rubles: number): void {
  const price = cultureStockPrice(game);
  if (rubles < price) {
    showHint(game, 116);
    return;
  }
  if (rubles > game.pc.money) {
    // DS:0f15 0f2d 0f45 0f5e
    game.say(
      'WHAT, DO YOU THINK THIS',
      'IS SOME KIND OF A GAME?',
      "YOU DON'T HAVE THAT MUCH",
      'MONEY!',
    );
    return;
  }
  const units = Math.trunc(rubles / price);
  const bill = storeRefund(game, price * units);
  game.pc.money -= bill;
  game.pc.cultureStock += units;
  spent(game, bill, 'CULTURE STOCK', 1);
  showMoney(game);
}

/**
 * g_store (exe 2000:45ab, unf.c "g_store"): buying magic crystals, which is the same purchase
 * with a different price and a different way of saying the money is not there.
 */
export function buyMagicCrystals(game: Game, rubles: number): void {
  const price = magicCrystalPrice(game);
  if (rubles < price) {
    showHint(game, 116);
    return;
  }
  if (rubles > game.pc.money) {
    showHint(game, 94);
    return;
  }
  const units = Math.trunc(rubles / price);
  const bill = storeRefund(game, price * units);
  game.pc.money -= bill;
  game.pc.crystals += units;
  spent(game, bill, 'MAGIC CRYSTALS', 1);
  showMoney(game);
}

/** temple (exe 2000:4d39, unf.c "temple"): the menu the temple greets the player with. */
export function enterTemple(game: Game): void {
  showHint(game, 95);
}

/**
 * temple (exe 2000:4d39, unf.c "temple"): one visit to the temple. `choice` is the menu entry,
 * 1 to 7: the three cures, cure poison, cure disease, helping a needy child, and leaving.
 *
 * The money is taken before the spell is cast, and leaving is entry 7 at a price of nothing.
 */
export function temple(game: Game, choice: number): void {
  const pc = game.pc;
  const price = TEMPLE_PRICES[choice - 1];
  if (pc.money < price) {
    // DS:102b 1046 258b 258b 258b 258b 258b 0c5a
    game.say("SORRY, CAN'T BUY ON CREDIT", '  HERE.', '', '', '', '', '', 'HIT ANY KEY...');
    return;
  }
  pc.money -= price;
  spent(game, price, TEMPLE_NAMES[choice - 1] ?? '', 2);
  switch (choice - 1) {
    case 0:
      pc.hp += game.rng.random(10) + 1;
      if (pc.hp > pc.maxHp) pc.hp = pc.maxHp;
      return;
    case 1:
      pc.hp +=
        game.rng.random(45) +
        game.rng.random(45) +
        game.rng.random(45) +
        game.rng.random(45) +
        10;
      if (pc.hp > pc.maxHp) pc.hp = pc.maxHp;
      return;
    case 2:
      pc.hp = pc.maxHp;
      return;
    case 3:
      pc.poison = -1;
      return;
    case 4:
      pc.disease = -1;
      return;
    case 5:
      showHint(game, 96);
      pc.children += 1;
      return;
    case 6:
      return;
  }
}

/**
 * bank (exe 2000:568b, unf.c "bank"): the menu the bank greets the player with. The bank pays no
 * interest and charges nothing; all it does is hold money and change dollars into rubles.
 */
export function enterBank(game: Game): void {
  showHint(game, 100);
}

/**
 * bank (exe 2000:568b, unf.c "bank"), menu entry 1: a hundred Greater-American Dollars buy one
 * ruble, and whatever is left over stays in dollars.
 */
export function convertDollars(game: Game): void {
  const pc = game.pc;
  const rubles = Math.trunc(pc.dollars / 100);
  const dollars = pc.dollars - (pc.dollars % 100);
  pc.money += rubles;
  pc.dollars %= 100;
  if (rubles > 0) game.events.push({ kind: 'dollarsChanged', dollars, rubles });
  showMoney(game);
}

/**
 * How much of a typed amount the bank moves: an amount larger than there is, or a negative one,
 * moves the lot.
 *
 * The two C games clamp it with the same test, character for character -- Dungeons of the
 * Unforgiven's bank (exe 2000:568b, unf.c "bank") and Moraff's World's (WORLD.EXE 2000:3716,
 * mw.c "bank") -- which the rest of the two towns cannot say for themselves: the shops disagree
 * over whether a character with exactly the price can afford it.
 */
export function moveMoney(typed: number, available: number): number {
  return typed > available || typed < 0 ? available : typed;
}

/** bank (exe 2000:568b, unf.c "bank"), menu entry 2: a deposit. */
export function bankDeposit(game: Game, rubles: number): void {
  const pc = game.pc;
  const amount = moveMoney(rubles, pc.money);
  pc.money -= amount;
  pc.bank += amount;
  if (amount > 0) game.events.push({ kind: 'deposited', amount });
  showMoney(game);
}

/** bank (exe 2000:568b, unf.c "bank"), menu entry 3: a withdrawal. */
export function bankWithdraw(game: Game, rubles: number): void {
  const pc = game.pc;
  const amount = moveMoney(rubles, pc.bank);
  pc.money += amount;
  pc.bank -= amount;
  if (amount > 0) game.events.push({ kind: 'withdrew', amount });
  showMoney(game);
}

/** bank (exe 2000:568b, unf.c "bank"), menu entry 4: robbing the bank, which never works. */
export function robBank(game: Game): void {
  showHint(game, 101);
}

/**
 * end_prep_spells (exe 2000:4212, unf.c "end_prep_spells"): the preparation spells a night at
 * the inn puts an end to, each giving back the stat it was lending.
 *
 * A permanent Feather, Invisibility or Fast Move writes a value above 1, which is why only a 1
 * is cleared here.
 */
export function endPrepSpells(game: Game): void {
  const pc = game.pc;
  pc.tempArmorPlus = 0;
  pc.tempWeaponPlus = 0;
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
  if (pc.feather === 1) {
    computeWeight(game);
    pc.feather = 0;
  }
  if (pc.invisible === 1) pc.invisible = 0;
  if (pc.fastMove === 1) pc.fastMove = 0;
}

/**
 * FUN_2000_aa26 (exe 2000:aa26): the battle spells a night at the inn puts an end to. Strength
 * and Speed give back the seven points they were lending; the rest are timers and levels that
 * simply go to zero.
 */
export function endBattleSpells(game: Game): void {
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
  pc.powerWeaponTime = 0;
  pc.powerWeapon = 0;
  pc.protectionTime = 0;
  pc.protection = 0;
  pc.resistDiseaseTimer = 0;
  pc.resistPoisonTimer = 0;
  pc.antiColdTimer = 0;
  pc.antiFireTimer = 0;
  pc.resistDrainTimer = 0;
}

/**
 * flea_inn (exe 2000:4fe7, unf.c "flea_inn"): what a room costs tonight.
 *
 * The bill is the character's level to the fourth power plus ten, less one level's worth for
 * every child helped, and the children can never take off more than half of it.
 */
export function innRoomPrice(game: Game): number {
  const lev = game.pc.lev;
  const full = lev * lev * lev * lev + 10;
  const half = Math.trunc(full / 2);
  let price = full - game.pc.children * lev;
  if (price < half) price = half;
  // The original guards against a price below zero, which the half-price floor already rules out.
  if (price < 0) price = 1;
  return price;
}

/**
 * flea_inn (exe 2000:4fe7, unf.c "flea_inn"): the two screens the inn shows on the way in — the
 * module's own sign, what a night is going to cost in culture stock and crystals, and the room.
 */
export function enterInn(game: Game): void {
  const pc = game.pc;
  showHint(game, innSignHint(pc.module));
  showHint(game, 86);
  // DS:107d, 109b with the number after it, 10a3 with the number after it, 06f0, 10b6, 10d6 and
  // 10a3 the same way, 0c5a
  game.say(
    'CULTURE STOCK NEEDED TO AVOID',
    `AGING: ${pc.lev * pc.lev}`,
    `YOU HAVE (UNITS): ${pc.cultureStock}`,
    '',
    'MAGIC CRYSTALS NEEDED TO REGAIN',
    `SPELL POINTS: ${Math.trunc(pc.maxSp) - Math.trunc(pc.sp)}`,
    `YOU HAVE (UNITS): ${pc.crystals}`,
    'HIT ANY KEY...',
  );
  // DS:10e5, 1102 1108 with the price between them, 0d30 with the money after it, 06f0, 1111,
  // 1129, 1146, 115b 116e with the inn's name between them
  game.say(
    'THE ROOMS IN THIS FINE PLACE',
    `COST ${innRoomPrice(game)} RUBLES.`,
    `MONEY ON HAND: ${pc.money}`,
    '',
    'WOULD YOU LIKE TO STAY?',
    '1) STAY AND REST FOR A WHILE',
    '2) RUN FOR YOUR LIFE',
    `(THIS IS THE ONLY ${INN_NAMES[pc.module]} IN TOWN)`,
  );
}

/**
 * flea_inn (exe 2000:4fe7, unf.c "flea_inn"): the night itself.
 *
 * Eight hours pass, every preparation and battle spell ends, culture stock the square of the
 * character's level is spent to stop them ageing, magic crystals one per missing spell point are
 * spent to fill them up, and any level the experience has earned is handed over.
 *
 * The screen on the way in says the culture stock needed is the character's level squared and
 * the snake's own explanation says it is the level cubed; the code spends the square.
 */
export function stayTheNight(game: Game): void {
  const pc = game.pc;
  const price = innRoomPrice(game);
  if (pc.money < price) {
    showHint(game, 97);
    return;
  }
  pc.money -= price;
  spent(game, price, 'A ROOM', 4);
  pc.realtime += INN_SECONDS;
  endBattleSpells(game);
  endPrepSpells(game);

  const cultureCost = pc.lev * pc.lev;
  if (pc.cultureStock < cultureCost) {
    let years = cultureCost - pc.cultureStock;
    pc.cultureStock = 0;
    if (years > 6) years = 6;
    if (pc.age > 60) {
      pc.str -= years;
      if (pc.str < 2) pc.str = 2;
      pc.con -= years;
      if (pc.con < 2) pc.con = 2;
      showHint(game, 21);
    }
    pc.age += years;
    if (pc.age > 60 && pc.age - years <= 60) showHint(game, 98);
  } else {
    pc.cultureStock -= cultureCost;
  }

  const crystalCost = Math.trunc(pc.maxSp) - Math.trunc(pc.sp);
  if (pc.crystals < crystalCost) {
    if (pc.crystals < 0) pc.crystals = 0;
    pc.sp += pc.crystals;
    if (pc.sp < 0) pc.sp = 0;
    pc.crystals = 0;
    showHint(game, 99);
  } else {
    pc.sp = pc.maxSp;
    pc.crystals -= crystalCost;
  }

  if (checkGainLevel(game)) {
    const from = pc.lev;
    pc.lev = gainLevel(game);
    game.events.push({ kind: 'levelGained', level: pc.lev, from });
    if (pc.lev < 5) showHint(game, 22);
    levelUpScreen(game);
  }
}

/**
 * boss_office_message (exe 3000:6c9d, unf.c "boss_office_message"): the taunt the section's
 * Shadow boss would send now, and null when there is none to send.
 *
 * Module I's four bosses have three taunts each and every other section has one, so once a
 * section's count has caught up nothing more is offered. A boss that is already dead sends
 * nothing, and high speed mode skips the whole thing.
 */
export function bossOfficeTaunt(game: Game): number | null {
  const pc = game.pc;
  if (game.highSpeed) return null;
  const section = sectionNumber(game.rules, pc.module, pc.level);
  if ((pc.objective[pc.module] & (1 << section % 4)) !== 0) return null;
  return bossTablet(section, pc.bossTaunts[section]);
}

/** The two fixed lines of the taunt's heading, DS:28ea and DS:28f9. */
export const BOSS_OFFICE_HEADING = ['A MESSAGE FROM', 'THE OFFICE OF THE'];

/**
 * Where those three lines stand (exe 3000:6df8, 6e14 and 6e50): all at the same x, all in the
 * big font in colour 15, down the right of the boss's picture.
 */
export const BOSS_OFFICE_TEXT = { x: 400, font: 2, colour: 15, rows: [0x1e, 0xbe, 0x15e] };

/**
 * boss_office_message (exe 3000:6c9d, unf.c "boss_office_message"): the message itself, once the
 * player has asked to read it, and the count of the section's taunts that goes up with it.
 *
 * @returns the four lines of the taunt, which the original reads off the stone tablet it brings
 * down for them (`src/lib/play/boss-office.ts` draws it).
 */
export function readBossOfficeMessage(game: Game, tablet: number): string[] {
  const pc = game.pc;
  game.events.push({ kind: 'tabletRead', entry: tablet, section: sectionNumber(game.rules, pc.module, pc.level) });
  const lines = tabletMessage(tablet);
  game.say(...lines);
  const name = game.monsterKinds[22].name;
  // DS:28ea, 28f9, then the boss's name with the ':' at DS:266e on the end. These are pfont
  // calls beside the boss's own picture rather than a message box, so they stand on the screen
  // where `src/lib/play/boss-office.ts` draws the panel.
  [...BOSS_OFFICE_HEADING, `${name}:`].forEach((text, index) => {
    game.draw({ text, x: BOSS_OFFICE_TEXT.x, y: BOSS_OFFICE_TEXT.rows[index], font: BOSS_OFFICE_TEXT.font, colour: BOSS_OFFICE_TEXT.colour });
  });
  pc.bossTaunts[sectionNumber(game.rules, pc.module, pc.level)] += 1;
  return lines;
}

/**
 * boss_office_message (exe 3000:6c9d, unf.c "boss_office_message"): the snake's offer of the
 * taunt and the taunt itself. `read` is get_choice's answer to "1) SHOW ME THE MESSAGE".
 */
export function bossOfficeMessage(game: Game, read: boolean): void {
  const tablet = bossOfficeTaunt(game);
  if (tablet === null) return;
  showHint(game, 123);
  if (!read) return;
  readBossOfficeMessage(game, tablet);
}

/**
 * FUN_2000_31bc (exe 2000:31bc): the snake's word on arriving at a floor. `hintOnArrival` in
 * `hints.ts` picks the message; this shows it.
 */
export function arriveOnFloor(game: Game): void {
  const pc = game.pc;
  const hint = hintOnArrival(pc.module, pc.level, pc.objective[pc.module], game.rng);
  if (hint === null) return;
  showHint(game, hint);
}
