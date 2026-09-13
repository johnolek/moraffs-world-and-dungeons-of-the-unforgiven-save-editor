import data from '../mw-data.json';
import {
  MW_FLOOR_SLOSHER,
  MW_HEALING_POTION,
  MW_HOLY_HAND_GRENADE,
  MW_SEEING_STONE,
  MW_TELEPORT_STONE,
} from './items';
import { recomputeWeight } from './magic';
import { mwSpellHelp, mwSpellRecord } from './spells';
import type { MwGame } from './state';
import { mwClearMessageLine, mwMessageLine } from './state';
import { financialStatement } from './town';

/**
 * What a dead monster leaves behind.
 *
 * monster_killed (WORLD.EXE 3000:d51c, mw.c "monster_killed") calls every one of these in turn.
 * The message text is the exact bytes of the game's own strings, read out of the data segment of
 * the unpacked executable; the comment on each say call gives the address of every line it
 * prints, in order.
 *
 * **The loot rolls read a monster that is no longer there.** monster_killed blanks the monster's
 * slot — position, hit points, type and depth all to zero — before it calls any of these, so
 * every routine below that reads the monster's depth reads a zero. The three that do
 * ({@link weaponFind}, {@link armorFind} and {@link moneyFind}) read the slot the way the game
 * does rather than being handed the depth, so a test can set a depth and watch the gate, and a
 * kill through monster_killed sees the zero.
 */

const WEAPONS = data.weapons;
const ARMOUR = data.armour;

/** The class byte: 0 Fighter, 1 Worshipper, 2 Monk, 3 Wizard, 4 Priest, 5 Sage, 6 Mage. */
const FIGHTER = 0;
const WORSHIPPER = 1;
const MONK = 2;
const WIZARD = 3;
const PRIEST = 4;
const SAGE = 5;
const MAGE = 6;

/** The four sub-categories of the spell tables: permanent, preparation, wizard, priestly. */
const SPELLS_PER_TYPE = 45;
const SLOTS_PER_LEVEL = 3;

/** Where one of the 180 spell flags sits, which is `type * 45 + level * 3 + slot`. */
function spellIndex(type: number, level: number, slot: number): number {
  return type * SPELLS_PER_TYPE + level * SLOTS_PER_LEVEL + slot;
}

/** The colour FUN_3000_b99e draws its line in, which is the white of the fixed UI colours. */
const GOOD_NEWS_COLOUR = 15;

/** The two pauses FUN_3000_b99e takes, one either side of the line it draws (WORLD.EXE 3000:b9a1
 *  and 3000:ba1a). */
const BEFORE_GOOD_NEWS_MS = 1000;
const GOOD_NEWS_MS = 1300;

/**
 * The banner in front of a find (WORLD.EXE 3000:b99e, mw.c "FUN_3000_b99e"): a pause, a wiped
 * message line and "GOOD NEWS..." in white on the strip above the message box the find itself
 * goes in, so it reads as the find's heading.
 *
 * The first pause is what leaves whatever the kill last wrote on the strip up long enough to be
 * read; the second holds this line before the find goes in the box. Nothing wipes it, so it
 * stands until the next thing written on that strip replaces it.
 */
export function goodNews(game: MwGame): void {
  game.delay(BEFORE_GOOD_NEWS_MS);
  mwClearMessageLine(game);
  // DS:5dfb, whose first two bytes are the float in front of it
  game.draw(mwMessageLine('GOOD NEWS...', GOOD_NEWS_COLOUR));
  game.delay(GOOD_NEWS_MS);
}

/**
 * The two lines that name a found spell (WORLD.EXE 3000:c8e6, mw.c "FUN_3000_c8e6"): its level,
 * counted from one rather than from the zero the tables are indexed by, and which of the four
 * lists it belongs to.
 */
