import { portCode, type SourceFile } from '../source/ports';

/** The declaration whose text an entry shows. */
export interface CodeReference {
  file: SourceFile;
  /** A function, a const or a method of a class, as it is named in that file. */
  name: string;
}

export interface Formula {
  /** Used as the element id the index scrolls to, so it has to be unique across topics. */
  id: string;
  title: string;
  /** What the formula decides, in plain English, for someone who plays the game. */
  explanation: string;
  /** What the answer depends on. */
  inputs: string;
  /** The function in the game and the notes it was recovered in. */
  origin: string;
  /** The function in the decompilation the origin names, for the link to the Source tab. */
  c?: string;
  /** Null for the handful of rules the app itself never has to work out. */
  code: CodeReference | null;
}

export interface Topic {
  id: string;
  title: string;
  formulas: Formula[];
}

const MAP: Topic = {
  id: 'map',
  title: 'The map',
  formulas: [
    {
      id: 'map-hash',
      title: 'Why every dungeon is the same',
      explanation:
        'The game ships no maps and saves none. Every question about a square, from "is this a wall" to "is there a ladder here", is answered by pushing the square\'s column and row, the floor number and the module through one piece of arithmetic and taking a remainder, so the same question always gets the same answer. Floor 12 of Module I is laid out identically in your game, in a stranger\'s game and in the 1993 screenshots. The sums are done in 16-bit arithmetic that overflows constantly, and the port keeps every overflow, down to the quirk in the original C where the size of the most negative number stays negative and is then clamped to zero.',
      inputs: 'The square\'s column and row, the floor, the module, and how many different answers are wanted.',
      origin: 'exe 3000:81ba, myrand in dotu-tools/decomp/unf.c. Handoff section 5 and TIDBITS, "Numbers with a story".',
      c: 'myrand',
      code: { file: 'src/lib/game/unfmap.js', name: 'myrand' },
    },
    {
      id: 'map-sides',
      title: 'Walls, doors and secret doors',
      explanation:
        'A square does not own its walls: the sides between squares do, and each side is one of four things, a wall, a door, a secret door or open air. The floor is cut into blocks of sixteen squares by sixteen, the hash picks one of twenty-five stamped patterns for each block out of the 12,800 bytes of wall data that ship with the game, and two bits of that pattern answer for one side. That is why corridors feel repetitive: a floor is twenty-five patterns rearranged. Floor 1 of Module I ends up with 209 squares next to a door and 71 next to a secret door, and the sides at the very edge of the map are always walls.',
      inputs: 'The side wanted, the floor, the module, and the wall pattern file the game installs.',
      origin: 'exe retdwall 3000:8360, retdwall in dotu-tools/decomp/unf.c. Handoff section 5.',
      c: 'retdwall',
      code: { file: 'src/lib/game/unfmap.js', name: 'side' },
    },
    {
      id: 'map-rock',
      title: 'Rock',
      explanation:
        'A square is rock, never enterable and drawn filled in, exactly when all four of its sides came out as walls. There is no list of solid squares anywhere; the question is asked again every time it matters. Roughly a third of a floor survives as open space: floor 1 of Module I has 2,862 open squares out of the 8,216 the game shows.',
      inputs: 'The four sides of the square, so the same things the sides themselves depend on.',
      origin: 'exe solidcheck 3000:86b5, solidcheck in dotu-tools/decomp/unf.c.',
      c: 'solidcheck',
      code: { file: 'src/lib/game/unfmap.js', name: 'solid' },
    },
    {
      id: 'map-area',
      title: 'The part of a floor you can reach',
      explanation:
        'The generator fills a grid 80 columns wide and 110 rows tall, but the game only ever draws and walks 79 by 104. The last column and the last six rows are generated like everything else and can hold perfectly good open squares that no spell, teleporter or footstep will ever reach, because every check the game makes on a destination square stops at those two numbers. The map explorer counts and draws the same area the game does, so its floor totals match what a player could actually explore.',
      inputs: 'Two sizes the game keeps for itself. Nothing about your character or the floor.',
      origin: 'the globals at DS:2328 and DS:232a, tested in relocate (exe 3000:da2c), pass_wall (exe 3000:e003) and go_away (exe 3000:db1e).',
      c: 'relocate',
      code: { file: 'src/lib/map/area.ts', name: 'MAP_COLUMNS' },
    },
  ],
};

const TELEPORTERS: Topic = {
  id: 'teleporters',
  title: 'Module teleporters',
  formulas: [
    {
      id: 'teleporter-sides',
      title: 'Where the teleporters are',
      explanation:
        'A module teleporter is not a square but a wall side that has quietly been turned into a way out of the module. The game multiplies the side\'s column by its row, adds the floor times the module number, and if the result is one more than a whole number of 128s, a side that would have been a plain wall becomes a teleporter instead. The rule is switched off from floor 15 downwards in every module but the first, so Module I has them all the way to the bottom while the others only carry them near the surface: floor 1 of Module I has seventeen teleporter squares, floor 30 of Module II has none. In Module I the module number is zero, which drops the floor out of the sum altogether, so the candidate spots are the same on every floor and only the ones that happen to be walls become teleporters.',
      inputs: 'The side\'s column and row, the floor, the module, and whether that side came out as a wall in the first place.',
      origin:
        'exe retdwall2 2000:c22d, retdwall2 in dotu-tools/decomp/unf.c. Handoff section 4. The rule is commented out in the recovered source but live in the executable, and the wall artwork still holds the sign that points at one (TIDBITS, "Colours and pictures").',
      c: 'retdwall2',
      code: { file: 'src/lib/game/unfmap.js', name: 'side2' },
    },
    {
      id: 'teleporter-landing',
      title: 'Where a teleporter drops you',
      explanation:
        'Walking into a teleporter moves you to the town of the module next door: up from Module I, down from Module V, and your choice of the two in between. Where in that town you appear is decided by drawing a column and a row at random over the area the game shows and drawing again until the square is not rock, so any of the three thousand or so open squares is as likely as any other. The same drawing places you after Relocate and after Descend and Ascend, which is why none of those ever put you somewhere convenient. Digging a hole is different: it drops you straight down to the first of the next five floors on which this square is open, and only draws at random when there is no such floor, or when a Fighter digs in the deepest quarter of a module and is relocated instead.',
      inputs: 'Which squares of the destination floor are rock. Not the square you left, and nothing about your character.',
      origin: 'exe relocate 3000:da2c, relocate in dotu-tools/decomp/unf.c. Handoff section 4.',
      c: 'relocate',
      code: { file: 'src/lib/map/relocate.ts', name: 'randomOpenSquare' },
    },
  ],
};

