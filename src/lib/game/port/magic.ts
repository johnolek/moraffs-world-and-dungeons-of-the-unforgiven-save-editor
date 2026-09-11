import type { Game } from './state';
import { MAP_EMPTY, MAP_PLAYER, monsterAt, monsterSeen, setMonsterMap } from './state';

// The message text is the exact bytes of the game's own strings, read out of the data segment of
// the unpacked executable. The comment on each say call gives the address of every line it
// prints, in order; dotu-tools/reference/scripts/exe_strings.py reads them back.

/** msg_no_monster (exe 3000:d0c1, unf.c "msg_no_monster"). */
export function msgNoMonster(game: Game): void {
  // DS:3652 3668 258b 2b3a
  game.say('YOU ARE NOT CURRENTLY', '   ENGAGING ANY MONSTER.', '', 'HIT ANY KEY...');
}

/** msg_already_in_effect (exe 3000:d0ee, unf.c "msg_already_in_effect"). */
export function msgAlreadyInEffect(game: Game): void {
  // DS:3681 369a 258b 2b3a
  game.say('CASTING THIS SPELL WOULD', '   BE REDUNDANT.', '', 'HIT ANY KEY...');
}

/**
 * msg_already_cast_this_spell (exe 3000:d11b, unf.c "msg_already_cast_this_spell"): the other
 * "already cast" refusal.
 */
export function msgAlreadyCastThisSpell(game: Game): void {
  // DS:36ab 36c1 258b 2b3a
  game.say('YOU HAVE ALREADY CAST', '   THIS SPELL!', '', 'HIT ANY KEY...');
}

/** msg_you_feel_good (exe 3000:d7be, unf.c "msg_you_feel_good"): what a small cure prints. */
export function msgYouFeelGood(game: Game): void {
  // DS:3855
  game.say('YOU FEEL GOOD - HIT ANY KEY');
}

/**
 * msg_you_feel_very_good (exe 3000:d7eb, unf.c "msg_you_feel_very_good"): what a big cure or a
 * stat boost prints.
 */
export function msgYouFeelVeryGood(game: Game): void {
  // DS:3871 258b 2b3a
  game.say('YOU FEEL VERY GOOD!', '', 'HIT ANY KEY...');
}

/**
 * msg_sixty_moves_longer (exe 3000:dd37, unf.c "msg_sixty_moves_longer"): re-casting extended
 * the spell.
 */
export function msgSixtyMovesLonger(game: Game): void {
  // DS:3a95 3aaf 3acc 258b 2b3a
  game.say(
    'YOU HAD ALREADY CAST THIS',
    '  SPELL, SO NOW IT WILL LAST',
    '  60 MOVES LONGER.',
    '',
    'HIT ANY KEY...',
  );
}

/**
 * compute_weight (exe 2000:41ae, unf.c "compute_weight"): add up what the character is
 * carrying — their own weight, then every weapon and every suit of armor they own.
 *
 * Feather zeroes the character's own weight and nothing else, so a feathered character still
 * carries the full weight of their gear. The function catalog's note that the loaded weight is
 * 0 with Feather is not what the code does.
 */
export function computeWeight(game: Game): void {
  const pc = game.pc;
  pc.loadedWeight = pc.weight;
  if (pc.feather !== 0) pc.loadedWeight = 0;
  for (let i = 0; i < 7; i++) pc.loadedWeight += pc.armorOwned[i] * game.armorWeights[i];
  for (let i = 0; i < 8; i++) pc.loadedWeight += pc.weaponsOwned[i] * game.weaponWeights[i];
}

/**
 * enchant_weapon_perm (exe 3000:d148, unf.c "enchant_weapon_perm"): Enchant Weapon, which puts
 * `plus` on one of the eight weapons the character owns. It sets the plus rather than adding to
 * it, so a weaker Enchant Weapon cast on an already better weapon takes the plus back down.
 *
 * The menu lists all eight slots, naming the ones the character owns with their plus and
 * drawing the rest as dashes. Picking a slot they own nothing in does nothing at all.
 */
export function enchantWeaponPerm(game: Game, plus: number): boolean {
  const choice = game.chooseWeapon();
  // Escape makes mset_gmenu hand back -1, which the original subtracts one from and uses as an
  // index, so it reads the unlabelled save byte at 0x7f rather than a weapon and would write the
  // plus at 0x8c. That byte is zero in every save, so escaping cancels the spell by accident.
  if (choice === null) return false;
  const slot = choice - 1;
  if (game.pc.weaponsOwned[slot] === 0) return false;
  game.pc.weaponPlus[slot] = plus;
  return true;
}

/**
 * enchant_armor_perm (exe 3000:d211, unf.c "enchant_armor_perm"): Enchant Armor, the same menu
 * over the eight suits of armor. It sets the plus rather than adding to it, and escaping reads
 * the unlabelled save byte at 0xae the same way {@link enchantWeaponPerm} reads 0x7f.
 */
export function enchantArmorPerm(game: Game, plus: number): boolean {
  const choice = game.chooseArmor();
  if (choice === null) return false;
  const slot = choice - 1;
  if (game.pc.armorOwned[slot] === 0) return false;
  game.pc.armorPlus[slot] = plus;
  return true;
}

/**
 * set_temp_armor_plus (exe 3000:d2da, unf.c "set_temp_armor_plus"): the preparation Enchant
 * Armor, which puts `plus` on whatever the character is wearing until they next rest at an inn.
 * It refuses a plus that is not better than the one already up.
 */
export function setTempArmorPlus(game: Game, plus: number): boolean {
  if (plus <= game.pc.tempArmorPlus) {
    msgAlreadyInEffect(game);
    return false;
  }
  game.pc.tempArmorPlus = plus;
  return true;
}

/**
 * set_temp_weapon_plus (exe 3000:d2fc, unf.c "set_temp_weapon_plus"): the preparation Enchant
 * Weapon, the same thing for whatever is in hand.
 */
export function setTempWeaponPlus(game: Game, plus: number): boolean {
  if (plus <= game.pc.tempWeaponPlus) {
    msgAlreadyInEffect(game);
    return false;
  }
  game.pc.tempWeaponPlus = plus;
  return true;
}

/**
 * set_body_armor (exe 3000:d31e, unf.c "set_body_armor"): Body Armor, which sets the spell's
 * level unless the character already has that level or better.
 *
 * The original hands back the level it just set rather than 1; every caller only asks whether
 * it is zero, so the port reports a boolean. The same goes for {@link setProtRing} and
 * {@link setAntiMagicRing}.
 */
