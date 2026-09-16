/**
 * Which function of magic.ts each of the game's 120 spells runs.
 *
 * spell_effect is a switch on the spell's type around a switch on its level around tests on its
 * slot, and the port keeps that shape in permanentList, preparationList, wizardBattle and
 * priestBattle. This table records what each of those cases calls and with what, so the spell
 * book can show a spell's own code without running anything.
 */

/**
 * The functions of magic.ts that each spell function calls itself, in the order it calls them.
 * The message functions are the refusals and the "you feel good" lines; the rest are the pieces
 * several spells share.
 */
const HELPERS = {
  enchantWeaponPerm: [],
  enchantArmorPerm: [],
  setTempArmorPlus: ['msgAlreadyInEffect'],
  setTempWeaponPlus: ['msgAlreadyInEffect'],
  setBodyArmor: ['msgAlreadyInEffect'],
  setProtRing: ['msgAlreadyInEffect'],
  setAntiMagicRing: ['msgAlreadyInEffect'],
  writeScrollOrWand: [],
  explosion: ['msgNoMonster'],
  sleepMonster: ['msgNoMonster', 'msgAlreadyInEffect'],
  strength: ['msgYouFeelVeryGood', 'msgAlreadyCastThisSpell'],
  speed: ['msgYouFeelVeryGood', 'msgAlreadyCastThisSpell'],
  strengthAndSpeed: ['msgAlreadyCastThisSpell', 'msgYouFeelVeryGood'],
  relocateSpell: ['relocate'],
  goAway: ['msgNoMonster', 'bossImmuneCheck'],
  autokill: ['msgNoMonster', 'bossImmuneCheck'],
  powerWeapon: ['msgAlreadyInEffect', 'msgSixtyMovesLonger'],
  protection: ['msgAlreadyInEffect', 'msgSixtyMovesLonger'],
  resistPoison: [],
  resistDisease: [],
  antiCold: [],
  antiFire: [],
  resistDrain: [],
  drainMonster: ['msgNoMonster', 'bossImmuneCheck'],
  passWall: [],
  extraHealthPoints: [],
  permanentFeather: ['msgAlreadyInEffect', 'computeWeight'],
  permanentInvisibility: ['msgAlreadyInEffect'],
  youth: [],
  littleCure: ['msgYouFeelGood'],
  detectLevel: [],
  cure: ['msgYouFeelGood'],
  prepStrength: ['msgAlreadyCastThisSpell', 'msgYouFeelVeryGood'],
  prepAgility: ['msgAlreadyCastThisSpell', 'msgYouFeelVeryGood'],
  descend: ['bottomOfModule', 'changeFloorTo'],
  ascend: ['msgDoesNotWorkBelowLevel64', 'msgCannotFloatAboveTheTown', 'changeFloorTo'],
  detectPosition: [],
  feather: ['msgAlreadyInEffect', 'computeWeight'],
  bigCure: ['msgYouFeelVeryGood'],
  doubleAscend: ['msgDoesNotWorkBelowLevel64', 'msgCannotFloatAboveTheTown', 'changeFloorTo'],
  invisibility: ['msgAlreadyInEffect'],
  fastMove: ['msgAlreadyInEffect'],
  superStrength: ['msgAlreadyCastThisSpell', 'msgYouFeelVeryGood'],
  majorDescend: ['bottomOfModule', 'changeFloorTo'],
  superAgility: ['msgAlreadyCastThisSpell', 'msgYouFeelVeryGood'],
  curePoison: [],
  healAllWounds: [],
  majorAscend: ['msgDoesNotWorkBelowLevel64', 'msgCannotFloatAboveTheTown', 'changeFloorTo'],
  cureDisease: [],
  magicZap: ['msgNoMonster'],
  slowEnemies: [],
  minorShock: ['msgNoMonster'],
  lightningBolt: ['msgNoMonster'],
  magicMissile: ['msgNoMonster'],
  magicZot: ['msgNoMonster'],
  shock: ['msgNoMonster'],
  magicBolt: ['msgNoMonster'],
  holdMonster: ['bossImmuneCheck', 'msgNoMonster'],
  majorShock: ['msgNoMonster'],
  fastCure: ['msgYouFeelGood'],
  fastBigCure: ['msgYouFeelVeryGood'],
  fastHeal: [],
} satisfies Record<string, string[]>;