export function spellDescription(level: number, type: number): string[] {
  // DS:6020 with the level written on the end, then DS:6038 604b 6060 6070
  const lines = [`  THE SPELL IS A LEVEL ${level + 1}`, ''];
  if (type === 0) lines[1] = '  PERMANENT SPELL.';
  if (type === 1) lines[1] = '  PREPARATION SPELL.';
  if (type === 2) lines[1] = '  WIZARD SPELL.';
  if (type === 3) lines[1] = '  PRIESTLY SPELL';
  return lines;
}

/** The depth of the monster whose slot is being looted, which the kill has already zeroed. */
function lootedDepth(game: MwGame): number {
  return game.monsters[game.engaged].depth;
}

/**
 * The weapon find (WORLD.EXE 3000:ba27, mw.c "FUN_3000_ba27"): one of the seven weapons past
 * bare fists, offered only to a character who owns none of that kind.
 *
 * The find gets harder the better the weapon, because the roll it has to beat runs over a
 * hundred more values per row of the table, and it is the monster's depth plus ten that has to
 * beat it. The seven run from a stick to a great sword, which the store does not sell either.
 * A Monk is offered nothing at all.
 *
 * @param take the "1) TAKE THE WEAPON / 2) LEAVE THE WEAPON" menu, which the original reads
 *   from the keyboard once the box is on the screen, and which is not read at all when nothing
 *   was found.
 */
export function weaponFind(game: MwGame, take: () => boolean): void {
  const pc = game.pc;
  if (pc.cls === MONK) return;
  const row = game.rng.random(7) + 1;
  if (lootedDepth(game) + 10 < game.rng.random(row * 100)) return;
  if (pc.weaponsOwned[row] > 0) return;
  goodNews(game);
  // DS:5e0a with the weapon's name on the end, then 5e16 5e29, 5e3d 5e56 5e71
  game.say(
    `YOU FIND A ${WEAPONS[row].name}`,
    '',
    '1) TAKE THE WEAPON',
    '2) LEAVE THE WEAPON',
    '',
    'NOTE THAT YOU MAY END UP',
    'WITH SEVERAL WEAPONS WHICH',
    'WILL WEIGH YOU DOWN.',
  );
  if (take()) {
    pc.weaponsOwned[row] += 1;
    game.events.push({ kind: 'found', find: { what: 'weapon', item: WEAPONS[row].name } });
    recomputeWeight(game);
    game.events.push({ kind: 'weightRecomputed' });
  }
}

/**
 * The armor find (WORLD.EXE 3000:bbe1, mw.c "FUN_3000_bbe1"): one of the six suits past bare
 * skin, on the same rising roll as the weapon.
 *
 * Unlike the weapon, it is offered whether or not the character already owns that suit, which
 * is why the message warns about ending up with several. The six run from leather to titanium,
 * so a find is the only way to a suit of titanium: the store's menu stops at field plate.
 *
 * @param take the "1) TAKE THE ARMOR / 2) LEAVE THE ARMOR" menu, read where the original reads
 *   it: after the box, and not at all when nothing was found.
 */
export function armorFind(game: MwGame, take: () => boolean): void {
  const pc = game.pc;
  if (pc.cls === MONK) return;
  const row = game.rng.random(6) + 1;
  if (lootedDepth(game) + 10 < game.rng.random(row * 100)) return;
  goodNews(game);
  // DS:5e86 with the armour's name on the end, then 5e9a 5ea3 5eb5, 5e3d 5ec8 5ede
  game.say(
    `YOU FIND A SUIT OF ${ARMOUR[row].name}`,
    '  ARMOR.',
    '1) TAKE THE ARMOR',
    '2) LEAVE THE ARMOR',
    '',
    'NOTE THAT YOU MAY END UP',
    'WITH SEVERAL SUITS OF',
    'ARMOR WEIGHING YOU DOWN.',
  );
  if (take()) {
    pc.armorOwned[row] += 1;
    game.events.push({ kind: 'found', find: { what: 'armour', item: ARMOUR[row].name } });
    recomputeWeight(game);
    game.events.push({ kind: 'weightRecomputed' });
  }
}