export function setBodyArmor(game: Game, level: number): boolean {
  if (level <= game.pc.bodyArmor) {
    msgAlreadyInEffect(game);
    return false;
  }
  game.pc.bodyArmor = level;
  return true;
}

/** set_prot_ring (exe 3000:d340, unf.c "set_prot_ring"): the Ring of Protection's plus. */
export function setProtRing(game: Game, level: number): boolean {
  if (level <= game.pc.protRing) {
    msgAlreadyInEffect(game);
    return false;
  }
  game.pc.protRing = level;
  return true;
}

/**
 * set_anti_magic_ring (exe 3000:d362, unf.c "set_anti_magic_ring"): the Anti-Magic Ring's plus.
 * Nothing in the game ever reads the field back.
 */
export function setAntiMagicRing(game: Game, level: number): boolean {
  if (level <= game.pc.antiMagicRing) {
    msgAlreadyInEffect(game);
    return false;
  }
  game.pc.antiMagicRing = level;
  return true;
}

/** How many charges Enchant Wand writes onto a wand at a time. */
const WAND_CHARGES = 5;

/**
 * write_scroll_or_wand (exe 3000:d384, unf.c "write_scroll_or_wand"): Write Scroll and Enchant
 * Wand, which add one scroll of a spell the player picks or five charges of a wand of it.
 * `maxLevel` is the deepest spell level the level menu will take, and `kind` is 1 for a scroll
 * and 2 for a wand.
 *
 * The first of the three menus draws the wizard line as dashes for a character whose class
 * cannot cast wizard spells, and the priest line likewise, but get_choice takes the key
 * regardless: a fighter can write a wizard scroll off a menu that offers them nothing.
 */
export function writeScrollOrWand(game: Game, maxLevel: number, kind: number): boolean {
  const choice = game.chooseSpell(maxLevel);
  if (choice === null) return false;
  const index = choice.type * 45 + choice.level * 3 + choice.slot;
  const spell = { type: choice.type, level: choice.level, slot: choice.slot };
  if (kind === 1) {
    game.pc.scrolls[index] += 1;
    game.events.push({ kind: 'scrollWritten', spell });
    // DS:37f7 380b 258b 2d43
    game.say('THE SCROLL HAS BEEN', '   SUCCESSFULLY WRITTEN!', '', 'HIT ANY KEY');
    // print_menu_only waits for the key its last line asks for, and takes the box down on it.
    game.pressAnyKey();
    return true;
  }
  if (kind === 2) {
    game.pc.wands[index] += WAND_CHARGES;
    game.events.push({ kind: 'wandMade', spell, charges: WAND_CHARGES });
    // DS:3824 383c 258b 2d43
    game.say('YOU NOW HOLD A GLOWING,', '   CHARGED WAND IN HAND!', '', 'HIT ANY KEY');
    game.pressAnyKey();
    return true;
  }
  // Nothing passes a kind other than 1 or 2. The original would put the spell menus up again
  // and keep asking, for ever.
  return false;
}

/**
 * boss_immune_check (exe 3000:dab7, unf.c "boss_immune_check"): whether the monster being fought
 * is a Shadow boss, which every spell aimed at a monster except Sleep refuses to touch. Prints
 * the boss's taunt when it is.
 */
