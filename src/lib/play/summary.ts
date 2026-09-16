import type { CastSource } from '../game/action';
import type { Find, JournalEvent, MonsterSeen, SpellAt } from '../game/journal-events';
import { grouped } from '../ui/format';
import { SHADOW_ROW } from '../../../server/boards';
import type { JournalEntry } from './journal';
import { monsterWords, spellMenuName } from './journal';

/**
 * What a run came to: everything that happened in it, totalled.
 *
 * It is folded from the run's journal and nothing else, so a run replayed from its log
 * summarises the same as the run itself — which is what lets the leaderboard and the
 * command-line verifier say what a run was without being handed anything but its keys.
 *
 * The words are {@link summarySections}, in one place, so the Play tab, the verifier and the run
 * server all say the same thing about the same run.
 */

/** How a run's fighting went against one kind of monster. */
export interface MonsterAccount {
  /** The name every battle message calls it. */
  name: string;
  /** How many of them the character traded a blow with: swung at, was hit by, or killed. */
  fights: number;
  /** How many of them the character came face to face with and left without a blow either way. */
  passed: number;
  /** Swings taken at them, and how many of those landed. */
  swings: number;
  hits: number;
  /** Hit points taken off them, and off the character by them. */
  damageDealt: number;
  damageTaken: number;
  /** Blows they landed on the character. */
  blows: number;
  kills: number;
}

/** Wands and scrolls the run's spells wrote, by the spell each was written for. */
export interface MadeCount {
  what: 'wand' | 'scroll';
  spell: string;
  count: number;
}

/** What the run spent: a wand's charges and a scroll or a sheet of paper by the spell it cast,
 *  and one of the magic items or potions by its own name. */
export interface UsedCount {
  what: 'charge' | 'scroll' | 'paper' | 'item';
  name: string;
  count: number;
}

/** A spell the run cast, however it was paid for. */
export interface CastCount {
  /** The name the game's own spell menu prints. */
  name: string;
  count: number;
  /** The casts by what paid for each, largest first. Moraff's Revenge spends nothing but the
   *  character's own spell points and has one row with no source. */
  sources: { source: CastSource | null; count: number }[];
}

/** Something the dungeon gave up, by the name the run's own lines give it. */
export interface DropCount {
  what: Exclude<Find['what'], 'money'>;
  name: string;
  count: number;
  /** The charges every wand of this spell came with, added up; zero for anything else. */
  charges: number;
}

/** Vitamin pills found, by the colour the game handed each one over as. */
export interface PillCount {
  colour: string;
  count: number;
}

/** Money handed over in one of the town's buildings, by building. */
export interface SpentCount {
  where: string;
  amount: number;
}

/** Trap doors the run dropped through, by the floor each one leads to. */
export interface TrapdoorCount {
  to: number;
  count: number;
}

/** Every way the character moved that was not a step. */
export interface RunTravel {
  steps: number;
  /** Moments spent standing still. */
  waits: number;
  /** Holes dug through a floor, and the digs a monster interrupted. */
  holes: number;
  digsInterrupted: number;
  laddersDown: number;
  laddersUp: number;
  trapdoors: TrapdoorCount[];
}

/** A death, and what was standing over the character; the monster is null for one a poison or a
 *  spell finished. */
export interface RunDeath {
  floor: number;
  dungeon: number;
  monster: MonsterSeen | null;
}