const TOWN: Topic = {
  id: 'town',
  title: 'The town',
  formulas: [
    {
      id: 'town-buildings',
      title: 'Where the buildings are',
      explanation:
        'Floor 0 of every module is a town, built by exactly the same machinery as a dungeon floor, with buildings dropped onto squares instead of ladders and chutes. For each square the hash draws a number below sixty: a one is a general store, a two the temple, a three the bank, a four the inn, and everything else is empty ground. Each building therefore has one square in sixty and about one square in fifteen is a doorway, which in the town of Module I works out as 60 stores, 50 temples, 42 banks and 51 inns among its 3,129 open squares. A square that has a ladder is never a building: the game asks about ladders first and only looks for a building when there is none.',
      inputs: 'The square\'s column and row and the module. The floor is always the town.',
      origin:
        'exe town_features 2000:bd32, town_features in dotu-tools/decomp/unf.c. Handoff section 4 and FAQ [LDRS]; the ladder-first order is in drawsquare (exe 3000:87de) and movecontrol (exe 2000:c308).',
      c: 'town_features',
      code: { file: 'src/lib/game/unfmap.js', name: 'townFeature' },
    },
  ],
};

const WAYS_DOWN: Topic = {
  id: 'ways-down',
  title: 'Ladders, chutes and trap doors',
  formulas: [
    {
      id: 'ladders',
      title: 'Ladders up and down',
      explanation:
        'One open square in twenty-seven draws the number that makes a down ladder, and the ladder reaches the first square that is not rock one or two floors below; if both of those are rock, or the module has no floor left below, nothing is built. Up ladders are never generated in their own right. A square carries one exactly when a down ladder on one of the three floors above it lands here, which is why the two directions never match up neatly: floor 1 of Module I has 78 ladders going down and 59 coming up from the town.',
      inputs: 'The square\'s column and row, the floor and the module, and whether the squares directly above and below are rock.',
      origin: 'exe check_for_ladder 3000:827f, check_for_ladder in dotu-tools/decomp/unf.c. Handoff section 5 and FAQ [LDRS].',
      c: 'check_for_ladder',
      code: { file: 'src/lib/game/unfmap.js', name: 'ladder' },
    },
    {
      id: 'chutes',
      title: 'Chutes',
      explanation:
        'A chute is a hole you fall through without being asked. About five squares in every two hundred and thirty have one, a rate that creeps up very slowly with depth, and falling drops you onto the first open square straight below: two floors at most down to floor 9, four floors below that. A square with a ladder is never a chute, and the whole feature is switched off past three quarters of the way to the bottom of the module, so floor 1 of Module I has 41 chutes while floor 100 of Module V has none at all.',
      inputs: 'The square\'s column and row, the floor and the module, and whether the squares below are rock.',
      origin: 'exe detect_chute 2000:b5ea, detect_chute in dotu-tools/decomp/unf.c. Handoff section 4 and FAQ [LDRS].',
      c: 'detect_chute',
      code: { file: 'src/lib/game/unfmap.js', name: 'chute' },
    },
    {
      id: 'trap-doors',
      title: 'Trap doors and the floors they reach',
      explanation:
        'A trap door is a locked shortcut that names the floor it goes to, always a multiple of five, and only opens for a character carrying that floor\'s key. The hash draws a number below twenty-four hundred and multiplies it by five; the answer counts only if it is floor 5 or deeper, above four fifths of the way to the bottom of the module, and in a different block of five floors from the one you are standing on. In Module I that leaves floors 5, 10 and 15 as the only destinations and roughly one square in eight hundred with a trap door on it, while Module V allows sixteen destinations and roughly one square in a hundred and fifty. Floor 12 of Module I, for instance, has five trap doors, and every one of them leads to floor 5 or floor 15.',
      inputs: 'The square\'s column and row, the floor, the module, and the module\'s bottom floor.',
      origin: 'exe trapdoor 2000:9cba, trapdoor in dotu-tools/decomp/unf.c. Handoff section 4 and FAQ [LDRS].',
      c: 'trapdoor',
      code: { file: 'src/lib/game/unfmap.js', name: 'trapdoor' },
    },
    {
      id: 'trap-door-landing',
      title: 'Where a trap door lands you',
      explanation:
        'Every trap door pointing at the same floor drops you on the same square. The game seeds its random number generator with the number ten, draws a column and a row out of it, and if that square is rock it starts again with eleven, then twelve, until it lands on open ground. Nothing about your character or the door you fell through comes into it, and because the seeds never change the answer is fixed for the life of the game. Column 17, row 93 comes up on 109 of the game\'s 325 floors and column 18, row 93 on 87 more.',
      inputs: 'The destination floor and the module, through which squares of that floor are rock.',
      origin:
        'exe trapdoor_dest 2000:bda6, trapdoor_dest in dotu-tools/decomp/unf.c. TIDBITS, "Numbers with a story".',
      c: 'trapdoor_dest',
      code: { file: 'src/lib/game/unfmap.js', name: 'trapdoorDest' },
    },
  ],
};