/** What the pile of stones is worth in jewels, which is the bank's rate to the letter. */
const STONES_PER_JEWEL = [200, 12, 4, 2] as const;
/** A platinum stone is five jewels and a jewel stone one. */
const PLATINUM_JEWELS = 5;
/** The metal stones weigh a pound per sixteen (recompute_weight, exe 2000:2d8e). */
const STONES_PER_POUND = 16;

/** The six piles a money find can turn up, in the order the record keeps them. */
interface MwStonePile {
  copper: number;
  silver: number;
  ivory: number;
  gold: number;
  platinum: number;
  jewel: number;
}

/** What a pile of stones comes to in jewels, at the rates the find's own box prints. */
function jewelsWorth(pile: MwStonePile): number {
  return (
    Math.trunc(pile.copper / STONES_PER_JEWEL[0]) +
    Math.trunc(pile.silver / STONES_PER_JEWEL[1]) +
    Math.trunc(pile.ivory / STONES_PER_JEWEL[2]) +
    Math.trunc(pile.gold / STONES_PER_JEWEL[3]) +
    pile.jewel +
    pile.platinum * PLATINUM_JEWELS
  );
}

/** min (WORLD.EXE 3000:bd9e, mw.c "FUN_3000_bd9e"), which only the copper and silver use. */
function smaller(a: number, b: number): number {
  return b < a ? b : a;
}

/**
 * The money find (WORLD.EXE 3000:bdb5, mw.c "FUN_3000_bdb5"): six piles of stones, each rolled
 * on its own, with a menu for which of them are worth carrying.
 *
 * A find happens one kill in three, and then each pile has its own chance and its own size. The
 * copper and silver piles are the only ones that stop growing with the floor, at floor 140. Past
 * floor 10 a further roll adds a pile of jewel stones that dwarfs everything else.
 *
 * Two things that look unintended stay. The check for whether anything was found leaves the
 * jewel stones out of the sum, so a find that is nothing but jewel stones is thrown away without
 * a word; and the line that says which stone the pile is mostly compares the platinum count
 * against the jewel stones' *value* rather than their count.
 *
 * @param take the pile menu, read where the original reads it: after the box, and not at all
 *   when nothing was found or the pile was too heavy to lift. A all, L or Escape none, I ivory
 *   and better, G gold and better, P platinum and jewel, J jewel stones only.
 */