/** Everything a run came to. */
export interface RunSummary {
  actions: number;
  /** The game's own clock, in whatever that game counts. */
  time: number;
  travel: RunTravel;
  /** Experience the kills were worth, and experience a life drainer took back. */
  experience: number;
  experienceLost: number;
  levelsGained: number;
  levelsLost: number;
  /** The deepest floor the run stood on, and the furthest module or dungeon it reached. */
  deepestFloor: number;
  furthestDungeon: number;
  /** Shadow bosses killed, and the deepest floor one died on. */
  shadowsKilled: number;
  deepestShadowFloor: number;
  /** Hit points battle spells took off monsters, which the swings do not count. */
  spellDamage: number;
  /** Poisonings and diseases taken, and characteristics moved by a point either way. */
  poisonings: number;
  diseases: number;
  statsDrained: number;
  statsRaised: number;
  /** The money found in the dungeon, which in Dungeons of the Unforgiven is dollars rather than
   *  the rubles the town is paid in. */
  moneyFound: number;
  spent: SpentCount[];
  drops: DropCount[];
  casts: CastCount[];
  made: MadeCount[];
  used: UsedCount[];
  /** Empty in Dungeons of the Unforgiven, which has no vitamin pills. */
  pills: PillCount[];
  /** Breaths of fire and what they came to, which only Moraff's Revenge has. */
  breaths: number;
  breathDamage: number;
  /** Drinks from Moraff's Revenge's fountain of youth, each of which starts a generation. */
  fountains: number;
  monsters: MonsterAccount[];
  deaths: RunDeath[];
}

/** How far a run had got, which is the pair of numbers a journal does not carry. */
export interface RunClockTotals {
  actions: number;
  time: number;
}

/**
 * Everything that happened in a run, totalled.
 *
 * `run` is the run's own count of actions and its clock, which the sessions carry: an entry says
 * how far the count stood when it was written rather than what the run came to.
 */
export function summarizeJournal(
  entries: readonly JournalEntry[],
  run: RunClockTotals,
): RunSummary {
  const summary: RunSummary = {
    actions: run.actions,
    time: run.time,
    travel: { steps: 0, waits: 0, holes: 0, digsInterrupted: 0, laddersDown: 0, laddersUp: 0, trapdoors: [] },
    experience: 0,
    experienceLost: 0,
    levelsGained: 0,
    levelsLost: 0,
    deepestFloor: 0,
    furthestDungeon: 0,
    shadowsKilled: 0,
    deepestShadowFloor: 0,
    spellDamage: 0,
    poisonings: 0,
    diseases: 0,
    statsDrained: 0,
    statsRaised: 0,
    moneyFound: 0,
    spent: [],
    drops: [],
    casts: [],
    made: [],
    used: [],
    pills: [],
    breaths: 0,
    breathDamage: 0,
    fountains: 0,
    monsters: [],
    deaths: [],
  };
  const fight: Facing = { slot: -1, monster: null, traded: false };
  for (const entry of entries) {
    summary.deepestFloor = Math.max(summary.deepestFloor, entry.floor);
    summary.furthestDungeon = Math.max(summary.furthestDungeon, entry.module);
    if (entry.event !== null) fold(summary, entry.event, entry.floor, fight);
  }
  return summary;
}

/**
 * The monster the character was last seen facing.
 *
 * Walking away from one and back to it is the meeting they were already in; turning to another
 * and back is a meeting of its own. A meeting starts counted as passed and becomes a fight on the
 * first blow either way, so a meeting nothing came of needs no tidying up at the end of the run.
 */
interface Facing {
  slot: number;
  monster: MonsterAccount | null;
  traded: boolean;
}

/** A blow traded with the monster being faced turns that meeting into a fight. */
function traded(fight: Facing, monster: MonsterSeen): void {
  if (fight.traded || fight.monster === null || fight.monster.name !== monster.name) return;
  fight.traded = true;
  fight.monster.passed -= 1;
  fight.monster.fights += 1;
}

/**
 * One event added to the totals. `floor` is the floor the entry was written on, which the events
 * that move between floors do not carry, and `fight` carries the monster the character was last
 * facing.
 */