const MONSTERS: Topic = {
  id: 'monsters',
  title: 'Sections and monsters',
  formulas: [
    {
      id: 'sections',
      title: 'Which section a floor belongs to',
      explanation:
        'The twenty sections of the game are four to a module, and a section is simply a band of floors: five floors thick in Module I, ten in Module II, and so on up to twenty-five in Module V, with the module\'s last section swallowing everything below its band. Floors 1 to 5 of Module I are section 1, floors 16 to 25 are all section 4; in Module V section 20 runs from floor 76 to the bottom at 105. The section decides which five monsters the game loads, which Shadow boss guards it and which reward beating that boss pays, and its boss waits on the last floor of its band.',
      inputs: 'The floor and the module.',
      origin: 'exe section_number3 2000:1ccc, section_number3 in dotu-tools/decomp/unf.c. Handoff section 4.',
      c: 'section_number3',
      code: { file: 'src/lib/game/dotu-files.js', name: 'sectionOf' },
    },
    {
      id: 'monster-level-base',
      title: 'The level a floor stocks at',
      explanation:
        'Every monster on a floor starts from one number: the floor plus fifteen for each module below the one you are in. Floor 10 of Module I stocks level 10 monsters, floor 30 of Module II stocks level 45, and floor 1 of Module V stocks level 61, which is why the deeper modules are brutal from their first step. The one special case, a base of 221 or more falling back to level 1, cannot be reached by any module: Module V bottoms out at 165.',
      inputs: 'The floor and the module.',
      origin: 'exe stock_level 2000:671e, stock_level in dotu-tools/decomp/unf.c. RE notes 4.1 and FAQ [MGEN].',
      c: 'stock_level',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'monsterLevelBase' },
    },
    {
      id: 'monster-level-nudge',
      title: 'The nudge on a monster\'s level',
      explanation:
        'The floor\'s level is not what gets stored. For each monster the game keeps tossing a one-in-three chance, and every time it comes up the level shifts by minus one, nothing or plus one. Two thirds of monsters therefore stand exactly at the floor\'s level and the rest tail away either side, so a level 45 floor is mostly level 45 with a scattering from about 41 to 49. Whatever comes out has to land between 1 and 210: anything under becomes level 1, and so does anything over, though no floor is deep enough for that to happen since the deepest stocks level 165. The hit points are already rolled by this point, so the nudge moves what a monster hits and is hit like without touching what it can take.',
      inputs: 'The floor\'s base level, and the rolls.',
      origin: 'exe stock_level 2000:671e, stock_level in dotu-tools/decomp/unf.c. RE notes 4.1 and FAQ [MGEN].',
      c: 'stock_level',
      code: { file: 'src/lib/bestiary/roll.ts', name: 'nudgeLevel' },
    },
    {
      id: 'monster-hp',
      title: 'A monster\'s hit points',
      explanation:
        'Hit points are the average of two rolls, each between zero and the monster type\'s hit points per level times the floor\'s base level. That is the floor\'s level and not the monster\'s own: the game rolls the hit points first and nudges the level it stores afterwards, so a monster standing a level or two below its floor still carries the floor\'s hit points. Averaging two rolls rather than taking one is why monsters cluster around the middle of their range instead of spreading evenly: an average joe, worth ten hit points a level, comes to about 226 on a level 45 floor, but can be anything from 1 to 451. The type\'s hit points per level is the whole difference between a fragile thing and a wall, running from 2 for a puffball to 50 for a Shadow boss.',
      inputs: 'The monster type\'s hit points per level, the floor\'s base level, and the two rolls.',
      origin: 'exe stock_level 2000:671e, stock_level in dotu-tools/decomp/unf.c. RE notes 4.1 and FAQ [MGEN].',
      c: 'stock_level',
      code: { file: 'src/lib/bestiary/roll.ts', name: 'rollHp' },
    },
    {
      id: 'boss-hp',
      title: 'Why a Shadow boss takes so long',
      explanation:
        'A Shadow boss rolls its hit points like anything else and then adds twenty for each level of its floor, and in the last three sections the whole total is doubled afterwards. The Shadow boss on floor 50 of Module V is stocked at level 110, which means it rolls about 2,750 hit points, takes 2,200 more for its levels, and then has the whole total doubled because its section is one of the last three: it arrives with close to 9,900 where the same rolls without the bonus would have given 2,750. Nothing in the game can hold more than 32,000.',
      inputs: 'The rolled hit points, the floor\'s base level, and the section it guards.',
      origin: 'exe stock_level 2000:671e, stock_level in dotu-tools/decomp/unf.c. RE notes 4.1 and TIDBITS, "Monsters".',
      c: 'stock_level',
      code: { file: 'src/lib/bestiary/roll.ts', name: 'stockedHp' },
    },
    {
      id: 'monster-kind',
      title: 'Which monster turns up',
      explanation:
        'Every slot on a floor gets its own creature by a chain of questions, each asked only if the last one said no. One in twenty is a puffball, of which there are twelve; failing that one in seven is a giant garbage can or a giant ball; failing that one in fifteen is the section\'s level drainer; failing that one in twelve is one of the eight poison or disease things; and everything left over is one of the section\'s three ordinary monsters. Only two of the five branches depend on which section you are in, which is why cans, balls and puffballs follow you all the way to Module V.',
      inputs: 'The section, and the rolls.',
      origin: 'exe get_mtype 2000:65f8, get_mtype in dotu-tools/decomp/unf.c. RE notes 4.1 and FAQ [MGEN].',
      c: 'get_mtype',
      code: { file: 'src/lib/map/stocking.ts', name: 'rollKind' },
    },
    {
      id: 'monster-kind-odds',
      title: 'How often each kind turns up',
      explanation:
        'Multiplying the chain of questions out gives what a floor actually holds: about seven in ten monsters are one of the section\'s three regulars, a touch under one in seven is a can or a ball, one in twenty is a puffball, one in sixteen is poison or disease, and one in eighteen is the section\'s level drainer. Spread over the twelve puffballs and eight poison and disease creatures, any single one of those is rare, which is why the Monsters tab shows the built-in creatures with much smaller shares than the section monsters.',
      inputs: 'Nothing. The chances are the same on every floor of the game.',
      origin: 'exe get_mtype 2000:65f8, get_mtype in dotu-tools/decomp/unf.c. FAQ [MGEN] and [GTPS].',
      c: 'get_mtype',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'MONSTER_TYPE_ODDS' },
    },
    {
      id: 'stocking',
      title: 'The 145 monsters on a floor',
      explanation:
        'A floor is stocked with exactly 145 monsters, each dropped on a random open square that nothing else is standing on, each given its own kind, hit points and level, in that order. On the last floor of a section the very first slot is the Shadow boss instead, placed somewhere in the middle fifty squares of each direction, and once you have beaten it the game stops placing it. The game only remembers three floors of monsters at a time, so a floor you come back to later is stocked fresh; and because the original reseeds its generator for every square it draws, its monsters land in diagonal stripes, which this app does not imitate.',
      inputs: 'The floor\'s open squares, its section and its base level, and the rolls.',
      origin:
        'exe stock_level 2000:671e, stock_level in dotu-tools/decomp/unf.c. RE notes 4.1; the stripes are in TIDBITS, "Random numbers that are not random".',
      c: 'stock_level',
      code: { file: 'src/lib/map/stocking.ts', name: 'stockFloor' },
    },
  ],
};

