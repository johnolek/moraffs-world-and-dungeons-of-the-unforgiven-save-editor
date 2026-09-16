import {
  BATTLE_BANNER_Y,
  BATTLE_HP_Y,
  BATTLE_TEXT_COLOUR,
  BLOW_Y,
  clearMenuBlock,
  clearMessageLine,
  clearRect,
  MENU_X,
  messageLine,
} from './screens';
import { playBlowLanded, playBlowTaken } from './sound';
import type { Game, ScreenLine } from './state';
import { MAP_EMPTY, MAP_PLAYER, monsterAt, monsterSeen, setMonsterMap } from './state';

// The message text is the exact bytes of the game's own strings, read out of the data segment of
// the unpacked executable. The comment on each printed line gives the address of every string it
// is built from, in order; dotu-tools/reference/scripts/exe_strings.py reads them back.

/**
 * gain_or_drain (exe 2000:8189, unf.c "gain_or_drain"): move one of the six stats by `amount`,
 * which the monster tables hold as -6..-1 to drain and 1..6 to raise. Which stat it is comes
 * from the size of the number and how far it moves from the number itself, divided by that same
 * size — so every one of the twelve values moves its stat by exactly one point.
 *
 * The original leaves the stat's name in the shared string buffer at DS:c427 for its caller to
 * finish the sentence with; the port hands it back instead. A number outside -6..-1 and 1..6
 * changes nothing and leaves whatever was in the buffer, which is the empty string here.
 */
export function gainOrDrain(game: Game, amount: number): string {
  const pc = game.pc;
  switch (Math.abs(amount)) {
    case 1:
      pc.str += amount;
      return 'STRENGTH'; // DS:134e
    case 2:
      pc.iq += Math.trunc(amount / 2);
      return 'INTELLIGENCE'; // DS:1357
    case 3:
      pc.wis += Math.trunc(amount / 3);
      return 'WISDOM'; // DS:1364
    case 4:
      pc.con += Math.trunc(amount / 4);
      return 'CONSTITUTION'; // DS:136b
    case 5:
      pc.dex += Math.trunc(amount / 5);
      // DS:1378. The recovered source says "AGILITY" here; the 1993 executable says this.
      return 'DEXTERITY';
    case 6:
      pc.luck += Math.trunc(amount / 6);
      return 'LUCK'; // DS:1382
  }
  return '';
}

/** One line of a fight, drawn on the message block where the game's own pfont call puts it. */
function battleLine(text: string, y: number): ScreenLine {
  return { text, x: MENU_X, y, font: 0, colour: BATTLE_TEXT_COLOUR };
}

/** The colour a drain a monster brought with it is drawn in, which is the menu column's own. */
const DRAIN_COLOUR = 6;

/**
 * How long defend (exe 2000:82b7, unf.c "defend") leaves the puffball's line on the strip before
 * it returns (unf.c:13057). It is the one line of a fight the game waits on, and the wait is not
 * shortened by the high speed option.
 */
const PUFFBALL_MS = 1260;

/**
 * How long defend holds the strip empty before it writes the blow a monster landed
 * (exe 2000:8b09), which is what makes a second swing that reads the same as the first visibly
 * redraw. A miss goes straight up with no blank before it.
 */
const BLOW_BLANK_MS = 110;

/**
 * How long the blow stands before the box about a life drainer goes up (exe 2000:8c23), and
 * again before a stat is drained or raised (exe 2000:8ddc).
 */
const DRAIN_MS = 500;

/**
 * How long the last thing said stands before the box about a poisoning or a disease
 * (exe 2000:8e82). The pause is taken for every special a monster carries, the several that
 * print nothing afterwards included.
 */
const AILMENT_MS = 250;

/**
 * The beat defend ends every swing on: exe 2000:8f47 for a hit, exe 2000:8f67 for a miss. It is
 * what keeps two monsters' turns from arriving together.
 *
 * A third call at exe 2000:8f59 holds 350 ms, in a branch nested inside the same "did it miss?"
 * test that reached it, so nothing can ever run it.
 */
const HIT_TAIL_MS = 150;
const MISS_TAIL_MS = 100;

/**
 * The line defend (exe 2000:82b7) draws on the strip above the message box, which is where every
 * blow a monster lands goes.
 *
 * A line of 28 characters or more is handed to psfont (exe 4000:0db8) instead of pfont and is
 * spread out to x 0x638, so a long monster name still fits the strip.
 */
function defendLine(text: string): ScreenLine {
  const line = messageLine(text, BATTLE_TEXT_COLOUR);
  if (text.length >= 0x1c) line.spreadTo = 0x638;
  return line;
}