function fold(summary: RunSummary, event: JournalEvent, floor: number, fight: Facing): void {
  switch (event.kind) {
    case 'stepped':
      summary.travel.steps += 1;
      return;
    case 'waited':
      summary.travel.waits += 1;
      return;
    case 'dug':
      if (event.outcome === 'hole') summary.travel.holes += 1;
      if (event.outcome === 'interrupted') summary.travel.digsInterrupted += 1;
      return;
    case 'trapdoorTaken':
      trapdoor(summary, event.to).count += 1;
      return;
    case 'ladderTaken':
      if (event.to > floor) summary.travel.laddersDown += 1;
      else summary.travel.laddersUp += 1;
      return;
    case 'met': {
      if (fight.slot === event.slot) return;
      const monster = account(summary, event.monster);
      monster.passed += 1;
      fight.slot = event.slot;
      fight.monster = monster;
      fight.traded = false;
      return;
    }
    case 'swung': {
      const monster = account(summary, event.monster);
      monster.swings += 1;
      if (event.damage > 0) monster.hits += 1;
      monster.damageDealt += event.damage;
      traded(fight, event.monster);
      return;
    }
    case 'hit': {
      const monster = account(summary, event.monster);
      if (event.damage > 0) monster.blows += 1;
      monster.damageTaken += event.damage;
      traded(fight, event.monster);
      return;
    }
    case 'spellDamaged':
      summary.spellDamage += event.damage;
      account(summary, event.monster).damageDealt += event.damage;
      traded(fight, event.monster);
      return;
    case 'killed':
      account(summary, event.monster).kills += 1;
      summary.experience += event.experience;
      if (event.monster.type === SHADOW_ROW) {
        summary.shadowsKilled += 1;
        summary.deepestShadowFloor = Math.max(summary.deepestShadowFloor, floor);
      }
      traded(fight, event.monster);
      return;
    case 'afflicted':
      if (event.what === 'poison') summary.poisonings += 1;
      else summary.diseases += 1;
      traded(fight, event.monster);
      return;
    case 'statChanged':
      if (event.by < 0) summary.statsDrained += 1;
      else summary.statsRaised += 1;
      traded(fight, event.monster);
      return;
    case 'experienceDrained':
      summary.experienceLost += event.experience;
      return;
    case 'levelGained':
      summary.levelsGained += event.level - event.from;
      return;
    case 'levelLost':
      summary.levelsLost += event.levels;
      return;
    case 'found':
      if (event.find.what === 'money') summary.moneyFound += event.find.amount;
      else dropped(summary, event.find);
      return;
    case 'pillFound':
      pills(summary, event.colour).count += 1;
      return;
    case 'breathed':
      summary.breaths += 1;
      summary.breathDamage += event.damage;
      traded(fight, event.monster);
      return;
    case 'fountainDrunk':
      summary.fountains += 1;
      return;
    case 'coinsSpent': {
      const spent = summary.spent.find((row) => row.where === event.where);
      if (spent) spent.amount += event.amount;
      else summary.spent.push({ where: event.where, amount: event.amount });
      return;
    }
    case 'wandMade':
      made(summary, 'wand', event.spell).count += 1;
      return;
    case 'scrollWritten':
      made(summary, 'scroll', event.spell).count += 1;
      return;
    case 'cast': {
      const source = event.spell.game === 'revenge' ? null : event.spell.source;
      cast(summary, event.spell.name, source);
      // A spell cast out of the character's own head spends no item, so there is nothing more to
      // count; the other three spend a charge, the scroll or the sheet.
      if (source === null || source === 'spellPoints') return;
      const spent = source === 'wand' ? 'charge' : source;
      used(summary, spent, event.spell.name).count += 1;
      return;
    }
    case 'itemUsed':
      used(summary, 'item', event.item).count += 1;
      return;
    case 'died':
      summary.deaths.push({ floor: event.floor, dungeon: event.dungeon, monster: event.monster });
  }
}

/** The row for a kind of monster, made on the first sight of one. */
function account(summary: RunSummary, monster: MonsterSeen): MonsterAccount {
  const kept = summary.monsters.find((row) => row.name === monster.name);
  if (kept) return kept;
  const fresh: MonsterAccount = {
    name: monster.name,
    fights: 0,
    passed: 0,
    swings: 0,
    hits: 0,
    damageDealt: 0,
    damageTaken: 0,
    blows: 0,
    kills: 0,
  };
  summary.monsters.push(fresh);
  return fresh;
}