const EXPERIENCE: Topic = {
  id: 'experience',
  title: 'Experience',
  formulas: [
    {
      id: 'exp-needed',
      title: 'What the next level costs',
      explanation:
        'Each level needs forty per cent more experience than the one before it, starting from 250 and with a flat 80 knocked off the whole curve. Level 10 wants 3,609 experience, level 20 wants 106,640 and level 30 wants a little over three million. On "I can handle anything" the curve doubles instead of growing by two fifths and the 80 is gone, so the first few levels are barely harder and the later ones are ruinous: level 20 costs 65 million there against 106,640 on the normal setting.',
      inputs: 'The level you are aiming at and the difficulty the character was rolled on.',
      origin:
        'exe exp_needed 2000:7b48, exp_needed in dotu-tools/decomp/unf.c, from the constants at DS:0421, DS:0429, DS:12d6 and DS:12da. RE notes 1.1 and FAQ [EXPT].',
      c: 'exp_needed',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'expNeeded' },
    },
    {
      id: 'exp-value',
      title: 'What a kill is worth',
      explanation:
        'A kill pays out on the monster\'s level, and the payout grows by twenty-three per cent for every level, which utterly swamps the rest of the sum. A level 30 monster is worth about 2,500 experience, a level 60 one about 1.2 million and a level 61 one about 1.5 million, so one floor deeper is worth more than a much longer stay where you are. The whole thing is then multiplied by the monster\'s own worth: one for an ordinary section monster, three for a garbage can or ball, five for a poison or disease creature, and sixteen for a Shadow boss. Levels above 130 pay no more than level 130 does.',
      inputs: 'The monster\'s level and the multiplier its kind carries.',
      origin:
        'exe exp_value 3000:a0fa, exp_value in dotu-tools/decomp/unf.c, from the constants at DS:2f60 and DS:2f68. RE notes 3 and FAQ [LOOT].',
      c: 'exp_value',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'expValue' },
    },
    {
      id: 'level-for-exp',
      title: 'When a level is actually granted',
      explanation:
        'Killing things never levels you up. Experience piles up while you are in the dungeon and the game only compares it against the table when you pay for a room at an inn, handing you every level you have earned since the last stay in one go. Losing experience, to a drainer or to the Youth spell, never takes a level back at the inn; only a level drainer\'s hit does that, and it sets your experience to the exact minimum for the level it leaves you on.',
      inputs: 'The experience you are carrying, the difficulty, and the level you are already on.',
      origin:
        'exe gain_level 2000:7d23 and check_gain_level 2000:7c71, called from flea_inn (exe 2000:4fe7); gain_level in dotu-tools/decomp/unf.c. RE notes 1.1 and 2.2.',
      c: 'gain_level',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'levelForExp' },
    },
  ],
};