/**
 * strike (exe 2000:7e36, unf.c "strike"): one swing at the monster the player is engaging.
 * Returns the damage it did; zero is a miss. The caller only reaches it with something engaged.
 *
 * The roll is a d80 plus everything the character brings, less twice the monster's level and its
 * type's to-hit armor and speed. Every full 40 points the roll ends up above 40 rolls the
 * weapon's damage die once, so a big enough roll hits several times over.
 */
export function strike(game: Game): number {
  const pc = game.pc;
  // The original sets a flag at DS:c651 here that nothing in the game ever reads back.
  let die = pc.weapon;
  // A Power Weapon spell writes 1, 2 or 3, and eight rows into the weapon table is the row
  // labelled POWER WEAPON 1, so Power Weapon I swings the 129 die of POWER WEAPON 2 and Power
  // Weapon III swings the 399 die of POWER WEAPON 4, which no spell is supposed to reach.
  if (pc.powerWeapon !== 0) die = pc.powerWeapon + 8;
  // srand(clock()) at 2000:7e63, over the tick counter read at 2000:7e5d. Every roll in this
  // function is a bare rand(), so the whole swing runs off this one seed and the to-hit roll
  // below is the tick counter turned into a number. A game that draws its own random numbers
  // supplies no clock and nothing is reseeded: the README's third departure.
  if (game.clock) game.rng.reseed?.(game.clock());
  const monster = game.monsters[game.engaged];
  const stats = game.monsterStats[game.monsterKinds[monster.type].type];
  let chance = game.rng.random(80) + pc.lev * 2 + pc.str;
  if (pc.hard === 0) {
    if (pc.str > 25) chance += 25;
    chance += pc.str;
  }
  // The to-hit bonus and the plus come from the weapon in hand even when a power weapon is
  // supplying the damage die.
  chance +=
    pc.luck +
    pc.luckyCharms +
    game.weaponHit[pc.weapon] +
    pc.gauntlet +
    pc.weaponPlus[pc.weapon] +
    pc.tempWeaponPlus;
  if (pc.level > 75 && game.rng.random(30) === 1) chance += 40;
  chance -= monster.level * 2 + stats.defense + stats.speed;
  let damage = 0;
  while (chance > 40) {
    damage += game.rng.random(game.weaponDamage[die]);
    chance -= 40;
  }
  if (damage > 0) {
    damage +=
      game.rng.random(20) < pc.lev
        ? game.rng.random(pc.str)
        : game.rng.random(Math.trunc(pc.str / 3));
    if (damage > 0 && pc.lev < 5) damage += game.rng.random(5 - pc.lev);
    damage += game.rng.random(pc.lev);
  }
  // FUN_2000_295b (exe 2000:295b): the two lines the blow is drawn on and nothing else, so the
  // battle banner above and below them stands while the swing is on the screen.
  clearRect(game, 0x398, 0x3c5, 0x640, 0x419);
  // The original builds this line in the shared buffer at DS:c427 and prints the buffer once at
  // the end, so a miss lands on the second of the two lines with the first left empty.
  let below = 'YOU MISSED THE MONSTER'; // DS:1337
  if (damage >= 1) {
    // DS:1303
    game.draw(battleLine('YOU HIT THE MONSTER!!!', BLOW_Y[0]));
    // DS:131a 1324, with the damage written between them
    below = `IT TAKES ${damage} POINTS OF DAMAGE!`;
    playBlowLanded(game);
  }
  game.draw(battleLine(below, BLOW_Y[1]));
  // The original writes through the pointer at DS:c64b, which attack_timing aims at the engaged
  // monster's hit points at the same moment it writes the slot number this function reads.
  monster.hp -= damage;
  return damage;
}

/**
 * exp_needed (exe 2000:7b48, unf.c "exp_needed"): the experience a character has once they are
 * `level` levels in. A level drain writes this back over the character's experience, which is
 * how the drain takes away the progress towards the next level as well.
 *
 * Ghidra kept the two `pow` bases — the doubles at DS:0421 (1.4) and DS:0429 (2.0) — and dropped
 * the FPU arithmetic around them; the 250 and the 80 are `expNeeded` in `dotu-mech.js`.
 */
export function expNeeded(game: Game, level: number): number {
  if (game.pc.hard === 1) return 250 * Math.pow(2, level - 1);
  return 250 * Math.pow(1.4, level - 1) - 80;
}

/**
 * go_down_level (exe 3000:c093, unf.c "go_down_level"): take back one level's worth of maximum
 * hit points and spell points, rolled the same way the level-up gives them out. A fighter is the
 * only class with no spell points to lose.
 */