export function moneyFind(game: MwGame, take: () => string): void {
  const pc = game.pc;
  const rng = game.rng;
  // srand(time(NULL)) at 3000:bdd6, deliberately not ported: see the README's third departure.
  const depth = lootedDepth(game);
  const floor = pc.floor;
  if (rng.random(3) !== 0) return;
  const found: MwStonePile = { copper: 0, silver: 0, ivory: 0, gold: 0, platinum: 0, jewel: 0 };
  // Each pile rolls its own size before it rolls how far the floor stretches it, and the two
  // are kept apart here so the sequence of rolls is the one the original makes.
  if (rng.random(3) === 0) {
    const size = rng.random(depth + 61);
    found.copper = rng.random(floor + 1) * size + rng.random(smaller(floor, 140) * 200 + 500);
  }
  if (rng.random(3) === 0) {
    const size = rng.random(depth + 51);
    found.silver = rng.random(floor + 1) * size + rng.random(smaller(floor, 140) * 200 + 50);
  }
  if (rng.random(4) === 0) {
    const size = rng.random(depth + 31);
    found.ivory = rng.random(floor + 1) * size + rng.random(floor * 10 + 10);
  }
  if (rng.random(4) === 0) {
    const size = rng.random(depth + 11);
    found.gold = rng.random(floor + 1) * size + rng.random(floor * 5 + 3);
  }
  if (rng.random(5) === 0) {
    const size = rng.random(floor * 2 + 6);
    found.platinum = rng.random(floor + 1) * size;
  }
  if (rng.random(5) === 0) {
    const size = rng.random(Math.trunc(floor / 2) + 1);
    const pile = rng.random(floor + 1) * (rng.random(floor + 1) * size);
    found.jewel = 20 * rng.random(floor + 10) + pile;
  }
  if (rng.random(1250) < floor - 10) {
    const size = rng.random(floor);
    found.jewel += 100 * (rng.random(Math.trunc(floor / 4) + 10) * size) + rng.random(10000);
  }
  // The jewel stones are not in this sum, so a find of nothing but jewel stones goes unmentioned.
  const stones = found.copper + found.silver + found.ivory + found.gold + found.platinum;
  if (stones === 0) return;
  game.eraseScreen();
  const worth = jewelsWorth(found);
  // DS:5ef7 with the worth between it and DS:5f01, then 5f0e with the weight on the end, 5f23
  const lines = [
    `YOU FIND ${worth} STONES. THE`,
    `  PILE WEIGHS ABOUT ${Math.trunc(stones / STONES_PER_POUND)}`,
    '  POUNDS. THEY ARE MOSTLY',
    '',
    '',
    '',
    '',
    '',
  ];
  // DS:5f3d 5f46 5f4f 5f57 5f5e 5f69, each with DS:4a06 on the end
  let mostly = '  JEWEL';
  if (found.silver < found.copper && found.ivory < found.copper && found.gold < found.copper && found.platinum < found.copper) {
    mostly = '  COPPER';
  } else if (found.ivory < found.silver && found.gold < found.silver && found.platinum < found.silver) {
    mostly = '  SILVER';
  } else if (found.gold < found.ivory && found.platinum < found.ivory) {
    mostly = '  IVORY';
  } else if (found.platinum < found.gold) {
    mostly = '  GOLD';
  } else if (found.jewel < found.platinum) {
    // The platinum count against the jewel stones' value in jewels, not against their count.
    mostly = '  PLATINUM';
  }
  lines[3] = mostly + ' STONES.';
  if (pc.weight * 3 < pc.loadedWeight) {
    // DS:5f71 5f89, then DS:4a75 on the last line
    lines[4] = 'IT IS TOO HEAVY FOR YOU';
    lines[5] = '  YOU TO CARRY.';
    lines[7] = 'HIT ANY KEY...';
    game.say(...lines);
    return;
  }
  // DS:5f99 5fb6 5fd3 5ff0
  lines[4] = 'A) TAKE ALL    L) LEAVE ALL ';
  lines[5] = 'J) JEWELS ONLY P) PL AND JWL';
  lines[6] = 'G) GLD,PL,JWL  I) I,G,PL,JWL';
  lines[7] = 'NOTE - SORTING TAKES TIME';
  game.say(...lines);
  // The key loop takes only these six and Escape; Escape leaves the lot behind, like L.
  const taken = take();
  if (!'IGPAJL'.includes(taken)) return;
  if (taken === 'L') return;
  if (taken === 'A') {
    pc.stones[0] += found.copper;
    pc.stones[1] += found.silver;
  }
  if (taken === 'A' || taken === 'I') pc.stones[2] += found.ivory;
  if ('IGA'.includes(taken)) pc.stones[3] += found.gold;
  if ('IGPA'.includes(taken)) pc.stones[4] += found.platinum;
  if ('IGPAJ'.includes(taken)) pc.stones[5] += found.jewel;
  // What the character walked away with, which is the piles the sorting letter took rather than
  // the whole find the box offered.
  const kept = jewelsWorth({
    copper: taken === 'A' ? found.copper : 0,
    silver: taken === 'A' ? found.silver : 0,
    ivory: taken === 'A' || taken === 'I' ? found.ivory : 0,
    gold: 'IGA'.includes(taken) ? found.gold : 0,
    platinum: 'IGPA'.includes(taken) ? found.platinum : 0,
    jewel: found.jewel,
  });
  game.events.push({ kind: 'found', find: { what: 'money', amount: kept } });
  recomputeWeight(game);
  game.events.push({ kind: 'weightRecomputed' });
  financialStatement(game);
}

/**
 * The cup of health (WORLD.EXE 3000:d37f, mw.c "FUN_3000_d37f"): one kill in five heals a
 * wounded character three points plus a roll, and a little more below floor 6.
 */