const LOOT: Topic = {
  id: 'loot',
  title: 'Drops and money',
  formulas: [
    {
      id: 'drop-odds',
      title: 'What drops when you kill something',
      explanation:
        'Each kill runs several rolls that have nothing to do with each other. The weapon roll picks one of the seven weapons and hands it over if a draw against a hundred times its rank comes in under the monster\'s level plus ten, but kill_monster wipes the killed monster\'s record before it rolls, so the level read there is always zero and a Great Sword is about one kill in 445 whatever you killed and wherever you killed it. A weapon you already own never drops again. Armor works the same way over six kinds but does give duplicates, and Titanium, which no shop sells, is about one kill in 330. The separate "you find" roll depends on the floor and covers grenades, stones, potions, a slosher, a regeneration ring and the six stat books: on floor 20 a wizard turns something up one kill in twenty-four and a fighter or a sage one in fourteen, and a third of those finds are nothing at all. Monks find nothing anywhere, ever.',
      inputs: 'The floor and your class.',
      origin:
        'exe drop_weapon 3000:a1fc, drop_armor 3000:a3d7 and find_item 3000:ae27, all called from kill_monster (exe 3000:b12d); drop_weapon in dotu-tools/decomp/unf.c. RE notes 3 and FAQ [LOOT].',
      c: 'drop_weapon',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'dropOdds' },
    },
    {
      id: 'drop-drainer',
      title: 'Trap door keys and stat potions',
      explanation:
        'Killing a monster that drains whole levels is the only way to be handed either of these. It pays a random stat potion with a chance that climbs with depth, a little over half the time on floor 20 and nearly three quarters on floor 100, and otherwise it gives you the trap door key for the block of five floors you are standing on, so long as you do not have it already and you are between floors 4 and 178. Every trap door is locked, which makes these monsters the only route to the shortcuts. One section in twenty has no such monster: the drainer of the very first section takes experience instead of a level, and pays nothing at all.',
      inputs: 'The floor, the section you are in, and which keys you already carry.',
      origin: 'exe kill_monster 3000:b12d, kill_monster in dotu-tools/decomp/unf.c. RE notes 3 and FAQ [LOOT].',
      c: 'kill_monster',
      code: { file: 'src/lib/calculators/drops.ts', name: 'drainerShare' },
    },
    {
      id: 'drop-spells',
      title: 'Spell books, scrolls, wands and papers',
      explanation:
        'Anyone who can cast at all gets a spell book roll on every single kill: a random book of a random level up to two thirds of the floor, learned if it is one you do not know and your class is allowed it. From floor 15 down that ceiling is the whole ten levels, which is why deep characters fill their books quickly. Only if no book was learned does the game try a scroll, a wand or a spell paper, one third each, and those are much rarer, around one kill in sixty on floor 20. Fighters can only ever be handed spell papers, sages get better scroll odds but have their books gated behind two extra rolls, and monks are shut out of everything except books they already start with.',
      inputs: 'The floor and your class.',
      origin:
        'exe drop_spellbook 3000:a65d, drop_scroll 3000:a870, drop_wand 3000:aa37 and drop_paper 3000:ac6f, called from kill_monster (exe 3000:b12d); drop_spellbook in dotu-tools/decomp/unf.c. RE notes 3 and FAQ [LOOT].',
      c: 'drop_spellbook',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'dropOdds' },
    },
    {
      id: 'money',
      title: 'The money a kill pays',
      explanation:
        'Money is a lottery. Three separate draws, all scaled by the floor, are multiplied together, so most kills pay little and the occasional one pays a fortune: on floor 20 the average is around 326,000 American dollars and on floor 50 around 28 million. Shallow floors get a top-up, floors past 16 lose a third, worshippers and wizards get an extra draw, sages triple the lot, and playing on the normal difficulty quietly adds up to 7,000 to every kill. The total is capped a little over 107 million, and the bank changes American dollars into rubles at a hundred to one. Two monsters killed inside the same second pay exactly the same, because the generator is reseeded from a clock that only ticks once a second.',
      inputs: 'The floor, your class and the difficulty.',
      origin:
        'exe drop_money 4000:6aca, drop_money in dotu-tools/decomp/unf.c. RE notes 3; the same-second repeat is in TIDBITS, "Random numbers that are not random".',
      c: 'drop_money',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'rollMoney' },
    },
    {
      id: 'stock-price',
      title: 'The price of culture stock',
      explanation:
        'Culture stock is what stops a night at the inn ageing you, and what it costs depends on nothing but your character level: 20 rubles a unit at level 5, 936 at level 20, 10,803 at level 45. You need one unit for every level squared each night, so a level 20 character is buying 400 units and a level 45 character 2,025. Nothing you do makes stock cheaper except staying at a lower level.',
      inputs: 'Your character level.',
      origin: 'exe g_store 2000:45ab, g_store in dotu-tools/decomp/unf.c. RE notes 2.1 and FAQ [TOWN].',
      c: 'g_store',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'stockPrice' },
    },
    {
      id: 'crystal-price',
      title: 'The price of a magic crystal',
      explanation:
        'One magic crystal refills one spell point when you rest, and the price again follows only your level: 203 rubles at level 10 and 1,470 at level 20. On "I can handle anything" the same sum is divided by two instead of three, so crystals there cost half as much again, 2,205 at level 20. A caster who empties a deep pool every trip spends far more on crystals than on the room.',
      inputs: 'Your character level and the difficulty.',
      origin: 'exe g_store 2000:45ab, g_store in dotu-tools/decomp/unf.c. RE notes 2.1 and FAQ [TOWN].',
      c: 'g_store',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'crystalPrice' },
    },
    {
      id: 'store-refund',
      title: 'The discount for helping children',
      explanation:
        'Each needy child you have helped at the temple gives one per cent back on culture stock and magic crystals, and the refund stops at half the price. Fifty children is therefore the entire discount, 500 rubles back on a purchase of 1,000, and every child after that buys nothing at the store. Weapons and armor are never discounted at all.',
      inputs: 'What you are spending and how many children you have helped.',
      origin: 'exe store_refund 2000:428d, store_refund in dotu-tools/decomp/unf.c. RE notes 2.3 and FAQ [TOWN].',
      c: 'store_refund',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'storeRefund' },
    },
    {
      id: 'inn-cost',
      title: 'A night at the inn',
      explanation:
        'A room costs your level to the fourth power plus ten, which is 635 rubles at level 5, 10,010 at level 10 and 4.1 million at level 45. Every child you have helped takes your level off the bill, so at level 20 fifty children save a thousand rubles on a room of 160,010 and the whole idea has stopped mattering; the discount can never take away more than half the price in any case. Resting is the only way to collect the levels you have earned, so this is a bill you pay whether you like it or not.',
      inputs: 'Your character level and how many children you have helped.',
      origin: 'exe flea_inn 2000:4fe7, flea_inn in dotu-tools/decomp/unf.c. RE notes 2.2 and FAQ [TOWN].',
      c: 'flea_inn',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'innCost' },
    },
    {
      id: 'temple',
      title: 'What the temple charges',
      explanation:
        'The temple\'s six services are flat prices that never move, whatever your level: 10 rubles for a scratch, 100 for a serious wound, 500 to be healed completely, 300 to cure poison and 500 to cure a disease. Helping a needy child is 100 rubles, and it is the only purchase in the building that lasts, since the count is read afterwards by both the general store and the inn. Against level 20 prices anywhere else in town these are pocket change.',
      inputs: 'Nothing. The temple never looks at your character.',
      origin: 'exe temple 2000:4d39, temple in dotu-tools/decomp/unf.c, price table at DS:037f. RE notes 2.3 and FAQ [TOWN].',
      c: 'temple',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'TEMPLE' },
    },
  ],
};