export function goDownLevel(game: Game): void {
  const pc = game.pc;
  switch (pc.cls) {
    case 0:
      pc.maxHp -= game.rng.random(pc.con * 2 + Math.trunc(pc.luck / 2) + 10) + 35;
      break;
    case 1:
      pc.maxHp -= game.rng.random(Math.trunc(pc.con / 2) + Math.trunc(pc.luck / 2) + 10) + 15;
      pc.maxSp -= Math.trunc((pc.wis * 2 + pc.iq) / 3);
      break;
    case 2:
      pc.maxHp -= game.rng.random(Math.trunc(pc.con / 2) + Math.trunc(pc.luck / 3) + 5) + 14;
      pc.maxSp -= Math.trunc((pc.wis + pc.iq) / 13);
      break;
    case 3:
      pc.maxHp -= game.rng.random(Math.trunc(pc.con / 3) + Math.trunc(pc.luck / 5) + 4) + 13;
      pc.maxSp -= Math.trunc((pc.wis + pc.iq * 2) / 5);
      break;
    case 4:
      pc.maxHp -= game.rng.random(Math.trunc(pc.con / 2) + Math.trunc(pc.luck / 3) + 4) + 14;
      pc.maxSp -= Math.trunc((pc.wis * 2 + pc.iq) / 5);
      break;
    case 5:
      pc.maxHp -= game.rng.random(pc.con * 3 + pc.luck + 17) + 55;
      pc.maxSp -= Math.trunc((pc.wis + pc.iq) / 14);
      break;
    case 6:
      pc.maxHp -= game.rng.random(Math.trunc(pc.con / 2) + Math.trunc(pc.luck / 3) + 7) + 14;
      pc.maxSp -= Math.trunc((pc.wis + pc.iq * 2) / 8);
      break;
  }
  if (pc.maxSp < pc.sp) pc.sp = pc.maxSp;
  if (pc.maxHp < pc.hp) pc.hp = pc.maxHp;
}

/**
 * The puffball half of defend (exe 2000:82b7, unf.c "defend"): a monster whose special is 6 does
 * not attack at all. It moves one of the six stats by a point and disappears.
 */
function puffball(game: Game, slot: number): number {
  const monster = game.monsters[slot];
  const amount = game.monsterKinds[monster.type].statDrain;
  const stat = gainOrDrain(game, amount);
  if (stat !== '') {
    game.events.push({ kind: 'statChanged', stat, by: Math.sign(amount), monster: monsterSeen(game, slot) });
  }
  // FUN_2000_28be (exe 2000:28be): the strip the line is about to go on.
  clearMessageLine(game);
  // DS:1387 / DS:139d, after the stat's own name
  const said = stat + (amount < 0 ? ' DRAINED BY PUFFBALL!' : ' RAISED BY PUFFBALL!');
  setMonsterMap(game, monster.x, monster.y, MAP_EMPTY);
  // The slot is not freed. It is left holding a level 0 monster of kind 0 — a Giant Garbage Can
  // — at (100, 100), off the right edge of an 80-wide floor. The occupancy grid is one unchecked
  // run of 80 * 110 bytes, so whenever it is rebuilt from the monster list (load_monster_map,
  // stock_level's come-back branch) that can lands at byte 8100, the square (20, 101).
  monster.x = 100;
  monster.y = 100;
  monster.hp = 0;
  monster.type = 0;
  monster.level = 0;
  game.redrawView = true;
  // FUN_2000_295b (exe 2000:83e5): the first two lines of the battle banner, so the monster the
  // puffball was is not still named beside the line saying it has gone.
  clearRect(game, 0x398, 0x329, 0x640, 0x379);
  game.draw(messageLine(said, DRAIN_COLOUR));
  // Without the wait the line is gone before it is seen: the loop draws the banner again as soon
  // as the move is over, and the block the banner is printed down is wiped first.
  game.delay(PUFFBALL_MS);
  return 0;
}

/**
 * What a monster's breath weapon is called, by the byte its kind carries: 1 fire, 2 ice, 3 acid,
 * 4 green phlegm, 5 black slime (exe DS:13c8 13cd 13d1 13d6 13e3). A monster with no breath
 * weapon carries 0 and never breathes.
 */
export const BREATH_NAMES = ['', 'FIRE', 'ICE', 'ACID', 'GREEN PHLEGM', 'BLACK SLIME'];

/**
 * The breath half of defend (exe 2000:82b7, unf.c "defend"): half the time, a monster whose
 * description names a breath weapon breathes it instead of swinging, and the damage worked out
 * above is thrown away for `level + Random(level)` (the Random call at 2000:8902), halved by the
 * matching resistance.
 *
 * Acid has no resistance and does something worse instead: it destroys the armor being worn,
 * plus and all, and leaves the character in their skin.
 */