export function cupOfHealth(game: MwGame): void {
  const pc = game.pc;
  if (game.rng.random(5) !== 0 || pc.hp === pc.maxHp) return;
  const before = pc.hp;
  pc.hp += game.rng.random(11) + 3;
  if (pc.floor > 6) pc.hp += game.rng.random(4);
  // DS:66c3, DS:66de 66f5 670c 530b, DS:4a75
  game.say(
    'YOU FOUND A CUP OF HEALTH!',
    '',
    'PRESS ANY KEY TO DRINK',
    '  THE WONDERFUL LIQUID',
    '  AND GAIN A FEW HEALTH',
    '  POINTS.',
    '',
    'HIT ANY KEY...',
  );
  if (pc.maxHp < pc.hp) pc.hp = pc.maxHp;
  game.events.push({ kind: 'cupOfHealth', healed: pc.hp - before });
}

/**
 * The shimmering ball of thought (WORLD.EXE 3000:d43b, mw.c "FUN_3000_d43b"): one kill in seven
 * gives back a single spell point, to anyone but a fighter, who has none to give back.
 */
export function ballOfThought(game: MwGame): void {
  const pc = game.pc;
  if (game.rng.random(7) !== 0) return;
  if (pc.sp === pc.maxSp || pc.cls === FIGHTER) return;
  pc.sp += 1;
  // DS:6724 6740, DS:674e 6766 677e, DS:4a75
  game.say(
    'YOU FOUND A SHIMMERING BALL',
    '  OF THOUGHT!',
    '',
    'PRESS ANY KEY TO ABSORD',
    '  THE ENERGY AND GAIN A',
    '  SPELL POINT.',
    '',
    'HIT ANY KEY...',
  );
  game.events.push({ kind: 'ballOfThought' });
}

/**
 * How deep a spell find reaches: the floor scaled down per kind of find, capped at ten levels
 * by rolling again over all ten when the first roll comes out too high.
 */
function foundSpellLevel(game: MwGame, span: number): number {
  const level = game.rng.random(span);
  return level > 9 ? game.rng.random(10) : level;
}

/**
 * Which of the four lists a spellbook or scroll comes from, and whether the character's class
 * will have it. A worshipper or priest turns down a wizard spell and a wizard or mage turns down
 * a priestly one, in both cases by walking away from the find rather than drawing again.
 */
function refusesList(cls: number, type: number): boolean {
  if (type === 2 && (cls === WORSHIPPER || cls === PRIEST)) return true;
  if (type === 3 && (cls === WIZARD || cls === MAGE)) return true;
  return false;
}

/**
 * The spellbook find (WORLD.EXE 3000:c977, mw.c "FUN_3000_c977"): a spell the character can cast
 * out of their own head from now on.
 *
 * Fighters and monks never find one. A sage has to get past two rolls nobody else does, both of
 * which run over a range that shrinks with the floor, so the deeper a sage goes the more often
 * the rejection turns into a find. The level is drawn from two thirds of the floor, so the
 * biggest spells want floor 15 and below.
 */
export function spellbookFind(game: MwGame): void {
  const pc = game.pc;
  const rng = game.rng;
  if (pc.cls === FIGHTER || pc.cls === MONK) return;
  if (pc.cls === SAGE) {
    if (rng.random(300 - pc.floor) > 175) return;
    if (rng.random(400 - pc.floor) > 140) return;
  }
  const level = foundSpellLevel(game, Math.trunc((pc.floor * 2) / 3));
  const type = rng.random(4);
  if (refusesList(pc.cls, type)) return;
  const slot = rng.random(3);
  const at = spellIndex(type, level, slot);
  if (pc.spellbook[at] > 0) return;
  goodNews(game);
  // DS:6081, the two lines of FUN_3000_c8e6, DS:609d 60bb
  game.say(
    'YOU HAVE FOUND A SPELLBOOK.',
    ...spellDescription(level, type),
    'HIT ANY KEY FOR A DESCRIPTION',
    '  OF THE SPELL.',
  );
  pc.spellbook[at] = 1;
  describeTheSpell(game, type, level, slot);
  game.events.push({ kind: 'found', find: { what: 'spellbook', spell: { type, level, slot } } });
}

