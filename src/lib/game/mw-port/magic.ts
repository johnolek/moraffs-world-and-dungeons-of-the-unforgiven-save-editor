import data from '../mw-data.json';
import type { CastSource } from '../action';
import {
  MW_BOOK_SLOTS_PER_CATEGORY,
  MW_PRIESTLY_CLASSES,
  MW_SPELL_NAMES,
  MW_WIZARD_CLASSES,
  mwSpellRecord,
} from './spells';
import type { MwGame } from './state';
import {
  MW_SQUARE_EMPTY,
  MW_SQUARE_PLAYER,
  mwMonsterSeen,
  mwOccupantAt,
  mwSetOccupant,
} from './state';

// The message text is the exact bytes of the game's own strings, read out of the data segment of
// the unpacked WORLD.EXE. The comment on each say call gives the address of every line it prints,
// in order; dotu-tools/reference/scripts/exe_strings.py --ds 2bb9 reads them back.

/**
 * The weight column of the twelve weapon rows (exe DS:01c6, one every 7 bytes). `mw-data.json`
 * calls it `worth` because that is what the column looked like from the store; recomputeWeight
 * is the only thing in the game that reads it, and it reads it as a weight.
 */
const WEAPON_WEIGHTS = data.weapons.map((weapon) => weapon.worth);

/** The weight column of the seven armour rows (exe DS:0218, one every 5 bytes). */
const ARMOUR_WEIGHTS = data.armour.map((armour) => armour.worth);

/** How many moves a battle spell runs for, and how many more a second cast adds. */
const SPELL_MOVES = 60;

/**
 * The monster table (exe DS:0237, 112 rows of 35 bytes), as the bytes of each row. Every byte a
 * spell reads out of a row it reads as a signed char, which is what the Int8Array is for: the
 * two bytes autokill adds together run past 127 on several monsters.
 */
const MONSTER_ROWS = data.monsters.map((monster) => {
  const bytes = new Int8Array(monster.raw.length / 2);
  for (let at = 0; at < bytes.length; at++) {
    bytes[at] = parseInt(monster.raw.slice(at * 2, at * 2 + 2), 16);
  }
  return bytes;
});

/** Row offset 0x10, the kind, which spell_proof compares against 100. */
const MONSTER_KIND = 0x10;

/** Row offset 0x11, the hit points per floor of depth, which Drain Monster halves. */
const MONSTER_HP_PER_FLOOR = 0x11;

/**
 * Row offsets 0x13 and 0x14, which autokill adds together and rolls against the character's
 * mind. Nothing else in the game reads either byte, so neither has a name in `mw-data.json`.
 */
const MONSTER_MIND = [0x13, 0x14];

/** The kind byte of the ten monsters that refuse every battle spell. */
const SPELL_PROOF_KIND = 100;

/** What the two permanent markers hold, where the preparation spells of the same name hold 1. */
const PERMANENT_MARK = 100;

/** Fifteen years in minutes, which is the youngest Youth will make a character. */
const YOUNGEST_MINUTES = 0x3d80;

/** What autokill writes over the hit points of a monster whose brain it explodes. */
const AUTOKILL_HP = -100;

/** One signed byte, which is how the record stores the two map-cursor fields. */
function signedByte(value: number): number {
  return (value << 24) >> 24;
}

/** say_no_monster (WORLD.EXE 2000:c28a, mw.c "say_no_monster"). */
export function sayNoMonster(game: MwGame): void {
  // DS:354f 3565 1476 20bd
  game.say('YOU ARE NOT CURRENTLY', '   ENGAGING ANY MONSTER.', '', 'HIT ANY KEY...');
}

/** say_redundant (WORLD.EXE 2000:c2b6, mw.c "say_redundant"). */
export function sayRedundant(game: MwGame): void {
  // DS:357e 3597 1476 20bd
  game.say('CASTING THIS SPELL WOULD', '   BE REDUNDANT.', '', 'HIT ANY KEY...');
}

/** say_already_cast (WORLD.EXE 2000:c2e2, mw.c "say_already_cast"). */
export function sayAlreadyCast(game: MwGame): void {
  // DS:35a8 35be 1476 20bd
  game.say('YOU HAVE ALREADY CAST', '   THIS SPELL!', '', 'HIT ANY KEY...');
}

/** say_feel_good (WORLD.EXE 2000:c97a, mw.c "say_feel_good"): what a small cure prints. */
export function sayFeelGood(game: MwGame): void {
  // DS:375e
  game.say('YOU FEEL GOOD - HIT ANY KEY');
}

/**
 * say_feel_very_good (WORLD.EXE 2000:c9a6, mw.c "say_feel_very_good"): what a big cure or a stat
 * boost prints.
 */
export function sayFeelVeryGood(game: MwGame): void {
  // DS:377a 1476 20bd
  game.say('YOU FEEL VERY GOOD!', '', 'HIT ANY KEY...');
}

/**
 * say_sixty_more_moves (WORLD.EXE 2000:cedc, mw.c "say_sixty_more_moves"): what re-casting a
 * Power Weapon or a Protection at the level already up prints.
 */
export function saySixtyMoreMoves(game: MwGame): void {
  // DS:399e 39b8 39d5 1476 20bd
  game.say(
    'YOU HAD ALREADY CAST THIS',
    '  SPELL, SO NOW IT WILL LAST',
    '  60 MOVES LONGER.',
    '',
    'HIT ANY KEY...',
  );
}

/**
 * recompute_weight (WORLD.EXE 2000:2d8e, mw.c "recompute_weight"): work out what the character is
 * carrying — their own body unless a Feather is up, then the metal stones at a pound per sixteen,
 * then the armour and the weapons they own.
 *
 * The armour loop stops at seven of the eight slots, so whatever is in the eighth is weightless;
 * the sixth stone pile is left out of the sum the same way.
 */
export function recomputeWeight(game: MwGame): void {
  const pc = game.pc;
  let body = pc.weight;
  if (pc.feather !== 0) body = 0;
  let carried = 0;
  for (let pile = 0; pile < 5; pile++) carried += Math.trunc(pc.stones[pile] / 16);
  pc.loadedWeight = carried + body;
  for (let slot = 0; slot < 7; slot++) pc.loadedWeight += pc.armorOwned[slot] * ARMOUR_WEIGHTS[slot];
  for (let slot = 0; slot < 8; slot++) pc.loadedWeight += pc.weaponsOwned[slot] * WEAPON_WEIGHTS[slot];
}

/**
 * enchant_weapon (WORLD.EXE 2000:c30e, mw.c "enchant_weapon"): the permanent Enchant Weapon,
 * which puts `plus` on one of the eight weapons the character owns.
 *
 * It sets the plus rather than adding to it, so casting Enchant Weapon Level 1 on a plus 4 sword
 * takes the sword down to plus 1. The menu lists all eight slots, naming the ones the character
 * owns with their plus and drawing the rest as eight dashes; picking a slot they own nothing in
 * does nothing at all and the spell costs nothing.
 */
export function enchantWeapon(game: MwGame, plus: number): boolean {
  const choice = game.chooseWeaponSlot();
  // Escape makes the menu hand back -1, which the original subtracts one from and uses as an
  // index, so it reads the unlabelled record byte at 0x7f rather than a weapon and would write
  // the plus at 0x8c. That byte is zero in a rolled character, so escaping cancels by accident.
  if (choice < 1) return false;
  const slot = choice - 1;
  if (game.pc.weaponsOwned[slot] < 1) return false;
  game.pc.weaponPlus[slot] = plus;
  return true;
}

/**
 * enchant_armour (WORLD.EXE 2000:c3d5, mw.c "enchant_armour"): the same menu over the eight suits
 * of armour, setting the plus of the one picked to exactly `plus`. Escaping reads the unlabelled
 * record byte at 0xae the way {@link enchantWeapon} reads 0x7f.
 */
export function enchantArmour(game: MwGame, plus: number): boolean {
  const choice = game.chooseArmorSlot();
  if (choice < 1) return false;
  const slot = choice - 1;
  if (game.pc.armorOwned[slot] < 1) return false;
  game.pc.armorPlus[slot] = plus;
  return true;
}