function breathe(game: Game, slot: number): number {
  const pc = game.pc;
  const monster = game.monsters[slot];
  const breath = game.monsterKinds[monster.type].breath;
  const lines = ['', '', '', '', '', '', '', ''];
  // DS:13b2, then the five of BREATH_NAMES
  lines[0] = 'THE MONSTER BREATHES ' + (BREATH_NAMES[breath] ?? '');
  let damage = monster.level + game.randomCall(monster.level);
  if (breath === 1 && pc.antiFireTimer > 0) damage = Math.trunc(damage / 2);
  if (breath === 2 && pc.antiColdTimer > 0) damage = Math.trunc(damage / 2);
  if (breath === 4 && pc.resistDiseaseTimer > 0) damage = Math.trunc(damage / 2);
  if (breath === 5 && pc.resistPoisonTimer > 0) damage = Math.trunc(damage / 2);
  // DS:13ef 1402 140a
  lines[1] = `  ON YOU. IT DOES ${damage} POINTS`;
  lines[2] = '  OF DAMAGE TO YOU.';
  if (breath === 1 && pc.antiFireTimer < 1) lines[3] = 'YOU FEEL TOASTED.'; // DS:141e
  if (breath === 2 && pc.antiColdTimer < 1) lines[3] = 'YOU FEEL CHILLED.'; // DS:1430
  if (breath === 3 && pc.armor !== 0) {
    lines[3] = 'THE ACID DISOLVES YOUR ARMOR'; // DS:1442, the game's own spelling
    pc.armorPlus[pc.armor] = 0;
    pc.armorOwned[pc.armor] -= 1;
    pc.armor = 0;
  }
  if (breath === 4 && pc.resistDiseaseTimer < 1) {
    if (pc.disease < 1) pc.disease = 450;
    game.events.push({ kind: 'afflicted', what: 'disease', monster: monsterSeen(game, slot) });
    game.events.push({ kind: 'playerSaved' });
    // DS:145f 147c
    lines[3] = 'YOU FEEL VERY SICK. YOU NEED';
    lines[4] = '  A CURE DISEASE SPELL.';
  }
  if (breath === 5 && pc.resistPoisonTimer < 1) {
    if (pc.poison < 1) pc.poison = 450;
    game.events.push({ kind: 'afflicted', what: 'poison', monster: monsterSeen(game, slot) });
    game.events.push({ kind: 'playerSaved' });
    // DS:1494 14af
    lines[3] = 'YOU FEEL KIND OF WEAK. YOU';
    lines[4] = '  MIGHT GET A CURE POISON.';
  }
  game.say(...lines);
  game.reprintBattleInfo = true;
  return damage;
}

/**
 * What a hit brings with it, in defend (exe 2000:82b7, unf.c "defend"): the level or experience
 * drain, the stat drain, and the poison and disease. None of it happens on a miss.
 */