const COMBAT: Topic = {
  id: 'combat',
  title: 'Combat',
  formulas: [
    {
      id: 'strike',
      title: 'Your swing',
      explanation:
        'A swing draws a number under eighty and adds everything you bring: twice your level, your strength, your luck, the weapon\'s to-hit, its magic plus, a gauntlet, lucky charms. On the normal difficulty strength is counted a second time and a strength above 25 adds another 25 on top, which is why the same character is far deadlier there than on "I can handle anything". The monster then takes off twice its level plus its armor and its speed, and you roll your damage die once for every full forty points still standing, so a big enough total lands two or three dice on one swing. Anything that connects then picks up extra damage from your strength and your level, and past floor 75 there is a one in thirty chance of a further 40 points of to-hit out of nowhere.',
      inputs: 'Your level, strength, luck, weapon and its plus, gauntlet, charms, the difficulty, the floor, and the monster\'s level, armor and speed.',
      origin: 'exe strike 2000:7e36, strike in dotu-tools/decomp/unf.c. RE notes 4.4 and FAQ [COMT].',
      c: 'strike',
      code: { file: 'src/lib/game/port/combat.ts', name: 'strike' },
    },
    {
      id: 'to-hit-total',
      title: 'What goes into your to-hit total',
      explanation:
        'Everything a swing adds before the dice are rolled comes to one number, and it is worth knowing which parts of a character move it. Two points per level, your luck and your weapon\'s to-hit are always there; strength is worth double on the normal difficulty and worth another 25 flat once it passes 25. The magic plus on the weapon, a gauntlet and lucky charms are added straight on, which is why a plus 25 weapon from a boss is worth more than several levels.',
      inputs: 'Your level, strength, luck, the weapon you hold and what is on it, and the difficulty.',
      origin: 'exe strike 2000:7e36, strike in dotu-tools/decomp/unf.c. RE notes 4.4 and FAQ [COMT].',
      c: 'strike',
      code: { file: 'src/lib/bestiary/to-hit.ts', name: 'toHitTotal' },
    },
    {
      id: 'hit-chance',
      title: 'How often a swing connects',
      explanation:
        'Only one thing in a swing is random, the draw under eighty, so the chance of connecting can be counted rather than guessed at. Once the monster has taken its share off your total, 39 of the 80 possible draws still land, so a fight where your total exactly covers the monster is very nearly a coin toss, and every further point of total is another one and a quarter per cent of swings. Eighty points of total is the whole distance from never touching a monster to never missing it. The one in thirty bonus past floor 75 is left out, so these odds are exact down to that floor and slightly pessimistic below it.',
      inputs: 'Your to-hit total, and the monster\'s level, armor and speed.',
      origin: 'exe strike 2000:7e36, strike in dotu-tools/decomp/unf.c, worked out in closed form. FAQ [COMT].',
      c: 'strike',
      code: { file: 'src/lib/bestiary/to-hit.ts', name: 'hitChance' },
    },
    {
      id: 'defend',
      title: 'The monster hitting back',
      explanation:
        'A monster draws under eighty as well, adds twenty and twice its level, and takes off twice your level, your agility and half of it again, your luck, your armor and its plus, body armor, a protection ring and twice the square of your protection spell level. It then rolls its damage die once per forty points, but starts counting from thirty-two rather than forty, so it earns its first die slightly more easily than you do. After the dice come the strange parts: a small chance of one extra point of damage that can turn a miss into a hit, a one in four chance that everything rolled is thrown away and replaced by a small draw that may well be zero, and, only when the floor is deeper than your level, several large bonus rolls followed by a constitution reduction and a cap that turns any damage above four times the floor into exactly the floor.',
      inputs: 'Your level, class, agility, luck, constitution, armor and protections, the floor, and the monster\'s level and damage die.',
      origin:
        'exe defend 2000:82b7, defend in dotu-tools/decomp/unf.c. RE notes 4.4 and FAQ [COMT], which corrected three errors in the older FAQ; the cap and the one in four roll are in TIDBITS, "Bugs".',
      c: 'defend',
      code: { file: 'src/lib/game/port/combat.ts', name: 'defend' },
    },
    {
      id: 'breath',
      title: 'Breath',
      explanation:
        'A monster that breathes fire or ice uses it instead of striking on half its attacks, and breath ignores everything you are wearing: armor, protection spells and the constitution reduction all count for nothing. The damage is the monster\'s level plus a draw up to its level again, so a level 60 breather does between 60 and 119. The matching resist spell halves it, and nothing else in the game reduces it at all.',
      inputs: 'The monster\'s level, and whether you have the matching resist up.',
      origin: 'exe defend 2000:82b7, defend in dotu-tools/decomp/unf.c. FAQ [COMT].',
      c: 'defend',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'breathDamage' },
    },
    {
      id: 'attack-seconds',
      title: 'How long a swing takes',
      explanation:
        'The dungeon runs on a clock measured in seconds of game time, and everything you do spends some. A swing costs the weapon\'s own speed plus a fifth of whatever your agility falls short of 85, so a mace at agility 20 costs 31 seconds and the same mace at agility 60 costs 23. Agility is the only stat that buys the clock back, which is why it matters far more than its combat bonus suggests.',
      inputs: 'The weapon\'s speed and your agility.',
      origin: 'exe attack_timing 2000:b8f7, attack_timing in dotu-tools/decomp/unf.c. FAQ [COMT] and [GTPS].',
      c: 'attack_timing',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'attackSeconds' },
    },
    {
      id: 'monster-interval',
      title: 'How often a monster hits back',
      explanation:
        'A monster standing next to you strikes once every so many seconds of that same clock, decided entirely by its speed: 36 seconds for a slow one at speed 5, 20 for a fast one at speed 55. Since your mace swing hands over 31 seconds, a fast monster gets one and a half attacks for each of yours, and a slow character can eat two or three between actions. Nothing about your character changes the interval; the only way to be hit less is to spend fewer seconds per action.',
      inputs: 'The monster type\'s speed.',
      origin: 'exe attack_timing 2000:b8f7, attack_timing in dotu-tools/decomp/unf.c. FAQ [COMT].',
      c: 'attack_timing',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'monsterAttackInterval' },
    },
    {
      id: 'move-seconds',
      title: 'How long a step takes',
      explanation:
        'A step costs a second, plus another for every hundred pounds of you and your equipment beyond what your agility carries for free. A twenty pound midget with agility 10 moves in a second and a four hundred pound giant with no agility takes six, and every one of those seconds is time a monster beside you spends winding up its next attack. A Feather spell only zeroes your own body weight; every suit of armor and every weapon you own is added back on afterwards, so it barely moves the number for a well equipped character.',
      inputs: 'Your body weight plus everything you carry, and your agility.',
      origin: 'exe movecontrol 2000:c308, movecontrol in dotu-tools/decomp/unf.c. FAQ [GTPS].',
      c: 'movecontrol',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'moveSeconds' },
    },
  ],
};