/**
 * load_spell_lines (WORLD.EXE 3000:b7fd, mw.c "load_spell_lines") and the box that shows what it
 * read, which every one of the four finds ends with: `FUN_3000_c977` at mw.c:c9dc and the three
 * like it read the spell's own description out of SPELLS.HLP and print it.
 *
 * The box before this one says HIT ANY KEY FOR A DESCRIPTION, and this is the description.
 *
 * `level` is counted from zero here and `mwSpellRecord` counts it from one.
 */
function describeTheSpell(game: MwGame, type: number, level: number, slot: number): void {
  game.say(...mwSpellHelp(mwSpellRecord(type, level + 1, slot)));
}

/** The share of kills a scroll, a wand or a spell paper turns up on. */
function findsWriting(game: MwGame): boolean {
  return game.rng.random(350 - game.pc.floor) <= 15;
}

/**
 * The scroll find (WORLD.EXE 3000:cb7a, mw.c "FUN_3000_cb7a"): one casting of a spell, on paper.
 *
 * The level comes from a third of the floor rather than two thirds, so scrolls run behind
 * spellbooks. The class gates are the spellbook's, without the sage's extra rejections.
 */
export function scrollFind(game: MwGame): void {
  const pc = game.pc;
  const rng = game.rng;
  if (pc.cls === FIGHTER || pc.cls === MONK) return;
  if (!findsWriting(game)) return;
  const level = foundSpellLevel(game, Math.trunc(pc.floor / 3));
  const type = rng.random(4);
  if (refusesList(pc.cls, type)) return;
  goodNews(game);
  const slot = rng.random(3);
  // DS:60cb, the two lines of FUN_3000_c8e6, DS:609d 60e4
  game.say(
    'YOU HAVE FOUND A SCROLL.',
    ...spellDescription(level, type),
    'HIT ANY KEY FOR A DESCRIPTION',
    '  OF THE SCROLL.',
  );
  pc.scrolls[spellIndex(type, level, slot)] += 1;
  describeTheSpell(game, type, level, slot);
  game.events.push({ kind: 'found', find: { what: 'scroll', spell: { type, level, slot } } });
}

/**
 * The wand find (WORLD.EXE 3000:cd34, mw.c "FUN_3000_cd34"): two to six castings of a spell.
 *
 * The level is drawn from a sixtieth of the floor, so anything above the first level of a list
 * wants floor 120 and below. The list is 1 to 3, never the permanent one, and no class turns any
 * of them down — a worshipper can find a wizard's wand where they could not find the spellbook.
 */
export function wandFind(game: MwGame): void {
  const pc = game.pc;
  const rng = game.rng;
  if (pc.cls === FIGHTER || pc.cls === MONK) return;
  if (!findsWriting(game)) return;
  goodNews(game);
  const level = foundSpellLevel(game, Math.trunc(pc.floor / 60));
  const type = rng.random(3) + 1;
  const slot = rng.random(3);
  const charges = rng.random(5) + 2;
  // DS:60f5 with the charges between it and DS:610c, the two lines of FUN_3000_c8e6, DS:609d 6116
  game.say(
    `YOU FOUND A WAND WITH ${charges} CHARGES.`,
    ...spellDescription(level, type),
    'HIT ANY KEY FOR A DESCRIPTION',
    '  OF THE WAND.',
  );
  pc.wands[spellIndex(type, level, slot)] += charges;
  describeTheSpell(game, type, level, slot);
  game.events.push({ kind: 'found', find: { what: 'wand', spell: { type, level, slot }, charges } });
}

/**
 * The spell paper find (WORLD.EXE 3000:cf3a, mw.c "FUN_3000_cf3a"): the same as a scroll, from
 * an eighth of the floor, and the only one of the four a fighter can find.
 *
 * Nothing checks the class against the list here either, so any character can turn up any paper.
 */