type SpellFunction = keyof typeof HELPERS;

/** One case of a spell_effect switch: the ten lines of a list, three slots to a line. */
interface Case {
  fn: SpellFunction;
  /** What the case passes after `game`, written the way the case writes it. */
  args?: string;
}

const PERMANENT: Case[][] = [
  [
    { fn: 'enchantWeaponPerm', args: '1' },
    { fn: 'extraHealthPoints', args: '1' },
    { fn: 'writeScrollOrWand', args: '3, 1' },
  ],
  [
    { fn: 'enchantArmorPerm', args: '1' },
    { fn: 'extraHealthPoints', args: '3' },
    { fn: 'writeScrollOrWand', args: '3, 2' },
  ],
  [
    { fn: 'enchantWeaponPerm', args: '2' },
    { fn: 'extraHealthPoints', args: '5' },
    { fn: 'setProtRing', args: '1' },
  ],
  [
    { fn: 'enchantArmorPerm', args: '2' },
    { fn: 'setAntiMagicRing', args: '1' },
    { fn: 'writeScrollOrWand', args: '10, 1' },
  ],
  [
    { fn: 'enchantWeaponPerm', args: '3' },
    { fn: 'setProtRing', args: '2' },
    { fn: 'setBodyArmor', args: '1' },
  ],
  [
    { fn: 'enchantArmorPerm', args: '3' },
    { fn: 'setAntiMagicRing', args: '2' },
    { fn: 'writeScrollOrWand', args: '8, 2' },
  ],
  [
    { fn: 'setProtRing', args: '3' },
    { fn: 'setAntiMagicRing', args: '3' },
    { fn: 'setBodyArmor', args: '2' },
  ],
  [
    { fn: 'enchantWeaponPerm', args: '4' },
    { fn: 'enchantArmorPerm', args: '4' },
    { fn: 'writeScrollOrWand', args: '10, 2' },
  ],
  [
    { fn: 'permanentFeather' },
    { fn: 'setAntiMagicRing', args: '5' },
    { fn: 'extraHealthPoints', args: '25' },
  ],
  [
    { fn: 'permanentInvisibility' },
    { fn: 'youth' },
    { fn: 'setBodyArmor', args: '4' },
  ],
];

const PREPARATION: Case[][] = [
  [
    { fn: 'setTempArmorPlus', args: '1' },
    { fn: 'setTempWeaponPlus', args: '1' },
    { fn: 'littleCure' },
  ],
  [
    { fn: 'setTempWeaponPlus', args: '2' },
    { fn: 'relocateSpell' },
    { fn: 'detectLevel' },
  ],
  [
    { fn: 'cure' },
    { fn: 'setTempArmorPlus', args: '2' },
    { fn: 'prepStrength' },
  ],
  [
    { fn: 'setTempWeaponPlus', args: '3' },
    { fn: 'prepAgility' },
    { fn: 'descend' },
  ],
  [
    { fn: 'ascend' },
    { fn: 'detectPosition' },
    { fn: 'feather' },
  ],
  [
    { fn: 'bigCure' },
    { fn: 'doubleAscend' },
    { fn: 'setTempWeaponPlus', args: '4' },
  ],
  [
    { fn: 'invisibility' },
    { fn: 'setTempArmorPlus', args: '3' },
    { fn: 'fastMove' },
  ],
  [
    { fn: 'superStrength' },
    { fn: 'setTempWeaponPlus', args: '5' },
    { fn: 'majorDescend' },
  ],
  [
    { fn: 'superAgility' },
    { fn: 'curePoison' },
    { fn: 'healAllWounds' },
  ],
  [
    { fn: 'majorAscend' },
    { fn: 'cureDisease' },
    { fn: 'setTempArmorPlus', args: '4' },
  ],
];