const MAGIC: Topic = {
  id: 'magic',
  title: 'Magic',
  formulas: [
    {
      id: 'sleep',
      title: 'Sleep',
      explanation:
        'Sleep draws a number under the monster\'s level and works if it comes up below three, so it is certain against anything of level 3 or less and then falls away as three chances in however many levels the monster has: about one try in seven at level 20 and one in thirty-three at level 100. A sleeping monster stays down for 25 moves, and each of its attacks can shake it off early with a chance that grows with the floor. It is the one spell aimed at a monster that never asks whether the target is a Shadow boss, which makes it the only magic that touches one.',
      inputs: 'The monster\'s level.',
      origin: 'exe sleep_monster 3000:d904, sleep_monster in dotu-tools/decomp/unf.c. RE notes 5.2 and FAQ [SPMC].',
      c: 'sleep_monster',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'sleepChance' },
    },
    {
      id: 'autokill',
      title: 'Autokill',
      explanation:
        'Autokill sets one pile of rolls against another: the monster\'s level with a draw on its speed added, against your level with a draw on your intelligence and wisdom added, plus a draw on the floor you are standing on. If your side comes out higher the monster\'s hit points go to minus a hundred and it is simply gone, whatever it had left. The floor term is what makes the spell good: the deeper you are the more it adds, so a caster with high intelligence and wisdom can clear things far above their own level. Shadow bosses refuse it like every other spell aimed at a monster.',
      inputs: 'The monster\'s level and speed, your level, intelligence and wisdom, and the floor.',
      origin: 'exe autokill 3000:dc18, autokill in dotu-tools/decomp/unf.c. RE notes 5.2 and FAQ [SPMC].',
      c: 'autokill',
      code: { file: 'src/lib/game/port/magic.ts', name: 'autokill' },
    },
    {
      id: 'drain-monster',
      title: 'Drain Monster',
      explanation:
        'Drain Monster takes your wisdom straight off the monster\'s level and takes hit points away with it, half the type\'s hit points per level for each level lost. A monster whose level is below your wisdom is emptied outright: level zero, no hit points left. That is a fine way to kill something and a terrible way to be paid for it, because the experience is worked out after the level has gone, so a drained monster is worth what a level zero monster is worth. The spell prints nothing at all, and a Shadow boss ignores it.',
      inputs: 'Your wisdom, the monster\'s level, and its type\'s hit points per level.',
      origin:
        'exe drain_monster 3000:df41, drain_monster in dotu-tools/decomp/unf.c. RE notes 5.2; the experience loss is in TIDBITS, "Bugs".',
      c: 'drain_monster',
      code: { file: 'src/lib/game/port/magic.ts', name: 'drainMonster' },
    },
    {
      id: 'damage-spells',
      title: 'What the damage spells do',
      explanation:
        'Half the attack spells scale with your character level and half are flat numbers that never change. Magic Zap does two per level plus two and Lightning four per level plus four, while Minor Shock always does 25, Magic Missile 50, Shock 125 and Major Shock 300. Magic Zot and Magic Bolt roll a small die once for each of your levels and once more, so they overtake the flat spells eventually, and the three explosions roll fixed ranges up to 500. Against a monster with several thousand hit points none of them is worth the spell points, which is why a power weapon is the usual answer.',
      inputs: 'Your character level.',
      origin: 'exe spell_effect 3000:e1b8, spell_effect in dotu-tools/decomp/unf.c. RE notes 5.2 and FAQ [SPMC].',
      c: 'spell_effect',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'damageSpells' },
    },
    {
      id: 'cures',
      title: 'What the cures heal',
      explanation:
        'Every cure is measured in wisdom. The little cure and the priest\'s fast cure heal exactly half your wisdom with no roll at all, whatever the help text suggests; Cure rolls from 20 up to twice your wisdom above that, capped at 60; the big cure starts at 50 and is capped at 150. The priest\'s fast big cure has no floor under it, so it can heal nothing at all. Wisdom is worth having for the cures long before it is worth having for anything else.',
      inputs: 'Your wisdom.',
      origin: 'exe spell_effect 3000:e1b8, spell_effect in dotu-tools/decomp/unf.c. RE notes 5.2 and FAQ [SPMC].',
      c: 'spell_effect',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'cureAmounts' },
    },
    {
      id: 'protection',
      title: 'What protection is worth',
      explanation:
        'The four protection spells take 2, 8, 18 and 32 off every attack roll a monster makes against you, which is the same currency as armor and worth roughly that many extra points of armor class. Ultra Protection at 32 is worth more than any suit in the game. The priest\'s own Protection is a bug: it sets the weakest level, the same as Minor Protection, so a priest jumps from 2 straight to Major Protection\'s 18 with nothing in between.',
      inputs: 'Which protection spell is running.',
      origin:
        'exe protection 3000:ddc9 and defend 2000:82b7, protection in dotu-tools/decomp/unf.c. RE notes 4.4 and 5.2; the priest bug is in TIDBITS, "Bugs".',
      c: 'protection',
      code: { file: 'src/lib/game/dotu-mech.js', name: 'PROTECTION_BONUS' },
    },
    {
      id: 'spell-cost',
      title: 'What casting costs',
      explanation:
        'Casting from memory costs spell points equal to the spell\'s level, one for a first level spell and ten for a tenth, and a permanent spell takes that many points off your maximum for the rest of the character\'s life. Scrolls, wands and papers spend a charge instead and no spell points at all. Casting also spends the dungeon clock: ten seconds for a battle spell, a hundred for a preparation spell, and a month for a permanent one, which is only castable in town and so costs no dungeon time at all. Every battle spell with a duration runs for 60 moves, except Sleep at 25 and Hold at 15, and casting it again adds another 60.',
      inputs: 'The spell\'s level and which of the four books it comes from.',
      origin: 'exe cast_a_spell 2000:e017, cast_a_spell in dotu-tools/decomp/unf.c. RE notes 5.1 and FAQ [SPMC].',
      c: 'cast_a_spell',
      code: null,
    },
  ],
};

