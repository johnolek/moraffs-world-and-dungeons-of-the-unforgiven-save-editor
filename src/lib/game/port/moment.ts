import { callCheckEng, moveSeconds } from './combat';
import { showHint } from './drops';
import { clearMenuBlock, clearMessageLine } from './screens';
import type { Game } from './state';
import { MAP_EMPTY, MAP_PLAYER, monsterAt, setMonsterMap } from './state';

/**
 * The hints the game shows when a disease or a poison bites. The decompilation dropped the
 * number each `give_hint` call is given; these two are UH.BIN's messages about permanently
 * losing a point of constitution to a disease and a point of strength to a poison, in the order
 * pass_moment makes the two calls.
 */
const DISEASE_HINT = 27;
const POISON_HINT = 28;

/** How long a disease or a poison waits before it bites again, which is also how long a fresh
 *  one waits for the first time. */
const AILMENT_MOVES = 450;

/**
 * tick_spell_timers (exe 2000:a1b7, unf.c "tick_spell_timers"): take `moments` off every one of
 * the character's battle-spell timers and undo the effect of any that run out.
 *
 * Strength and Speed hand their seven points back when their timer reaches zero; Power Weapon
 * and Protection clear the level standing beside the timer, which is what makes a level left
 * over a timer that was never counted down stay until a night at the inn. Sleep and Hold
 * Monster wipe the line printed beside the monster.
 *
 * pass_moment passes one moment. The original counts every timer down by the same number, so a
 * caller with more than one moment to spend takes them off all at once rather than one at a
 * time — nothing in the game does.
 */
export function tickSpellTimers(game: Game, moments: number): void {
  const pc = game.pc;
  if (pc.slowEnemiesTimer > 0) {
    pc.slowEnemiesTimer -= moments;
    if (pc.slowEnemiesTimer < 0) pc.slowEnemiesTimer = 0;
  }
  if (pc.strengthTimer > 0) {
    if (moments < pc.strengthTimer) pc.strengthTimer -= moments;
    else {
      pc.strengthTimer = 0;
      pc.str -= 7;
    }
  }
  if (pc.speedTimer > 0) {
    if (moments < pc.speedTimer) pc.speedTimer -= moments;
    else {
      pc.speedTimer = 0;
      pc.dex -= 7;
    }
  }
  if (pc.powerWeaponTime > 0) {
    pc.powerWeaponTime -= moments;
    if (pc.powerWeaponTime < 1) {
      pc.powerWeapon = 0;
      pc.powerWeaponTime = 0;
    }
  }
  if (pc.protectionTime > 0) {
    pc.protectionTime -= moments;
    if (pc.protectionTime < 1) {
      pc.protection = 0;
      pc.protectionTime = 0;
    }
  }
  if (pc.antiFireTimer > 0) {
    pc.antiFireTimer -= moments;
    if (pc.antiFireTimer < 0) pc.antiFireTimer = 0;
  }
  if (pc.antiColdTimer > 0) {
    pc.antiColdTimer -= moments;
    if (pc.antiColdTimer < 0) pc.antiColdTimer = 0;
  }
  if (pc.resistDrainTimer > 0) {
    pc.resistDrainTimer -= moments;
    if (pc.resistDrainTimer < 0) pc.resistDrainTimer = 0;
  }
  if (pc.resistPoisonTimer > 0) {
    pc.resistPoisonTimer -= moments;
    if (pc.resistPoisonTimer < 0) pc.resistPoisonTimer = 0;
  }
  if (pc.resistDiseaseTimer > 0) {
    pc.resistDiseaseTimer -= moments;
    if (pc.resistDiseaseTimer < 0) pc.resistDiseaseTimer = 0;
  }
  if (pc.sleepTimer > 0) {
    if (moments < pc.sleepTimer) pc.sleepTimer -= moments;
    else {
      pc.sleepTimer = 0;
      game.monsterStatusLine = '';
    }
  }
  if (pc.holdMonsterTimer > 0) {
    if (moments < pc.holdMonsterTimer) pc.holdMonsterTimer -= moments;
    else {
      pc.holdMonsterTimer = 0;
      game.monsterStatusLine = '';
    }
  }
}

/**
 * pass_moment (exe 2000:a53c, unf.c "pass_moment"): one moment of the game — the spell timers,
 * the disease and the poison, and every monster's step.
 *
 * Two spells can end the moment before the monsters have moved. Fast Move skips one moment in
 * four, and so does Invisibility, and only the preparation versions do: both tests are against
 * 1 exactly, and the permanent spells write 100.
 *
 * A monster moves when it is within `floor / 10 + 10` squares of the character, counting the two
 * axes separately, and stays put one moment in five. It tries west or east first and only then
 * north or south, so a monster coming at you diagonally arrives along the x axis; it walks
 * through doors and secret doors, since anything but a wall lets it by, and never onto a square
 * something is already standing on.
 *
 * A monster too far away to move has its attack timer pushed back up to 1 if it had gone
 * negative, which is what stops a monster the character has walked away from banking a run of
 * attacks for when they come back.
 */