export function paperFind(game: MwGame): void {
  const pc = game.pc;
  const rng = game.rng;
  if (pc.cls === MONK) return;
  if (!findsWriting(game)) return;
  goodNews(game);
  const level = foundSpellLevel(game, Math.trunc(pc.floor / 8));
  const type = rng.random(4);
  const slot = rng.random(3);
  // DS:6125, the two lines of FUN_3000_c8e6, DS:609d 613d
  game.say(
    'YOU FIND A SPELL PAPER.',
    ...spellDescription(level, type),
    'HIT ANY KEY FOR A DESCRIPTION',
    '  OF THE SPELL ON THE PAPER.',
  );
  pc.paper[spellIndex(type, level, slot)] += 1;
  describeTheSpell(game, type, level, slot);
  game.events.push({ kind: 'found', find: { what: 'paper', spell: { type, level, slot } } });
}

/**
 * The special find (WORLD.EXE 3000:d0b9, mw.c "FUN_3000_d0b9"): one of twelve items, drawn flat.
 *
 * Six of the twelve are a permanent point of a characteristic, which is why the deep floors are
 * worth grinding. A second floor slosher is refused, because one is limitless.
 *
 * monster_killed only reaches this on a coin flip after two rolls the floor has to beat, so a
 * shallow floor almost never gets here and the message it prints instead is "NOTHING!".
 */
/**
 * The twelve the special find draws between, in the order it rolls them, by the name the box
 * that hands each of them over calls it.
 */
const SPECIAL_FINDS = [
  MW_HOLY_HAND_GRENADE,
  MW_TELEPORT_STONE,
  MW_SEEING_STONE,
  MW_FLOOR_SLOSHER,
  MW_HEALING_POTION,
  'RING OF REGENERATION',
  'BOOK OF STRENGTH',
  'BOOK OF INTELLIGENCE',
  'BOOK OF WISDOM',
  'BOOK OF CONSTITUTION',
  'BOOK OF DEXTERITY',
  'BOOK OF LUCK',
];

/** Which of the twelve is drunk rather than kept. */
const HEALING_POTION = 4;