const TIME: Topic = {
  id: 'time',
  title: 'Time and ageing',
  formulas: [
    {
      id: 'poison-disease',
      title: 'Poison and disease',
      explanation:
        'Being poisoned or diseased starts a counter at 450 moves. Every move takes one off it, and when it runs out you lose a point of strength to poison or a point of constitution to disease and the counter starts again at 450, forever, so an untreated affliction grinds a character down for as long as it is carried. Neither stat can be ground below one, being hit again while already afflicted changes nothing, and the only ways out are the temple, at 300 rubles for poison and 500 for disease, or the matching cure spell. The resist spells block a new infection outright for their 60 moves and merely pause the counter of one you already have.',
      inputs: 'How many moves you have made since the counter last ran out.',
      origin:
        'exe pass_moment 2000:a53c, pass_moment in dotu-tools/decomp/unf.c. TIDBITS, "Monsters", and FAQ [COMT]. Nothing in this app works the counter out; the save editor only shows it.',
      c: 'pass_moment',
      code: null,
    },
    {
      id: 'inn-night',
      title: 'What a night at the inn does to you',
      explanation:
        'A stay takes the room fee, pushes the clock forward by 28,800 seconds, eight hours, and then works through a fixed list: it ages you, refills your spell points from your magic crystals one for one, and finally hands you every level your experience has earned. Ageing is the interesting part. If you cannot pay one unit of culture stock for every level squared, whatever stock you have is taken anyway and you age by as many years as you were short, up to six; if you can pay, the stock goes and you do not age at all. Past the age of 60 that same shortfall also comes off your strength and your constitution, each floored at 2, and since nothing else in the game ages anyone, an old character is one who could not afford the groceries.',
      inputs: 'Your level, your culture stock, your magic crystals, your experience and your age.',
      origin:
        'exe flea_inn 2000:4fe7, flea_inn in dotu-tools/decomp/unf.c. RE notes 2.2. Nothing in this app works the stay out; only the room fee is used, by the economy calculator.',
      c: 'flea_inn',
      code: null,
    },
  ],
};

export const TOPICS: Topic[] = [MAP, TELEPORTERS, TOWN, WAYS_DOWN, MONSTERS, EXPERIENCE, LOOT, COMBAT, MAGIC, TIME];

/** The source text of the declaration an entry shows. */
export function formulaCode(formula: Formula): string | null {
  return formula.code ? portCode(formula.code.file, formula.code.name) : null;
}

/** Every entry, in the order the page lists them. */
export function allFormulas(): Formula[] {
  return TOPICS.flatMap((topic) => topic.formulas);
}

/** The topics holding an entry whose title matches, with the entries that do not left out. */
export function searchFormulas(query: string): Topic[] {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return TOPICS;
  return TOPICS.map((topic) => ({
    ...topic,
    formulas: topic.formulas.filter((formula) => formula.title.toLowerCase().includes(wanted)),
  })).filter((topic) => topic.formulas.length > 0);
}