function drainsAndAilments(game: Game, slot: number): void {
  const pc = game.pc;
  const kind = game.monsterKinds[game.monsters[slot].type];
  const drain = kind.levelDrain;
  if ((drain < 0 || (drain !== 0 && pc.lev > 0)) && pc.resistDrainTimer < 1) {
    game.delay(DRAIN_MS);
    let taken = 0;
    if (drain < 1) {
      // The amount taken is the float 30.0 at DS:14df, not the monster's own number, which is
      // only what the message prints. Every experience drainer in the game holds -30, so the
      // two agree by luck rather than by design.
      taken = Math.min(pc.exp, 30);
      if (pc.exp <= 30) pc.exp = 0;
      else pc.exp -= 30;
    } else {
      pc.lev -= drain;
      pc.exp = expNeeded(game, pc.lev - 1);
      for (let i = 0; i < drain; i++) goDownLevel(game);
    }
    game.events.push({ kind: 'playerSaved' });
    if (drain < 1) game.events.push({ kind: 'experienceDrained', experience: taken, monster: monsterSeen(game, slot) });
    else game.events.push({ kind: 'levelLost', levels: drain, level: pc.lev, monster: monsterSeen(game, slot) });
    // DS:14e3, then DS:1500 for experience and DS:14f8 / DS:14ef for one level or several
    const lost =
      drain < 1
        ? `  YOU LOSE ${-drain} EXP. POINTS!`
        : `  YOU LOSE ${drain}` + (drain < 2 ? ' LEVEL!' : ' LEVELS!');
    // DS:150e, the line above, DS:06f0, DS:152a
    game.say('OH NO! HIT BY LIFE DRAINER!', lost, '', 'HIT ANY KEY');
    game.reprintBattleInfo = true;
    // erase_message_block (exe 4000:430e) reads the keyboard buffer empty, and FUN_2000_4054
    // then waits for a key with the box still up.
    game.pressAnyKey();
  }
  if (kind.statDrain !== 0) {
    game.delay(DRAIN_MS);
    // FUN_2000_28be (exe 2000:28be): the strip the line is about to go on.
    clearMessageLine(game);
    const stat = gainOrDrain(game, kind.statDrain);
    if (stat !== '') {
      game.events.push({ kind: 'statChanged', stat, by: Math.sign(kind.statDrain), monster: monsterSeen(game, slot) });
    }
    // DS:1536 / DS:1549, after the stat's own name
    const line = stat + (kind.statDrain < 0 ? ' HAS BEEN DRAINED!' : ' HAS BEEN RAISED!');
    game.events.push({ kind: 'playerSaved' });
    game.draw(messageLine(line, DRAIN_COLOUR));
    // FUN_2000_412a waits for a key here the way FUN_2000_4054 does above it, with the line on
    // the strip rather than a box in the block.
    game.pressAnyKey();
  }
  if (kind.special !== 0) {
    if (kind.special !== 99) game.events.push({ kind: 'playerSaved' });
    game.delay(AILMENT_MS);
    if (kind.special === 1 && pc.resistPoisonTimer < 1) {
      // DS:155b 1570 157c 1596 15b3 15cf 06f0 152a
      game.say(
        'OH NO! YOU HAVE BEEN',
        '  POISONED!',
        'YOU CAN GET A CURE POISON',
        '  AT THE TEMPLE IN THE TOWN.',
        'THERE IS ALSO A CURE POISON',
        '  SPELL.',
        '',
        'HIT ANY KEY',
      );
      game.reprintBattleInfo = true;
      game.pressAnyKey();
      if (pc.poison < 1) pc.poison = 450;
      game.events.push({ kind: 'afflicted', what: 'poison', monster: monsterSeen(game, slot) });
    }
    if (kind.special === 2 && pc.resistDiseaseTimer < 1) {
      // DS:15d8 15f1 15fc 1596 1617 15cf 06f0 152a
      game.say(
        'OH NO! YOU HAVE CAUGHT A',
        '  DISEASE!',
        'YOU CAN GET A CURE DISEASE',
        '  AT THE TEMPLE IN THE TOWN.',
        'THERE IS ALSO A CURE DISEASE',
        '  SPELL.',
        '',
        'HIT ANY KEY',
      );
      game.reprintBattleInfo = true;
      game.pressAnyKey();
      if (pc.disease < 1) pc.disease = 450;
      game.events.push({ kind: 'afflicted', what: 'disease', monster: monsterSeen(game, slot) });
    }
  }
}

/**
 * defend (exe 2000:82b7, unf.c "defend"): the monster in slot `slot` attacks the player. Returns
 * the damage it did; zero is a miss, a puffball, or a monster that is asleep or held.
 *
 * The roll is a d80 plus 20 and twice the monster's level, less everything the character is
 * wearing and carrying, and every full 40 points it ends up above 32 rolls the monster type's
 * damage die. Past that the damage is worked over three more times: a floor-deep bonus, a one in
 * four chance of throwing the whole roll away for a small one, and a constitution reduction.
 *
 * The permanent plus on the armor being worn is not in the subtraction anywhere, so a permanently
 * enchanted suit of armor is worth exactly as much as a plain one. The plus is only ever printed,
 * and destroyed by acid.
 */