/**
 * raise_prep_armour (WORLD.EXE 2000:c49c, mw.c "raise_prep_armour"): the preparation Enchant
 * Armor, which comes off a monster's attack roll until the next night at an inn. It refuses a
 * level no better than the one already up, and the refusal costs nothing.
 */
export function raisePrepArmour(game: MwGame, level: number): number {
  if (level <= game.pc.enchantArmorLevel) {
    sayRedundant(game);
    return 0;
  }
  game.pc.enchantArmorLevel = level;
  return level;
}

/**
 * raise_prep_weapon (WORLD.EXE 2000:c4be, mw.c "raise_prep_weapon"): the preparation Enchant
 * Weapon, which is added to the character's own attack roll until the next night at an inn.
 */
export function raisePrepWeapon(game: MwGame, level: number): number {
  if (level <= game.pc.enchantWeaponLevel) {
    sayRedundant(game);
    return 0;
  }
  game.pc.enchantWeaponLevel = level;
  return level;
}

/**
 * raise_body_armour (WORLD.EXE 2000:c4e0, mw.c "raise_body_armour"): the permanent Body Armor,
 * which also comes off a monster's attack roll.
 */
export function raiseBodyArmour(game: MwGame, level: number): number {
  if (level <= game.pc.bodyArmorLevel) {
    sayRedundant(game);
    return 0;
  }
  game.pc.bodyArmorLevel = level;
  return level;
}

/**
 * raise_ring_protection (WORLD.EXE 2000:c502, mw.c "raise_ring_protection"): the permanent
 * Enchant Ring, whose plus comes off a monster's attack roll.
 */
export function raiseRingProtection(game: MwGame, level: number): number {
  if (level <= game.pc.ringOfProtection) {
    sayRedundant(game);
    return 0;
  }
  game.pc.ringOfProtection = level;
  return level;
}

/**
 * raise_ring_antimagic (WORLD.EXE 2000:c524, mw.c "raise_ring_antimagic"): the permanent
 * Anti-Magic Ring. Nothing in the game reads that byte back except the inventory screen, so the
 * ring does nothing at all and the spell points are simply gone.
 */
export function raiseRingAntimagic(game: MwGame, level: number): number {
  if (level <= game.pc.antiMagicRing) {
    sayRedundant(game);
    return 0;
  }
  game.pc.antiMagicRing = level;
  return level;
}

/**
 * boost_strength (WORLD.EXE 2000:cb43, mw.c "boost_strength"): the battle Strength, worth +7 for
 * 60 moves. {@link tickSpellTimers} takes the 7 back off when the timer runs out. Casting it
 * while it is running is refused and costs nothing.
 */
export function boostStrength(game: MwGame): boolean {
  if (game.pc.strengthTimer === 0) {
    game.pc.strengthTimer = SPELL_MOVES;
    game.pc.str += 7;
    sayFeelVeryGood(game);
    return true;
  }
  sayAlreadyCast(game);
  return false;
}

/** boost_agility (WORLD.EXE 2000:cb6d, mw.c "boost_agility"): the battle Speed, +7 for 60 moves. */
export function boostAgility(game: MwGame): boolean {
  if (game.pc.speedTimer === 0) {
    game.pc.speedTimer = SPELL_MOVES;
    game.pc.dex += 7;
    sayFeelVeryGood(game);
    return true;
  }
  sayAlreadyCast(game);
  return false;
}

/**
 * boost_strength_and_agility (WORLD.EXE 2000:cb97, mw.c "boost_strength_and_agility"): the
 * priestly Strength And Speed, which puts 60 moves on both timers.
 *
 * It is refused only when both are already running, and it adds the +7 to a characteristic only
 * where that timer was not running — so it is the cheap way to top either one up on its own.
 */
export function boostStrengthAndAgility(game: MwGame): boolean {
  const pc = game.pc;
  if (pc.speedTimer !== 0 && pc.strengthTimer !== 0) {
    sayAlreadyCast(game);
    return false;
  }
  pc.speedTimer += SPELL_MOVES;
  pc.strengthTimer += SPELL_MOVES;
  if (pc.speedTimer === SPELL_MOVES) pc.dex += 7;
  if (pc.strengthTimer === SPELL_MOVES) pc.str += 7;
  sayFeelVeryGood(game);
  return true;
}

/**
 * raise_power_weapon (WORLD.EXE 2000:cf08, mw.c "raise_power_weapon"): the three Power Weapon
 * spells, which swap the damage die of whatever is in hand for the die of a row further down the
 * weapon table for 60 moves. The same level again adds 60 more moves; a weaker one is refused.
 */
export function raisePowerWeapon(game: MwGame, level: number): boolean {
  const pc = game.pc;
  if (level < pc.powerWeaponLevel) {
    sayRedundant(game);
    return false;
  }
  if (pc.powerWeaponLevel === level) {
    pc.powerWeaponTimer += SPELL_MOVES;
    saySixtyMoreMoves(game);
  } else {
    pc.powerWeaponLevel = level;
    pc.powerWeaponTimer = SPELL_MOVES;
    // DS:39e8 39fe 3a1a 3a35 3a4f 1476 28ff
    game.say(
      'YOUR WEAPON BEGINS TO',
      '   SHIMMER WITH POWER. THIS',
      '   WEAPON IS AUTOMATICALLY',
      '   IN USE UNTIL THE SPELL',
      '   ENDS.',
      '',
      'HIT ANY KEY',
    );
  }
  return true;
}

/**
 * raise_protection (WORLD.EXE 2000:cf6c, mw.c "raise_protection"): the four Protection spells,
 * which take 2 × level² off a monster's attack roll for 60 moves. The same level again adds 60
 * more moves; a weaker one is refused.
 */
export function raiseProtection(game: MwGame, level: number): boolean {
  const pc = game.pc;
  if (level < pc.protectionLevel) {
    sayRedundant(game);
    return false;
  }
  if (pc.protectionLevel === level) {
    pc.protectionTimer += SPELL_MOVES;
    saySixtyMoreMoves(game);
  } else {
    pc.protectionLevel = level;
    pc.protectionTimer = SPELL_MOVES;
    // DS:3a58 3a74 3a8f 3aa9 3ac3 1476 28ff
    game.say(
      'YOUR BODY BEGINS TO SHIMMER',
      '   WITH SHIFTING COLORS OF',
      '   LIGHT. THIS PROTECTION',
      '   WILL LAST FOR 60 MOVES',
      '   OR STEPS.',
      '',
      'HIT ANY KEY',
    );
  }
  return true;
}

/**
 * resist_poison (WORLD.EXE 2000:cfd0, mw.c "resist_poison"): 60 more moves of half damage from a
 * poison attack, no chance at all of catching a new poison, and the poison already carried
 * stopping its count down. It never refuses, so it always costs.
 */