export function passMoment(game: Game): void {
  const pc = game.pc;
  tickSpellTimers(game, 1);
  if (pc.fastMove === 1 && game.rng.random(4) === 1) return;
  if (pc.disease > 0 && pc.resistDiseaseTimer < 1) {
    pc.disease -= 1;
    if (pc.disease === 1) {
      pc.disease = AILMENT_MOVES;
      pc.con -= 1;
      if (pc.con < 2) pc.con = 1;
      game.events.push({ kind: 'playerSaved' });
      showHint(game, DISEASE_HINT);
      game.pressAnyKey();
    }
  }
  if (pc.poison > 0 && pc.resistPoisonTimer < 1) {
    pc.poison -= 1;
    if (pc.poison === 1) {
      pc.poison = AILMENT_MOVES;
      pc.str -= 1;
      if (pc.str < 2) pc.str = 1;
      game.events.push({ kind: 'playerSaved' });
      showHint(game, POISON_HINT);
      game.pressAnyKey();
    }
  }
  if (pc.invisible === 1 && game.rng.random(4) === 1) return;
  for (let slot = 0; slot < game.monsters.length; slot++) {
    // Slow Enemies gives a third of the character's agility back to a monster's attack timer one
    // moment in four, on top of what call_check_eng gives it.
    if (pc.slowEnemiesTimer > 0 && game.rng.random(4) === 0) {
      game.monsterTimers[slot] += Math.trunc(pc.dex / 3);
    }
    if (game.rng.random(5) === 1) continue;
    const monster = game.monsters[slot];
    const dx = pc.x - monster.x;
    const dy = pc.y - monster.y;
    if (Math.abs(dx) + Math.abs(dy) >= Math.trunc(pc.level / 10) + 10) {
      if (game.monsterTimers[slot] < 0) game.monsterTimers[slot] = 1;
      continue;
    }
    game.monsterTimers[slot] = 0;
    setMonsterMap(game, monster.x, monster.y, MAP_EMPTY);
    const west = dx < 0 && game.retdwall(monster.x, monster.y, 0, pc.level, pc.module) !== 0 && monsterAt(game, monster.x - 1, monster.y) === -1;
    const east = dx > 0 && game.retdwall(monster.x + 1, monster.y, 0, pc.level, pc.module) !== 0 && monsterAt(game, monster.x + 1, monster.y) === -1;
    if (west) monster.x -= 1;
    else if (east) monster.x += 1;
    else if (dy < 0 && game.retdwall(monster.x, monster.y, 1, pc.level, pc.module) !== 0 && monsterAt(game, monster.x, monster.y - 1) === -1) {
      monster.y -= 1;
    } else if (dy > 0 && game.retdwall(monster.x, monster.y + 1, 1, pc.level, pc.module) !== 0 && monsterAt(game, monster.x, monster.y + 1) === -1) {
      monster.y += 1;
    }
    setMonsterMap(game, monster.x, monster.y, slot);
  }
}

/**
 * FUN_2000_bcb6 (exe 2000:bcb6, unf.c "FUN_2000_bcb6"): take the character off the square they
 * are standing on, which movecontrol does before it moves them. The original also makes a noise.
 *
 * Every step wipes one of two things on the way off: the eight lines of the box when it was
 * flagged to go with the step (DS:2519 — a trap door's, EXP NEEDED's, a kill's, a fight's), and
 * otherwise the strip above the box, where a wall's refusal and a jammed door's line stand. That
 * is why those boxes and lines are gone the moment the character walks off.
 */
export function leaveSquare(game: Game): void {
  if (game.boxLeavesWithSquare) {
    game.boxLeavesWithSquare = false;
    clearMenuBlock(game);
  } else {
    clearMessageLine(game);
  }
  setMonsterMap(game, game.pc.x, game.pc.y, MAP_EMPTY);
}

/**
 * FUN_2000_bce5 (exe 2000:bce5, unf.c "FUN_2000_bce5"): put the character on the square they
 * have arrived at and let the moment that step cost go by.
 *
 * Every Ring of Regeneration is a hit point back, whether the character walked or stood still.
 * Only half the steps cost time — the roll is a plain coin — and the ones that do give every
 * monster standing next to the character whatever attacks a step's worth of seconds buys it.
 * The moment itself passes either way.
 */
export function arriveSquare(game: Game): void {
  setMonsterMap(game, game.pc.x, game.pc.y, MAP_PLAYER);
  game.pc.hp += game.pc.regenRings;
  if (game.rng.random(2) !== 0) callCheckEng(game, moveSeconds(game));
  passMoment(game);
}

/**
 * FUN_2000_aa26 (exe 2000:aa26, unf.c "FUN_2000_aa26"): every battle spell ends at once, which
 * is what a night at the inn and a hole dug through the floor both do.
 *
 * Strength and Speed hand their seven points back the way they would have when their timers ran
 * out. Power Weapon and Protection lose both their level and their timer here, which is the one
 * place a level left standing over a spent timer is cleared.
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