export function defend(game: Game, slot: number): number {
  const pc = game.pc;
  const monster = game.monsters[slot];
  const kind = game.monsterKinds[monster.type];
  if (kind.special === 6) return puffball(game, slot);
  // Every attack the monster does not make is another roll at shaking the spell off, and the
  // deeper the floor the likelier that roll is to land.
  if (pc.sleepTimer >= 1) {
    pc.sleepTimer -= 1;
    if (game.rng.random(500) < pc.level) pc.sleepTimer = 0;
    return 0;
  }
  if (pc.holdMonsterTimer >= 1) {
    pc.holdMonsterTimer -= 1;
    if (game.rng.random(500) < pc.level) pc.holdMonsterTimer = 0;
    return 0;
  }
  // srand(clock() + 100) at 2000:84ca, deliberately not ported, because it never reached a die
  // in the original either: the roll below it is a Random call (exe 2000:4156, at 2000:84ee),
  // and Random seeds the generator from the clock again before it rolls. See the README's third
  // departure.
  const stats = game.monsterStats[kind.type];
  let chance = game.randomCall(80) + 20 + monster.level * 2;
  if (pc.cls === 2) chance -= game.rng.random(pc.iq);
  chance -= pc.lev * 2;
  chance -= pc.dex + pc.luck;
  chance -= Math.trunc(pc.dex / 2);
  chance -= pc.luckyCharms;
  chance -= game.armorHitChance[pc.armor];
  chance -= pc.tempArmorPlus;
  chance -= pc.shield;
  chance -= pc.bodyArmor;
  chance -= pc.protRing;
  chance -= pc.protection * pc.protection * 2;
  // The original sets a flag at DS:c64f here that nothing in the game ever reads back.
  let damage = 0;
  if (pc.level > 75) chance += Math.trunc((pc.level - 75) / 2);
  // The roll has to clear 32 for the first die but 40 comes off for each one, so 33 rolls the
  // die once, 73 rolls it twice, and every 40 points after that rolls it again.
  while (chance > 32) {
    damage += game.rng.random(stats.damageDie);
    chance -= 40;
  }
  if (game.rng.random(500) < pc.level) damage += 1;
  // One attack in four throws away everything above and rolls a small number instead, which can
  // come out zero and turn a hit into a miss.
  if (game.rng.random(4) === 1) damage = game.rng.random(Math.trunc(pc.level / 2) + 3);
  if (damage > 0 && pc.level > pc.lev) {
    damage += game.rng.random(pc.level - pc.lev);
    if (pc.level > 25) damage += game.rng.random(pc.level * 4);
    if (pc.level > 100) damage += game.rng.random(pc.level * 5);
    damage += game.rng.random(monster.level);
    let toughness = 100 - pc.con;
    if (toughness < 1) toughness = 1;
    damage = Math.trunc(((toughness + 50) * damage) / 150);
    if (damage < 1) damage = 1;
    // This reads as a cap on four times the floor number, but what it writes is the floor
    // number, so the biggest hits on floor 90 come down from 361-odd to 90.
    if (damage > pc.level * 4) damage = pc.level;
  }
  if (pc.lev === 0 && damage > 3) damage = game.rng.random(3) + 1;
  if (pc.lev < 3 && damage > 6) damage = Math.trunc(damage / 2);
  // The Random call at 2000:8817 is only made for a monster that has a breath weapon, so a
  // monster without one costs the sequence nothing here.
  let breathed: number | null = null;
  if (kind.breath !== 0 && game.randomCall(2) !== 0) {
    breathed = kind.breath;
    damage = breathe(game, slot);
  } else {
    // FUN_2000_28be (exe 2000:28be): the strip the line is about to go on.
    clearMessageLine(game);
    // DS:14ca, the monster's name, then DS:13fb with DS:14cf or DS:1402, or DS:14d6
    let line = `THE ${kind.name}`;
    if (damage > 0) {
      if (!game.repeatFight && !game.highSpeed) game.delay(BLOW_BLANK_MS);
      line += ` DOES ${damage}` + (damage === 1 ? ' POINT' : ' POINTS');
    } else {
      line += ' MISSES!';
    }
    if (damage > 0) playBlowTaken(game);
    game.draw(defendLine(line));
    if (damage > 0) drainsAndAilments(game, slot);
    // The town is the floor the character cannot be attacked on, so the beat is never taken
    // there; the flag and the option are what a player in a hurry turns it off with.
    if (!game.repeatFight && !game.highSpeed && pc.level > 0) {
      game.delay(damage > 0 ? HIT_TAIL_MS : MISS_TAIL_MS);
    }
  }
  if (damage > 0) pc.hp -= damage;
  game.events.push({ kind: 'hit', monster: monsterSeen(game, slot), damage, breath: breathed });
  return damage;
}

/**
 * check_engagement (exe 2000:a0c8, unf.c "check_engagement"): the slot of the monster standing
 * on the square the player faces, or -1 when there is nothing there or a wall in the way.
 */
export function checkEngagement(game: Game): number {
  const pc = game.pc;
  let x = pc.x;
  let y = pc.y;
  if (pc.dir === 0) {
    if (game.retdwall(x, y, 1, pc.level, pc.module) !== 3) return -1;
    y -= 1;
  }
  if (pc.dir === 1) {
    if (game.retdwall(x, y + 1, 1, pc.level, pc.module) !== 3) return -1;
    y += 1;
  }
  if (pc.dir === 2) {
    if (game.retdwall(x, y, 0, pc.level, pc.module) !== 3) return -1;
    x -= 1;
  }
  if (pc.dir === 3) {
    if (game.retdwall(x + 1, y, 0, pc.level, pc.module) !== 3) return -1;
    x += 1;
  }
  const slot = monsterAt(game, x, y);
  if (slot !== -1 && slot !== MAP_PLAYER) return slot;
  return -1;
}

/**
 * call_check_eng (exe 2000:a319, unf.c "call_check_eng"): let `seconds` of game time go by and
 * give every monster standing next to the player, with no wall between, whatever attacks that
 * much time buys it.
 *
 * A monster's timer counts down the seconds until its next attack and goes back up by
 * `(85 - its type's speed) / 3 + 10` after each one, so a speed 55 monster attacks every 20
 * seconds. Three attacks is the most one call can produce: the third one throws the timer up to
 * the character's whole agility first, which no ordinary action is long enough to spend.
 */