export function resistPoison(game: MwGame): boolean {
  game.pc.resistPoisonTimer += SPELL_MOVES;
  // DS:3ad0 3aea 3b01 1476 28ff
  game.say(
    'YOU FEEL A WARMTH IN YOUR',
    '   BLOOD AS THE RESIST',
    '   POISON TAKES EFFECT.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/** resist_disease (WORLD.EXE 2000:d006, mw.c "resist_disease"): the same 60 moves for disease. */
export function resistDisease(game: MwGame): boolean {
  game.pc.resistDiseaseTimer += SPELL_MOVES;
  // DS:3b19 3b35 3b4b 1476 28ff
  game.say(
    'YOU FEEL A TINGLING IN YOUR',
    '   BODY AS THE RESIST',
    '   DISEASE TAKES EFFECT.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/**
 * anti_cold (WORLD.EXE 2000:d03c, mw.c "anti_cold"): 60 more moves of half damage from a cold
 * attack, which is all it does — it does not prevent one.
 */
export function antiCold(game: MwGame): boolean {
  game.pc.antiColdTimer += SPELL_MOVES;
  // DS:3b64 3b7f 3b95 3bab 1476 28ff
  game.say(
    'YOU FEEL A WARM FEELING AS',
    '   YOUR BODY PREPARES',
    '   FOR AN ICE ATTACK.',
    '   SPELL WILL LAST 60 MOVES.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/** anti_fire (WORLD.EXE 2000:d072, mw.c "anti_fire"): the same 60 moves for a fire attack. */
export function antiFire(game: MwGame): boolean {
  game.pc.antiFireTimer += SPELL_MOVES;
  // DS:3bc8 3b7f 3be3 3bab 1476 28ff
  game.say(
    'YOU FEEL A COOL FEELING AS',
    '   YOUR BODY PREPARES',
    '   FOR A FIRE ATTACK.',
    '   SPELL WILL LAST 60 MOVES.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/**
 * resist_drain (WORLD.EXE 2000:d0a8, mw.c "resist_drain"): 60 more moves in which a level drain
 * is blocked outright.
 */
export function resistDrain(game: MwGame): boolean {
  game.pc.resistDrainTimer += SPELL_MOVES;
  // DS:3bf9 3c0d 3c27 3c43 1476 28ff
  game.say(
    'YOU FEEL A HEAVENLY',
    '   PRESENCE AS THE FORCES',
    '   OF GOOD GATHER TO DEFEND',
    '   YOU AGAINST LEVEL DRAIN.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/**
 * explosion (WORLD.EXE 2000:c9d2, mw.c "explosion"): the three explosion spells, `size` 0 for
 * Minor, 1 for Explosion and 2 for Major, doing 75 to 175, 125 to 225 and 200 to 500.
 *
 * The original reuses its own argument as the damage, testing it against 0, 1 and 2 in three
 * separate ifs after the roll has already overwritten it. Every roll lands well above 2, so no
 * spell is rolled twice, and this port keeps the cascade as it stands.
 */
/**
 * The hit points a battle spell takes off the monster being fought, taken off where the spell's
 * own message names them so that a run journal has the number the player was shown.
 */
function damageTheMonster(game: MwGame, damage: number): void {
  game.monsters[game.engaged].hp -= damage;
  game.events.push({ kind: 'spellDamaged', monster: mwMonsterSeen(game, game.engaged), damage });
}

export function explosion(game: MwGame, size: number): boolean {
  if (game.engaged === -1) {
    sayNoMonster(game);
    return false;
  }
  let headline = '';
  // DS:378e 37a7 37c0
  if (size === 0) headline = 'A SMALL EXPLOSION OCCURS';
  if (size === 1) headline = 'A LARGE EXPLOSION OCCURS';
  if (size === 2) headline = 'A HUGE EXPLOSION OCCURS';
  // The engaged check stands here a second time, unchanged.
  if (game.engaged === -1) {
    sayNoMonster(game);
    return false;
  }
  let damage = size;
  if (damage === 0) damage = game.rng.random(101) + 75;
  if (damage === 1) damage = game.rng.random(101) + 125;
  if (damage === 2) damage = game.rng.random(301) + 200;
  damageTheMonster(game, damage);
  // DS:37ef 3809 37d8 381f 1476 28ff
  game.say(
    headline,
    '   ON THE GROUND DIRECTLY',
    '   BELOW THE MONSTER.',
    `   THE EXPLOSION DOES ${damage}`,
    '   POINTS OF DAMAGE.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/**
 * sleep_monster (WORLD.EXE 2000:caba, mw.c "sleep_monster"): Sleep, which puts the engaged
 * monster out for ten of its own turns when `random(its depth)` comes out 0 — so the chance is
 * one in its depth. Anything else prints "THE SPELL FAILS." and the spell still costs.
 *
 * The redundancy test asks whether the sleep timer is exactly 1, which is only true on the last
 * turn of a sleep already running, so re-casting it at any other point rolls again.
 */
export function sleepMonster(game: MwGame): boolean {
  if (game.engaged === -1) {
    sayNoMonster(game);
    return false;
  }
  if (game.pc.sleepTimer === 1) {
    sayRedundant(game);
    return false;
  }
  if (game.rng.random(game.monsters[game.engaged].depth) === 0) {
    game.pc.sleepTimer = 10;
    // DS:3834
    game.monsterStatusLine = 'MONSTER IS SLEEPING';
  } else {
    // DS:3848 1476 28ff
    game.say('THE SPELL FAILS.', '', 'HIT ANY KEY');
  }
  return true;
}

/**
 * spell_proof (WORLD.EXE 2000:cc66, mw.c "spell_proof"): whether the engaged monster is one of
 * the ten whose kind byte is 100 — ZEUS, the DEVIL and the eight quest bosses — which no battle
 * spell that singles a monster out will touch.
 *
 * The two Hold Monster cases ask this before they check that a monster is engaged at all, and
 * the original then reads the six bytes in front of the monster list. There is nothing in front
 * of the list here, so the port answers no and the Hold goes on to its own engaged check.
 */
export function spellProof(game: MwGame): boolean {
  if (game.engaged === -1) return false;
  const kind = MONSTER_ROWS[game.monsters[game.engaged].type][MONSTER_KIND];
  if (kind === SPELL_PROOF_KIND) {
    // DS:3859 3876 3892 38ac 38c7 38e2 38fb 28ff
    game.say(
      '  WHEN YOU BEGIN TO CAST THE',
      'SPELL THE MONSTER STOPS YOU',
      "AND SAYS, 'NO. THAT SILLY",
      "SPELL DOESTN'T WORK ON ME.",
      'TRY SOMETHING ELSE WHILE I',
      'TEAR YOUR LIMBS FROM ONE',
      'ANOTHER. HEE HEE HEE.',
      'HIT ANY KEY',
    );
    return true;
  }
  return false;
}

/**
 * autokill (WORLD.EXE 2000:cdc5, mw.c "autokill"): the brain explosion. The monster rolls
 * `random(random(the two unnamed bytes of its table row added) + its depth)`, the character rolls
 * `random(level + random(intelligence + wisdom)) + random(the floor)`, and the bigger roll wins.
 * A win writes −100 over the monster's hit points; a loss prints and still costs the points.
 */
export function autokill(game: MwGame): boolean {
  if (game.engaged === -1) {
    sayNoMonster(game);
    return false;
  }
  if (spellProof(game)) return false;
  const monster = game.monsters[game.engaged];
  const row = MONSTER_ROWS[monster.type];
  let theirs = game.rng.random(row[MONSTER_MIND[0]] + row[MONSTER_MIND[1]]);
  theirs = game.rng.random(monster.depth + theirs);
  let mine = game.rng.random(game.pc.iq + game.pc.wis);
  mine = game.rng.random(game.pc.lev + mine);
  const luck = game.rng.random(game.pc.floor);
  if (theirs < mine + luck) {
    monster.hp = AUTOKILL_HP;
    // DS:3911 392e 394a 3966 1476 28ff
    game.say(
      "THE MONSTER'S BRAIN EXPLODES",
      '   FROM ULTRA-INTENSE BRAIN',
      '   WAVES WHICH EMINATE FROM',
      '   YOUR MIND.',
      '',
      'HIT ANY KEY',
    );
    return true;
  }
  // DS:3974 3992 1476 20bd
  game.say('THE SPELL FAILS... TOUGH LUCK', '   CHARLIE.', '', 'HIT ANY KEY...');
  return true;
}

/**
 * drain_monster (WORLD.EXE 2000:d0de, mw.c "drain_monster"): Drain Monster, which takes the
 * character's wisdom off the engaged monster's depth. A monster shallower than that wisdom has
 * both its depth and its hit points set to zero, so the spell simply kills it; a deeper one also
 * loses half its hit points per floor, times the wisdom, in health.
 *
 * It prints nothing at all: the only sign it worked is the monster's own line changing.
 */
export function drainMonster(game: MwGame): boolean {
  if (game.engaged === -1) {
    sayNoMonster(game);
    return false;
  }
  if (spellProof(game)) return false;
  const monster = game.monsters[game.engaged];
  if (monster.depth < game.pc.wis) {
    monster.depth = 0;
    monster.hp = 0;
  } else {
    // The depth is one byte of the monster's record.
    monster.depth = (monster.depth - game.pc.wis) & 0xff;
    const perFloor = MONSTER_ROWS[monster.type][MONSTER_HP_PER_FLOOR];
    monster.hp -= Math.trunc(perFloor / 2) * game.pc.wis;
  }
  return true;
}

/**
 * teleport_player (WORLD.EXE 2000:cbdf, mw.c "teleport_player"): Relocate, which rolls a square
 * of the whole floor over and over until it finds one that is neither rock nor already holding a
 * monster, and stands the character on it. It never fails, so it always costs.
 */
export function teleportPlayer(game: MwGame): boolean {
  const pc = game.pc;
  mwSetOccupant(game, pc.x, pc.y, MW_SQUARE_EMPTY);
  do {
    do {
      pc.x = game.rng.random(game.columns);
      pc.y = game.rng.random(game.rows);
    } while (game.isSolid(pc.x, pc.y, pc.floor, pc.dungeon));
  } while (mwOccupantAt(game, pc.x, pc.y) !== -1);
  mwSetOccupant(game, pc.x, pc.y, MW_SQUARE_PLAYER);
  game.recenterMap = true;
  game.redrawView = true;
  return true;
}

/**
 * teleport_monster (WORLD.EXE 2000:cccc, mw.c "teleport_monster"): Go Away, which throws the
 * engaged monster somewhere else on the floor. There is no roll: every monster but the kind-100
 * one goes.
 *
 * The square it lands on is never checked. The rock test in the loop is handed the character's
 * own x and y rather than the monster's new ones, so it asks whether the character is standing
 * in rock, which they never are — the loop runs once and the monster can land inside a wall.
 */
export function teleportMonster(game: MwGame): boolean {
  if (game.engaged === -1) {
    sayNoMonster(game);
    return false;
  }
  if (spellProof(game)) return false;
  const monster = game.monsters[game.engaged];
  mwSetOccupant(game, monster.x, monster.y, MW_SQUARE_EMPTY);
  do {
    monster.x = game.rng.random(game.columns);
    monster.y = game.rng.random(game.rows);
  } while (game.isSolid(game.pc.x, game.pc.y, game.pc.floor, game.pc.dungeon));
  mwSetOccupant(game, monster.x, monster.y, game.engaged);
  return true;
}

/**
 * teleport_direction (WORLD.EXE 2000:d195, mw.c "teleport_direction"): Pass Wall, which walks
 * out from the character in the direction picked and stops on the first square 2 to 19 away that
 * is inside the map, is not rock and has nobody on it, whatever walls lie between. Finding none,
 * it does nothing and costs nothing.
 *
 * `choice` is the number the player picks off the direction menu: 1 north, 2 south, 3 east, 4
 * west, 5 cancel. The original prints that menu and reads the key itself; the port is handed the
 * number instead and prints nothing.
 */
export function teleportDirection(game: MwGame, choice: number): boolean {
  if (choice <= 0 || choice >= 5) return false;
  const pc = game.pc;
  let dx = 0;
  let dy = 0;
  if (choice === 1) dy = -1;
  if (choice === 2) dy = 1;
  if (choice === 3) dx = 1;
  if (choice === 4) dx = -1;
  for (let distance = 2; distance < 20; distance++) {
    const x = pc.x + dx * distance;
    const y = pc.y + dy * distance;
    if (x < 0 || x >= game.columns || y < 0 || y >= game.rows) continue;
    if (game.isSolid(x, y, pc.floor, pc.dungeon)) continue;
    if (mwOccupantAt(game, x, y) !== -1) continue;
    // The map cursor is one signed byte of the record, so a long enough walk wraps it and the
    // view is re-centred for that reason rather than for having left the view.
    pc.mapCursorX = signedByte(pc.mapCursorX + dx * distance);
    pc.mapCursorY = signedByte(pc.mapCursorY + dy * distance);
    if (
      pc.mapCursorX < 1 ||
      pc.mapCursorY < 1 ||
      pc.mapCursorX > game.mapViewColumns - 2 ||
      pc.mapCursorY > game.mapViewRows - 2
    ) {
      game.recenterMap = true;
    }
    mwSetOccupant(game, pc.x, pc.y, MW_SQUARE_EMPTY);
    pc.x = x;
    pc.y = y;
    mwSetOccupant(game, x, y, MW_SQUARE_PLAYER);
    // The redraw of the whole view (exe 2000:8b3f) stands here, and nothing of the screen it
    // draws is ported.
    return true;
  }
  return false;
}

/**
 * cast_spell (WORLD.EXE 2000:c546, mw.c "cast_spell"): the Write Scroll and Enchant Wand spells,
 * `kind` 1 for a scroll and 2 for five charges on a wand. The name in the decompilation is wrong
 * — the function casts nothing, it walks three menus and adds to one of the two arrays.
 *
 * The first menu blanks out the categories the character's class cannot cast, but the key that
 * picks them still works, so any class can write any scroll. `maxLevel` is the deepest level the
 * level menu accepts, and nothing else looks at it.
 */
/** How many charges the Enchant Wand spells put on a wand, whatever their level. */
const WAND_CHARGES = 5;

export function writeScrollOrWand(game: MwGame, maxLevel: number, kind: number): boolean {
  const choice = game.chooseSpellToWrite(maxLevel);
  if (choice === null) return false;
  const index = choice.category * MW_BOOK_SLOTS_PER_CATEGORY + choice.level * 3 + choice.slot;
  const spell = { type: choice.category, level: choice.level, slot: choice.slot };
  if (kind === 1) {
    game.pc.scrolls[index] += 1;
    game.events.push({ kind: 'scrollWritten', spell });
    // DS:3700 3714 1476 28ff
    game.say('THE SCROLL HAS BEEN', '   SUCCESSFULLY WRITTEN!', '', 'HIT ANY KEY');
    return true;
  }
  if (kind === 2) {
    game.pc.wands[index] += WAND_CHARGES;
    game.events.push({ kind: 'wandMade', spell, charges: WAND_CHARGES });
    // DS:372d 3745 1476 28ff
    game.say('YOU NOW HOLD A GLOWING,', '   CHARGED WAND IN HAND!', '', 'HIT ANY KEY');
    return true;
  }
  // Nothing passes a kind other than 1 or 2. The original would put the three menus up again and
  // keep asking, for ever.
  return false;
}

/**
 * The roll the five floor-moving spells make once they have changed the floor (WORLD.EXE
 * 2000:d358, mw.c "spell_effect"): a square of the whole floor over and over until one is not
 * rock. Nothing asks whether a monster is standing there, and nothing writes the occupancy grid.
 */
function dropOnOpenSquare(game: MwGame): void {
  const pc = game.pc;
  do {
    pc.x = game.rng.random(game.columns);
    pc.y = game.rng.random(game.rows);
  } while (game.isSolid(pc.x, pc.y, pc.floor, pc.dungeon));
}

/** The refusal the two downward spells and the three upward ones share below floor 65. */
function sayNotBelowSixtyFour(game: MwGame): void {
  // DS:3cdc 3d02 3d19 1476 20bd
  game.say('THAT SPELL DOES NOT', "  WORK BELOW THE 64'TH", '  LEVEL.', '', 'HIT ANY KEY...');
}

/** The refusal the three upward spells share in the town. */
function sayNotAboveTheTown(game: MwGame): void {
  // DS:3d22 3d38 3d51 1476 20bd
  game.say(
    'THIS SPELL CAN NOT BE',
    '  USED TO MAKE YOU FLOAT',
    '  ABOVE THE TOWN.',
    '',
    'HIT ANY KEY...',
  );
}

/** enter_level (WORLD.EXE 2000:55fc): the floor around the character is built afresh. */
function enterLevel(game: MwGame): void {
  game.events.push({ kind: 'levelEntered', floor: game.pc.floor });
  game.recenterMap = true;
}

/** The four cures, which never heal past the maximum. */
function heal(game: MwGame, amount: number): void {
  const pc = game.pc;
  pc.hp += amount;
  if (pc.hp > pc.maxHp) pc.hp = pc.maxHp;
}

/**
 * spell_effect (WORLD.EXE 2000:d358, mw.c "spell_effect"), the permanent list. These are the
 * spells the screen refuses anywhere but the town, and the only ones that cost their level off
 * the maximum spell points as well as off the pool.
 *
 * @param levelIndex 0 to 9, one less than the level printed on the menu.
 * @param slot 0 to 2, the spell on that line.
 */
export function permanentList(game: MwGame, levelIndex: number, slot: number): boolean {
  const pc = game.pc;
  if (levelIndex === 0) {
    if (slot === 0) return enchantWeapon(game, 1);
    if (slot === 1) {
      pc.maxHp += 1;
      return true;
    }
    if (slot === 2) return writeScrollOrWand(game, 3, 1);
  }
  if (levelIndex === 1) {
    if (slot === 0) return enchantArmour(game, 1);
    if (slot === 1) {
      pc.maxHp += 3;
      return true;
    }
    if (slot === 2) return writeScrollOrWand(game, 3, 2);
  }
  if (levelIndex === 2) {
    if (slot === 0) return enchantWeapon(game, 2);
    if (slot === 1) {
      pc.maxHp += 5;
      return true;
    }
    if (slot === 2) return raiseRingProtection(game, 1) !== 0;
  }
  if (levelIndex === 3) {
    if (slot === 0) return enchantArmour(game, 2);
    if (slot === 1) return raiseRingAntimagic(game, 1) !== 0;
    if (slot === 2) return writeScrollOrWand(game, 10, 1);
  }
  if (levelIndex === 4) {
    if (slot === 0) return enchantWeapon(game, 3);
    if (slot === 1) return raiseRingProtection(game, 2) !== 0;
    if (slot === 2) return raiseBodyArmour(game, 1) !== 0;
  }
  if (levelIndex === 5) {
    if (slot === 0) return enchantArmour(game, 3);
    if (slot === 1) return raiseRingAntimagic(game, 2) !== 0;
    if (slot === 2) return writeScrollOrWand(game, 8, 2);
  }
  if (levelIndex === 6) {
    if (slot === 0) return raiseRingProtection(game, 3) !== 0;
    if (slot === 1) return raiseRingAntimagic(game, 3) !== 0;
    if (slot === 2) return raiseBodyArmour(game, 2) !== 0;
  }
  if (levelIndex === 7) {
    if (slot === 0) return enchantWeapon(game, 4);
    if (slot === 1) return enchantArmour(game, 4);
    if (slot === 2) return writeScrollOrWand(game, 10, 2);
  }
  if (levelIndex === 8) {
    // Permanent Feather, which the inn cannot clear: it only clears a feather marked 1.
    if (slot === 0) {
      if (pc.feather !== PERMANENT_MARK) {
        pc.feather = PERMANENT_MARK;
        recomputeWeight(game);
        return true;
      }
      sayRedundant(game);
      return false;
    }
    if (slot === 1) return raiseRingAntimagic(game, 5) !== 0;
    if (slot === 2) {
      pc.maxHp += 25;
      return true;
    }
  }
  if (levelIndex === 9) {
    // Permanent Invisibility. Marked 100 it still stops a newly met monster's free first strike,
    // but the one turn in four when the monsters do not move at all wants a marker of exactly 1,
    // so the permanent version is the weaker of the two.
    if (slot === 0) {
      if (pc.invisibility !== PERMANENT_MARK) {
        pc.invisibility = PERMANENT_MARK;
        return true;
      }
      sayRedundant(game);
      return false;
    }
    // Youth halves the character's age and puts it back up to fifteen years if that came out
    // lower. It gives back none of the strength and constitution that ageing took.
    if (slot === 1) {
      pc.ageMinutes = pc.ageMinutes >>> 1;
      if (pc.ageMinutes < YOUNGEST_MINUTES) pc.ageMinutes = YOUNGEST_MINUTES;
      return true;
    }
    if (slot === 2) return raiseBodyArmour(game, 4) !== 0;
  }
  return false;
}

/**
 * spell_effect (WORLD.EXE 2000:d358, mw.c "spell_effect"), the preparation list. The screen
 * refuses every one of these during a battle.
 */
export function preparationList(game: MwGame, levelIndex: number, slot: number): boolean {
  const pc = game.pc;
  if (levelIndex === 0) {
    if (slot === 0) return raisePrepArmour(game, 1) !== 0;
    if (slot === 1) return raisePrepWeapon(game, 1) !== 0;
    // Little Cure, which heals half the wisdom and has no random part at all.
    if (slot === 2) {
      heal(game, Math.trunc(pc.wis / 2));
      sayFeelGood(game);
      return true;
    }
  }
  if (levelIndex === 1) {
    if (slot === 0) return raisePrepWeapon(game, 2) !== 0;
    if (slot === 1) {
      // Relocate always works, and the spell reports success without looking at the answer.
      teleportPlayer(game);
      return true;
    }
    if (slot === 2) {
      // DS:3cc9
      game.say(`YOU ARE ON LEVEL: ${pc.floor}`);
      return true;
    }
  }
  if (levelIndex === 2) {
    if (slot === 0) {
      let healed = game.rng.random(pc.wis) + 10;
      if (healed > 40) healed = 40;
      heal(game, healed);
      sayFeelGood(game);
      return true;
    }
    if (slot === 1) return raisePrepArmour(game, 2) !== 0;
    if (slot === 2) {
      if (pc.prepStrength !== 5) {
        pc.prepStrength = 5;
        pc.str += 5;
        sayFeelVeryGood(game);
        return true;
      }
      sayAlreadyCast(game);
      return false;
    }
  }
  if (levelIndex === 3) {
    if (slot === 0) return raisePrepWeapon(game, 3) !== 0;
    if (slot === 1) {
      if (pc.prepAgility !== 5) {
        pc.prepAgility = 5;
        pc.dex += 5;
        sayFeelVeryGood(game);
        return true;
      }
      sayAlreadyCast(game);
      return false;
    }
    // Descend: one floor down, onto a random square that is not rock rather than the open space
    // directly below the character.
    if (slot === 2) {
      if (pc.floor > 123) {
        // DS:3cdc 3cf0 1476 20bd
        game.say('THAT SPELL DOES NOT', '  WORK THIS DEEP.', '', 'HIT ANY KEY...');
        return false;
      }
      pc.floor += 1;
      dropOnOpenSquare(game);
      enterLevel(game);
      return true;
    }
  }
  if (levelIndex === 4) {
    // Ascend, refused from floor 66 down although the message says the 64th.
    if (slot === 0) {
      if (pc.floor > 65) {
        sayNotBelowSixtyFour(game);
        return false;
      }
      if (pc.floor < 1) {
        sayNotAboveTheTown(game);
        return false;
      }
      pc.floor -= 1;
      dropOnOpenSquare(game);
      enterLevel(game);
      return true;
    }
    if (slot === 1) {
      // DS:3cc9 3d63 3d7c 3d87
      game.say(
        `YOU ARE ON LEVEL: ${pc.floor}`,
        'YOUR X AND Y COORDINATES',
        `   ARE: X-${pc.x} Y-${pc.y}`,
      );
      return true;
    }
    if (slot === 2) {
      if (pc.feather !== 0) {
        sayRedundant(game);
        return false;
      }
      pc.feather = 1;
      recomputeWeight(game);
      return true;
    }
  }
  if (levelIndex === 5) {
    if (slot === 0) {
      let healed = game.rng.random(pc.wis * 4) + 20;
      if (healed > 90) healed = 90;
      heal(game, healed);
      sayFeelVeryGood(game);
      return true;
    }
    // Double Ascend, which is one floor from floor 1.
    if (slot === 1) {
      if (pc.floor > 65) {
        sayNotBelowSixtyFour(game);
        return false;
      }
      if (pc.floor < 1) {
        sayNotAboveTheTown(game);
        return false;
      }
      if (pc.floor < 2) pc.floor -= 1;
      else pc.floor -= 2;
      dropOnOpenSquare(game);
      enterLevel(game);
      return true;
    }
    if (slot === 2) return raisePrepWeapon(game, 4) !== 0;
  }
  if (levelIndex === 6) {
    if (slot === 0) {
      if (pc.invisibility !== 0) {
        sayRedundant(game);
        return false;
      }
      pc.invisibility = 1;
      return true;
    }
    if (slot === 1) return raisePrepArmour(game, 3) !== 0;
    if (slot === 2) {
      if (pc.fastMove !== 0) {
        sayRedundant(game);
        return false;
      }
      pc.fastMove = 1;
      return true;
    }
  }
  if (levelIndex === 7) {
    if (slot === 0) {
      if (pc.superStrength !== 10) {
        pc.superStrength = 10;
        pc.str += 10;
        sayFeelVeryGood(game);
        return true;
      }
      sayAlreadyCast(game);
      return false;
    }
    if (slot === 1) return raisePrepWeapon(game, 5) !== 0;
    // Major Descend: twenty-five floors down clamped to 75, so a full twenty-five only down to
    // floor 50. Refused from floor 66 down, and with no refusal for the town, so it is castable
    // from floor 0 to floor 65.
    if (slot === 2) {
      if (pc.floor > 65) {
        sayNotBelowSixtyFour(game);
        return false;
      }
      pc.floor += 25;
      if (pc.floor > 75) pc.floor = 75;
      dropOnOpenSquare(game);
      enterLevel(game);
      return true;
    }
  }
  if (levelIndex === 8) {
    if (slot === 0) {
      if (pc.superAgility !== 10) {
        pc.superAgility = 10;
        pc.dex += 10;
        sayFeelVeryGood(game);
        return true;
      }
      sayAlreadyCast(game);
      return false;
    }
    // Cure Poison writes −1, which is what stops the timer counting down to the next point of
    // strength; zero would still be counted.
    if (slot === 1) {
      pc.poisonTimer = -1;
      return true;
    }
    if (slot === 2) {
      pc.hp = pc.maxHp;
      return true;
    }
  }
  if (levelIndex === 9) {
    // Major Ascend: exactly twenty-five floors up, never below the town.
    if (slot === 0) {
      if (pc.floor > 65) {
        sayNotBelowSixtyFour(game);
        return false;
      }
      if (pc.floor < 1) {
        sayNotAboveTheTown(game);
        return false;
      }
      pc.floor -= 25;
      if (pc.floor < 0) pc.floor = 0;
      dropOnOpenSquare(game);
      enterLevel(game);
      return true;
    }
    if (slot === 1) {
      pc.diseaseTimer = -1;
      return true;
    }
    if (slot === 2) return raisePrepArmour(game, 4) !== 0;
  }
  return false;
}

/** The straight damage the battle lists do, which want a monster engaged and print one screen. */
function shockDamage(game: MwGame, damage: number, howMany: string): boolean {
  if (game.engaged === -1) {
    sayNoMonster(game);
    return false;
  }
  damageTheMonster(game, damage);
  // DS:3e25 3e3b 3e54 3e6b 3e85/3fb5/4039 1476 28ff
  game.say(
    'YOU TOUCH THE MONSTER',
    '   AND ELECTRICITY FLOWS',
    '   THROUGH YOUR HANDS,',
    '   SHOCKING YOUR OPPONENT',
    howMany,
    '',
    'HIT ANY KEY',
  );
  return true;
}

/**
 * Magic Zot and Magic Bolt, which roll `random(5) + base` once for every level the character has
 * plus one — so the free level's worth on top of the per-level rolls.
 */
function missileVolley(game: MwGame, base: number, lead: string, headline: string[]): boolean {
  if (game.engaged === -1) {
    sayNoMonster(game);
    return false;
  }
  let damage = 0;
  for (let roll = 0; roll < game.pc.lev + 1; roll++) damage += game.rng.random(5) + base;
  damageTheMonster(game, damage);
  // DS:381f 1476 28ff after the four the caller names
  game.say(...headline, `${lead}${damage}`, '   POINTS OF DAMAGE.', '', 'HIT ANY KEY');
  return true;
}

/** Slow Enemies, which both battle lists cast: 60 moves, and the message overstates what it does. */
function slowEnemies(game: MwGame): boolean {
  game.pc.slowEnemiesTimer = SPELL_MOVES;
  // DS:3de7 3dfd 3e16 1476 28ff
  game.say(
    'ALL YOUR ENEMIES SEEM',
    '   TO SLOW DOWN TO ABOUT',
    '   HALF SPEED.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/**
 * Hold Monster, which both battle lists cast: fifteen of the monster's own turns, with no roll to
 * make.
 *
 * The spell-proof test comes before the test that a monster is engaged at all, which is the wrong
 * way round: the original reads the six bytes in front of the monster list when nothing is.
 */
function holdMonster(game: MwGame): boolean {
  if (spellProof(game)) return false;
  if (game.engaged === -1) {
    sayNoMonster(game);
    return false;
  }
  // DS:4029
  game.monsterStatusLine = 'MONSTER IS HELD';
  game.pc.holdMonsterTimer = 15;
  return true;
}

/**
 * spell_effect (WORLD.EXE 2000:d358, mw.c "spell_effect"), the wizard battle list. Every spell
 * that touches a monster answers "YOU ARE NOT CURRENTLY ENGAGING ANY MONSTER" and costs nothing
 * when there is none.
 */
export function wizardBattle(game: MwGame, levelIndex: number, slot: number): boolean {
  const pc = game.pc;
  if (levelIndex === 0) {
    if (slot === 0) return sleepMonster(game);
    // Magic Zap, which is one level's worth more than the two points a level the help text says.
    if (slot === 1) {
      if (game.engaged === -1) {
        sayNoMonster(game);
        return false;
      }
      const damage = pc.lev * 2 + 2;
      damageTheMonster(game, damage);
      // DS:3d9f 3db7 3d8b 3dd2
      game.say(
        'WISPS OF COLORFUL LIGHT',
        '   GATHER TOGETHER AND ZAP',
        `   THE MONSTER FOR ${damage}`,
        '   POINTS OF DAMAGE!',
      );
      return true;
    }
    if (slot === 2) return raiseProtection(game, 1);
  }
  if (levelIndex === 1) {
    if (slot === 0) return slowEnemies(game);
    if (slot === 1) return boostStrength(game);
    // DS:3e85
    if (slot === 2) return shockDamage(game, 25, '   FOR 25 POINTS OF DAMAGE.');
  }
  if (levelIndex === 2) {
    if (slot === 0) {
      if (game.engaged === -1) {
        sayNoMonster(game);
        return false;
      }
      const damage = pc.lev * 4 + 4;
      damageTheMonster(game, damage);
      // DS:3ea1 3ebb 3ed4 3d8b 381f 1476 28ff
      game.say(
        'YOU FORM A BALL WITH YOUR',
        '   HANDS AND ELECTRICITY',
        '   BOLTS FORWARD, BURNING',
        `   THE MONSTER FOR ${damage}`,
        '   POINTS OF DAMAGE.',
        '',
        'HIT ANY KEY',
      );
      return true;
    }
    if (slot === 1) {
      if (game.engaged === -1) {
        sayNoMonster(game);
        return false;
      }
      damageTheMonster(game, 50);
      // DS:3eee 3f05 3f1f 381f 1476 28ff
      game.say(
        'A MISSLE BOLTS FORWARD',
        '   FROM YOUR FOREHEAD AND',
        '   STABS THE ENEMY FOR 50',
        '   POINTS OF DAMAGE.',
        '',
        'HIT ANY KEY',
      );
      return true;
    }
    if (slot === 2) return boostAgility(game);
  }
  if (levelIndex === 3) {
    // Go Away reports success whatever teleport_monster answered, so a monster that refused it —
    // or no monster at all — still costs the spell points.
    if (slot === 0) {
      teleportMonster(game);
      return true;
    }
    if (slot === 1) {
      teleportPlayer(game);
      return true;
    }
    if (slot === 2) return raisePowerWeapon(game, 1);
  }
  if (levelIndex === 4) {
    if (slot === 0) return explosion(game, 0);
    if (slot === 1) return raiseProtection(game, 2);
    if (slot === 2) return resistPoison(game);
  }
  if (levelIndex === 5) {
    if (slot === 0) {
      // DS:3f4c 3f66 3f84 3fa0 3f39
      return missileVolley(game, 4, '   THE MISSLES DO ', [
        'A GROUP OF MISSLES SPRING',
        '   FORTH FROM YOUR FINGERTIPS',
        '   AND PLUNGE DIRECTLY INTO',
        "   THE ENEMY'S BODY.",
      ]);
    }
    // DS:3fb5
    if (slot === 1) return shockDamage(game, 125, '   FOR 125 POINTS OF DAMAGE.');
    if (slot === 2) return antiCold(game);
  }
  if (levelIndex === 6) {
    if (slot === 0) return explosion(game, 1);
    if (slot === 1) return teleportDirection(game, game.chooseDirection());
    if (slot === 2) return antiFire(game);
  }
  if (levelIndex === 7) {
    if (slot === 0) {
      // DS:3fe6 3f66 3fff 401d 3fd2
      return missileVolley(game, 7, '   THE CHARGE DOES ', [
        'AN ELECTRIC CHARGE LEAPS',
        '   FORTH FROM YOUR FINGERTIPS',
        '   INTO THE BODY OF THE ENEMY',
        '   MONSTER.',
      ]);
    }
    if (slot === 1) return raiseProtection(game, 3);
    if (slot === 2) return raisePowerWeapon(game, 2);
  }
  if (levelIndex === 8) {
    if (slot === 0) return holdMonster(game);
    if (slot === 1) return drainMonster(game);
    // DS:4039
    if (slot === 2) return shockDamage(game, 300, '   FOR 300 POINTS OF DAMAGE.');
  }
  if (levelIndex === 9) {
    if (slot === 0) return explosion(game, 2);
    if (slot === 1) return autokill(game);
    if (slot === 2) return raisePowerWeapon(game, 3);
  }
  return false;
}

/**
 * spell_effect (WORLD.EXE 2000:d358, mw.c "spell_effect"), the priestly battle list. Nine of its
 * thirty are the wizard list's spell exactly; the four cures and Ultra Protection are its own.
 */
export function priestBattle(game: MwGame, levelIndex: number, slot: number): boolean {
  const pc = game.pc;
  if (levelIndex === 0) {
    if (slot === 0) return sleepMonster(game);
    if (slot === 1) return raiseProtection(game, 1);
    if (slot === 2) return boostStrength(game);
  }
  if (levelIndex === 1) {
    if (slot === 0) return resistPoison(game);
    if (slot === 1) return boostAgility(game);
    if (slot === 2) {
      heal(game, Math.trunc(pc.wis / 2));
      sayFeelGood(game);
      return true;
    }
  }
  if (levelIndex === 2) {
    if (slot === 0) return resistDisease(game);
    if (slot === 1) {
      teleportPlayer(game);
      return true;
    }
    if (slot === 2) return slowEnemies(game);
  }
  if (levelIndex === 3) {
    if (slot === 0) return antiCold(game);
    if (slot === 1) {
      teleportMonster(game);
      return true;
    }
    if (slot === 2) return raisePowerWeapon(game, 1);
  }
  if (levelIndex === 4) {
    // The priestly Protection asks for level 1, not 2, so it takes 2 off a monster's attack roll
    // where the wizard's takes 8. Cast after Minor Protection it merely adds 60 more moves.
    if (slot === 0) return raiseProtection(game, 1);
    if (slot === 1) return antiFire(game);
    if (slot === 2) return teleportDirection(game, game.chooseDirection());
  }
  if (levelIndex === 5) {
    if (slot === 0) return resistDrain(game);
    if (slot === 1) return drainMonster(game);
    if (slot === 2) {
      let healed = game.rng.random(pc.wis * 4) + 20;
      if (healed > 90) healed = 90;
      heal(game, healed);
      sayFeelVeryGood(game);
      return true;
    }
  }
  if (levelIndex === 6) {
    if (slot === 0) return holdMonster(game);
    if (slot === 1) return raisePowerWeapon(game, 2);
    // DS:3fb5
    if (slot === 2) return shockDamage(game, 125, '   FOR 125 POINTS OF DAMAGE.');
  }
  if (levelIndex === 7) {
    if (slot === 0) return raiseProtection(game, 3);
    if (slot === 1) return explosion(game, 1);
    if (slot === 2) {
      // DS:3f4c 3f66 3f84 3fa0 3f39
      return missileVolley(game, 4, '   THE MISSLES DO ', [
        'A GROUP OF MISSLES SPRING',
        '   FORTH FROM YOUR FINGERTIPS',
        '   AND PLUNGE DIRECTLY INTO',
        "   THE ENEMY'S BODY.",
      ]);
    }
  }
  if (levelIndex === 8) {
    if (slot === 0) return autokill(game);
    if (slot === 1) return raisePowerWeapon(game, 3);
    if (slot === 2) return boostStrengthAndAgility(game);
  }
  if (levelIndex === 9) {
    if (slot === 0) return raiseProtection(game, 4);
    if (slot === 1) {
      pc.hp = pc.maxHp;
      return true;
    }
    // DS:4039
    if (slot === 2) return shockDamage(game, 300, '   FOR 300 POINTS OF DAMAGE.');
  }
  return false;
}

/**
 * spell_effect (WORLD.EXE 2000:d358, mw.c "spell_effect"): the switch on the category, the level
 * and the slot that all 120 spells arrive at. It answers whether the spell did anything, which
 * is what decides whether the screen charges for it.
 *
 * @param category 0 permanent, 1 preparation, 2 wizard, 3 priestly.
 * @param levelIndex 0 to 9, one less than the level printed on the menu.
 * @param slot 0 to 2, the spell on that line.
 */
export function spellEffect(game: MwGame, category: number, levelIndex: number, slot: number): boolean {
  if (category === 0) return permanentList(game, levelIndex, slot);
  if (category === 1) return preparationList(game, levelIndex, slot);
  if (category === 2) return wizardBattle(game, levelIndex, slot);
  if (category === 3) return priestBattle(game, levelIndex, slot);
  return false;
}

/** Where a spell is being cast from, which is what spell_screen is called with. */
export const MW_FROM_SPELLBOOK = 1;
export const MW_FROM_SCROLL = 2;
export const MW_FROM_WAND = 3;
export const MW_FROM_PAPER = 4;

/** Which of the four places a spell was cast from, as the run's own record of a cast names it. */
function mwCastSource(source: number): CastSource {
  if (source === MW_FROM_SCROLL) return 'scroll';
  if (source === MW_FROM_WAND) return 'wand';
  if (source === MW_FROM_PAPER) return 'paper';
  return 'spellPoints';
}

/**
 * The game time spell_screen hands its caller for a spell that worked: ten for a battle spell,
 * a hundred for a preparation spell, and 36,096 for a permanent one.
 *
 * movecontrol (WORLD.EXE 2000:aad5) spends anything under 60 in one go and anything under 30,000
 * sixty at a time, so the permanent list's number falls through both tests and no time passes at
 * all — whatever "THESE SPELLS TAKE ONE MONTH TO CAST" says.
 */
export const MW_SPELL_TIME = { battle: 10, preparation: 100, permanent: 0x8d00 };

/** What spell_screen hands back for a spell that moved the character to another floor. */
export const MW_SPELL_MOVED_FLOOR = 1;

/**
 * Which of the four arrays a source is held in. The spellbook holds a flag, the other three hold
 * a count that casting takes one off.
 */
function heldIn(game: MwGame, source: number): number[] {
  if (source === MW_FROM_SCROLL) return game.pc.scrolls;
  if (source === MW_FROM_WAND) return game.pc.wands;
  if (source === MW_FROM_PAPER) return game.pc.paper;
  return game.pc.spellbook;
}

/**
 * The test the spell menu applies to each of its thirty lines (WORLD.EXE 2000:ea27, mw.c
 * "spell_screen"): a spell whose byte in the array is zero cannot be picked, and the key that
 * would pick it is thrown away. {@link castSpell} does not apply it, because the original applies
 * it in the menu rather than in the cast.
 */
export function spellHeld(game: MwGame, source: number, category: number, levelIndex: number, slot: number): boolean {
  return heldIn(game, source)[category * MW_BOOK_SLOTS_PER_CATEGORY + levelIndex * 3 + slot] !== 0;
}

/**
 * spell_screen (WORLD.EXE 2000:ea27, mw.c "spell_screen"): the gates the four spell menus apply
 * and the price they charge. The original is the menu as well; this is everything it does once
 * the player has picked a spell.
 *
 * A fighter is turned away from the spellbook, the scrolls and the wands, so magic paper is the
 * only magic they have. Permanent spells are refused anywhere but the town and preparation spells
 * during a battle. The wizard and priestly categories are gated on the class, but only out of the
 * spellbook: a scroll, a wand or a piece of paper is never checked against it.
 *
 * A spell out of the spellbook costs its level in spell points, and a permanent one costs the
 * same again off the maximum, for good. A spell off an item costs one charge. Nothing at all is
 * charged for a spell whose effect answered no.
 *
 * @param source {@link MW_FROM_SPELLBOOK}, {@link MW_FROM_SCROLL}, {@link MW_FROM_WAND} or
 *   {@link MW_FROM_PAPER}.
 * @param category 0 permanent, 1 preparation, 2 wizard, 3 priestly.
 * @param levelIndex 0 to 9, one less than the level printed on the menu.
 * @returns 0 when nothing happened, and otherwise the game time the caller charges for it.
 */
export function castSpell(
  game: MwGame,
  source: number,
  category: number,
  levelIndex: number,
  slot: number,
): number {
  const pc = game.pc;
  const floorAtEntry = pc.floor;
  if (source !== MW_FROM_PAPER && pc.cls === 0) {
    // DS:4064 407b 4093 1476 20bd
    game.say(
      'FIGHTERS CAN ONLY CAST',
      '  SPELLS BY USING MAGIC',
      '  PAPER. KEEP LOOKING.',
      '',
      'HIT ANY KEY...',
    );
    return 0;
  }
  if (category === 0 && pc.floor !== 0) {
    // DS:4112 412e 4148 1476 20bd
    game.say(
      'THESE SPELLS TAKE ONE MONTH',
      '   TO CAST AND CAN NOT BE',
      '   USED IN THE DUNGEON.',
      '',
      'HIT ANY KEY...',
    );
    return 0;
  }
  if (category === 1 && game.engaged !== -1) {
    // DS:4160 417c 4195 1476 20bd
    game.say(
      'THESE SPELLS TAKE 3 MINUTES',
      '   TO CAST. THIS CAN NOT',
      '   BE DONE DURING BATTLE.',
      '',
      'HIT ANY KEY...',
    );
    return 0;
  }
  const gated =
    (category === 2 && !MW_WIZARD_CLASSES.includes(pc.cls)) ||
    (category === 3 && !MW_PRIESTLY_CLASSES.includes(pc.cls));
  if (source === MW_FROM_SPELLBOOK && gated) {
    // DS:41af 41cb 1476 20bd
    game.say('YOU ARE UNABLE TO CAST THIS', '   TYPE OF SPELLS.', '', 'HIT ANY KEY...');
    return 0;
  }
  const cost = levelIndex + 1;
  if (source === MW_FROM_SPELLBOOK && cost > pc.sp) {
    // DS:42fa 4311 4329 1476 20bd
    game.say(
      'YOU DO NOT HAVE ENOUGH',
      '   SPELL POINTS TO CAST',
      '   THIS SPELL.',
      '',
      'HIT ANY KEY...',
    );
    return 0;
  }
  // spell_effect pushes what the spell did as it does it, and a spell that refused itself is no
  // cast at all, so the cast is only known to have happened once it comes back true. Its own
  // event goes in where the spell started rather than after it, so that a journal reads the
  // cast and then what it did.
  const beforeTheSpell = game.events.length;
  if (!spellEffect(game, category, levelIndex, slot)) return 0;
  game.events.splice(beforeTheSpell, 0, {
    kind: 'cast',
    spell: {
      game: 'moraffsWorld',
      category,
      levelIndex,
      slot,
      source: mwCastSource(source),
      name: MW_SPELL_NAMES[mwSpellRecord(category, levelIndex + 1, slot)],
    },
  });
  if (source === MW_FROM_SPELLBOOK) pc.sp -= cost;
  else heldIn(game, source)[category * MW_BOOK_SLOTS_PER_CATEGORY + levelIndex * 3 + slot] -= 1;
  // A spell that moved the character to another floor stops here, so a permanent spell cast in
  // the town could never reach the maximum spell points either way.
  if (pc.floor !== floorAtEntry) return MW_SPELL_MOVED_FLOOR;
  if (category === 0) {
    if (source === MW_FROM_SPELLBOOK) pc.maxSp -= cost;
    return MW_SPELL_TIME.permanent;
  }
  if (category !== 1) return MW_SPELL_TIME.battle;
  return MW_SPELL_TIME.preparation;
}

/**
 * tick_spell_timers (WORLD.EXE 2000:7e4f, mw.c "tick_spell_timers"): count every spell timer down
 * by the moves that have passed, and undo what runs out.
 *
 * The strength and speed timers take their 7 back off the characteristic when they expire, and
 * Power Weapon and Protection lose the level beside the timer — but only when the timer was above
 * zero to begin with, so a level left standing over a zero timer stays until a night at the inn
 * or a hole dug through the floor.
 */
export function tickSpellTimers(game: MwGame, moves: number): void {
  const pc = game.pc;
  if (pc.slowEnemiesTimer > 0) {
    pc.slowEnemiesTimer -= moves;
    if (pc.slowEnemiesTimer < 0) pc.slowEnemiesTimer = 0;
  }
  if (pc.strengthTimer > 0) {
    if (moves < pc.strengthTimer) {
      pc.strengthTimer -= moves;
    } else {
      pc.strengthTimer = 0;
      pc.str -= 7;
    }
  }
  if (pc.speedTimer > 0) {
    if (moves < pc.speedTimer) {
      pc.speedTimer -= moves;
    } else {
      pc.speedTimer = 0;
      pc.dex -= 7;
    }
  }
  if (pc.powerWeaponTimer > 0) {
    pc.powerWeaponTimer -= moves;
    if (pc.powerWeaponTimer < 1) {
      pc.powerWeaponLevel = 0;
      pc.powerWeaponTimer = 0;
    }
  }
  if (pc.protectionTimer > 0) {
    pc.protectionTimer -= moves;
    if (pc.protectionTimer < 1) {
      pc.protectionLevel = 0;
      pc.protectionTimer = 0;
    }
  }
  if (pc.antiFireTimer > 0) {
    pc.antiFireTimer -= moves;
    if (pc.antiFireTimer < 0) pc.antiFireTimer = 0;
  }
  if (pc.antiColdTimer > 0) {
    pc.antiColdTimer -= moves;
    if (pc.antiColdTimer < 0) pc.antiColdTimer = 0;
  }
  if (pc.resistDrainTimer > 0) {
    pc.resistDrainTimer -= moves;
    if (pc.resistDrainTimer < 0) pc.resistDrainTimer = 0;
  }
  if (pc.resistPoisonTimer > 0) {
    pc.resistPoisonTimer -= moves;
    if (pc.resistPoisonTimer < 0) pc.resistPoisonTimer = 0;
  }
  if (pc.resistDiseaseTimer > 0) {
    pc.resistDiseaseTimer -= moves;
    if (pc.resistDiseaseTimer < 0) pc.resistDiseaseTimer = 0;
  }
  if (pc.sleepTimer > 0) {
    if (moves < pc.sleepTimer) {
      pc.sleepTimer -= moves;
    } else {
      pc.sleepTimer = 0;
      game.monsterStatusLine = '';
    }
  }
  if (pc.holdMonsterTimer > 0) {
    if (moves < pc.holdMonsterTimer) {
      pc.holdMonsterTimer -= moves;
    } else {
      pc.holdMonsterTimer = 0;
      game.monsterStatusLine = '';
    }
  }
}