export function specialFind(game: MwGame): void {
  const pc = game.pc;
  if (pc.cls === MONK) return;
  const which = game.rng.random(12);
  // A second floor slosher is turned down, which is the one roll of the twelve that hands over
  // nothing at all.
  let handedOver = true;
  switch (which) {
    case 0:
      pc.grenades += 1;
      // DS:615a, 616f 618a 61a5, 61c1 61dc 61f6, 6214
      game.say(
        'A HOLY HAND GRENADE!',
        'HOLY HAND GRENADES ARE THE',
        '  THE MOST POWERFUL ATTACK',
        "  DEVICE IN MORAFF'S WORLD!",
        "USE IT BY HITTING 'I' THEN",
        "  SELECT `OTHER'. IT WILL",
        '  INSTANTLY KILL THE MONSTER.',
        'PERIOD.      HIT ANY KEY...',
      );
      break;
    case 1:
      pc.teleportStones += 1;
      // DS:6230 624a 6265 627e 6298 62b0, DS:4a75
      game.say(
        'A STONE OF TELEPORTATION!',
        '  THIS STONE WILL PROBABLY',
        '  SAVE YOUR LIFE! USE IT',
        '  WHEN YOU ARE ABSOLUTELY',
        '  DESPERATE AND IT WILL',
        '  RAISE YOU TO LEVEL ZERO.',
        '',
        'HIT ANY KEY...',
      );
      break;
    case 2:
      pc.seeingStones += 1;
      // DS:62cb, 62de 62f6, 6312 632d, DS:4a75
      game.say(
        'A STONE OF SEEING.',
        '',
        'USE THIS ITEM TO MAP AN',
        '  ENTIRE LEVEL OF A DUNGEON',
        'THIS ITEM IS ONLY GOOD FOR',
        '  ONE USE.',
        '',
        'HIT ANY KEY...',
      );
      break;
    case 3:
      if (pc.floorSloshers < 1) {
        pc.floorSloshers += 1;
        // DS:638e, 63a8 63c5 63e0 63fd 6418, DS:4a75
        game.say(
          'THE FAMOUS FLOOR SLOSHER!',
          '',
          'EACH TIME YOU USE THIS ITEM,',
          '  THE FLOOR TURNS TO MUSH,',
          '  AND YOU SLIP DOWN AT LEAST',
          '  ONE LEVEL. THIS ITEM MAY',
          '  USED LIMITLESSLY.',
          'HIT ANY KEY...',
        );
      } else {
        handedOver = false;
        // DS:6338 6352 636d, DS:6387, DS:4a75
        game.say(
          'OH WELL! YOU ALREADY HAVE',
          '  A FLOOR SLOSHER, AND TWO',
          '  ARE NO BETTER THAN ONE.',
          '',
          'SORRY!',
          '',
          'HIT ANY KEY...',
        );
      }
      break;
    case 4:
      pc.healingPotions += 1;
      // DS:642c 6441 645d 6479 6496 64b3, DS:4a75
      game.say(
        'A POTION OF HEALING!',
        '  THIS POTION WILL HEAL ALL',
        '  OF YOUR WOUNDS INSTANTLY.',
        'YOU MAY DRINK THIS POTION SO',
        '  QUICKLY THAT MONSTERS WILL',
        '  NOT GET ANY EXTRA STRIKES.',
        '',
        'HIT ANY KEY...',
      );
      break;
    case 5:
      pc.regenRings += 1;
      // DS:64d0 64e8 6502 651a 6535 654d 6568, DS:4a75
      game.say(
        'A RING OF REGENERATION!',
        '  AS TIME PASSES YOU WILL',
        '  REGENERATE ONE HEALTH',
        '  POINT PER RING OF REGEN.',
        'THIS IS ONE OF THE MOST',
        '  SOUGHT AFTER MAGIC ITEMS',
        "  IN MORAFF'S WORLD.",
        'HIT ANY KEY...',
      );
      break;
    case 6:
      pc.str += 1;
      game.say(...bookOf('A BOOK OF STRENGTH!', '  YOUR STRENGTH BY ONE', '  POINT.'));
      break;
    case 7:
      pc.iq += 1;
      game.say(...bookOf('A BOOK OF INTELLIGENCE!', '  YOUR INTELLIGENCE BY ONE', '  POINT.'));
      break;
    case 8:
      pc.wis += 1;
      game.say(...bookOf('A BOOK OF WISDOM!', '  YOUR WISDOM BY ONE', '  POINT.'));
      break;
    case 9:
      pc.con += 1;
      game.say(...bookOf('A BOOK OF CONSTITUTION!', '  YOUR CONSTITUTION BY ONE', '  POINT.'));
      break;
    case 10:
      pc.dex += 1;
      game.say(...bookOf('A BOOK OF DEXTERITY!', '  YOUR DEXTERITY BY ONE', '  POINT.'));
      break;
    case 11:
      pc.luck += 1;
      // The luck book says the whole thing on one line and leaves the sixth slot empty, which
      // pushes "HIT ANY KEY..." up a line from where every other book puts it.
      game.say('A BOOK OF LUCK!', '', 'PRESS ANY KEY TO READ', '  THE BOOK AND INCREASE', '  YOUR LUCK BY ONE POINT.', '', 'HIT ANY KEY...');
      break;
  }
  if (!handedOver) return;
  const what = which === HEALING_POTION ? 'potion' : 'item';
  game.events.push({ kind: 'found', find: { what, item: SPECIAL_FINDS[which] } });
}

/** The five stat books that share their wording (WORLD.EXE 3000:d0b9, cases 6 to 10). */
function bookOf(title: string, gain: string, point: string): string[] {
  // The title, then DS:6591 65a7, the gain, the point, then DS:4a75
  return [title, '', 'PRESS ANY KEY TO READ', '  THE BOOK AND INCREASE', gain, point, '', 'HIT ANY KEY...'];
}