export function callCheckEng(game: Game, seconds: number): void {
  const pc = game.pc;
  game.secondsElapsed += seconds;
  // The town has no monsters, so only the clock moves.
  if (pc.level === 0) return;
  for (let slot = 0; slot < 145; slot++) {
    game.monsterTimers[slot] -= seconds;
    // Slow Enemies gives a third of the character's agility back to a monster's timer one check
    // in four — every monster on the floor, not only the ones standing next to the player.
    if (pc.slowEnemiesTimer > 0 && game.rng.random(4) === 0) {
      game.monsterTimers[slot] += Math.trunc(pc.dex / 3);
    }
    const monster = game.monsters[slot];
    const dx = monster.x - pc.x;
    const dy = monster.y - pc.y;
    if (!((dy === 0 && Math.abs(dx) === 1) || (dx === 0 && Math.abs(dy) === 1))) continue;
    if (
      !(
        (dy === -1 && game.retdwall(pc.x, pc.y, 1, pc.level, pc.module) === 3) ||
        (dy === 1 && game.retdwall(pc.x, pc.y + 1, 1, pc.level, pc.module) === 3) ||
        (dx === -1 && game.retdwall(pc.x, pc.y, 0, pc.level, pc.module) === 3) ||
        (dx === 1 && game.retdwall(pc.x + 1, pc.y, 0, pc.level, pc.module) === 3)
      )
    ) {
      continue;
    }
    let strikes = 0;
    while (game.monsterTimers[slot] < 0) {
      strikes += 1;
      if (strikes === 3) game.monsterTimers[slot] = pc.dex;
      // The kind is read again on each pass, so a puffball that has just turned itself into an
      // empty slot sets the next interval from monster type 0 rather than its own.
      const stats = game.monsterStats[game.monsterKinds[monster.type].type];
      game.monsterTimers[slot] += Math.trunc((85 - stats.speed) / 3) + 10;
      if (monster.hp > 0) game.lastMonsterDamage = defend(game, slot);
    }
  }
}

/**
 * attack_timing (exe 2000:b8f7, unf.c "attack_timing"): work out which monster the player is
 * fighting. It looks the way the player faces first and then round the other three sides, and
 * hands back the slot it settles on, leaving the character facing the way they were.
 *
 * Meeting a monster it was not already fighting, it usually starts that monster's attack timer
 * at a roll on the character's agility, which is why a nimble character gets the first move.
 * One new engagement in three does not, unless the character is invisible and lucky.
 */
export function attackTiming(game: Game): number {
  const pc = game.pc;
  const facing = pc.dir;
  let slot = checkEngagement(game);
  if (slot === -1) {
    pc.dir = (pc.dir + 1) % 4;
    slot = checkEngagement(game);
    if (slot === -1) {
      pc.dir = (pc.dir + 1) % 4;
      slot = checkEngagement(game);
      if (slot === -1) {
        pc.dir = (pc.dir + 1) % 4;
        slot = checkEngagement(game);
        // The step is inside the test and the wrap is not, so the fourth failure turns the
        // character one more time and every other path leaves the direction alone.
        if (slot === -1) pc.dir += 1;
        pc.dir = pc.dir % 4;
      }
    }
  }
  if (slot !== game.engaged) {
    game.engaged = slot;
    if (slot !== -1) game.events.push({ kind: 'met', monster: monsterSeen(game, slot), slot });
    // The original also aims the pointer at DS:c64b at this monster's hit points, which is what
    // strike writes its damage through.
    // The first of the three is a Random call (exe 2000:b9a6) and the other two are written
    // inline, so only the first reseeds.
    if (
      game.randomCall(3) !== 0 ||
      (pc.invisible !== 0 && game.rng.random(pc.level + Math.trunc(pc.level / 2)) > pc.lev)
    ) {
      const start = game.rng.random(pc.dex);
      // Walking away from the last monster leaves the slot at -1 and the original writes the
      // roll at monster_time[-1], which is the two bytes in front of the timer array: the start
      // of the monster status line at DS:c4dd. The port rolls and throws the roll away.
      if (game.engaged !== -1) game.monsterTimers[game.engaged] = start;
    }
  }
  game.enemyDir = pc.dir;
  pc.dir = facing;
  game.engagedAhead = checkEngagement(game);
  return slot;
}

/**
 * exp_value (exe 3000:a0fa, unf.c "exp_value"): what killing the monster in slot `slot` is
 * worth. Levels past the game's cap of 130 are all worth the same.
 *
 * Ghidra kept the `pow` base — the double at DS:2f60, which is 1.23 — and dropped the FPU
 * arithmetic around it; the shape is `expValue` in `dotu-mech.js`. A monster whose experience
 * multiplier is the exe's -1 makes the original return without leaving anything behind, so its
 * caller prints whatever was on the floating point stack; the port returns 0.
 */