export function bossImmuneCheck(game: Game): boolean {
  const monster = game.monsters[game.engaged];
  // Hold Monster calls this before it checks that anything is engaged, so the original reads the
  // six bytes in front of the monster table and asks whether that garbage is 100. Reading
  // nothing is not a boss here.
  if (!monster || game.monsterKinds[monster.type].special !== 100) return false;
  // DS:3950 396d 3989 39a3 39be 39d9 39f2 2d43
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

/**
 * The hit points a battle spell takes off the monster being fought, taken off where the spell's
 * own message names them so that a run journal has the number the player was shown.
 */
function damageTheMonster(game: Game, damage: number): void {
  game.monsters[game.engaged].hp -= damage;
  game.events.push({ kind: 'spellDamaged', monster: monsterSeen(game, game.engaged), damage });
}

/**
 * explosion (exe 3000:d818, unf.c "explosion"): Minor Explosion, Explosion and Major Explosion.
 * `kind` is 0, 1 or 2 for the three sizes.
 */
export function explosion(game: Game, kind: number): boolean {
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  let headline = '';
  if (kind === 0) headline = 'A SMALL EXPLOSION OCCURS'; // DS:3885
  if (kind === 1) headline = 'A LARGE EXPLOSION OCCURS'; // DS:389e
  if (kind === 2) headline = 'A HUGE EXPLOSION OCCURS'; // DS:38b7
  // The original asks the same question a second time here, with nothing in between that could
  // have changed the answer.
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  // The original rolls the damage into the same variable it took the size in, so these three
  // tests run one after another on a value that may already be the damage. Every roll comes out
  // above 2, so a rolled total never matches a later size.
  let damage = kind;
  if (damage === 0) damage = game.rng.random(101) + 75;
  if (damage === 1) damage = game.rng.random(101) + 125;
  if (damage === 2) damage = game.rng.random(301) + 200;
  damageTheMonster(game, damage);
  // DS:38e6 3900 38cf 3916 258b 2d43, after the headline
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
 * sleep_monster (exe 3000:d904, unf.c "sleep_monster"): Sleep, in both battle lists. It is the
 * one spell aimed at a monster that never asks boss_immune_check, so it works on a Shadow boss.
 * Both halves of the roll report success; only what they print differs.
 */
export function sleepMonster(game: Game): boolean {
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  // The original compares the sleep timer to 1 rather than to 0, so this refusal only fires on
  // the last move of an existing sleep; any earlier and the spell recasts and prints again.
  if (game.pc.sleepTimer === 1) {
    msgAlreadyInEffect(game);
    return false;
  }
  // The decompilation shows the rand() call with no argument at all. The monster's level is what
  // the reverse engineering notes and the function catalog record as the argument.
  if (game.rng.random(game.monsters[game.engaged].level) < 3) {
    game.pc.sleepTimer = 25;
    // DS:392b, into the monster status line rather than onto the message line
    game.monsterStatusLine = 'MONSTER IS SLEEPING';
  } else {
    // DS:393f 258b 2d43
    game.say('THE SPELL FAILS.', '', 'HIT ANY KEY');
  }
  return true;
}

/** strength (exe 3000:d990, unf.c "strength"): Strength, +7 STR for 60 moves. */
export function strength(game: Game): boolean {
  if (game.pc.strengthTimer === 0) {
    game.pc.strengthTimer = 60;
    game.pc.str += 7;
    msgYouFeelVeryGood(game);
    return true;
  }
  msgAlreadyCastThisSpell(game);
  return false;
}

/** speed (exe 3000:d9ba, unf.c "speed"): Speed, +7 AGI for 60 moves. */
export function speed(game: Game): boolean {
  if (game.pc.speedTimer === 0) {
    game.pc.speedTimer = 60;
    game.pc.dex += 7;
    msgYouFeelVeryGood(game);
    return true;
  }
  msgAlreadyCastThisSpell(game);
  return false;
}

/** strength_and_speed (exe 3000:d9e4, unf.c "strength_and_speed"): both boosts at once. */
export function strengthAndSpeed(game: Game): boolean {
  // It only refuses when both are already running: with one of them up, that one is extended by
  // 60 moves and the other is cast normally.
  if (game.pc.speedTimer !== 0 && game.pc.strengthTimer !== 0) {
    msgAlreadyCastThisSpell(game);
    return false;
  }
  game.pc.speedTimer += 60;
  game.pc.strengthTimer += 60;
  if (game.pc.speedTimer === 60) game.pc.dex += 7;
  if (game.pc.strengthTimer === 60) game.pc.str += 7;
  msgYouFeelVeryGood(game);
  return true;
}

/**
 * relocate (exe 3000:da2c, unf.c "relocate"): Relocate, which drops the player on a random open
 * square of the same floor that no monster is standing on.
 */
export function relocateSpell(game: Game): boolean {
  setMonsterMap(game, game.pc.x, game.pc.y, MAP_EMPTY);
  do {
    do {
      game.pc.x = game.rng.random(game.columns);
      game.pc.y = game.rng.random(game.rows);
    } while (game.solid(game.pc.x, game.pc.y, game.pc.level, game.pc.module));
  } while (monsterAt(game, game.pc.x, game.pc.y) !== -1);
  setMonsterMap(game, game.pc.x, game.pc.y, MAP_PLAYER);
  game.recenterMap = true;
  game.redrawView = true;
  return true;
}

/**
 * go_away (exe 3000:db1e, unf.c "go_away"): Go Away, which throws the monster somewhere else on
 * the floor. There is no level-ratio check anywhere in it, whatever the help text says: on
 * anything but a Shadow boss it always works.
 */
export function goAway(game: Game): boolean {
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  if (bossImmuneCheck(game)) return false;
  const monster = game.monsters[game.engaged];
  setMonsterMap(game, monster.x, monster.y, MAP_EMPTY);
  do {
    monster.x = game.rng.random(game.columns);
    monster.y = game.rng.random(game.rows);
    // The loop asks whether the square the *player* is standing on is rock, not the square the
    // monster just landed on. The player is never standing in rock, so the loop always stops on
    // the first roll and the monster can be dropped inside solid rock.
  } while (game.solid(game.pc.x, game.pc.y, game.pc.level, game.pc.module));
  setMonsterMap(game, monster.x, monster.y, game.engaged);
  return true;
}

/**
 * autokill (exe 3000:dc18, unf.c "autokill"): Autokill, which sets the monster's hit points to
 * -100 when the roll lands. Reports success either way; only the message changes.
 */
export function autokill(game: Game): boolean {
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  if (bossImmuneCheck(game)) return false;
  const monster = game.monsters[game.engaged];
  const stats = game.monsterStats[game.monsterKinds[monster.type].type];
  const monsterRoll = game.rng.random(monster.level + game.rng.random(stats.speed));
  const playerRoll = game.rng.random(game.pc.lev + game.rng.random(game.pc.iq + game.pc.wis));
  if (monsterRoll < playerRoll + game.rng.random(game.pc.level)) {
    monster.hp = -100;
    // DS:3a08 3a25 3a41 3a5d 258b 2d43
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
  // DS:3a6b 3a89 258b 2d43
  game.say('THE SPELL FAILS... TOUGH LUCK', '   CHARLIE.', '', 'HIT ANY KEY');
  return true;
}

/**
 * power_weapon (exe 3000:dd64, unf.c "power_weapon"): Power Weapon I to III.
 *
 * The three spells put a 129, 199 or 399 damage die in the player's hands for 60 moves. `level`
 * is 1, 2 or 3; `strike` adds eight to it to reach the weapon table, which lands one row past
 * the row the table labels with the same number. The level is at save offset 0x7e8.
 */
export function powerWeapon(game: Game, level: number): boolean {
  if (level < game.pc.powerWeapon) {
    msgAlreadyInEffect(game);
    return false;
  }
  if (game.pc.powerWeapon === level) {
    game.pc.powerWeaponTime += 60;
    msgSixtyMovesLonger(game);
  } else {
    game.pc.powerWeapon = level;
    // Casting a stronger one sets the clock back to 60 rather than adding to what was left.
    game.pc.powerWeaponTime = 60;
    // DS:3adf 3af5 3b11 3b2c 3b46 258b 2d43
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
 * protection (exe 3000:ddc9, unf.c "protection"): Minor Protection, Protection, Major
 * Protection and Ultra Protection.
 *
 * The four spells take 2, 8, 18 and 32 off a monster's attack roll for 60 moves. `level` is 1,
 * 2, 3 or 4. The level is at save offset 0x7eb.
 */
export function protection(game: Game, level: number): boolean {
  if (level < game.pc.protection) {
    msgAlreadyInEffect(game);
    return false;
  }
  if (game.pc.protection === level) {
    game.pc.protectionTime += 60;
    msgSixtyMovesLonger(game);
  } else {
    game.pc.protection = level;
    game.pc.protectionTime = 60;
    // DS:3b4f 3b6b 3b86 3ba0 3bba 258b 2d43
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

/** resist_poison (exe 3000:de2e, unf.c "resist_poison"): Resist Poison, 60 more moves. */
export function resistPoison(game: Game): boolean {
  game.pc.resistPoisonTimer += 60;
  // DS:3bc7 3be1 3bf8 258b 2d43
  game.say(
    'YOU FEEL A WARMTH IN YOUR',
    '   BLOOD AS THE RESIST',
    '   POISON TAKES EFFECT.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/** resist_disease (exe 3000:de65, unf.c "resist_disease"): Resist Disease, 60 more moves. */
export function resistDisease(game: Game): boolean {
  game.pc.resistDiseaseTimer += 60;
  // DS:3c10 3c2c 3c42 258b 2d43
  game.say(
    'YOU FEEL A TINGLING IN YOUR',
    '   BODY AS THE RESIST',
    '   DISEASE TAKES EFFECT.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/** anti_cold (exe 3000:de9c, unf.c "anti_cold"): Anti-Cold, 60 more moves. */
export function antiCold(game: Game): boolean {
  game.pc.antiColdTimer += 60;
  // DS:3c5b 3c76 3c8c 3ca2 258b 2d43
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

/** anti_fire (exe 3000:ded3, unf.c "anti_fire"): Anti-Fire, 60 more moves. */
export function antiFire(game: Game): boolean {
  game.pc.antiFireTimer += 60;
  // DS:3cbf 3c76 3cda 3ca2 258b 2d43
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

/** resist_drain (exe 3000:df0a, unf.c "resist_drain"): Resist Level Drain, 60 more moves. */
export function resistDrain(game: Game): boolean {
  game.pc.resistDrainTimer += 60;
  // DS:3cf0 3d04 3d1e 3d3a 258b 2d43
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
 * drain_monster (exe 3000:df41, unf.c "drain_monster"): Drain Monster, which takes the caster's
 * wisdom off the monster's level. A monster whose level is under the caster's wisdom is emptied
 * outright: level 0 and no hit points. The spell prints nothing at all.
 */
export function drainMonster(game: Game): boolean {
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  if (bossImmuneCheck(game)) return false;
  const monster = game.monsters[game.engaged];
  if (monster.level < game.pc.wis) {
    monster.level = 0;
    monster.hp = 0;
    return true;
  }
  const stats = game.monsterStats[game.monsterKinds[monster.type].type];
  monster.level -= game.pc.wis;
  monster.hp -= Math.trunc(stats.hpPerLevel / 2) * game.pc.wis;
  return true;
}

/**
 * pass_wall (exe 3000:e003, unf.c "pass_wall"): Pass Wall, which walks the player through
 * whatever is in the way to the first square 2 to 19 away in the chosen direction that is on the
 * map, is not rock and has no monster on it. Finding none, it does nothing and reports failure,
 * and cast_a_spell charges nothing for a spell that reports failure.
 *
 * `choice` is the number the player picks off the direction menu: 1 north, 2 south, 3 east, 4
 * west, 5 cancel. The original prints that menu and reads the key itself (FUN_2000_2f5d and
 * get_choice); the port is handed the number instead and prints nothing.
 */
export function passWall(game: Game, choice: number): boolean {
  if (choice <= 0 || choice >= 5) return false;
  let dx = 0;
  let dy = 0;
  if (choice === 1) dy = -1;
  if (choice === 2) dy = 1;
  if (choice === 3) dx = 1;
  if (choice === 4) dx = -1;
  for (let distance = 2; distance < 20; distance++) {
    const x = game.pc.x + dx * distance;
    const y = game.pc.y + dy * distance;
    if (x < 0 || x >= game.columns || y < 0 || y >= game.rows) continue;
    if (game.solid(x, y, game.pc.level, game.pc.module)) continue;
    if (monsterAt(game, x, y) !== -1) continue;
    game.pc.mapCursorX += dx * distance;
    game.pc.mapCursorY += dy * distance;
    // Asking whether the walk left the view is wasted work: reset_view_caches below sets the same
    // flag on every cast anyway.
    if (
      game.pc.mapCursorX < 1 ||
      game.pc.mapCursorY < 1 ||
      game.pc.mapCursorX > game.areaColumns - 2 ||
      game.pc.mapCursorY > game.areaRows - 2
    ) {
      game.recenterMap = true;
    }
    setMonsterMap(game, game.pc.x, game.pc.y, MAP_EMPTY);
    game.pc.x = x;
    game.pc.y = y;
    setMonsterMap(game, x, y, MAP_PLAYER);
    // reset_view_caches (exe 2000:3d9b) throws away every cached piece of the display; of that, the
    // port keeps the two flags it models.
    game.recenterMap = true;
    game.redrawView = true;
    return true;
  }
  return false;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), permanent level 1 slot 2, level 2 slot 2,
 * level 3 slot 2 and level 9 slot 3: Extra Health Point, Extra 3, Extra 5 and Extra 25 Health
 * Points, which add `amount` to the maximum and print nothing.
 */
export function extraHealthPoints(game: Game, amount: number): boolean {
  game.pc.maxHp += amount;
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), permanent level 9 slot 1: Permanent
 * Feather, which writes 100 where the preparation Feather writes 1 and has the game work the
 * carried weight out again.
 */
export function permanentFeather(game: Game): boolean {
  // The refusal only fires on exactly 100, so a character under the preparation Feather can
  // still cast this one and have it stick.
  if (game.pc.feather === 100) {
    msgAlreadyInEffect(game);
    return false;
  }
  game.pc.feather = 100;
  computeWeight(game);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), permanent level 10 slot 1: Permanent
 * Invisibility. Nothing is printed and no weight is worked out.
 */
export function permanentInvisibility(game: Game): boolean {
  if (game.pc.invisible === 100) {
    msgAlreadyInEffect(game);
    return false;
  }
  game.pc.invisible = 100;
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), permanent level 10 slot 2: Youth, which
 * makes the character 20 again at the price of a tenth of their experience.
 */
export function youth(game: Game): boolean {
  // The original writes the two halves of the 32-bit age separately, the high word first, which
  // comes to the same thing as storing 20.
  game.pc.age = 20;
  // The multiplier is the double at DS:3dc0, which is 0.9 to the bit.
  game.pc.exp = 0.9 * game.pc.exp;
  // give_hint (exe 2000:313a) prints hint 107 out of UH.BIN and mgetch_message (exe 4000:418d)
  // waits for a key. The port has no hint file; see the README's second departure.
  game.events.push({ kind: 'hintShown', hint: 107 });
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), the permanent list: case 0 of the outer
 * switch. `levelIndex` is 0..9 and `slot` is 0..2, as the game passes them.
 *
 * Casting a permanent spell from memory takes its level off the character's maximum spell
 * points for good. That is not in here: cast_a_spell (exe 2000:e017) does it after this
 * function reports success, and only for a spell cast from memory rather than off a scroll,
 * a wand or a paper.
 *
 * The inner switch has no breaks between its cases, as the battle lists have none, so a slot
 * outside 0..2 falls through the ten of them and on into the preparation list; this returns
 * false instead.
 */
export function permanentList(game: Game, levelIndex: number, slot: number): boolean {
  switch (levelIndex) {
    case 0:
      if (slot === 0) return enchantWeaponPerm(game, 1);
      if (slot === 1) return extraHealthPoints(game, 1);
      if (slot === 2) return writeScrollOrWand(game, 3, 1);
      break;
    case 1:
      if (slot === 0) return enchantArmorPerm(game, 1);
      if (slot === 1) return extraHealthPoints(game, 3);
      if (slot === 2) return writeScrollOrWand(game, 3, 2);
      break;
    case 2:
      if (slot === 0) return enchantWeaponPerm(game, 2);
      if (slot === 1) return extraHealthPoints(game, 5);
      if (slot === 2) return setProtRing(game, 1);
      break;
    case 3:
      if (slot === 0) return enchantArmorPerm(game, 2);
      if (slot === 1) return setAntiMagicRing(game, 1);
      if (slot === 2) return writeScrollOrWand(game, 10, 1);
      break;
    case 4:
      if (slot === 0) return enchantWeaponPerm(game, 3);
      if (slot === 1) return setProtRing(game, 2);
      if (slot === 2) return setBodyArmor(game, 1);
      break;
    case 5:
      if (slot === 0) return enchantArmorPerm(game, 3);
      if (slot === 1) return setAntiMagicRing(game, 2);
      if (slot === 2) return writeScrollOrWand(game, 8, 2);
      break;
    case 6:
      if (slot === 0) return setProtRing(game, 3);
      if (slot === 1) return setAntiMagicRing(game, 3);
      if (slot === 2) return setBodyArmor(game, 2);
      break;
    case 7:
      if (slot === 0) return enchantWeaponPerm(game, 4);
      if (slot === 1) return enchantArmorPerm(game, 4);
      if (slot === 2) return writeScrollOrWand(game, 10, 2);
      break;
    case 8:
      if (slot === 0) return permanentFeather(game);
      // The Anti-Magic Ring goes 1, 2, 3 and then straight to 5; there is no level 4 of it
      // anywhere in the list.
      if (slot === 1) return setAntiMagicRing(game, 5);
      if (slot === 2) return extraHealthPoints(game, 25);
      break;
    case 9:
      if (slot === 0) return permanentInvisibility(game);
      if (slot === 1) return youth(game);
      // Body Armor goes 1, 2 and then straight to 4.
      if (slot === 2) return setBodyArmor(game, 4);
      break;
  }
  return false;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 1 slot 3: Little Cure,
 * half the caster's wisdom, the same amount the priests' Fast Cure heals.
 */
export function littleCure(game: Game): boolean {
  game.pc.hp += Math.trunc(game.pc.wis / 2);
  if (game.pc.hp > game.pc.maxHp) game.pc.hp = game.pc.maxHp;
  msgYouFeelGood(game);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 2 slot 3: Detect Level,
 * which prints the floor number and nothing else.
 */
export function detectLevel(game: Game): boolean {
  // DS:3dc8 with the floor written on the end of it
  game.say(`YOU ARE ON LEVEL: ${game.pc.level}`);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 3 slot 1: Cure, twice a
 * roll on the caster's wisdom plus 20, and never more than 60.
 */
export function cure(game: Game): boolean {
  // Ghidra dropped the argument to Random; the instruction at 3000:e60a pushes the wisdom.
  let healed = game.rng.random(game.pc.wis) * 2 + 20;
  if (healed > 60) healed = 60;
  game.pc.hp += healed;
  if (game.pc.hp > game.pc.maxHp) game.pc.hp = game.pc.maxHp;
  msgYouFeelGood(game);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 3 slot 3: Strength, +5
 * STR until the character rests at an inn. The battle lists have a Strength of their own, which
 * gives +7 for 60 moves and is {@link strength}.
 */
export function prepStrength(game: Game): boolean {
  // The refusal tests for exactly 5 rather than for anything non-zero.
  if (game.pc.prepStrength === 5) {
    msgAlreadyCastThisSpell(game);
    return false;
  }
  game.pc.prepStrength = 5;
  game.pc.str += 5;
  msgYouFeelVeryGood(game);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 4 slot 2: Agility, +5
 * AGI until the character rests.
 */
export function prepAgility(game: Game): boolean {
  if (game.pc.prepAgility === 5) {
    msgAlreadyCastThisSpell(game);
    return false;
  }
  game.pc.prepAgility = 5;
  game.pc.dex += 5;
  msgYouFeelVeryGood(game);
  return true;
}

/**
 * The refusal Ascend, Double Ascend and Major Ascend print when the character is deeper than
 * floor 65. The message says 64; the test is `65 < floor`, so floor 65 still works.
 */
function msgDoesNotWorkBelowLevel64(game: Game): void {
  // DS:3ddb 3e01 3e18 258b 2b3a
  game.say('THAT SPELL DOES NOT', "  WORK BELOW THE 64'TH", '  LEVEL.', '', 'HIT ANY KEY...');
}

/** The refusal the same three print in the town, which is floor 0. */
function msgCannotFloatAboveTheTown(game: Game): void {
  // DS:3e21 3e37 3e50 258b 2b3a
  game.say(
    'THIS SPELL CAN NOT BE',
    '  USED TO MAKE YOU FLOAT',
    '  ABOVE THE TOWN.',
    '',
    'HIT ANY KEY...',
  );
}

/**
 * The lines the five floor-changing spells repeat: move to `level` and land on a random square
 * of it that is not rock.
 *
 * Relocate looks at the occupancy map and will not land on a monster; this does not look at it
 * at all, because load_level_map lays the new floor's monsters out afterwards. That read is the
 * one the port records rather than performs — see the README's second departure.
 */
function changeFloorTo(game: Game, level: number): void {
  const from = game.pc.level;
  game.pc.level = level;
  do {
    game.pc.x = game.rng.random(game.columns);
    game.pc.y = game.rng.random(game.rows);
  } while (game.solid(game.pc.x, game.pc.y, game.pc.level, game.pc.module));
  game.events.push({ kind: 'levelChanged', from, to: level });
  game.recenterMap = true;
}

/**
 * The deepest floor of the module the character is in. The original indexes the table at
 * DS:0493 with DS:022d, the copy of the module the floor loader takes, which always holds what
 * the character record holds.
 */
function bottomOfModule(game: Game): number {
  return game.bottomLevel[game.pc.module];
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 4 slot 3: Descend, one
 * floor down.
 */
export function descend(game: Game): boolean {
  if (game.pc.level >= bottomOfModule(game)) {
    // DS:3ddb 3def 258b 2b3a
    game.say('THAT SPELL DOES NOT', '  WORK THIS DEEP.', '', 'HIT ANY KEY...');
    return false;
  }
  changeFloorTo(game, game.pc.level + 1);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 5 slot 1: Ascend, one
 * floor up.
 */
export function ascend(game: Game): boolean {
  if (game.pc.level > 65) {
    msgDoesNotWorkBelowLevel64(game);
    return false;
  }
  if (game.pc.level <= 0) {
    msgCannotFloatAboveTheTown(game);
    return false;
  }
  changeFloorTo(game, game.pc.level - 1);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 5 slot 2: Detect
 * Position, which prints the floor and the coordinates.
 *
 * The game shows these through mset_gmenu (exe 2000:2b08) rather than print_menu_only, so the
 * eight lines are drawn as a menu that takes any key; the port prints them the same way it
 * prints everything else.
 */
export function detectPosition(game: Game): boolean {
  // DS:3dc8 with the floor on the end, 3e62, 3e7b with the x on the end and 3e86 with the y
  game.say(
    `YOU ARE ON LEVEL: ${game.pc.level}`,
    'YOUR X AND Y COORDINATES',
    `   ARE: X-${game.pc.x} Y-${game.pc.y}`,
  );
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 5 slot 3: Feather, which
 * takes the character's own weight out of what they carry until they rest.
 */
export function feather(game: Game): boolean {
  if (game.pc.feather !== 0) {
    msgAlreadyInEffect(game);
    return false;
  }
  game.pc.feather = 1;
  computeWeight(game);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 6 slot 1: Big Cure, a
 * roll on four times the caster's wisdom plus 50, and never more than 150.
 */
export function bigCure(game: Game): boolean {
  // Ghidra dropped the argument to Random; the instructions at 3000:e96e shift the wisdom left
  // twice before pushing it.
  let healed = game.rng.random(game.pc.wis * 4) + 50;
  if (healed > 150) healed = 150;
  game.pc.hp += healed;
  if (game.pc.hp > game.pc.maxHp) game.pc.hp = game.pc.maxHp;
  msgYouFeelVeryGood(game);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 6 slot 2: Double Ascend,
 * two floors up, or one from floor 1.
 */
export function doubleAscend(game: Game): boolean {
  if (game.pc.level > 65) {
    msgDoesNotWorkBelowLevel64(game);
    return false;
  }
  if (game.pc.level <= 0) {
    msgCannotFloatAboveTheTown(game);
    return false;
  }
  changeFloorTo(game, game.pc.level < 2 ? game.pc.level - 1 : game.pc.level - 2);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 7 slot 1: Invisibility,
 * which writes 1 where the permanent spell writes 100 and prints nothing.
 */
export function invisibility(game: Game): boolean {
  if (game.pc.invisible !== 0) {
    msgAlreadyInEffect(game);
    return false;
  }
  game.pc.invisible = 1;
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 7 slot 3: Fast Move.
 * It prints nothing either.
 */
export function fastMove(game: Game): boolean {
  if (game.pc.fastMove !== 0) {
    msgAlreadyInEffect(game);
    return false;
  }
  game.pc.fastMove = 1;
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 8 slot 1: Super
 * Strength, +10 STR until the character rests. It stacks with the +5 of {@link prepStrength},
 * which is a separate field.
 */
export function superStrength(game: Game): boolean {
  if (game.pc.superStrength === 10) {
    msgAlreadyCastThisSpell(game);
    return false;
  }
  game.pc.superStrength = 10;
  game.pc.str += 10;
  msgYouFeelVeryGood(game);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 8 slot 3: Major Descend,
 * ten floors down, or as far as the bottom of the module.
 */
export function majorDescend(game: Game): boolean {
  // The test lets the spell through on the bottom floor itself, where the cap then leaves the
  // floor where it was: it still lands the character somewhere else on the same floor.
  if (game.pc.level > bottomOfModule(game)) {
    // DS:3e8a 3ea3 258b 258b 2b3a
    game.say('THAT SPELL DOES NOT WORK', '  THIS DEEP.', '', '', 'HIT ANY KEY...');
    return false;
  }
  changeFloorTo(game, Math.min(game.pc.level + 10, bottomOfModule(game)));
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 9 slot 1: Super Agility,
 * +10 AGI until the character rests.
 */
export function superAgility(game: Game): boolean {
  if (game.pc.superAgility === 10) {
    msgAlreadyCastThisSpell(game);
    return false;
  }
  game.pc.superAgility = 10;
  game.pc.dex += 10;
  msgYouFeelVeryGood(game);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 9 slot 2: Cure Poison,
 * which puts the countdown at -1. It prints nothing and never refuses, so it can be cast on a
 * character who was never poisoned.
 */
export function curePoison(game: Game): boolean {
  game.pc.poison = -1;
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 9 slot 3: Heal All
 * Wounds, every hit point back and nothing printed.
 */
export function healAllWounds(game: Game): boolean {
  game.pc.hp = game.pc.maxHp;
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 10 slot 1: Major Ascend,
 * ten floors up, or as far as the town.
 */
export function majorAscend(game: Game): boolean {
  if (game.pc.level > 65) {
    msgDoesNotWorkBelowLevel64(game);
    return false;
  }
  if (game.pc.level <= 0) {
    msgCannotFloatAboveTheTown(game);
    return false;
  }
  changeFloorTo(game, Math.max(game.pc.level - 10, 0));
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), preparation level 10 slot 2: Cure Disease,
 * the same thing for the disease countdown.
 */
export function cureDisease(game: Game): boolean {
  game.pc.disease = -1;
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), the preparation list: case 1 of the outer
 * switch. `levelIndex` is 0..9 and `slot` is 0..2, as the game passes them.
 *
 * The inner switch has no breaks, so a slot outside 0..2 falls through the ten cases and on into
 * the wizard battle list; this returns false instead.
 */
export function preparationList(game: Game, levelIndex: number, slot: number): boolean {
  switch (levelIndex) {
    case 0:
      if (slot === 0) return setTempArmorPlus(game, 1);
      if (slot === 1) return setTempWeaponPlus(game, 1);
      if (slot === 2) return littleCure(game);
      break;
    case 1:
      if (slot === 0) return setTempWeaponPlus(game, 2);
      // The switch throws away what Relocate reports and calls the spell cast either way, as
      // both battle lists do.
      if (slot === 1) {
        relocateSpell(game);
        return true;
      }
      if (slot === 2) return detectLevel(game);
      break;
    case 2:
      if (slot === 0) return cure(game);
      if (slot === 1) return setTempArmorPlus(game, 2);
      if (slot === 2) return prepStrength(game);
      break;
    case 3:
      if (slot === 0) return setTempWeaponPlus(game, 3);
      if (slot === 1) return prepAgility(game);
      if (slot === 2) return descend(game);
      break;
    case 4:
      if (slot === 0) return ascend(game);
      if (slot === 1) return detectPosition(game);
      if (slot === 2) return feather(game);
      break;
    case 5:
      if (slot === 0) return bigCure(game);
      if (slot === 1) return doubleAscend(game);
      if (slot === 2) return setTempWeaponPlus(game, 4);
      break;
    case 6:
      if (slot === 0) return invisibility(game);
      if (slot === 1) return setTempArmorPlus(game, 3);
      if (slot === 2) return fastMove(game);
      break;
    case 7:
      if (slot === 0) return superStrength(game);
      if (slot === 1) return setTempWeaponPlus(game, 5);
      if (slot === 2) return majorDescend(game);
      break;
    case 8:
      if (slot === 0) return superAgility(game);
      if (slot === 1) return curePoison(game);
      if (slot === 2) return healAllWounds(game);
      break;
    case 9:
      if (slot === 0) return majorAscend(game);
      if (slot === 1) return cureDisease(game);
      if (slot === 2) return setTempArmorPlus(game, 4);
      break;
  }
  return false;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), wizard battle level 1 slot 2: Magic Zap.
 */
export function magicZap(game: Game): boolean {
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  const damage = game.pc.lev * 2 + 2;
  damageTheMonster(game, damage);
  // DS:3ec4 3edc 3eb0 3ef7
  game.say(
    'WISPS OF COLORFUL LIGHT',
    '   GATHER TOGETHER AND ZAP',
    `   THE MONSTER FOR ${damage}`,
    '   POINTS OF DAMAGE!',
  );
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), wizard battle level 2 slot 1 and priest
 * battle level 3 slot 3: Slow Enemies.
 */
export function slowEnemies(game: Game): boolean {
  // Every other timer of this kind is added to; this one is set, so re-casting it early throws
  // away whatever was left.
  game.pc.slowEnemiesTimer = 60;
  // DS:3f0c 3f22 3f3b 258b 2d43
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
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), wizard battle level 2 slot 3: Minor Shock.
 */
export function minorShock(game: Game): boolean {
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  damageTheMonster(game, 25);
  // DS:3f4a 3f60 3f79 3f90 3faa 258b 2d43
  game.say(
    'YOU TOUCH THE MONSTER',
    '   AND ELECTRICITY FLOWS',
    '   THROUGH YOUR HANDS,',
    '   SHOCKING YOUR OPPONENT',
    '   FOR 25 POINTS OF DAMAGE.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), wizard battle level 3 slot 1: Lightning
 * Bolt.
 */
export function lightningBolt(game: Game): boolean {
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  const damage = game.pc.lev * 4 + 4;
  damageTheMonster(game, damage);
  // DS:3fc6 3fe0 3ff9 3eb0 3916 258b 2d43
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

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), wizard battle level 3 slot 2: Magic
 * Missile.
 */
export function magicMissile(game: Game): boolean {
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  damageTheMonster(game, 50);
  // DS:4013 402a 4044 3916 258b 2d43
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

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), wizard battle level 6 slot 1 and priest
 * battle level 8 slot 3: Magic Zot, one missile per character level plus one.
 */
export function magicZot(game: Game): boolean {
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  let damage = 0;
  // Ghidra lost the argument to Random here; that it is 5, making each missile 4 to 8, is what
  // the RE notes and dotu-mech.js's magicZot range say.
  for (let i = 0; i < game.pc.lev + 1; i++) damage += game.rng.random(5) + 4;
  damageTheMonster(game, damage);
  // DS:4071 408b 40a9 40c5 405e 3916 258b 2d43
  game.say(
    'A GROUP OF MISSLES SPRING',
    '   FORTH FROM YOUR FINGERTIPS',
    '   AND PLUNGE DIRECTLY INTO',
    "   THE ENEMY'S BODY.",
    `   THE MISSLES DO ${damage}`,
    '   POINTS OF DAMAGE.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), wizard battle level 6 slot 2 and priest
 * battle level 7 slot 3: Shock.
 */
export function shock(game: Game): boolean {
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  damageTheMonster(game, 125);
  // DS:3f4a 3f60 3f79 3f90 40da 258b 2d43
  game.say(
    'YOU TOUCH THE MONSTER',
    '   AND ELECTRICITY FLOWS',
    '   THROUGH YOUR HANDS,',
    '   SHOCKING YOUR OPPONENT',
    '   FOR 125 POINTS OF DAMAGE.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), wizard battle level 8 slot 1: Magic Bolt,
 * Magic Zot's missiles with three more points each.
 */
export function magicBolt(game: Game): boolean {
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  let damage = 0;
  // The argument to Random is the same 5 the RE notes and dotu-mech.js give Magic Zot, which
  // makes each charge 7 to 11.
  for (let i = 0; i < game.pc.lev + 1; i++) damage += game.rng.random(5) + 7;
  damageTheMonster(game, damage);
  // DS:410b 408b 4124 4142 40f7 3916 258b 2d43
  game.say(
    'AN ELECTRIC CHARGE LEAPS',
    '   FORTH FROM YOUR FINGERTIPS',
    '   INTO THE BODY OF THE ENEMY',
    '   MONSTER.',
    `   THE CHARGE DOES ${damage}`,
    '   POINTS OF DAMAGE.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), wizard battle level 9 slot 1 and priest
 * battle level 7 slot 1: Hold Monster, 15 moves.
 */
export function holdMonster(game: Game): boolean {
  // This is the one place that asks about the boss before it asks whether anything is engaged,
  // so with no monster in front of you the original reads the bytes in front of the monster
  // table to decide.
  if (bossImmuneCheck(game)) return false;
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  // DS:414e
  game.monsterStatusLine = 'MONSTER IS HELD';
  game.pc.holdMonsterTimer = 15;
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), wizard battle level 9 slot 3 and priest
 * battle level 10 slot 3: Major Shock.
 */
export function majorShock(game: Game): boolean {
  if (game.engaged === -1) {
    msgNoMonster(game);
    return false;
  }
  damageTheMonster(game, 300);
  // DS:3f4a 3f60 3f79 3f90 415e 258b 2d43
  game.say(
    'YOU TOUCH THE MONSTER',
    '   AND ELECTRICITY FLOWS',
    '   THROUGH YOUR HANDS,',
    '   SHOCKING YOUR OPPONENT',
    '   FOR 300 POINTS OF DAMAGE.',
    '',
    'HIT ANY KEY',
  );
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), the wizard battle list: case 2 of the
 * outer switch, on the spell's level and then its slot. `levelIndex` is 0..9 and `slot` is 0..2,
 * as the game passes them.
 *
 * The original's inner switch has no breaks between its cases, so a slot outside 0..2 falls
 * through all ten of them and hands back whatever was in the register; nothing calls it that
 * way, and this returns false instead.
 */
export function wizardBattle(game: Game, levelIndex: number, slot: number): boolean {
  switch (levelIndex) {
    case 0:
      if (slot === 0) return sleepMonster(game);
      if (slot === 1) return magicZap(game);
      if (slot === 2) return protection(game, 1);
      break;
    case 1:
      if (slot === 0) return slowEnemies(game);
      if (slot === 1) return strength(game);
      if (slot === 2) return minorShock(game);
      break;
    case 2:
      if (slot === 0) return lightningBolt(game);
      if (slot === 1) return magicMissile(game);
      if (slot === 2) return speed(game);
      break;
    case 3:
      // The switch throws away what these two report and calls the spell cast either way.
      if (slot === 0) {
        goAway(game);
        return true;
      }
      if (slot === 1) {
        relocateSpell(game);
        return true;
      }
      if (slot === 2) return powerWeapon(game, 1);
      break;
    case 4:
      if (slot === 0) return explosion(game, 0);
      if (slot === 1) return protection(game, 2);
      if (slot === 2) return resistPoison(game);
      break;
    case 5:
      if (slot === 0) return magicZot(game);
      if (slot === 1) return shock(game);
      if (slot === 2) return antiCold(game);
      break;
    case 6:
      if (slot === 0) return explosion(game, 1);
      if (slot === 1) return passWall(game, game.chooseDirection());
      if (slot === 2) return antiFire(game);
      break;
    case 7:
      if (slot === 0) return magicBolt(game);
      if (slot === 1) return resistDrain(game);
      if (slot === 2) return powerWeapon(game, 2);
      break;
    case 8:
      if (slot === 0) return holdMonster(game);
      if (slot === 1) return drainMonster(game);
      if (slot === 2) return majorShock(game);
      break;
    case 9:
      if (slot === 0) return explosion(game, 2);
      if (slot === 1) return autokill(game);
      if (slot === 2) return powerWeapon(game, 3);
      break;
  }
  return false;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), priest battle level 2 slot 3: Fast Cure,
 * half the caster's wisdom with no roll in it at all.
 */
export function fastCure(game: Game): boolean {
  game.pc.hp += Math.trunc(game.pc.wis / 2);
  if (game.pc.hp > game.pc.maxHp) game.pc.hp = game.pc.maxHp;
  msgYouFeelGood(game);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), priest battle level 6 slot 3: Fast Big
 * Cure, 20 points plus a roll, and never more than 90.
 */
export function fastBigCure(game: Game): boolean {
  // Ghidra lost the argument to Random; four times wisdom is what the RE notes give, which with
  // the 20 the decompilation does show makes this heal 20 to 90.
  let healed = game.rng.random(4 * game.pc.wis) + 20;
  if (healed > 90) healed = 90;
  game.pc.hp += healed;
  if (game.pc.hp > game.pc.maxHp) game.pc.hp = game.pc.maxHp;
  msgYouFeelVeryGood(game);
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), priest battle level 10 slot 2: Fast Heal,
 * every hit point back. It prints nothing.
 */
export function fastHeal(game: Game): boolean {
  game.pc.hp = game.pc.maxHp;
  return true;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"), the priest battle list: case 3 of the
 * outer switch. `levelIndex` is 0..9 and `slot` is 0..2, as the game passes them.
 *
 * Ghidra could not tell case 3 from case 2 — the jump table left both bodies under one label —
 * so this is the second of the two switches at unf.c line 25516, the one whose first case calls
 * sleep_monster, protection and strength.
 */
export function priestBattle(game: Game, levelIndex: number, slot: number): boolean {
  switch (levelIndex) {
    case 0:
      if (slot === 0) return sleepMonster(game);
      if (slot === 1) return protection(game, 1);
      if (slot === 2) return strength(game);
      break;
    case 1:
      if (slot === 0) return resistPoison(game);
      if (slot === 1) return speed(game);
      if (slot === 2) return fastCure(game);
      break;
    case 2:
      if (slot === 0) return resistDisease(game);
      if (slot === 1) {
        relocateSpell(game);
        return true;
      }
      if (slot === 2) return slowEnemies(game);
      break;
    case 3:
      if (slot === 0) return antiCold(game);
      if (slot === 1) {
        goAway(game);
        return true;
      }
      if (slot === 2) return powerWeapon(game, 1);
      break;
    case 4:
      // The priest's Protection asks for level 1, the same as the Minor Protection two lines
      // up, so it takes 2 off a monster's roll where the wizard's takes 8. It looks unintended:
      // the priest goes from 2 straight to Major Protection's 18.
      if (slot === 0) return protection(game, 1);
      if (slot === 1) return antiFire(game);
      if (slot === 2) return passWall(game, game.chooseDirection());
      break;
    case 5:
      if (slot === 0) return resistDrain(game);
      if (slot === 1) return drainMonster(game);
      if (slot === 2) return fastBigCure(game);
      break;
    case 6:
      if (slot === 0) return holdMonster(game);
      if (slot === 1) return powerWeapon(game, 2);
      if (slot === 2) return shock(game);
      break;
    case 7:
      if (slot === 0) return protection(game, 3);
      if (slot === 1) return explosion(game, 1);
      if (slot === 2) return magicZot(game);
      break;
    case 8:
      if (slot === 0) return autokill(game);
      if (slot === 1) return powerWeapon(game, 3);
      if (slot === 2) return strengthAndSpeed(game);
      break;
    case 9:
      if (slot === 0) return protection(game, 4);
      if (slot === 1) return fastHeal(game);
      if (slot === 2) return majorShock(game);
      break;
  }
  return false;
}

/**
 * spell_effect (exe 3000:e1b8, unf.c "spell_effect"): cast one spell. `type` is 0 permanent,
 * 1 preparation, 2 wizard battle, 3 priest battle; `levelIndex` is 0..9 for the spell's level
 * and `slot` is 0..2 for its place on that line.
 *
 * The original is one function, a switch on the type around a switch on the level around tests
 * on the slot. The port splits the four lists into permanentList, preparationList, wizardBattle
 * and priestBattle, which are the same four switches, so that a spell's own code can be shown
 * on its own.
 */
export function spellEffect(game: Game, type: number, levelIndex: number, slot: number): boolean {
  if (type === 0) return permanentList(game, levelIndex, slot);
  if (type === 1) return preparationList(game, levelIndex, slot);
  if (type === 2) return wizardBattle(game, levelIndex, slot);
  if (type === 3) return priestBattle(game, levelIndex, slot);
  return false;
}