function trapdoor(summary: RunSummary, to: number): TrapdoorCount {
  const kept = summary.travel.trapdoors.find((row) => row.to === to);
  if (kept) return kept;
  const fresh: TrapdoorCount = { to, count: 0 };
  summary.travel.trapdoors.push(fresh);
  return fresh;
}

/** What a find is called in the Drops section, which for the magic is the spell it carries. */
function dropName(find: Dropped): string {
  switch (find.what) {
    case 'spellbook':
    case 'scroll':
    case 'paper':
    case 'wand':
      return spellMenuName(find.spell);
    case 'key':
      return String(find.key);
    default:
      return find.item;
  }
}

/** Everything a square can turn up except the money, which is counted with the spending. */
type Dropped = Exclude<Find, { what: 'money' }>;

function dropped(summary: RunSummary, find: Dropped): void {
  const name = dropName(find);
  let kept = summary.drops.find((row) => row.what === find.what && row.name === name);
  if (!kept) {
    kept = { what: find.what, name, count: 0, charges: 0 };
    summary.drops.push(kept);
  }
  kept.count += 1;
  if (find.what === 'wand') kept.charges += find.charges;
}

function cast(summary: RunSummary, name: string, source: CastSource | null): void {
  let kept = summary.casts.find((row) => row.name === name);
  if (!kept) {
    kept = { name, count: 0, sources: [] };
    summary.casts.push(kept);
  }
  kept.count += 1;
  const paid = kept.sources.find((row) => row.source === source);
  if (paid) paid.count += 1;
  else kept.sources.push({ source, count: 1 });
}

function made(summary: RunSummary, what: MadeCount['what'], spell: SpellAt): MadeCount {
  const name = spellMenuName(spell);
  const kept = summary.made.find((row) => row.what === what && row.spell === name);
  if (kept) return kept;
  const fresh: MadeCount = { what, spell: name, count: 0 };
  summary.made.push(fresh);
  return fresh;
}

function pills(summary: RunSummary, colour: string): PillCount {
  const kept = summary.pills.find((row) => row.colour === colour);
  if (kept) return kept;
  const fresh: PillCount = { colour, count: 0 };
  summary.pills.push(fresh);
  return fresh;
}

function used(summary: RunSummary, what: UsedCount['what'], name: string): UsedCount {
  const kept = summary.used.find((row) => row.what === what && row.name === name);
  if (kept) return kept;
  const fresh: UsedCount = { what, name, count: 0 };
  summary.used.push(fresh);
  return fresh;
}

/** What a game has to lend the summary's words: its own clock, its own name for a place, and
 *  its own name for money. */
export interface SummaryNames {
  /** "12 seconds" in Dungeons of the Unforgiven, "12 moves" in Moraff's World. */
  clockWords(time: number): string;
  /** The game's own name for one of its modules or dungeons. */
  dungeonName(dungeon: number): string;
  /** What the town is paid in: "300 rubles", "300 jewels", "300 jewel pieces". */
  moneyWords(amount: number): string;
  /** What the dungeon turns up, which in Dungeons of the Unforgiven is not the money the town is
   *  paid in. */
  foundMoneyWords(amount: number): string;
  /** A building named the way a player would know it, which for an inn means saying which
   *  module's inn it is: the five of them have five different names. */
  buildingWords(where: string): string;
}

/** A whole number with its thousands grouped. Experience is the game's own double, so it is
 *  rounded rather than printed with the fraction the arithmetic left on it. */
export function tally(value: number): string {
  return grouped(Math.round(value));
}

/** "1 step", "12,000 steps". */
export function count(many: number, one: string, several = `${one}s`): string {
  return `${tally(many)} ${many === 1 ? one : several}`;
}