export function expValue(game: Game, slot: number): number {
  const monster = game.monsters[slot];
  let level = monster.level;
  if (level > game.rules.experienceCap) level = game.rules.experienceCap;
  const kind = game.monsterKinds[monster.type];
  if (kind.expMult === 0) return 0;
  return kind.expMult * (level + 1 + 5 * Math.pow(1.23, level));
}

/**
 * print_battle_hp_info (exe 2000:b68d, unf.c "print_battle_hp_info"): the hit points line of the
 * battle banner. It reports the monster the player is facing, falling back to the one they are
 * engaging when there is nothing ahead of them.
 *
 * It is a line of its own rather than the last of the banner's five, because a swing that landed
 * calls it on its own to put the new number up.
 */
export function printBattleHpInfo(game: Game): void {
  const slot = game.engagedAhead === -1 ? game.engaged : game.engagedAhead;
  // FUN_2000_295b (exe 2000:295b): the strip this one line stands on, so the rest of the banner
  // stands while a swing puts a new number up.
  clearRect(game, 0x398, 0x377, 0x640, 0x3a1);
  // DS:1af7 1aff, with the hit points written between them
  game.draw(battleLine(`IT HAS ${game.monsters[slot].hp} HEALTH POINTS LEFT`, BATTLE_HP_Y));
}

/**
 * engagement_timing (exe 2000:b782, unf.c "engagement_timing"): the battle banner — the level
 * and name of the monster being fought, what killing it is worth, the line its type carries, and
 * its hit points. Despite the name the function catalog gives it, it keeps no time; the timers
 * are {@link callCheckEng} and {@link attackTiming}.
 *
 * The label in front of the experience gets shorter the deeper the floor is, because the number
 * behind it gets longer, and past floor 80 there is no room for a label at all.
 *
 * It wipes the eight lines of the message block with FUN_2000_2820 and draws its four over
 * them, so whatever box was standing there goes; the fifth line is {@link printBattleHpInfo},
 * which wipes its own strip.
 *
 * The caller only reaches this with a monster in front of the player. The original would read
 * the six bytes in front of the monster table if there were not.
 */
export function engagementTiming(game: Game): void {
  const pc = game.pc;
  game.battleInfoOn = true;
  game.engagedAhead = checkEngagement(game);
  const monster = game.monsters[game.engagedAhead];
  const kind = game.monsterKinds[monster.type];
  clearMenuBlock(game);
  // DS:1b13 with the level written on the end
  game.draw(battleLine(`YOU ARE FIGHTING A LEVEL ${monster.level}`, BATTLE_BANNER_Y[0]));
  game.draw(battleLine(kind.name, BATTLE_BANNER_Y[1]));
  let label = ''; // DS:06f0
  if (pc.level <= 80) {
    if (pc.level <= 40) {
      if (pc.level <= 10) label = 'EXP. VALUE: '; // DS:1b37
      else label = 'EXP: '; // DS:1b31
    } else label = 'EX:'; // DS:1b2d
  }
  // DS:12fb is "%-20.0f", so the number is padded out to twenty columns with spaces
  const worth = label + expValue(game, game.engagedAhead).toFixed(0).padEnd(20);
  game.draw(battleLine(worth, BATTLE_BANNER_Y[2]));
  game.draw(battleLine(game.monsterStats[kind.type].text, BATTLE_BANNER_Y[3]));
  printBattleHpInfo(game);
}

/**
 * move_seconds (exe 2000:b1b7, unf.c "move_seconds"): how many seconds one step costs. A
 * character carrying nothing much with a good agility takes one second; every hundred points of
 * weight over ten times their agility adds another.
 */
export function moveSeconds(game: Game): number {
  let over = game.pc.loadedWeight + 100 - game.pc.dex * 10;
  if (over < 0) over = 0;
  return Math.trunc(over / 100) + 1;
}

/**
 * The player's attack time, which movecontrol (exe 2000:c308, unf.c "movecontrol") spends inline
 * rather than in a function of its own: the weapon in hand costs its own time, and a character
 * whose agility is under 84 pays a fifth of what they are short on top.
 *
 * `attackSeconds` in `dotu-mech.js` adds the two together, which is the total time a swing
 * costs. The game spends them as two separate checks, and each check is another run at an
 * adjacent monster's timer, so the two are not quite the same thing.
 */
export function spendAttackTime(game: Game): void {
  const pc = game.pc;
  callCheckEng(game, game.weaponTime[pc.weapon]);
  if (85 - pc.dex > 1) callCheckEng(game, Math.trunc((85 - pc.dex) / 5));
}