const WIZARD_BATTLE: Case[][] = [
  [
    { fn: 'sleepMonster' },
    { fn: 'magicZap' },
    { fn: 'protection', args: '1' },
  ],
  [
    { fn: 'slowEnemies' },
    { fn: 'strength' },
    { fn: 'minorShock' },
  ],
  [
    { fn: 'lightningBolt' },
    { fn: 'magicMissile' },
    { fn: 'speed' },
  ],
  [
    { fn: 'goAway' },
    { fn: 'relocateSpell' },
    { fn: 'powerWeapon', args: '1' },
  ],
  [
    { fn: 'explosion', args: '0' },
    { fn: 'protection', args: '2' },
    { fn: 'resistPoison' },
  ],
  [
    { fn: 'magicZot' },
    { fn: 'shock' },
    { fn: 'antiCold' },
  ],
  [
    { fn: 'explosion', args: '1' },
    { fn: 'passWall', args: 'game.chooseDirection()' },
    { fn: 'antiFire' },
  ],
  [
    { fn: 'magicBolt' },
    { fn: 'resistDrain' },
    { fn: 'powerWeapon', args: '2' },
  ],
  [
    { fn: 'holdMonster' },
    { fn: 'drainMonster' },
    { fn: 'majorShock' },
  ],
  [
    { fn: 'explosion', args: '2' },
    { fn: 'autokill' },
    { fn: 'powerWeapon', args: '3' },
  ],
];

const PRIEST_BATTLE: Case[][] = [
  [
    { fn: 'sleepMonster' },
    { fn: 'protection', args: '1' },
    { fn: 'strength' },
  ],
  [
    { fn: 'resistPoison' },
    { fn: 'speed' },
    { fn: 'fastCure' },
  ],
  [
    { fn: 'resistDisease' },
    { fn: 'relocateSpell' },
    { fn: 'slowEnemies' },
  ],
  [
    { fn: 'antiCold' },
    { fn: 'goAway' },
    { fn: 'powerWeapon', args: '1' },
  ],
  // The priest's Protection asks for protection level 1, the same as the Minor Protection two
  // lines up, so it is the weaker spell of the two the game names Protection.
  [
    { fn: 'protection', args: '1' },
    { fn: 'antiFire' },
    { fn: 'passWall', args: 'game.chooseDirection()' },
  ],
  [
    { fn: 'resistDrain' },
    { fn: 'drainMonster' },
    { fn: 'fastBigCure' },
  ],
  [
    { fn: 'holdMonster' },
    { fn: 'powerWeapon', args: '2' },
    { fn: 'shock' },
  ],
  [
    { fn: 'protection', args: '3' },
    { fn: 'explosion', args: '1' },
    { fn: 'magicZot' },
  ],
  [
    { fn: 'autokill' },
    { fn: 'powerWeapon', args: '3' },
    { fn: 'strengthAndSpeed' },
  ],
  [
    { fn: 'protection', args: '4' },
    { fn: 'fastHeal' },
    { fn: 'majorShock' },
  ],
];

/** The four lists in the order spell_effect switches on them. */
const LISTS: Case[][][] = [PERMANENT, PREPARATION, WIZARD_BATTLE, PRIEST_BATTLE];

export interface PortedSpell {
  /** The function of magic.ts the spell's switch case calls. */
  fn: string;
  /** What the case passes after `game`, when it passes anything. */
  args?: string;
  /** The functions of magic.ts that `fn` calls itself. */
  helpers: string[];
}

/**
 * The ported code one spell runs.
 *
 * @param type 0 permanent, 1 preparation, 2 wizard battle, 3 priest battle
 * @param levelIndex 0..9 for the spell's level
 * @param slot 0..2 for its place on that line
 */
export function portedSpell(type: number, levelIndex: number, slot: number): PortedSpell {
  const entry: Case | undefined = LISTS[type]?.[levelIndex]?.[slot];
  if (!entry) throw new Error(`no spell in list ${type} at level ${levelIndex + 1} slot ${slot + 1}`);
  return { fn: entry.fn, args: entry.args, helpers: [...HELPERS[entry.fn]] };
}