/**
 * The clauses of a line that had something to say, joined: a total of nothing is left out
 * rather than printed as "and 0 up".
 */
function clauses(parts: readonly [number, string][]): string {
  return listWords(parts.filter(([many]) => many > 0).map(([, words]) => words));
}

/** A line built out of clauses, which are written lower case so they read in any order. */
function sentence(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "a LONG SWORD, a SHIELD and a RING" — a list as a sentence would say it. */
function listWords(items: readonly string[]): string {
  if (items.length < 3) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** One part of the summary: a heading and the lines under it. */
export interface SummarySection {
  heading: string;
  lines: string[];
}

/** What each of a cast's four sources is called where the count is read out. */
const CAST_PAID: Record<CastSource, string> = {
  spellPoints: 'out of your own head',
  wand: 'from wand charges',
  scroll: 'from scrolls',
  paper: 'from sheets of paper',
};

/** The headings the sections are drawn under. */
export const SUMMARY_HEADINGS = {
  run: 'The run',
  money: 'Money',
  drops: 'Drops',
  casts: 'Spells cast',
  made: 'Wands and scrolls made',
  used: 'Charges, scrolls and paper used',
  items: 'Potions and pills',
  travel: 'Getting around',
  monsters: 'Monsters',
};

/**
 * A run's summary in words, a section at a time. A section nothing happened in is left out
 * rather than shown empty.
 *
 * Every line of it is here, so that changing what a run's summary says is changing this one
 * function.
 */
export function summarySections(summary: RunSummary, names: SummaryNames): SummarySection[] {
  const sections: SummarySection[] = [
    { heading: SUMMARY_HEADINGS.run, lines: runLines(summary, names) },
    { heading: SUMMARY_HEADINGS.money, lines: moneyLines(summary, names) },
    { heading: SUMMARY_HEADINGS.drops, lines: byCount(summary.drops).map(dropWords) },
    { heading: SUMMARY_HEADINGS.casts, lines: byCount(summary.casts).map(castWords) },
    { heading: SUMMARY_HEADINGS.made, lines: byCount(summary.made).map(madeWords) },
    {
      heading: SUMMARY_HEADINGS.used,
      lines: byCount(summary.used.filter((row) => row.what !== 'item')).map(usedWords),
    },
    { heading: SUMMARY_HEADINGS.items, lines: itemLines(summary) },
    { heading: SUMMARY_HEADINGS.travel, lines: travelLines(summary.travel) },
    { heading: SUMMARY_HEADINGS.monsters, lines: monsterLines(summary.monsters) },
  ];
  return sections.filter((section) => section.lines.length > 0);
}

/** The rows of a section, most of first, and ties in the order they first happened. */
function byCount<Row extends { count: number }>(rows: readonly Row[]): Row[] {
  return [...rows].sort((one, other) => other.count - one.count);
}

function runLines(summary: RunSummary, names: SummaryNames): string[] {
  const lines = [
    `Spent ${count(summary.actions, 'action')} and ${names.clockWords(summary.time)}`,
    `Took ${count(summary.travel.steps, 'step')}`,
  ];
  const fights = total(summary.monsters, (monster) => monster.fights);
  const passed = total(summary.monsters, (monster) => monster.passed);
  if (fights > 0 || passed > 0) lines.push(fightingWords(summary, fights, passed));
  if (fights > 0) lines.push(blowWords(summary));
  if (summary.shadowsKilled > 0) {
    lines.push(
      `Killed ${count(summary.shadowsKilled, 'Shadow')}, the deepest on floor ${tally(summary.deepestShadowFloor)}`,
    );
  }
  if (summary.experience > 0) lines.push(`Gained ${tally(summary.experience)} experience`);
  if (summary.experienceLost > 0) {
    lines.push(`Lost ${tally(summary.experienceLost)} experience to drainers`);
  }
  if (summary.levelsGained > 0 || summary.levelsLost > 0) {
    lines.push(`Gained ${count(summary.levelsGained, 'level')}, lost ${tally(summary.levelsLost)}`);
  }
  const ailments = clauses([
    [summary.poisonings, `was poisoned ${count(summary.poisonings, 'time')}`],
    [summary.diseases, `caught ${count(summary.diseases, 'disease')}`],
  ]);
  if (ailments !== '') lines.push(sentence(ailments));
  const characteristics = clauses([
    [summary.statsDrained, `lost ${count(summary.statsDrained, 'point')} of the six characteristics`],
    [summary.statsRaised, `gained ${count(summary.statsRaised, 'point')}`],
  ]);
  if (characteristics !== '') lines.push(sentence(characteristics));
  if (summary.breaths > 0) {
    lines.push(`Breathed fire ${count(summary.breaths, 'time')} for ${tally(summary.breathDamage)}`);
  }
  if (summary.fountains > 0) {
    lines.push(`Drank from the fountain of youth ${count(summary.fountains, 'time')}`);
  }
  lines.push(`Reached floor ${tally(summary.deepestFloor)} of ${names.dungeonName(summary.furthestDungeon)}`);
  for (const death of summary.deaths) lines.push(deathWords(death, names));
  return lines;
}

function total<Row>(rows: readonly Row[], of: (row: Row) => number): number {
  return rows.reduce((sum, row) => sum + of(row), 0);
}

function fightingWords(summary: RunSummary, fights: number, passed: number): string {
  const kills = total(summary.monsters, (monster) => monster.kills);
  if (fights === 0) return `Met ${count(passed, 'monster')} without fighting`;
  const fought = `Fought ${count(fights, 'monster')} and killed ${tally(kills)}`;
  return passed === 0 ? fought : `${fought}, and met ${tally(passed)} more without fighting`;
}

function blowWords(summary: RunSummary): string {
  const swings = total(summary.monsters, (monster) => monster.swings);
  const hits = total(summary.monsters, (monster) => monster.hits);
  const dealt = total(summary.monsters, (monster) => monster.damageDealt);
  const taken = total(summary.monsters, (monster) => monster.damageTaken);
  const spells = summary.spellDamage > 0 ? `, ${tally(summary.spellDamage)} of it from spells` : '';
  return (
    `Swung ${count(swings, 'time')} and landed ${tally(hits)}, for ${tally(dealt)}${spells}; ` +
    `took ${tally(taken)} from them`
  );
}

function deathWords(death: RunDeath, names: SummaryNames): string {
  const where = death.floor === 0 ? 'in the town' : `on floor ${tally(death.floor)}`;
  const place = `Died ${where} of ${names.dungeonName(death.dungeon)}`;
  return death.monster === null ? place : `${place}, killed by ${monsterWords(death.monster)}`;
}

function moneyLines(summary: RunSummary, names: SummaryNames): string[] {
  const lines: string[] = [];
  if (summary.moneyFound > 0) lines.push(`Found ${names.foundMoneyWords(summary.moneyFound)}`);
  const spending = [...summary.spent].sort((one, other) => other.amount - one.amount);
  for (const spent of spending) {
    lines.push(`Spent ${names.moneyWords(spent.amount)} at the ${names.buildingWords(spent.where)}`);
  }
  return lines;
}

function dropWords(drop: DropCount): string {
  switch (drop.what) {
    case 'spellbook':
      return `Found ${count(drop.count, 'spellbook')} of ${drop.name}`;
    case 'wand':
      return `Found ${count(drop.count, 'wand')} of ${drop.name} with ${count(drop.charges, 'charge')}`;
    case 'scroll':
      return `Found ${count(drop.count, 'scroll')} of ${drop.name}`;
    case 'paper':
      return `Found ${count(drop.count, 'sheet')} of paper for ${drop.name}`;
    case 'armour':
      return `Found ${tally(drop.count)} ${drop.name} armour`;
    case 'key':
      return `Found ${count(drop.count, 'trap door key')} to floor ${drop.name}`;
    default:
      return `Found ${tally(drop.count)} ${drop.name}`;
  }
}

function castWords(cast: CastCount): string {
  const cast_ = `Cast ${cast.name} ${count(cast.count, 'time')}`;
  const paid = byCount(cast.sources).flatMap((row) =>
    row.source === null ? [] : [{ words: CAST_PAID[row.source], count: row.count }],
  );
  if (paid.length === 0) return cast_;
  if (paid.length === 1) return `${cast_}, ${cast.count === 1 ? '' : 'all '}${paid[0].words}`;
  return `${cast_}: ${listWords(paid.map((row) => `${tally(row.count)} ${row.words}`))}`;
}

function madeWords(made: MadeCount): string {
  return made.what === 'wand'
    ? `Made ${count(made.count, 'wand')} of ${made.spell}`
    : `Wrote ${count(made.count, 'scroll')} of ${made.spell}`;
}

function usedWords(used: UsedCount): string {
  if (used.what === 'charge') return `Used ${count(used.count, 'charge')} of ${used.name}`;
  if (used.what === 'scroll') return `Read ${count(used.count, 'scroll')} of ${used.name}`;
  if (used.what === 'paper') return `Used ${count(used.count, 'sheet')} of paper for ${used.name}`;
  return `Used the ${used.name} ${count(used.count, 'time')}`;
}

function itemLines(summary: RunSummary): string[] {
  const lines = byCount(summary.used.filter((row) => row.what === 'item')).map(usedWords);
  for (const pill of byCount(summary.pills)) {
    lines.push(`Found ${count(pill.count, `${pill.colour.toLowerCase()} pill`)}`);
  }
  return lines;
}

function travelLines(travel: RunTravel): string[] {
  const lines: string[] = [];
  if (travel.waits > 0) lines.push(`Stood still ${count(travel.waits, 'time')}`);
  const digging = clauses([
    [travel.holes, `dug ${count(travel.holes, 'hole')}`],
    [travel.digsInterrupted, `had ${count(travel.digsInterrupted, 'dig')} interrupted`],
  ]);
  if (digging !== '') lines.push(sentence(digging));
  const ladders = clauses([
    [travel.laddersDown, `climbed ${count(travel.laddersDown, 'ladder')} down`],
    [travel.laddersUp, `climbed ${count(travel.laddersUp, 'ladder')} up`],
  ]);
  if (ladders !== '') lines.push(sentence(ladders));
  const doors = byCount(travel.trapdoors);
  if (doors.length > 0) {
    const through = total(doors, (door) => door.count);
    const each = doors.map((door) => `${tally(door.count)} to floor ${tally(door.to)}`);
    lines.push(`Dropped through ${count(through, 'trap door')}: ${listWords(each)}`);
  }
  return lines;
}

function monsterLines(monsters: readonly MonsterAccount[]): string[] {
  const lines = byCount(monsters.filter((monster) => monster.fights > 0).map(withCount)).map(monsterFought);
  const passed = byCount(monsters.filter((monster) => monster.passed > 0).map(withPassed));
  if (passed.length > 0) {
    const each = passed.map((monster) => `${tally(monster.passed)} ${monster.name}`);
    lines.push(`Passed ${listWords(each)} without fighting`);
  }
  return lines;
}

function withCount(monster: MonsterAccount): MonsterAccount & { count: number } {
  return { ...monster, count: monster.fights };
}

function withPassed(monster: MonsterAccount): MonsterAccount & { count: number } {
  return { ...monster, count: monster.passed };
}

function monsterFought(monster: MonsterAccount): string {
  const swung =
    monster.swings === 0
      ? 'never swung'
      : `swung ${count(monster.swings, 'time')} and landed ${tally(monster.hits)}`;
  return (
    `Fought ${tally(monster.fights)} ${monster.name}: ${swung}, dealt ${tally(monster.damageDealt)}, ` +
    `took ${tally(monster.damageTaken)} from them, killed ${tally(monster.kills)}`
  );
}
